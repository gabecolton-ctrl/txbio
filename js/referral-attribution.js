// referral-attribution.js — who gets affiliate credit for an order.
// The first time a customer's order is credited to an affiliate (their code
// or link), the customer is saved as that affiliate's referral for 18 months
// from that order. Every order the customer places in that window credits the
// same affiliate, with or without a code (even with another promo code). The
// first affiliate keeps the customer for the whole window; after it ends, a
// new code use starts a new 18 months.
//
// Firestore: referredCustomers/{customerEmail}
//   { customerEmail, affiliateEmail, code, firstOrderId, firstOrderNumber, firstOrderAt, expiresAt, createdAt }
// Written by the admin pages and the shipment tracker; the affiliate can list
// theirs (no customer details shown), the customer can read their own.
var ReferralAttribution = (function () {
  var WINDOW_MONTHS = 18;

  function addMonths(iso, n) {
    var d = new Date(iso || Date.now());
    var day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return d.toISOString();
  }

  function lower(v) { return String(v || '').trim().toLowerCase(); }

  // order: the order; code: the code on it ('' if none); codeAffiliate: that
  // code's affiliate email ('' if none); record: the customer's saved referral
  // or null. Returns { affiliateEmail, code, source: 'saved' | 'code', newRecord? }
  // or { skip: reason } or null (no affiliate).
  function decide(order, code, codeAffiliate, record) {
    if (!order || order.atCostCode) return { skip: 'family' };
    var customer = lower(order.userEmail);
    var when = order.createdAt || new Date().toISOString();
    var active = record && record.affiliateEmail && record.expiresAt && when < record.expiresAt && (!record.firstOrderAt || when >= record.firstOrderAt);
    var out = null;
    if (active) {
      out = { affiliateEmail: lower(record.affiliateEmail), code: lower(codeAffiliate) === lower(record.affiliateEmail) && code ? code : (record.code || code || ''), source: 'saved' };
    } else if (codeAffiliate) {
      out = { affiliateEmail: lower(codeAffiliate), code: code, source: 'code' };
      if (customer && customer !== lower(codeAffiliate)) {
        out.newRecord = {
          customerEmail: customer, affiliateEmail: lower(codeAffiliate), code: code,
          firstOrderId: order.id || '', firstOrderNumber: order.orderNumber || '',
          firstOrderAt: when, expiresAt: addMonths(when, WINDOW_MONTHS), createdAt: new Date().toISOString()
        };
      }
    }
    if (!out) return null;
    if (customer && out.affiliateEmail === customer) return { skip: 'self' };
    return out;
  }

  function isActive(record, now) {
    return !!(record && record.expiresAt && (now || new Date().toISOString()) < record.expiresAt);
  }

  return { WINDOW_MONTHS: WINDOW_MONTHS, addMonths: addMonths, decide: decide, isActive: isActive };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ReferralAttribution;
