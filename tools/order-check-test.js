// node tools/order-check-test.js
const assert = require('assert');
const OrderCheck = require('../js/order-check.js');
const catalog = require('../functions/catalog.json');
const ctx = { catalog, settings: { prices: {}, budget: { percentOff: 30, prices: {} } }, promos: { SAVE10: { discountPercent: 10 } } };
const ahk = catalog.products['ahk-cu'];
const good = (over) => Object.assign({
  items: [{ slug: 'ahk-cu', name: 'AHK-CU', price: ahk.price, qty: 2 }],
  subtotal: ahk.price * 2, discount: 0, bogoDiscount: 0, shipping: 20, shippingOption: '3–5 Business Days — $20',
  tax: Math.round(ahk.price * 2 * 0.0825 * 100) / 100, createdAt: '2026-11-10T00:00:00Z'
}, over || {});
function fin(o) { o.totalBeforeCredit = Math.round((o.subtotal - o.discount - o.bogoDiscount + o.shipping + o.tax) * 100) / 100; o.total = o.totalBeforeCredit - (o.creditUsedCents || 0) / 100; return o; }
const levels = (o) => OrderCheck.check(o, ctx).issues.map((i) => i.level + ': ' + i.text);

assert.deepStrictEqual(levels(fin(good())), [], 'clean TXBio order');
// Budget order at budget price is clean; at TXBio price it's flagged as overcharge note only.
const bp = Math.max(1, Math.round(ahk.price * 0.7));
assert.deepStrictEqual(levels(fin(good({ site: 'budget', items: [{ slug: 'ahk-cu', price: bp, qty: 2 }], subtotal: bp * 2, tax: Math.round(bp * 2 * 0.0825 * 100) / 100 }))), []);
// Tampered price.
let t = fin(good({ items: [{ slug: 'ahk-cu', name: 'AHK-CU', price: 1, qty: 2 }], subtotal: 2, tax: 0.17 }));
assert.ok(levels(t).some((x) => x.startsWith('bad: AHK-CU')), levels(t).join('\n'));
// Tampered total only.
t = fin(good()); t.total = 5;
assert.ok(levels(t).some((x) => x.startsWith('bad: Total is')));
// Zero tax.
t = fin(good({ tax: 0 }));
assert.ok(levels(t).some((x) => x.startsWith('bad: Tax is')));
// Discount too big / no code.
t = fin(good({ discount: 30, promoCode: 'SAVE10' }));
assert.ok(levels(t).some((x) => x.includes('more than SAVE10 allows')));
t = fin(good({ discount: 5 }));
assert.ok(levels(t).some((x) => x.includes('no promo code')));
// Shipping: cheaper than the option → bad; free below the minimum → note.
t = fin(good({ shipping: 1 }));
assert.ok(levels(t).some((x) => x.startsWith('bad: Shipping $1.00')));
t = fin(good({ shipping: 0, shippingOption: '3–5 Business Days — FREE' }));
assert.ok(levels(t).some((x) => x.startsWith('note: Free 3–5')));
// Prices changed after the order: price differences are notes.
const later = Object.assign({}, ctx, { settings: Object.assign({}, ctx.settings, { updatedAt: '2026-11-11T00:00:00Z' }) });
t = fin(good({ items: [{ slug: 'ahk-cu', name: 'AHK-CU', price: 1, qty: 2 }], subtotal: 2, tax: 0.17 }));
assert.ok(OrderCheck.check(t, later).issues.every((i) => i.level === 'note'));
// Quotes and family orders keep their prices.
assert.deepStrictEqual(levels(fin(good({ items: [{ slug: 'ahk-cu', price: 3, qty: 2, quoteId: 'q1' }], subtotal: 6, tax: 0.5 }))), []);
console.log('Order check tests passed');
