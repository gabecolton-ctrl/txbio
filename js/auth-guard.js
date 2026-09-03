// auth-guard.js
// Include this on any page that requires a signed-in user (e.g. product detail pages, cart).
// It redirects to login.html if no user is signed in, and wires Cart to the user.
//
// Note: right after a fresh sign-in redirect, Firebase's auth SDK can take a
// moment to restore the session from storage. We wait briefly for a second
// check before redirecting to login, to avoid bouncing a just-signed-in user
// back to the login page.

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
  var resolved = false;
  var firstCheckDone = false;

  function showContent(user) {
    resolved = true;
    if (window.Cart) Cart.setUser(user);
    if (window.Account) Account.setUser(user);
    if (loadingEl) loadingEl.style.display = 'none';
    if (mainContent) mainContent.style.display = '';
    document.dispatchEvent(new CustomEvent('userReady', { detail: { user: user } }));
  }


  function goToLogin() {
    resolved = true;
    var returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    var loginPath = window.location.pathname.indexOf('/products/') !== -1 ? '../login.html' : 'login.html';
    window.location.href = loginPath + '?redirect=' + returnTo;
  }

  firebase.auth().onAuthStateChanged(function (user) {
    if (resolved) return;
    if (user) {
      showContent(user);
    } else if (firstCheckDone) {
      // Second time we've heard "no user" — safe to conclude they're signed out.
      goToLogin();
    } else {
      // First check came back empty — this can happen transiently right after
      // a sign-in redirect while Firebase restores the session. Wait briefly
      // and let a second check decide.
      firstCheckDone = true;
      setTimeout(function () {
        if (!resolved) {
          var current = firebase.auth().currentUser;
          if (current) {
            showContent(current);
          } else {
            goToLogin();
          }
        }
      }, 1200);
    }
  }, function (error) {
    console.error('Auth state error:', error);
    if (loadingEl) loadingEl.textContent = 'Something went wrong checking access. Please refresh the page.';
  });

  // Absolute fallback: if nothing has resolved after 5 seconds, show a manual
  // retry link instead of hanging forever.
  setTimeout(function () {
    if (!resolved && loadingEl) {
      loadingEl.innerHTML = 'Taking longer than expected. <a href="#" onclick="window.location.reload(); return false;">Tap to retry</a>.';
    }
  }, 5000);
});
