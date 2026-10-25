// tracker.js — one pass of the shipment tracker. Pure logic with injected
// dependencies (db, carrier, email), so it can be tested without Firebase.
//
// Orders flow:  pending/confirmed/processing
//     → "label-created"  (admin saves a tracking number on Admin → Orders)
//     → "shipped"        (here: UPS's first scan; buyer emailed, affiliate credited)
//     → "delivered"      (here: UPS reports delivery; no email)

const path = require('path');
const OrderEmails = require(path.join(__dirname, '../../js/order-emails.js'));
const Credits = require(path.join(__dirname, '../../js/credits.js'));
const { summarize, isUpsNumber } = require('./ups');

const DELIVERY_WATCH_DAYS = 21; // stop checking for delivery after this long

function nowIso() { return new Date().toISOString(); }

async function sendShippedEmail({ email, order }) {
  const params = OrderEmails.shippedParams(order, order.trackingNumber);
  await email.send(OrderEmails.CONFIG.shippedTemplateId, params);
}

// Same rule as admin-orders.html creditAffiliate(): 10% of subtotal after
// discounts to the promo code's affiliate, once, never for self-referrals.
// The credit, its history entry, and the order bookkeeping are written in one
// transaction, so a crash can't credit twice.
async function creditAffiliate({ db, orderRef, log }) {
  return db.runTransaction(async (t) => {
    const snap = await t.get(orderRef);
    const order = snap.data();
    if (!order || (order.affiliateCreditedAt && !order.affiliateReversedAt) || order.affiliateSkipped) return;
    const code = String(order.affiliateCode || order.promoCode || '').trim().toUpperCase();
    if (!code) return;
    const promoSnap = await t.get(db.collection('promoCodes').doc(code));
    const promo = promoSnap.exists ? promoSnap.data() : null;
    const affiliate = promo && promo.affiliateEmail ? String(promo.affiliateEmail).toLowerCase() : '';
    if (!affiliate) return;
    if (affiliate === String(order.userEmail || '').toLowerCase()) {
      t.update(orderRef, { affiliateSkipped: 'no credit, the affiliate placed this order themselves.' });
      return;
    }
    const cents = Credits.commissionCents(order);
    if (cents <= 0) return;
    const creditRef = db.collection('credits').doc(affiliate);
    const creditSnap = await t.get(creditRef);
    const c = creditSnap.exists ? creditSnap.data() : {};
    const at = nowIso();
    t.set(creditRef, {
      balanceCents: (c.balanceCents || 0) + cents,
      earnedCents: (c.earnedCents || 0) + cents,
      spentCents: c.spentCents || 0,
      updatedAt: at
    });
    t.set(creditRef.collection('entries').doc(), {
      type: 'earned', orderId: orderRef.id, orderNumber: order.orderNumber || '', code, note: 'Auto: UPS first scan',
      amountCents: cents, createdAt: at
    });
    t.update(orderRef, { affiliateEmail: affiliate, affiliateCreditCents: cents, affiliateCreditedAt: at, affiliateReversedAt: null });
    log('  credited ' + affiliate + ' ' + Credits.formatCents(cents));
  });
}

// Moves a label-created order to shipped if UPS has scanned it.
async function checkLabelCreated({ db, carrier, email, doc, log }) {
  const order = doc.data();
  const num = order.trackingNumber;
  if (!num) return 'no-tracking';
  if (!isUpsNumber(num)) {
    await doc.ref.update({ trackingCheckedAt: nowIso(), trackingStatusText: 'Not a UPS tracking number, so it isn’t checked automatically. Mark it shipped by hand.' });
    return 'not-ups';
  }
  const s = summarize(await carrier.track(num));
  if (s.state === 'label' || s.state === 'unknown') {
    await doc.ref.update({ trackingCheckedAt: nowIso(), trackingStatusText: s.description });
    return 'waiting';
  }
  // Claim the order inside a transaction so two runs can't both email.
  const claimed = await db.runTransaction(async (t) => {
    const fresh = await t.get(doc.ref);
    if (!fresh.exists || fresh.data().status !== 'label-created') return false;
    const fields = {
      status: s.state === 'delivered' ? 'delivered' : 'shipped',
      shippedAt: s.at || nowIso(),
      autoShippedAt: nowIso(),
      trackingCheckedAt: nowIso(),
      trackingStatusText: s.description,
      shippedEmailPending: true
    };
    if (s.deliveredAt) fields.deliveredAt = s.deliveredAt;
    t.update(doc.ref, fields);
    return true;
  });
  if (!claimed) return 'skipped';
  log('#' + (order.orderNumber || doc.id) + ' first UPS scan ' + (s.at || '') + ' → ' + (s.state === 'delivered' ? 'delivered' : 'shipped'));
  await emailAndCredit({ db, email, ref: doc.ref, log });
  return s.state === 'delivered' ? 'delivered' : 'shipped';
}

async function emailAndCredit({ db, email, ref, log }) {
  const order = (await ref.get()).data();
  try {
    if (!order.shippedEmailSentAt) {
      await sendShippedEmail({ email, order });
      await ref.update({
        shippedEmailSentAt: nowIso(), emailedTrackingNumber: order.trackingNumber || '',
        shippedEmailPending: false, shippedEmailError: null
      });
      log('  shipped email sent to ' + order.userEmail);
    } else {
      await ref.update({ shippedEmailPending: false });
    }
  } catch (err) {
    await ref.update({ shippedEmailError: String(err && err.message || err).slice(0, 300) });
    log('  shipped email FAILED (will retry next run): ' + (err && err.message || err));
  }
  try {
    await creditAffiliate({ db, orderRef: ref, log });
  } catch (err) {
    log('  affiliate credit FAILED: ' + (err && err.message || err));
  }
}

// Marks auto-shipped orders delivered when UPS says so (no email).
async function checkDelivered({ carrier, doc }) {
  const order = doc.data();
  if (!isUpsNumber(order.trackingNumber) || order.deliveredAt) return 'skip';
  const since = Date.parse(order.shippedAt || order.autoShippedAt || order.shippedEmailSentAt || 0);
  if (!since || Date.now() - since > DELIVERY_WATCH_DAYS * 864e5) return 'skip';
  const s = summarize(await carrier.track(order.trackingNumber));
  const fields = { trackingCheckedAt: nowIso(), trackingStatusText: s.description };
  if (s.state === 'delivered') Object.assign(fields, { status: 'delivered', deliveredAt: s.deliveredAt || nowIso() });
  await doc.ref.update(fields);
  return s.state === 'delivered' ? 'delivered' : 'in-transit';
}

async function run({ db, carrier, email, log = console.log }) {
  const tally = {};
  const count = (k) => { tally[k] = (tally[k] || 0) + 1; };

  const handled = new Set();
  const labelled = await db.collection('orders').where('status', '==', 'label-created').get();
  for (const doc of labelled.docs) {
    handled.add(doc.id);
    try { count(await checkLabelCreated({ db, carrier, email, doc, log })); }
    catch (err) { count('error'); log('#' + (doc.data().orderNumber || doc.id) + ' error: ' + err.message); }
  }

  // Retry shipped emails that failed on an earlier run.
  const pending = await db.collection('orders').where('shippedEmailPending', '==', true).get();
  for (const doc of pending.docs) {
    if (handled.has(doc.id) || doc.data().status === 'cancelled') continue;
    count('email-retry');
    await emailAndCredit({ db, email, ref: doc.ref, log });
  }

  const shipped = await db.collection('orders').where('status', '==', 'shipped').get();
  for (const doc of shipped.docs) {
    if (handled.has(doc.id)) continue;
    if (!doc.data().autoShippedAt && !doc.data().trackingNumber) continue;
    try { count(await checkDelivered({ carrier, doc })); }
    catch (err) { count('error'); log('#' + (doc.data().orderNumber || doc.id) + ' delivery check error: ' + err.message); }
  }

  log('Done: ' + (Object.keys(tally).length ? JSON.stringify(tally) : 'nothing to check'));
  return tally;
}

module.exports = { run, DELIVERY_WATCH_DAYS };
