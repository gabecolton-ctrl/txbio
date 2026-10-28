// checkout.js — the server checkout logic (see index.js). The database is
// passed in, so tests can run it against an in-memory stand-in.
const { HttpsError } = require('firebase-functions/v2/https');
const P = require('./pricing');
const AtCost = require('./at-cost');
const FreeShipping = require('./free-shipping');

const PAYMENT_METHODS = ['inquiry', 'bitcoin', 'bank', 'venmo', 'cashapp'];
const PaymentApps = require('./payment-apps');

function generateOrderNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let random = '';
  for (let i = 0; i < 6; i++) random += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'TXB-' + random;
}

// The checkout logic, with the database passed in so tests can supply their own.
async function placeOrderHandler({ db, FieldValue, uid, email, data, catalog, now }) {
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in to place an order.');
  data = data || {};
  const userEmail = String(email || '').toLowerCase();
  const nowIso = (now || new Date()).toISOString();

  const familyShipping = String(data.shippingValue) === AtCost.FAMILY_SHIPPING_VALUE;
  let shippingOpt = familyShipping ? null : catalog.shipping[String(data.shippingValue)];
  if (!shippingOpt && !familyShipping) throw new HttpsError('invalid-argument', 'Please choose a shipping option.');
  const paymentMethod = PAYMENT_METHODS.indexOf(data.paymentMethod) !== -1 ? data.paymentMethod : null;
  if (!paymentMethod) throw new HttpsError('invalid-argument', 'Please choose a payment method.');
  const address = P.cleanAddress(data.shippingAddress);
  if (!(address.addressLine1 || address.city || address.state || address.zip)) {
    throw new HttpsError('invalid-argument', 'Please add a shipping address before submitting your order.');
  }
  const notes = P.cleanText(data.notes, 2000);
  // Venmo / Cash App: the handle comes from settings, never from the browser.
  let paymentHandle = '';
  if (paymentMethod === 'venmo' || paymentMethod === 'cashapp') {
    const appsSnap = await db.collection('settings').doc('paymentApps').get();
    const apps = appsSnap.exists ? appsSnap.data() : {};
    paymentHandle = paymentMethod === 'venmo' ? PaymentApps.cleanVenmo(apps.venmo) : PaymentApps.cleanCashtag(apps.cashapp);
    if (!paymentHandle) throw new HttpsError('invalid-argument', 'That payment method isn’t available right now. Please choose another.');
  }
  const promoCode = P.cleanText(data.promoCode, 40).toUpperCase();
  const useCredit = data.useCredit === true && !!userEmail;

  // Price the cart as saved in the database, not as the browser describes it.
  const cartSnap = await db.collection('carts').doc(uid).get();
  const cartItems = cartSnap.exists ? (cartSnap.data().items || []) : [];
  let lines;
  try {
    lines = P.priceCart(catalog, cartItems);
  } catch (e) {
    if (e instanceof P.PricingError) throw new HttpsError('failed-precondition', e.message);
    throw e;
  }

  const bogoSnap = await db.collection('bogoProducts').where('active', '==', true).get();
  const bogoSlugs = bogoSnap.docs.map((d) => d.id);
  const bogo = P.bogoDiscount(lines, bogoSlugs);

  // Family "at cost" code: only valid for the emails it lists; for anyone else
  // it's treated as an unknown code (same as the browser).
  let atCost = null;
  if (promoCode) {
    const acSnap = await db.collection('atCostCodes').doc(promoCode).get();
    const check = acSnap.exists ? AtCost.checkCode(acSnap.data(), promoCode, userEmail) : { valid: false };
    if (check.valid) {
      const costSnap = await db.collection('costs').get();
      const costs = {};
      costSnap.docs.forEach((d) => { if (typeof d.data().perVialCost === 'number') costs[d.id] = d.data().perVialCost; });
      atCost = { code: promoCode, markupPerVial: check.markupPerVial, result: AtCost.priceLines(lines, costs, check.markupPerVial) };
      shippingOpt = { price: check.shipping.price, label: check.shipping.label };
    }
  }
  // The family shipping option exists only with a valid family code.
  if (!shippingOpt) throw new HttpsError('invalid-argument', 'Please choose a shipping option.');

  let promo = null;
  if (promoCode && !atCost) {
    const [promoSnap, priorOrders] = await Promise.all([
      db.collection('promoCodes').doc(promoCode).get(),
      db.collection('orders').where('userId', '==', uid).limit(1).get()
    ]);
    const check = P.checkPromo(promoSnap.exists ? promoSnap.data() : null, promoCode, priorOrders.empty);
    if (!check.valid) throw new HttpsError('failed-precondition', check.reason);
    promo = check;
  }

  const needs = P.stockNeeds(lines);
  const orderRef = db.collection('orders').doc();
  const creditRef = userEmail ? db.collection('credits').doc(userEmail) : null;

  const order = await db.runTransaction(async (t) => {
    // Reads first (a Firestore transaction rule).
    const stockSlugs = [...needs.keys()];
    const stockDocs = await Promise.all(stockSlugs.map((s) => t.get(db.collection('inventory').doc(s))));
    const creditDoc = useCredit ? await t.get(creditRef) : null;
    const credit = creditDoc && creditDoc.exists ? creditDoc.data() : null;

    const totals = P.computeTotals({
      lines,
      discountPercent: promo ? promo.discountPercent : 0,
      fixedDiscount: atCost ? atCost.result.discount : null,
      bogo: atCost ? 0 : bogo.discountAmount,
      bogoSlugs,
      shippingPrice: shippingOpt.price,
      shippingValue: atCost ? null : String(data.shippingValue),
      family: !!atCost,
      taxRate: catalog.taxRate,
      creditBalanceCents: credit ? (credit.balanceCents || 0) : 0,
      useCredit: !!credit
    });

    // Stock: tracked records go down (never below zero); the rest backorders.
    const available = new Map();
    stockSlugs.forEach((slug, i) => {
      const d = stockDocs[i];
      const qty = d.exists && typeof d.data().qty === 'number' ? d.data().qty : null;
      available.set(slug, qty);
    });
    const remaining = new Map(available);
    const items = lines.map((l, i) => {
      const slug = l.caseOf ? l.unitSlug : l.slug;
      const units = l.caseOf ? l.qty * l.caseOf : l.qty;
      const left = remaining.get(slug);
      let fulfilled = units;
      if (left !== null) {
        fulfilled = Math.min(left, units);
        remaining.set(slug, left - fulfilled);
      }
      const item = { slug: l.slug, name: l.name, packSize: l.packSize, price: l.price, qty: l.qty, fulfilled, backordered: units - fulfilled };
      if (l.caseOf) { item.caseOf = l.caseOf; item.unitSlug = l.unitSlug; }
      if (atCost) {
        const ac = atCost.result.lines[i];
        if (typeof ac.unitCost === 'number') item.unitCost = ac.unitCost;
        item.atCostPrice = ac.atCostPrice;
      }
      return item;
    });

    const orderNumber = generateOrderNumber();
    const orderDoc = {
      items,
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      shippingOption: totals.shipping === 0 && shippingOpt.price > 0 ? FreeShipping.freeLabel(shippingOpt.label) : shippingOpt.label,
      discount: totals.discount,
      promoCode: promo ? promo.code : (atCost ? atCost.code : null),
      bogoDiscount: totals.bogoDiscount,
      bogoBreakdown: atCost ? [] : bogo.breakdown,
      tax: totals.tax,
      totalBeforeCredit: totals.totalBeforeCredit,
      creditUsed: totals.creditUsed,
      creditUsedCents: totals.creditUsedCents,
      affiliateCode: promo ? promo.code : '',
      total: totals.total,
      shippingAddress: address,
      notes,
      paymentMethod,
      paymentHandle,
      hasBackorder: items.some((i) => i.backordered > 0),
      status: 'pending',
      userId: uid,
      userEmail,
      createdAt: nowIso,
      orderNumber,
      placedBy: 'server'
    };
    if (atCost) {
      orderDoc.atCostCode = atCost.code;
      orderDoc.atCostMarkupPerVial = atCost.markupPerVial;
    }

    // Writes.
    stockSlugs.forEach((slug) => {
      const before = available.get(slug);
      const after = remaining.get(slug);
      if (before !== null && after !== before) {
        t.update(db.collection('inventory').doc(slug), { qty: after, updatedAt: nowIso });
      }
    });
    if (totals.creditUsedCents > 0) {
      t.update(creditRef, {
        balanceCents: (credit.balanceCents || 0) - totals.creditUsedCents,
        spentCents: (credit.spentCents || 0) + totals.creditUsedCents,
        updatedAt: nowIso
      });
      t.set(creditRef.collection('entries').doc(), {
        type: 'spent', amountCents: -totals.creditUsedCents, orderId: orderRef.id, orderNumber, code: '', note: '', createdAt: nowIso
      });
    }
    if (promo) {
      t.update(db.collection('promoCodes').doc(promo.code), {
        timesUsed: FieldValue.increment(1),
        totalDiscounted: FieldValue.increment(totals.discount)
      });
    }
    t.set(orderRef, orderDoc);
    t.set(db.collection('carts').doc(uid), { items: [], updatedAt: nowIso });
    return orderDoc;
  });

  return Object.assign({ id: orderRef.id }, order);
}

module.exports = { placeOrderHandler };
