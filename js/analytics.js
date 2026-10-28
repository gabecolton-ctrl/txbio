// analytics.js — simple, private visit counting for the admin Traffic page.
//
// Each page view adds to one daily summary document, traffic/{YYYY-MM-DD}
// (Central time). Nothing identifies a person: no cookies, no IP addresses,
// no account details. A random "seen today" marker in this browser's storage
// lets us count daily visitors without counting the same browser twice.
// The admin's own visits, bots, and the local test server aren't counted.

(function () {
  var ADMIN_EMAIL = 'gabecolton@gmail.com';
  var LIVE_HOSTS = ['txbioresearch.com', 'www.txbioresearch.com'];

  if (LIVE_HOSTS.indexOf(location.hostname) === -1 && !window.__TRAFFIC_TEST) return;
  if (/bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(navigator.userAgent) && !window.__TRAFFIC_TEST) return;

  function key(s) {
    return String(s || '').toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'other';
  }
  function store(kind, k, v) {
    try { return v === undefined ? window[kind].getItem(k) : window[kind].setItem(k, v); } catch (e) { return null; }
  }

  function today() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  // "products/bpc-157.html" -> "products~bpc-157"; "/" -> "home"
  function pageKey() {
    var p = location.pathname.replace(/^\/+/, '').replace(/\.html$/, '').replace(/\/$/, '');
    if (!p || p === 'index') return 'home';
    return p.split('/').map(key).join('~');
  }

  // Where this visit came from: a search engine, a site, a tagged link, or direct.
  function source() {
    var params = new URLSearchParams(location.search);
    var tag = params.get('utm_source') || params.get('ref') || params.get('src');
    var ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    if (ref && LIVE_HOSTS.indexOf(ref) !== -1) ref = '';
    var name = ref ? key(ref.replace(/^(m|l|lm)\./, '')) : 'direct';
    if (/^google_/.test(name) || name === 'google_com') name = 'google';
    if (/bing_com$/.test(name)) name = 'bing';
    if (/(^|_)instagram_com$/.test(name)) name = 'instagram';
    if (/(^|_)facebook_com$/.test(name)) name = 'facebook';
    if (/^t_co$|(^|_)twitter_com$|(^|_)x_com$/.test(name)) name = 'x_twitter';
    if (/(^|_)reddit_com$/.test(name)) name = 'reddit';
    return { ref: name, tag: tag ? key(tag) : '' };
  }

  function send(user) {
    if (user && user.email === ADMIN_EMAIL) return;
    var day = today();
    var inc = firebase.firestore.FieldValue.increment(1);
    var data = { views: inc, pages: {}, updatedAt: new Date().toISOString() };
    data.pages[pageKey()] = inc;
    if (user) data.signedInViews = inc;

    // A new visit (session) = first page in this browser tab.
    if (!store('sessionStorage', 'txbio_visit')) {
      store('sessionStorage', 'txbio_visit', '1');
      var s = source();
      var mobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
      data.sessions = inc;
      data.refs = {}; data.refs[s.ref] = inc;
      data.landing = {}; data.landing[pageKey()] = inc;
      data.devices = {}; data.devices[mobile ? 'mobile' : 'desktop'] = inc;
      if (s.tag) { data.sources = {}; data.sources[s.tag] = inc; }
    }
    // A visitor = this browser, counted once per day.
    if (store('localStorage', 'txbio_seen_day') !== day) {
      if (!store('localStorage', 'txbio_seen_day')) data.newVisitors = inc;
      store('localStorage', 'txbio_seen_day', day);
      data.visitors = inc;
    }
    firebase.firestore().collection('traffic').doc(day).set(data, { merge: true }).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.firebase || !firebase.firestore || !firebase.auth) return;
    if (!firebase.apps.length && typeof firebaseConfig !== 'undefined') firebase.initializeApp(firebaseConfig);
    // Wait for sign-in to settle (Firebase may first report "signed out"),
    // so the admin's own browsing isn't counted.
    var sent = false;
    function go(u) { if (!sent) { sent = true; send(u); } }
    firebase.auth().onAuthStateChanged(function (u) { if (u) go(u); });
    setTimeout(function () { go(firebase.auth().currentUser); }, 1800);
  });
})();
