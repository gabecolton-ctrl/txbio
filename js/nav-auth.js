// Before first paint: if this browser session was signed in on the last page,
// show the signed-in layout right away (corrected once Firebase confirms).
try { if (sessionStorage.getItem('txbio_signed_in') === '1') document.documentElement.classList.add('signed-in'); } catch (e) {}

// nav-auth.js
// Updates the nav bar's account link and the floating cart button based on sign-in state.
document.addEventListener('DOMContentLoaded', function () {
  if (!window.firebase) return;
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  var acctLink = document.getElementById('nav-account-link');
  var myAccountLink = document.getElementById('nav-myaccount-link');
  var adminLink = document.getElementById('nav-admin-link');
  var adminPromosLink = document.getElementById('nav-admin-promos-link');
  var adminOrdersLink = document.getElementById('nav-admin-orders-link');
  var floatingCart = document.getElementById('floating-cart-btn');
  var floatingCartBadge = document.getElementById('floating-cart-badge');
  var ADMIN_EMAIL = 'gabecolton@gmail.com';
  var loginPath = window.location.pathname.indexOf('/products/') !== -1 ? '../login.html' : 'login.html';
  var indexPath = window.location.pathname.indexOf('/products/') !== -1 ? '../index.html' : 'index.html';

  // Keep a customer record for every signed-in account (once per browser
  // session) so it appears on the admin Customers page.
  function recordCustomer(user) {
    try {
      if (!user || !firebase.firestore || sessionStorage.getItem('txbio_customer_recorded') === user.uid) return;
      var fields = { email: (user.email || '').toLowerCase(), lastSignInAt: new Date().toISOString() };
      if (user.metadata && user.metadata.creationTime) fields.createdAt = new Date(user.metadata.creationTime).toISOString();
      if (user.displayName) fields.displayName = user.displayName; // "Name — Institution" from sign-up
      // Which stores they've signed in to (js/sites.js), for Admin → Customers.
      if (firebase.firestore.FieldValue) fields.stores = firebase.firestore.FieldValue.arrayUnion(window.Sites ? Sites.current() : 'main');
      firebase.firestore().collection('users').doc(user.uid).set(fields, { merge: true }).then(function () {
        sessionStorage.setItem('txbio_customer_recorded', user.uid);
      }).catch(function () {});
    } catch (e) {}
  }

  // "Last active" on Admin → Customers: while a signed-in customer has a page
  // open and in view, note the time (at most every 5 minutes) and the store.
  var SEEN_EVERY = 5 * 60 * 1000;
  function markSeen(user) {
    try {
      if (!user || !firebase.firestore || document.visibilityState === 'hidden') return;
      var key = 'txbio_seen_' + user.uid, last = Number(localStorage.getItem(key) || 0);
      if (Date.now() - last < SEEN_EVERY) return;
      localStorage.setItem(key, String(Date.now()));
      firebase.firestore().collection('users').doc(user.uid).set({
        lastSeenAt: new Date().toISOString(), lastSeenSite: window.Sites ? Sites.current() : 'main',
        // Some older accounts never saved their email; cart reminders need it.
        email: String(user.email || '').toLowerCase()
      }, { merge: true }).catch(function () {});
    } catch (e) {}
  }
  var seenUser = null;
  setInterval(function () { markSeen(seenUser); }, 60 * 1000);
  document.addEventListener('visibilitychange', function () { markSeen(seenUser); });

  // "Referrals" in the account menu, only for accounts that are the affiliate
  // on a promo code (and the admin). Remembered for this browser session.
  function showReferralsLink(user) {
    var items = document.querySelectorAll('li.nav-referrals');
    if (!items.length || !firebase.firestore) return;
    var show = function () { items.forEach(function (li) { li.style.display = 'list-item'; }); };
    var email = String(user.email || '').toLowerCase();
    if (email === ADMIN_EMAIL) return show();
    var key = 'txbio_affiliate_' + user.uid, cached = null;
    try { cached = sessionStorage.getItem(key); } catch (e) {}
    if (cached === '1') return show();
    // A "no" is rechecked after 5 minutes, so a code you just gave someone shows up soon.
    if (cached && cached.indexOf('0:') === 0 && Date.now() - Number(cached.slice(2)) < 5 * 60 * 1000) return;
    firebase.firestore().collection('promoCodes').where('affiliateEmail', '==', email).limit(1).get().then(function (snap) {
      try { sessionStorage.setItem(key, snap.empty ? '0:' + Date.now() : '1'); } catch (e) {}
      if (!snap.empty) show();
    }).catch(function () {});
  }

  document.querySelectorAll('.nav-signout-link').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      firebase.auth().signOut().then(function () {
        window.location.href = indexPath;
      });
    });
  });

  // Highlight the current page inside the dropdown menus.
  var here = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-admin-menu ul a').forEach(function (a) {
    if ((a.getAttribute('href') || '').split('/').pop() === here) a.classList.add('active');
  });

  firebase.auth().onAuthStateChanged(function (user) {
    document.documentElement.classList.toggle('signed-in', !!user);
    try { sessionStorage.setItem('txbio_signed_in', user ? '1' : '0'); } catch (e) {}
    if (user) recordCustomer(user);
    seenUser = user || null;
    markSeen(seenUser);
    if (user) showReferralsLink(user);
    if (user) {
      // Signed in: the "My account" menu (My orders, Account details, Sign out)
      // replaces the login button.
      if (acctLink) {
        var loginLi = acctLink.closest('li');
        if (loginLi) loginLi.style.display = 'none';
      }
      if (myAccountLink) {
        var myAccountLi = myAccountLink.closest('li.nav-myaccount');
        if (myAccountLi) myAccountLi.style.display = 'list-item';
      }
      if (adminLink && user.email === ADMIN_EMAIL) {
        var adminLi = adminLink.closest('li');
        if (adminLi) adminLi.style.display = 'list-item';
      }
      if (adminPromosLink && user.email === ADMIN_EMAIL) {
        var adminPromosLi = adminPromosLink.closest('li');
        if (adminPromosLi) adminPromosLi.style.display = 'list-item';
      }
      if (adminOrdersLink && user.email === ADMIN_EMAIL) {
        var adminOrdersLi = adminOrdersLink.closest('li');
        if (adminOrdersLi) adminOrdersLi.style.display = 'list-item';
      }
      if (user.email === ADMIN_EMAIL) {
        document.querySelectorAll('li.nav-admin').forEach(function (li) { li.style.display = 'list-item'; });
      } else if (window.Staff) {
        // Managers get the Admin menu with only the pages they may use.
        var showManager = function (r) {
          if (r !== 'manager') return;
          document.querySelectorAll('li.nav-admin').forEach(function (li) {
            li.style.display = 'list-item';
            li.querySelectorAll('ul a').forEach(function (a) {
              var page = (a.getAttribute('href') || '').split('/').pop().split('?')[0];
              var item = a.closest('li');
              if (item) item.style.display = Staff.canOpen('manager', page) ? 'list-item' : 'none';
            });
          });
        };
        if (Staff.cachedRole(user) === 'manager') showManager('manager');
        Staff.role(user).then(showManager);
      }
      // Not on the cart or checkout itself, where it would cover the Remove links.
      var onCartPage = /(^|\/)(cart|checkout)\.html$/.test(window.location.pathname);
      if (floatingCart && onCartPage) floatingCart.style.display = 'none';
      if (floatingCart && !onCartPage) {
        floatingCart.style.display = 'flex';
        if (window.Cart) {
          Cart.setUser(user);
          Cart.getItemCount().then(function (count) {
            if (floatingCartBadge) {
              floatingCartBadge.textContent = count;
              floatingCartBadge.style.display = count > 0 ? 'flex' : 'none';
            }
          });
        }
      }
    } else {
      if (acctLink) {
        var signedOutLoginLi = acctLink.closest('li');
        if (signedOutLoginLi) signedOutLoginLi.style.display = '';
      }
      if (myAccountLink) {
        var signedOutMyAccountLi = myAccountLink.closest('li.nav-myaccount');
        if (signedOutMyAccountLi) signedOutMyAccountLi.style.display = 'none';
      }
      if (adminLink) {
        var signedOutAdminLi = adminLink.closest('li');
        if (signedOutAdminLi) signedOutAdminLi.style.display = 'none';
      }
      if (adminPromosLink) {
        var signedOutAdminPromosLi = adminPromosLink.closest('li');
        if (signedOutAdminPromosLi) signedOutAdminPromosLi.style.display = 'none';
      }
      if (adminOrdersLink) {
        var signedOutAdminOrdersLi = adminOrdersLink.closest('li');
        if (signedOutAdminOrdersLi) signedOutAdminOrdersLi.style.display = 'none';
      }
      if (floatingCart) {
        floatingCart.style.display = 'none';
      }
    }
  });
});
