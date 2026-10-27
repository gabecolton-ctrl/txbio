// profile-gate.js — makes sure every account has a name and a shipping
// address. After sign-in, if the profile (users/{uid}) is missing either, a
// pop-up asks for it. On checkout it can't be skipped; elsewhere "Later"
// hides it for this browser session. The sign-up form (login.html) asks for
// the same fields up front, using the helpers below.

var ProfileGate = (function () {
  var STATES = [
    ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
    ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
    ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
    ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
    ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
    ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
    ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
    ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
    ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']
  ];
  var ADMIN_EMAIL = 'gabecolton@gmail.com';
  var SNOOZE_KEY = 'txbio_profile_later';

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // "Texas", "tx" → "TX"; anything unrecognized → "".
  function stateCode(v) {
    var s = String(v || '').trim().toLowerCase();
    if (!s) return '';
    for (var i = 0; i < STATES.length; i++) {
      if (STATES[i][0].toLowerCase() === s || STATES[i][1].toLowerCase() === s) return STATES[i][0];
    }
    return '';
  }

  function stateOptions(selected) {
    var code = stateCode(selected);
    return '<option value="">Choose…</option>' + STATES.map(function (st) {
      return '<option value="' + st[0] + '"' + (st[0] === code ? ' selected' : '') + '>' + st[1] + '</option>';
    }).join('');
  }

  function validZip(z) { return /^\d{5}(-\d{4})?$/.test(String(z || '').trim()); }

  // Which required fields are missing or invalid (empty list = complete).
  function missing(p) {
    p = p || {};
    var out = [];
    if (!String(p.name || '').trim()) out.push('name');
    if (!String(p.addressLine1 || '').trim()) out.push('addressLine1');
    if (!String(p.city || '').trim()) out.push('city');
    if (!stateCode(p.state)) out.push('state');
    if (!validZip(p.zip)) out.push('zip');
    return out;
  }

  // The address fields as HTML (shared by sign-up and the pop-up).
  // prefix keeps ids unique; values prefills them.
  function fieldsHtml(prefix, values, opts) {
    values = values || {};
    opts = opts || {};
    var v = function (k) { return esc(values[k] || ''); };
    return (opts.includeName ? '<label for="' + prefix + '-name">Full name</label><input type="text" id="' + prefix + '-name" required autocomplete="name" value="' + v('name') + '">' : '') +
      '<label for="' + prefix + '-address1">Street address</label>' +
      '<input type="text" id="' + prefix + '-address1" required autocomplete="address-line1" value="' + v('addressLine1') + '">' +
      '<label for="' + prefix + '-address2">Apt, suite, unit <span class="field-note">(optional)</span></label>' +
      '<input type="text" id="' + prefix + '-address2" autocomplete="address-line2" value="' + v('addressLine2') + '">' +
      '<div class="addr-row">' +
        '<div class="addr-city"><label for="' + prefix + '-city">City</label><input type="text" id="' + prefix + '-city" required autocomplete="address-level2" value="' + v('city') + '"></div>' +
        '<div class="addr-state"><label for="' + prefix + '-state">State</label><select id="' + prefix + '-state" required autocomplete="address-level1">' + stateOptions(values.state) + '</select></div>' +
        '<div class="addr-zip"><label for="' + prefix + '-zip">ZIP</label><input type="text" id="' + prefix + '-zip" required inputmode="numeric" autocomplete="postal-code" maxlength="10" pattern="\\d{5}(-\\d{4})?" value="' + v('zip') + '"></div>' +
      '</div>';
  }

  // Reads the fields back; returns { values, error }.
  function readFields(prefix, opts) {
    opts = opts || {};
    var g = function (id) { var el = document.getElementById(prefix + '-' + id); return el ? el.value.trim() : ''; };
    var values = {
      addressLine1: g('address1'), addressLine2: g('address2'), city: g('city'),
      state: stateCode(g('state')), zip: g('zip')
    };
    if (opts.includeName) values.name = g('name');
    var need = missing(Object.assign({ name: opts.includeName ? values.name : 'x' }, values));
    if (need.length) {
      var labels = { name: 'your full name', addressLine1: 'a street address', city: 'a city', state: 'a state', zip: 'a 5-digit ZIP code' };
      return { values: values, error: 'Please add ' + need.map(function (k) { return labels[k]; }).join(', ') + '.' };
    }
    return { values: values, error: '' };
  }

  // ---------- Pop-up for existing accounts ----------
  function isCheckout() { return /\/checkout\.html$/.test(location.pathname); }
  function skipPage() { return /\/(login|admin-[a-z-]+)\.html$/.test(location.pathname); }

  function showPrompt(uid, profile) {
    if (document.getElementById('profile-gate')) return;
    var required = isCheckout();
    var wrap = document.createElement('div');
    wrap.id = 'profile-gate';
    wrap.className = 'pg-overlay';
    wrap.innerHTML =
      '<div class="pg-dialog" role="dialog" aria-modal="true" aria-labelledby="pg-title">' +
        '<h2 id="pg-title">Finish your account</h2>' +
        '<p class="pg-lead">We need your name and shipping address so orders reach you. You can change them anytime under Account details.</p>' +
        '<form id="pg-form" novalidate>' +
          fieldsHtml('pg', profile, { includeName: true }) +
          '<p id="pg-error" class="form-message is-error" style="display:none;"></p>' +
          '<div class="pg-actions"><button type="submit" class="btn">Save</button>' +
          (required ? '' : '<button type="button" class="btn-outline-light" id="pg-later">Later</button>') + '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(wrap);
    document.body.classList.add('pg-open');
    var first = wrap.querySelector('input:not([value]), input[value=""]') || wrap.querySelector('input');
    if (first) setTimeout(function () { first.focus(); }, 50);

    var later = document.getElementById('pg-later');
    function close() { wrap.remove(); document.body.classList.remove('pg-open'); }
    if (later) later.addEventListener('click', function () {
      try { sessionStorage.setItem(SNOOZE_KEY, '1'); } catch (e) {}
      close();
    });
    wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape' && later) later.click(); });

    document.getElementById('pg-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var r = readFields('pg', { includeName: true });
      var err = document.getElementById('pg-error');
      if (r.error) { err.textContent = r.error; err.style.display = 'block'; return; }
      var btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Saving…';
      r.values.updatedAt = new Date().toISOString();
      firebase.firestore().collection('users').doc(uid).set(r.values, { merge: true }).then(function () {
        close();
        document.dispatchEvent(new CustomEvent('profileCompleted', { detail: r.values }));
      }).catch(function (ex) {
        btn.disabled = false; btn.textContent = 'Save';
        err.textContent = 'Could not save: ' + ex.message; err.style.display = 'block';
      });
    });
  }

  function check(user) {
    if (!user || skipPage() || user.email === ADMIN_EMAIL) return;
    var snoozed = false;
    try { snoozed = sessionStorage.getItem(SNOOZE_KEY) === '1'; } catch (e) {}
    if (snoozed && !isCheckout()) return;
    firebase.firestore().collection('users').doc(user.uid).get().then(function (doc) {
      var p = doc.exists ? doc.data() : {};
      if (missing(p).length) showPrompt(user.uid, p);
    }).catch(function () { /* offline or rules: don't block the page */ });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      if (!window.firebase || !firebase.auth || !firebase.firestore) return;
      if (!firebase.apps.length && typeof firebaseConfig !== 'undefined') firebase.initializeApp(firebaseConfig); // const in firebase-config.js, not on window
      firebase.auth().onAuthStateChanged(function (user) { setTimeout(function () { check(user); }, 300); });
    });
  }

  return { STATES: STATES, stateCode: stateCode, stateOptions: stateOptions, validZip: validZip, missing: missing, fieldsHtml: fieldsHtml, readFields: readFields };
})();
