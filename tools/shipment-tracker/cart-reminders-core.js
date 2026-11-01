// cart-reminders-core.js — finds carts left alone and emails a reminder.
// Run hourly by .github/workflows/cart-reminders.yml (cart-reminders.js).
//
// A signed-in customer whose cart has items and hasn't changed for 24 hours
// (but less than 7 days) gets one email, at most once a week, unless they
// turned reminders off on their Account page (users/{uid}.cartReminders === false).
// The email gives the item count, not product names (names trip spam filters).
// users/{uid}.cartReminderAt records when the last one went out.
const path = require('path');
const OrderEmails = require(path.join(__dirname, '../../js/order-emails.js'));

const HOUR = 36e5;
const IDLE_HOURS = 24;          // cart unchanged this long
const MAX_AGE_DAYS = 7;         // older carts are left alone
const GAP_DAYS = 7;             // at most one reminder a week per customer
const SITE = 'https://txbioresearch.com';

function plan(cart, user, now) {
  const items = (cart.items || []).filter((i) => Number(i.qty) > 0);
  if (!items.length) return { skip: 'empty' };
  if (!user || !user.email) return { skip: 'no email' };
  if (user.cartReminders === false) return { skip: 'opted out' };
  const changed = Date.parse(cart.updatedAt || '');
  if (!changed) return { skip: 'no date' };
  const idle = (now - changed) / HOUR;
  if (idle < IDLE_HOURS) return { skip: 'recent' };
  if (idle > MAX_AGE_DAYS * 24) return { skip: 'old' };
  const last = Date.parse(user.cartReminderAt || '');
  if (last && (now - last) < GAP_DAYS * 24 * HOUR) return { skip: 'reminded this week' };
  if (last && last >= changed) return { skip: 'already reminded for this cart' };
  const units = items.reduce((n, i) => n + Number(i.qty) * (i.caseOf ? Number(i.caseOf) : 1), 0);
  const value = Math.round(items.reduce((n, i) => n + Number(i.price) * Number(i.qty), 0) * 100) / 100;
  return { send: true, items, units, value };
}

function params(user, p) {
  const name = String(user.name || String(user.displayName || '').split(' — ')[0] || '').trim();
  const lines = p.items.length;
  return {
    to_email: String(user.email).toLowerCase(),
    to_name: name ? name.split(' ')[0] : 'there',
    items: lines + (lines === 1 ? ' item' : ' items') + (p.units !== lines ? ' (' + p.units + ' units)' : ''),
    cart_total: '$' + p.value.toFixed(2),
    cart_url: SITE + '/cart.html',
    unsubscribe_url: SITE + '/account.html#email-prefs'
  };
}

async function run({ db, email, now = Date.now(), log = console.log }) {
  const templateId = OrderEmails.CONFIG.cartReminderTemplateId;
  if (!templateId) { log('Cart reminders: no "Cart reminder" template ID in js/order-emails.js yet. Nothing sent.'); return { sent: 0 }; }
  const [carts, users] = await Promise.all([db.collection('carts').get(), db.collection('users').get()]);
  const byUid = {};
  users.docs.forEach((d) => { byUid[d.id] = d.data(); });
  const tally = { sent: 0, skipped: {}, failed: 0 };
  for (const c of carts.docs) {
    const user = byUid[c.id];
    const p = plan(c.data(), user, now);
    if (!p.send) { tally.skipped[p.skip] = (tally.skipped[p.skip] || 0) + 1; continue; }
    try {
      await email.send(templateId, params(user, p));
      await db.collection('users').doc(c.id).update({ cartReminderAt: new Date(now).toISOString() });
      tally.sent++;
      log('Reminded ' + user.email + ' (' + p.items.length + ' items, $' + p.value.toFixed(2) + ')');
    } catch (err) {
      tally.failed++;
      log('Could not remind ' + user.email + ': ' + err.message);
    }
  }
  log('Cart reminders: ' + tally.sent + ' sent, ' + tally.failed + ' failed, skipped ' + JSON.stringify(tally.skipped));
  return tally;
}

module.exports = { run, plan, params, IDLE_HOURS, GAP_DAYS };
