// stock-notice.js — before an out-of-stock item goes in the cart, a pop-up
// says it's out of stock and when it will ship, and the buyer confirms.
// Wraps Cart.addItem on the pages that load this file (product pages,
// favorites), so every "Add to cart" button there gets it.
//
// Stock comes from inventory/{unitSlug}.qty (Admin → Inventory). Products with
// no inventory record are treated as in stock. Units already in the cart count.
(function () {
  var SHIP_TEXT = 'will ship within 5 business days';
  if (!window.Cart || !Cart.addItem || Cart.__stockNotice) return;
  var original = Cart.addItem;
  Cart.__stockNotice = true;

  function unitOf(p) { return p.unitSlug || String(p.slug || '').replace(/-case$/, ''); }
  function unitsOf(p, qty) { return (Number(qty) || 0) * (Number(p.caseOf) || 1); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // Resolves to { onHand, wanted } or null when stock isn't tracked / can't be read.
  function check(product, qty) {
    if (!window.firebase || !firebase.firestore) return Promise.resolve(null);
    var unit = unitOf(product);
    return Promise.all([
      firebase.firestore().collection('inventory').doc(unit).get(),
      Cart.getCart().catch(function () { return []; })
    ]).then(function (r) {
      var d = r[0].exists ? r[0].data() : null;
      if (!d || typeof d.qty !== 'number') return null;
      var inCart = (r[1] || []).reduce(function (n, it) { return unitOf(it) === unit ? n + unitsOf(it, it.qty) : n; }, 0);
      return { onHand: Math.max(0, d.qty), wanted: inCart + unitsOf(product, qty), inCart: inCart };
    }).catch(function () { return null; });
  }

  function ask(product, s) {
    return new Promise(function (resolve) {
      var name = esc(product.name) + (product.packSize ? ' <span class="sn-pack">' + esc(product.packSize) + '</span>' : '');
      var short = s.wanted - s.onHand;
      var body = s.onHand <= s.inCart
        ? '<p><strong>This item is out of stock</strong>, and ' + SHIP_TEXT + '.</p>'
        : '<p>Only <strong>' + (s.onHand - s.inCart) + '</strong> in stock right now. The other <strong>' + short + '</strong> ' + SHIP_TEXT + '.</p>';
      var wrap = document.createElement('div');
      wrap.className = 'sn-overlay';
      wrap.innerHTML = '<div class="sn-box" role="dialog" aria-modal="true" aria-labelledby="sn-title">' +
        '<h3 id="sn-title">' + name + '</h3>' + body +
        '<p class="sn-fine">You can still order it now. It ships as soon as it’s back in stock, and we’ll email tracking when it does.</p>' +
        '<div class="sn-actions"><button type="button" class="btn" data-sn="yes">Add to cart</button>' +
        '<button type="button" class="btn-outline-light" data-sn="no">Cancel</button></div></div>';
      var done = function (yes) { document.removeEventListener('keydown', onKey); wrap.remove(); resolve(yes); };
      var onKey = function (e) { if (e.key === 'Escape') done(false); };
      wrap.addEventListener('click', function (e) {
        var b = e.target.closest('[data-sn]');
        if (b) done(b.getAttribute('data-sn') === 'yes');
        else if (e.target === wrap) done(false);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(wrap);
      wrap.querySelector('[data-sn="yes"]').focus();
    });
  }

  // Cancelled: put the Add to cart button back; the add never resolves, so
  // no "Added to your cart" message appears.
  function resetButtons() {
    document.querySelectorAll('button').forEach(function (b) {
      if (!/^Adding/.test(b.textContent.trim())) return;
      b.disabled = false;
      b.textContent = b.classList.contains('pair-add') ? 'Add' : 'Add to cart';
    });
  }

  Cart.addItem = function (product, qty) {
    var args = arguments, self = this;
    return check(product, qty).then(function (s) {
      if (!s || s.wanted <= s.onHand) return original.apply(self, args);
      return ask(product, s).then(function (yes) {
        if (yes) return original.apply(self, args);
        resetButtons();
        return new Promise(function () {});
      });
    });
  };
})();
