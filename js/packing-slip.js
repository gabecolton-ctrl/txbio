// packing-slip.js — printable packing slips (admin-slip.html).
//   admin-slip.html?id=ORDER_ID            one slip
//   admin-slip.html?id=ID1,ID2,ID3         several, one per page
//   add &print=1 to open the print dialog when ready
// No prices: it's what goes in the box. Admin only (Firestore rules let only
// the admin read other people's orders).
(function () {
  var ADMIN_EMAIL = 'gabecolton@gmail.com';
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function msg(t) { $('msg').style.display = ''; $('msg').textContent = t; }

  // Lots: the ones assigned when it shipped, or (before shipping) the ones it
  // would use, first-to-expire-first (js/lots.js).
  function lotText(o, item) {
    var unit = window.Lots ? Lots.unitOf(item) : item.slug;
    var list = (o.lotAllocations || o._lotPlan || []).filter(function (a) { return a.slug === unit && a.lot; });
    return list.map(function (a) {
      var exp = a.exp ? ' (exp ' + new Date(a.exp + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) + ')' : '';
      return esc(a.lot) + exp + (list.length > 1 ? ' ×' + a.qty : '');
    }).join('<br>');
  }
  function slipHtml(o) {
    var a = o.shippingAddress || {};
    var items = o.items || [];
    var units = 0;
    var showLots = (o.lotAllocations || o._lotPlan || []).some(function (x) { return x.lot; });
    var rows = items.map(function (i) {
      var q = Number(i.qty) || 0, per = Number(i.caseOf) || 1;
      units += q * per;
      return '<tr><td class="check"><span class="box"></span></td><td><strong>' + esc(i.name) + '</strong></td><td>' + esc(i.packSize || '') + '</td>' +
        (showLots ? '<td class="lot">' + (lotText(o, i) || '—') + '</td>' : '') +
        '<td class="num">' + q + '</td><td class="num">' + (q * per) + '</td></tr>';
    }).join('');
    var date = o.createdAt ? new Date(o.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    var name = a.name || o.userName || '';
    var city = [a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ' ' + a.zip : '');
    var ship = String(o.shippingOption || '').replace(/\s*[—-]\s*\$[\d.,]+$/, '');
    return '<section class="slip">' +
      '<div class="slip-head"><div class="brand"><img src="images/logo-icon.png" alt=""><div><strong>Texas Advanced BioResearch</strong><span>Dallas, TX · txbioresearch.com</span></div></div>' +
      '<div class="doc-title"><h1>Packing slip</h1><div>Order #' + esc(o.orderNumber || o.id) + '</div><div>' + esc(date) + '</div></div></div>' +
      '<div class="grid"><div><div class="label">Ship to</div><div class="ship-to">' +
        (name ? '<strong>' + esc(name) + '</strong><br>' : '') +
        esc(a.addressLine1 || '') + (a.addressLine2 ? '<br>' + esc(a.addressLine2) : '') + '<br>' + esc(city) +
        (!a.addressLine1 ? '<br><em>No address on the order</em>' : '') + '</div></div>' +
      '<div class="facts"><div class="label">Order</div>' +
        '<div><span>Order number</span><span>' + esc(o.orderNumber || o.id) + '</span></div>' +
        '<div><span>Order date</span><span>' + esc(date) + '</span></div>' +
        (ship ? '<div><span>Shipping</span><span>' + esc(ship) + '</span></div>' : '') +
        '<div><span>Items</span><span>' + items.length + ' line' + (items.length === 1 ? '' : 's') + ', ' + units + ' unit' + (units === 1 ? '' : 's') + '</span></div>' +
        (o.trackingNumber ? '<div><span>Tracking</span><span>' + esc(o.trackingNumber) + '</span></div>' : '') +
      '</div></div>' +
      '<table><thead><tr><th class="check">Packed</th><th>Product</th><th>Size</th>' + (showLots ? '<th>Lot' + (o.lotAllocations ? '' : ' (suggested)') + '</th>' : '') + '<th class="num">Qty</th><th class="num">Units</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="6">No items on this order.</td></tr>') + '</tbody>' +
      '<tfoot><tr><td></td><td colspan="' + (showLots ? 4 : 3) + '">Total units</td><td class="num">' + units + '</td></tr></tfoot></table>' +
      (o.notes ? '<div class="note"><div class="label">Customer note</div>' + esc(o.notes) + '</div>' : '') +
      '<div class="foot"><p class="thanks">Thank you for your order. Questions? Email orders@txbioresearch.com and include your order number.</p>' +
      '<p>For laboratory research use only. Not for human or animal consumption. Store according to the label; refrigerate after reconstitution.</p></div>' +
    '</section>';
  }

  function load() {
    var ids = (new URLSearchParams(location.search).get('id') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!ids.length) return msg('No order chosen. Open a slip from the Orders or To-do page.');
    var db = firebase.firestore();
    Promise.all(ids.map(function (id) {
      return db.collection('orders').doc(id).get().then(function (d) { return d.exists ? Object.assign({ id: d.id }, d.data()) : null; });
    })).then(function (orders) {
      orders = orders.filter(Boolean);
      if (!orders.length) return msg('Order not found.');
      // Not shipped yet: suggest lots from what's in stock.
      if (!window.Lots) return orders;
      var need = [];
      orders.forEach(function (o) { if (!o.lotAllocations) (o.items || []).forEach(function (i) { need.push(Lots.unitOf(i)); }); });
      if (!need.length) return orders;
      return Lots.list(db, need).then(function (lots) {
        orders.forEach(function (o) { if (!o.lotAllocations) o._lotPlan = Lots.plan(lots, o.items || []); });
        return orders;
      }).catch(function () { return orders; });
    }).then(function (orders) {
      if (!orders || !orders.length) return;
      $('msg').style.display = 'none';
      $('slips').innerHTML = orders.map(slipHtml).join('');
      $('tb-text').textContent = orders.length === 1 ? 'Packing slip · Order #' + (orders[0].orderNumber || orders[0].id) : orders.length + ' packing slips';
      document.title = (orders.length === 1 ? 'Packing slip ' + (orders[0].orderNumber || '') : orders.length + ' packing slips') + ' | TXBioResearch';
      $('print-btn').disabled = false;
      if (new URLSearchParams(location.search).get('print') === '1') {
        var img = document.querySelector('.brand img');
        var go = function () { setTimeout(function () { window.print(); }, 150); };
        if (img && !img.complete) { img.addEventListener('load', go); img.addEventListener('error', go); } else go();
      }
    }).catch(function (err) { msg('Could not load: ' + err.message); });
  }

  $('print-btn').addEventListener('click', function () { window.print(); });
  document.addEventListener('DOMContentLoaded', function () {
    if (!window.firebase) return msg('Could not load.');
    if (!firebase.apps.length && typeof firebaseConfig !== 'undefined') firebase.initializeApp(firebaseConfig);
    var done = false, waited = false;
    firebase.auth().onAuthStateChanged(function (user) {
      if (done) return;
      if (!user && !waited) { waited = true; return setTimeout(function () { if (!done) { done = true; check(firebase.auth().currentUser); } }, 1500); }
      done = true; check(user);
    });
    function check(user) {
      if (!user) { location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname + location.search); return; }
      Staff.role(user).then(function (r) {
        if (!Staff.canOpen(r, 'admin-slip.html')) return msg('Packing slips are only available to the site staff.');
        load();
      });
    }
  });
})();
