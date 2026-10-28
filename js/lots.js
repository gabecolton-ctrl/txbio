// lots.js — lot numbers and expiration dates. Lots are created when a
// supplier shipment is received (js/incoming.js) and assigned to orders
// first-expiring-first when an order ships (admin Orders page or the UPS
// tracker). Packing slips print them; To-do warns before they expire.
// Shared by the browser (admin) and tools/shipment-tracker.
//
// Firestore (admin only): lots/{id} {
//   slug, name, lot, exp ('YYYY-MM-DD' or ''), qtyReceived, qtyRemaining,
//   receivedAt, incomingId, supplier
// }
// orders/{id}.lotAllocations: [{ slug, name, lot, exp, qty, lotId }]  (lot '' = no lot on record)
var Lots = (function () {
  var WARN_DAYS = 60;

  function unitOf(item) { return item.caseOf ? (item.unitSlug || String(item.slug).replace(/-case$/, '')) : item.slug; }
  function vialsOf(item) { return (Number(item.qty) || 0) * (Number(item.caseOf) || 1); }
  // First to expire first; lots without a date go last, then oldest received.
  function order(a, b) {
    var ea = a.exp || '9999-12-31', eb = b.exp || '9999-12-31';
    return ea < eb ? -1 : ea > eb ? 1 : String(a.receivedAt || '').localeCompare(String(b.receivedAt || ''));
  }
  function daysLeft(exp) { return exp ? Math.floor((new Date(exp + 'T12:00:00') - Date.now()) / 864e5) : null; }

  // Pure: which lots an order would use. lots: [{ id, slug, lot, exp, qtyRemaining, ... }]
  function plan(lots, items) {
    var left = {};
    (lots || []).forEach(function (l) { left[l.id] = Number(l.qtyRemaining) || 0; });
    var out = [];
    (items || []).forEach(function (it) {
      var unit = unitOf(it), need = vialsOf(it);
      (lots || []).filter(function (l) { return l.slug === unit && left[l.id] > 0; }).sort(order).forEach(function (l) {
        if (need <= 0) return;
        var take = Math.min(need, left[l.id]);
        left[l.id] -= take; need -= take;
        out.push({ slug: unit, name: it.name || l.name || unit, lot: l.lot || '', exp: l.exp || '', qty: take, lotId: l.id });
      });
      if (need > 0) out.push({ slug: unit, name: it.name || unit, lot: '', exp: '', qty: need, lotId: null });
    });
    return out;
  }

  function list(db, slugs) {
    var uniq = slugs.filter(function (s, i) { return slugs.indexOf(s) === i; });
    return Promise.all(uniq.map(function (s) {
      return db.collection('lots').where('slug', '==', s).get().then(function (snap) {
        return (snap.docs || []).map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      });
    })).then(function (r) { return [].concat.apply([], r); });
  }

  // Assigns lots to a shipped order, once (one transaction). Resolves the
  // allocations, or null if already done / nothing to assign.
  function allocate(db, orderId) {
    var ref = db.collection('orders').doc(orderId);
    return ref.get().then(function (snap) {
      var o = snap.exists ? snap.data() : null;
      if (!o || o.lotsAllocatedAt || !(o.items || []).length) return null;
      return list(db, o.items.map(unitOf)).then(function (found) {
        if (!found.length) return null; // no lots recorded for these products yet
        var refs = found.map(function (l) { return db.collection('lots').doc(l.id); });
        return db.runTransaction(function (t) {
          return Promise.all([t.get(ref)].concat(refs.map(function (r) { return t.get(r); }))).then(function (s) {
            var fresh = s[0].exists ? s[0].data() : null;
            if (!fresh || fresh.lotsAllocatedAt) return null;
            var lots = s.slice(1).map(function (d, i) { return d.exists ? Object.assign({ id: found[i].id }, d.data()) : null; }).filter(Boolean);
            var alloc = plan(lots, fresh.items);
            var used = {};
            alloc.forEach(function (a) { if (a.lotId) used[a.lotId] = (used[a.lotId] || 0) + a.qty; });
            lots.forEach(function (l) {
              if (used[l.id]) t.update(db.collection('lots').doc(l.id), { qtyRemaining: Math.max(0, (Number(l.qtyRemaining) || 0) - used[l.id]) });
            });
            t.update(ref, { lotAllocations: alloc, lotsAllocatedAt: new Date().toISOString() });
            return alloc;
          });
        });
      });
    });
  }

  // Puts an order's vials back into their lots (order cancelled after shipping).
  function release(db, orderId) {
    var ref = db.collection('orders').doc(orderId);
    return db.runTransaction(function (t) {
      return t.get(ref).then(function (snap) {
        var o = snap.exists ? snap.data() : null;
        if (!o || !o.lotsAllocatedAt || o.lotsReleasedAt) return null;
        var allocs = (o.lotAllocations || []).filter(function (a) { return a.lotId; });
        var lotRefs = allocs.map(function (a) { return db.collection('lots').doc(a.lotId); });
        return Promise.all(lotRefs.map(function (r) { return t.get(r); })).then(function (ls) {
          var add = {};
          allocs.forEach(function (a, i) {
            if (!ls[i].exists) return;
            if (!add[a.lotId]) add[a.lotId] = { ref: lotRefs[i], base: Number(ls[i].data().qtyRemaining) || 0, n: 0 };
            add[a.lotId].n += a.qty;
          });
          Object.keys(add).forEach(function (k) { t.update(add[k].ref, { qtyRemaining: add[k].base + add[k].n }); });
          t.update(ref, { lotsReleasedAt: new Date().toISOString() });
          return true;
        });
      });
    });
  }

  return { WARN_DAYS: WARN_DAYS, unitOf: unitOf, plan: plan, list: list, allocate: allocate, release: release, daysLeft: daysLeft, order: order };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Lots;
