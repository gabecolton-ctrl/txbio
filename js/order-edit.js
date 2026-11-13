// order-edit.js — change the items on an order that hasn't shipped yet
// (Admin → Orders → Edit items). Pure math is in recalc() / stockPlan() so it
// can be tested in Node (tools/order-edit-test.js); the browser part draws
// the editor and saves.
//
// Recalculates like checkout does:
//   - promo discount: the same share of the (new) subtotal as before
//   - BOGO: worked out again when the BOGO list is known (js/bogo.js)
//   - shipping: the order's option; free when the new amount reaches the
//     free-shipping minimum on the free option; an order that shipped free
//     below the minimum (Platinum, family, local) stays free
//   - tax 8.25% on the taxable amount; store credit used never exceeds the total
var OrderEdit = (function () {
  var TAX_RATE = 0.0825;
  var PB = typeof PriceBook !== 'undefined' ? PriceBook : (typeof require === 'function' ? require('./price-book.js') : null);

  function r2(n) { return Math.round(Number(n || 0) * 100) / 100; }
  function lineTotal(it) { return Number(it.price || 0) * Number(it.qty || 0); }
  function sumWhere(items, test) { return items.reduce(function (n, it) { return n + (test(it) ? lineTotal(it) : 0); }, 0); }
  function isGift(it) { return !!it.giftCard; }
  function isNoTax(it) { return !!(it.quoteId && it.noTax) || !!it.giftCard; }
  function unitOf(it) { return it.unitSlug || String(it.slug || '').replace(/-case$/, ''); }
  function unitsOf(it) { return Number(it.qty || 0) * (Number(it.caseOf) || 1); }

  // order: the saved order; items: the new list.
  // ctx: { settings (settings/pricing), bogoSlugs (array or null), calcBogo(items, slugs) }
  function recalc(order, items, ctx) {
    ctx = ctx || {};
    var sub = r2(sumWhere(items, function () { return true; }));
    var gift = sumWhere(items, isGift);
    var oldGift = sumWhere(order.items || [], isGift);
    var oldBase = Number(order.subtotal || 0) - oldGift;
    var base = sub - gift;

    var discount = 0;
    if (Number(order.discount || 0) > 0 && oldBase > 0) discount = r2(Math.min(base, base * (Number(order.discount) / oldBase)));

    var bogo = Number(order.bogoDiscount || 0);
    if (ctx.bogoSlugs && ctx.calcBogo) bogo = r2(ctx.calcBogo(items, ctx.bogoSlugs).discountAmount || 0);
    bogo = Math.min(bogo, Math.max(0, base - discount));

    var amount = base - discount - bogo; // what free shipping is measured on
    var shipping = Number(order.shipping || 0), label = order.shippingOption || '';
    var name = String(label).replace(/\s*[—-]\s*(\$[\d.,]+|FREE)\s*$/i, '').trim();
    var sh = PB ? PB.shippingOf(ctx.settings) : null;
    var opt = sh ? sh.options.filter(function (o) { return o.label === name; })[0] : null;
    if (opt && !order.atCostCode && !order.addOnTo) {
      var oldAmount = oldBase - Number(order.discount || 0) - Number(order.bogoDiscount || 0);
      var freeBefore = Number(order.shipping || 0) === 0 && !(sh.freeOption === opt.id && oldAmount >= sh.freeMin);
      if (!freeBefore) {
        shipping = sh.freeOption === opt.id && amount >= sh.freeMin ? 0 : opt.price;
        label = opt.label + ' — ' + (shipping === 0 ? 'FREE' : PB.money(opt.price));
      }
    }
    if (items.length && items.every(isGift)) shipping = 0;

    var noTax = sumWhere(items, isNoTax);
    var tax = r2(Math.max(0, base - discount - bogo - (noTax - gift)) * TAX_RATE);
    var before = r2(sub - discount - bogo + shipping + tax);
    var oldCreditCents = Number(order.creditUsedCents || 0);
    var creditCents = Math.min(oldCreditCents, Math.round(before * 100));
    return {
      subtotal: sub, discount: discount, bogoDiscount: r2(bogo), shipping: r2(shipping), shippingOption: label,
      tax: tax, totalBeforeCredit: before, creditUsedCents: creditCents, creditUsed: creditCents / 100,
      total: r2(before - creditCents / 100), creditRefundCents: oldCreditCents - creditCents
    };
  }

  // Stock changes per unit slug: + means take from stock, − means put back.
  function stockPlan(oldItems, newItems) {
    var d = {};
    (oldItems || []).forEach(function (it) { d[unitOf(it)] = (d[unitOf(it)] || 0) - unitsOf(it); });
    (newItems || []).forEach(function (it) { d[unitOf(it)] = (d[unitOf(it)] || 0) + unitsOf(it); });
    Object.keys(d).forEach(function (k) { if (!d[k]) delete d[k]; });
    return d;
  }

  // One-line summary of what changed, for the order's edit log.
  function describe(oldItems, newItems) {
    var key = function (it) { return it.slug; };
    var o = {}, n = {}, names = {};
    (oldItems || []).forEach(function (it) { o[key(it)] = (o[key(it)] || 0) + Number(it.qty || 0); names[key(it)] = it.name + (it.packSize ? ' ' + it.packSize : ''); });
    (newItems || []).forEach(function (it) { n[key(it)] = (n[key(it)] || 0) + Number(it.qty || 0); names[key(it)] = it.name + (it.packSize ? ' ' + it.packSize : ''); });
    var out = [];
    Object.keys(Object.assign({}, o, n)).forEach(function (k) {
      var a = o[k] || 0, b = n[k] || 0;
      if (a === b) return;
      out.push(!a ? 'added ' + names[k] + ' × ' + b : !b ? 'removed ' + names[k] : names[k] + ' ' + a + ' → ' + b);
    });
    return out.join('; ');
  }

  var api = { recalc: recalc, stockPlan: stockPlan, describe: describe, unitOf: unitOf, unitsOf: unitsOf };
  if (typeof document === 'undefined') return api;

  // ---------------- Browser: the editor on Admin → Orders ----------------
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return '$' + Number(n || 0).toFixed(2); }

  var data = null; // { catalog, settings, bogoSlugs }
  function load() {
    if (data) return Promise.resolve(data);
    var db = firebase.firestore();
    return Promise.all([
      PB.defaults(),
      db.collection('settings').doc('pricing').get().catch(function () { return null; }),
      window.Bogo ? Bogo.getEligibleSlugs().catch(function () { return null; }) : Promise.resolve(null)
    ]).then(function (r) {
      data = { catalog: r[0], settings: r[1] && r[1].exists ? r[1].data() : null, bogoSlugs: r[2] };
      return data;
    });
  }

  // Products you can add, priced for the order's store.
  function unitsFor(site) {
    var cat = PB.applyToCatalog(data.catalog, data.settings, site);
    var list = [];
    Object.keys(cat.products).forEach(function (slug) {
      var p = cat.products[slug];
      if (p.doses) Object.keys(p.doses).forEach(function (ds) { list.push({ slug: ds, name: p.name, packSize: p.doses[ds].packSize || ('1 vial x ' + p.doses[ds].label), price: p.doses[ds].price }); });
      else list.push({ slug: slug, name: p.name, packSize: p.packSize, price: p.price });
    });
    list.sort(function (a, b) { return (a.name + a.packSize).localeCompare(b.name + b.packSize, undefined, { numeric: true }); });
    return list;
  }

  // Opens the editor inside `host` for `order`; onSaved(updatedOrder) after saving.
  function open(host, order, onSaved) {
    host.innerHTML = '<p class="tracking-status">Loading products…</p>';
    load().then(function () {
      var units = unitsFor(order.site === 'budget' ? 'budget' : 'main');
      var items = (order.items || []).map(function (it) { return Object.assign({}, it); });
      function totals() {
        return recalc(order, items.filter(function (it) { return it.qty > 0; }), { settings: data.settings, bogoSlugs: data.bogoSlugs, calcBogo: window.Bogo && Bogo.calculateDiscount });
      }
      function totalsRows() {
        var t = totals();
        return ''+
          '<tr><td>Subtotal</td><td>' + money(order.subtotal) + ' → <strong>' + money(t.subtotal) + '</strong></td></tr>' +
          (t.discount || order.discount ? '<tr><td>Discount</td><td>−' + money(order.discount) + ' → <strong>−' + money(t.discount) + '</strong></td></tr>' : '') +
          (t.bogoDiscount || order.bogoDiscount ? '<tr><td>BOGO</td><td>−' + money(order.bogoDiscount) + ' → <strong>−' + money(t.bogoDiscount) + '</strong></td></tr>' : '') +
          '<tr><td>Shipping</td><td>' + money(order.shipping) + ' → <strong>' + (t.shipping ? money(t.shipping) : 'FREE') + '</strong></td></tr>' +
          '<tr><td>Tax</td><td>' + money(order.tax) + ' → <strong>' + money(t.tax) + '</strong></td></tr>' +
          (t.creditRefundCents > 0 ? '<tr><td>Store credit</td><td>' + money(t.creditRefundCents / 100) + ' goes back to their credit</td></tr>' : '') +
          '<tr><td>Total</td><td>' + money(order.total) + ' → <strong>' + money(t.total) + '</strong></td></tr>';
      }
      function draw() {
        host.innerHTML = '<div class="oe-box">' +
          '<strong>Edit items</strong><span class="oe-hint"> Set a quantity to 0 to remove a line. Prices are this store’s current prices.</span>' +
          '<table class="cart-table oe-table"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Line</th></tr></thead><tbody>' +
          items.map(function (it, i) {
            return '<tr' + (it.qty > 0 ? '' : ' class="oe-removed"') + '><td>' + esc(it.name) + ' <span class="oe-pack">' + esc(it.packSize || '') + '</span></td>' +
              '<td><input type="number" min="0" max="500" step="1" class="oe-qty" data-i="' + i + '" value="' + it.qty + '" aria-label="Quantity of ' + esc(it.name) + '"></td>' +
              '<td>' + money(it.price) + '</td><td class="oe-line">' + money(lineTotal(it)) + '</td></tr>';
          }).join('') + '</tbody></table>' +
          '<div class="oe-add"><select class="oe-pick" aria-label="Product to add"><option value="">Add a product…</option>' +
          units.map(function (u, i) { return '<option value="' + i + '">' + esc(u.name + ' ' + u.packSize + ' — ' + money(u.price)) + '</option>'; }).join('') +
          '</select><input type="number" class="oe-add-qty" min="1" max="500" value="1" aria-label="Quantity to add"><button type="button" class="btn-outline-light oe-add-btn">Add</button></div>' +
          '<table class="spec-table oe-totals">' + totalsRows() + '</table>' +
          (order.userEmail ? '<label class="checkbox-row oe-email"><input type="checkbox" class="oe-send" checked> <span>Email ' + esc(order.userEmail) + ' the updated order</span></label>' : '') +
          '<div class="oe-actions"><button type="button" class="btn oe-save">Save changes</button><button type="button" class="btn-outline-light oe-cancel">Cancel</button><span class="tracking-status oe-status"></span></div>' +
          '</div>';
        host.querySelectorAll('.oe-qty').forEach(function (inp) {
          // Update the numbers in place (no redraw), so typing a quantity and
          // then clicking Save never loses the click.
          inp.addEventListener('input', function () {
            var it = items[+inp.getAttribute('data-i')];
            it.qty = Math.max(0, Math.min(500, Math.round(Number(inp.value) || 0)));
            var row = inp.closest('tr');
            row.classList.toggle('oe-removed', it.qty <= 0);
            row.querySelector('.oe-line').textContent = money(lineTotal(it));
            host.querySelector('.oe-totals').innerHTML = totalsRows();
          });
        });
        host.querySelector('.oe-add-btn').addEventListener('click', function () {
          var u = units[host.querySelector('.oe-pick').value];
          var q = Math.max(1, Math.min(500, Math.round(Number(host.querySelector('.oe-add-qty').value) || 1)));
          if (!u) return;
          var same = items.filter(function (it) { return it.slug === u.slug && !it.quoteId && !it.bundleKey && !it.caseOf; })[0];
          if (same) same.qty += q;
          else items.push({ slug: u.slug, unitSlug: u.slug, name: u.name, packSize: u.packSize, price: u.price, qty: q });
          draw();
        });
        host.querySelector('.oe-cancel').addEventListener('click', function () { host.innerHTML = ''; });
        host.querySelector('.oe-save').addEventListener('click', function () { save(); });
      }
      function save() {
        var btn = host.querySelector('.oe-save'), status = host.querySelector('.oe-status');
        var kept = items.filter(function (it) { return it.qty > 0; });
        if (!kept.length) { status.textContent = 'An order needs at least one item. To drop everything, cancel the order instead.'; return; }
        var summary = describe(order.items, kept);
        if (!summary) { status.textContent = 'Nothing changed.'; return; }
        btn.disabled = true; status.textContent = 'Saving…';
        var t = totals();
        var plan = stockPlan(order.items, kept);
        // Stock first, then the order. Taking stock records how much was on hand.
        var got = {};
        var steps = Object.keys(plan).map(function (unit) {
          var n = plan[unit];
          return n > 0 ? Inventory.decrementStock(unit, n).then(function (r) { got[unit] = r; }) : Inventory.restockStock(unit, -n);
        });
        Promise.all(steps).then(function () {
          // Fulfilled / backordered per line: unchanged lines keep theirs; new or
          // bigger lines get what stock covered.
          kept.forEach(function (it) {
            var before = (order.items || []).filter(function (o) { return o.slug === it.slug && o.quoteId === it.quoteId; })[0];
            var r = got[unitOf(it)];
            if (before && before.qty === it.qty) return;
            if (r && plan[unitOf(it)] > 0) {
              var short = Math.min(unitsOf(it), (r.backordered || 0) + (before ? Number(before.backordered || 0) : 0));
              it.backordered = short; it.fulfilled = unitsOf(it) - short;
            } else if (it.fulfilled != null) {
              it.backordered = Math.min(Number(it.backordered || 0), unitsOf(it));
              it.fulfilled = unitsOf(it) - it.backordered;
            }
          });
          var now = new Date().toISOString();
          var me = (firebase.auth().currentUser || {}).email || '';
          var update = Object.assign({}, t, { items: kept, editedAt: now, editLog: firebase.firestore.FieldValue.arrayUnion({ at: now, by: me, change: summary, totalFrom: order.total, totalTo: t.total }) });
          delete update.creditRefundCents;
          return firebase.firestore().collection('orders').doc(order.id).update(update).then(function () {
            if (t.creditRefundCents > 0 && window.Credits && order.userEmail) {
              return Credits.adminAdjust(order.userEmail, t.creditRefundCents, { type: 'refunded', orderId: order.id, orderNumber: order.orderNumber || '', code: '', note: 'Order changed' }, order.site === 'budget' ? 'budget' : 'main');
            }
          }).then(function () {
            var updated = Object.assign({}, order, update, { editLog: (order.editLog || []).concat([{ at: now, by: me, change: summary, totalFrom: order.total, totalTo: t.total }]) });
            var send = host.querySelector('.oe-send');
            if (send && send.checked && window.OrderEmails) OrderEmails.sendConfirmation(updated, order.userEmail).catch(function () {});
            host.innerHTML = '<p class="tracking-status">Saved: ' + esc(summary) + '. New total ' + money(t.total) + '.</p>';
            if (onSaved) onSaved(updated);
          });
        }).catch(function (err) {
          btn.disabled = false;
          status.textContent = 'Could not save: ' + err.message;
        });
      }
      draw();
    }).catch(function (err) { host.innerHTML = '<p class="tracking-status">Could not load products: ' + esc(err.message) + '</p>'; });
  }

  api.open = open;
  return api;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OrderEdit;
