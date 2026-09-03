// inventory.js — per-product stock counts stored in Firestore.
// Collection: /inventory/{productSlug} => { qty: number, updatedAt: string }
// Reads are allowed for any signed-in user (to check stock at checkout).
// Writes are restricted to the admin account by Firestore security rules.

var Inventory = (function () {
  var db = null;

  function ensureDb() {
    if (!db) {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    }
    return db;
  }

  function getStock(slug) {
    return ensureDb().collection('inventory').doc(slug).get().then(function (doc) {
      if (doc.exists && typeof doc.data().qty === 'number') {
        return doc.data().qty;
      }
      // No inventory record yet means untracked — treat as unlimited/in stock.
      return null;
    });
  }

  function getAllStock() {
    return ensureDb().collection('inventory').get().then(function (snapshot) {
      var result = {};
      snapshot.forEach(function (doc) {
        result[doc.id] = doc.data().qty;
      });
      return result;
    });
  }

  function setStock(slug, qty) {
    return ensureDb().collection('inventory').doc(slug).set({
      qty: qty,
      updatedAt: new Date().toISOString()
    });
  }

  function decrementStock(slug, amount) {
    var ref = ensureDb().collection('inventory').doc(slug);
    return ensureDb().runTransaction(function (transaction) {
      return transaction.get(ref).then(function (doc) {
        if (!doc.exists || typeof doc.data().qty !== 'number') {
          // Untracked product — nothing to decrement, treat as unlimited.
          return { fulfilled: amount, backordered: 0, remaining: null };
        }
        var currentQty = doc.data().qty;
        var fulfilled = Math.min(currentQty, amount);
        var backordered = amount - fulfilled;
        var newQty = currentQty - fulfilled;
        transaction.update(ref, { qty: newQty, updatedAt: new Date().toISOString() });
        return { fulfilled: fulfilled, backordered: backordered, remaining: newQty };
      });
    });
  }

  function withTimeout(promise, ms, message) {
    var timeout = new Promise(function (resolve, reject) {
      setTimeout(function () { reject(new Error(message || 'Request timed out. Please try again.')); }, ms);
    });
    return Promise.race([promise, timeout]);
  }

  return {
    getStock: getStock,
    getAllStock: getAllStock,
    setStock: function (slug, qty) { return withTimeout(setStock(slug, qty), 10000, 'Saving stock count is taking too long. Please try again.'); },
    decrementStock: function (slug, amount) { return withTimeout(decrementStock(slug, amount), 10000, 'Checking stock is taking too long. Please try again.'); }
  };
})();
