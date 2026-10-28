// admin-incoming.js — Admin → Incoming (admin-incoming.html): add supplier
// shipments (in kits), follow them, and receive them into stock
// (js/incoming.js). The UPS tracker updates status and, if the shipment
// allows it, receives it automatically on delivery.
(function () {
  var ADMIN_EMAIL = 'gabecolton@gmail.com';
  var KIT = Incoming.KIT_SIZE;
  var units = [];          // [{ slug, name }] every stock-able product/size
  var unitName = {};
  var stock = {};
  var shipments = [];
  var lots = [];
  var editing = null;      // id being edited
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function n(v) { return Number(v || 0).toLocaleString('en-US'); }
  function db() { return firebase.firestore(); }
  function fmtDate(iso, withYear) {
    if (!iso) return '';
    var d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
  }
  function todayIso() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function trackUrl(num) {
    var t = String(num || '').replace(/\s+/g, '').toUpperCase();
    if (/^1Z[0-9A-Z]{16}$/.test(t)) return 'https://www.ups.com/track?tracknum=' + t;
    if (/^9\d{19,21}$/.test(t)) return 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + t;
    if (/^(\d{12}|\d{15})$/.test(t)) return 'https://www.fedex.com/fedextrack/?trknbr=' + t;
    return '';
  }

  // ---------- form ----------
  function unitOptions(selected) {
    return '<option value="">Choose a product…</option>' + units.map(function (u) {
      return '<option value="' + esc(u.slug) + '"' + (u.slug === selected ? ' selected' : '') + '>' + esc(u.name) + '</option>';
    }).join('');
  }
  function addLine(item) {
    item = item || {};
    var tr = document.createElement('tr');
    var kits = item.kits != null ? item.kits : (item.qty ? item.qty / KIT : 1);
    tr.innerHTML = '<td><select class="inc-unit">' + unitOptions(item.slug) + '</select></td>' +
      '<td><input type="number" class="inc-kits" min="1" step="1" value="' + esc(kits) + '"></td>' +
      '<td class="inc-vials"></td>' +
      '<td><input type="text" class="inc-lot" maxlength="40" value="' + esc(item.lot || '') + '" placeholder="e.g. 20261015"></td>' +
      '<td><input type="date" class="inc-exp" value="' + esc(item.exp || '') + '"></td>' +
      '<td><button type="button" class="inc-remove" aria-label="Remove line">Remove</button></td>';
    $('inc-lines').appendChild(tr);
    tr.querySelector('.inc-kits').addEventListener('input', totals);
    tr.querySelector('.inc-unit').addEventListener('change', totals);
    tr.querySelector('.inc-remove').addEventListener('click', function () { tr.remove(); totals(); });
    totals();
  }
  function readLines() {
    return Array.prototype.map.call($('inc-lines').querySelectorAll('tr'), function (tr) {
      var slug = tr.querySelector('.inc-unit').value, kits = Math.round(Number(tr.querySelector('.inc-kits').value) || 0);
      return { slug: slug, name: unitName[slug] || slug, kits: kits, qty: kits * KIT,
        lot: tr.querySelector('.inc-lot').value.trim(), exp: tr.querySelector('.inc-exp').value || '' };
    });
  }
  function totals() {
    var kits = 0;
    Array.prototype.forEach.call($('inc-lines').querySelectorAll('tr'), function (tr) {
      var k = Math.round(Number(tr.querySelector('.inc-kits').value) || 0);
      tr.querySelector('.inc-vials').textContent = k > 0 ? n(k * KIT) + ' vials' : '—';
      kits += Math.max(0, k);
    });
    $('inc-total').textContent = kits ? n(kits) + ' kit' + (kits === 1 ? '' : 's') + ' · ' + n(kits * KIT) + ' vials' : '';
  }
  function openForm(ship) {
    editing = ship ? ship.id : null;
    $('inc-form-title').textContent = ship ? 'Edit shipment' : 'New incoming shipment';
    $('inc-supplier').value = ship ? ship.supplier || '' : (localStorage.getItem('txbio_last_supplier') || '');
    $('inc-reference').value = ship ? ship.reference || '' : '';
    $('inc-tracking').value = ship ? ship.trackingNumber || '' : '';
    $('inc-expected').value = ship ? ship.expectedDate || '' : '';
    $('inc-notes').value = ship ? ship.notes || '' : '';
    $('inc-auto').checked = ship ? ship.autoReceive !== false : true;
    $('inc-lines').innerHTML = '';
    (ship ? ship.items : [null]).forEach(function (i) { addLine(i); });
    $('inc-form-error').style.display = 'none';
    $('inc-form').hidden = false;
    $('inc-new-btn').hidden = true;
    $('inc-supplier').focus();
    $('inc-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeForm() { $('inc-form').hidden = true; $('inc-new-btn').hidden = false; editing = null; }

  function save(e) {
    e.preventDefault();
    var lines = readLines();
    var err = '';
    if (!$('inc-supplier').value.trim()) err = 'Add the supplier.';
    else if (!lines.length) err = 'Add at least one product.';
    else if (lines.some(function (l) { return !l.slug; })) err = 'Choose a product on every line (or remove the empty line).';
    else if (lines.some(function (l) { return !(l.kits > 0); })) err = 'Every line needs at least 1 kit.';
    if (err) { $('inc-form-error').textContent = err; $('inc-form-error').style.display = 'block'; return; }
    var fields = {
      supplier: $('inc-supplier').value.trim(),
      reference: $('inc-reference').value.trim(),
      trackingNumber: $('inc-tracking').value.replace(/\s+/g, '').toUpperCase(),
      expectedDate: $('inc-expected').value || '',
      notes: $('inc-notes').value.trim(),
      autoReceive: $('inc-auto').checked,
      items: lines,
      updatedAt: new Date().toISOString()
    };
    try { localStorage.setItem('txbio_last_supplier', fields.supplier); } catch (e2) {}
    var btn = $('inc-save'); btn.disabled = true; btn.textContent = 'Saving…';
    var p;
    if (editing) {
      var old = shipments.filter(function (s) { return s.id === editing; })[0] || {};
      if (fields.trackingNumber !== (old.trackingNumber || '')) { fields.trackingStatusText = ''; fields.trackingCheckedAt = null; }
      p = db().collection('incoming').doc(editing).update(fields);
    } else {
      fields.status = 'ordered';
      fields.createdAt = new Date().toISOString();
      p = db().collection('incoming').add(fields);
    }
    p.then(function () { closeForm(); return load(); }).catch(function (ex) {
      $('inc-form-error').textContent = 'Could not save: ' + ex.message + (/permission/i.test(ex.message) ? ' Publish the updated Firestore rules first.' : '');
      $('inc-form-error').style.display = 'block';
    }).then(function () { btn.disabled = false; btn.textContent = 'Save shipment'; });
  }

  // ---------- lists ----------
  function itemsTable(items, receiving) {
    var anyLot = receiving || items.some(function (i) { return i.lot || i.exp; });
    return '<table class="catalog-table pnl-table inc-items"><thead><tr><th>Product</th><th>Kits</th><th>Vials</th>' + (anyLot ? '<th>Lot #</th><th>Expires</th>' : '') + '<th>In stock now</th>' + (receiving ? '<th>Kits received</th><th>After</th>' : '') + '</tr></thead><tbody>' +
      items.map(function (i, k) {
        var have = stock[i.slug];
        var kits = i.kits != null ? i.kits : i.qty / KIT;
        var lotCells = !anyLot ? '' : receiving
          ? '<td><input type="text" class="inc-rlot" data-k="' + k + '" maxlength="40" value="' + esc(i.lot || '') + '"></td><td><input type="date" class="inc-rexp" data-k="' + k + '" value="' + esc(i.exp || '') + '"></td>'
          : '<td>' + esc(i.lot || '—') + '</td><td>' + (i.exp ? esc(fmtDate(i.exp, true)) : '—') + '</td>';
        return '<tr><td>' + esc(unitName[i.slug] || i.name) + '</td><td>' + n(kits) + '</td><td>' + n(i.qty) + '</td>' + lotCells +
          '<td>' + (typeof have === 'number' ? n(have) : '<span class="inc-untracked">not tracked</span>') + '</td>' +
          (receiving ? '<td><input type="number" class="inc-recv" data-k="' + k + '" min="0" step="1" value="' + esc(kits) + '"></td><td class="inc-after" data-k="' + k + '"></td>' : '') + '</tr>';
      }).join('') + '</tbody></table>';
  }
  function card(s) {
    var st = s.status || 'ordered';
    var url = trackUrl(s.trackingNumber);
    var overdue = s.expectedDate && s.expectedDate < todayIso() && (st === 'ordered' || st === 'in-transit');
    var kits = (s.items || []).reduce(function (a, i) { return a + (i.kits != null ? i.kits : i.qty / KIT); }, 0);
    var meta = [
      s.reference ? 'Order ' + esc(s.reference) : '',
      'Added ' + fmtDate(s.createdAt),
      s.expectedDate ? '<span class="' + (overdue ? 'todo-warn' : '') + '">Expected ' + fmtDate(s.expectedDate) + (overdue ? ' (late)' : '') + '</span>' : '',
      n(kits) + ' kit' + (kits === 1 ? '' : 's') + ' · ' + n(Incoming.totalUnits(s.items)) + ' vials'
    ].filter(Boolean).join(' · ');
    var tracking = s.trackingNumber
      ? 'Tracking ' + (url ? '<a href="' + url + '" target="_blank" rel="noopener">' + esc(s.trackingNumber) + '</a>' : esc(s.trackingNumber)) +
        (s.trackingStatusText ? ' · ' + esc(s.trackingStatusText) : '') +
        (s.trackingCheckedAt ? ' <span class="inc-checked">(checked ' + fmtDate(s.trackingCheckedAt) + ')</span>' : '')
      : '<span class="inc-untracked">No tracking number yet.</span> <a href="#" data-edit="' + esc(s.id) + '">Add one</a>';
    return '<div class="inc-card" id="inc-' + esc(s.id) + '">' +
      '<div class="inc-card-head"><div><strong>' + esc(s.supplier || 'Supplier') + '</strong><div class="inc-meta">' + meta + '</div></div>' +
      '<span class="status-pill inc-status-' + esc(st) + '">' + esc(Incoming.STATUS[st] || st) + '</span></div>' +
      '<p class="inc-tracking">' + tracking + '</p>' +
      (s.autoReceive !== false && s.trackingNumber ? '<p class="inc-auto-line">Adds to stock automatically when UPS shows it delivered.</p>' : '') +
      (s.notes ? '<p class="inc-notes">' + esc(s.notes) + '</p>' : '') +
      '<div class="inc-items-wrap">' + itemsTable(s.items || []) + '</div>' +
      '<div class="inc-actions"><button type="button" class="btn" data-receive="' + esc(s.id) + '">Receive into stock</button>' +
      '<button type="button" class="btn-outline-light" data-edit="' + esc(s.id) + '">Edit</button>' +
      '<button type="button" class="inc-cancel-link" data-cancel="' + esc(s.id) + '">Cancel shipment</button></div>' +
      '<p class="inc-msg" role="status"></p></div>';
  }
  function doneCard(s) {
    var lines = s.receivedItems || [];
    var auto = /auto/i.test(s.receivedBy || '');
    return '<details class="inc-done"><summary><strong>' + esc(s.supplier || 'Supplier') + '</strong>' + (s.reference ? ' · Order ' + esc(s.reference) : '') +
      ' · ' + (s.status === 'cancelled' ? 'Cancelled' : 'Received ' + fmtDate(s.receivedAt, true) + (auto ? ' (automatically, UPS delivered)' : '')) +
      ' · ' + n(Incoming.totalUnits(s.status === 'cancelled' ? s.items : lines)) + ' vials</summary>' +
      (s.status === 'cancelled' ? '' : '<table class="catalog-table pnl-table inc-items"><thead><tr><th>Product</th><th>Added</th><th>Stock before</th><th>Stock after</th></tr></thead><tbody>' +
        lines.map(function (l) { return '<tr><td>' + esc(unitName[l.slug] || l.name) + '</td><td>+' + n(l.qty) + '</td><td>' + (l.before == null ? 'not tracked' : n(l.before)) + '</td><td>' + n(l.after) + '</td></tr>'; }).join('') + '</tbody></table>') +
      '</details>';
  }

  function render() {
    $('inc-loading').style.display = 'none';
    var open = shipments.filter(function (s) { return Incoming.OPEN.indexOf(s.status || 'ordered') !== -1; })
      .sort(function (a, b) { var r = { delivered: 0, 'in-transit': 1, ordered: 2 }; return (r[a.status] - r[b.status]) || String(a.createdAt).localeCompare(String(b.createdAt)); });
    var done = shipments.filter(function (s) { return s.status === 'received' || s.status === 'cancelled'; })
      .sort(function (a, b) { return String(b.receivedAt || b.updatedAt).localeCompare(String(a.receivedAt || a.updatedAt)); }).slice(0, 25);
    $('inc-open').innerHTML = open.map(card).join('');
    $('inc-open-count').textContent = open.length;
    $('inc-open-wrap').hidden = !open.length;
    $('inc-empty').hidden = !!open.length;
    var inStock = lots.filter(function (l) { return (Number(l.qtyRemaining) || 0) > 0; }).sort(Lots.order);
    $('inc-lots').innerHTML = '<thead><tr><th>Product</th><th>Lot #</th><th>Expires</th><th>Vials left</th><th>Received</th></tr></thead><tbody>' +
      inStock.map(function (l) {
        var d = Lots.daysLeft(l.exp), warn = d != null && d <= Lots.WARN_DAYS;
        return '<tr><td>' + esc(unitName[l.slug] || l.name) + '</td><td>' + esc(l.lot || '—') + '</td>' +
          '<td' + (warn ? ' class="todo-warn"' : '') + '>' + (l.exp ? esc(fmtDate(l.exp, true)) + (d != null ? (d < 0 ? ' (expired)' : ' (' + d + ' days)') : '') : '—') + '</td>' +
          '<td>' + n(l.qtyRemaining) + ' of ' + n(l.qtyReceived) + '</td><td>' + esc(fmtDate(l.receivedAt, true)) + (l.supplier ? ' · ' + esc(l.supplier) : '') + '</td></tr>';
      }).join('') + '</tbody>';
    $('inc-lots-wrap').hidden = !inStock.length;
    $('inc-done').innerHTML = done.map(doneCard).join('');
    $('inc-done-wrap').hidden = !done.length;
    var sup = {}; shipments.forEach(function (s) { if (s.supplier) sup[s.supplier] = 1; });
    $('inc-suppliers').innerHTML = Object.keys(sup).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('');

    document.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); openForm(shipments.filter(function (s) { return s.id === b.getAttribute('data-edit'); })[0]); });
    });
    document.querySelectorAll('[data-cancel]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Cancel this shipment? Nothing is added to stock.')) return;
        db().collection('incoming').doc(b.getAttribute('data-cancel')).update({ status: 'cancelled', updatedAt: new Date().toISOString() }).then(load);
      });
    });
    document.querySelectorAll('[data-receive]').forEach(function (b) {
      b.addEventListener('click', function () { startReceive(b.getAttribute('data-receive')); });
    });
  }

  // Receive: lets you adjust kits actually received, previews new stock, then commits.
  function startReceive(id) {
    var s = shipments.filter(function (x) { return x.id === id; })[0];
    var el = $('inc-' + id);
    el.querySelector('.inc-items-wrap').innerHTML = itemsTable(s.items || [], true) +
      '<p class="section-note">Change a number if a kit is missing or extra, and add lot numbers and expiration dates from the labels. Products marked "not tracked" start being tracked at the new count.</p>';
    var preview = function () {
      el.querySelectorAll('.inc-recv').forEach(function (inp) {
        var k = Number(inp.getAttribute('data-k')), i = s.items[k], have = stock[i.slug];
        var add = Math.max(0, Math.round(Number(inp.value) || 0)) * KIT;
        el.querySelector('.inc-after[data-k="' + k + '"]').textContent = n((typeof have === 'number' ? have : 0) + add) + ' (+' + n(add) + ')';
      });
    };
    el.querySelectorAll('.inc-recv').forEach(function (inp) { inp.addEventListener('input', preview); });
    preview();
    var actions = el.querySelector('.inc-actions');
    actions.innerHTML = '<button type="button" class="btn inc-confirm">Add to stock</button><button type="button" class="btn-outline-light inc-back">Back</button>';
    actions.querySelector('.inc-back').addEventListener('click', render);
    actions.querySelector('.inc-confirm').addEventListener('click', function () {
      var btn = this; btn.disabled = true; btn.textContent = 'Adding…';
      var items = (s.items || []).map(function (i, k) {
        var kits = Math.max(0, Math.round(Number(el.querySelector('.inc-recv[data-k="' + k + '"]').value) || 0));
        var lotIn = el.querySelector('.inc-rlot[data-k="' + k + '"]'), expIn = el.querySelector('.inc-rexp[data-k="' + k + '"]');
        return { slug: i.slug, name: unitName[i.slug] || i.name, qty: kits * KIT, lot: lotIn ? lotIn.value.trim() : '', exp: expIn ? expIn.value : '' };
      });
      Incoming.receive(db(), id, { items: items, by: 'admin' }).catch(function (err) {
        // Firestore rules not yet updated for lots: add the stock anyway.
        if (!/permission/i.test(err.message)) throw err;
        return Incoming.receive(db(), id, { items: items, by: 'admin', noLots: true }).then(function (r) {
          alert('Added to stock. Lot numbers weren\u2019t saved because the Firestore rules need updating (publish the latest firestore.rules).');
          return r;
        });
      }).then(function (r) {
        if (r.already) el.querySelector('.inc-msg').textContent = 'Already received.';
        return load();
      }).catch(function (err) {
        btn.disabled = false; btn.textContent = 'Add to stock';
        el.querySelector('.inc-msg').textContent = 'Could not add to stock: ' + err.message;
      });
    });
  }

  function load() {
    return Promise.all([db().collection('incoming').get(), db().collection('inventory').get(), db().collection('lots').get().catch(function () { return null; })]).then(function (r) {
      shipments = []; stock = {}; lots = [];
      if (r[2]) r[2].forEach(function (d) { lots.push(Object.assign({ id: d.id }, d.data())); });
      r[0].forEach(function (d) { shipments.push(Object.assign({ id: d.id }, d.data())); });
      r[1].forEach(function (d) { if (typeof d.data().qty === 'number') stock[d.id] = d.data().qty; });
      render();
    }).catch(function (err) {
      $('inc-loading').style.display = '';
      $('inc-loading').textContent = 'Could not load: ' + err.message + (/permission/i.test(err.message) ? '. Publish the updated Firestore rules (firestore.rules) first.' : '');
    });
  }

  document.addEventListener('userReady', function (e) {
    if (e.detail.user.email !== ADMIN_EMAIL) { $('admin-denied').style.display = 'block'; return; }
    $('admin-content').style.display = 'block';
    $('inc-tracking-note').textContent = window.AUTO_SHIP_TRACKING
      ? 'UPS tracking numbers are checked about every 30 minutes.'
      : 'Automatic UPS tracking starts once the UPS connection is set up. Until then, use Receive into stock when a box arrives.';
    fetch('functions/catalog.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (cat) {
      Object.keys(cat.products).forEach(function (slug) {
        var p = cat.products[slug];
        if (p.doses) Object.keys(p.doses).forEach(function (ds) { units.push({ slug: ds, name: p.name + ' ' + p.doses[ds].label }); });
        else units.push({ slug: slug, name: p.name });
      });
      units.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }); });
      units.forEach(function (u) { unitName[u.slug] = u.name; });
      return load();
    });
    $('inc-new-btn').addEventListener('click', function () { openForm(null); });
    $('inc-cancel-form').addEventListener('click', closeForm);
    $('inc-add-line').addEventListener('click', function () { addLine(); });
    $('inc-form').addEventListener('submit', save);
  });
})();
