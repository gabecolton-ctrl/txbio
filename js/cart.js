// cart.js — Firestore-backed shopping cart, one document per user
// Cart document shape: /carts/{uid} => { items: [ {slug, name, packSize, price, qty}, ... ] }

// Base product slugs (without dose suffix) whose form is lyophilized powder —
// used to prompt about adding bacteriostatic water for reconstitution.
// Multi-dose products add items with slugs like "retatrutide-10mg", so we
// match by prefix rather than exact slug.
var POWDER_PRODUCT_SLUGS = ["5-amino-1mq", "ahk-cu", "aod9604", "ara290-cibinetide", "bpc-10mg-tb10mg", "bpc-157", "bpc-15mg-tb15mg", "bpc-5mg-tb5mg", "cagrilintide", "cagrisema-2-5mg-2-5mg", "cagrisema-5mg-5mg", "cartalax", "cerebrolysin", "cjc-1295-without-dac-5mg-ipa-5mg", "cjc-1295-without-dac", "cjc1295-with-dac", "dihexa", "dsip", "epithalon", "ghk-cu", "glow-blend", "glutathione", "hcg", "humanin", "igf-1-lr3", "ipamorelin", "kisspeptin-10", "klow-blend", "kpv", "ll37", "melanotan-i", "melanotan-ii", "mots-c-human", "nad-plus", "oxytocin", "pinealon", "pt141", "retatrutide-20mg-tirzepatide-40mg", "retatrutide-5mg-cagrilintide-5mg", "r-3", "selank", "semaglutide", "semax-10mg-selank-10mg", "semax", "sermorelin-acetate", "ss-31", "tb500-thymosin-beta-4", "tesamorelin", "thymalin-thymulin", "thymosin-alpha-1", "tirzepatide", "vip"];

function cartHasPowderProduct(items) {
  return items.some(function (item) {
    return POWDER_PRODUCT_SLUGS.some(function (baseSlug) {
      return item.slug === baseSlug || item.slug.indexOf(baseSlug + '-') === 0;
    });
  });
}

function cartHasBacWater(items) {
  return items.some(function (item) {
    return item.slug.indexOf('bac-water') === 0;
  });
}

var Cart = (function () {
  var db = null;
  var currentUser = null;

  function ensureDb() {
    if (!db) {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    }
    return db;
  }

  function getCurrentUser() {
    // Prefer the live Firebase Auth user over our cached reference, in case
    // setUser() hasn't been called yet (e.g. a click fires before the
    // onAuthStateChanged callback that wires up Cart has run).
    if (firebase.auth().currentUser) return firebase.auth().currentUser;
    return currentUser;
  }

  function getCartRef(uid) {
    return ensureDb().collection('carts').doc(uid);
  }

  function getCart() {
    var user = getCurrentUser();
    if (!user) return Promise.resolve([]);
    return getCartRef(user.uid).get().then(function (doc) {
      if (doc.exists && doc.data().items) {
        return doc.data().items;
      }
      return [];
    });
  }

  function saveCart(items) {
    var user = getCurrentUser();
    if (!user) return Promise.reject(new Error('Not signed in yet — please wait a moment and try again.'));
    return getCartRef(user.uid).set({ items: items, updatedAt: new Date().toISOString() });
  }

  // Public pages: a signed-out visitor who taps "Add to cart" is sent to sign
  // in (or register), then brought back and the item is added for them.
  var PENDING_KEY = 'txbio_pending_add';
  function waitForUser(ms) {
    return new Promise(function (resolve) {
      var done = false;
      var unsub = null;
      var stop = function () { if (typeof unsub === 'function') unsub(); };
      unsub = firebase.auth().onAuthStateChanged(function (u) {
        if (u && !done) { done = true; stop(); resolve(u); }
      });
      setTimeout(function () { if (!done) { done = true; stop(); resolve(firebase.auth().currentUser); } }, ms);
    });
  }
  function sendToLogin(product, qty) {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ product: product, qty: qty, page: location.pathname })); } catch (e) {}
    var inProducts = location.pathname.indexOf('/products/') !== -1;
    location.href = (inProducts ? '../' : '') + 'login.html?add=1&redirect=' + encodeURIComponent(location.pathname + location.search);
    return new Promise(function () {}); // the page is leaving
  }

  function addItem(product, qty) {
    qty = qty || 1;
    var user = getCurrentUser();
    if (!user) {
      return waitForUser(1500).then(function (u) {
        if (u) { currentUser = u; return addItem(product, qty); }
        return sendToLogin(product, qty);
      });
    }
    var ref = getCartRef(user.uid);
    return ensureDb().runTransaction(function (transaction) {
      return transaction.get(ref).then(function (doc) {
        var items = (doc.exists && doc.data().items) ? doc.data().items : [];
        var existing = items.find(function (i) { return i.slug === product.slug && !i.quoteId; }); // quoted lines stay separate
        if (existing) {
          existing.qty += qty;
        } else {
          var line = {
            slug: product.slug,
            name: product.name,
            packSize: product.packSize,
            price: product.price,
            qty: qty
          };
          // Case lines (see case-pricing.js) remember how many vials they hold
          // and which single-vial slug to pull stock from at checkout.
          if (product.caseOf) {
            line.caseOf = product.caseOf;
            line.unitSlug = product.unitSlug;
          }
          items.push(line);
        }
        transaction.set(ref, { items: items, updatedAt: new Date().toISOString() });
      });
    });
  }

  // A line's key: its slug, or slug#quoteId for a line from an admin quote.
  function lineKey(i) { return i.quoteId ? i.slug + '#' + i.quoteId : i.slug; }

  function updateQty(key, qty) {
    return getCart().then(function (items) {
      if (qty <= 0) {
        items = items.filter(function (i) { return lineKey(i) !== key; });
      } else {
        var item = items.find(function (i) { return lineKey(i) === key && !(i.quoteId && i.caseOf); }); // quoted cases keep their quantity
        if (item) item.qty = qty;
      }
      return saveCart(items).then(function () { return items; });
    });
  }

  function removeItem(slug) {
    return updateQty(slug, 0);
  }

  function clearCart() {
    return saveCart([]);
  }

  function setUser(user) {
    currentUser = user;
    // Finish an "Add to cart" that started before signing in.
    var pending = null;
    try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); sessionStorage.removeItem(PENDING_KEY); } catch (e) {}
    if (user && pending && pending.product) {
      addItem(pending.product, pending.qty || 1).then(function () {
        showAddedToast(pending.product.name);
        return getItemCount();
      }).then(function (count) {
        var badge = document.getElementById('floating-cart-badge');
        if (badge && typeof count === 'number') { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
      }).catch(function (err) { console.error('Could not add the saved item:', err); });
    }
  }

  function showAddedToast(name) {
    var t = document.createElement('div');
    t.className = 'added-toast';
    t.setAttribute('role', 'status');
    t.textContent = (name ? name + ' was' : 'Your item was') + ' added to your cart.';
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-hiding'); }, 3500);
    setTimeout(function () { t.remove(); }, 4200);
  }

  function getItemCount() {
    return getCart().then(function (items) {
      return items.reduce(function (sum, i) { return sum + i.qty; }, 0);
    });
  }

  function withTimeout(promise, ms, message) {
    var timeout = new Promise(function (resolve, reject) {
      setTimeout(function () { reject(new Error(message || 'Request timed out. Please try again.')); }, ms);
    });
    return Promise.race([promise, timeout]);
  }

  function addItemWithRetry(product, qty) {
    // First attempt: 10s timeout. If it times out (but not if it fails for
    // another reason, like a permissions error), retry once with a longer
    // 15s window before giving up — this smooths over occasional slow
    // Firestore responses without making the user manually retry.
    return withTimeout(addItem(product, qty), 10000, 'timeout').catch(function (err) {
      if (err.message === 'timeout') {
        return withTimeout(addItem(product, qty), 15000, 'Adding to cart is taking too long. Please check your connection and try again.');
      }
      throw err;
    });
  }

  return {
    setUser: setUser,
    getCart: getCart,
    addItem: addItemWithRetry,
    updateQty: updateQty,
    removeItem: removeItem,
    clearCart: clearCart,
    lineKey: lineKey,
    getItemCount: getItemCount
  };
})();
