// admin-carts.js — Admin → Carts: what signed-in customers have in their cart
// right now (carts/{uid}), newest first. Carts empty out when an order is placed,
// so anything here hasn't been ordered yet.
(function () {
  var IDLE_HOURS = 24;
  var rows = [];
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function hoursSince(iso) { return iso ? (Date.now() - new Date(iso).getTime()) / 36e5 : Infinity; }
  function age(iso) {
    var h = hoursSince(iso);
    if (!isFinite(h)) return 'unknown';
    if (h < 1) return Math.max(1, Math.round(h * 60)) + ' min ago';
    if (h < 24) return Math.round(h) + 'h ago';
    var d = Math.floor(h / 24); return d + ' day' + (d === 1 ? '' : 's') + ' ago';
  }

  document.addEventListener('userReady', function (e) {
    Staff.role(e.detail.user).then(function (r) {
      if (!Staff.canOpen(r, 'admin-carts.html')) { $('admin-denied').style.display = 'block'; return; }
      $('admin-content').style.display = 'block';
      ['carts-filter', 'carts-search'].forEach(function (id) { $(id).addEventListener('input', render); });
      load();
    });
  });

  function load() {
    var db = firebase.firestore();
    Promise.all([db.collection('carts').get(), db.collection('users').get()]).then(function (r) {
      var users = {};
      r[1].forEach(function (d) { users[d.id] = d.data(); });
      rows = [];
      r[0].forEach(function (d) {
        var items = (d.data().items || []).filter(function (i) { return Number(i.qty) > 0; });
        if (!items.length) return;
        var u = users[d.id] || {};
        var dn = String(u.displayName || '').split(' — ');
        rows.push({
          uid: d.id, items: items, updatedAt: d.data().updatedAt || '',
          email: u.email || '', name: u.name || dn[0] || '', institution: u.institution || dn[1] || '',
          value: items.reduce(function (s, i) { return s + Number(i.price) * Number(i.qty); }, 0),
          units: items.reduce(function (s, i) { return s + Number(i.qty) * (Number(i.caseOf) || 1); }, 0)
        });
      });
      rows.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
      $('carts-loading').style.display = 'none';
      $('carts-body').style.display = '';
      render();
    }).catch(function (err) {
      $('carts-loading').textContent = 'Could not load carts: ' + err.message + (/permission/i.test(err.message) ? ' Publish the updated Firestore rules first.' : '');
    });
  }

  function render() {
    var f = $('carts-filter').value, q = $('carts-search').value.trim().toLowerCase();
    var list = rows.filter(function (c) {
      var idle = hoursSince(c.updatedAt) >= IDLE_HOURS;
      if (f === 'idle' && !idle) return false;
      if (f === 'fresh' && idle) return false;
      return !q || [c.name, c.email, c.institution].concat(c.items.map(function (i) { return i.name; })).join(' ').toLowerCase().indexOf(q) !== -1;
    });
    var all = rows.length, idleN = rows.filter(function (c) { return hoursSince(c.updatedAt) >= IDLE_HOURS; }).length;
    $('carts-stats').innerHTML =
      stat(all, 'active cart' + (all === 1 ? '' : 's')) +
      stat(money(rows.reduce(function (s, c) { return s + c.value; }, 0)), 'in carts') +
      stat(idleN, 'idle ' + IDLE_HOURS + 'h+');
    $('carts-rows').innerHTML = list.map(function (c) {
      var idle = hoursSince(c.updatedAt) >= IDLE_HOURS;
      var items = c.items.map(function (i) { return esc(i.name) + ' <span class="cart-pack">' + esc(i.packSize || '') + '</span> ×' + esc(i.qty); }).join('<br>');
      var mail = c.email ? '<a class="btn-outline-light todo-btn" href="mailto:' + encodeURIComponent(c.email) +
        '?subject=' + encodeURIComponent('Your TXBioResearch cart') +
        '&body=' + encodeURIComponent('Hi' + (c.name ? ' ' + c.name.split(' ')[0] : '') + ',\n\nYou left a few items in your cart at txbioresearch.com. They\'re saved whenever you\'re ready: https://txbioresearch.com/cart.html\n\nAny questions, just reply here.\n') + '">Email</a>' : '';
      return '<tr' + (idle ? ' class="cart-idle"' : '') + '>' +
        '<td data-label="Customer"><strong>' + esc(c.name || '(no name yet)') + '</strong><br><span class="cart-sub">' + esc(c.email || c.uid) + '</span></td>' +
        '<td data-label="Items">' + items + '</td>' +
        '<td data-label="Value"><strong>' + money(c.value) + '</strong><br><span class="cart-sub">' + c.units + ' unit' + (c.units === 1 ? '' : 's') + '</span></td>' +
        '<td data-label="Last change">' + esc(age(c.updatedAt)) + '</td>' +
        '<td>' + mail + '</td></tr>';
    }).join('') || '<tr><td colspan="5">' + (all ? 'No carts match.' : 'No one has anything in their cart right now.') + '</td></tr>';
  }
  function stat(v, label) { return '<div class="carts-stat"><span class="carts-stat-v">' + v + '</span><span class="carts-stat-l">' + label + '</span></div>'; }
})();
