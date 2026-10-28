// promos.js — discount code management and validation.
// Collection: /promoCodes/{CODE} => {
//   discountPercent: number,
//   type: "first-order" | "repeat-order" | "always",
//   active: boolean,
//   timesUsed: number,
//   totalDiscounted: number,   // cumulative $ discounted across all uses
//   createdAt: string,
//   affiliateEmail: string     // optional; earns store credit on orders using the code
// }

var Promos = (function () {
  var db = null;

  function ensureDb() {
    if (!db) {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    }
    return db;
  }

  function normalizeCode(code) {
    return (code || '').trim().toUpperCase();
  }

  function getCode(code) {
    var normalized = normalizeCode(code);
    return ensureDb().collection('promoCodes').doc(normalized).get().then(function (doc) {
      if (!doc.exists) return null;
      return Object.assign({ code: normalized }, doc.data());
    });
  }

  function getAllCodes() {
    return ensureDb().collection('promoCodes').get().then(function (snapshot) {
      var codes = [];
      snapshot.forEach(function (doc) {
        codes.push(Object.assign({ code: doc.id }, doc.data()));
      });
      return codes;
    });
  }

  // Last day a code works (YYYY-MM-DD, Dallas time), or '' for no end.
  function todayCentral() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function isExpired(promo) { return !!(promo && promo.endsOn && todayCentral() > promo.endsOn); }

  function createOrUpdateCode(code, discountPercent, type, active, affiliateEmail, endsOn) {
    var normalized = normalizeCode(code);
    var ref = ensureDb().collection('promoCodes').doc(normalized);
    return ref.get().then(function (doc) {
      var existing = doc.exists ? doc.data() : {};
      return ref.set({
        discountPercent: discountPercent,
        type: type,
        active: active,
        affiliateEmail: (affiliateEmail || '').trim().toLowerCase(),
        endsOn: /^\d{4}-\d{2}-\d{2}$/.test(endsOn || '') ? endsOn : '',
        timesUsed: existing.timesUsed || 0,
        totalDiscounted: existing.totalDiscounted || 0,
        createdAt: existing.createdAt || new Date().toISOString()
      });
    });
  }

  function deleteCode(code) {
    var normalized = normalizeCode(code);
    return ensureDb().collection('promoCodes').doc(normalized).delete();
  }

  // Validates a code against this user's order history. Returns a Promise
  // resolving to { valid: true, discountPercent, code } or
  // { valid: false, reason: "..." }.
  function validateCode(code, isFirstOrder) {
    return getCode(code).then(function (promo) {
      if (!promo) {
        return { valid: false, reason: 'This promo code does not exist.' };
      }
      if (!promo.active) {
        return { valid: false, reason: 'This promo code is no longer active.' };
      }
      if (isExpired(promo)) {
        return { valid: false, reason: 'This promo code has expired.' };
      }
      if (promo.roleOnly) {
        // A role's code (e.g. Employee pricing) works only for that role's members.
        var u = firebase.auth().currentUser;
        var email = String((u && u.email) || '').toLowerCase();
        if (!email) return { valid: false, reason: 'This promo code does not exist.' };
        return ensureDb().collection('roleMembers').doc(email).get().then(function (m) {
          var roles = m.exists ? (m.data().roles || []) : [];
          if (roles.indexOf(promo.roleOnly) === -1) return { valid: false, reason: 'This promo code does not exist.' };
          return { valid: true, discountPercent: promo.discountPercent, code: promo.code, roleOnly: promo.roleOnly, label: promo.label || '' };
        }).catch(function () { return { valid: false, reason: 'This promo code does not exist.' }; });
      }
      if (promo.type === 'first-order' && !isFirstOrder) {
        return { valid: false, reason: 'This code is only valid on your first order.' };
      }
      if (promo.type === 'repeat-order' && isFirstOrder) {
        return { valid: false, reason: 'This code is only valid on repeat orders (not your first).' };
      }
      return { valid: true, discountPercent: promo.discountPercent, code: promo.code };
    });
  }

  // Records a code's usage — increments timesUsed and adds to
  // totalDiscounted. Called after an order is successfully placed with
  // this code applied.
  function recordUsage(code, discountAmount) {
    var normalized = normalizeCode(code);
    var ref = ensureDb().collection('promoCodes').doc(normalized);
    return ensureDb().runTransaction(function (transaction) {
      return transaction.get(ref).then(function (doc) {
        if (!doc.exists) return;
        var data = doc.data();
        transaction.update(ref, {
          timesUsed: (data.timesUsed || 0) + 1,
          totalDiscounted: (data.totalDiscounted || 0) + discountAmount
        });
      });
    });
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

  function withDoubleRetry(fn, args, firstMs, secondMs, thirdMs, message) {
    return withTimeout(fn.apply(null, args), firstMs, 'timeout').catch(function (err) {
      if (err.message === 'timeout') {
        return withTimeout(fn.apply(null, args), secondMs, 'timeout').catch(function (err2) {
          if (err2.message === 'timeout') {
            return withTimeout(fn.apply(null, args), thirdMs, message);
          }
          throw err2;
        });
      }
      throw err;
    });
  }

  return {
    getCode: function (code) { return withRetry(getCode, [code], 10000, 15000, 'Checking promo code is taking too long. Please try again.'); },
    getAllCodes: function () { return withRetry(getAllCodes, [], 10000, 15000, 'Loading promo codes is taking too long. Please try again.'); },
    isExpired: isExpired,
    createOrUpdateCode: function (code, pct, type, active, affiliateEmail, endsOn) { return withRetry(createOrUpdateCode, [code, pct, type, active, affiliateEmail, endsOn], 10000, 15000, 'Saving promo code is taking too long. Please try again.'); },
    deleteCode: function (code) { return withRetry(deleteCode, [code], 10000, 15000, 'Deleting promo code is taking too long. Please try again.'); },
    validateCode: function (code, isFirstOrder) { return withDoubleRetry(validateCode, [code, isFirstOrder], 8000, 8000, 12000, 'Validating promo code is taking too long. Please check your connection and try again.'); },
    recordUsage: recordUsage
  };
})();
