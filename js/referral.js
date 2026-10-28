// referral.js — referral links. A link like txbioresearch.com/?code=FRANNY
// saves the code in this browser for 30 days; checkout fills it in and
// applies it automatically (see checkout.html). Affiliate credit then works
// exactly as if the buyer had typed the code. Codes are made on
// Admin > Promo codes (set the affiliate email there).

var Referral = (function () {
  var KEY = 'txbio_ref_code';
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

  function toast(code) {
    var t = document.createElement('div');
    t.className = 'added-toast ref-toast';
    t.setAttribute('role', 'status');
    t.textContent = 'Code ' + code + ' saved. It will be applied at checkout.';
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-hiding'); }, 4000);
    setTimeout(function () { t.remove(); }, 4600);
  }

  if (typeof document !== 'undefined') {
    var code = '';
    try { code = clean(new URLSearchParams(location.search).get('code')); } catch (e) {}
    if (code) {
      var isNew = get() !== code;
      try { localStorage.setItem(KEY, JSON.stringify({ code: code, at: Date.now() })); } catch (e) {}
      if (isNew) document.addEventListener('DOMContentLoaded', function () { toast(code); });
    }
  }

  return { get: get, clear: clear, clean: clean };
})();
