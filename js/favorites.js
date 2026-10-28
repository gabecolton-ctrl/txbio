// favorites.js — customers save products with a heart (catalog cards and
// product pages) and see them on favorites.html. Stored on the account
// (users/{uid}.favorites = [productSlug]), so they follow the customer
// across devices. Signed-out shoppers are sent to sign in first.
var Favorites = (function () {
  var KEY = 'txbio_favs';
  var user = null, favs = null, waiters = [];
  var base = /\/products\//.test(location.pathname) ? '../' : '';
  var HEART = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.6-9.2C.9 8 2.6 4.5 6.1 4.1c2.1-.2 3.9.9 5.9 3.1 2-2.2 3.8-3.3 5.9-3.1 3.5.4 5.2 3.9 3.7 7.2-2.1 4.6-9.6 9.2-9.6 9.2z"/></svg>';

  function cacheGet() { try { var c = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return c && user && c.uid === user.uid ? c.list : null; } catch (e) { return null; } }
  function cacheSet() { try { sessionStorage.setItem(KEY, JSON.stringify({ uid: user.uid, list: favs })); } catch (e) {} }
  function ready() {
    return new Promise(function (resolve) { if (favs) resolve(favs); else waiters.push(resolve); });
  }
  function has(slug) { return !!favs && favs.indexOf(slug) !== -1; }

  function load(u) {
    user = u;
    if (!u) { favs = []; flush(); return; }
    var cached = cacheGet();
    if (cached) { favs = cached; flush(); return; }
    firebase.firestore().collection('users').doc(u.uid).get().then(function (d) {
      favs = (d.exists && Array.isArray(d.data().favorites)) ? d.data().favorites : [];
    }).catch(function () { favs = []; }).then(function () { cacheSet(); flush(); });
  }
  function flush() { paint(); waiters.splice(0).forEach(function (w) { w(favs); }); document.dispatchEvent(new CustomEvent('favoritesReady', { detail: favs })); }

  function toggle(slug) {
    if (!user) {
      location.href = base + 'login.html?redirect=' + encodeURIComponent(location.pathname + location.search);
      return Promise.resolve();
    }
    var on = !has(slug);
    favs = on ? favs.concat([slug]) : favs.filter(function (s) { return s !== slug; });
    cacheSet(); paint();
    var FV = firebase.firestore.FieldValue;
    return firebase.firestore().collection('users').doc(user.uid).set({ favorites: on ? FV.arrayUnion(slug) : FV.arrayRemove(slug) }, { merge: true })
      .catch(function (err) {
        favs = on ? favs.filter(function (s) { return s !== slug; }) : favs.concat([slug]); cacheSet(); paint();
        alert('Could not update favorites: ' + err.message);
      });
  }

  function button(slug, cls) {
    return '<button type="button" class="fav-btn ' + (cls || '') + '" data-fav="' + slug + '" aria-pressed="false" aria-label="Save to favorites" title="Save to favorites">' + HEART + '</button>';
  }
  function paint() {
    document.querySelectorAll('[data-fav]').forEach(function (b) {
      var on = has(b.getAttribute('data-fav'));
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', on ? 'Remove from favorites' : 'Save to favorites');
      b.title = on ? 'Saved to favorites' : 'Save to favorites';
      var lbl = b.querySelector('.fav-label'); if (lbl) lbl.textContent = on ? 'Saved' : 'Save';
    });
  }
  function wire(root) {
    (root || document).querySelectorAll('[data-fav]').forEach(function (b) {
      if (b._favWired) return; b._favWired = true;
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggle(b.getAttribute('data-fav')); });
    });
    paint();
  }

  function decorate() {
    // Catalog cards
    document.querySelectorAll('.product-card').forEach(function (card) {
      var a = card.querySelector('a.product-card-link'), top = card.querySelector('.product-card-top');
      var m = a && String(a.getAttribute('href')).match(/products\/([^/?#]+)\.html/);
      if (!m || !top || top.querySelector('[data-fav]')) return;
      top.insertAdjacentHTML('beforeend', button(m[1], 'fav-card'));
    });
    // Product page, next to the name
    if (window.THIS_PRODUCT) {
      var h1 = document.querySelector('.product-info h1');
      if (h1 && !document.querySelector('.fav-page')) {
        h1.insertAdjacentHTML('afterend', button(THIS_PRODUCT.slug, 'fav-page').replace('</button>', '<span class="fav-label">Save</span></button>'));
      }
    }
    wire();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      decorate();
      if (!window.firebase || !firebase.auth) return;
      if (!firebase.apps.length && typeof firebaseConfig !== 'undefined') firebase.initializeApp(firebaseConfig);
      var settled = false, waited = false;
      firebase.auth().onAuthStateChanged(function (u) {
        if (u) { settled = true; return load(u); }
        if (settled) return load(null);
        if (waited) return;
        waited = true;
        setTimeout(function () { if (!settled) { settled = true; load(firebase.auth().currentUser); } }, 1500);
      });
    });
  }
  return { ready: ready, has: has, toggle: toggle, button: button, wire: wire };
})();
