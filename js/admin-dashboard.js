// admin-dashboard.js — Admin → Dashboard: sales, profit, visitors, what needs
// attention, top products, latest orders. Same profit math as admin-pnl.html.
(function () {
  var ADMIN_EMAIL = 'gabecolton@gmail.com';
  var D = null, range = '7';
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function money(n, whole) { var neg = n < 0; return (neg ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function day(d) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d); } catch (e) { return d.toISOString().slice(0, 10); } }
  function label(k, long) { var d = new Date(k + 'T12:00:00'); return d.toLocaleDateString(undefined, long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'numeric', day: 'numeric' }); }

  // Days covered by the range, and the same-length range before it.
  function days(r) {
    var now = new Date(), n;
    if (r === 'today') n = 1;
    else if (r === 'month') n = Number(day(now).slice(8, 10));
    else n = Number(r);
    var cur = [], prev = [];
    for (var i = n - 1; i >= 0; i--) cur.push(day(new Date(now.getTime() - i * 864e5)));
    for (var j = 2 * n - 1; j >= n; j--) prev.push(day(new Date(now.getTime() - j * 864e5)));
    return { cur: cur, prev: prev };
  }

  function orderNumbers(o) {
    var items = o.items || [];
    var subtotal = Number(o.subtotal) || items.reduce(function (n, i) { return n + i.price * i.qty; }, 0);
    var off = (Number(o.discount) || 0) + (Number(o.bogoDiscount) || 0);
    var factor = subtotal > 0 ? Math.max(0, (subtotal - off) / subtotal) : 1;
    var net = 0, cost = 0, missing = 0, lines = [];
    items.forEach(function (it) {
      var unit = AtCost.unitSlugOf(it), vials = AtCost.vialsOf(it);
      var gross = r2(it.price * it.qty);
      var lnet = typeof it.atCostPrice === 'number' ? it.atCostPrice : r2(gross * factor);
      var uc = typeof it.unitCost === 'number' ? it.unitCost : AtCost.costAt(D.costs[unit], o.createdAt);
      net += lnet;
      if (typeof uc === 'number') cost += uc * vials; else missing += lnet;
      lines.push({ unit: unit, name: D.names[unit] || it.name, vials: vials, net: lnet });
    });
    var credits = (o.affiliateCreditedAt && !o.affiliateReversedAt ? (o.affiliateCreditCents || 0) : 0) + (o.loyaltyCreditedAt && !o.loyaltyReversedAt ? (o.loyaltyCreditCents || 0) : 0);
    var fee = PaymentApps.feeFor(D.fees, o.paymentMethod || 'inquiry', Number(o.total) || 0);
    return { net: r2(net), profit: r2(net - cost - missing - credits / 100 - fee), lines: lines };
  }

  function sum(list, f) { return list.reduce(function (n, x) { return n + f(x); }, 0); }
  function change(cur, prev) {
    if (!prev) return cur ? '<span class="dash-up">new</span>' : '';
    var p = Math.round((cur - prev) / prev * 100);
    return '<span class="' + (p >= 0 ? 'dash-up' : 'dash-down') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '%</span>';
  }

  function render() {
    var R = days(range), cur = {}, prev = {};
    R.cur.forEach(function (d) { cur[d] = true; }); R.prev.forEach(function (d) { prev[d] = true; });
    var live = D.orders.filter(function (o) { return (o.status || 'pending') !== 'cancelled'; });
    var inCur = live.filter(function (o) { return cur[day(new Date(o.createdAt))]; });
    var inPrev = live.filter(function (o) { return prev[day(new Date(o.createdAt))]; });
    var nc = inCur.map(orderNumbers), np = inPrev.map(orderNumbers);
    var sales = sum(nc, function (x) { return x.net; }), salesP = sum(np, function (x) { return x.net; });
    var profit = sum(nc, function (x) { return x.profit; }), profitP = sum(np, function (x) { return x.profit; });
    var visitors = sum(R.cur, function (d) { return (D.traffic[d] && D.traffic[d].visitors) || 0; });
    var visitorsP = sum(R.prev, function (d) { return (D.traffic[d] && D.traffic[d].visitors) || 0; });
    var newCust = {}; D.orders.forEach(function (o) { var k = o.userId || o.userEmail; if (!k) return; if (!newCust[k] || o.createdAt < newCust[k]) newCust[k] = o.createdAt; });
    var firstTimers = Object.keys(newCust).filter(function (k) { return cur[day(new Date(newCust[k]))]; }).length;

    $('dash-tiles').innerHTML = [
      ['Net sales', money(sales), change(sales, salesP)],
      ['Orders', inCur.length, change(inCur.length, inPrev.length)],
      ['Average order', inCur.length ? money(sales / inCur.length) : '—', ''],
      ['Profit', money(profit), sales ? Math.round(profit / sales * 100) + '% of sales' : ''],
      ['Visitors', visitors.toLocaleString('en-US'), change(visitors, visitorsP)],
      ['Order rate', visitors ? (inCur.length / visitors * 100).toFixed(1) + '%' : '—', firstTimers ? firstTimers + ' new customer' + (firstTimers === 1 ? '' : 's') : '']
    ].map(function (t) { return '<div class="pnl-tile"><span class="pnl-label">' + t[0] + '</span><span class="pnl-value">' + t[1] + '</span>' + (t[2] ? '<span class="pnl-sub">' + t[2] + '</span>' : '') + '</div>'; }).join('');

    // Needs attention (counts; details on To-do)
    var pend = D.orders.filter(function (o) { return (o.status || 'pending') === 'pending'; }).length;
    var ship = D.orders.filter(function (o) { return o.status === 'confirmed' || o.status === 'processing'; }).length;
    var low = Object.keys(D.stock).filter(function (k) { return D.stock[k] <= 3; }).length;
    var inc = D.incoming.filter(function (s) { return s.status === 'delivered'; }).length;
    var mails = D.paymentEmails.filter(function (m) { return (m.status === 'unmatched' || m.status === 'untrusted') && !m.dismissedAt; }).length;
    var lots = (D.lots || []).filter(function (l) { return l.qtyRemaining > 0 && l.exp && (new Date(l.exp + 'T12:00:00') - Date.now()) / 864e5 <= 60; }).length;
    var needs = [[ship, 'to ship', 'ship'], [pend, 'awaiting payment', 'pay'], [mails, mails === 1 ? 'payment to match' : 'payments to match', 'paymail'], [inc, inc === 1 ? 'delivery to check in' : 'deliveries to check in', 'incoming'], [low, 'sold out or low', 'stock'], [lots, lots === 1 ? 'lot expiring soon' : 'lots expiring soon', 'lots']]
      .filter(function (x) { return x[0] > 0; });
    $('dash-needs').innerHTML = needs.length
      ? needs.map(function (x) { return '<a class="dash-need" href="admin-todo.html#todo-' + x[2] + '"><strong>' + x[0] + '</strong> ' + x[1] + '</a>'; }).join('')
      : '<span class="dash-clear">✓ Nothing waiting on you.</span>';

    // Chart: net sales per day
    var byDay = {}; inCur.forEach(function (o, i) { var k = day(new Date(o.createdAt)); byDay[k] = (byDay[k] || 0) + nc[i].net; });
    drawChart(R.cur.map(function (d) { return { day: d, v: r2(byDay[d] || 0), n: inCur.filter(function (o) { return day(new Date(o.createdAt)) === d; }).length }; }));

    // Top products
    var top = {};
    nc.forEach(function (x) { x.lines.forEach(function (l) { var t = top[l.unit] || (top[l.unit] = { name: l.name, vials: 0, net: 0 }); t.vials += l.vials; t.net += l.net; }); });
    var topRows = Object.keys(top).sort(function (a, b) { return top[b].net - top[a].net; }).slice(0, 8).map(function (k) {
      return '<tr><td>' + esc(top[k].name) + '</td><td>' + top[k].vials + '</td><td>' + money(top[k].net) + '</td></tr>';
    });
    $('dash-top').innerHTML = '<thead><tr><th>Product</th><th>Vials</th><th>Net sales</th></tr></thead><tbody>' + (topRows.join('') || '<tr><td colspan="3">No sales in this period yet.</td></tr>') + '</tbody>';

    // Latest orders (any period)
    var NAMES = { pending: 'Awaiting payment', confirmed: 'Paid', processing: 'Processing', 'label-created': 'Label created', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
    var recent = D.orders.slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, 8).map(function (o) {
      var st = o.status || 'pending';
      return '<tr><td><a href="admin-orders.html?q=' + encodeURIComponent(o.orderNumber || o.id) + '">#' + esc(o.orderNumber || o.id.slice(0, 6)) + '</a></td><td>' + esc(new Date(o.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + '</td><td><span class="status-pill status-' + esc(st) + '">' + esc(NAMES[st] || st) + '</span></td><td>' + money(Number(o.total) || 0) + '</td></tr>';
    });
    $('dash-recent').innerHTML = '<thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th></tr></thead><tbody>' + (recent.join('') || '<tr><td colspan="4">No orders yet.</td></tr>') + '</tbody>';
    var hr = new Date().getHours();
    $('dash-lead').textContent = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + '. Here’s how the store is doing.';
  }

  function drawChart(list) {
    var el = $('dash-chart'), tip = $('dash-tip');
    var W = Math.max(280, el.clientWidth || 800), H = 200, padL = 52, padB = 24, padT = 10;
    var max = Math.max(50, Math.max.apply(null, list.map(function (x) { return x.v; })));
    var stepSz = Math.pow(10, Math.floor(Math.log10(max))); var top = Math.ceil(max / stepSz) * stepSz;
    var plotW = W - padL - 6, plotH = H - padB - padT, band = plotW / list.length, bw = Math.max(2, Math.min(24, band - 2));
    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">';
    for (var g = 0; g <= 4; g++) {
      var gy = padT + plotH - plotH * g / 4;
      svg += '<line x1="' + padL + '" x2="' + (W - 6) + '" y1="' + gy + '" y2="' + gy + '" class="tr-grid-line"/><text x="' + (padL - 6) + '" y="' + (gy + 4) + '" class="tr-axis" text-anchor="end">' + money(top * g / 4, true) + '</text>';
    }
    var every = Math.ceil(list.length / 10);
    list.forEach(function (x, i) {
      var h = plotH * x.v / top, bx = padL + band * i + (band - bw) / 2, y = padT + plotH - h, r = Math.min(4, bw / 2, h);
      if (h > 0) svg += '<path class="tr-col" d="M' + bx + ',' + (padT + plotH) + 'V' + (y + r) + 'Q' + bx + ',' + y + ' ' + (bx + r) + ',' + y + 'H' + (bx + bw - r) + 'Q' + (bx + bw) + ',' + y + ' ' + (bx + bw) + ',' + (y + r) + 'V' + (padT + plotH) + 'Z"/>';
      svg += '<rect class="tr-hit" data-i="' + i + '" x="' + (padL + band * i) + '" y="' + padT + '" width="' + band + '" height="' + plotH + '"/>';
      if (i % every === 0 || i === list.length - 1) svg += '<text x="' + (padL + band * i + band / 2) + '" y="' + (H - 6) + '" class="tr-axis" text-anchor="middle">' + (list.length === 1 ? 'Today' : label(x.day)) + '</text>';
    });
    el.innerHTML = svg + '</svg>';
    el.querySelectorAll('.tr-hit').forEach(function (r) {
      function show() {
        var x = list[Number(r.getAttribute('data-i'))];
        tip.innerHTML = '<strong>' + esc(label(x.day, true)) + '</strong><br>' + money(x.v) + ' net sales<br>' + x.n + ' order' + (x.n === 1 ? '' : 's');
        tip.style.display = 'block';
        tip.style.left = Math.min(Math.max(Number(r.getAttribute('x')) + band / 2 - 80, 0), W - 170) + 'px';
        r.classList.add('is-hover');
      }
      function hide() { tip.style.display = 'none'; r.classList.remove('is-hover'); }
      r.addEventListener('mouseenter', show); r.addEventListener('mouseleave', hide);
      r.addEventListener('touchstart', show, { passive: true });
    });
  }

  document.querySelectorAll('.range-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.range-btn').forEach(function (x) { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      range = b.getAttribute('data-range');
      if (D) render();
    });
  });
  window.addEventListener('resize', function () { if (D) render(); });

  document.addEventListener('userReady', function (e) {
    if (e.detail.user.email !== ADMIN_EMAIL) { $('admin-denied').style.display = 'block'; return; }
    $('admin-content').style.display = 'block';
    var db = firebase.firestore();
    var soft = function (p) { return p.catch(function () { return null; }); };
    Promise.all([
      db.collection('orders').get(), soft(db.collection('costs').get()), soft(db.collection('settings').doc('paymentFees').get()),
      soft(db.collection('traffic').get()), soft(db.collection('inventory').get()), soft(db.collection('incoming').get()),
      soft(db.collection('paymentEmails').get()), soft(db.collection('lots').get()),
      fetch('functions/catalog.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
    ]).then(function (r) {
      var each = function (snap, f) { if (snap) snap.forEach(f); };
      D = { orders: [], costs: {}, fees: r[2] && r[2].exists ? r[2].data() : {}, traffic: {}, stock: {}, incoming: [], paymentEmails: [], lots: [], names: {} };
      each(r[0], function (d) { D.orders.push(Object.assign({ id: d.id }, d.data())); });
      each(r[1], function (d) { D.costs[d.id] = d.data(); });
      each(r[3], function (d) { D.traffic[d.id] = d.data(); });
      each(r[4], function (d) { if (typeof d.data().qty === 'number') D.stock[d.id] = d.data().qty; });
      each(r[5], function (d) { D.incoming.push(d.data()); });
      each(r[6], function (d) { D.paymentEmails.push(d.data()); });
      each(r[7], function (d) { D.lots.push(d.data()); });
      Object.keys(r[8].products).forEach(function (s) { var p = r[8].products[s]; D.names[s] = p.name; if (p.doses) Object.keys(p.doses).forEach(function (k) { D.names[k] = p.name + ' ' + p.doses[k].label; }); });
      $('dash-loading').style.display = 'none';
      $('dash-body').style.display = '';
      render();
    }).catch(function (err) { $('dash-loading').textContent = 'Could not load: ' + err.message; });
  });
})();
