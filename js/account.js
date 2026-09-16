// account.js — user profile (personal info, address) and order history,
// stored in Firestore at /users/{uid} and /orders/{orderId}.

var Account = (function () {
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
    if (firebase.auth().currentUser) return firebase.auth().currentUser;
    return currentUser;
  }

  function setUser(user) {
    currentUser = user;
  }

  function getProfile() {
    var user = getCurrentUser();
    if (!user) return Promise.resolve(null);
    return ensureDb().collection('users').doc(user.uid).get().then(function (doc) {
      if (doc.exists) return doc.data();
      return {
        name: '',
        institution: '',
        email: user.email || '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        zip: ''
      };
    });
  }

  function saveProfile(profile) {
    var user = getCurrentUser();
    if (!user) return Promise.reject(new Error('Not signed in yet — please wait a moment and try again.'));
    return ensureDb().collection('users').doc(user.uid).set(profile, { merge: true });
  }

  function generateOrderNumber() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
    var random = '';
    for (var i = 0; i < 6; i++) {
      random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'TXB-' + random;
  }

  function createOrder(order) {
    var user = getCurrentUser();
    if (!user) return Promise.reject(new Error('Not signed in yet — please wait a moment and try again.'));
    order.userId = user.uid;
    order.userEmail = user.email || '';
    order.createdAt = new Date().toISOString();
    order.orderNumber = generateOrderNumber();
    return ensureDb().collection('orders').add(order).then(function (docRef) {
      return { docRef: docRef, orderNumber: order.orderNumber };
    });
  }

  function isFirstOrder() {
    var user = getCurrentUser();
    if (!user) return Promise.resolve(true);
    return ensureDb().collection('orders').where('userId', '==', user.uid).limit(1).get().then(function (snapshot) {
      return snapshot.empty;
    });
  }

  function getOrderHistory() {
    var user = getCurrentUser();
    if (!user) return Promise.resolve([]);
    return ensureDb().collection('orders')
      .where('userId', '==', user.uid)
      .get()
      .then(function (snapshot) {
        var orders = [];
        snapshot.forEach(function (doc) {
          orders.push(Object.assign({ id: doc.id }, doc.data()));
        });
        // Sort newest first (client-side, avoids needing a composite index)
        orders.sort(function (a, b) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        return orders;
      });
  }

  function getAllOrders() {
    return ensureDb().collection('orders')
      .get()
      .then(function (snapshot) {
        var orders = [];
        snapshot.forEach(function (doc) {
          orders.push(Object.assign({ id: doc.id }, doc.data()));
        });
        orders.sort(function (a, b) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        return orders;
      });
  }

  function updateOrderStatus(orderId, status) {
    return ensureDb().collection('orders').doc(orderId).update({ status: status });
  }

  function withTimeout(promise, ms, message) {
    var timeout = new Promise(function (resolve, reject) {
      setTimeout(function () { reject(new Error(message || 'Request timed out. Please try again.')); }, ms);
    });
    return Promise.race([promise, timeout]);
  }

  return {
    setUser: setUser,
    getProfile: getProfile,
    saveProfile: function (profile) { return withTimeout(saveProfile(profile), 10000, 'Saving your info is taking too long. Please check your connection and try again.'); },
    createOrder: function (order) { return withTimeout(createOrder(order), 10000, 'Submitting your order is taking too long. Please check your connection and try again.'); },
    isFirstOrder: function () { return withTimeout(isFirstOrder(), 10000, 'Checking order history is taking too long. Please try again.'); },
    getOrderHistory: getOrderHistory,
    getAllOrders: function () { return withTimeout(getAllOrders(), 10000, 'Loading orders is taking too long. Please try again.'); },
    updateOrderStatus: function (orderId, status) { return withTimeout(updateOrderStatus(orderId, status), 10000, 'Updating order status is taking too long. Please try again.'); }
  };
})();
