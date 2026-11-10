// price-book.js — prices the admin sets on Admin → Pricing, applied everywhere.
// Shared by the browser and the server checkout (copied to functions/ by
// tools/build-catalog.js).
//
// Firestore settings/pricing (admin writes, signed-in reads):
//   prices:   { '<sellable slug>': dollars }   e.g. 'bpc-157-5mg': 32, 'ahk-cu': 40
//             Only changed prices are stored; everything else keeps the price
//             in the site's product files (functions/catalog.json).
//   shipping: { options: [{ id, label, price, enabled }], freeMin, freeOption, platinumOption }
//             freeOption: the option that's free at freeMin+ ('' = no free shipping).
//             platinumOption: the option picked for Platinum members (always free for them).
//   budget:   { percentOff, prices: { '<sellable slug>': dollars } }
//             The budget store (js/sites.js) sells at the TXBio price minus
//             percentOff, rounded to whole dollars, unless a budget price is set.
//   updatedAt, updatedBy
//
// In the browser it also:
//   - reprices cart lines (Cart.getCart) and new adds (Cart.addItem) to today's
//     price; quotes, gift cards and panels keep their own price
//   - applies changed prices to anything that reads functions/catalog.json
//   - updates the prices shown on product pages and catalog cards
//   - tells FreeShipping (js/free-shipping.js) the free-shipping settings
var PriceBook = (function () {
  var DEFAULT_SHIPPING = {
    options: [
      { id: 'std', label: '3–5 Business Days', price: 20, enabled: true },
      { id: '3day', label: '3 Business Days', price: 25, enabled: true },
      { id: '2day', label: '2nd Day', price: 40, enabled: true }
    ],
    freeMin: 250,
    freeOption: 'std',
    platinumOption: '2day'
  };

  function round2(n) { return Math.round(Number(n) * 100) / 100; }
  function money(n) {
    n = Number(n) || 0;
    return '$' + (n % 1 ? n.toFixed(2) : String(n));
  }
  function validPrice(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v < 100000; }

  // settings/pricing → { options, freeMin, freeOption, platinumOption }, with defaults.
  function shippingOf(settings) {
    var s = (settings && settings.shipping) || {};
    var options = Array.isArray(s.options) && s.options.length
      ? s.options.filter(function (o) { return o && o.id && o.label && validPrice(Number(o.price)); })
          .map(function (o) { return { id: String(o.id), label: String(o.label), price: round2(o.price), enabled: o.enabled !== false }; })
      : DEFAULT_SHIPPING.options.map(function (o) { return Object.assign({}, o); });
    if (!options.some(function (o) { return o.enabled; })) options = DEFAULT_SHIPPING.options.map(function (o) { return Object.assign({}, o); });
    var ids = options.filter(function (o) { return o.enabled; }).map(function (o) { return o.id; });
    var freeMin = validPrice(Number(s.freeMin)) && s.freeMin !== '' && s.freeMin != null ? Number(s.freeMin) : DEFAULT_SHIPPING.freeMin;
    var freeOption = s.freeOption === '' ? '' : (ids.indexOf(s.freeOption) !== -1 ? s.freeOption : (s.freeOption == null && ids.indexOf(DEFAULT_SHIPPING.freeOption) !== -1 ? DEFAULT_SHIPPING.freeOption : ''));
    var platinumOption = ids.indexOf(s.platinumOption) !== -1 ? s.platinumOption : (ids.indexOf(DEFAULT_SHIPPING.platinumOption) !== -1 ? DEFAULT_SHIPPING.platinumOption : ids[ids.length - 1]);
    return { options: options, freeMin: freeMin, freeOption: freeOption, platinumOption: platinumOption };
  }
  function activeOptions(settings) { return shippingOf(settings).options.filter(function (o) { return o.enabled; }); }
  function optionLabel(o) { return o.label + ' — ' + money(o.price); }
  function optionById(settings, id) {
    return activeOptions(settings).filter(function (o) { return o.id === String(id); })[0] || null;
  }
  // For FreeShipping.priceFor / configure.
  function freeShippingConfig(settings) {
    var s = shippingOf(settings);
    return { min: s.freeMin, option: s.freeOption, platinumOption: s.platinumOption };
  }

  function overrideOf(settings, slug) {
    var p = settings && settings.prices && settings.prices[slug];
    return validPrice(p) ? round2(p) : undefined;
  }

  var DEFAULT_BUDGET_PERCENT = 30;
  function budgetPercent(settings) {
    var b = settings && settings.budget;
    var pct = b && Number(b.percentOff);
    return b && b.percentOff !== '' && b.percentOff != null && isFinite(pct) && pct >= 0 && pct < 100 ? pct : DEFAULT_BUDGET_PERCENT;
  }
  function budgetOverrideOf(settings, slug) {
    var p = settings && settings.budget && settings.budget.prices && settings.budget.prices[slug];
    return validPrice(p) ? round2(p) : undefined;
  }
  // Price of a sellable slug on a store, given its catalog price.
  function priceOf(settings, slug, base, site) {
    var o = overrideOf(settings, slug);
    var main = o !== undefined ? o : base;
    if (site !== 'budget' || main == null) return main;
    var bo = budgetOverrideOf(settings, slug);
    if (bo !== undefined) return bo;
    return Math.max(1, Math.round(main * (1 - budgetPercent(settings) / 100)));
  }

  // A copy of the server catalog (functions/catalog.json) with the admin's
  // prices and shipping options in it.
  function applyToCatalog(catalog, settings, site) {
    var out = JSON.parse(JSON.stringify(catalog));
    Object.keys(out.products || {}).forEach(function (slug) {
      var p = out.products[slug];
      if (p.doses) {
        Object.keys(p.doses).forEach(function (ds) { p.doses[ds].price = priceOf(settings, ds, p.doses[ds].price, site); });
        var all = Object.keys(p.doses).map(function (ds) { return p.doses[ds].price; });
        if (all.length) p.price = Math.min.apply(null, all);
      } else {
        p.price = priceOf(settings, slug, p.price, site);
      }
    });
    out.shipping = {};
    activeOptions(settings).forEach(function (o) { out.shipping[o.id] = { price: o.price, label: optionLabel(o) }; });
    return out;
  }

  var api = {
    DEFAULT_SHIPPING: DEFAULT_SHIPPING, shippingOf: shippingOf, activeOptions: activeOptions, optionLabel: optionLabel,
    optionById: optionById, freeShippingConfig: freeShippingConfig, overrideOf: overrideOf, applyToCatalog: applyToCatalog, money: money,
    priceOf: priceOf, budgetPercent: budgetPercent, budgetOverrideOf: budgetOverrideOf, DEFAULT_BUDGET_PERCENT: DEFAULT_BUDGET_PERCENT
  };
  if (typeof window === 'undefined' || typeof document === 'undefined') return api;

  // ---------------- Browser ----------------
  var CACHE = 'txbio_pricebook';
  var settings = null;
  try { settings = JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch (e) { settings = null; }
  var root = /\/products\//.test(location.pathname) ? '../' : '';
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  function site() { return window.Sites ? Sites.current() : 'main'; }

  function configureFreeShipping() {
    if (window.FreeShipping && FreeShipping.configure) FreeShipping.configure(freeShippingConfig(settings));
  }
  configureFreeShipping();

  // Fresh settings from Firestore (falls back to the cached copy after 4s).
  var ready = new Promise(function (resolve) {
    var done = false;
    var finish = function () { if (!done) { done = true; resolve(settings); } };
    setTimeout(finish, 4000);
    function load() {
      if (!window.firebase || !firebase.firestore || !firebase.auth) return finish();
      try { if (!firebase.apps.length && typeof firebaseConfig !== 'undefined') firebase.initializeApp(firebaseConfig); } catch (e) { return finish(); }
      var tried = false;
      var unsub = firebase.auth().onAuthStateChanged(function (user) {
        if (tried) return;
        if (!user) { setTimeout(function () { if (!tried && !firebase.auth().currentUser) { tried = true; finish(); } }, 1500); return; }
        tried = true;
        if (typeof unsub === 'function') unsub();
        firebase.firestore().collection('settings').doc('pricing').get().then(function (d) {
          var fresh = d.exists ? d.data() : {};
          var changed = JSON.stringify(fresh) !== JSON.stringify(settings);
          settings = fresh;
          try { localStorage.setItem(CACHE, JSON.stringify(fresh)); } catch (e) {}
          configureFreeShipping();
          finish();
          if (changed) document.dispatchEvent(new CustomEvent('pricebook', { detail: settings }));
        }).catch(finish);
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
  });

  // Default prices (no overrides) from the server catalog.
  var defaultsPromise = null;
  function defaults() {
    if (!defaultsPromise) {
      defaultsPromise = realFetch
        ? realFetch(root + 'functions/catalog.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).catch(function () { return null; })
        : Promise.resolve(null);
    }
    return defaultsPromise;
  }
  // Default price of a sellable slug from the catalog, or undefined.
  function defaultPrice(cat, slug) {
    if (!cat || !cat.products) return undefined;
    if (cat.products[slug] && !cat.products[slug].doses) return cat.products[slug].price;
    for (var k in cat.products) {
      var d = cat.products[k].doses;
      if (d && d[slug]) return d[slug].price;
    }
    return undefined;
  }
  function caseEligible(cat, unitSlug) {
    if (!cat || !cat.products) return true;
    if (cat.products[unitSlug]) return cat.products[unitSlug].caseEligible !== false;
    for (var k in cat.products) if (cat.products[k].doses && cat.products[k].doses[unitSlug]) return cat.products[k].caseEligible !== false;
    return true;
  }
  function keepsOwnPrice(item) { return !item || item.quoteId || item.giftCard || item.giftId || item.bundleKey; }

  // Today's price for a cart line (or a product being added), given the defaults.
  function linePrice(item, cat) {
    if (keepsOwnPrice(item)) return item.price;
    var isCase = !!(item.caseOf || /-case$/.test(item.slug || ''));
    var unit = isCase ? (item.unitSlug || String(item.slug).replace(/-case$/, '')) : item.slug;
    var base = defaultPrice(cat, unit);
    if (base === undefined && overrideOf(settings, unit) === undefined) return item.price; // not in the catalog: leave it alone
    var p = priceOf(settings, unit, base, site());
    if (!isCase) return p;
    var size = Number(item.caseOf) || (cat && cat.caseSize) || 10;
    var free = caseEligible(cat, unit) ? ((cat && cat.freeVials != null) ? cat.freeVials : 3) : 0;
    return round2(p * (size - free));
  }

  // Anything that reads functions/catalog.json gets the admin's prices.
  if (realFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!/functions\/catalog\.json(\?|$)/.test(url)) return realFetch(input, init);
      return Promise.all([realFetch(input, init).then(function (r) { return r.json(); }), ready]).then(function (r) {
        return new Response(JSON.stringify(applyToCatalog(r[0], settings, site())), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });
    };
  }

  // Cart: reprice lines when read, and set the price on new adds.
  function hookCart() {
    if (!window.Cart || Cart.__priceBook) return;
    Cart.__priceBook = true;
    var getCart = Cart.getCart, addItem = Cart.addItem;
    Cart.getCart = function () {
      return Promise.all([getCart.apply(Cart, arguments), ready, defaults()]).then(function (r) {
        return (r[0] || []).map(function (item) {
          var p = linePrice(item, r[2]);
          return p === item.price ? item : Object.assign({}, item, { price: p });
        });
      });
    };
    Cart.addItem = function (product) {
      var args = arguments;
      return Promise.all([ready, defaults()]).then(function (r) {
        if (product && !keepsOwnPrice(product)) product.price = linePrice(product, r[1]);
        return addItem.apply(Cart, args);
      });
    };
  }
  hookCart();

  // ---------- Showing prices ----------
  // Product page: dose dropdown, DOSE_PRICES, the price shown, case pricing.
  function paintProductPage(cat) {
    var thisSlug = window.THIS_PRODUCT && THIS_PRODUCT.slug;
    var prod = thisSlug && cat && cat.products && cat.products[thisSlug];
    if (!prod) return;
    var fam = document.documentElement.classList.contains('family-pricing');
    var sel = document.getElementById('dose-select');
    var changed = false;
    if (window.DOSE_PRICES && sel && prod.doses) {
      Array.prototype.forEach.call(sel.options, function (opt) {
        var prefix = thisSlug + '-' + opt.value;
        var key = Object.keys(prod.doses).filter(function (k) { return k.indexOf(prefix) === 0 && /^[a-z]+$/i.test(k.slice(prefix.length)); })[0];
        if (!key) return;
        var want = priceOf(settings, key, prod.doses[key].price, site());
        if (DOSE_PRICES[opt.value] !== want) {
          DOSE_PRICES[opt.value] = want;
          opt.textContent = opt.textContent.replace(/\$[\d,.]+/, money(want));
          changed = true;
        }
      });
      if (changed) {
        if (window.CasePricing && CasePricing.refresh) CasePricing.refresh();
        if (!fam) sel.dispatchEvent(new Event('change'));
      }
    } else if (!window.DOSE_PRICES) {
      var want2 = priceOf(settings, thisSlug, prod.price, site());
      var p = window.PRODUCTS && PRODUCTS.find(function (x) { return x.slug === thisSlug; });
      if (p && p.price !== want2) {
        p.price = want2;
        if (window.CasePricing && CasePricing.refresh) CasePricing.refresh();
      }
      var el = document.querySelector('.product-info .product-price');
      if (el && !fam && !(window.CasePricing && CasePricing.isEligible && CasePricing.isEligible(thisSlug)) && el.textContent.trim() !== money(want2)) el.textContent = money(want2);
    }
  }

  // Catalog cards: "From $X" (family cards keep theirs).
  function paintCards(cat) {
    var cards = document.querySelectorAll('.product-card');
    if (!cards.length || !cat) return;
    var priced = applyToCatalog(cat, settings, site());
    cards.forEach(function (card) {
      var a = card.querySelector('a.product-card-link') || card.querySelector('a[href*="products/"]');
      var m = a && String(a.getAttribute('href')).match(/products\/([^/?#]+)\.html/);
      var p = m && priced.products[m[1]];
      var el = card.querySelector('.product-card-price');
      if (!p || !el || el.classList.contains('family-price')) return;
      var prices = p.doses ? Object.keys(p.doses).map(function (k) { return p.doses[k].price; }) : [p.price];
      var text = (prices.length > 1 ? 'From ' : '') + money(Math.min.apply(null, prices));
      if (el.textContent.trim() !== text) el.textContent = text;
    });
  }

  function paint() {
    // After every page's own DOMContentLoaded setup (case pricing, dose dropdown).
    setTimeout(function () {
      configureFreeShipping(); hookCart();
      Promise.all([ready, defaults()]).then(function (r) { paintProductPage(r[1]); paintCards(r[1]); document.documentElement.classList.add('prices-ready'); });
    }, 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint); else paint();
  document.addEventListener('pricebook', paint);

  // "3–5 Business Days" for the option that goes free, or ''.
  api.freeOptionName = function () {
    var sh = shippingOf(settings);
    var o = sh.options.filter(function (x) { return x.id === sh.freeOption; })[0];
    return o ? o.label : '';
  };
  api.ready = function () { return ready; };
  api.current = function () { return settings; };
  api.shipping = function () { return shippingOf(settings); };
  api.defaults = defaults;
  api.linePrice = function (item) { return defaults().then(function (cat) { return linePrice(item, cat); }); };
  return api;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PriceBook;
