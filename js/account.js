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

  function createOrder(order) {
    var user = getCurrentUser();
    if (!user) return Promise.reject(new Error('Not signed in yet — please wait a moment and try again.'));
    order.userId = user.uid;
    order.userEmail = user.email || '';
    order.createdAt = new Date().toISOString();
    return ensureDb().collection('orders').add(order);
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
    getOrderHistory: getOrderHistory
  };
})();
