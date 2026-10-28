// pairings.js — "Pairs well with" on product pages and "You might also need"
// in the cart. Hand-picked related products (PAIRS below), plus the right
// diluent for powder products. Each suggestion shows the smallest size with
// an Add button; family accounts see their price; sold-out sizes are skipped.
var Pairings = (function () {
  // Product slug -> related product slugs, best first. Edit freely; unknown
  // slugs are ignored.
  var PAIRS = {
    'bpc-157': ['tb500-thymosin-beta-4', 'kpv', 'ghk-cu'],
    'tb500-thymosin-beta-4': ['bpc-157', 'bpc-5mg-tb5mg', 'ghk-cu'],
    'bpc-5mg-tb5mg': ['ghk-cu', 'kpv', 'bpc-10mg-tb10mg'],
    'bpc-10mg-tb10mg': ['ghk-cu', 'kpv', 'bpc-15mg-tb15mg'],
    'bpc-15mg-tb15mg': ['ghk-cu', 'kpv'],
    'ghk-cu': ['glow-blend', 'ahk-cu', 'bpc-157'],
    'ahk-cu': ['ghk-cu', 'glow-blend'],
    'glow-blend': ['klow-blend', 'ghk-cu'],
    'klow-blend': ['glow-blend', 'kpv'],
    'kpv': ['bpc-157', 'klow-blend', 'll37'],
    'cjc-1295-without-dac': ['ipamorelin', 'cjc-1295-without-dac-5mg-ipa-5mg'],
    'cjc-1295-without-dac-5mg-ipa-5mg': ['ipamorelin', 'cjc-1295-without-dac'],
    'cjc1295-with-dac': ['ipamorelin', 'cjc-1295-without-dac'],
    'ipamorelin': ['cjc-1295-without-dac', 'sermorelin-acetate', 'tesamorelin'],
    'sermorelin-acetate': ['ipamorelin', 'tesamorelin'],
    'tesamorelin': ['ipamorelin', 'cjc-1295-without-dac'],
    'semaglutide': ['cagrilintide', 'cagrisema-5mg-5mg'],
    'cagrilintide': ['semaglutide', 'r-3', 'retatrutide-5mg-cagrilintide-5mg'],
    'cagrisema-2-5mg-2-5mg': ['semaglutide', 'cagrilintide'],
    'cagrisema-5mg-5mg': ['semaglutide', 'cagrilintide'],
    'tirzepatide': ['retatrutide-20mg-tirzepatide-40mg', 'cagrilintide'],
    'r-3': ['retatrutide-5mg-cagrilintide-5mg', 'cagrilintide', 'tirzepatide'],
    'retatrutide-5mg-cagrilintide-5mg': ['r-3', 'cagrilintide'],
    'retatrutide-20mg-tirzepatide-40mg': ['tirzepatide', 'r-3'],
    'semax': ['selank', 'semax-10mg-selank-10mg'],
    'selank': ['semax', 'semax-10mg-selank-10mg'],
    'semax-10mg-selank-10mg': ['semax', 'selank', 'dihexa'],
    'dihexa': ['semax', 'cerebrolysin'],
    'cerebrolysin': ['semax', 'dihexa'],
    'mots-c-human': ['ss-31', 'humanin', 'nad-plus'],
    'ss-31': ['mots-c-human', 'nad-plus'],
    'humanin': ['mots-c-human', 'ss-31'],
    'nad-plus': ['mots-c-human', '5-amino-1mq', 'glutathione'],
    '5-amino-1mq': ['nad-plus', 'mots-c-human'],
    'glutathione': ['nad-plus'],
    'epithalon': ['pinealon', 'thymalin-thymulin'],
    'pinealon': ['epithalon', 'cartalax'],
    'cartalax': ['epithalon', 'pinealon'],
    'thymalin-thymulin': ['thymosin-alpha-1', 'epithalon'],
    'thymosin-alpha-1': ['thymalin-thymulin', 'll37'],
    'll37': ['thymosin-alpha-1', 'kpv'],
    'vip': ['kpv', 'thymosin-alpha-1'],
    'dsip': ['epithalon', 'pinealon'],
    'melanotan-i': ['melanotan-ii'],
    'melanotan-ii': ['melanotan-i', 'pt141'],
    'pt141': ['kisspeptin-10', 'oxytocin', 'melanotan-ii'],
    'kisspeptin-10': ['oxytocin', 'pt141'],
    'oxytocin': ['kisspeptin-10', 'pt141'],
    'aod9604': ['5-amino-1mq', 'mots-c-human'],
    'b12': ['lipo-c-with-b12', 'l-carnitine-600mg'],
    'lipo-c': ['l-carnitine-600mg', 'b12'],
    'lipo-c-with-b12': ['l-carnitine-600mg'],
    'lipo-c-fatblaster': ['l-carnitine-600mg'],
    'l-carnitine-600mg': ['lipo-c-with-b12', 'b12']
  };
  // Diluent for powders; IGF-1 LR3 is usually reconstituted in acetic acid.
  var WATER = { 'igf-1-lr3': 'acetic-acid-water' };
  var DEFAULT_WATER = 'bac-water';
  var WATER_DOSE = { 'bac-water': 'bac-water-10ml' };
  var LIQUID = /\d\s*ml\b/i;

  var catalog = null, stock = {}, base = /\/products\//.test(location.pathname) ? '../' : '';
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return window.FamilyPricing ? FamilyPricing.money(n) : '$' + n; }
  function isWater(slug) { return /^(bac-water|sterile-water|acetic-acid-water)/.test(slug); }

  function loadCatalog() {
    if (catalog) return Promise.resolve(catalog);
    return fetch(base + 'functions/catalog.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
      .then(function (c) { catalog = c.products; return catalog; });
  }
  function loadStock() {
    var u = window.firebase && firebase.auth && firebase.apps.length && firebase.auth().currentUser;
    if (!u) return Promise.resolve();
    return firebase.firestore().collection('inventory').get().then(function (snap) {
      snap.forEach(function (d) { if (typeof d.data().qty === 'number') stock[d.id] = d.data().qty; });
    }).catch(function () {});
  }

  // A cart-ready line for a product: the preferred or smallest in-stock size.
  function lineFor(slug) {
    var p = catalog[slug];
    if (!p) return null;
    if (p.doses) {
      var keys = Object.keys(p.doses);
      var pref = WATER_DOSE[slug];
      if (pref && keys.indexOf(pref) !== -1) keys = [pref].concat(keys.filter(function (k) { return k !== pref; }));
      for (var i = 0; i < keys.length; i++) {
        var d = p.doses[keys[i]];
        if (typeof stock[keys[i]] === 'number' && stock[keys[i]] <= 0) continue;
        return { slug: keys[i], productSlug: slug, name: p.name, packSize: d.packSize || ('1 vial x ' + d.label), price: d.price, label: d.label };
      }
      return null;
    }
    if (typeof stock[slug] === 'number' && stock[slug] <= 0) return null;
    return { slug: slug, productSlug: slug, name: p.name, packSize: p.packSize, price: p.price, label: (p.packSize.match(/x\s*(.+)$/) || [])[1] || '' };
  }
  function isPowder(slug) { var p = catalog[slug]; return p && !isWater(slug) && !LIQUID.test(p.packSize + ' ' + Object.keys(p.doses || {}).join(' ')); }

  // Suggestions for a set of product slugs, skipping what's already there.
  function suggest(slugs, exclude, max) {
    var out = [], seen = {};
    exclude.concat(slugs).forEach(function (s) { seen[s] = true; });
    var powders = slugs.filter(isPowder);
    if (powders.length) {
      var water = WATER[powders[0]] || DEFAULT_WATER;
      if (!seen[water]) { seen[water] = true; out.push({ slug: water, why: 'For reconstitution' }); }
    }
    slugs.forEach(function (s) {
      (PAIRS[s] || []).forEach(function (r) { if (!seen[r] && catalog[r]) { seen[r] = true; out.push({ slug: r, why: '' }); } });
    });
    return out.map(function (x) { var l = lineFor(x.slug); if (l) l.why = x.why; return l; }).filter(Boolean).slice(0, max || 3);
  }

  function card(l) {
    var price = window.FamilyPricing && FamilyPricing.active() ? FamilyPricing.price(l.slug, l.price) : l.price;
    return '<div class="pair-card">' +
      '<a class="pair-name" href="' + base + 'products/' + esc(l.productSlug) + '.html">' + esc(l.name) + '</a>' +
      '<span class="pair-meta">' + esc(l.label) + (l.why ? ' · ' + esc(l.why) : '') + '</span>' +
      '<div class="pair-buy"><span class="pair-price">' + money(price) + '</span>' +
      '<button type="button" class="btn-outline-light pair-add" data-slug="' + esc(l.slug) + '">Add</button></div></div>';
  }

  function wire(el, lines) {
    el.querySelectorAll('.pair-add').forEach(function (b) {
      b.addEventListener('click', function () {
        var l = lines.filter(function (x) { return x.slug === b.getAttribute('data-slug'); })[0];
        if (!l || !window.Cart) return;
        b.disabled = true; b.textContent = 'Adding…';
        Cart.addItem({ slug: l.slug, name: l.name, packSize: l.packSize, price: l.price }, 1).then(function () {
          b.textContent = 'Added ✓'; b.classList.add('is-done');
          document.dispatchEvent(new CustomEvent('cartChanged'));
          return Cart.getItemCount();
        }).then(function (count) {
          var badge = document.getElementById('floating-cart-badge');
          if (badge && typeof count === 'number') { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
        }).catch(function (err) {
          b.disabled = false; b.textContent = 'Add';
          alert('Could not add: ' + (err.message || err));
        });
      });
    });
  }

  function render(el, title, lines) {
    if (!lines.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.innerHTML = '<h2>' + title + '</h2><div class="pair-grid">' + lines.map(card).join('') + '</div>';
    el.hidden = false;
    wire(el, lines);
  }

  // ---------- Product page ----------
  function productPage() {
    if (!window.THIS_PRODUCT) return;
    var el = document.createElement('section');
    el.className = 'pairs'; el.id = 'pairs'; el.hidden = true;
    var notice = document.querySelector('main section.notice');
    if (!notice) return;
    notice.parentNode.insertBefore(el, notice);
    var draw = function () { render(el, 'Pairs well with', suggest([THIS_PRODUCT.slug], [], 3)); };
    var started = false;
    function start() {
      if (started) return; started = true;
      Promise.all([loadCatalog(), loadStock()]).then(draw).catch(function () {});
    }
    document.addEventListener('userReady', start);
    document.addEventListener('guestReady', start);
    document.addEventListener('familyPricingReady', function () { if (catalog) draw(); });
    setTimeout(start, 2500);
  }

  // ---------- Cart page ----------
  function cartPage() {
    var host = document.getElementById('cart-content');
    if (!host) return;
    var el = document.createElement('section');
    el.className = 'pairs pairs-cart'; el.id = 'pairs-cart'; el.hidden = true;
    host.parentNode.insertBefore(el, host.nextSibling);
    document.addEventListener('cartRendered', function (e) {
      var items = (e.detail || []);
      if (!items.length) { el.hidden = true; return; }
      Promise.all([loadCatalog(), loadStock()]).then(function () {
        var inCart = {};
        items.forEach(function (i) {
          var unit = String(i.unitSlug || i.slug).replace(/-case$/, '');
          Object.keys(catalog).forEach(function (ps) {
            var p = catalog[ps];
            if (ps === unit || (p.doses && p.doses[unit])) inCart[ps] = true;
          });
        });
        var slugs = Object.keys(inCart);
        render(el, 'You might also need', suggest(slugs, [], 3));
      });
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () { productPage(); cartPage(); });
  }
  return { PAIRS: PAIRS, suggest: suggest };
})();
