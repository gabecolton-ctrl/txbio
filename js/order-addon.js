// order-addon.js — "Add items" to an order that hasn't been confirmed yet.
//
// On My Orders a pending order has an "Add items" button. It remembers the
// order here and sends the buyer to shop. The cart and checkout show a banner,
// and checkout places the new items as a separate order linked to the first
// one (addOnTo / addOnToNumber) with one shipping choice: "Ships with order
// #X — $0", going to the first order's address. Admin → Orders shows the two
// together so they're packed in one box.
//
// The add-on only applies while the first order is still pending (not
// confirmed), belongs to this buyer and is from this store; checkout checks
// again right before placing it.
var OrderAddon = (function () {
  var KEY = 'txbio_addon';
  var MAX_AGE = 24 * 60 * 60 * 1000; // a forgotten add-on stops after a day

  function site() { return window.Sites ? Sites.current() : 'main'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function get() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!a || !a.orderId || a.site !== site() || !(Date.now() - a.at < MAX_AGE)) return null;
      return a;
    } catch (e) { return null; }
  }
  function start(order) {
    try { localStorage.setItem(KEY, JSON.stringify({ orderId: order.id, orderNumber: order.orderNumber || '', site: site(), at: Date.now() })); } catch (e) {}
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // Still OK to add to? → the order, or null (and the reason).
  function canAddTo(order, uid) {
    if (!order) return { ok: false, why: 'That order wasn’t found.' };
    if (order.userId !== uid) return { ok: false, why: 'That order is on another account.' };
    if ((order.site === 'budget' ? 'budget' : 'main') !== site()) return { ok: false, why: 'That order is from the other store.' };
    if ((order.status || 'pending') !== 'pending') return { ok: false, why: 'Order #' + (order.orderNumber || '') + ' has been confirmed, so it can’t take more items. Place a new order instead.' };
    if (order.addOnTo) return { ok: false, why: 'That order is itself an add-on.' };
    return { ok: true };
  }

  // Reads the order fresh from Firestore. → Promise<{ ok, why, order }>
  function verify(uid) {
    var a = get();
    if (!a) return Promise.resolve({ ok: false });
    return firebase.firestore().collection('orders').doc(a.orderId).get().then(function (snap) {
      var order = snap.exists ? Object.assign({ id: snap.id }, snap.data()) : null;
      var r = canAddTo(order, uid);
      r.order = order;
      return r;
    }).catch(function () { return { ok: false, why: 'Couldn’t check that order.' }; });
  }

  // The banner on the cart and checkout. onCancel runs after "Cancel".
  function banner(el, a, onCancel, problem) {
    if (!el) return;
    if (!a) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.className = 'addon-banner' + (problem ? ' is-problem' : '');
    el.innerHTML = problem
      ? '<span>' + esc(problem) + '</span> <button type="button" class="btn-outline-light addon-cancel">OK</button>'
      : '<span><strong>Adding to order #' + esc(a.orderNumber) + '.</strong> These items ship in the same box, with no extra shipping.</span> ' +
        '<button type="button" class="btn-outline-light addon-cancel">Make it a separate order</button>';
    el.style.display = '';
    el.querySelector('.addon-cancel').addEventListener('click', function () { clear(); banner(el, null); if (onCancel) onCancel(); });
  }

  return { KEY: KEY, get: get, start: start, clear: clear, canAddTo: canAddTo, verify: verify, banner: banner };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OrderAddon;
