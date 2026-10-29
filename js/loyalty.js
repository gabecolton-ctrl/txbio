// loyalty.js — loyalty tiers. Customers earn store credit on every order that
// ships, at a rate set by their lifetime spend (shipped orders before this
// one). Shared by the admin Orders page, the UPS tracker
// (tools/shipment-tracker) and the account page.
//
//   Member    $0+       no reward yet
//   Silver    $500+     3% back
//   Gold      $1,500+   5% back
//   Platinum  $2,500+   5% back + free 2nd Day shipping on every order (js/free-shipping.js)
//
// "Spend" = order subtotal after promo and BOGO discounts (no shipping or
// tax), the same base as affiliate credit. Family (at-cost) orders don't
// earn or count. Cancelling a rewarded order takes the reward back.
var Loyalty = (function () {
  var TIERS = [
    { name: 'Member', min: 0, pct: 0 },
    { name: 'Silver', min: 500, pct: 0.03 },
    { name: 'Gold', min: 1500, pct: 0.05 },
    { name: 'Platinum', min: 2500, pct: 0.05, freeShipping: true }
  ];
  var COUNTED = ['shipped', 'delivered'];

  function spendOf(o) {
    if (!o || o.atCostCode) return 0;
    // Gift cards bought don't count (what the friend spends with them does).
    return Math.max(0, Number(o.subtotal || 0) - Number(o.discount || 0) - Number(o.bogoDiscount || 0) - Number(o.giftCardTotal || 0));
  }
  function counts(o) { return o && COUNTED.indexOf(o.status) !== -1 && !o.atCostCode; }
  function lifetime(orders, exceptId) {
    return Math.round((orders || []).reduce(function (n, o) { return n + (counts(o) && o.id !== exceptId ? spendOf(o) : 0); }, 0) * 100) / 100;
  }
  function tierFor(spend) {
    var t = TIERS[0];
    TIERS.forEach(function (x) { if (spend >= x.min) t = x; });
    return t;
  }
  function nextTier(spend) {
    for (var i = 0; i < TIERS.length; i++) if (spend < TIERS[i].min) return TIERS[i];
    return null;
  }
  function rewardCents(order, priorSpend) {
    var t = tierFor(priorSpend);
    return { tier: t, cents: Math.max(0, Math.round(spendOf(order) * t.pct * 100)) };
  }

  // Gives the reward for one shipped order, once. Works with the browser
  // Firestore SDK and firebase-admin. Resolves { cents, tier } or null.
  function credit(db, orderId, note) {
    var ref = db.collection('orders').doc(orderId);
    return ref.get().then(function (snap) {
      var o = snap.exists ? snap.data() : null;
      if (!o || !o.userId || !o.userEmail || o.atCostCode || (o.loyaltyCreditedAt && !o.loyaltyReversedAt)) return null;
      return db.collection('orders').where('userId', '==', o.userId).get().then(function (all) {
        var list = [];
        (all.docs || []).forEach(function (d) { list.push(Object.assign({ id: d.id }, d.data())); });
        // Only orders shipped before this one count toward the tier.
        var before = list.filter(function (x) { return x.id !== orderId && String(x.createdAt || '') < String(o.createdAt || ''); });
        var r = rewardCents(o, lifetime(before));
        if (r.cents <= 0) return null;
        var email = String(o.userEmail).toLowerCase();
        var creditRef = db.collection('credits').doc(email);
        var entryRef = creditRef.collection('entries').doc();
        return db.runTransaction(function (t) {
          return Promise.all([t.get(ref), t.get(creditRef)]).then(function (s) {
            var fresh = s[0].exists ? s[0].data() : null;
            if (!fresh || (fresh.loyaltyCreditedAt && !fresh.loyaltyReversedAt) || COUNTED.indexOf(fresh.status) === -1) return null;
            var c = s[1].exists ? s[1].data() : {};
            var at = new Date().toISOString();
            t.set(creditRef, { balanceCents: (c.balanceCents || 0) + r.cents, earnedCents: c.earnedCents || 0, spentCents: c.spentCents || 0, updatedAt: at });
            t.set(entryRef, { type: 'loyalty', orderId: orderId, orderNumber: o.orderNumber || '', code: r.tier.name, note: note || '', amountCents: r.cents, createdAt: at });
            t.update(ref, { loyaltyCreditCents: r.cents, loyaltyTier: r.tier.name, loyaltyCreditedAt: at, loyaltyReversedAt: null });
            return { cents: r.cents, tier: r.tier };
          });
        });
      });
    });
  }

  // Takes a reward back (order cancelled after it was credited).
  function reverse(db, orderId) {
    var ref = db.collection('orders').doc(orderId);
    return db.runTransaction(function (t) {
      return t.get(ref).then(function (snap) {
        var o = snap.exists ? snap.data() : null;
        if (!o || !o.loyaltyCreditedAt || o.loyaltyReversedAt || !(o.loyaltyCreditCents > 0)) return null;
        var creditRef = db.collection('credits').doc(String(o.userEmail).toLowerCase());
        return t.get(creditRef).then(function (cs) {
          var c = cs.exists ? cs.data() : {};
          var at = new Date().toISOString();
          t.set(creditRef, { balanceCents: (c.balanceCents || 0) - o.loyaltyCreditCents, earnedCents: c.earnedCents || 0, spentCents: c.spentCents || 0, updatedAt: at });
          t.set(creditRef.collection('entries').doc(), { type: 'loyalty-reversed', orderId: orderId, orderNumber: o.orderNumber || '', code: o.loyaltyTier || '', note: 'Order cancelled', amountCents: -o.loyaltyCreditCents, createdAt: at });
          t.update(ref, { loyaltyReversedAt: at });
          return { cents: o.loyaltyCreditCents };
        });
      });
    });
  }

  // The signed-in customer's own tier (browser), remembered 10 min per tab.
  function myTier(db, uid) {
    var key = 'txbio_tier_' + uid;
    try { var c = JSON.parse(sessionStorage.getItem(key) || 'null'); if (c && Date.now() - c.at < 600000) return Promise.resolve({ tier: tierFor(c.spend), spend: c.spend }); } catch (e) {}
    return db.collection('orders').where('userId', '==', uid).get().then(function (snap) {
      var list = [];
      (snap.docs || []).forEach(function (d) { list.push(Object.assign({ id: d.id }, d.data())); });
      var spend = lifetime(list);
      try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), spend: spend })); } catch (e) {}
      return { tier: tierFor(spend), spend: spend };
    });
  }

  return { TIERS: TIERS, myTier: myTier, spendOf: spendOf, lifetime: lifetime, tierFor: tierFor, nextTier: nextTier, rewardCents: rewardCents, credit: credit, reverse: reverse };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Loyalty;
