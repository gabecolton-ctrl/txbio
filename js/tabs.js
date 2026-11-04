// tabs.js — what a customer owes you for product you fronted them.
// Kept apart from store credit on purpose: a tab is money they owe, credit is
// money you owe them, and checkout only ever touches credit.
//
// Firestore (admin writes; the customer can read their own):
//   tabs/{email}                 { owedCents, frontedCents, paidCents, updatedAt }
//   tabs/{email}/entries/{id}    { type: 'fronted' | 'paid' | 'cancelled' (fronted order cancelled), amountCents (+ adds to what
//                                  they owe, − takes off), note, orderId, orderNumber, createdAt }
var Tabs = (function () {
  function db() { return firebase.firestore(); }
  function key(email) { return String(email || '').trim().toLowerCase(); }
  function ref(email) { return db().collection('tabs').doc(key(email)); }

  function normalize(d) {
    d = d || {};
    return { owedCents: d.owedCents || 0, frontedCents: d.frontedCents || 0, paidCents: d.paidCents || 0, updatedAt: d.updatedAt || '' };
  }

  function get(email) {
    return ref(email).get().then(function (doc) { return normalize(doc.exists ? doc.data() : null); });
  }

  function getAll() {
    return db().collection('tabs').get().then(function (snap) {
      var out = {};
      snap.forEach(function (d) { out[d.id] = normalize(d.data()); });
      return out;
    });
  }

  function entries(email, limit) {
    return ref(email).collection('entries').orderBy('createdAt', 'desc').limit(limit || 100).get().then(function (snap) {
      var out = [];
      snap.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); });
      return out;
    });
  }

  // type 'fronted' adds cents to what they owe; 'paid' and 'cancelled' take cents off.
  function record(email, type, cents, meta) {
    cents = Math.round(Number(cents) || 0);
    if (!(cents > 0)) return Promise.reject(new Error('Enter an amount greater than $0.'));
    var r = ref(email), entryRef = r.collection('entries').doc(), now = new Date().toISOString();
    var down = type === 'paid' || type === 'cancelled';
    var delta = down ? -cents : cents;
    return db().runTransaction(function (t) {
      return t.get(r).then(function (doc) {
        var a = normalize(doc.exists ? doc.data() : null);
        a.owedCents += delta;
        if (type === 'paid') a.paidCents += cents; else if (type === 'cancelled') a.frontedCents -= cents; else a.frontedCents += cents;
        a.updatedAt = now;
        t.set(r, a);
        t.set(entryRef, Object.assign({ type: type, note: '', orderId: '', orderNumber: '' }, meta || {}, { amountCents: delta, createdAt: now }));
        return a;
      });
    });
  }

  function money(cents) {
    var n = Math.abs(cents || 0) / 100;
    return (cents < 0 ? '-$' : '$') + n.toFixed(2);
  }

  return { get: get, getAll: getAll, entries: entries, record: record, money: money };
})();
