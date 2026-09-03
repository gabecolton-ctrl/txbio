// cart.js — Firestore-backed shopping cart, one document per user
// Cart document shape: /carts/{uid} => { items: [ {slug, name, packSize, price, qty}, ... ] }

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

  function addItem(product, qty) {
    qty = qty || 1;
    return getCart().then(function (items) {
      var existing = items.find(function (i) { return i.slug === product.slug; });
      if (existing) {
        existing.qty += qty;
      } else {
        items.push({
          slug: product.slug,
          name: product.name,
          packSize: product.packSize,
          price: product.price,
          qty: qty
        });
      }
      return saveCart(items);
    });
  }

  function updateQty(slug, qty) {
    return getCart().then(function (items) {
      if (qty <= 0) {
        items = items.filter(function (i) { return i.slug !== slug; });
      } else {
        var item = items.find(function (i) { return i.slug === slug; });
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

  return {
    setUser: setUser,
    getCart: getCart,
    addItem: function (product, qty) { return withTimeout(addItem(product, qty), 10000, 'Adding to cart is taking too long. Please check your connection and try again.'); },
    updateQty: updateQty,
    removeItem: removeItem,
    clearCart: clearCart,
    getItemCount: getItemCount
  };
})();
