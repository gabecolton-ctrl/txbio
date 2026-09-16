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
