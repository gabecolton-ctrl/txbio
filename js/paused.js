// paused.js — products that are temporarily not for sale. One list, used by
// the product pages, cart, checkout, reorder links, admin New order, the
// server catalog (tools/build-catalog.js) and the sitemap (tools/build-seo.py).
// To bring a product back, take its slug out of PAUSED and republish.
//
// Nothing is paused right now. (GLP-1 / incretin products were paused
// 2026-11-05 and put back the same day; the list was: 'r-3',
// 'retatrutide-20mg-tirzepatide-40mg', 'retatrutide-5mg-cagrilintide-5mg',
// 'semaglutide', 'tirzepatide', 'cagrilintide', 'cagrisema-2-5mg-2-5mg',
// 'cagrisema-5mg-5mg'.)
var PAUSED_PRODUCTS = [];

// True for a paused product's slug, its dose slugs (r-3-30mg) and case slugs.
function isPausedProduct(slug) {
  var s = String(slug || '').toLowerCase().replace(/-case$/, '');
  for (var i = 0; i < PAUSED_PRODUCTS.length; i++) {
    var p = PAUSED_PRODUCTS[i];
    if (s === p || s.indexOf(p + '-') === 0) {
      // 'semax-…' must not match 'semaglutide'; dose slugs end in a size.
      if (s === p || /^-\d/.test(s.slice(p.length)) || /^-(case|kit)/.test(s.slice(p.length))) return true;
    }
  }
  return false;
}
var PAUSED_MESSAGE = 'This product is temporarily unavailable.';

if (typeof module !== 'undefined' && module.exports) module.exports = { PAUSED_PRODUCTS: PAUSED_PRODUCTS, isPausedProduct: isPausedProduct, PAUSED_MESSAGE: PAUSED_MESSAGE };

// Product page for a paused product: no buying controls, a notice instead.
(function () {
  if (typeof document === 'undefined') return;
  var m = location.pathname.match(/\/products\/([^/]+)\.html$/);
  if (!m || PAUSED_PRODUCTS.indexOf(m[1]) === -1) return;
  function apply() {
    var btn = document.getElementById('add-to-cart-btn');
    if (!btn) return;
    if (document.querySelector('.paused-note')) { btn.disabled = true; btn.textContent = 'Temporarily unavailable'; return; }
    var box = btn.closest('.product-purchase, .purchase-box, form, .product-actions') || btn.parentNode;
    ['dose-select', 'qty-input', 'case-toggle', 'buy-mode'].forEach(function (id) { var el = document.getElementById(id); if (el) el.disabled = true; });
    btn.disabled = true;
    btn.textContent = 'Temporarily unavailable';
    var note = document.createElement('p');
    note.className = 'paused-note';
    note.textContent = PAUSED_MESSAGE + ' Browse the catalog for other research compounds.';
    btn.parentNode.insertBefore(note, btn.nextSibling);
    document.querySelectorAll('.case-pricing, #case-box, .bogo-note, .ship-cutoff, .pairings').forEach(function (el) { el.style.display = 'none'; });
    box.classList.add('is-paused');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  // Some pages re-enable the button after loading prices; keep it off.
  setTimeout(apply, 1500);
})();
