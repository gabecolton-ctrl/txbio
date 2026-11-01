// affiliate-tiers.js — affiliate commission tiers. The more referred sales an
// affiliate has had shipped, the higher the rate on their NEXT orders (not
// retroactive). Shared by the admin pages, the referral dashboard and the
// shipment tracker (Node).
//
//   Partner        $0+       10% of the order (after discounts, before shipping and tax)
//   Pro Partner    $1,500+   15%
//   Elite Partner  $5,000+   20%
//
// "Referred sales" come from the affiliate's own credit history
// (credits/{email}/entries): each referral credit records the sale it was
// for (saleCents); cancelled orders take theirs back. Older entries without
// saleCents were all at 10%, so the sale is worked out from the credit.
var AffiliateTiers = (function () {
  var TIERS = [
    { name: 'Partner', min: 0, rate: 0.10 },
    { name: 'Pro Partner', min: 1500, rate: 0.15 },
    { name: 'Elite Partner', min: 5000, rate: 0.20 }
  ];
  var BASE_RATE = 0.10; // the rate before tiers existed

  function tierFor(sales) {
    var t = TIERS[0];
    TIERS.forEach(function (x) { if (Number(sales) >= x.min) t = x; });
    return t;
  }
  function nextTier(sales) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].min > Number(sales)) return TIERS[i];
    return null;
  }
  // Referred sales in dollars, from credit history entries.
  function salesFromEntries(entries) {
    var cents = 0;
    (entries || []).forEach(function (en) {
      if (en.type !== 'earned' && en.type !== 'reversed') return;
      var s = typeof en.saleCents === 'number' ? en.saleCents : Math.round((Number(en.amountCents) || 0) / BASE_RATE);
      cents += en.type === 'reversed' ? -Math.abs(s) : Math.abs(s);
    });
    return Math.max(0, cents) / 100;
  }
  // The sale an order counts as: subtotal after promo and BOGO, without gift cards.
  function saleCentsOf(order) {
    var base = Number(order.subtotal || 0) - Number(order.discount || 0) - Number(order.bogoDiscount || 0) - Number(order.giftCardTotal || 0);
    return Math.max(0, Math.round(base * 100));
  }
  // { tier, rate, cents, saleCents } for crediting this order, given the history before it.
  function commissionFor(order, entries) {
    var tier = tierFor(salesFromEntries(entries));
    var saleCents = saleCentsOf(order);
    return { tier: tier, rate: tier.rate, saleCents: saleCents, cents: Math.round(saleCents * tier.rate) };
  }

  return { TIERS: TIERS, tierFor: tierFor, nextTier: nextTier, salesFromEntries: salesFromEntries, saleCentsOf: saleCentsOf, commissionFor: commissionFor };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AffiliateTiers;
