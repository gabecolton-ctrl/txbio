// pricing.js — the server's price math. Pure functions, no database, so it can
// be tested on its own. Mirrors the rounding the checkout page shows so totals
// match to the cent.

const FreeShipping = require('./free-shipping');

const MAX_QTY_PER_LINE = 500;

class PricingError extends Error {}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Turns a cart slug into the line the server will charge for, using only the
// catalog. Accepts:
//   "<product>"              single-price product (no dosage dropdown)
//   "<product>-<dose>"       a dose of a product with a dosage dropdown
//   either of the above + "-case"   a case (caseSize vials)
function resolveLine(catalog, slug) {
  if (typeof slug !== 'string' || !slug) throw new PricingError('A cart item is missing its product.');
  const isCase = /-case$/.test(slug);
  const unitSlug = isCase ? slug.slice(0, -5) : slug;

  let product = null;
  let unit = null;
  if (catalog.products[unitSlug] && !catalog.products[unitSlug].doses) {
    product = catalog.products[unitSlug];
    unit = { slug: unitSlug, price: product.price, packSize: product.packSize };
  } else {
    for (const p of Object.values(catalog.products)) {
      if (p.doses && p.doses[unitSlug]) {
        product = p;
        const d = p.doses[unitSlug];
        unit = { slug: unitSlug, price: d.price, packSize: d.packSize };
        break;
      }
    }
  }
  if (!product || !(unit.price > 0)) {
    throw new PricingError('“' + slug + '” is no longer in the catalog. Remove it from your cart and add it again.');
  }

  if (!isCase) {
    return { slug, name: product.name, packSize: unit.packSize, price: unit.price };
  }
  // Case-eligible products: pay for (caseSize - freeVials). Single-vial-only
  // products (supplies) can still be bought by the case, at full price.
  const paidVials = product.caseEligible ? catalog.caseSize - catalog.freeVials : catalog.caseSize;
  const casePack = /^1 vial/i.test(unit.packSize)
    ? unit.packSize.replace(/^1 vial/i, 'Case of ' + catalog.caseSize + ' vials')
    : 'Case of ' + catalog.caseSize + ' (' + unit.packSize + ' each)';
  return {
    slug,
    name: product.name,
    packSize: casePack,
    price: unit.price * paidVials,
    caseOf: catalog.caseSize,
    unitSlug: unit.slug
  };
}

// Cart items → priced lines. Merges duplicate slugs and validates quantities.
function priceCart(catalog, cartItems) {
  if (!Array.isArray(cartItems) || !cartItems.length) throw new PricingError('Your cart is empty.');
  const bySlug = new Map();
  for (const item of cartItems) {
    const qty = Number(item && item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw new PricingError('Each item needs a quantity between 1 and ' + MAX_QTY_PER_LINE + '.');
    }
    const slug = item.slug;
    bySlug.set(slug, (bySlug.get(slug) || 0) + qty);
  }
  const lines = [];
  for (const [slug, qty] of bySlug) {
    const line = resolveLine(catalog, slug);
    line.qty = Math.min(qty, MAX_QTY_PER_LINE);
    lines.push(line);
  }
  return lines;
}

// Same rule as js/bogo.js: every full pair of an eligible single-vial line
// gets one free; cases never get BOGO. Eligibility matches by base slug prefix.
function bogoDiscount(lines, eligibleSlugs) {
  const breakdown = [];
  let total = 0;
  for (const line of lines) {
    if (!isBogoLine(line, eligibleSlugs)) continue;
    const freeUnits = Math.floor(line.qty / 2);
    if (freeUnits <= 0) continue;
    const amount = freeUnits * line.price;
    total += amount;
    breakdown.push({ slug: line.slug, name: line.name, freeUnits, discountAmount: amount });
  }
  return { discountAmount: total, breakdown };
}

// Validates a promo code document the way js/promos.js does.
// roles: the buyer's customer roles (roleMembers/{email}.roles); a code made
// for a role (roleOnly, e.g. Employee pricing) works only for its members.
// usedCodes: codes on this buyer's earlier, non-cancelled orders (oncePerCustomer).
function checkPromo(promo, code, isFirstOrder, now, roles, usedCodes) {
  if (!promo) return { valid: false, reason: 'This promo code does not exist.' };
  if (promo.roleOnly && (roles || []).indexOf(promo.roleOnly) === -1) return { valid: false, reason: 'This promo code does not exist.' };
  if (!promo.active) return { valid: false, reason: 'This promo code is no longer active.' };
  if (promo.endsOn) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now || new Date());
    if (today > promo.endsOn) return { valid: false, reason: 'This promo code has expired.' };
  }
  if (promo.type === 'first-order' && !isFirstOrder) return { valid: false, reason: 'This code is only valid on your first order.' };
  if (promo.type === 'repeat-order' && isFirstOrder) return { valid: false, reason: 'This code is only valid on repeat orders (not your first).' };
  if (promo.oncePerCustomer && (usedCodes || []).indexOf(String(code).toUpperCase()) !== -1) return { valid: false, reason: 'You’ve already used this code. It’s one use per customer.' };
  const pct = Number(promo.discountPercent);
  if (!(pct > 0 && pct <= 100)) return { valid: false, reason: 'This promo code is misconfigured.' };
  return { valid: true, code, discountPercent: pct, affiliateEmail: promo.affiliateEmail || '' };
}

// A single-vial line of a product with BOGO on (cases never get BOGO).
function isBogoLine(line, eligibleSlugs) {
  if (line.caseOf) return false;
  return (eligibleSlugs || []).some((base) => line.slug === base || line.slug.indexOf(base + '-') === 0);
}

// Totals, rounded exactly like checkout.html's computeAndDisplayTotals().
// Promo codes don't stack with BOGO: vials in BOGO pairs aren't discounted,
// but a leftover single vial is. The code is always recorded on the order so
// affiliates are credited.
// fixedDiscount (dollars) replaces the percentage promo, e.g. at-cost pricing.
// shippingValue + family: free standard shipping at FreeShipping.MIN (js/free-shipping.js).
function computeTotals({ lines, discountPercent, fixedDiscount, bogo, bogoSlugs, shippingPrice, shippingValue, family, platinum, taxRate, creditBalanceCents, useCredit }) {
  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  const promoBase = lines.reduce((n, l) => n + l.price * (isBogoLine(l, bogoSlugs) ? l.qty % 2 : l.qty), 0);
  const discount = fixedDiscount != null ? round2(fixedDiscount) : round2(promoBase * ((discountPercent || 0) / 100));
  const discountedSubtotal = subtotal - discount - bogo;
  if (shippingValue != null) shippingPrice = FreeShipping.priceFor(shippingValue, shippingPrice, discountedSubtotal, !!family, !!platinum);
  const tax = round2(discountedSubtotal * taxRate);
  const totalBeforeCredit = discountedSubtotal + shippingPrice + tax;
  const creditUsedCents = useCredit ? Math.max(0, Math.min(creditBalanceCents || 0, Math.round(totalBeforeCredit * 100))) : 0;
  const total = round2(totalBeforeCredit - creditUsedCents / 100);
  return { subtotal, discount, bogoDiscount: bogo, tax, shipping: shippingPrice, totalBeforeCredit, creditUsedCents, creditUsed: creditUsedCents / 100, total };
}

// How many units each stock record gives up for these lines (cases count as
// caseOf units of their single-vial slug).
function stockNeeds(lines) {
  const needs = new Map();
  for (const l of lines) {
    const slug = l.caseOf ? l.unitSlug : l.slug;
    needs.set(slug, (needs.get(slug) || 0) + (l.caseOf ? l.qty * l.caseOf : l.qty));
  }
  return needs;
}

function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function cleanAddress(a) {
  a = a || {};
  return {
    addressLine1: cleanText(a.addressLine1, 120),
    addressLine2: cleanText(a.addressLine2, 120),
    city: cleanText(a.city, 80),
    state: cleanText(a.state, 40),
    zip: cleanText(a.zip, 20)
  };
}

module.exports = {
  PricingError, round2, isBogoLine, resolveLine, priceCart, bogoDiscount, checkPromo, computeTotals, stockNeeds, cleanText, cleanAddress, MAX_QTY_PER_LINE
};
