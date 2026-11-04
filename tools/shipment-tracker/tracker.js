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
const AffiliateTiers = require(path.join(__dirname, '../../js/affiliate-tiers.js'));
const Incoming = require(path.join(__dirname, '../../js/incoming.js'));
const Loyalty = require(path.join(__dirname, '../../js/loyalty.js'));
const Lots = require(path.join(__dirname, '../../js/lots.js'));
const { summarize, isUpsNumber } = require('./ups');

// The carrier is UPS's API (ups.js) or 17TRACK (track17.js). A carrier may
// provide canTrack(num) and status(num); otherwise it's the UPS client.
function canTrack(carrier, num) { return carrier.canTrack ? carrier.canTrack(num) : isUpsNumber(num); }
async function statusOf(carrier, num) { return carrier.status ? carrier.status(num) : summarize(await carrier.track(num)); }
function carrierName(carrier) { return carrier.name || 'UPS'; }
// What Admin → Orders shows as the latest tracking update.
function trackFields(s) {
  const f = { trackingCheckedAt: nowIso(), trackingStatusText: s.description || '' };
  if (s.stage) f.trackingStage = s.stage;
  if (s.lastEventAt) f.trackingLastEventAt = s.lastEventAt;
  f.trackingLocation = s.location || '';
  if (s.eta) { f.expectedDelivery = s.eta; f.expectedDeliveryTo = s.etaTo && s.etaTo !== s.eta ? s.etaTo : ''; }
  return f;
}

const DELIVERY_WATCH_DAYS = 21; // stop checking for delivery after this long
const INCOMING_WATCH_DAYS = 60; // supplier shipments: stop checking after this long

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
    if (!order || order.atCostCode || (order.affiliateCreditedAt && !order.affiliateReversedAt) || order.affiliateSkipped) return;
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
    // Rate by the affiliate's tier (js/affiliate-tiers.js), from their history so far.
    const creditRef = db.collection('credits').doc(affiliate);
    const history = await creditRef.collection('entries').get();
    const tierPick = AffiliateTiers.commissionFor(order, history.docs.map((d) => d.data()));
    const cents = tierPick.cents;
    if (cents <= 0) return;
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
      type: 'earned', orderId: orderRef.id, orderNumber: order.orderNumber || '', code, note: 'Auto: UPS first scan · ' + tierPick.tier.name + ' ' + Math.round(tierPick.rate * 100) + '%',
      amountCents: cents, saleCents: tierPick.saleCents, rate: tierPick.rate, createdAt: at
    });
    t.update(orderRef, { affiliateEmail: affiliate, affiliateCreditCents: cents, affiliateRate: tierPick.rate, affiliateTier: tierPick.tier.name, affiliateSaleCents: tierPick.saleCents, affiliateCreditedAt: at, affiliateReversedAt: null });
    log('  credited ' + affiliate + ' ' + Credits.formatCents(cents));
  });
}

// Moves a label-created order to shipped if UPS has scanned it.
async function checkLabelCreated({ db, carrier, email, doc, log }) {
  const order = doc.data();
  const num = order.trackingNumber;
  if (!num) return 'no-tracking';
  if (!canTrack(carrier, num)) {
    await doc.ref.update({ trackingCheckedAt: nowIso(), trackingStatusText: carrier.canTrack ? 'That doesn’t look like a tracking number, so it isn’t checked automatically. Mark it shipped by hand.' : 'Not a UPS tracking number, so it isn’t checked automatically. Mark it shipped by hand.' });
    return 'not-ups';
  }
  const s = await statusOf(carrier, num);
  if (s.state === 'label' || s.state === 'unknown') {
    await doc.ref.update(trackFields(s));
    return 'waiting';
  }
  // Claim the order inside a transaction so two runs can't both email.
  const claimed = await db.runTransaction(async (t) => {
    const fresh = await t.get(doc.ref);
    if (!fresh.exists || fresh.data().status !== 'label-created') return false;
    const fields = Object.assign(trackFields(s), {
      status: s.state === 'delivered' ? 'delivered' : 'shipped',
      shippedAt: s.at || nowIso(),
      autoShippedAt: nowIso(),
      shippedEmailPending: true
    });
    if (s.deliveredAt) fields.deliveredAt = s.deliveredAt;
    t.update(doc.ref, fields);
    return true;
  });
  if (!claimed) return 'skipped';
  log('#' + (order.orderNumber || doc.id) + ' first ' + carrierName(carrier) + ' scan ' + (s.at || '') + ' → ' + (s.state === 'delivered' ? 'delivered' : 'shipped'));
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
  try {
    const r = await Loyalty.credit(db, ref.id, 'Auto: UPS first scan');
    if (r) log('  loyalty ' + r.tier.name + ' ' + Credits.formatCents(r.cents) + ' to the buyer');
  } catch (err) {
    log('  loyalty credit FAILED: ' + (err && err.message || err));
  }
  try {
    const alloc = await Lots.allocate(db, ref.id);
    if (alloc) log('  lots: ' + alloc.map((a) => a.slug + ' ' + (a.lot || 'no lot') + ' ×' + a.qty).join(', '));
  } catch (err) {
    log('  lot assignment FAILED: ' + (err && err.message || err));
  }
}

// Marks auto-shipped orders delivered when UPS says so (no email).
async function checkDelivered({ carrier, doc }) {
  const order = doc.data();
  if (!canTrack(carrier, order.trackingNumber) || order.deliveredAt) return 'skip';
  const since = Date.parse(order.shippedAt || order.autoShippedAt || order.shippedEmailSentAt || 0);
  if (!since || Date.now() - since > DELIVERY_WATCH_DAYS * 864e5) return 'skip';
  const s = await statusOf(carrier, order.trackingNumber);
  const fields = trackFields(s);
  if (s.state === 'delivered') Object.assign(fields, { status: 'delivered', deliveredAt: s.deliveredAt || nowIso() });
  await doc.ref.update(fields);
  return s.state === 'delivered' ? 'delivered' : 'in-transit';
}

// Supplier shipments (Admin → Incoming): ordered → in-transit → delivered.
// On delivery, a shipment set to auto-receive is added to stock
// (js/incoming.js, one transaction, never twice).
async function checkIncoming({ db, carrier, doc, log }) {
  const ship = doc.data();
  const num = String(ship.trackingNumber || '').replace(/\s+/g, '').toUpperCase();
  if (!num) return 'incoming-no-tracking';
  if (!canTrack(carrier, num)) {
    if (!ship.trackingCheckedAt) await doc.ref.update({ trackingCheckedAt: nowIso(), trackingStatusText: carrier.canTrack ? 'Not a tracking number, so it isn’t checked automatically.' : 'Not a UPS number, so it isn’t checked automatically.' });
    return 'incoming-not-ups';
  }
  const since = Date.parse(ship.createdAt || 0);
  if (since && Date.now() - since > INCOMING_WATCH_DAYS * 864e5) return 'incoming-too-old';
  const s = await statusOf(carrier, num);
  const fields = trackFields(s);
  if (s.state === 'moving' && ship.status === 'ordered') Object.assign(fields, { status: 'in-transit', shippedAt: s.at || nowIso() });
  if (s.state === 'delivered') Object.assign(fields, { status: 'delivered', deliveredAt: s.deliveredAt || nowIso(), shippedAt: ship.shippedAt || s.at || nowIso() });
  await doc.ref.update(fields);
  const label = (ship.supplier || 'Supplier') + (ship.reference ? ' ' + ship.reference : '');
  if (s.state !== 'delivered') return s.state === 'moving' ? 'incoming-in-transit' : 'incoming-waiting';
  log('Incoming ' + label + ' delivered');
  if (ship.autoReceive === false) return 'incoming-delivered';
  const r = await Incoming.receive(db, doc.id, { by: 'auto (UPS delivered)' });
  if (r.ok) log('  added to stock: ' + r.lines.map((l) => l.slug + ' +' + l.qty).join(', '));
  return r.ok ? 'incoming-received' : 'incoming-delivered';
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

  for (const st of ['ordered', 'in-transit']) {
    const inc = await db.collection('incoming').where('status', '==', st).get();
    for (const doc of inc.docs) {
      try { count(await checkIncoming({ db, carrier, doc, log })); }
      catch (err) { count('error'); log('Incoming ' + doc.id + ' error: ' + err.message); }
    }
  }

  log('Done: ' + (Object.keys(tally).length ? JSON.stringify(tally) : 'nothing to check'));
  return tally;
}

module.exports = { run, DELIVERY_WATCH_DAYS, INCOMING_WATCH_DAYS };
