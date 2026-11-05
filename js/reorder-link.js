// reorder-link.js — "Scan to reorder" (the QR code on the packing slip).
// The link carries just the products and quantities, never the order or the
// customer:  reorder.html?i=r-3-30mg*2,bac-water-10ml*1,klow-blend~c*1
// (~c = a case of 10). Opening it on reorder.html (signed in) adds those items
// to the cart at today's prices (js/reorder.js) and goes to the cart.
var ReorderLink = (function () {
  var SITE = 'https://txbioresearch.com';

  // Order → reorder URL, or '' if nothing on it can be reordered.
  function url(order) {
    var qty = {};
    ((order && order.items) || []).forEach(function (it) {
      if (!it || it.giftCard || !(Number(it.qty) > 0)) return;
      var isCase = !!(it.caseOf || /-case$/.test(it.slug || ''));
      var unit = it.unitSlug || String(it.slug || '').replace(/-case$/, '');
      if (!/^[a-z0-9-]+$/.test(unit)) return;
      var key = unit + (isCase ? '~c' : '');
      qty[key] = (qty[key] || 0) + Number(it.qty);
    });
    var parts = Object.keys(qty).map(function (k) { return k + '*' + qty[k]; });
    return parts.length ? SITE + '/reorder.html?i=' + parts.join(',') : '';
  }

  // 'r-3-30mg*2,klow~c*1' → order-like items for Reorder.run().
  function parse(param) {
    return String(param || '').split(',').map(function (p) {
      var m = /^([a-z0-9-]+?)(~c)?\*(\d{1,3})$/.exec(p.trim());
      if (!m) return null;
      var unit = m[1], isCase = !!m[2], q = Math.min(500, Math.max(1, +m[3]));
      var info = describe(unit);
      return {
        slug: isCase ? unit + '-case' : unit, unitSlug: unit, qty: q, caseOf: isCase ? 10 : undefined,
        name: info.name, packSize: isCase ? info.pack.replace(/^1 vial/i, 'Case of 10 vials') : info.pack
      };
    }).filter(Boolean);
  }

  // Product name and pack text for a unit slug, from js/products.js.
  function describe(unit) {
    var list = window.PRODUCTS || [];
    var exact = list.find(function (p) { return p.slug === unit; });
    if (exact) return { name: exact.name, pack: exact.packSize };
    var best = null;
    list.forEach(function (p) { if (unit.indexOf(p.slug + '-') === 0 && (!best || p.slug.length > best.slug.length)) best = p; });
    if (!best) return { name: unit, pack: '' };
    return { name: best.name, pack: '1 vial x ' + unit.slice(best.slug.length + 1) };
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // reorder.html
  function runPage() {
    var out = document.getElementById('ro-result');
    if (!out) return;
    document.addEventListener('userReady', function () {
      var items = parse(new URLSearchParams(location.search).get('i'));
      var lead = document.getElementById('ro-lead');
      if (!items.length) {
        lead.textContent = 'This reorder link is empty or incomplete.';
        out.innerHTML = '<a href="orders.html" class="btn">See my orders</a>';
        return;
      }
      Reorder.run({ items: items }).then(function (r) {
        if (r.added.length && !r.skipped.length) {
          lead.textContent = 'Done. Taking you to your cart…';
          setTimeout(function () { location.replace('cart.html'); }, 700);
          return;
        }
        lead.textContent = r.added.length ? 'Added to your cart at today’s prices.' : 'None of these items can be reordered right now.';
        out.innerHTML = (r.added.length ? '<ul>' + r.added.map(function (a) { return '<li>' + esc(a.name) + ' ' + esc(a.packSize) + ' × ' + a.qty + '</li>'; }).join('') + '</ul>' : '') +
          (r.skipped.length ? '<p>Not added:</p><ul>' + r.skipped.map(function (s) { return '<li>' + esc(s.name) + ' ' + esc(s.packSize) + ': ' + esc(s.reason) + '</li>'; }).join('') + '</ul>' : '') +
          '<a href="' + (r.added.length ? 'cart.html' : 'services.html') + '" class="btn">' + (r.added.length ? 'Go to my cart' : 'Browse products') + '</a>';
      }).catch(function (err) {
        lead.textContent = 'Something went wrong adding these to your cart.';
        out.innerHTML = '<p>' + esc(err.message) + '</p><a href="orders.html" class="btn">See my orders</a>';
      });
    });
  }
  if (typeof document !== 'undefined') runPage();

  return { url: url, parse: parse };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ReorderLink;
