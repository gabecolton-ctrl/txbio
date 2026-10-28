// admin-new-order.js — Admin → New order (admin only).
// Build a custom-priced order for a customer, then either:
//   • send it to their cart as a quote (quotes/{id} + lines in carts/{uid});
//     they check out as usual, certifying 21+ / research use, or
//   • enter it as an order right away (sales by text or phone).
// See js/quotes.js for how quoted lines are priced at checkout.
(function () {
  var TAX_RATE = 0.0825;
  var db = null, me = '';
  var units = [];          // [{ slug, name, label, packSize, price, caseEligible }]
  var unitBySlug = {};
  var costs = {};          // unitSlug -> per-vial cost
  var users = [];          // [{ uid, email, name, institution, address }]
  var catalog = null;
  var lines = [];          // [{ slug, qty, price, isCase }]
  var customer = null;     // a users[] entry, or null
  var quotes = [], orders = [];
  var localPrice = 5;
  var paymentFees = null; // settings/paymentFees (Admin → Payments)

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function mode() { var r = document.querySelector('input[name="no-mode"]:checked'); return r ? r.value : 'cart'; }
  function say(text, ok) {
    var el = $('no-msg');
    el.innerHTML = text; el.style.display = text ? 'block' : 'none';
    el.style.color = ok ? 'var(--mint-dark)' : 'var(--danger)';
  }

  document.addEventListener('userReady', function (e) {
    Staff.role(e.detail.user).then(function (r) {
      if (r !== 'admin') { $('admin-denied').style.display = 'block'; return; }
      me = String(e.detail.user.email || '').toLowerCase();
      $('admin-content').style.display = 'block';
      db = firebase.firestore();
      load();
    });
  });

  function load() {
    Promise.all([
      fetch('functions/catalog.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
      db.collection('users').get(),
      db.collection('costs').get().catch(function () { return null; }),
      db.collection('settings').doc('localDelivery').get().catch(function () { return null; }),
      db.collection('settings').doc('paymentFees').get().catch(function () { return null; })
    ]).then(function (r) {
      paymentFees = r[4] && r[4].exists ? r[4].data() : null;
      localPrice = LocalDelivery.priceOf(r[3] && r[3].exists ? r[3].data() : null);
      catalog = r[0];
      Object.keys(catalog.products).forEach(function (slug) {
        var p = catalog.products[slug];
        var add = function (s, label, price, pack) {
          var u = { slug: s, name: p.name, label: p.name + (label ? ' ' + label : ''), packSize: pack, price: price, caseEligible: !!p.caseEligible };
          units.push(u); unitBySlug[s] = u;
        };
        if (p.doses) Object.keys(p.doses).forEach(function (ds) { add(ds, p.doses[ds].label, p.doses[ds].price, p.doses[ds].packSize); });
        else add(slug, '', p.price, p.packSize);
      });
      units.sort(function (a, b) { return a.label.localeCompare(b.label, undefined, { numeric: true }); });
      r[1].forEach(function (d) {
        var u = d.data();
        if (!u.email) return;
        var dn = String(u.displayName || '').split(' — ');
        users.push({ uid: d.id, email: String(u.email).toLowerCase(), name: u.name || dn[0] || '', institution: u.institution || dn[1] || '',
          address: { addressLine1: u.addressLine1 || '', addressLine2: u.addressLine2 || '', city: u.city || '', state: u.state || '', zip: u.zip || '' } });
      });
      users.sort(function (a, b) { return a.email.localeCompare(b.email); });
      if (r[2]) r[2].forEach(function (d) { if (typeof d.data().perVialCost === 'number') costs[d.id] = d.data().perVialCost; });
      $('no-customers').innerHTML = users.map(function (u) { return '<option value="' + esc(u.email) + '">' + esc(u.name || '') + '</option>'; }).join('');
      $('no-ship').innerHTML = Object.keys(catalog.shipping).map(function (k) {
        return '<option value="' + k + '" data-price="' + catalog.shipping[k].price + '">' + esc(catalog.shipping[k].label) + '</option>';
      }).join('') + '<option value="local" data-price="' + localPrice + '">' + esc(LocalDelivery.labelFor(localPrice)) + '</option><option value="free" data-price="0">Free shipping</option><option value="custom">Custom price…</option>';
      wire();
      addLine();
      showMode();
      $('no-loading').style.display = 'none';
      $('no-body').style.display = '';
      loadQuotes();
    }).catch(function (err) {
      $('no-loading').textContent = 'Could not load: ' + err.message;
    });
  }

  // ---------- Customer ----------
  function pickCustomer() {
    var email = $('no-customer').value.trim().toLowerCase();
    customer = users.filter(function (u) { return u.email === email; })[0] || null;
    var info = $('no-customer-info');
    if (customer) {
      var a = customer.address;
      info.innerHTML = '<strong>' + esc(customer.name || customer.email) + '</strong>' + (customer.institution ? ' · ' + esc(customer.institution) : '') +
        (a.addressLine1 ? '<br>' + esc([a.addressLine1, a.addressLine2, a.city, a.state, a.zip].filter(Boolean).join(', ')) : '<br><span class="field-note">No address saved yet.</span>');
      ['addressLine1', 'addressLine2', 'city', 'state', 'zip'].forEach(function (k) { $('no-' + k).value = a[k] || ''; });
      $('no-name').value = customer.name || '';
    } else {
      info.innerHTML = email ? '<span class="field-note">Not a site account. Fine for “Enter the order now”; to send to a cart they need an account first.</span>' : '';
    }
    $('no-guest').style.display = customer ? 'none' : '';
    refresh();
  }

  // ---------- Lines ----------
  function addLine(slug) {
    lines.push({ slug: slug || '', qty: 1, price: null, isCase: false });
    drawLines();
  }
  function listPrice(l) {
    var u = unitBySlug[l.slug];
    if (!u) return 0;
    if (!l.isCase) return u.price;
    var paid = u.caseEligible ? catalog.caseSize - catalog.freeVials : catalog.caseSize;
    return u.price * paid;
  }
  function vials(l) { return l.isCase ? l.qty * catalog.caseSize : l.qty; }
  function priceOf(l) { return l.price == null ? listPrice(l) : l.price; }
  function drawLines() {
    var opts = '<option value="">Choose a product…</option>' + units.map(function (u) { return '<option value="' + esc(u.slug) + '">' + esc(u.label) + ' — $' + u.price + '</option>'; }).join('');
    $('no-lines').innerHTML = lines.map(function (l, i) {
      return '<tr data-i="' + i + '">' +
        '<td data-label="Product"><select class="no-prod">' + opts + '</select>' +
        '<label class="checkbox-row no-case"><input type="checkbox" class="no-iscase"' + (l.isCase ? ' checked' : '') + '> <span>Case of ' + catalog.caseSize + '</span></label></td>' +
        '<td data-label="Qty"><input type="number" class="no-qty" min="1" step="1" value="' + l.qty + '"></td>' +
        '<td data-label="Price each"><input type="number" class="no-price" min="0" step="0.01" value="' + (l.slug ? priceOf(l) : '') + '" placeholder="0.00"><div class="field-note no-list"></div></td>' +
        '<td data-label="Line" class="no-line-total"></td>' +
        '<td data-label="Profit" class="no-line-profit"></td>' +
        '<td><button type="button" class="btn-outline-light no-rm" aria-label="Remove line">&times;</button></td></tr>';
    }).join('');
    Array.prototype.forEach.call($('no-lines').querySelectorAll('tr'), function (tr) {
      var l = lines[Number(tr.getAttribute('data-i'))];
      tr.querySelector('.no-prod').value = l.slug;
      tr.querySelector('.no-prod').addEventListener('change', function () { l.slug = this.value; l.price = null; drawLines(); });
      tr.querySelector('.no-iscase').addEventListener('change', function () { l.isCase = this.checked; l.price = null; drawLines(); });
      tr.querySelector('.no-qty').addEventListener('input', function () { l.qty = Math.max(1, parseInt(this.value, 10) || 1); refresh(); });
      tr.querySelector('.no-price').addEventListener('input', function () { l.price = this.value === '' ? null : Math.max(0, r2(Number(this.value))); refresh(); });
      tr.querySelector('.no-rm').addEventListener('click', function () { lines.splice(lines.indexOf(l), 1); if (!lines.length) addLine(); else drawLines(); });
    });
    refresh();
  }

  // ---------- Totals ----------
  function shippingPrice() {
    var sel = $('no-ship');
    if (sel.value === 'custom') return Math.max(0, r2(Number($('no-ship-custom').value) || 0));
    return Number(sel.options[sel.selectedIndex].getAttribute('data-price')) || 0;
  }
  function shippingLabel() {
    var sel = $('no-ship');
    if (sel.value === 'custom') return ($('no-ship-custom-label').value.trim() || 'Shipping') + ' — $' + shippingPrice().toFixed(2);
    return sel.options[sel.selectedIndex].textContent;
  }
  function totals() {
    var used = lines.filter(function (l) { return unitBySlug[l.slug]; });
    var subtotal = r2(used.reduce(function (s, l) { return s + priceOf(l) * l.qty; }, 0));
    var list = r2(used.reduce(function (s, l) { return s + listPrice(l) * l.qty; }, 0));
    var cost = 0, costKnown = used.length > 0;
    used.forEach(function (l) { var c = costs[l.slug]; if (typeof c === 'number') cost += c * vials(l); else costKnown = false; });
    var order = mode() === 'order';
    var shipping = order ? shippingPrice() : 0;
    var tax = order && $('no-tax').checked ? r2(subtotal * TAX_RATE) : 0;
    // Same processing fee checkout adds for that payment method.
    var fee = order && window.PaymentApps && PaymentApps.customerFee ? PaymentApps.customerFee(paymentFees, $('no-pay').value, r2(subtotal + shipping + tax)) : 0;
    return { used: used, subtotal: subtotal, list: list, cost: r2(cost), costKnown: costKnown, shipping: shipping, tax: tax, fee: fee, total: r2(subtotal + shipping + tax + fee) };
  }
  function refresh() {
    Array.prototype.forEach.call($('no-lines').querySelectorAll('tr'), function (tr) {
      var l = lines[Number(tr.getAttribute('data-i'))];
      var u = unitBySlug[l.slug];
      var lt = u ? priceOf(l) * l.qty : 0;
      tr.querySelector('.no-line-total').textContent = u ? money(lt) : '';
      var c = u ? costs[l.slug] : undefined;
      var profit = typeof c === 'number' ? lt - c * vials(l) : null;
      tr.querySelector('.no-line-profit').innerHTML = profit == null ? (u ? '<span class="field-note">no cost on file</span>' : '')
        : '<span class="' + (profit < 0 ? 'no-loss' : '') + '">' + money(profit) + '</span><div class="field-note">cost ' + money(c) + '/vial' + (c * vials(l) > 0 ? ' · ' + Math.round(profit / (c * vials(l)) * 100) + '% markup' : '') + '</div>';
      tr.querySelector('.no-list').textContent = u ? 'Website ' + money(listPrice(l)) + (l.isCase ? ' / case' : '') : '';
    });
    var t = totals();
    var rows = [['Items', money(t.subtotal) + (t.list > t.subtotal ? ' <span class="field-note">(website ' + money(t.list) + ')</span>' : '')]];
    if (mode() === 'order') {
      rows.push(['Shipping', money(t.shipping)]);
      rows.push(['Tax', money(t.tax)]);
      if (t.fee > 0) rows.push(['Processing fee (' + esc(PaymentApps.LABELS[$('no-pay').value] || '') + ')', money(t.fee)]);
      rows.push(['<strong>Total</strong>', '<strong>' + money(t.total) + '</strong>']);
    } else {
      rows.push(['', '<span class="field-note">They pick shipping at checkout. ' + ($('no-tax').checked ? 'Tax is added on these items.' : 'No tax on these items.') + '</span>']);
    }
    if (t.used.length) rows.push(['Your profit on items', t.costKnown ? money(t.subtotal - t.cost) + ' <span class="field-note">(cost ' + money(t.cost) + ')</span>' : '<span class="field-note">Some items have no cost on file (At cost page).</span>']);
    $('no-summary').innerHTML = rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('');
  }

  function showMode() {
    var order = mode() === 'order';
    $('no-cart-fields').style.display = order ? 'none' : '';
    $('no-order-fields').style.display = order ? '' : 'none';
    $('no-submit').textContent = order ? 'Enter order' : 'Send to their cart';
    refresh();
  }

  function wire() {
    $('no-customer').addEventListener('change', pickCustomer);
    $('no-customer').addEventListener('input', function () { if (users.some(function (u) { return u.email === $('no-customer').value.trim().toLowerCase(); })) pickCustomer(); });
    $('no-add').addEventListener('click', function () { addLine(); });
    document.querySelectorAll('input[name="no-mode"]').forEach(function (r) { r.addEventListener('change', showMode); });
    $('no-ship').addEventListener('change', function () { $('no-ship-custom-wrap').style.display = this.value === 'custom' ? '' : 'none'; refresh(); });
    ['no-ship-custom', 'no-tax', 'no-pay'].forEach(function (id) { $(id).addEventListener('input', refresh); $(id).addEventListener('change', refresh); });
    $('no-form').addEventListener('submit', function (e) { e.preventDefault(); submit(); });
  }

  function builtLines() {
    return totals().used.map(function (l) {
      var u = unitBySlug[l.slug];
      var line = { slug: l.isCase ? u.slug + '-case' : u.slug, name: u.name, packSize: l.isCase ? casePack(u) : u.packSize, price: r2(priceOf(l)), qty: l.qty, listPrice: listPrice(l) };
      if (l.isCase) { line.caseOf = catalog.caseSize; line.unitSlug = u.slug; }
      return line;
    });
  }
  function casePack(u) {
    return /^1 vial/i.test(u.packSize) ? u.packSize.replace(/^1 vial/i, 'Case of ' + catalog.caseSize + ' vials') : 'Case of ' + catalog.caseSize + ' (' + u.packSize + ' each)';
  }

  function submit() {
    say('');
    var items = builtLines();
    if (!items.length) return say('Add at least one product.');
    var slugs = items.map(function (i) { return i.slug; });
    if (slugs.some(function (s, i) { return slugs.indexOf(s) !== i; })) return say('Each product can be on the order once; combine the quantities.');
    var btn = $('no-submit');
    btn.disabled = true;
    var done = function () { btn.disabled = false; };
    (mode() === 'cart' ? sendQuote(items) : enterOrder(items)).then(done, function (err) { done(); say('Could not save: ' + esc(err.message) + (/permission/i.test(err.message) ? ' Publish the updated Firestore rules first.' : '')); });
  }

  // ---------- Send to cart ----------
  function sendQuote(items) {
    if (!customer) return Promise.reject(new Error('Pick a customer with a site account to send a quote to their cart.'));
    var days = Math.max(0, parseInt($('no-days').value, 10) || 0);
    var expiresOn = '';
    if (days) { var d = new Date(); d.setDate(d.getDate() + days); expiresOn = Quotes.todayCentral(d); }
    var ref = db.collection('quotes').doc();
    var quote = { uid: customer.uid, email: customer.email, name: customer.name || '', lines: items, expiresOn: expiresOn, noTax: !$('no-tax').checked,
      note: $('no-quote-note').value.trim().slice(0, 500), createdAt: new Date().toISOString(), createdBy: me };
    var cartRef = db.collection('carts').doc(customer.uid);
    return ref.set(quote).then(function () {
      return cartRef.get();
    }).then(function (c) {
      var cart = c.exists ? (c.data().items || []) : [];
      items.forEach(function (it) {
        var line = { slug: it.slug, name: it.name, packSize: it.packSize, price: it.price, qty: it.qty, quoteId: ref.id, quoteExpiresOn: expiresOn };
        if (it.caseOf) { line.caseOf = it.caseOf; line.unitSlug = it.unitSlug; }
        cart.push(line);
      });
      return cartRef.set({ items: cart, updatedAt: new Date().toISOString() });
    }).then(function () {
      say('Sent to ' + esc(customer.email) + '’s cart' + (expiresOn ? ', good through ' + expiresOn : '') + '. Text them: <code>txbioresearch.com/cart.html</code>', true);
      reset();
      loadQuotes();
    });
  }

  // ---------- Enter order now ----------
  function enterOrder(items) {
    var email = customer ? customer.email : $('no-customer').value.trim().toLowerCase();
    var name = $('no-name').value.trim();
    if (!customer && !name && !email) return Promise.reject(new Error('Enter the customer’s name (and email if you have it).'));
    var address = {};
    ['addressLine1', 'addressLine2', 'city', 'state', 'zip'].forEach(function (k) { address[k] = $('no-' + k).value.trim(); });
    if (!(address.addressLine1 && address.city && address.state && address.zip)) return Promise.reject(new Error('Add the shipping address.'));
    address.name = name || (customer && customer.name) || '';
    var t = totals();
    // Save the order first (so nothing changes if it's refused), then take stock.
    var orderItems = items.map(function (it) {
      var o = Object.assign({}, it, { fulfilled: it.caseOf ? it.qty * it.caseOf : it.qty, backordered: 0 });
      var c = costs[it.caseOf ? it.unitSlug : it.slug];
      if (typeof c === 'number') o.unitCost = c;
      return o;
    });
    var order = {
      items: orderItems, subtotal: t.subtotal, shipping: t.shipping, shippingOption: shippingLabel(),
      discount: 0, promoCode: null, bogoDiscount: 0, bogoBreakdown: [], tax: t.tax,
      paymentFee: t.fee, totalBeforeCredit: t.total, creditUsed: 0, creditUsedCents: 0, affiliateCode: '', total: t.total,
      shippingAddress: address, notes: $('no-notes').value.trim().slice(0, 2000),
      paymentMethod: $('no-pay').value, paymentHandle: '', hasBackorder: false,
      attestation: null, placedBy: 'admin', placedByEmail: me, channel: $('no-channel').value,
      customerName: name, userName: address.name, customerPhone: $('no-phone').value.trim(),
      status: $('no-status').value,
      userId: customer ? customer.uid : '', userEmail: email,
      createdAt: new Date().toISOString(), orderNumber: Account.generateOrderNumber()
    };
    var ref = db.collection('orders').doc();
    return ref.set(order).then(function () {
      if (!$('no-stock').checked) return null;
      return Promise.all(orderItems.map(function (it) {
        return Inventory.decrementStock(it.caseOf ? it.unitSlug : it.slug, it.fulfilled);
      })).then(function (res) {
        orderItems.forEach(function (it, i) { it.backordered = res[i].backordered; it.fulfilled = res[i].fulfilled; });
        var back = orderItems.some(function (i) { return i.backordered > 0; });
        return back ? ref.update({ items: orderItems, hasBackorder: true }) : null;
      });
    }).then(function () {
      say('Order <strong>' + order.orderNumber + '</strong> entered for ' + esc(name || email) + ' (' + money(order.total) + '). <a href="admin-orders.html?q=' + encodeURIComponent(order.orderNumber) + '">Open it</a>', true);
      reset();
      loadQuotes();
    });
  }

  function reset() {
    lines = []; addLine();
    $('no-quote-note').value = ''; $('no-notes').value = '';
  }

  // ---------- Recent quotes ----------
  function loadQuotes() {
    Promise.all([db.collection('quotes').get(), db.collection('orders').get()]).then(function (r) {
      quotes = []; r[0].forEach(function (d) { quotes.push(Object.assign({ id: d.id }, d.data())); });
      orders = []; r[1].forEach(function (d) { orders.push(Object.assign({ id: d.id }, d.data())); });
      quotes.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      drawQuotes();
    }).catch(function () { $('no-quotes').innerHTML = '<tr><td colspan="5">Publish the updated Firestore rules to see quotes.</td></tr>'; });
  }
  function quoteStatus(q) {
    var ordered = orders.filter(function (o) { return o.status !== 'cancelled' && (o.items || []).some(function (i) { return i.quoteId === q.id; }); })[0];
    if (ordered) return { text: 'Ordered · #' + esc(ordered.orderNumber || ''), done: true };
    if (q.cancelled) return { text: 'Withdrawn', done: true };
    if (Quotes.isExpired(q)) return { text: 'Ended ' + esc(q.expiresOn), done: true };
    return { text: 'In their cart' + (q.expiresOn ? ' · through ' + esc(q.expiresOn) : ''), done: false };
  }
  function drawQuotes() {
    $('no-quotes').innerHTML = quotes.slice(0, 30).map(function (q) {
      var st = quoteStatus(q);
      var total = (q.lines || []).reduce(function (s, l) { return s + l.price * l.qty; }, 0);
      return '<tr><td data-label="Customer"><strong>' + esc(q.name || q.email) + '</strong><br><span class="field-note">' + esc(q.email) + '</span></td>' +
        '<td data-label="Items">' + (q.lines || []).map(function (l) { return esc(l.name) + ' <span class="field-note">' + esc(l.packSize) + '</span> ×' + l.qty + ' @ ' + money(l.price); }).join('<br>') + '</td>' +
        '<td data-label="Total">' + money(total) + '</td>' +
        '<td data-label="Status">' + st.text + '</td>' +
        '<td>' + (st.done ? '' : '<button type="button" class="btn-outline-light" data-withdraw="' + esc(q.id) + '">Withdraw</button>') + '</td></tr>';
    }).join('') || '<tr><td colspan="5">No quotes yet.</td></tr>';
    document.querySelectorAll('[data-withdraw]').forEach(function (b) {
      b.addEventListener('click', function () {
        var q = quotes.filter(function (x) { return x.id === b.getAttribute('data-withdraw'); })[0];
        if (!q || !confirm('Withdraw this quote? Its items come out of ' + q.email + '’s cart.')) return;
        b.disabled = true;
        var cartRef = db.collection('carts').doc(q.uid);
        db.collection('quotes').doc(q.id).update({ cancelled: true, cancelledAt: new Date().toISOString() }).then(function () {
          return cartRef.get();
        }).then(function (c) {
          if (!c.exists) return null;
          var items = (c.data().items || []).filter(function (i) { return i.quoteId !== q.id; });
          return cartRef.set({ items: items, updatedAt: new Date().toISOString() });
        }).then(loadQuotes).catch(function (err) { b.disabled = false; alert('Could not withdraw: ' + err.message); });
      });
    });
  }
})();
