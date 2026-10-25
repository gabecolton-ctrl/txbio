// reorder.js — "Reorder" on a past order (account.html). Adds the order's
// items back to the cart at today's prices, read from the same places the
// product pages use: js/products.js for single-price products and each
// product page's DOSE_PRICES for products with a dosage dropdown. Cases are
// re-priced with CasePricing. Products no longer sold are skipped and listed.
var Reorder = (function () {
  var pageCache = {};

  function productFor(unitSlug) {
    var exact = PRODUCTS.find(function (p) { return p.slug === unitSlug; });
    if (exact) return { product: exact, dose: null };
    var best = null;
    PRODUCTS.forEach(function (p) {
      if (unitSlug.indexOf(p.slug + '-') === 0 && (!best || p.slug.length > best.slug.length)) best = p;
    });
    if (!best) return null;
    var m = unitSlug.slice(best.slug.length + 1).match(/^([\d.]+)(mg|iu|ml)$/);
    return m ? { product: best, dose: m[1] } : null;
  }

  function dosePrices(slug) {
    if (!pageCache[slug]) {
      pageCache[slug] = fetch('products/' + slug + '.html', { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('missing');
        return r.text();
      }).then(function (html) {
        var m = html.match(/var DOSE_PRICES = (\{[^}]*\});/);
        return m ? JSON.parse(m[1]) : {};
      });
    }
    return pageCache[slug];
  }

  // Resolves to the cart product for one order line, or a reason it can't be reordered.
  function currentLine(item) {
    var isCase = !!(item.caseOf || /-case$/.test(item.slug || ''));
    var unitSlug = item.unitSlug || String(item.slug || '').replace(/-case$/, '');
    var found = productFor(unitSlug);
    if (!found) return Promise.resolve({ skip: 'no longer in the catalog' });
    var price = found.dose === null
      ? Promise.resolve(found.product.price)
      : dosePrices(found.product.slug).then(function (prices) { return prices[found.dose]; }, function () { return null; });
    return price.then(function (unit) {
      if (!(unit > 0)) return { skip: 'that size is no longer offered' };
      if (!isCase) {
        return { product: { slug: unitSlug, name: item.name, packSize: item.packSize, price: unit } };
      }
      if (!CasePricing.isEligible(found.product.slug)) return { skip: 'no longer sold by the case' };
      return {
        product: {
          slug: unitSlug + '-case', name: item.name, packSize: item.packSize,
          price: CasePricing.casePrice(unit), caseOf: CasePricing.CASE_SIZE, unitSlug: unitSlug
        }
      };
    });
  }

  // Returns { added: [{name, packSize, qty, oldPrice, price}], skipped: [{name, packSize, reason}] }.
  function run(order) {
    var items = (order && order.items) || [];
    return Promise.all(items.map(currentLine)).then(function (lines) {
      var result = { added: [], skipped: [] };
      // Add sequentially so cart transactions don't collide.
      return lines.reduce(function (chain, line, i) {
        var item = items[i];
        if (line.skip) {
          result.skipped.push({ name: item.name, packSize: item.packSize, reason: line.skip });
          return chain;
        }
        return chain.then(function () {
          return Cart.addItem(line.product, Number(item.qty) || 1).then(function () {
            result.added.push({ name: item.name, packSize: item.packSize, qty: item.qty, oldPrice: item.price, price: line.product.price });
          });
        });
      }, Promise.resolve()).then(function () { return result; });
    });
  }

  return { run: run, currentLine: currentLine };
})();
