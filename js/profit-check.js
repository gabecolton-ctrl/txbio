// profit-check.js — Admin → Promo codes: what each product earns you after a
// discount, using your costs (Admin → At cost → costs/{unitSlug}). Promo codes
// also apply to cases (30% off already), so cases are checked too.
var ProfitCheck = (function () {
  function round2(n) { return Math.round(n * 100) / 100; }

  // catalog: functions/catalog.json; costs: { unitSlug: perVialCost };
  // pct: discount %; commission: affiliate rate (0.10) or 0.
  // Returns { rows: [...], missing: [names without a cost] } sorted worst first.
  function compute(catalog, costs, pct, commission) {
    var rows = [], missing = [];
    var products = (catalog && catalog.products) || {};
    var caseSize = catalog.caseSize || 10, freeVials = catalog.freeVials || 3;
    Object.keys(products).forEach(function (slug) {
      var p = products[slug];
      var units = p.doses ? Object.keys(p.doses).map(function (k) { return { slug: k, label: p.name + ' ' + p.doses[k].label, price: p.doses[k].price }; })
        : [{ slug: slug, label: p.name, price: p.price }];
      units.forEach(function (u) {
        var cost = costs[u.slug];
        if (!(cost > 0)) { missing.push(u.label); return; }
        var add = function (mode, perVialPrice) {
          var after = perVialPrice * (1 - pct / 100);
          var profit = after * (1 - (commission || 0)) - cost;
          rows.push({ label: u.label, mode: mode, price: round2(perVialPrice), after: round2(after), cost: round2(cost), profit: round2(profit), margin: after > 0 ? profit / after : -1 });
        };
        add('vial', u.price);
        if (p.caseEligible) add('case', u.price * (caseSize - freeVials) / caseSize);
      });
    });
    rows.sort(function (a, b) { return a.margin - b.margin; });
    return { rows: rows, missing: missing };
  }

  return { compute: compute };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProfitCheck;
