// node tools/order-edit-test.js
const assert = require('assert');
const E = require('../js/order-edit.js');
const settings = null; // default shipping: 3–5 Day $20 free at $250+, 3 Day $25, 2nd Day $40
const order = {
  items: [{ slug: 'ahk-cu', name: 'AHK-CU', price: 38, qty: 2 }],
  subtotal: 76, discount: 7.6, bogoDiscount: 0, shipping: 20, shippingOption: '3–5 Business Days — $20', tax: 5.64,
  creditUsedCents: 1000, total: 0
};
// Add 6 more vials: $304 subtotal, 10% promo share kept, crosses $250 → free 3–5 day shipping.
let t = E.recalc(order, [{ slug: 'ahk-cu', price: 38, qty: 8 }], { settings });
assert.deepStrictEqual([t.subtotal, t.discount, t.shipping, t.shippingOption], [304, 30.4, 0, '3–5 Business Days — FREE']);
assert.strictEqual(t.tax, Math.round((304 - 30.4) * 0.0825 * 100) / 100);
assert.strictEqual(t.total, Math.round((t.totalBeforeCredit - 10) * 100) / 100);
// Drop below again → $20 shipping back.
t = E.recalc(Object.assign({}, order, { subtotal: 304, discount: 30.4, shipping: 0, shippingOption: '3–5 Business Days — FREE' }), [{ slug: 'ahk-cu', price: 38, qty: 1 }], { settings });
assert.strictEqual(t.shipping, 20);
// Platinum (free below the minimum) stays free.
t = E.recalc(Object.assign({}, order, { shipping: 0, shippingOption: '2nd Day — FREE' }), [{ slug: 'ahk-cu', price: 38, qty: 3 }], { settings });
assert.strictEqual(t.shipping, 0);
// Credit used can't exceed the new total; the rest goes back.
t = E.recalc(Object.assign({}, order, { creditUsedCents: 50000 }), [{ slug: 'ahk-cu', price: 38, qty: 1 }], { settings });
assert.strictEqual(t.total, 0);
assert.ok(t.creditRefundCents > 0 && t.creditUsedCents + t.creditRefundCents === 50000);
// BOGO recomputed when the list is known.
t = E.recalc(order, [{ slug: 'ahk-cu', price: 38, qty: 4 }], { settings, bogoSlugs: ['ahk-cu'], calcBogo: (items) => ({ discountAmount: 2 * 38 }) });
assert.strictEqual(t.bogoDiscount, 76);
// Stock plan and change summary (cases count as 10).
assert.deepStrictEqual(E.stockPlan(order.items, [{ slug: 'ahk-cu', qty: 3 }, { slug: 'bpc-157-case', unitSlug: 'bpc-157-5mg', caseOf: 10, qty: 1 }]), { 'ahk-cu': 1, 'bpc-157-5mg': 10 });
assert.strictEqual(E.describe(order.items, [{ slug: 'ahk-cu', name: 'AHK-CU', qty: 3 }, { slug: 'x', name: 'X', qty: 1 }]), 'AHK-CU 2 → 3; added X × 1');
console.log('Order edit tests passed');
