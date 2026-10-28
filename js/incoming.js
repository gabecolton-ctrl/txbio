// incoming.js — supplier shipments on their way to you (Admin → Incoming),
// and receiving them into stock. Shared by the admin page (browser) and the
// UPS tracker (tools/shipment-tracker), so both add stock the same way.
//
// Firestore: incoming/{id} {
//   supplier, reference, trackingNumber, expectedDate ('YYYY-MM-DD'), notes,
//   autoReceive (add to stock when UPS shows delivered),
//   items: [{ slug, name, kits, qty }]  entered in kits; qty = vials (kits × 10)
//   status: 'ordered' | 'in-transit' | 'delivered' | 'received' | 'cancelled'
//   createdAt, shippedAt, deliveredAt, receivedAt, receivedBy,
//   receivedItems: [{ slug, name, qty, before, after }],
//   trackingCheckedAt, trackingStatusText
// }
// Admin-only (firestore.rules).

var Incoming = (function () {
  var STATUS = {
    ordered: 'Ordered',
    'in-transit': 'In transit',
    delivered: 'Delivered, not yet received',
    received: 'Received into stock',
    cancelled: 'Cancelled'
  };
  var OPEN = ['ordered', 'in-transit', 'delivered'];
  // Every supplier kit is 10 vials; shipments are entered in kits.
  var KIT_SIZE = 10;
  function totalUnits(items) {
    return (items || []).reduce(function (n, i) { return n + (Number(i.qty) || 0); }, 0);
  }
  function nowIso() { return new Date().toISOString(); }

  // Adds a shipment's items to stock and marks it received, in one
  // transaction (so it can never be added twice).
  //   db: Firestore (browser compat or firebase-admin)
  //   id: incoming doc id
  //   opts.items: optional [{ slug, name, qty }] actually received (defaults to the shipment's items)
  //   opts.by: who/what received it (shown in history)
  // Resolves { ok, already, lines }.
  function receive(db, id, opts) {
    opts = opts || {};
    var ref = db.collection('incoming').doc(id);
    return db.runTransaction(function (t) {
      return t.get(ref).then(function (snap) {
        if (!snap.exists) throw new Error('Shipment not found.');
        var ship = snap.data();
        if (ship.status === 'received') return { ok: false, already: true, lines: ship.receivedItems || [] };
        if (ship.status === 'cancelled') throw new Error('This shipment was cancelled.');
        var items = (opts.items || ship.items || []).map(function (i) {
          return { slug: String(i.slug), name: i.name || i.slug, qty: Math.max(0, Math.round(Number(i.qty) || 0)) };
        }).filter(function (i) { return i.slug && i.qty > 0; });
        // Combine repeated products so each stock count is read once.
        var bySlug = {};
        items.forEach(function (i) { if (bySlug[i.slug]) bySlug[i.slug].qty += i.qty; else bySlug[i.slug] = { slug: i.slug, name: i.name, qty: i.qty }; });
        var slugs = Object.keys(bySlug);
        var stockRefs = slugs.map(function (s) { return db.collection('inventory').doc(s); });
        return Promise.all(stockRefs.map(function (r) { return t.get(r); })).then(function (snaps) {
          var at = nowIso();
          var lines = slugs.map(function (s, k) {
            var d = snaps[k].exists ? snaps[k].data() : null;
            var before = d && typeof d.qty === 'number' ? d.qty : null; // null = wasn't tracked yet
            var after = (before || 0) + bySlug[s].qty;
            t.set(stockRefs[k], { qty: after, updatedAt: at }, { merge: true });
            return { slug: s, name: bySlug[s].name, qty: bySlug[s].qty, before: before, after: after };
          });
          t.update(ref, { status: 'received', receivedAt: at, receivedBy: opts.by || 'admin', receivedItems: lines });
          return { ok: true, already: false, lines: lines };
        });
      });
    });
  }

  return { STATUS: STATUS, OPEN: OPEN, KIT_SIZE: KIT_SIZE, totalUnits: totalUnits, receive: receive };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Incoming;
