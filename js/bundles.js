// bundles.js — research panels: a set of catalog items sold together at a
// discount (Admin → Bundles). Shared by the browser and the server checkout
// (copied to functions/ by tools/build-catalog.js).
//
// Firestore:
//   bundles/{id}  { name, description, discountPercent, items: [{ slug, qty }],
//                   active, sort, updatedAt }        (public read, admin write)
//
// In the cart a bundle becomes its component lines, each tagged with the
// bundle (bundleId, bundleKey = one purchase, bundleName) and priced at the
// catalog price less the bundle discount. Removing any line removes the whole
// bundle. Checkout reprices the lines from the bundle and the catalog, so a
// changed price in the cart doesn't stick. No promo code or BOGO on top.
//
// Compliance: names and descriptions describe research areas only. No doses,
// schedules, cycles, timelines or results (see WARN_WORDS on the admin page).
var Bundles = (function () {
  var WARN_WORDS = ['dose', 'dosing', 'dosage', 'cycle', 'stack', 'protocol', 'week', 'daily', 'per day', 'inject', 'injection',
    'subq', 'subcutaneous', 'take ', 'results', 'weight loss', 'lose weight', 'fat loss', 'heal', 'healing', 'treatment', 'treat ',
    'therapy', 'cure', 'muscle gain', 'anti-aging', 'wellness plan', 'for you', 'your body'];

  function round2(n) { return Math.round(n * 100) / 100; }
  function priceFor(listPrice, pct) { return round2(Number(listPrice) * (1 - (Number(pct) || 0) / 100)); }

  // Words that make a name or description read like human-use guidance.
  function warnings(text) {
    var t = ' ' + String(text || '').toLowerCase() + ' ';
    return WARN_WORDS.filter(function (w) { return t.indexOf(w) !== -1; });
  }

  // catalog.json → { unitSlug: { name, label, packSize, price } } for single vials.
  function unitsFromCatalog(cat) {
    var out = {};
    Object.keys((cat && cat.products) || {}).forEach(function (slug) {
      var p = cat.products[slug];
      if (p.doses) Object.keys(p.doses).forEach(function (ds) {
        out[ds] = { name: p.name, label: p.name + ' ' + p.doses[ds].label, packSize: p.doses[ds].packSize, price: p.doses[ds].price };
      });
      else out[slug] = { name: p.name, label: p.name, packSize: p.packSize, price: p.price };
    });
    return out;
  }

  // List price, bundle price and savings for a bundle.
  function totals(bundle, units) {
    var list = 0, ok = true;
    (bundle.items || []).forEach(function (it) {
      var u = units[it.slug];
      if (!u) { ok = false; return; }
      list += u.price * (Number(it.qty) || 1);
    });
    var price = (bundle.items || []).reduce(function (n, it) {
      var u = units[it.slug];
      return n + (u ? priceFor(u.price, bundle.discountPercent) * (Number(it.qty) || 1) : 0);
    }, 0);
    return { list: round2(list), price: round2(price), save: round2(list - price), complete: ok };
  }

  function newKey() {
    var s = '';
    for (var i = 0; i < 10; i++) s += 'abcdefghjkmnpqrstuvwxyz23456789'.charAt(Math.floor(Math.random() * 31));
    return s;
  }

  // Cart lines for one purchase of a bundle.
  function cartLines(id, bundle, units) {
    var key = newKey();
    return (bundle.items || []).map(function (it) {
      var u = units[it.slug];
      return {
        slug: it.slug, name: u.name, packSize: u.packSize, qty: Number(it.qty) || 1,
        price: priceFor(u.price, bundle.discountPercent),
        bundleId: id, bundleKey: key, bundleName: bundle.name
      };
    });
  }

  // Checks the cart lines of one bundle purchase against the bundle.
  // lines: the lines sharing a bundleKey. unitPrice(slug) → catalog price.
  // Returns { ok, prices: { slug: price }, qtys } or { ok: false, reason }.
  function checkGroup(lines, bundle, unitPrice) {
    var name = (lines[0] && lines[0].bundleName) || 'A bundle';
    if (!bundle || !bundle.active) return { ok: false, reason: name + ' is no longer available. Remove it from your cart.' };
    var want = {}, have = {};
    (bundle.items || []).forEach(function (it) { want[it.slug] = (want[it.slug] || 0) + (Number(it.qty) || 1); });
    lines.forEach(function (l) { have[l.slug] = (have[l.slug] || 0) + (Number(l.qty) || 0); });
    var keys = Object.keys(want).concat(Object.keys(have));
    for (var i = 0; i < keys.length; i++) {
      if (want[keys[i]] !== have[keys[i]]) return { ok: false, reason: name + ' has changed since you added it. Remove it from your cart and add it again.' };
    }
    var prices = {};
    for (var s in want) {
      var p = unitPrice(s);
      if (!(p > 0)) return { ok: false, reason: name + ' includes an item that’s no longer in the catalog. Remove it from your cart.' };
      prices[s] = priceFor(p, bundle.discountPercent);
    }
    return { ok: true, prices: prices };
  }

  return { WARN_WORDS: WARN_WORDS, priceFor: priceFor, warnings: warnings, unitsFromCatalog: unitsFromCatalog, totals: totals, cartLines: cartLines, checkGroup: checkGroup };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Bundles;
