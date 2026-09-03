// nav-auth.js
// Updates the nav bar's account link and the floating cart button based on sign-in state.
document.addEventListener('DOMContentLoaded', function () {
  if (!window.firebase) return;
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  var acctLink = document.getElementById('nav-account-link');
  var myAccountLink = document.getElementById('nav-myaccount-link');
  var floatingCart = document.getElementById('floating-cart-btn');
  var floatingCartBadge = document.getElementById('floating-cart-badge');
  var loginPath = window.location.pathname.indexOf('/products/') !== -1 ? '../login.html' : 'login.html';
  var indexPath = window.location.pathname.indexOf('/products/') !== -1 ? '../index.html' : 'index.html';

  firebase.auth().onAuthStateChanged(function (user) {
    if (user) {
      if (acctLink) {
        acctLink.textContent = 'Sign Out';
        acctLink.href = '#';
        acctLink.onclick = function (e) {
          e.preventDefault();
          firebase.auth().signOut().then(function () {
            window.location.href = indexPath;
          });
        };
      }
      if (myAccountLink) {
        var myAccountLi = myAccountLink.closest('li');
        if (myAccountLi) myAccountLi.style.display = 'list-item';
      }
      if (floatingCart) {
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
        acctLink.textContent = 'Researcher Login';
        acctLink.href = loginPath;
        acctLink.onclick = null;
      }
      if (myAccountLink) {
        var signedOutMyAccountLi = myAccountLink.closest('li');
        if (signedOutMyAccountLi) signedOutMyAccountLi.style.display = 'none';
      }
      if (floatingCart) {
        floatingCart.style.display = 'none';
      }
    }
  });
});
