// referrals-page.js — the affiliate dashboard (referrals.html). Shows the
// signed-in user's referral code(s) with a link to copy or share, how many
// orders the code brought in, credit earned, and the current balance.
// Reads only what the user can already read: promo codes (signed-in users)
// and their own credits/{email} + entries. The admin can preview any
// affiliate with ?as=their@email.
(function () {
  var ADMIN_EMAIL = 'gabecolton@gmail.com';
  var SITE = 'https://txbioresearch.com';
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  var TYPE_TEXT = { 'first-order': 'on their first order', 'repeat-order': 'on repeat orders', always: 'on every order' };

  function copy(btn, text) {
    var done = function () {
      var label = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('is-done');
      setTimeout(function () { btn.textContent = label; btn.classList.remove('is-done'); }, 1600);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { prompt('Copy this link:', text); });
    else prompt('Copy this link:', text);
  }

  function linkCard(promo) {
    var code = promo.code, url = SITE + '/?code=' + encodeURIComponent(code);
    var perks = promo.active
      ? 'Gives customers <strong>' + esc(promo.discountPercent) + '% off</strong> ' + esc(TYPE_TEXT[promo.type] || '') + '.'
      : '<span class="ref-paused">This code is paused right now. Contact us if you think that’s a mistake.</span>';
    var extra = [['Catalog', '/services.html'], ['Reconstitution calculator', '/calculator.html']];
    return '<div class="ref-card">' +
      '<span class="ref-card-label">Your link · code ' + esc(code) + '</span>' +
      '<div class="ref-card-row"><code class="ref-card-url">' + esc(url.replace('https://', '')) + '</code>' +
      '<button type="button" class="btn ref-copy-main" data-copy="' + esc(url) + '">Copy link</button>' +
      (navigator.share ? '<button type="button" class="btn-outline-light ref-share" data-share="' + esc(url) + '">Share</button>' : '') + '</div>' +
      '<p class="ref-card-perk">' + perks + '</p>' +
      '<p class="ref-card-more">Your code works on any page. Other links to share: ' + extra.map(function (x) {
        var u = SITE + x[1] + '?code=' + encodeURIComponent(code);
        return '<button type="button" class="ref-mini" data-copy="' + esc(u) + '">' + esc(x[0]) + '</button>';
      }).join(' ') + '</p>' +
    '</div>';
  }

  function render(email, codes, account, entries) {
    $('ref-loading').style.display = 'none';
    if (!codes.length) { $('ref-none').style.display = ''; return; }
    $('ref-body').style.display = '';
    $('ref-links').innerHTML = codes.map(linkCard).join('');
    if (window.Credits) $('ref-earn-rate').textContent = 'You earn ' + Math.round(Credits.COMMISSION_RATE * 100) + '%';

    var myCodes = codes.map(function (c) { return c.code; });
    var placed = codes.reduce(function (n, c) { return n + (Number(c.timesUsed) || 0); }, 0);
    var credited = {}, earnedCents = 0;
    entries.forEach(function (en) {
      if (en.type === 'earned') { earnedCents += en.amountCents || 0; if (en.orderId) credited[en.orderId] = true; }
      if (en.type === 'reversed') { earnedCents += en.amountCents || 0; if (en.orderId) delete credited[en.orderId]; }
    });
    var shipped = Object.keys(credited).length;
    var fmt = window.Credits ? Credits.formatCents : function (c) { return '$' + (c / 100).toFixed(2); };
    $('ref-stats').innerHTML = [
      ['Orders placed with your code', placed, ''],
      ['Orders shipped', shipped, 'these earned you credit'],
      ['Credit earned', fmt(Math.max(0, earnedCents)), 'all time'],
      ['Credit balance', fmt(account ? account.balanceCents : 0), 'ready to use at checkout']
    ].map(function (r) {
      return '<div class="pnl-tile"><span class="pnl-label">' + r[0] + '</span><span class="pnl-value">' + r[1] + '</span>' + (r[2] ? '<span class="pnl-sub">' + r[2] + '</span>' : '') + '</div>';
    }).join('');

    var LABELS = { earned: 'Referral credit', reversed: 'Referral reversed (order cancelled)', spent: 'Used at checkout', refunded: 'Returned (order cancelled)', adjusted: 'Adjustment' };
    var rows = entries.map(function (en) {
      var amt = en.amountCents || 0;
      var activity = (LABELS[en.type] || en.type) + (en.type === 'earned' && en.code && myCodes.length > 1 ? ' (' + esc(en.code) + ')' : '');
      return '<tr><td>' + esc(en.createdAt ? new Date(en.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '') + '</td>' +
        '<td>' + activity + '</td><td>' + esc(en.orderNumber ? '#' + en.orderNumber : '') + '</td>' +
        '<td class="' + (amt < 0 ? 'ref-neg' : 'ref-pos') + '">' + (amt < 0 ? '-' : '+') + fmt(Math.abs(amt)) + '</td></tr>';
    });
    $('ref-history').innerHTML = rows.join('');
    $('ref-history-wrap').style.display = rows.length ? '' : 'none';
    $('ref-history-empty').style.display = rows.length ? 'none' : '';

    document.querySelectorAll('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copy(b, b.getAttribute('data-copy')); }); });
    document.querySelectorAll('[data-share]').forEach(function (b) {
      b.addEventListener('click', function () {
        navigator.share({ title: 'TXBioResearch', text: 'Research peptides from Dallas, TX. My code saves you money:', url: b.getAttribute('data-share') }).catch(function () {});
      });
    });
  }

  document.addEventListener('userReady', function (e) {
    var user = e.detail.user;
    var email = String(user.email || '').toLowerCase();
    var as = new URLSearchParams(location.search).get('as');
    if (as && user.email === ADMIN_EMAIL) {
      email = as.trim().toLowerCase();
      $('ref-lead').textContent = 'Admin preview: what ' + email + ' sees.';
    }
    var db = firebase.firestore();
    db.collection('promoCodes').where('affiliateEmail', '==', email).get().then(function (snap) {
      var codes = [];
      snap.forEach(function (d) { codes.push(Object.assign({ code: d.id }, d.data())); });
      codes.sort(function (a, b) { return (b.active ? 1 : 0) - (a.active ? 1 : 0) || (a.code < b.code ? -1 : 1); });
      if (!codes.length || !window.Credits) return render(email, codes, null, []);
      return Promise.all([
        Credits.getAccount(email).catch(function () { return null; }),
        Credits.getEntries(email, 100).catch(function () { return []; })
      ]).then(function (r) { render(email, codes, r[0], r[1]); });
    }).catch(function (err) {
      $('ref-loading').textContent = 'Could not load your referrals: ' + err.message;
    });
  });
})();
