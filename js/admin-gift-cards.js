// admin-gift-cards.js — Admin → Gift cards (admin only): create cards that load
// store credit, share them (link, picture, text), and see who redeemed them.
(function () {
  var db = null, me = '', cards = [], shown = null;
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function say(text, ok) { var el = $('gc-msg'); el.innerHTML = text; el.style.display = text ? 'block' : 'none'; el.style.color = ok ? 'var(--mint-dark)' : 'var(--danger)'; }
  function okEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

  document.addEventListener('userReady', function (e) {
    Staff.role(e.detail.user).then(function (r) {
      if (r !== 'admin') { $('admin-denied').style.display = 'block'; return; }
      me = String(e.detail.user.email || '').toLowerCase();
      db = firebase.firestore();
      $('admin-content').style.display = 'block';
      wire();
      load();
    });
  });

  function load() {
    db.collection('giftCards').get().then(function (snap) {
      cards = [];
      snap.forEach(function (d) { cards.push(Object.assign({ code: d.id }, d.data())); });
      cards.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      render();
    }).catch(function (err) {
      $('gc-rows').innerHTML = '<tr><td colspan="6">Could not load: ' + esc(err.message) + (/permission/i.test(err.message) ? '. Publish the updated Firestore rules first.' : '') + '</td></tr>';
    });
  }

  function status(c) {
    if (c.void) return '<span class="gc-status is-void">Voided</span>';
    if (c.redeemedBy) return '<span class="gc-status is-used">Redeemed</span><br><span class="field-note">' + esc(c.redeemedBy) + ' · ' + fmtDate(c.redeemedAt) + '</span>';
    return '<span class="gc-status">Not redeemed</span>' + (c.forEmail ? '<br><span class="field-note">only ' + esc(c.forEmail) + '</span>' : '');
  }
  function stat(v, label) { return '<div class="carts-stat"><span class="carts-stat-v">' + v + '</span><span class="carts-stat-l">' + label + '</span></div>'; }
  function render() {
    var live = cards.filter(function (c) { return !c.void; });
    var open = live.filter(function (c) { return !c.redeemedBy; });
    var sum = function (l, f) { return l.reduce(function (n, c) { return n + (Number(c[f]) || 0); }, 0); };
    $('gc-stats').innerHTML = stat(live.length, 'gift card' + (live.length === 1 ? '' : 's')) +
      stat(GiftCards.money(sum(open, 'amountCents')), 'not redeemed yet') +
      stat(GiftCards.money(sum(live.filter(function (c) { return c.redeemedBy; }), 'amountCents')), 'redeemed') +
      stat(GiftCards.money(sum(live, 'paidCents')), 'paid for');
    $('gc-rows').innerHTML = cards.map(function (c) {
      return '<tr><td data-label="Code"><code class="gc-code">' + esc(c.code) + '</code><br><span class="field-note">' + fmtDate(c.createdAt) + '</span></td>' +
        '<td data-label="Amount"><strong>' + GiftCards.money(c.amountCents) + '</strong>' + (c.paidCents ? '<br><span class="field-note">paid ' + GiftCards.money(c.paidCents) + (c.paidMethod ? ' · ' + esc(c.paidMethod) : '') + '</span>' : '') + '</td>' +
        '<td data-label="For">' + esc(c.toName || '') + (c.toEmail ? '<br><span class="field-note">' + esc(c.toEmail) + '</span>' : '') + (c.from ? '<br><span class="field-note">from ' + esc(c.from) + '</span>' : '') + '</td>' +
        '<td data-label="Status">' + status(c) + '</td>' +
        '<td class="gc-actions">' + (c.void ? '' : '<button type="button" class="btn-outline-light" data-show="' + esc(c.code) + '">Share</button>') +
        (!c.void && !c.redeemedBy ? ' <button type="button" class="btn-outline-light" data-void="' + esc(c.code) + '">Void</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="5">No gift cards yet. Make one above.</td></tr>';
    document.querySelectorAll('[data-show]').forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-show')); }); });
    document.querySelectorAll('[data-void]').forEach(function (b) {
      b.addEventListener('click', function () {
        var code = b.getAttribute('data-void');
        if (!confirm('Void ' + code + '? It can no longer be redeemed.')) return;
        b.disabled = true;
        db.collection('giftCards').doc(code).update({ void: true, voidedAt: new Date().toISOString() }).then(load)
          .catch(function (err) { b.disabled = false; alert('Could not void: ' + err.message); });
      });
    });
  }

  // ---------- Share panel: picture, link, text ----------
  function textFor(c) {
    return (c.toName ? 'Hi ' + c.toName.split(' ')[0] + '! ' : '') + 'Here’s a ' + GiftCards.money(c.amountCents) + ' TXBioResearch gift card' + (c.from ? ' from ' + c.from : '') + '. ' +
      'Redeem it here (it goes into your store credit): ' + GiftCards.redeemUrl(c.code) + '  Code: ' + c.code;
  }
  function show(code) {
    var c = cards.filter(function (x) { return x.code === code; })[0];
    if (!c) return;
    shown = c;
    $('gc-share').style.display = '';
    $('gc-share-title').textContent = GiftCards.money(c.amountCents) + ' gift card' + (c.toName ? ' for ' + c.toName : '');
    $('gc-link').value = GiftCards.redeemUrl(c.code);
    $('gc-text').value = textFor(c);
    GiftCards.drawCard($('gc-canvas'), c).then(function () {
      $('gc-share').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  function copy(text, btn) {
    var done = function () { var t = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = t; }, 1500); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { prompt('Copy this:', text); });
    else prompt('Copy this:', text);
  }

  function wire() {
    $('gc-form').addEventListener('submit', function (e) {
      e.preventDefault();
      say('');
      var amount = Math.round(Number($('gc-amount').value) * 100);
      var toEmail = $('gc-to-email').value.trim().toLowerCase();
      var paid = $('gc-paid').value === '' ? 0 : Math.round(Number($('gc-paid').value) * 100);
      if (!(amount >= 100 && amount <= 500000)) return say('Enter an amount from $1 to $5,000.');
      if (toEmail && !okEmail(toEmail)) return say('That recipient email doesn’t look right.');
      if ($('gc-lock').checked && !toEmail) return say('Add the recipient’s email to lock the card to their account.');
      if (!(paid >= 0)) return say('Enter what they paid, or leave it blank.');
      var code = GiftCards.makeCode();
      var card = {
        amountCents: amount, toName: $('gc-to-name').value.trim().slice(0, 60), toEmail: toEmail,
        forEmail: $('gc-lock').checked ? toEmail : '', from: $('gc-from').value.trim().slice(0, 60),
        message: $('gc-message').value.trim().slice(0, 140), paidCents: paid, paidMethod: paid ? $('gc-paid-method').value : '',
        createdAt: new Date().toISOString(), createdBy: me, void: false, redeemedBy: ''
      };
      var btn = $('gc-submit'); btn.disabled = true;
      db.collection('giftCards').doc(code).set(card).then(function () {
        btn.disabled = false;
        $('gc-form').reset(); $('gc-amount').value = '50';
        say('Gift card <strong>' + code + '</strong> created. Share it below.', true);
        cards.unshift(Object.assign({ code: code }, card));
        render(); show(code);
      }).catch(function (err) {
        btn.disabled = false;
        say('Could not create: ' + esc(err.message) + (/permission/i.test(err.message) ? ' Publish the updated Firestore rules first.' : ''));
      });
    });
    document.querySelectorAll('[data-amt]').forEach(function (b) { b.addEventListener('click', function () { $('gc-amount').value = b.getAttribute('data-amt'); }); });
    $('gc-copy-link').addEventListener('click', function () { copy($('gc-link').value, this); });
    $('gc-copy-text').addEventListener('click', function () { copy($('gc-text').value, this); });
    $('gc-download').addEventListener('click', function () {
      if (!shown) return;
      var a = document.createElement('a');
      a.download = 'txbio-gift-card-' + shown.code + '.png';
      a.href = $('gc-canvas').toDataURL('image/png');
      document.body.appendChild(a); a.click(); a.remove();
    });
    $('gc-sms').addEventListener('click', function () {
      if (shown) location.href = 'sms:?&body=' + encodeURIComponent(textFor(shown));
    });
  }
})();
