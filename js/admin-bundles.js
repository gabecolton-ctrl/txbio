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
  // Research-area groupings from the catalog (GLP-1s left out on purpose).
  var SUGGESTED = [
    ['Tissue Repair Research Panel', 'BPC-157, TB-500 (Thymosin Beta-4 fragment) and KPV, three synthetic peptides frequently cited in preclinical research on connective tissue, cell migration and inflammatory signaling models.', ['bpc-157-10mg', 'tb500-thymosin-beta-4-10mg', 'kpv-10mg']],
    ['GH Secretagogue Research Panel', 'CJC-1295 (without DAC), a GHRH analog, paired with Ipamorelin, a selective ghrelin-receptor agonist. Both are widely referenced in research on growth hormone secretion pathways.', ['cjc-1295-without-dac-10mg', 'ipamorelin-10mg']],
    ['Copper Peptide Research Panel', 'GHK-Cu and AHK-Cu, copper-binding tripeptide complexes studied in dermal, collagen and extracellular matrix research models.', ['ghk-cu-100mg', 'ahk-cu']],
    ['Mitochondrial Research Panel', 'MOTS-c, a mitochondrial-derived peptide, SS-31 (Elamipretide), a mitochondria-targeting tetrapeptide, and NAD+, a central coenzyme in cellular metabolism. Used in research on mitochondrial function and cellular energy pathways.', ['mots-c-human-10mg', 'ss-31-10mg', 'nad-plus-500mg']],
    ['Neuropeptide Research Panel', 'Semax and Selank, synthetic analogs of naturally occurring regulatory peptides, with Pinealon, a short tripeptide. Commonly referenced in neuroscience and neuropeptide signaling research.', ['semax-10mg', 'selank', 'pinealon']],
    ['Thymic Peptide Research Panel', 'Thymosin Alpha-1 and Thymalin, peptides originally characterized from thymic tissue, with KPV, a tripeptide fragment of alpha-MSH. Studied in immunology and inflammatory signaling research.', ['thymosin-alpha-1', 'thymalin-thymulin', 'kpv-10mg']],
    ['Bioregulator Research Panel', 'Epithalon, Pinealon and Cartalax, short synthetic peptides from the Khavinson bioregulator research tradition. Studied in research on gene expression and cellular regulation in aging models.', ['epithalon', 'pinealon', 'cartalax']],
    ['Sermorelin Secretagogue Research Panel', 'Sermorelin, a GHRH(1-29) analog, paired with Ipamorelin, a selective ghrelin-receptor agonist, for comparative research on growth hormone secretion pathways.', ['sermorelin-acetate-10mg', 'ipamorelin-10mg']],
    ['GH / IGF Axis Research Panel', 'Tesamorelin, a stabilized GHRH analog, with IGF-1 LR3, a long-acting IGF-1 variant. Referenced in research spanning the growth hormone and IGF-1 signaling axis.', ['tesamorelin-10mg', 'igf-1-lr3']],
    ['Neurotrophic Research Panel', 'Cerebrolysin, a neuropeptide preparation; Dihexa, an angiotensin IV-derived compound; and Semax, an ACTH(4-10) analog. Studied in neurotrophic signaling research models.', ['cerebrolysin', 'dihexa', 'semax-10mg']],
    ['Mitochondrial-Derived Peptide Research Panel', 'Humanin and MOTS-c, two peptides encoded in mitochondrial DNA, studied in research on mitochondrial-nuclear signaling and cellular stress responses.', ['humanin', 'mots-c-human-10mg']],
    ['Cellular Metabolism Research Panel', '5-Amino-1MQ, an NNMT inhibitor; NAD+, a central metabolic coenzyme; and L-Carnitine, a fatty-acid transport cofactor. Used in research on cellular energy metabolism.', ['5-amino-1mq-10mg', 'nad-plus-100mg', 'l-carnitine-600mg']],
    ['Redox Research Panel', 'Glutathione, the primary cellular thiol antioxidant; SS-31, a mitochondria-targeting peptide; and NAD+. Studied in oxidative stress and redox balance research.', ['glutathione-600mg', 'ss-31-10mg', 'nad-plus-100mg']],
    ['Host Defense Peptide Research Panel', 'LL-37, a human cathelicidin antimicrobial peptide; KPV, an alpha-MSH tripeptide fragment; and Thymosin Alpha-1, a thymic peptide. Studied in innate immunity research.', ['ll37', 'kpv-10mg', 'thymosin-alpha-1']],
    ['HPG Axis Research Panel', 'Kisspeptin-10, an upstream regulator of GnRH signaling, with HCG, a glycoprotein hormone that acts at the LH receptor. Used in hypothalamic-pituitary-gonadal axis research.', ['kisspeptin-10', 'hcg-5000iu']],
    ['Tissue Protection Research Panel', 'ARA-290, a non-erythropoietic EPO-derived peptide; BPC-157; and KPV. Referenced in preclinical research on tissue-protective and inflammatory signaling pathways.', ['ara290-cibinetide', 'bpc-157-10mg', 'kpv-10mg']]
  ];
  // The first version's one-line descriptions; panels still using them get the longer text.
  var OLD_DESC = [
    'Peptides studied in connective tissue and wound-repair research models.',
    'A GHRH analog and a ghrelin-receptor agonist used in growth hormone secretion research.',
    'Copper peptide complexes studied in dermal and extracellular matrix research.',
    'Compounds studied in mitochondrial function and cellular energy research.',
    'Synthetic neuropeptides studied in neuroscience research models.',
    'Thymic peptides and fragments studied in immunology research.',
    'Short peptide bioregulators studied in cellular regulation and aging research.'
  ];
  function addSuggested() {
    var byId = {};
    bundles.forEach(function (b) { byId[b.id] = b; });
    var batch = db.batch(), added = 0, updated = 0, now = new Date().toISOString();
    SUGGESTED.forEach(function (s, i) {
      var id = slugify(s[0]), have = byId[id];
      if (have) {
        var sameItems = (have.items || []).map(function (x) { return x.slug; }).sort().join() === s[2].slice().sort().join();
        if (OLD_DESC.indexOf(have.description) !== -1 && sameItems) { batch.update(db.collection('bundles').doc(id), { description: s[1], updatedAt: now }); updated++; }
        return;
      }
      if (!s[2].every(function (x) { return units[x]; })) return;
      batch.set(db.collection('bundles').doc(id), { name: s[0], description: s[1], discountPercent: 15, items: s[2].map(function (x) { return { slug: x, qty: 1 }; }), active: false, sort: i + 1, updatedAt: now });
      added++;
    });
    if (!added && !updated) return say('All the suggested panels are already here.', true);
    batch.commit().then(function () {
      say((added ? added + ' suggested panel' + (added === 1 ? '' : 's') + ' added, hidden. ' : '') + (updated ? updated + ' existing panel' + (updated === 1 ? '' : 's') + ' got the longer description. ' : '') +
        (added ? 'Edit each new one and tick “Show on site” when you’re happy with it.' : ''), true);
      load();
    }).catch(function (err) { say('Could not add: ' + esc(err.message) + (/permission/i.test(err.message) ? ' Publish the updated Firestore rules first.' : '')); });
  }
  function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'panel'; }

  function wire() {
    ['bd-name', 'bd-desc', 'bd-pct'].forEach(function (id) { $(id).addEventListener('input', refresh); });
    $('bd-add').addEventListener('click', function () { rows.push({ slug: '', qty: 1 }); drawRows(); });
    $('bd-cancel').addEventListener('click', resetForm);
    $('bd-suggest').addEventListener('click', addSuggested);
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
