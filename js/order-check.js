// order-check.js — flags orders whose prices or totals don't add up.
//
// Checkout runs in the buyer's browser (payment is confirmed by hand), so a
// tech-savvy buyer could change a price before the order is saved. Admin →
// Orders runs every order through check() and shows a warning when:
//   - an item's price isn't the store's price (TXBio or TexasBench, js/price-book.js)
//   - the subtotal, tax or total don't add up
//   - the discount is bigger than the promo code allows
//   - shipping isn't the option's price, and the order doesn't qualify for free shipping
// Quotes, gift cards, panels and family (at-cost) orders keep their own prices.
// If prices were changed on Admin → Pricing after the order, a price
// difference may just be the old price, and the note says so.
var OrderCheck = (function () {
  var TAX_RATE = 0.0825;
  var PB = typeof PriceBook !== 'undefined' ? PriceBook : (typeof require === 'function' ? require('./price-book.js') : null);

  function money(n) { return '$' + Number(n || 0).toFixed(2); }
  function near(a, b, tol) { return Math.abs(Number(a || 0) - Number(b || 0)) <= (tol == null ? 0.02 : tol); }
  function siteOf(o) { return o && o.site === 'budget' ? 'budget' : 'main'; }

  // Default (catalog) price of a sellable slug, and whether its product sells by the case.
  function lookup(catalog, slug) {
    var ps = (catalog && catalog.products) || {};
    if (ps[slug] && !ps[slug].doses) return { price: ps[slug].price, caseEligible: ps[slug].caseEligible !== false };
    for (var k in ps) if (ps[k].doses && ps[k].doses[slug]) return { price: ps[k].doses[slug].price, caseEligible: ps[k].caseEligible !== false };
    return null;
  }

  // Expected price of one order line, or null when it isn't checkable.
  function expectedPrice(item, ctx, site) {
    if (!item || item.quoteId || item.giftCard || item.giftId || item.bundleKey) return null;
    var isCase = !!(item.caseOf || /-case$/.test(item.slug || ''));
    var unit = isCase ? (item.unitSlug || String(item.slug).replace(/-case$/, '')) : item.slug;
    var base = lookup(ctx.catalog, unit);
    if (!base) return null;
    var p = PB.priceOf(ctx.settings, unit, base.price, site);
    if (!isCase) return p;
    var size = Number(item.caseOf) || ctx.catalog.caseSize || 10;
    var free = base.caseEligible ? (ctx.catalog.freeVials != null ? ctx.catalog.freeVials : 3) : 0;
    return Math.round(p * (size - free) * 100) / 100;
  }

  // ctx: { catalog (functions/catalog.json defaults), settings (settings/pricing),
  //        promos: { CODE: { discountPercent, store } } }
  // → { issues: [{ level: 'bad'|'note', text }], pricesChangedAfter: bool }
  function check(order, ctx) {
    var issues = [];
    var bad = function (t) { issues.push({ level: 'bad', text: t }); };
    var note = function (t) { issues.push({ level: 'note', text: t }); };
    if (!order || !ctx || !ctx.catalog || !PB) return { issues: issues };
    var site = siteOf(order);
    var items = order.items || [];
    var family = !!order.atCostCode;
    var changedAfter = !!(ctx.settings && ctx.settings.updatedAt && order.createdAt && String(ctx.settings.updatedAt) > String(order.createdAt));

    // 1. Item prices.
    if (!family) {
      items.forEach(function (it) {
        var exp = expectedPrice(it, ctx, site);
        if (exp == null || near(it.price, exp, 0.005)) return;
        var line = (it.name || it.slug) + (it.packSize ? ' (' + it.packSize + ')' : '') + ': ' + money(it.price) + ' on the order, ' + money(exp) + ' is the price';
        if (Number(it.price) < exp) (changedAfter ? note : bad)(line + (changedAfter ? ' today (prices changed after this order)' : ''));
        else note(line + ' (charged more than the price)');
      });
    }

    // 2. Subtotal.
    var sum = items.reduce(function (n, it) { return n + Number(it.price || 0) * Number(it.qty || 0); }, 0);
    if (!near(sum, order.subtotal)) bad('Subtotal is ' + money(order.subtotal) + ' but the items add up to ' + money(sum));

    // 3. Discount vs the promo code.
    var discount = Number(order.discount || 0);
    if (discount > 0.009 && !family) {
      var code = String(order.promoCode || '').toUpperCase();
      var promo = code && ctx.promos ? ctx.promos[code] : null;
      if (!code) bad('Discount of ' + money(discount) + ' with no promo code');
      else if (ctx.promos && !promo) note('Promo code ' + code + ' no longer exists; discount ' + money(discount));
      else if (promo) {
        var max = Math.round(sum * Number(promo.discountPercent || 0)) / 100;
        if (discount > max + 0.02) bad('Discount ' + money(discount) + ' is more than ' + code + ' allows (' + (promo.discountPercent || 0) + '% = ' + money(max) + ')');
        var ps = promo.store === 'budget' || promo.store === 'both' ? promo.store : 'main';
        if (ps !== 'both' && ps !== site) bad('Promo code ' + code + ' belongs to the other store');
      }
    }

    // 4. Tax: 8.25% of the taxable amount (not quoted "no tax" items or gift cards).
    var noTax = items.reduce(function (n, it) { return n + ((it.quoteId && it.noTax) || it.giftCard ? Number(it.price || 0) * Number(it.qty || 0) : 0); }, 0);
    var afterDiscounts = Number(order.subtotal || 0) - discount - Number(order.bogoDiscount || 0);
    var expTax = Math.round(Math.max(0, afterDiscounts - noTax) * TAX_RATE * 100) / 100;
    if (!near(order.tax, expTax)) bad('Tax is ' + money(order.tax) + ', should be ' + money(expTax));

    // 5. Shipping: the option's price, or free when the order qualifies.
    var label = String(order.shippingOption || '');
    var ship = Number(order.shipping || 0);
    var giftOnly = items.length > 0 && items.every(function (it) { return it.giftCard; });
    if (!family && !giftOnly && label && !/pickup|drop[- ]?off|local/i.test(label)) {
      var name = label.replace(/\s*[—-]\s*(\$[\d.,]+|FREE)\s*$/i, '').trim();
      var opt = PB.shippingOf(ctx.settings).options.filter(function (o) { return o.label === name; })[0];
      if (opt) {
        var sh = PB.shippingOf(ctx.settings);
        var qualifies = sh.freeOption === opt.id && afterDiscounts - noTax >= sh.freeMin;
        if (near(ship, 0) && opt.price > 0 && !qualifies) note('Free ' + opt.label + ' shipping: only Platinum members get that on an order this size (normally ' + money(opt.price) + ')');
        else if (!near(ship, 0) && !near(ship, opt.price)) (changedAfter ? note : bad)('Shipping ' + money(ship) + ', the ' + opt.label + ' price is ' + money(opt.price));
      }
    }

    // 6. Total.
    var expBefore = afterDiscounts + ship + Number(order.tax || 0);
    var before = order.totalBeforeCredit != null ? Number(order.totalBeforeCredit) : expBefore;
    if (!near(before, expBefore)) bad('Total before credit is ' + money(before) + ' but subtotal − discounts + shipping + tax = ' + money(expBefore));
    var credit = Number(order.creditUsedCents || 0) / 100;
    if (!near(order.total, before - credit)) bad('Total is ' + money(order.total) + ', should be ' + money(before - credit) + (credit ? ' after ' + money(credit) + ' store credit' : ''));

    return { issues: issues, pricesChangedAfter: changedAfter };
  }

  return { check: check, expectedPrice: expectedPrice };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OrderCheck;
