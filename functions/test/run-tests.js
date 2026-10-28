// Tests for the server checkout, run with: npm test (from functions/).
// Uses an in-memory stand-in for Firestore that enforces transaction
// read-before-write ordering and applies writes atomically.
const assert = require('assert');
const path = require('path');
const { HttpsError } = require('firebase-functions/v2/https');
const catalog = require(path.join(__dirname, '..', 'catalog.json'));
const P = require('../pricing');

const { placeOrderHandler: placeOrder } = require('../checkout');

// ---------- in-memory Firestore ----------
function makeDb(seed) {
  const store = new Map(Object.entries(JSON.parse(JSON.stringify(seed || {}))));
  let idn = 0;
  const INC = Symbol('inc');
  const FieldValue = { increment: (n) => ({ [INC]: n }) };
  const apply = (prev, fields) => {
    const out = Object.assign({}, prev);
    for (const [k, v] of Object.entries(fields)) out[k] = v && v[INC] !== undefined ? (out[k] || 0) + v[INC] : v;
    return out;
  };
  const snap = (p) => ({ exists: store.has(p), id: p.split('/').pop(), data: () => JSON.parse(JSON.stringify(store.get(p))) });
  function doc(p) {
    return {
      path: p, id: p.split('/').pop(),
      collection: (n) => col(p + '/' + n),
      get: async () => snap(p),
      set: async (d) => { store.set(p, JSON.parse(JSON.stringify(d))); },
      update: async (f) => { if (!store.has(p)) throw new Error('missing ' + p); store.set(p, apply(store.get(p), f)); }
    };
  }
  function col(p, filters = [], lim = null) {
    return {
      doc: (id) => doc(p + '/' + (id || 'auto' + (idn++))),
      where: (f, op, v) => col(p, filters.concat([[f, v]]), lim),
      limit: (n) => col(p, filters, n),
      get: async () => {
        let docs = [...store.keys()].filter((k) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/'))
          .filter((k) => filters.every(([f, v]) => store.get(k)[f] === v)).map(snap);
        if (lim) docs = docs.slice(0, lim);
        return { empty: !docs.length, docs, forEach: (fn) => docs.forEach(fn) };
      }
    };
  }
  return {
    FieldValue, store,
    collection: (n) => col(n),
    async runTransaction(fn) {
      const writes = []; let wrote = false;
      const t = {
        get: async (ref) => { if (wrote) throw new Error('Transaction read after write'); return snap(ref.path); },
        set: (ref, d) => { wrote = true; writes.push(['set', ref.path, d]); },
        update: (ref, f) => { wrote = true; if (!store.has(ref.path)) throw new Error('missing ' + ref.path); writes.push(['update', ref.path, f]); }
      };
      const res = await fn(t);
      for (const [op, p, d] of writes) {
        if (op === 'set') store.set(p, JSON.parse(JSON.stringify(d))); else store.set(p, apply(store.get(p), d));
      }
      return res;
    }
  };
}

const ADDRESS = { addressLine1: '1 Lab Way', city: 'Dallas', state: 'TX', zip: '75201' };
const BUYER = { uid: 'u1', email: 'Buyer@Example.com' };
function run(seed, data, who = BUYER) {
  const db = makeDb(seed);
  return placeOrder({ db, FieldValue: db.FieldValue, uid: who.uid, email: who.email, data: Object.assign({ shippingValue: '20', paymentMethod: 'inquiry', shippingAddress: ADDRESS, attested: true }, data), catalog, now: new Date('2026-10-25T12:00:00Z') })
    .then((order) => ({ order, db }));
}
async function rejects(promise, code, msgPart) {
  try { await promise; } catch (e) {
    assert.ok(e instanceof HttpsError, 'expected HttpsError, got ' + e);
    assert.strictEqual(e.code, code, e.message);
    if (msgPart) assert.ok(e.message.includes(msgPart), e.message);
    return;
  }
  assert.fail('expected rejection');
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const cart = (items) => ({ 'carts/u1': { items } });

test('prices come from the catalog, not the cart', async () => {
  const { order, db } = await run(cart([{ slug: 'semaglutide-10mg', name: 'x', price: 1, qty: 2 }]));
  assert.strictEqual(order.items[0].price, 109);
  assert.strictEqual(order.subtotal, 218);
  assert.strictEqual(order.tax, 17.99);           // 218 * 8.25% = 17.985 -> 17.99
  assert.strictEqual(order.total, 255.99);        // 218 + 20 + 17.99
  assert.strictEqual(order.placedBy, 'server');
  assert.strictEqual(order.userEmail, 'buyer@example.com');
  assert.deepStrictEqual(db.store.get('carts/u1').items, []);
  assert.ok([...db.store.keys()].some((k) => k.startsWith('orders/')));
});

test('free standard shipping at $250+ after discounts; not for faster options or below', async () => {
  let r = await run(cart([{ slug: 'semaglutide-10mg', qty: 3 }]));           // 327
  assert.strictEqual(r.order.shipping, 0);
  assert.ok(/FREE/.test(r.order.shippingOption), r.order.shippingOption);
  assert.strictEqual(r.order.total, Math.round((327 + 26.98) * 100) / 100);
  r = await run(cart([{ slug: 'semaglutide-10mg', qty: 3 }]), { shippingValue: '25' });
  assert.strictEqual(r.order.shipping, 25);
  const seed = Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 3 }]), { 'promoCodes/BIG30': { discountPercent: 30, type: 'always', active: true } });
  r = await run(seed, { promoCode: 'BIG30' });                                 // 327 - 98.10 = 228.90
  assert.strictEqual(r.order.shipping, 20);
});

test('Platinum (2,500+ shipped) ships free on any option, any size', async () => {
  const seed = Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 1 }]), {
    'orders/old1': { userId: 'u1', status: 'delivered', subtotal: 1800, discount: 0, createdAt: '2026-01-01' },
    'orders/old2': { userId: 'u1', status: 'shipped', subtotal: 800, discount: 0, createdAt: '2026-02-01' }
  });
  const r = await run(seed, { shippingValue: '40' });
  assert.strictEqual(r.order.shipping, 0);
  assert.ok(/2nd Day — FREE/.test(r.order.shippingOption), r.order.shippingOption);
  const notYet = Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 1 }]), { 'orders/old1': { userId: 'u1', status: 'delivered', subtotal: 2400, createdAt: '2026-01-01' } });
  assert.strictEqual((await run(notYet, { shippingValue: '40' })).order.shipping, 40);
});

test('attestation: required, and saved word for word with the Terms version', async () => {
  await rejects(run(cart([{ slug: 'semaglutide-10mg', qty: 1 }]), { attested: false }), 'failed-precondition', '21 or older');
  const { order } = await run(cart([{ slug: 'semaglutide-10mg', qty: 1 }]));
  const A = require('../attestation');
  assert.strictEqual(order.attestation.text, A.ORDER_TEXT);
  assert.ok(/21 years of age or older/.test(order.attestation.text));
  assert.strictEqual(order.attestation.termsVersion, A.TERMS_VERSION);
  assert.strictEqual(order.attestation.agreedAt, '2026-10-25T12:00:00.000Z');
});

test('matches the browser test order: promo 10% + $25 credit', async () => {
  const seed = Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 2 }]), {
    'promoCodes/BOOP12': { discountPercent: 10, type: 'always', active: true, affiliateEmail: 'aff@example.com', timesUsed: 3, totalDiscounted: 10 },
    'credits/buyer@example.com': { balanceCents: 2500, earnedCents: 2500, spentCents: 0 }
  });
  const { order, db } = await run(seed, { promoCode: 'boop12', useCredit: true });
  assert.strictEqual(order.discount, 21.8);
  assert.strictEqual(order.tax, 16.19);
  assert.strictEqual(order.creditUsedCents, 2500);
  assert.strictEqual(order.total, 207.39);
  assert.strictEqual(order.affiliateCode, 'BOOP12');
  const promo = db.store.get('promoCodes/BOOP12');
  assert.strictEqual(promo.timesUsed, 4);
  assert.strictEqual(Math.round(promo.totalDiscounted * 100), 3180);
  const credit = db.store.get('credits/buyer@example.com');
  assert.deepStrictEqual([credit.balanceCents, credit.spentCents], [0, 2500]);
  const entry = [...db.store.entries()].find(([k]) => k.startsWith('credits/buyer@example.com/entries/'));
  assert.strictEqual(entry[1].amountCents, -2500);
});

test('store credit never exceeds the total', async () => {
  const seed = Object.assign(cart([{ slug: 'sterile-water', qty: 1 }]), { 'credits/buyer@example.com': { balanceCents: 100000, earnedCents: 100000, spentCents: 0 } });
  const { order, db } = await run(seed, { useCredit: true });
  assert.strictEqual(order.total, 0);
  assert.strictEqual(order.creditUsedCents, Math.round(order.totalBeforeCredit * 100));
  assert.strictEqual(db.store.get('credits/buyer@example.com').balanceCents, 100000 - order.creditUsedCents);
});

test('cases: pay for 7 of 10; supplies by the case at full price', async () => {
  const { order } = await run(cart([{ slug: 'semaglutide-10mg-case', qty: 1 }, { slug: 'bac-water-10ml-case', qty: 1 }]));
  const sema = order.items.find((i) => i.slug === 'semaglutide-10mg-case');
  const bac = order.items.find((i) => i.slug === 'bac-water-10ml-case');
  assert.deepStrictEqual([sema.price, sema.caseOf, sema.unitSlug, sema.packSize], [763, 10, 'semaglutide-10mg', 'Case of 10 vials x 10mg']);
  assert.strictEqual(bac.price, 200);
});

test('stock: cases draw 10 units; shortfall backorders; shared stock across lines', async () => {
  const seed = Object.assign(cart([{ slug: 'semaglutide-10mg-case', qty: 1 }, { slug: 'semaglutide-10mg', qty: 4 }]), { 'inventory/semaglutide-10mg': { qty: 12 } });
  const { order, db } = await run(seed);
  const [c, s] = [order.items.find((i) => i.caseOf), order.items.find((i) => !i.caseOf)];
  assert.deepStrictEqual([c.fulfilled, c.backordered], [10, 0]);
  assert.deepStrictEqual([s.fulfilled, s.backordered], [2, 2]);
  assert.strictEqual(order.hasBackorder, true);
  assert.strictEqual(db.store.get('inventory/semaglutide-10mg').qty, 0);
});

test('BOGO: pairs of eligible vials; never on cases', async () => {
  const seed = Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 3 }, { slug: 'semaglutide-5mg-case', qty: 1 }]), { 'bogoProducts/semaglutide': { active: true } });
  const { order } = await run(seed);
  assert.strictEqual(order.bogoDiscount, 109);
  assert.strictEqual(order.bogoBreakdown.length, 1);
});

test('promo codes skip BOGO pairs (not single vials) but stay on the order for affiliates', async () => {
  const promo = { 'promoCodes/BOOP12': { discountPercent: 10, type: 'always', active: true, affiliateEmail: 'aff@example.com', timesUsed: 0, totalDiscounted: 0 }, 'bogoProducts/semaglutide': { active: true } };
  // Only BOGO items: no promo discount, code still recorded.
  let r = await run(Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 2 }]), promo), { promoCode: 'BOOP12' });
  assert.deepStrictEqual([r.order.bogoDiscount, r.order.discount, r.order.promoCode, r.order.affiliateCode], [109, 0, 'BOOP12', 'BOOP12']);
  assert.strictEqual(r.db.store.get('promoCodes/BOOP12').timesUsed, 1);
  // A single BOGO vial (no free one) gets the promo.
  r = await run(Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 1 }]), promo), { promoCode: 'BOOP12' });
  assert.deepStrictEqual([r.order.bogoDiscount, r.order.discount], [0, 10.9]);
  // Three vials: one BOGO pair, the third vial gets the promo.
  r = await run(Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 3 }]), promo), { promoCode: 'BOOP12' });
  assert.deepStrictEqual([r.order.bogoDiscount, r.order.discount], [109, 10.9]);
  // Mixed: promo applies to the non-BOGO item and to a case of the BOGO product.
  r = await run(Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 2 }, { slug: 'cagrilintide', qty: 1 }, { slug: 'semaglutide-5mg-case', qty: 1 }]), promo), { promoCode: 'BOOP12' });
  assert.strictEqual(r.order.discount, P.round2((121 + 69 * 7) * 0.10));
  assert.strictEqual(r.order.bogoDiscount, 109);
});

test('promo rules: unknown, inactive, first-order only', async () => {
  const base = cart([{ slug: 'cagrilintide', qty: 1 }]);
  await rejects(run(base, { promoCode: 'NOPE' }), 'failed-precondition', 'does not exist');
  await rejects(run(Object.assign({}, base, { 'promoCodes/OLD': { discountPercent: 10, type: 'always', active: false } }), { promoCode: 'OLD' }), 'failed-precondition', 'no longer active');
  await rejects(run(Object.assign({}, base, { 'promoCodes/FIRST': { discountPercent: 10, type: 'first-order', active: true }, 'orders/prev': { userId: 'u1' } }), { promoCode: 'FIRST' }), 'failed-precondition', 'first order');
});

test('rejects bad carts and inputs', async () => {
  await rejects(run(cart([])), 'failed-precondition', 'empty');
  await rejects(run(cart([{ slug: 'botulinum-toxin', qty: 1 }])), 'failed-precondition', 'no longer in the catalog');
  await rejects(run(cart([{ slug: 'semaglutide', qty: 1 }])), 'failed-precondition', 'no longer in the catalog'); // needs a dose
  await rejects(run(cart([{ slug: 'semaglutide-11mg', qty: 1 }])), 'failed-precondition');
  await rejects(run(cart([{ slug: 'cagrilintide', qty: 0 }])), 'failed-precondition', 'quantity');
  await rejects(run(cart([{ slug: 'cagrilintide', qty: 1.5 }])), 'failed-precondition', 'quantity');
  await rejects(run(cart([{ slug: 'cagrilintide', qty: 1 }]), { shippingValue: '1' }), 'invalid-argument', 'shipping');
  await rejects(run(cart([{ slug: 'cagrilintide', qty: 1 }]), { paymentMethod: 'free' }), 'invalid-argument', 'payment');
  await rejects(run(cart([{ slug: 'cagrilintide', qty: 1 }]), { shippingAddress: {} }), 'invalid-argument', 'address');
  await rejects(run(cart([{ slug: 'cagrilintide', qty: 1 }]), {}, { uid: null, email: null }), 'unauthenticated');
});

test('ignores client attempts to set totals or credit', async () => {
  const seed = Object.assign(cart([{ slug: 'cagrilintide', qty: 1 }]), { 'credits/buyer@example.com': { balanceCents: 500, earnedCents: 500, spentCents: 0 } });
  const { order } = await run(seed, { total: 1, subtotal: 1, creditUsedCents: 99999, useCredit: true, discount: 500 });
  assert.strictEqual(order.subtotal, 121);
  assert.strictEqual(order.creditUsedCents, 500);
  assert.strictEqual(order.discount, 0);
});

test('at-cost code: listed email pays cost + $3/vial, no BOGO, no affiliate, costs recorded', async () => {
  const seed = Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 2 }, { slug: 'semaglutide-5mg-case', qty: 1 }, { slug: 'cagrilintide', qty: 1 }]), {
    'atCostCodes/FAMILY': { active: true, emails: ['buyer@example.com'], markupPerVial: 3 },
    'costs/semaglutide-10mg': { perVialCost: 12.5 },
    'costs/semaglutide-5mg': { perVialCost: 8 },
    'bogoProducts/semaglutide': { active: true }
  });
  const { order, db } = await run(seed, { promoCode: 'family' });
  // list: 109*2 + 69*7 + cagrilintide (no cost -> regular price)
  const cagri = catalog.products.cagrilintide.price;
  assert.strictEqual(order.subtotal, 218 + 483 + cagri);
  const atCostTotal = 2 * 15.5 + 10 * 11 + cagri;
  assert.strictEqual(Math.round(order.discount * 100), Math.round((order.subtotal - atCostTotal) * 100));
  assert.strictEqual(order.bogoDiscount, 0);
  assert.deepStrictEqual([order.promoCode, order.affiliateCode, order.atCostCode, order.atCostMarkupPerVial], ['FAMILY', '', 'FAMILY', 3]);
  assert.deepStrictEqual(order.items.map((i) => i.unitCost), [12.5, 8, undefined]);
  assert.deepStrictEqual(order.items.map((i) => i.atCostPrice), [31, 110, cagri]);
  assert.strictEqual(order.tax, P.round2(atCostTotal * catalog.taxRate));
  assert.ok(!db.store.has('promoCodes/FAMILY'));
});

test('at-cost code: email not listed is treated as an unknown code', async () => {
  const seed = Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 1 }]), {
    'atCostCodes/FAMILY': { active: true, emails: ['mom@example.com'], markupPerVial: 3 }, 'costs/semaglutide-10mg': { perVialCost: 12.5 }
  });
  await rejects(run(seed, { promoCode: 'FAMILY' }), 'failed-precondition', 'does not exist');
  seed['atCostCodes/FAMILY'] = { active: false, emails: ['buyer@example.com'] };
  await rejects(run(seed, { promoCode: 'FAMILY' }), 'failed-precondition', 'does not exist');
});

test('family code: one shipping option (default 2nd Day Air $15), others rejected without the code', async () => {
  const seed = Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 1 }]), {
    'atCostCodes/FAMILY': { active: true, emails: ['buyer@example.com'] }, 'costs/semaglutide-10mg': { perVialCost: 6.6 }
  });
  let r = await run(seed, { promoCode: 'FAMILY', shippingValue: 'family' });
  assert.deepStrictEqual([r.order.shipping, r.order.shippingOption], [15, '2nd Day Air — $15']);
  assert.strictEqual(r.order.total, P.round2(9.6 + 15 + P.round2(9.6 * catalog.taxRate)));
  // Family code with a regular shipping value still gets the family shipping.
  r = await run(seed, { promoCode: 'FAMILY', shippingValue: '40' });
  assert.strictEqual(r.order.shipping, 15);
  // Custom price on the code.
  seed['atCostCodes/FAMILY'].shippingPrice = 12;
  r = await run(seed, { promoCode: 'FAMILY', shippingValue: 'family' });
  assert.strictEqual(r.order.shipping, 12);
  // No family code: "family" shipping isn't available.
  await rejects(run(seed, { shippingValue: 'family' }), 'invalid-argument', 'shipping');
});

test('Venmo / Cash App: handle from settings; unavailable when not set', async () => {
  const seed = Object.assign(cart([{ slug: 'semaglutide-10mg', qty: 1 }]), { 'settings/paymentApps': { venmo: '@TXBio-Research', cashapp: '' } });
  const r = await run(seed, { paymentMethod: 'venmo' });
  assert.deepStrictEqual([r.order.paymentMethod, r.order.paymentHandle], ['venmo', 'TXBio-Research']);
  await rejects(run(seed, { paymentMethod: 'cashapp' }), 'invalid-argument', 'payment method');
  const plain = await run(cart([{ slug: 'semaglutide-10mg', qty: 1 }]), { paymentMethod: 'bank' });
  assert.strictEqual(plain.order.paymentHandle, '');
});

test('family code: waters at plain cost (no add-on), peptides at cost + $3', async () => {
  const seed = Object.assign(cart([{ slug: 'bac-water-10ml', qty: 1 }, { slug: 'bac-water-10ml-case', qty: 1 }, { slug: 'semaglutide-5mg', qty: 1 }]), {
    'atCostCodes/FAMILY': { active: true, emails: ['buyer@example.com'], markupPerVial: 3 },
    'costs/bac-water-10ml': { perVialCost: 2 }, 'costs/semaglutide-5mg': { perVialCost: 4.4 }
  });
  const { order } = await run(seed, { promoCode: 'FAMILY', shippingValue: 'family' });
  assert.deepStrictEqual(order.items.map((i) => i.atCostPrice), [2, 20, 7.4]);
});

test('functions/at-cost.js matches js/at-cost.js', async () => {
  const fs = require('fs');
  const a = fs.readFileSync(path.join(__dirname, '..', 'at-cost.js'), 'utf8').split('\n').slice(1).join('\n');
  const b = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'at-cost.js'), 'utf8');
  assert.strictEqual(a, b, 'Run node tools/build-catalog.js to refresh functions/at-cost.js');
});

test('every catalog dose and product prices without error', async () => {
  for (const [slug, p] of Object.entries(catalog.products)) {
    const slugs = p.doses ? Object.keys(p.doses) : [slug];
    for (const s of slugs) {
      const line = P.resolveLine(catalog, s);
      assert.ok(line.price > 0, s);
      const caseLine = P.resolveLine(catalog, s + '-case');
      assert.strictEqual(caseLine.price, line.price * (p.caseEligible ? 7 : 10), s + '-case');
    }
  }
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '\n    ', e.message); }
  }
  console.log(failed ? failed + ' failed' : 'All ' + tests.length + ' tests passed');
  process.exit(failed ? 1 : 0);
})();
