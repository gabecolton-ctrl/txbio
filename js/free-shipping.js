// free-shipping.js — free standard shipping on bigger orders. Shared by the
// cart (progress bar), checkout, and the server checkout (copied to
// functions/ by tools/build-catalog.js). Family (at-cost) orders keep their
// own shipping option and don't qualify.
var FreeShipping = (function () {
  var MIN = 250;          // order subtotal after discounts, before tax
  var OPTION = '15';      // the shipping option that becomes free: "2nd Day — $15" (the only option)
  var PLATINUM_OPTION = '15'; // Platinum rewards members (js/loyalty.js): free 2nd Day

  function round2(n) { return Math.round(n * 100) / 100; }
  function qualifies(amount) { return Number(amount) >= MIN; }
  function remaining(amount) { return Math.max(0, round2(MIN - Number(amount || 0))); }
  // Shipping price for an option at this order amount.
  function priceFor(optionValue, basePrice, amount, isFamily, platinum) {
    if (isFamily) return basePrice;
    if (platinum) return 0;
    return String(optionValue) === OPTION && qualifies(amount) ? 0 : basePrice;
  }
  function freeLabel(label) { return String(label).replace(/\$\s?[\d,.]+/, 'FREE'); }

  return { MIN: MIN, OPTION: OPTION, PLATINUM_OPTION: PLATINUM_OPTION, qualifies: qualifies, remaining: remaining, priceFor: priceFor, freeLabel: freeLabel };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FreeShipping;
