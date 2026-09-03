// auth-guard.js
// Include this on any page that requires a signed-in user (e.g. product detail pages, cart).
// It redirects to login.html if no user is signed in, and wires Cart to the user.

document.addEventListener('DOMContentLoaded', function () {
  if (!window.firebase) {
    console.error('Firebase SDK not loaded');
    return;
  }
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  var mainContent = document.getElementById('gated-content');
  var loadingEl = document.getElementById('auth-loading');

  firebase.auth().onAuthStateChanged(function (user) {
    if (user) {
      if (window.Cart) Cart.setUser(user);
      if (loadingEl) loadingEl.style.display = 'none';
      if (mainContent) mainContent.style.display = '';
      document.dispatchEvent(new CustomEvent('userReady', { detail: { user: user } }));
    } else {
      var returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      var loginPath = window.location.pathname.indexOf('/products/') !== -1 ? '../login.html' : 'login.html';
      window.location.href = loginPath + '?redirect=' + returnTo;
    }
  });
});
