// staff.js — who may use the admin pages.
// 'admin' is the site owner. 'manager' is anyone the admin added on
// Admin → Roles (staff/{email}.role == 'manager'): they handle orders &
// shipping, customers and promo codes. Firestore rules enforce the same split;
// this file only decides which pages and menu links to show.
(function (root) {
  var ADMIN_EMAIL = 'gabecolton@gmail.com';
  // Admin pages a manager may open.
  var MANAGER_PAGES = ['admin-todo.html', 'admin-orders.html', 'admin-slip.html', 'admin-customers.html', 'admin-carts.html', 'admin-promos.html'];
  var CACHE = 'txbio_staff_role';

  function emailOf(user) { return String((user && user.email) || '').toLowerCase(); }

  // Promise of 'admin', 'manager' or null.
  function role(user) {
    var email = emailOf(user);
    if (!email) return Promise.resolve(null);
    if (email === ADMIN_EMAIL) return Promise.resolve('admin');
    if (!root.firebase || !firebase.firestore) return Promise.resolve(null);
    return firebase.firestore().collection('staff').doc(email).get().then(function (d) {
      var r = d.exists && d.data().role === 'manager' ? 'manager' : null;
      try { sessionStorage.setItem(CACHE, email + '|' + (r || '')); } catch (e) {}
      return r;
    }).catch(function () { return null; });
  }

  // Last known role in this browser session (for the nav, before the read returns).
  function cachedRole(user) {
    var email = emailOf(user);
    if (email === ADMIN_EMAIL) return 'admin';
    try {
      var v = sessionStorage.getItem(CACHE) || '';
      var i = v.lastIndexOf('|');
      if (i > 0 && v.slice(0, i) === email) return v.slice(i + 1) || null;
    } catch (e) {}
    return undefined; // unknown
  }

  function canOpen(r, page) {
    if (r === 'admin') return true;
    return r === 'manager' && MANAGER_PAGES.indexOf(page) !== -1;
  }

  var Staff = { ADMIN_EMAIL: ADMIN_EMAIL, MANAGER_PAGES: MANAGER_PAGES, role: role, cachedRole: cachedRole, canOpen: canOpen };
  root.Staff = Staff;
  if (typeof module !== 'undefined' && module.exports) module.exports = Staff;
})(typeof window !== 'undefined' ? window : this);
