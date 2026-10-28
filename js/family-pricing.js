// family-pricing.js — family accounts (listed on an at-cost code, see
// admin-at-cost.html) see their own price everywhere: cost + the code's
// per-vial add-on, never more than the regular price. Regular buyers see
// nothing different. Display only: the cart keeps regular prices and
// checkout prices the order at cost (js/at-cost.js), so the order is the
// same either way.
//
// Needs js/at-cost.js. Pages listen for the "familyPricingReady" event to
// redraw; FamilyPricing.active() says whether family pricing is on.

var FamilyPricing = (function () {
  var FLAG = 'txbio_family';
  var state = null;      // { code, markup, costs }
  var units = null;      // productSlug -> [{ slug, value, price }]
  var readyPromise = null;

  // Hide prices briefly on pages after the first, so family members don't
  // see regular prices flash before theirs load.
  try { if (sessionStorage.getItem(FLAG) === '1') document.documentElement.classList.add('family-pending'); } catch (e) {}

  function round2(n) { return Math.round(n * 100) / 100; }
  function money(n) {
    var cents = Math.round(n * 100) % 100 !== 0;
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
  }

  function active() { return !!state; }

  // Family price for one vial of unitSlug whose regular price is listPrice.
  function price(unitSlug, listPrice) {
    if (!state) return listPrice;
    if (state.percent) return round2(listPrice * (1 - state.percent / 100));
    var cost = state.costs[unitSlug];
    if (typeof cost !== 'number') return listPrice;
    return Math.min(listPrice, round2(cost + AtCost.markupFor(unitSlug, state.markup)));
  }

  // What a cart line costs a family member (cases = 10 vials at family price).
  function lineTotal(item) {
    if (!state) return round2(item.price * item.qty);
    if (state.percent) return round2(item.price * item.qty * (1 - state.percent / 100));
    return AtCost.priceLines([item], state.costs, state.markup).atCostTotal;
  }

  function loadState(user) {
    var db = firebase.firestore();
    return db.collection('atCostMembers').doc(String(user.email || '').toLowerCase()).get().then(function (doc) {
      var codes = doc.exists ? (doc.data().codes || []) : [];
      return codes.reduce(function (p, code) {
        return p.then(function (found) {
          if (found) return found;
          return db.collection('atCostCodes').doc(code).get().then(function (c) {
            var check = c.exists ? AtCost.checkCode(c.data(), code, user.email) : { valid: false };
            return check.valid ? check : null;
          }).catch(function () { return null; });
        });
      }, Promise.resolve(null));
    }).then(function (check) {
      if (!check) return rolePercent(db, user);
      // Costs (~100 docs) are remembered for 10 minutes in this tab so
      // browsing page to page doesn't re-read them all.
      var key = 'txbio_family_costs_' + user.uid, cached = null;
      try { cached = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) {}
      var label = check.label || 'Family pricing';
      if (cached && Date.now() - cached.at < 10 * 60 * 1000) return { code: check.code, markup: check.markupPerVial, costs: cached.costs, label: label };
      return db.collection('costs').get().then(function (snap) {
        var costs = {};
        snap.forEach(function (d) { if (typeof d.data().perVialCost === 'number') costs[d.id] = d.data().perVialCost; });
        try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), costs: costs })); } catch (e) {}
        return { code: check.code, markup: check.markupPerVial, costs: costs, label: label };
      });
    });
  }

  // Customer roles with percent-off pricing (Admin → Roles, e.g. Employee).
  function rolePercent(db, user) {
    return db.collection('roleMembers').doc(String(user.email || '').toLowerCase()).get().then(function (m) {
      var roles = m.exists ? (m.data().roles || []) : [];
      return roles.reduce(function (p, id) {
        return p.then(function (found) {
          if (found) return found;
          return db.collection('customerRoles').doc(id).get().then(function (r) {
            var role = r.exists ? r.data() : null;
            var pct = role && Number(role.percent);
            if (!role || role.type !== 'percent' || !(pct > 0 && pct <= 100) || !role.code) return null;
            return db.collection('promoCodes').doc(role.code).get().then(function (c) {
              // Only while the role's code is on (and not past its end date).
              var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
              if (!c.exists || !c.data().active || (c.data().endsOn && today > c.data().endsOn)) return null;
              return { code: role.code, percent: Number(c.data().discountPercent) || pct, label: (role.name || 'Member') + ' pricing' };
            });
          });
        });
      }, Promise.resolve(null));
    }).catch(function () { return null; });
  }

  function loadUnits() {
    var base = /\/products\//.test(location.pathname) ? '../' : '';
    return fetch(base + 'functions/catalog.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (cat) {
      units = {};
      Object.keys(cat.products).forEach(function (slug) {
        var p = cat.products[slug];
        units[slug] = p.doses
          ? Object.keys(p.doses).map(function (ds) { return { slug: ds, value: String(p.doses[ds].label).replace(/[a-z]+$/i, ''), price: p.doses[ds].price }; })
          : [{ slug: slug, value: '', price: p.price }];
      });
    });
  }

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise(function (resolve) {
      document.addEventListener('DOMContentLoaded', function () {
        if (!window.firebase || !window.AtCost || !firebase.firestore) return resolve(null);
        if (!firebase.apps.length && typeof firebaseConfig !== 'undefined') firebase.initializeApp(firebaseConfig); // const in firebase-config.js, not on window
        // Firebase can report "signed out" for a moment while it restores the
        // session (same as auth-guard.js), so a first empty answer isn't final.
        var done = false;
        function start(user) {
          if (done) return;
          done = true;
          if (!user) return resolve(null);
          loadState(user).then(function (s) {
            if (!s) return null;
            state = s;
            return loadUnits().catch(function () { units = {}; });
          }).catch(function () { state = null; }).then(function () { resolve(state); });
        }
        var waiting = false;
        firebase.auth().onAuthStateChanged(function (user) {
          if (user) return start(user);
          if (waiting) return start(null);
          waiting = true;
          setTimeout(function () { start(firebase.auth().currentUser); }, 1500);
        });
      });
    }).then(function (s) {
      try { sessionStorage.setItem(FLAG, s ? '1' : '0'); } catch (e) {}
      document.documentElement.classList.remove('family-pending');
      if (s) {
        document.documentElement.classList.add('family-pricing');
        decorateCatalog();
        decorateProductPage();
        document.dispatchEvent(new CustomEvent('familyPricingReady', { detail: s }));
      }
      return s;
    });
    return readyPromise;
  }

  // ---------- Catalog cards ----------
  function decorateCatalog() {
    document.querySelectorAll('.product-card').forEach(function (card) {
      var a = card.querySelector('a.product-card-link');
      var m = a && String(a.getAttribute('href')).match(/products\/([^/?#]+)\.html/);
      var list = m && units && units[m[1]];
      var priceEl = card.querySelector('.product-card-price');
      if (!list || !list.length || !priceEl) return;
      var prices = list.map(function (u) { return price(u.slug, u.price); });
      var low = Math.min.apply(null, prices);
      priceEl.textContent = (list.length > 1 ? 'From ' : '') + money(low);
      priceEl.classList.add('family-price');
    });
  }

  // ---------- Product page ----------
  function unitForDose(value) {
    var list = (units && window.THIS_PRODUCT && units[THIS_PRODUCT.slug]) || [];
    if (!value) return list[0] || null;
    return list.find(function (u) { return u.value === String(value); }) || null;
  }

  function currentSingle() {
    var sel = document.getElementById('dose-select');
    var u = unitForDose(sel ? sel.value : '');
    if (u) return price(u.slug, u.price);
    var listPrice = sel && window.DOSE_PRICES ? DOSE_PRICES[sel.value] : (THIS_PRODUCT && THIS_PRODUCT.price);
    return listPrice;
  }

  function decorateProductPage() {
    if (!window.THIS_PRODUCT) return;
    var sel = document.getElementById('dose-select');
    var priceEl = document.querySelector('.product-info .product-price');
    var view = {
      single: currentSingle,
      caseTotal: function () { return round2(currentSingle() * 10); },
      option: function (value) { var u = unitForDose(value); return u ? price(u.slug, u.price) : null; }
    };
    if (window.CasePricing && CasePricing.setView && CasePricing.isEligible(THIS_PRODUCT.slug)) {
      CasePricing.setView(view); // handles the price, dropdown and case option
    } else {
      // Single-vial-only products: just the price and the dropdown.
      var paint = function () {
        if (priceEl) priceEl.textContent = money(currentSingle());
        if (sel) Array.prototype.forEach.call(sel.options, function (o) {
          if (!o.hasAttribute('data-list-label')) o.setAttribute('data-list-label', o.textContent);
          var p = view.option(o.value);
          o.textContent = p == null ? o.getAttribute('data-list-label') : o.getAttribute('data-list-label').replace(/\$[\d,.]+/, money(p));
        });
      };
      if (sel) sel.addEventListener('change', function () { setTimeout(paint, 0); });
      paint();
    }
    if (priceEl && !document.querySelector('.family-price-note')) {
      var note = document.createElement('p');
      note.className = 'family-price-note';
      note.textContent = state.label || 'Family pricing';
      priceEl.parentNode.insertBefore(note, priceEl.nextSibling);
    }
  }

  ready();
  // atCost(): family/at-cost pricing (one shipping option, no free shipping);
  // false for percent-off role pricing.
  function atCost() { return !!state && !state.percent; }
  return { ready: ready, active: active, atCost: atCost, price: price, lineTotal: lineTotal, money: money };
})();
