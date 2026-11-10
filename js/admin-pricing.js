// admin-pricing.js — Admin → Pricing: product prices and shipping options,
// saved to settings/pricing and applied site-wide by js/price-book.js.
(function () {
  var ADMIN_EMAIL = 'gabecolton@gmail.com';
  var db = null;
  var saved = null;     // what's in Firestore now, normalized
  var draft = null;     // what's on screen
  var catalog = null;   // default prices (functions/catalog.json)
  var costs = {};       // unitSlug -> perVialCost
  var rows = [];        // [{ slug, name, size, def, caseEligible }]

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function money(n) { return PriceBook.money(round2(n)); }

  function normalize(doc) {
    var sh = PriceBook.shippingOf(doc);
    var prices = {};
    Object.keys((doc && doc.prices) || {}).forEach(function (k) { if (typeof doc.prices[k] === 'number') prices[k] = doc.prices[k]; });
    var bp = {};
    var bsrc = (doc && doc.budget && doc.budget.prices) || {};
    Object.keys(bsrc).forEach(function (k) { if (typeof bsrc[k] === 'number') bp[k] = bsrc[k]; });
    return { prices: prices, shipping: { options: sh.options, freeMin: sh.freeMin, freeOption: sh.freeOption, platinumOption: sh.platinumOption },
      budget: { percentOff: PriceBook.budgetPercent(doc), prices: bp } };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function dirty() { return JSON.stringify(draft) !== JSON.stringify(saved); }

  document.addEventListener('userReady', function (e) {
    if (e.detail.user.email !== ADMIN_EMAIL) { $('admin-denied').style.display = 'block'; return; }
    $('admin-content').style.display = 'block';
    db = firebase.firestore();
    Promise.all([
      db.collection('settings').doc('pricing').get(),
      PriceBook.defaults(),
      db.collection('costs').get().catch(function () { return null; })
    ]).then(function (r) {
      saved = normalize(r[0].exists ? r[0].data() : null);
      draft = clone(saved);
      catalog = r[1];
      if (r[2]) r[2].forEach(function (d) { var c = Number(d.data().perVialCost); if (c > 0) costs[d.id] = c; });
      buildRows();
      $('budget-pct').value = draft.budget.percentOff;
      drawShipping();
      drawPrices();
      status();
    }).catch(function (err) {
      $('price-rows').innerHTML = '<tr><td colspan="7">Could not load: ' + esc(err.message) + '</td></tr>';
    });
  });

  function buildRows() {
    rows = [];
    if (!catalog) return;
    Object.keys(catalog.products).forEach(function (slug) {
      var p = catalog.products[slug];
      if (p.doses) {
        Object.keys(p.doses).forEach(function (ds) {
          rows.push({ slug: ds, product: slug, name: p.name, size: p.doses[ds].label, def: p.doses[ds].price, caseEligible: p.caseEligible });
        });
      } else {
        rows.push({ slug: slug, product: slug, name: p.name, size: String(p.packSize || '').replace(/^1 vial x\s*/i, ''), def: p.price, caseEligible: p.caseEligible });
      }
    });
    rows.sort(function (a, b) { return a.name.localeCompare(b.name) || a.def - b.def; });
  }

  // ---------- Shipping ----------
  function drawShipping() {
    var sh = draft.shipping;
    $('ship-rows').innerHTML = sh.options.map(function (o, i) {
      return '<tr data-i="' + i + '">' +
        '<td><input type="text" class="pr-input pr-name" value="' + esc(o.label) + '" maxlength="40" aria-label="Shipping option name"></td>' +
        '<td><span class="pr-money"><span>$</span><input type="number" class="pr-input pr-ship-price" min="0" step="0.01" inputmode="decimal" value="' + o.price + '" aria-label="Price for ' + esc(o.label) + '"></span></td>' +
        '<td><label class="checkbox-row pr-check"><input type="checkbox" class="pr-on"' + (o.enabled ? ' checked' : '') + '> <span>Show</span></label></td>' +
        '<td><button type="button" class="pr-remove" aria-label="Remove ' + esc(o.label) + '">Remove</button></td></tr>';
    }).join('');
    drawPicks();
  }

  // The free-shipping and Platinum dropdowns (redrawn without touching the rows,
  // so typing in a row keeps its place).
  function drawPicks() {
    var sh = draft.shipping;
    var on = sh.options.filter(function (o) { return o.enabled; });
    $('free-option').innerHTML = '<option value="">No free shipping</option>' + on.map(function (o) {
      return '<option value="' + esc(o.id) + '"' + (o.id === sh.freeOption ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');
    $('platinum-option').innerHTML = on.map(function (o) {
      return '<option value="' + esc(o.id) + '"' + (o.id === sh.platinumOption ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');
    $('free-min').value = sh.freeMin;
    $('free-min').disabled = !sh.freeOption;
  }

  // Keep free / Platinum picks pointing at options that are still shown.
  function fixPicks() {
    var sh = draft.shipping;
    var ids = sh.options.filter(function (o) { return o.enabled; }).map(function (o) { return o.id; });
    if (sh.freeOption && ids.indexOf(sh.freeOption) === -1) sh.freeOption = '';
    if (ids.indexOf(sh.platinumOption) === -1) sh.platinumOption = ids[ids.length - 1] || '';
  }

  $('ship-rows').addEventListener('input', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var o = draft.shipping.options[+tr.getAttribute('data-i')];
    if (e.target.classList.contains('pr-name')) o.label = e.target.value;
    if (e.target.classList.contains('pr-ship-price')) o.price = e.target.value === '' ? NaN : round2(Number(e.target.value));
    status();
  });
  $('ship-rows').addEventListener('change', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var o = draft.shipping.options[+tr.getAttribute('data-i')];
    if (e.target.classList.contains('pr-name') || e.target.classList.contains('pr-on')) {
      if (e.target.classList.contains('pr-on')) o.enabled = e.target.checked;
      fixPicks(); drawPicks(); status();
    }
  });
  $('ship-rows').addEventListener('click', function (e) {
    if (!e.target.classList.contains('pr-remove')) return;
    var i = +e.target.closest('tr').getAttribute('data-i');
    draft.shipping.options.splice(i, 1);
    fixPicks(); drawShipping(); status();
  });
  $('ship-add').addEventListener('click', function () {
    draft.shipping.options.push({ id: 'opt-' + Date.now().toString(36), label: '', price: NaN, enabled: true });
    drawShipping(); status();
    var names = document.querySelectorAll('#ship-rows .pr-name');
    if (names.length) names[names.length - 1].focus();
  });
  $('free-option').addEventListener('change', function () { draft.shipping.freeOption = this.value; drawPicks(); status(); });
  $('platinum-option').addEventListener('change', function () { draft.shipping.platinumOption = this.value; status(); });
  $('budget-pct').addEventListener('input', function () {
    draft.budget.percentOff = this.value === '' ? NaN : Number(this.value);
    if (draft.budget.percentOff >= 0 && draft.budget.percentOff < 100) drawPrices();
    status();
  });
  $('free-min').addEventListener('input', function () { draft.shipping.freeMin = this.value === '' ? NaN : round2(Number(this.value)); status(); });

  // ---------- Product prices ----------
  function priceOf(r) { var o = draft.prices[r.slug]; return typeof o === 'number' ? o : r.def; }
  function visibleRows() {
    var q = $('pr-search').value.trim().toLowerCase();
    var changedOnly = $('pr-changed-only').checked;
    return rows.filter(function (r) {
      if (changedOnly && typeof draft.prices[r.slug] !== 'number' && typeof draft.budget.prices[r.slug] !== 'number') return false;
      return !q || r.name.toLowerCase().indexOf(q) !== -1 || r.slug.indexOf(q) !== -1;
    });
  }
  function caseText(r) {
    if (!r.caseEligible || !catalog) return '<span class="pr-muted">vials only</span>';
    return money(priceOf(r) * (catalog.caseSize - catalog.freeVials));
  }
  // Budget store price (js/price-book.js: TXBio price minus the percent, or its own).
  function budgetPriceOf(r) { return PriceBook.priceOf(draft, r.slug, r.def, 'budget'); }
  function budgetAuto(r) { return PriceBook.priceOf({ prices: draft.prices, budget: { percentOff: draft.budget.percentOff, prices: {} } }, r.slug, r.def, 'budget'); }
  function marginOf(p, cost) {
    var m = p - cost, pct = p > 0 ? Math.round(m / p * 100) : 0;
    return '<span class="' + (m < 0 ? 'pr-loss' : m / Math.max(p, 0.01) < 0.3 ? 'pr-thin' : '') + '">' + money(m) + ' (' + pct + '%)</span>';
  }
  function marginText(r) {
    var unitSlug = r.slug;
    var cost = costs[unitSlug] != null ? costs[unitSlug] : costs[r.product];
    var none = '<span class="pr-muted">&mdash;</span>';
    if (cost == null) return { cost: none, margin: none, budget: none };
    return { cost: money(cost), margin: marginOf(priceOf(r), cost), budget: marginOf(budgetPriceOf(r), cost) };
  }
  function rowHtml(r) {
    var o = draft.prices[r.slug];
    var changed = typeof o === 'number';
    var mt = marginText(r);
    return '<tr data-slug="' + esc(r.slug) + '"' + (changed ? ' class="pr-changed"' : '') + '>' +
      '<td>' + esc(r.name) + '</td><td>' + esc(r.size) + '</td>' +
      '<td class="pr-def" data-label="Site">' + money(r.def) + '</td>' +
      '<td><span class="pr-money"><span>$</span><input type="number" class="pr-input pr-price" min="0" step="0.01" inputmode="decimal" placeholder="' + r.def + '" value="' + (changed ? o : '') + '" aria-label="Price for ' + esc(r.name + ' ' + r.size) + '"></span></td>' +
      '<td class="pr-case" data-label="Case">' + caseText(r) + '</td>' +
      '<td class="pr-cost" data-label="Cost">' + mt.cost + '</td><td class="pr-margin" data-label="Margin">' + mt.margin + '</td>' +
      '<td class="pr-budget-cell"><span class="pr-money"><span>$</span><input type="number" class="pr-input pr-bprice" min="0" step="0.01" inputmode="decimal" placeholder="' + budgetAuto(r) + '" value="' + (typeof draft.budget.prices[r.slug] === 'number' ? draft.budget.prices[r.slug] : '') + '" aria-label="Budget store price for ' + esc(r.name + ' ' + r.size) + '"></span></td>' +
      '<td class="pr-bmargin" data-label="Budget margin">' + mt.budget + '</td></tr>';
  }
  function drawPrices() {
    var list = visibleRows();
    $('price-rows').innerHTML = list.length ? list.map(rowHtml).join('') : '<tr><td colspan="9">No products match.</td></tr>';
  }
  function refreshRow(tr) {
    var r = rows.filter(function (x) { return x.slug === tr.getAttribute('data-slug'); })[0];
    if (!r) return;
    tr.classList.toggle('pr-changed', typeof draft.prices[r.slug] === 'number');
    tr.querySelector('.pr-case').innerHTML = caseText(r);
    var mt = marginText(r);
    tr.querySelector('.pr-cost').innerHTML = mt.cost;
    tr.querySelector('.pr-margin').innerHTML = mt.margin;
    tr.querySelector('.pr-bmargin').innerHTML = mt.budget;
    tr.querySelector('.pr-bprice').placeholder = budgetAuto(r);
    tr.classList.toggle('pr-bchanged', typeof draft.budget.prices[r.slug] === 'number');
  }

  $('price-rows').addEventListener('input', function (e) {
    if (e.target.classList.contains('pr-bprice')) {
      var btr = e.target.closest('tr'), bslug = btr.getAttribute('data-slug');
      var bv = e.target.value.trim();
      if (bv === '' || !(Number(bv) >= 0)) delete draft.budget.prices[bslug];
      else draft.budget.prices[bslug] = round2(Number(bv));
      refreshRow(btr);
      status();
      return;
    }
    if (!e.target.classList.contains('pr-price')) return;
    var tr = e.target.closest('tr');
    var slug = tr.getAttribute('data-slug');
    var r = rows.filter(function (x) { return x.slug === slug; })[0];
    var v = e.target.value.trim();
    if (v === '' || Number(v) === r.def) delete draft.prices[slug];
    else if (Number(v) >= 0) draft.prices[slug] = round2(Number(v));
    refreshRow(tr);
    status();
  });
  $('pr-search').addEventListener('input', drawPrices);
  $('pr-changed-only').addEventListener('change', drawPrices);
  $('pr-bulk-btn').addEventListener('click', function () {
    var pct = Number($('pr-bulk-pct').value);
    if (!pct || !isFinite(pct)) { $('pr-bulk-pct').focus(); return; }
    var list = visibleRows();
    list.forEach(function (r) {
      var p = Math.max(0, Math.round(priceOf(r) * (1 + pct / 100))); // whole dollars
      if (p === r.def) delete draft.prices[r.slug]; else draft.prices[r.slug] = p;
    });
    $('pr-bulk-pct').value = '';
    drawPrices();
    status((pct > 0 ? '+' : '') + pct + '% applied to ' + list.length + ' price' + (list.length === 1 ? '' : 's') + ' (rounded to whole dollars). Not saved yet.');
  });

  // ---------- Save ----------
  function problems() {
    var out = [];
    var sh = draft.shipping;
    if (!sh.options.some(function (o) { return o.enabled; })) out.push('Show at least one shipping option.');
    sh.options.forEach(function (o) {
      if (!String(o.label).trim()) out.push('Every shipping option needs a name.');
      if (!(o.price >= 0)) out.push('Give ' + (o.label || 'each shipping option') + ' a price.');
    });
    if (sh.freeOption && !(sh.freeMin >= 0)) out.push('Set the free shipping minimum.');
    if (!(draft.budget.percentOff >= 0 && draft.budget.percentOff < 100)) out.push('Set the budget store percent (0\u201399).');
    return out.filter(function (x, i) { return out.indexOf(x) === i; });
  }
  function status(note) {
    var d = dirty();
    var p = d ? problems() : [];
    $('pr-save').disabled = !d || p.length > 0;
    $('pr-undo').disabled = !d;
    $('pr-savebar').classList.toggle('is-dirty', d);
    var changedCount = Object.keys(draft.prices).length;
    $('pr-status').textContent = note || (p.length ? p[0] : d ? 'Unsaved changes.' : changedCount ? changedCount + ' price' + (changedCount === 1 ? '' : 's') + ' changed from the site price. Saved.' : 'No changes.');
  }
  $('pr-undo').addEventListener('click', function () { draft = clone(saved); $('budget-pct').value = draft.budget.percentOff; drawShipping(); drawPrices(); status(); });
  $('pr-save').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    draft.shipping.options.forEach(function (o) { o.label = String(o.label).trim(); });
    var doc = {
      prices: draft.prices,
      shipping: draft.shipping,
      budget: draft.budget,
      updatedAt: new Date().toISOString(),
      updatedBy: firebase.auth().currentUser.email
    };
    db.collection('settings').doc('pricing').set(doc).then(function () {
      try { localStorage.setItem('txbio_pricebook', JSON.stringify(doc)); } catch (e) {}
      saved = clone(draft);
      btn.textContent = 'Save changes';
      drawShipping();
      status('Saved. Live on the site now.');
    }).catch(function (err) {
      btn.textContent = 'Save changes';
      btn.disabled = false;
      status('Could not save: ' + err.message);
    });
  });
  window.addEventListener('beforeunload', function (e) {
    if (draft && saved && dirty()) { e.preventDefault(); e.returnValue = ''; }
  });
})();
