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

  function getCartRef(uid) {
    return ensureDb().collection('carts').doc(uid);
  }

  function getCart() {
    if (!currentUser) return Promise.resolve([]);
    return getCartRef(currentUser.uid).get().then(function (doc) {
      if (doc.exists && doc.data().items) {
        return doc.data().items;
      }
      return [];
    });
  }

  function saveCart(items) {
    if (!currentUser) return Promise.reject('Not signed in');
    return getCartRef(currentUser.uid).set({ items: items, updatedAt: new Date().toISOString() });
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

  return {
    setUser: setUser,
    getCart: getCart,
    addItem: addItem,
    updateQty: updateQty,
    removeItem: removeItem,
    clearCart: clearCart,
    getItemCount: getItemCount
  };
})();
