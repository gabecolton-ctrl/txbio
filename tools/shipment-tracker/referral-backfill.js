// referral-backfill.js — one time: saves referrals (referredCustomers) for
// customers whose orders were credited to an affiliate before saved referrals
// existed, using their earliest credited order. Marks settings/referralBackfill
// when done so later runs skip it.
const path = require('path');
const Attribution = require(path.join(__dirname, '../../js/referral-attribution.js'));

async function backfillReferrals({ db, log = console.log }) {
  const flag = db.collection('settings').doc('referralBackfill');
  if ((await flag.get()).exists) return 'done-before';
  const orders = await db.collection('orders').get();
  const first = {};
  orders.docs.forEach((d) => {
    const o = d.data();
    const customer = String(o.userEmail || '').trim().toLowerCase();
    const aff = String(o.affiliateEmail || '').trim().toLowerCase();
    if (!customer || !aff || !o.affiliateCreditedAt || o.affiliateReversedAt || o.atCostCode || customer === aff) return;
    const at = o.createdAt || o.affiliateCreditedAt;
    if (!first[customer] || at < first[customer].at) first[customer] = { at, aff, code: o.affiliateCode || o.promoCode || '', id: d.id, num: o.orderNumber || '' };
  });
  let made = 0;
  for (const customer of Object.keys(first)) {
    const ref = db.collection('referredCustomers').doc(customer);
    if ((await ref.get()).exists) continue;
    const f = first[customer];
    await ref.set({ customerEmail: customer, affiliateEmail: f.aff, code: String(f.code).toUpperCase(), firstOrderId: f.id, firstOrderNumber: f.num,
      firstOrderAt: f.at, expiresAt: Attribution.addMonths(f.at, Attribution.WINDOW_MONTHS), createdAt: new Date().toISOString(), backfilled: true });
    made++;
  }
  await flag.set({ doneAt: new Date().toISOString(), saved: made });
  log('Saved referrals backfilled: ' + made);
  return made;
}

module.exports = { backfillReferrals };
