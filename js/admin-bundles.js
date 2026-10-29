// admin-bundles.js — Admin → Panels (admin only): research panels sold as a
// discounted set (js/bundles.js). Shows list price, panel price, cost and margin,
// and flags wording that reads like human-use guidance.
(function () {
  var db = null, units = {}, unitList = [], costs = {}, bundles = [], editing = null, rows = [];
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function say(text, ok) { var el = $('bd-msg'); el.innerHTML = text; el.style.display = text ? 'block' : 'none'; el.style.color = ok ? 'var(--mint-dark)' : 'var(--danger)'; }

  document.addEventListener('userReady', function (e) {
    Staff.role(e.detail.user).then(function (r) {
      if (r !== 'admin') { $('admin-denied').style.display = 'block'; return; }
      db = firebase.firestore();
      $('admin-content').style.display = 'block';
      Promise.all([
        fetch('functions/catalog.json', { cache: 'no-cache' }).then(function (x) { return x.json(); }),
        db.collection('costs').get().catch(function () { return null; })
      ]).then(function (res) {
        units = Bundles.unitsFromCatalog(res[0]);
        unitList = Object.keys(units).sort(function (a, b) { return units[a].label.localeCompare(units[b].label, undefined, { numeric: true }); });
        if (res[1]) res[1].forEach(function (d) { if (typeof d.data().perVialCost === 'number') costs[d.id] = d.data().perVialCost; });
        wire(); resetForm(); load();
      });
    });
  });

  function load() {
    db.collection('bundles').get().then(function (snap) {
      bundles = [];
      snap.forEach(function (d) { bundles.push(Object.assign({ id: d.id }, d.data())); });
      bundles.sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || String(a.name).localeCompare(String(b.name)); });
      render();
    }).catch(function (err) {
      $('bd-list').innerHTML = '<tr><td colspan="5">Could not load: ' + esc(err.message) + (/permission/i.test(err.message) ? '. Publish the updated Firestore rules first.' : '') + '</td></tr>';
    });
  }
  function costOf(b) {
    var c = 0, known = true;
    (b.items || []).forEach(function (it) { if (typeof costs[it.slug] === 'number') c += costs[it.slug] * it.qty; else known = false; });
    return known ? c : null;
  }
  function render() {
    $('bd-list').innerHTML = bundles.map(function (b) {
      var t = Bundles.totals(b, units), c = costOf(b);
      return '<tr><td data-label="Panel"><strong>' + esc(b.name) + '</strong>' + (b.active ? '' : ' <span class="field-note">(hidden)</span>') +
        '<br><span class="field-note">' + (b.items || []).map(function (it) { return units[it.slug] ? esc(units[it.slug].label) + (it.qty > 1 ? ' ×' + it.qty : '') : '<span style="color:var(--alert)">' + esc(it.slug) + ' (not in catalog)</span>'; }).join(', ') + '</span></td>' +
        '<td data-label="Price">' + money(t.price) + '<br><span class="field-note">list ' + money(t.list) + ' · ' + (b.discountPercent || 0) + '% off</span></td>' +
        '<td data-label="Margin">' + (c == null ? '<span class="field-note">add costs</span>' : money(t.price - c) + '<br><span class="field-note">cost ' + money(c) + '</span>') + '</td>' +
        '<td><button type="button" class="btn-outline-light" data-edit="' + esc(b.id) + '">Edit</button> <button type="button" class="btn-outline-light" data-del="' + esc(b.id) + '">Delete</button></td></tr>';
    }).join('') || '<tr><td colspan="4">No panels yet. Make one above.</td></tr>';
    document.querySelectorAll('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { edit(b.getAttribute('data-edit')); }); });
    document.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Delete this panel? Carts that already have it will be asked to remove it.')) return;
        db.collection('bundles').doc(b.getAttribute('data-del')).delete().then(load).catch(function (err) { alert('Could not delete: ' + err.message); });
      });
    });
  }

  // ---------- Form ----------
  function drawRows() {
    var opts = '<option value="">Choose a product…</option>' + unitList.map(function (s) { return '<option value="' + esc(s) + '">' + esc(units[s].label) + ' — $' + units[s].price + '</option>'; }).join('');
    $('bd-items').innerHTML = rows.map(function (r, i) {
      return '<tr data-i="' + i + '"><td><select class="bd-prod">' + opts + '</select></td>' +
        '<td><input type="number" class="bd-qty" min="1" max="20" step="1" value="' + r.qty + '"></td>' +
        '<td class="bd-line"></td><td><button type="button" class="btn-outline-light bd-rm" aria-label="Remove">&times;</button></td></tr>';
    }).join('');
    Array.prototype.forEach.call($('bd-items').querySelectorAll('tr'), function (tr) {
      var r = rows[Number(tr.getAttribute('data-i'))];
      tr.querySelector('.bd-prod').value = r.slug;
      tr.querySelector('.bd-prod').addEventListener('change', function () { r.slug = this.value; refresh(); });
      tr.querySelector('.bd-qty').addEventListener('input', function () { r.qty = Math.max(1, parseInt(this.value, 10) || 1); refresh(); });
      tr.querySelector('.bd-rm').addEventListener('click', function () { rows.splice(rows.indexOf(r), 1); if (!rows.length) rows.push({ slug: '', qty: 1 }); drawRows(); });
    });
    refresh();
  }
  function current() {
    return { name: $('bd-name').value.trim(), description: $('bd-desc').value.trim(), discountPercent: Math.round(Number($('bd-pct').value) || 0),
      items: rows.filter(function (r) { return units[r.slug]; }).map(function (r) { return { slug: r.slug, qty: r.qty }; }),
      active: $('bd-active').checked, sort: Math.round(Number($('bd-sort').value) || 0) };
  }
  function refresh() {
    var b = current();
    Array.prototype.forEach.call($('bd-items').querySelectorAll('tr'), function (tr) {
      var r = rows[Number(tr.getAttribute('data-i'))], u = units[r.slug];
      tr.querySelector('.bd-line').innerHTML = u ? money(Bundles.priceFor(u.price, b.discountPercent) * r.qty) + '<br><span class="field-note">list ' + money(u.price * r.qty) + '</span>' : '';
    });
    var t = Bundles.totals(b, units), c = costOf(b);
    $('bd-summary').innerHTML = b.items.length
      ? 'Panel price <strong>' + money(t.price) + '</strong> (list ' + money(t.list) + ', saves ' + money(t.save) + ')' + (c == null ? '' : ' · your margin ' + money(t.price - c))
      : 'Add at least two products.';
    var w = Bundles.warnings(b.name + ' ' + b.description);
    $('bd-warn').innerHTML = w.length ? '<strong>Reword this:</strong> “' + w.map(esc).join('”, “') + '” reads like use instructions or health claims. Keep it to the research area.' : '';
    $('bd-warn').style.display = w.length ? 'block' : 'none';
  }
  function resetForm() {
    editing = null;
    $('bd-form').reset(); $('bd-pct').value = 10; $('bd-active').checked = true; $('bd-sort').value = 0;
    rows = [{ slug: '', qty: 1 }, { slug: '', qty: 1 }];
    $('bd-title').textContent = 'New panel'; $('bd-cancel').style.display = 'none'; say('');
    drawRows();
  }
  function edit(id) {
    var b = bundles.filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    editing = id;
    $('bd-name').value = b.name || ''; $('bd-desc').value = b.description || ''; $('bd-pct').value = b.discountPercent || 0;
    $('bd-active').checked = !!b.active; $('bd-sort').value = b.sort || 0;
    rows = (b.items || []).map(function (it) { return { slug: it.slug, qty: it.qty }; });
    $('bd-title').textContent = 'Edit ' + b.name; $('bd-cancel').style.display = '';
    drawRows();
    $('bd-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'panel'; }

  function wire() {
    ['bd-name', 'bd-desc', 'bd-pct'].forEach(function (id) { $(id).addEventListener('input', refresh); });
    $('bd-add').addEventListener('click', function () { rows.push({ slug: '', qty: 1 }); drawRows(); });
    $('bd-cancel').addEventListener('click', resetForm);
    $('bd-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var b = current();
      if (!b.name) return say('Give the panel a name.');
      if (b.items.length < 2) return say('A panel needs at least two products.');
      var slugs = b.items.map(function (i) { return i.slug; });
      if (slugs.some(function (s, i) { return slugs.indexOf(s) !== i; })) return say('Each product can be in the panel once; raise its quantity instead.');
      if (!(b.discountPercent >= 0 && b.discountPercent <= 60)) return say('Use a discount from 0% to 60%.');
      var w = Bundles.warnings(b.name + ' ' + b.description);
      if (w.length && !confirm('The name or description uses “' + w.join('”, “') + '”, which can read as use instructions or health claims. Save anyway?')) return;
      b.updatedAt = new Date().toISOString();
      var id = editing || slugify(b.name);
      if (!editing && bundles.some(function (x) { return x.id === id; })) id += '-' + Date.now().toString(36).slice(-4);
      $('bd-save').disabled = true;
      db.collection('bundles').doc(id).set(b).then(function () {
        $('bd-save').disabled = false;
        resetForm();
        say('Saved. It’s on the <a href="bundles.html" target="_blank">Research panels</a> page' + (b.active ? '' : ' once you turn it on') + '.', true);
        load();
      }).catch(function (err) {
        $('bd-save').disabled = false;
        say('Could not save: ' + esc(err.message) + (/permission/i.test(err.message) ? ' Publish the updated Firestore rules first.' : ''));
      });
    });
  }
})();
