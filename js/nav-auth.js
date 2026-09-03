// nav-auth.js
// Updates the nav bar's account link and cart badge based on sign-in state.
document.addEventListener('DOMContentLoaded', function () {
  if (!window.firebase) return;
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  var acctLink = document.getElementById('nav-account-link');
  var myAccountLink = document.getElementById('nav-myaccount-link');
  var cartLink = document.getElementById('nav-cart-link');
  var cartBadge = document.getElementById('nav-cart-badge');
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
      if (cartLink) {
        var cartLi = cartLink.closest('li');
        if (cartLi) cartLi.style.display = 'list-item';
        cartLink.style.display = 'inline';
        if (window.Cart) {
          Cart.setUser(user);
          Cart.getItemCount().then(function (count) {
            if (cartBadge) {
              cartBadge.textContent = count;
              cartBadge.style.display = count > 0 ? 'block' : 'none';
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
      if (cartLink) {
        var signedOutLi = cartLink.closest('li');
        if (signedOutLi) signedOutLi.style.display = 'none';
        cartLink.style.display = 'none';
      }
    }
  });
});
