// referral.js — referral links. A link like txbioresearch.com/?code=FRANNY
// saves the code in this browser for 30 days; checkout fills it in and
// applies it automatically (see checkout.html). Affiliate credit then works
// exactly as if the buyer had typed the code. Codes are made on
// Admin > Promo codes (set the affiliate email there).

var Referral = (function () {
  var KEY = 'txbio_ref_code';     // the code checkout should apply (a discount)
  var AFF_KEY = 'txbio_ref_aff';   // who referred this shopper (kept even if another code is used)
  var DAYS = 30;

  function clean(v) {
    var c = String(v || '').trim().toUpperCase();
    return /^[A-Z0-9_-]{2,24}$/.test(c) ? c : '';
  }
  function get() {
    try {
      var r = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (r && r.code && Date.now() - r.at < DAYS * 864e5) return r.code;
      localStorage.removeItem(KEY);
    } catch (e) {}
    return '';
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  // The referral link this shopper arrived through (last one, 30 days).
  function affiliate() {
    try {
      var r = JSON.parse(localStorage.getItem(AFF_KEY) || 'null');
      if (r && r.code && Date.now() - r.at < DAYS * 864e5) return r.code;
      localStorage.removeItem(AFF_KEY);
    } catch (e) {}
    return '';
  }

  function toast(code) {
    var t = document.createElement('div');
    t.className = 'added-toast ref-toast';
    t.setAttribute('role', 'status');
    t.textContent = 'Code ' + code + ' saved. It will be applied at checkout.';
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-hiding'); }, 4000);
    setTimeout(function () { t.remove(); }, 4600);
  }

  // Counts a visit that arrived through the link, for the affiliate's
  // dashboard: refTraffic/{CODE} { visits, visitors, days: { 'YYYY-MM-DD': n } }.
  // Once per browser tab session per code; "visitors" counts a browser the
  // first time it arrives with that code. The affiliate's own clicks, the
  // admin, bots, and test servers aren't counted.
  var LIVE_HOSTS = ['txbioresearch.com', 'www.txbioresearch.com'];
  var ADMIN_EMAIL = 'gabecolton@gmail.com';
  function chicagoDay() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function countVisit(code, firstTime) {
    if (LIVE_HOSTS.indexOf(location.hostname) === -1 && !window.__TRAFFIC_TEST) return;
    if (/bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(navigator.userAgent) && !window.__TRAFFIC_TEST) return;
    var seenKey = 'txbio_ref_counted_' + code;
    try { if (sessionStorage.getItem(seenKey)) return; } catch (e) {}
    if (!window.firebase || !firebase.firestore || !firebase.auth) return;
    if (!firebase.apps.length && typeof firebaseConfig !== 'undefined') firebase.initializeApp(firebaseConfig);
    var db = firebase.firestore();
    var sent = false;
    function go(user) {
      if (sent) return;
      sent = true;
      var email = user ? String(user.email || '').toLowerCase() : '';
      if (email === ADMIN_EMAIL) return;
      // Skip the affiliate clicking their own link (needs sign-in to tell).
      var own = email ? db.collection('promoCodes').doc(code).get().then(function (d) {
        return d.exists && String(d.data().affiliateEmail || '').toLowerCase() === email;
      }).catch(function () { return false; }) : Promise.resolve(false);
      own.then(function (isOwn) {
        if (isOwn) return;
        var inc = firebase.firestore.FieldValue.increment(1);
        var data = { visits: inc, days: {}, updatedAt: new Date().toISOString() };
        data.days[chicagoDay()] = inc;
        if (firstTime) data.visitors = inc;
        return db.collection('refTraffic').doc(code).set(data, { merge: true }).then(function () {
          try { sessionStorage.setItem(seenKey, '1'); } catch (e) {}
        });
      }).catch(function () { /* unknown code or rules not published */ });
    }
    firebase.auth().onAuthStateChanged(function (u) { if (u) go(u); });
    setTimeout(function () { go(firebase.auth().currentUser); }, 1800);
  }

  if (typeof document !== 'undefined') {
    var code = '';
    try { code = clean(new URLSearchParams(location.search).get('code')); } catch (e) {}
    if (code) {
      var isNew = get() !== code;
      var seenBefore = false;
      try {
        var seenList = JSON.parse(localStorage.getItem('txbio_ref_seen') || '[]');
        seenBefore = seenList.indexOf(code) !== -1;
        if (!seenBefore) { seenList.push(code); localStorage.setItem('txbio_ref_seen', JSON.stringify(seenList.slice(-20))); }
      } catch (e) {}
      try {
        localStorage.setItem(KEY, JSON.stringify({ code: code, at: Date.now() }));
        localStorage.setItem(AFF_KEY, JSON.stringify({ code: code, at: Date.now() }));
      } catch (e) {}
      document.addEventListener('DOMContentLoaded', function () {
        if (isNew) toast(code);
        countVisit(code, !seenBefore);
      });
    }
  }

  return { get: get, clear: clear, clean: clean, affiliate: affiliate };
})();
