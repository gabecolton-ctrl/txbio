// credits.js — affiliate store credit.
//
// Collection: /credits/{email} (lowercased login email) =>
//   { balanceCents, earnedCents, spentCents, updatedAt }
// Subcollection: /credits/{email}/entries/{id} =>
//   { type: 'earned' | 'reversed' | 'spent' | 'refunded', amountCents,
//     orderId, orderNumber, code, note, createdAt }
//
// All amounts are whole cents so Firestore rules can check the arithmetic.
// Who can do what (see firestore.rules):
//   - The account owner can read their own credit and history, and can only
//     SPEND: lower balanceCents and raise spentCents by the same amount.
//   - Only the admin can add credit (affiliate earnings, refunds) or take it
//     back (reversals).
//
// Affiliates earn COMMISSION_RATE of an order's subtotal after promo and
// BOGO discounts (before shipping and tax), credited by the admin's Orders
// page when the order is marked shipped.

var Credits = (function () {
  var COMMISSION_RATE = 0.10;
  var db = null;

  function ensureDb() {
    if (!db) {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    }
    return db;
  }

  function key(email) {
    return String(email || '').trim().toLowerCase();
  }

  function accountRef(email) {
    return ensureDb().collection('credits').doc(key(email));
  }

  function toCents(dollars) {
    return Math.round(Number(dollars || 0) * 100);
  }

  function fromCents(cents) {
    return (cents || 0) / 100;
  }

  function formatCents(cents) {
    return '$' + fromCents(cents).toFixed(2);
  }

  function emptyAccount() {
    return { balanceCents: 0, earnedCents: 0, spentCents: 0 };
  }

  function normalize(data) {
    var a = emptyAccount();
    if (data) {
      a.balanceCents = data.balanceCents || 0;
      a.earnedCents = data.earnedCents || 0;
      a.spentCents = data.spentCents || 0;
    }
    return a;
  }

  // Returns { exists, balanceCents, earnedCents, spentCents }.
  function getAccount(email) {
    if (!key(email)) return Promise.resolve(Object.assign({ exists: false }, emptyAccount()));
    return accountRef(email).get().then(function (doc) {
      return Object.assign({ exists: doc.exists }, normalize(doc.exists ? doc.data() : null));
    });
  }

  function getEntries(email, limit) {
    return accountRef(email).collection('entries').orderBy('createdAt', 'desc').limit(limit || 50).get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); });
        return out;
      });
  }

  // Commission an affiliate earns on an order, in cents.
  function commissionCents(order) {
    // Gift cards bought on the order don't earn commission (the spend does, later).
    var base = Number(order.subtotal || 0) - Number(order.discount || 0) - Number(order.bogoDiscount || 0) - Number(order.giftCardTotal || 0);
    return Math.max(0, Math.round(base * COMMISSION_RATE * 100));
  }

  // ADMIN ONLY. Changes a balance by deltaCents (positive adds, negative
  // removes) and writes a history entry, in one transaction.
  // entry: { type, orderId, orderNumber, code, note }
  function adminAdjust(email, deltaCents, entry) {
    var ref = accountRef(email);
    var entryRef = ref.collection('entries').doc();
    var now = new Date().toISOString();
    return ensureDb().runTransaction(function (t) {
      return t.get(ref).then(function (doc) {
        var a = normalize(doc.exists ? doc.data() : null);
        a.balanceCents += deltaCents;
        if (entry.type === 'earned' || entry.type === 'reversed') a.earnedCents += deltaCents;
        if (entry.type === 'refunded') a.spentCents -= deltaCents;
        a.updatedAt = now;
        t.set(ref, a);
        t.set(entryRef, Object.assign({}, entry, { amountCents: deltaCents, createdAt: now }));
        return a;
      });
    });
  }

  // BUYER. Adds "spend this much credit" writes to a batch that also creates
  // the order, so the order and the deduction succeed or fail together.
  // `account` is the buyer's account as just read by getAccount(); if the
  // balance changed since, the rules reject the whole batch.
  function addSpendToBatch(batch, email, account, spendCents, orderRef, orderNumber) {
    var ref = accountRef(email);
    var now = new Date().toISOString();
    batch.update(ref, {
      balanceCents: account.balanceCents - spendCents,
      spentCents: account.spentCents + spendCents,
      updatedAt: now
    });
    batch.set(ref.collection('entries').doc(), {
      type: 'spent',
      amountCents: -spendCents,
      orderId: orderRef.id,
      orderNumber: orderNumber,
      code: '',
      note: '',
      createdAt: now
    });
  }

  function withTimeout(promise, ms, message) {
    var timeout = new Promise(function (resolve, reject) {
      setTimeout(function () { reject(new Error(message)); }, ms);
    });
    return Promise.race([promise, timeout]);
  }

  return {
    COMMISSION_RATE: COMMISSION_RATE,
    key: key,
    toCents: toCents,
    fromCents: fromCents,
    formatCents: formatCents,
    commissionCents: commissionCents,
    getAccount: function (email) { return withTimeout(getAccount(email), 10000, 'Loading store credit is taking too long. Please try again.'); },
    getEntries: function (email, limit) { return withTimeout(getEntries(email, limit), 10000, 'Loading credit history is taking too long. Please try again.'); },
    adminAdjust: function (email, deltaCents, entry) { return withTimeout(adminAdjust(email, deltaCents, entry), 15000, 'Updating store credit is taking too long. Please try again.'); },
    addSpendToBatch: addSpendToBatch
  };
})();

// Lets tools/shipment-tracker (Node) use the same commission math.
if (typeof module !== 'undefined' && module.exports) module.exports = Credits;
