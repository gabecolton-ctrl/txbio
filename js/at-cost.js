// at-cost.js — "at cost" pricing for family codes, and the cost math the P&L
// page uses. Plain functions so the browser checkout, the server checkout
// (functions/) and the admin pages all compute the same numbers.
//
// Firestore:
//   costs/{unitSlug}       { perVialCost, kitCost, updatedAt, history: [{ perVialCost, from }] }
//                          unitSlug is the single-vial cart slug, e.g. "semaglutide-5mg"
//                          or "cagrilintide". Kit = 10 vials; perVialCost = kitCost / 10.
//   atCostCodes/{CODE}     { active, emails: [lowercase], markupPerVial, shippingLabel, shippingPrice, label?, role? }
//                          (label/role: set on codes Admin → Roles keeps for a customer role)
//   atCostMembers/{email}  { codes: [CODE] }   (lets listed emails read costs/)
// Only the admin can write these; see firestore.rules.

var AtCost = (function () {
  var KIT_SIZE = 10;
  var DEFAULT_MARKUP = 3; // dollars added per vial on top of cost
  // Family orders get one shipping choice (set per code on the admin page).
  var FAMILY_SHIPPING_VALUE = 'family';
  var DEFAULT_SHIPPING = { label: '2nd Day Air', price: 15 };

  function round2(n) { return Math.round(n * 100) / 100; }

  // Waters are sold to family at plain cost (no per-vial add-on).
  var NO_MARKUP = ['bac-water', 'sterile-water', 'acetic-acid-water'];
  function markupFor(unitSlug, markup) {
    var s = String(unitSlug || '');
    return NO_MARKUP.some(function (base) { return s === base || s.indexOf(base + '-') === 0; }) ? 0 : markup;
  }

  // The single-vial slug a cart line draws from, and how many vials it holds.
  function unitSlugOf(item) {
    if (item.unitSlug) return item.unitSlug;
    return String(item.slug || '').replace(/-case$/, '');
  }
  function vialsOf(item) {
    var qty = Number(item.qty) || 0;
    return item.caseOf ? qty * Number(item.caseOf) : qty;
  }

  // Prices cart lines at cost + markup per vial. A line is never charged more
  // than its regular price, and a product with no cost on file stays at its
  // regular price (listed in `missing`).
  //   costs: { unitSlug: perVialCost }
  // Returns { lines, listTotal, atCostTotal, discount, missing }
  function priceLines(items, costs, markupPerVial) {
    var markup = markupPerVial == null ? DEFAULT_MARKUP : Number(markupPerVial);
    var out = { lines: [], listTotal: 0, atCostTotal: 0, discount: 0, missing: [] };
    (items || []).forEach(function (item) {
      var listPrice = round2(Number(item.price) * Number(item.qty));
      var slug = unitSlugOf(item);
      var vials = vialsOf(item);
      var cost = costs ? costs[slug] : undefined;
      var line = { slug: item.slug, unitSlug: slug, vials: vials, listPrice: listPrice };
      if (item.quoteId || item.giftCard) {
        // Quoted lines (js/quotes.js) and gift cards keep their price.
        line.atCostPrice = listPrice;
        if (typeof cost === 'number' && cost >= 0) line.unitCost = cost;
      } else if (typeof cost === 'number' && cost >= 0) {
        line.unitCost = cost;
        line.atCostPrice = Math.min(listPrice, round2(vials * (cost + markupFor(slug, markup))));
      } else {
        line.atCostPrice = listPrice;
        out.missing.push(item.name || slug);
      }
      out.listTotal = round2(out.listTotal + listPrice);
      out.atCostTotal = round2(out.atCostTotal + line.atCostPrice);
      out.lines.push(line);
    });
    out.discount = round2(out.listTotal - out.atCostTotal);
    return out;
  }

  // Validates an at-cost code document for a buyer's email.
  function checkCode(doc, code, email) {
    if (!doc) return { valid: false, reason: 'This promo code does not exist.' };
    if (!doc.active) return { valid: false, reason: 'This promo code is no longer active.' };
    var e = String(email || '').trim().toLowerCase();
    if ((doc.emails || []).map(function (x) { return String(x).toLowerCase(); }).indexOf(e) === -1) {
      return { valid: false, reason: 'This promo code does not exist.' };
    }
    var markup = doc.markupPerVial == null ? DEFAULT_MARKUP : Number(doc.markupPerVial);
    // label: what the buyer sees, e.g. "Employee pricing" (default "Family pricing").
    return { valid: true, code: code, markupPerVial: markup, shipping: shippingOf(doc), label: doc.label || '' };
  }

  // The single shipping option a family code gives, e.g. { label, price }.
  function shippingOf(doc) {
    var price = doc && doc.shippingPrice != null && !isNaN(Number(doc.shippingPrice)) ? Number(doc.shippingPrice) : DEFAULT_SHIPPING.price;
    var label = (doc && doc.shippingLabel) || DEFAULT_SHIPPING.label;
    return { value: FAMILY_SHIPPING_VALUE, label: label + ' — $' + (price % 1 ? price.toFixed(2) : price), price: round2(price) };
  }

  // Cost per vial in effect at a date (ISO), from a costs/{slug} document's
  // history; falls back to the current cost.
  function costAt(costDoc, isoDate) {
    if (!costDoc) return null;
    var hist = (costDoc.history || []).filter(function (h) { return h && typeof h.perVialCost === 'number'; })
      .sort(function (a, b) { return String(a.from).localeCompare(String(b.from)); });
    if (!hist.length) return typeof costDoc.perVialCost === 'number' ? costDoc.perVialCost : null;
    // The latest cost set on or before the date; orders older than the first
    // recorded cost use the earliest one.
    var pick = hist[0];
    hist.forEach(function (h) { if (!isoDate || String(h.from) <= String(isoDate)) pick = h; });
    return pick.perVialCost;
  }

  return {
    KIT_SIZE: KIT_SIZE,
    DEFAULT_MARKUP: DEFAULT_MARKUP,
    DEFAULT_SHIPPING: DEFAULT_SHIPPING,
    FAMILY_SHIPPING_VALUE: FAMILY_SHIPPING_VALUE,
    shippingOf: shippingOf,
    round2: round2,
    markupFor: markupFor,
    unitSlugOf: unitSlugOf,
    vialsOf: vialsOf,
    priceLines: priceLines,
    checkCode: checkCode,
    costAt: costAt
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AtCost;
