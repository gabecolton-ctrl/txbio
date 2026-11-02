// affiliate-tiers.js — affiliate commission tiers on a rolling 90 days.
// Shared by the admin pages, the referral dashboard and the shipment tracker (Node).
//
//   Partner        10% to start
//   Pro Partner    15% with $1,500+ in referred sales in the last 90 days
//   Elite Partner  20% with $4,000+ in referred sales in the last 90 days
//
// Rolling, with a hold: the window slides every day (no reset date), and once
// an affiliate reaches a tier they keep it for at least 90 days from the last
// time they qualified for it. So hitting $4,000 locks in 20% for the next 90
// days, and every new sale that keeps them above $4,000 pushes the lock out.
// A new rate applies to orders credited after it's reached (not retroactive).
//
// Referred sales come from the affiliate's own credit history
// (credits/{email}/entries): each referral credit records the sale it was for
// (saleCents) and cancelled orders take theirs back. Older entries without
// saleCents were all at 10%, so the sale is worked out from the credit.
var AffiliateTiers = (function () {
  var TIERS = [
    { name: 'Partner', min: 0, rate: 0.10 },
    { name: 'Pro Partner', min: 1500, rate: 0.15 },
    { name: 'Elite Partner', min: 4000, rate: 0.20 }
  ];
  var WINDOW_DAYS = 90, HOLD_DAYS = 90, DAY = 864e5, BASE_RATE = 0.10;

  function tierIndex(sales) {
    var i = 0;
    TIERS.forEach(function (t, k) { if (Number(sales) >= t.min) i = k; });
    return i;
  }
  function tierFor(sales) { return TIERS[tierIndex(sales)]; }
  function nextTier(sales) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].min > Number(sales)) return TIERS[i];
    return null;
  }

  // Referral sales from history, oldest first: [{ t (ms), cents (+ sale, - reversal) }].
  function events(entries) {
    var out = [];
    (entries || []).forEach(function (en) {
      if (en.type !== 'earned' && en.type !== 'reversed') return;
      var t = Date.parse(en.createdAt || '');
      if (!t) return;
      var s = typeof en.saleCents === 'number' ? en.saleCents : Math.round((Number(en.amountCents) || 0) / BASE_RATE);
      out.push({ t: t, cents: en.type === 'reversed' ? -Math.abs(s) : Math.abs(s) });
    });
    return out.sort(function (a, b) { return a.t - b.t; });
  }
  function windowSales(evs, at) {
    var c = 0;
    evs.forEach(function (e) { if (e.t <= at && e.t > at - WINDOW_DAYS * DAY) c += e.cents; });
    return Math.max(0, c) / 100;
  }

  // Where an affiliate stands at time `now` (ms):
  // { tier, rate, sales (last 90 days), heldUntil (ms or null), next, toNext }
  function status(entries, now) {
    now = now || Date.now();
    var evs = events(entries);
    var hold = TIERS.map(function () { return 0; }); // tier index → held until (ms)
    evs.forEach(function (e) {
      if (e.cents <= 0 || e.t > now) return;
      var k = tierIndex(windowSales(evs, e.t));
      for (var j = 1; j <= k; j++) hold[j] = Math.max(hold[j], e.t + HOLD_DAYS * DAY);
    });
    var sales = windowSales(evs, now);
    var k = tierIndex(sales), heldUntil = null;
    for (var j = TIERS.length - 1; j > k; j--) if (hold[j] > now) { k = j; heldUntil = hold[j]; break; }
    if (heldUntil == null && k > 0 && hold[k] > now) heldUntil = hold[k];
    var tier = TIERS[k], next = TIERS[k + 1] || null;
    return { tier: tier, rate: tier.rate, sales: sales, heldUntil: heldUntil, next: next, toNext: next ? Math.max(0, next.min - sales) : 0 };
  }

  // The sale an order counts as: subtotal after promo and BOGO, without gift cards.
  function saleCentsOf(order) {
    var base = Number(order.subtotal || 0) - Number(order.discount || 0) - Number(order.bogoDiscount || 0) - Number(order.giftCardTotal || 0);
    return Math.max(0, Math.round(base * 100));
  }
  // { tier, rate, cents, saleCents } for crediting this order, given the history before it.
  function commissionFor(order, entries, now) {
    var s = status(entries, now);
    var saleCents = saleCentsOf(order);
    return { tier: s.tier, rate: s.rate, saleCents: saleCents, cents: Math.round(saleCents * s.rate) };
  }

  return { TIERS: TIERS, WINDOW_DAYS: WINDOW_DAYS, HOLD_DAYS: HOLD_DAYS, tierFor: tierFor, nextTier: nextTier, status: status, saleCentsOf: saleCentsOf, commissionFor: commissionFor };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AffiliateTiers;
