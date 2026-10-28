// admin-roles.js — Admin → Roles (admin only).
//
// Firestore (see firestore.rules):
//   staff/{email}            { role: 'manager', addedAt }      who may use the manager pages
//   customerRoles/{roleId}   { name, type: 'percent'|'atcost', percent, markupPerVial,
//                              shippingLabel, shippingPrice, code, active, updatedAt }
//   roleMembers/{email}      { roles: [roleId], updatedAt }     private; buyers read only their own
//
// A role's discount runs through the existing checkout machinery:
//   percent → promoCodes/{CODE} with roleOnly: roleId (works only for members)
//   atcost  → atCostCodes/{CODE} with role: roleId and the members' emails
//             (atCostMembers/ is rebuilt from every active at-cost code)
(function () {
  var ROLE = 'employee';
  var ROLE_NAME = 'Employee';
  var db = null;
  var role = null;        // customerRoles/employee
  var members = [];       // [{ email, addedAt }]
  var managers = [];      // [{ email, addedAt }]
  var locals = [];        // localMembers: pickup / drop-off customers

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function okEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
  function say(id, text, ok) {
    var el = $(id);
    el.textContent = text; el.style.display = text ? 'block' : 'none';
    el.style.color = ok ? 'var(--mint-dark)' : 'var(--danger)';
    if (ok && text) setTimeout(function () { if (el.textContent === text) el.style.display = 'none'; }, 2500);
  }
  function permHint(err) {
    return /permission/i.test(err.message || '') ? ' Publish the updated Firestore rules first.' : '';
  }

  document.addEventListener('userReady', function (e) {
    Staff.role(e.detail.user).then(function (r) {
      if (r !== 'admin') { $('admin-denied').style.display = 'block'; return; }
      $('admin-content').style.display = 'block';
      db = firebase.firestore();
      wire();
      load();
    });
  });

  function load() {
    return Promise.all([
      db.collection('staff').get(),
      db.collection('roleMembers').get(),
      db.collection('customerRoles').doc(ROLE).get(),
      db.collection('localMembers').get().catch(function () { return null; }),
      db.collection('settings').doc('localDelivery').get().catch(function () { return null; })
    ]).then(function (r) {
      $('local-price').value = LocalDelivery.priceOf(r[4] && r[4].exists ? r[4].data() : null);
      locals = [];
      if (r[3]) r[3].forEach(function (d) { locals.push({ email: d.id, addedAt: d.data().addedAt }); });
      locals.sort(byEmail);
      renderLocals();
      managers = [];
      r[0].forEach(function (d) { if (d.data().role === 'manager') managers.push({ email: d.id, addedAt: d.data().addedAt }); });
      members = [];
      r[1].forEach(function (d) { if ((d.data().roles || []).indexOf(ROLE) !== -1) members.push({ email: d.id, addedAt: d.data().addedAt || d.data().updatedAt }); });
      role = r[2].exists ? r[2].data() : null;
      managers.sort(byEmail); members.sort(byEmail);
      fillForm(); renderManagers(); renderMembers();
    }).catch(function (err) {
      $('mgr-rows').innerHTML = $('emp-rows').innerHTML = '<tr><td colspan="3">Could not load: ' + esc(err.message) + '.' + esc(permHint(err)) + '</td></tr>';
    });
  }
  function byEmail(a, b) { return a.email < b.email ? -1 : 1; }

  // ---------- Managers ----------
  function renderManagers() {
    $('mgr-rows').innerHTML = managers.map(function (m) {
      return '<tr><td>' + esc(m.email) + '</td><td>' + esc(fmtDate(m.addedAt)) + '</td><td><button type="button" class="btn-outline-light" data-rm-mgr="' + esc(m.email) + '">Remove</button></td></tr>';
    }).join('') || '<tr><td colspan="3">No managers yet.</td></tr>';
    document.querySelectorAll('[data-rm-mgr]').forEach(function (b) {
      b.addEventListener('click', function () {
        var em = b.getAttribute('data-rm-mgr');
        if (!confirm('Remove ' + em + ' as a manager? They lose access right away.')) return;
        b.disabled = true;
        db.collection('staff').doc(em).delete().then(load).catch(function (err) { b.disabled = false; alert('Could not remove: ' + err.message); });
      });
    });
  }

  // ---------- Pickup / drop-off ----------
  function renderLocals() {
    $('local-rows').innerHTML = locals.map(function (m) {
      return '<tr><td>' + esc(m.email) + '</td><td>' + esc(fmtDate(m.addedAt)) + '</td><td><button type="button" class="btn-outline-light" data-rm-local="' + esc(m.email) + '">Remove</button></td></tr>';
    }).join('') || '<tr><td colspan="3">No one yet.</td></tr>';
    document.querySelectorAll('[data-rm-local]').forEach(function (b) {
      b.addEventListener('click', function () {
        var em = b.getAttribute('data-rm-local');
        if (!confirm('Remove pickup / drop-off for ' + em + '?')) return;
        b.disabled = true;
        db.collection('localMembers').doc(em).delete().then(load).catch(function (err) { b.disabled = false; alert('Could not remove: ' + err.message); });
      });
    });
  }

  // ---------- Employee pricing ----------
  function type() { var r = document.querySelector('input[name="emp-type"]:checked'); return r ? r.value : 'percent'; }
  function showType() {
    $('emp-percent-fields').style.display = type() === 'percent' ? '' : 'none';
    $('emp-atcost-fields').style.display = type() === 'atcost' ? '' : 'none';
  }
  function fillForm() {
    var r = role || {};
    var t = r.type === 'atcost' ? 'atcost' : 'percent';
    document.querySelector('input[name="emp-type"][value="' + t + '"]').checked = true;
    if (r.percent != null) $('emp-percent').value = r.percent;
    if (r.markupPerVial != null) $('emp-markup').value = r.markupPerVial;
    if (r.shippingLabel) $('emp-ship-label').value = r.shippingLabel;
    if (r.shippingPrice != null) $('emp-ship-price').value = r.shippingPrice;
    if (r.code) $('emp-code').value = r.code;
    $('emp-active').checked = r.active !== false;
    showType();
  }

  function renderMembers() {
    $('emp-rows').innerHTML = members.map(function (m) {
      return '<tr><td>' + esc(m.email) + '</td><td>' + esc(fmtDate(m.addedAt)) + '</td><td><button type="button" class="btn-outline-light" data-rm-emp="' + esc(m.email) + '">Remove</button></td></tr>';
    }).join('') || '<tr><td colspan="3">No employees yet.</td></tr>';
    document.querySelectorAll('[data-rm-emp]').forEach(function (b) {
      b.addEventListener('click', function () {
        var em = b.getAttribute('data-rm-emp');
        if (!confirm('Remove ' + em + ' from Employees? They go back to regular prices.')) return;
        b.disabled = true;
        setMember(em, false).then(load).catch(function (err) { b.disabled = false; alert('Could not remove: ' + err.message); });
      });
    });
  }

  function setMember(email, on) {
    var ref = db.collection('roleMembers').doc(email);
    return ref.get().then(function (d) {
      var roles = d.exists ? (d.data().roles || []).filter(function (x) { return x !== ROLE; }) : [];
      if (on) roles.push(ROLE);
      var now = new Date().toISOString();
      if (!roles.length) return ref.delete();
      return ref.set({ roles: roles, updatedAt: now, addedAt: (d.exists && d.data().addedAt) || now });
    }).then(function () {
      members = members.filter(function (m) { return m.email !== email; });
      if (on) members.push({ email: email, addedAt: new Date().toISOString() });
      // At-cost pricing lists the members on its code; keep it in step.
      return role ? applyPricing(role) : null;
    });
  }

  // Writes the role's discount into the checkout's code collections.
  function applyPricing(r) {
    var code = r.code;
    var on = r.active !== false;
    var promoRef = db.collection('promoCodes').doc(code);
    var acRef = db.collection('atCostCodes').doc(code);
    var now = new Date().toISOString();
    var label = ROLE_NAME + ' pricing';
    return Promise.all([promoRef.get(), acRef.get()]).then(function (s) {
      var promo = s[0].exists ? s[0].data() : null, ac = s[1].exists ? s[1].data() : null;
      if (promo && !promo.roleOnly) throw new Error(code + ' is already a regular promo code. Pick another code.');
      if (ac && !ac.role) throw new Error(code + ' is already a family code (At cost page). Pick another code.');
      var batch = db.batch();
      if (r.type === 'percent') {
        batch.set(promoRef, {
          discountPercent: r.percent, type: 'always', active: on, roleOnly: ROLE, label: label,
          affiliateEmail: '', endsOn: '',
          timesUsed: (promo && promo.timesUsed) || 0, totalDiscounted: (promo && promo.totalDiscounted) || 0,
          createdAt: (promo && promo.createdAt) || now, updatedAt: now
        });
        if (ac) batch.delete(acRef);
      } else {
        batch.set(acRef, {
          active: on, emails: members.map(function (m) { return m.email; }), markupPerVial: r.markupPerVial,
          shippingLabel: r.shippingLabel, shippingPrice: r.shippingPrice, role: ROLE, label: label, updatedAt: now
        });
        // Keep the percent code (and its usage numbers), switched off.
        if (promo) batch.update(promoRef, { active: false, updatedAt: now });
      }
      return batch.commit();
    }).then(syncAtCostMembers);
  }

  // atCostMembers/{email} lets family/at-cost buyers read costs; rebuilt from
  // every active at-cost code (same as the At cost page).
  function syncAtCostMembers() {
    return db.collection('atCostCodes').get().then(function (snap) {
      var want = {};
      snap.forEach(function (d) {
        if (!d.data().active) return;
        (d.data().emails || []).forEach(function (em) { (want[em] = want[em] || []).push(d.id); });
      });
      return db.collection('atCostMembers').get().then(function (ms) {
        var batch = db.batch();
        ms.forEach(function (d) { if (!want[d.id]) batch.delete(d.ref); });
        Object.keys(want).forEach(function (em) { batch.set(db.collection('atCostMembers').doc(em), { codes: want[em], updatedAt: new Date().toISOString() }); });
        return batch.commit();
      });
    });
  }

  function wire() {
    document.querySelectorAll('input[name="emp-type"]').forEach(function (r) { r.addEventListener('change', showType); });

    $('mgr-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var em = $('mgr-email').value.trim().toLowerCase();
      if (!okEmail(em)) return say('mgr-msg', 'Enter a valid email.', false);
      if (em === Staff.ADMIN_EMAIL) return say('mgr-msg', 'That’s you; you already have full access.', false);
      if (managers.some(function (m) { return m.email === em; })) return say('mgr-msg', em + ' is already a manager.', false);
      db.collection('staff').doc(em).set({ role: 'manager', addedAt: new Date().toISOString() }).then(function () {
        $('mgr-email').value = '';
        say('mgr-msg', em + ' added. They’ll see the Admin menu next time they load a page.', true);
        return load();
      }).catch(function (err) { say('mgr-msg', 'Could not add: ' + err.message + permHint(err), false); });
    });

    $('local-price-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var price = Math.round(Number($('local-price').value) * 100) / 100;
      if (!(price >= 0 && price <= 1000)) return say('local-price-msg', 'Enter a price from 0 to 1000.', false);
      db.collection('settings').doc('localDelivery').set({ price: price, updatedAt: new Date().toISOString() }).then(function () {
        say('local-price-msg', 'Saved. Checkout shows “' + LocalDelivery.labelFor(price) + '”.', true);
      }).catch(function (err) { say('local-price-msg', 'Could not save: ' + err.message + permHint(err), false); });
    });

    $('local-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var em = $('local-email').value.trim().toLowerCase();
      if (!okEmail(em)) return say('local-msg', 'Enter a valid email.', false);
      if (locals.some(function (m) { return m.email === em; })) return say('local-msg', em + ' already has pickup / drop-off.', false);
      db.collection('localMembers').doc(em).set({ addedAt: new Date().toISOString() }).then(function () {
        $('local-email').value = '';
        say('local-msg', em + ' added.', true);
        return load();
      }).catch(function (err) { say('local-msg', 'Could not add: ' + err.message + permHint(err), false); });
    });

    $('emp-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var r = {
        name: ROLE_NAME,
        type: type(),
        percent: Math.round(Number($('emp-percent').value)),
        markupPerVial: Math.round(Number($('emp-markup').value) * 100) / 100,
        shippingLabel: $('emp-ship-label').value.trim(),
        shippingPrice: Math.round(Number($('emp-ship-price').value) * 100) / 100,
        code: $('emp-code').value.trim().toUpperCase(),
        active: $('emp-active').checked,
        updatedAt: new Date().toISOString()
      };
      if (!/^[A-Z0-9_-]{3,30}$/.test(r.code)) return say('emp-msg', 'Use 3–30 letters, numbers, dashes or underscores for the code.', false);
      if (r.type === 'percent' && !(r.percent >= 1 && r.percent <= 100)) return say('emp-msg', 'Enter a percent from 1 to 100.', false);
      if (r.type === 'atcost' && !(r.markupPerVial >= 0)) return say('emp-msg', 'Enter the amount added per vial (0 or more).', false);
      if (r.type === 'atcost' && (!r.shippingLabel || !(r.shippingPrice >= 0))) return say('emp-msg', 'Enter the employee shipping name and price.', false);
      var btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      var old = role;
      // Renamed code: retire the old one first.
      var retire = old && old.code && old.code !== r.code ? retireCode(old.code) : Promise.resolve();
      retire.then(function () { return applyPricing(r); }).then(function () {
        return db.collection('customerRoles').doc(ROLE).set(r);
      }).then(function () {
        role = r;
        btn.disabled = false;
        say('emp-msg', 'Saved. ' + (r.active ? (r.type === 'percent' ? r.percent + '% off for employees.' : 'Employees pay cost + $' + r.markupPerVial.toFixed(2) + '/vial.') : 'Employee pricing is off.'), true);
      }).catch(function (err) {
        btn.disabled = false;
        say('emp-msg', 'Could not save: ' + err.message + permHint(err), false);
      });
    });

    $('empm-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var em = $('empm-email').value.trim().toLowerCase();
      if (!okEmail(em)) return say('empm-msg', 'Enter a valid email.', false);
      if (members.some(function (m) { return m.email === em; })) return say('empm-msg', em + ' is already an employee.', false);
      setMember(em, true).then(function () {
        $('empm-email').value = '';
        say('empm-msg', em + ' added.' + (role ? '' : ' Save the employee pricing above to turn their discount on.'), true);
        return load();
      }).catch(function (err) { say('empm-msg', 'Could not add: ' + err.message + permHint(err), false); });
    });
  }

  function retireCode(code) {
    var batch = db.batch();
    return Promise.all([db.collection('promoCodes').doc(code).get(), db.collection('atCostCodes').doc(code).get()]).then(function (s) {
      if (s[0].exists && s[0].data().roleOnly === ROLE) batch.update(s[0].ref, { active: false, updatedAt: new Date().toISOString() });
      if (s[1].exists && s[1].data().role === ROLE) batch.delete(s[1].ref);
      return batch.commit();
    });
  }
})();
