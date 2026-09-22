// bogo.js — automatic "buy one, get one free" logic for specific products.
// Collection: /bogoProducts/{slug} => { active: boolean }
// Applies automatically at checkout — no promo code needed. For each
// eligible product in the cart, every complete pair (2, 4, 6...) gets one
// unit free. An odd unit at the end (5th, 7th...) is charged normally.

var Bogo = (function () {
  var db = null;

  function ensureDb() {
    if (!db) {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    }
    return db;
  }

  function getEligibleSlugs() {
    return ensureDb().collection('bogoProducts').where('active', '==', true).get().then(function (snapshot) {
      var slugs = [];
      snapshot.forEach(function (doc) { slugs.push(doc.id); });
      return slugs;
    });
  }

  function getAllBogoSettings() {
    return ensureDb().collection('bogoProducts').get().then(function (snapshot) {
      var settings = {};
      snapshot.forEach(function (doc) {
        settings[doc.id] = doc.data().active;
      });
      return settings;
    });
  }

  function setBogoEligibility(slug, active) {
    return ensureDb().collection('bogoProducts').doc(slug).set({ active: active });
  }

  // Given cart items and the set of eligible base-product slugs, returns:
  // { discountAmount: number, breakdown: [{ slug, name, freeUnits, discountAmount }] }
  // Matches by prefix since multi-dose products add cart items with dose-
  // suffixed slugs like "r-3-10mg", not the bare eligible slug "r-3".
  function isEligible(itemSlug, eligibleSlugs) {
    return eligibleSlugs.some(function (baseSlug) {
      return itemSlug === baseSlug || itemSlug.indexOf(baseSlug + '-') === 0;
    });
  }

  function calculateDiscount(items, eligibleSlugs) {
    var breakdown = [];
    var totalDiscount = 0;

    items.forEach(function (item) {
      if (!isEligible(item.slug, eligibleSlugs)) return;
      var freeUnits = Math.floor(item.qty / 2);
      if (freeUnits <= 0) return;
      var itemDiscount = freeUnits * item.price;
      totalDiscount += itemDiscount;
      breakdown.push({
        slug: item.slug,
        name: item.name,
        freeUnits: freeUnits,
        discountAmount: itemDiscount
      });
    });

    return { discountAmount: totalDiscount, breakdown: breakdown };
  }

  function withTimeout(promise, ms, message) {
    var timeout = new Promise(function (resolve, reject) {
      setTimeout(function () { reject(new Error(message || 'Request timed out. Please try again.')); }, ms);
    });
    return Promise.race([promise, timeout]);
  }

  function withRetry(fn, args, firstMs, secondMs, message) {
    return withTimeout(fn.apply(null, args), firstMs, 'timeout').catch(function (err) {
      if (err.message === 'timeout') {
        return withTimeout(fn.apply(null, args), secondMs, message);
      }
      throw err;
    });
  }

  return {
    getEligibleSlugs: function () { return withRetry(getEligibleSlugs, [], 10000, 15000, 'Checking BOGO eligibility is taking too long. Please try again.'); },
    getAllBogoSettings: function () { return withRetry(getAllBogoSettings, [], 10000, 15000, 'Loading BOGO settings is taking too long. Please try again.'); },
    setBogoEligibility: function (slug, active) { return withRetry(setBogoEligibility, [slug, active], 10000, 15000, 'Saving BOGO setting is taking too long. Please try again.'); },
    calculateDiscount: calculateDiscount
  };
})();
