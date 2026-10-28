// admin-todo.js — Admin > To-do: one list of what needs the admin, built
// from orders, inventory, promo codes and costs. Each item links to where
// it's handled; missing referral credit can be given right here.
(function () {
  var ADMIN_EMAIL = 'gabecolton@gmail.com';
  var STALE_DAYS = 3;
  var LOW_KEY = 'txbio_todo_low';
  var data = null;
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function daysSince(iso) { return iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : 0; }
  function age(iso) {
    var d = daysSince(iso);
    if (d < 1 / 24) return 'just now';
    if (d < 1) return Math.round(d * 24) + 'h ago';
    var n = Math.floor(d); return n + ' day' + (n === 1 ? '' : 's') + ' ago';
  }
  var METHOD = { venmo: 'Venmo', cashapp: 'Cash App', bank: 'Bank transfer', bitcoin: 'Bitcoin' };
  function orderLink(o) { return '<a href="admin-orders.html?q=' + encodeURIComponent(o.orderNumber || o.id) + '">#' + esc(o.orderNumber || o.id.slice(0, 8)) + '</a>'; }

  function row(cells, flag, actions) {
    return '<li class="todo-row' + (flag ? ' is-flag' : '') + '">' +
      '<div class="todo-main">' + cells.join('<span class="todo-dot">·</span>') + '</div>' +
      (actions ? '<div class="todo-actions">' + actions + '</div>' : '') + '</li>';
  }

  function build() {
    var orders = data.orders, sections = [], clear = [];
    var low = Number($('todo-low').value);
    if (!(low >= 0)) low = 3;
    function add(key, title, note, items, cta, count) {
      if (!items.length) { clear.push(title); return; }
      count = count == null ? items.length : count;
      sections.push('<section class="todo-section" id="todo-' + key + '">' +
        '<div class="todo-head"><h2>' + title + ' <span class="todo-count">' + count + '</span></h2>' +
        (cta ? '<a href="' + cta[1] + '" class="todo-cta"' + (cta[1].indexOf('admin-slip') === 0 ? ' target="_blank" rel="noopener"' : '') + '>' + cta[0] + ' &rarr;</a>' : '') + '</div>' +
        (note ? '<p class="todo-note">' + note + '</p>' : '') +
        '<ul class="todo-list">' + items.join('') + '</ul></section>');
    }
    var oldest = function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); };

    // 1. Payments to check
    var pending = orders.filter(function (o) { return (o.status || 'pending') === 'pending'; }).sort(oldest);
    add('pay', 'Payments to check', 'Look for these in Venmo, Cash App, your bank or wallet, then mark the order Confirmed. Highlighted orders have waited ' + STALE_DAYS + '+ days; consider cancelling them.',
      pending.map(function (o) {
        var stale = daysSince(o.createdAt) >= STALE_DAYS;
        return row([orderLink(o), esc(o.userEmail || ''), '<strong>' + money(o.total) + '</strong>', esc(METHOD[o.paymentMethod] || o.paymentMethod || 'unknown'), '<span class="todo-age">' + age(o.createdAt) + (o.paymentReminderSentAt ? ', reminder sent' : '') + '</span>'], stale);
      }), ['Orders', 'admin-orders.html?q=pending']);

    // 1b. Payment emails the automation couldn't match (tools/order-automation)
    var payMails = (data.paymentEmails || []).filter(function (m) { return (m.status === 'unmatched' || m.status === 'untrusted') && !m.dismissedAt; })
      .sort(function (a, b) { return String(b.receivedAt).localeCompare(String(a.receivedAt)); });
    add('paymail', 'Payments to match by hand', 'Venmo / Cash App payments that came in but couldn\u2019t be matched to an order automatically. Check them, confirm the right order on the Orders page, then dismiss.',
      payMails.map(function (m) {
        return row([esc(m.app === 'venmo' ? 'Venmo' : 'Cash App'), '<strong>' + money(m.amount) + '</strong>', esc(m.payer || 'unknown payer'), m.orderNumber ? 'note: ' + esc(m.orderNumber) : 'no order # in note',
          '<span class="todo-warn">' + esc(m.reason || m.status) + '</span>', '<span class="todo-age">' + age(m.receivedAt) + '</span>'], m.status === 'untrusted',
          '<button type="button" class="btn-outline-light todo-btn" data-dismiss-pay="' + esc(m.id) + '">Dismiss</button>');
      }));

    // 2. Ready to ship
    var toShip = orders.filter(function (o) { return o.status === 'confirmed' || o.status === 'processing'; }).sort(oldest);
    add('ship', 'Paid, ready to ship', 'Make the label (Pirate Ship), add the tracking number, and mark Shipped.',
      toShip.map(function (o) {
        var a = o.shippingAddress || {};
        var units = (o.items || []).reduce(function (n, i) { return n + (Number(i.qty) || 0) * (Number(i.caseOf) || 1); }, 0);
        return row([orderLink(o), esc(a.name || o.userEmail || ''), esc([a.city, a.state].filter(Boolean).join(', ')), units + ' unit' + (units === 1 ? '' : 's'), esc(o.shippingOption || ''), '<span class="todo-age">' + age(o.createdAt) + '</span>'], daysSince(o.createdAt) >= 2,
          '<a href="admin-slip.html?id=' + encodeURIComponent(o.id) + '" target="_blank" rel="noopener" class="btn-outline-light todo-btn">Packing slip</a>');
      }), toShip.length > 1
        ? ['Print all ' + toShip.length + ' packing slips', 'admin-slip.html?print=1&id=' + toShip.map(function (o) { return encodeURIComponent(o.id); }).join(',')]
        : ['Orders', 'admin-orders.html']);

    // 3. Label made, not shipped
    var labels = orders.filter(function (o) { return o.status === 'label-created'; }).sort(oldest);
    add('label', 'Label made, not marked shipped', 'Once the package is dropped off, mark it Shipped so the customer gets their tracking email.',
      labels.map(function (o) { return row([orderLink(o), esc(o.userEmail || ''), o.trackingNumber ? 'Tracking ' + esc(o.trackingNumber) : '<span class="todo-warn">no tracking number</span>', '<span class="todo-age">' + age(o.createdAt) + '</span>']); }));

    // 4. Shipped without tracking
    var noTrack = orders.filter(function (o) { return (o.status === 'shipped' || o.status === 'delivered') && !o.trackingNumber && daysSince(o.createdAt) < 60; }).sort(oldest);
    add('track', 'Shipped without a tracking number', 'The customer can’t track these. Add the number on the order.',
      noTrack.map(function (o) { return row([orderLink(o), esc(o.userEmail || ''), '<span class="todo-age">' + age(o.createdAt) + '</span>']); }));

    // 5. Customer cancellations not finished (stock/credit not returned yet)
    var cancels = orders.filter(function (o) { return o.status === 'cancelled' && o.cancelledBy === 'customer' && !o.cancelFollowUpAt; });
    add('cancel', 'Customer cancellations to finish', 'Opening the Orders page returns the stock and any store credit automatically.',
      cancels.map(function (o) { return row([orderLink(o), esc(o.userEmail || ''), esc(String(o.cancelReason || '').replace(/^Customer: /, ''))]); }), ['Open Orders to finish', 'admin-orders.html']);

    // 6. Referral credit not given
    var promos = data.promos;
    var owed = orders.filter(function (o) {
      var code = o.affiliateCode || o.promoCode;
      var p = code && promos[String(code).toUpperCase()];
      return (o.status === 'shipped' || o.status === 'delivered') && !o.atCostCode && p && p.affiliateEmail &&
        !o.affiliateCreditedAt && !o.affiliateSkipped && p.affiliateEmail !== String(o.userEmail || '').toLowerCase();
    }).sort(oldest);
    add('credit', 'Referral credit not given', 'These shipped orders used an affiliate’s code, but the affiliate wasn’t credited (for example, the order was marked shipped another way).',
      owed.map(function (o) {
        var code = String(o.affiliateCode || o.promoCode).toUpperCase(), p = promos[code];
        var cents = window.Credits ? Credits.commissionCents(o) : 0;
        return row([orderLink(o), 'code ' + esc(code), esc(p.affiliateEmail), (window.Credits ? Credits.formatCents(cents) : '') + ' owed'], false,
          cents > 0 ? '<button type="button" class="btn-outline-light todo-btn" data-credit="' + esc(o.id) + '">Give credit</button>' : '');
      }));

    // 6b. Incoming supplier shipments: delivered but not in stock yet, or late
    var today = new Date().toISOString().slice(0, 10);
    var inc = (data.incoming || []).filter(function (s) {
      return s.status === 'delivered' || ((s.status === 'ordered' || s.status === 'in-transit') && s.expectedDate && s.expectedDate < today);
    });
    add('incoming', 'Incoming shipments', 'Delivered boxes to check in, and shipments past their expected date.',
      inc.map(function (s) {
        var vials = (s.items || []).reduce(function (n, i) { return n + (Number(i.qty) || 0); }, 0);
        return row(['<a href="admin-incoming.html#inc-' + esc(s.id) + '">' + esc(s.supplier || 'Supplier') + (s.reference ? ' · ' + esc(s.reference) : '') + '</a>', vials + ' vials',
          s.status === 'delivered' ? '<span class="todo-warn">Delivered, receive into stock</span>' : '<span class="todo-warn">Expected ' + esc(s.expectedDate) + ', late</span>']);
      }), ['Incoming', 'admin-incoming.html']);

    // 7. Stock
    var stockRows = [], sold = 0;
    Object.keys(data.stock).forEach(function (slug) {
      var q = data.stock[slug];
      if (typeof q !== 'number' || q > low) return;
      if (q <= 0) sold++;
      stockRows.push({ slug: slug, q: q });
    });
    stockRows.sort(function (a, b) { return a.q - b.q; });
    add('stock', 'Sold out or low stock', sold ? sold + ' sold out. Customers can’t order sold-out items.' : '',
      stockRows.map(function (s) { return row([esc(data.names[s.slug] || s.slug), s.q <= 0 ? '<span class="todo-warn">Sold out</span>' : s.q + ' left']); }), ['Inventory', 'admin-inventory.html']);

    // 8. Missing costs (P&L and family pricing)
    var missing = data.units.filter(function (u) { return typeof data.costs[u] !== 'number'; });
    add('cost', 'Products with no cost entered', 'Needed for the P&L and family pricing; family members pay full price for these.',
      missing.length ? ['<li class="todo-row"><div class="todo-main todo-names">' + missing.slice(0, 12).map(function (u) { return esc(data.names[u] || u); }).join(', ') +
        (missing.length > 12 ? ', and ' + (missing.length - 12) + ' more' : '') + '</div></li>'] : [], ['At cost', 'admin-at-cost.html'], missing.length);

    var total = sections.length ? payMails.length + pending.length + toShip.length + labels.length + noTrack.length + cancels.length + owed.length + inc.length + stockRows.length + missing.length : 0;
    $('todo-lead').textContent = sections.length ? total + ' item' + (total === 1 ? '' : 's') + ' waiting on you, oldest first.' : 'Nothing waiting on you right now.';
    $('todo-sections').innerHTML = sections.join('');
    $('todo-clear').innerHTML = clear.length ? '<h2>All clear</h2><ul>' + clear.map(function (c) { return '<li>' + c + '</li>'; }).join('') + '</ul>' : '';

    document.querySelectorAll('[data-dismiss-pay]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-dismiss-pay');
        b.disabled = true;
        firebase.firestore().collection('paymentEmails').doc(id).update({ dismissedAt: new Date().toISOString() }).then(function () {
          data.paymentEmails.forEach(function (m) { if (m.id === id) m.dismissedAt = 'now'; });
          build();
        }).catch(function (err) { b.disabled = false; alert('Could not dismiss: ' + err.message); });
      });
    });
    document.querySelectorAll('[data-credit]').forEach(function (b) {
      b.addEventListener('click', function () { giveCredit(b); });
    });
  }

  // Same rules as admin-orders.html creditAffiliate().
  function giveCredit(btn) {
    var order = data.orders.filter(function (o) { return o.id === btn.getAttribute('data-credit'); })[0];
    if (!order) return;
    var code = String(order.affiliateCode || order.promoCode).toUpperCase();
    var email = data.promos[code].affiliateEmail;
    var cents = Credits.commissionCents(order);
    btn.disabled = true; btn.textContent = 'Crediting…';
    Credits.adminAdjust(email, cents, { type: 'earned', orderId: order.id, orderNumber: order.orderNumber || '', code: code, note: '' }).then(function () {
      var fields = { affiliateEmail: email, affiliateCreditCents: cents, affiliateCreditedAt: new Date().toISOString(), affiliateReversedAt: null };
      Object.assign(order, fields);
      return firebase.firestore().collection('orders').doc(order.id).update(fields);
    }).then(function () { build(); }).catch(function (err) {
      btn.disabled = false; btn.textContent = 'Give credit';
      alert('Could not give credit: ' + err.message);
    });
  }

  function load() {
    var db = firebase.firestore();
    return Promise.all([
      Account.getAllOrders(),
      db.collection('inventory').get(),
      db.collection('promoCodes').get(),
      db.collection('costs').get().catch(function () { return null; }),
      db.collection('incoming').get().catch(function () { return null; }),
      db.collection('paymentEmails').get().catch(function () { return null; }),
      fetch('functions/catalog.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
    ]).then(function (r) {
      var incoming = [];
      if (r[4]) r[4].forEach(function (d) { incoming.push(Object.assign({ id: d.id }, d.data())); });
      var paymentEmails = [];
      if (r[5]) r[5].forEach(function (d) { paymentEmails.push(Object.assign({ id: d.id }, d.data())); });
      r.splice(4, 2);
      var stock = {}, promos = {}, costs = {}, names = {}, units = [];
      r[1].forEach(function (d) { if (typeof d.data().qty === 'number') stock[d.id] = d.data().qty; });
      r[2].forEach(function (d) { var p = d.data(); promos[d.id.toUpperCase()] = { affiliateEmail: String(p.affiliateEmail || '').toLowerCase() }; });
      if (r[3]) r[3].forEach(function (d) { if (typeof d.data().perVialCost === 'number') costs[d.id] = d.data().perVialCost; });
      var cat = r[4].products;
      Object.keys(cat).forEach(function (slug) {
        var p = cat[slug];
        names[slug] = p.name;
        if (p.doses) Object.keys(p.doses).forEach(function (ds) { names[ds] = p.name + ' ' + p.doses[ds].label; units.push(ds); });
        else units.push(slug);
      });
      units.sort(function (a, b) { return String(names[a]).localeCompare(String(names[b])); });
      data = { orders: r[0], stock: stock, promos: promos, costs: costs, names: names, units: units, incoming: incoming, paymentEmails: paymentEmails };
      $('todo-loading').style.display = 'none';
      $('todo-body').style.display = '';
      build();
    }).catch(function (err) {
      $('todo-loading').textContent = 'Could not load: ' + err.message;
    });
  }

  document.addEventListener('userReady', function (e) {
    if (e.detail.user.email !== ADMIN_EMAIL) { $('admin-denied').style.display = 'block'; return; }
    $('admin-content').style.display = 'block';
    try { var saved = localStorage.getItem(LOW_KEY); if (saved !== null && saved !== '') $('todo-low').value = saved; } catch (e2) {}
    $('todo-low').addEventListener('input', function () {
      try { localStorage.setItem(LOW_KEY, this.value); } catch (e3) {}
      if (data) build();
    });
    load();
  });
})();
