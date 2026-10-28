// automation.js — one pass of the order automation. Pure logic with injected
// dependencies (db, mailbox, mailer), so it can be tested without Firebase,
// a real inbox, or sending email.
//
//  1. Payment emails → confirm orders. A Venmo / Cash App "paid you" email
//     that passes DKIM/DMARC, names a pending order (TXB-…) paid with that
//     app, and is for exactly the order total confirms it and emails the
//     customer. Anything else is saved for the admin (To-do page).
//  2. Unpaid orders → one reminder after REMIND_AFTER_DAYS, cancelled after
//     CANCEL_AFTER_DAYS (stock and store credit returned, customer emailed).

const crypto = require('crypto');
const cfg = require('./config');
const { parsePayment, verify } = require('./parse');
const Msg = require('./messages');

const PAY_METHODS = ['venmo', 'cashapp', 'bank', 'bitcoin'];
const nowIso = () => new Date().toISOString();
const days = (iso) => (Date.now() - Date.parse(iso || 0)) / 864e5;
const keyFor = (p) => crypto.createHash('sha1').update(p.messageId || (p.subject + p.date)).digest('hex').slice(0, 24);

async function findOrder(db, orderNumber) {
  const snap = await db.collection('orders').where('orderNumber', '==', orderNumber).get();
  return snap.docs[0] || null;
}

// ---------- 1. payments ----------
async function handlePayment({ db, mailer, mail, log, dryRun }) {
  const p = parsePayment(mail);
  if (!p) return 'not-payment';
  const key = keyFor(p);
  const seenRef = db.collection('paymentEmails').doc(key);
  if ((await seenRef.get()).exists) return 'seen';

  const record = { app: p.app, amount: p.amount, payer: p.payer, orderNumber: p.orderNumber, subject: p.subject.slice(0, 200), receivedAt: p.date, checkedAt: nowIso() };
  const save = async (status, reason, extra) => {
    if (!dryRun) await seenRef.set(Object.assign(record, { status, reason: reason || '' }, extra || {}));
    log('  ' + p.app + ' $' + p.amount + ' from ' + (p.payer || '?') + ' [' + (p.orderNumber || 'no order #') + ']: ' + status + (reason ? ' (' + reason + ')' : ''));
    return status === 'confirmed' ? 'payment-confirmed' : 'payment-' + status;
  };

  const trust = verify(p.app, p.fromAddress, mail.headerLines);
  if (!trust.ok) return save('untrusted', trust.why);
  if (!p.orderNumber) return save('unmatched', 'no order number in the payment note');
  const doc = await findOrder(db, p.orderNumber);
  if (!doc) return save('unmatched', 'no order ' + p.orderNumber);
  const o = doc.data();
  if (o.paymentMethod !== p.app) return save('unmatched', 'order was placed for ' + (o.paymentMethod || 'another method'));
  if ((o.status || 'pending') !== 'pending') return save('ignored', 'order is already ' + o.status, { orderId: doc.id });
  if (Math.abs(Number(o.total) - p.amount) > 0.01) return save('unmatched', 'paid $' + p.amount.toFixed(2) + ', order total is $' + Number(o.total).toFixed(2), { orderId: doc.id });
  if (dryRun) return save('confirmed', 'dry run, nothing changed');

  const claimed = await db.runTransaction(async (t) => {
    const fresh = await t.get(doc.ref);
    if (!fresh.exists || (fresh.data().status || 'pending') !== 'pending') return false;
    t.update(doc.ref, {
      status: 'confirmed', paymentConfirmedAt: nowIso(),
      paymentConfirmedBy: 'auto (' + (p.app === 'venmo' ? 'Venmo' : 'Cash App') + ' email)',
      paymentEmailKey: key, paymentPayer: p.payer || ''
    });
    t.set(seenRef, Object.assign(record, { status: 'confirmed', reason: '', orderId: doc.id }));
    return true;
  });
  if (!claimed) return save('ignored', 'order changed meanwhile', { orderId: doc.id });
  log('  ' + p.orderNumber + ' confirmed from ' + p.app + ' payment');
  try {
    await mailer.send(o.userEmail, Msg.paymentReceived(o, p.app));
    await doc.ref.update({ paymentReceivedEmailAt: nowIso() });
  } catch (err) { log('  payment-received email FAILED: ' + err.message); }
  return 'payment-confirmed';
}

// ---------- 2. unpaid orders ----------
function stockReturnPlan(order) { // same as admin-orders.html
  return (order.items || []).filter((i) => typeof i.fulfilled === 'number' && i.fulfilled > 0)
    .map((i) => ({ slug: i.caseOf ? (i.unitSlug || String(i.slug).replace(/-case$/, '')) : i.slug, units: i.fulfilled }));
}

async function cancelUnpaid({ db, doc }) {
  return db.runTransaction(async (t) => {
    const fresh = await t.get(doc.ref);
    const o = fresh.data();
    if (!o || (o.status || 'pending') !== 'pending') return null;
    const plan = stockReturnPlan(o);
    const stockRefs = plan.map((l) => db.collection('inventory').doc(l.slug));
    const stockSnaps = await Promise.all(stockRefs.map((r) => t.get(r)));
    const creditCents = o.creditUsedCents > 0 && !o.creditRefundedAt && o.userEmail ? o.creditUsedCents : 0;
    const creditRef = creditCents ? db.collection('credits').doc(String(o.userEmail).toLowerCase()) : null;
    const creditSnap = creditRef ? await t.get(creditRef) : null;
    const at = nowIso();
    plan.forEach((l, k) => {
      const d = stockSnaps[k].exists ? stockSnaps[k].data() : null;
      if (d && typeof d.qty === 'number') t.update(stockRefs[k], { qty: d.qty + l.units, updatedAt: at });
    });
    const fields = {
      status: 'cancelled', cancelledBy: 'system', cancelledAt: at,
      cancelReason: 'Not paid within ' + cfg.CANCEL_AFTER_DAYS + ' days (cancelled automatically)',
      restockedAt: at, cancelFollowUpAt: at
    };
    if (creditRef) {
      const c = creditSnap.exists ? creditSnap.data() : {};
      t.set(creditRef, {
        balanceCents: (c.balanceCents || 0) + creditCents, earnedCents: c.earnedCents || 0,
        spentCents: (c.spentCents || 0) - creditCents, updatedAt: at
      });
      t.set(creditRef.collection('entries').doc(), { type: 'refunded', orderId: doc.id, orderNumber: o.orderNumber || '', code: '', note: 'Auto: unpaid order cancelled', amountCents: creditCents, createdAt: at });
      fields.creditRefundedAt = at;
    }
    t.update(doc.ref, fields);
    return o;
  });
}

async function handleUnpaid({ db, mailer, doc, log, dryRun }) {
  const o = doc.data();
  if (PAY_METHODS.indexOf(o.paymentMethod) === -1) return 'unpaid-skip';
  const age = days(o.createdAt);
  const label = '#' + (o.orderNumber || doc.id);
  const canCancel = !o.atCostCode || cfg.CANCEL_FAMILY_ORDERS;
  if (age >= cfg.CANCEL_AFTER_DAYS && canCancel && o.paymentReminderSentAt) {
    if (dryRun) { log(label + ' would be cancelled (unpaid ' + Math.floor(age) + ' days)'); return 'unpaid-cancel'; }
    const cancelledOrder = await cancelUnpaid({ db, doc });
    if (!cancelledOrder) return 'unpaid-skip';
    log(label + ' cancelled: unpaid ' + Math.floor(age) + ' days');
    try { await mailer.send(o.userEmail, Msg.cancelled(cancelledOrder, cfg.CANCEL_AFTER_DAYS)); await doc.ref.update({ cancellationEmailSentAt: nowIso() }); }
    catch (err) { log('  cancellation email FAILED: ' + err.message); }
    return 'unpaid-cancelled';
  }
  if (age >= cfg.REMIND_AFTER_DAYS && !o.paymentReminderSentAt) {
    if (dryRun) { log(label + ' would get a payment reminder'); return 'unpaid-remind'; }
    try {
      await mailer.send(o.userEmail, Msg.reminder(o, cfg.CANCEL_AFTER_DAYS));
      await doc.ref.update({ paymentReminderSentAt: nowIso() });
      log(label + ' payment reminder sent');
      return 'unpaid-reminded';
    } catch (err) { log(label + ' reminder email FAILED: ' + err.message); return 'error'; }
  }
  return 'unpaid-waiting';
}

async function run({ db, mailbox, mailer, log = console.log, dryRun = false }) {
  const tally = {};
  const count = (k) => { tally[k] = (tally[k] || 0) + 1; };
  if (dryRun) log('DRY RUN: nothing will be changed or sent.');

  if (mailbox) {
    const since = new Date(Date.now() - cfg.LOOKBACK_DAYS * 864e5);
    const mails = await mailbox.recent(since);
    log('Payment emails to look at: ' + mails.length);
    for (const mail of mails) {
      try { count(await handlePayment({ db, mailer, mail, log, dryRun })); }
      catch (err) { count('error'); log('Payment email error: ' + err.message); }
    }
  } else {
    log('Payment emails: not set up (no mailbox), skipped.');
  }

  // Run after payments, so an order paid this minute isn't reminded.
  const pending = await db.collection('orders').where('status', '==', 'pending').get();
  for (const doc of pending.docs) {
    try { count(await handleUnpaid({ db, mailer, doc, log, dryRun })); }
    catch (err) { count('error'); log('#' + (doc.data().orderNumber || doc.id) + ' error: ' + err.message); }
  }
  log('Done: ' + JSON.stringify(tally));
  return tally;
}

module.exports = { run, handlePayment, handleUnpaid, stockReturnPlan };
