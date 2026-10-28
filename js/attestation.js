// attestation.js — the buyer certifications, word for word, and the Terms
// version they refer to. Signup saves one on the account (users/{uid}.
// signupAttestation) and every order saves one (orders/{id}.attestation),
// so each buyer's agreement is on record. Shared with the server checkout
// (copied to functions/ by tools/build-catalog.js).
//
// When the Terms change: update terms.html, bump TERMS_VERSION (the date in
// its "Last updated" line), and edit the wording below if needed.
var Attestation = (function () {
  var TERMS_VERSION = '2026-10-28';
  var SIGNUP_TEXT = 'I certify that I am 21 years of age or older and am registering on behalf of a laboratory, research institution, or qualified researcher, for research use only, and I agree to the Terms & Conditions and Privacy Policy.';
  var ORDER_TEXT = 'I certify that I am 21 years of age or older, that this order is for laboratory research use only and not for human or animal consumption, and I agree to the Terms & Conditions.';

  // The record saved with an account or order.
  function record(kind, at) {
    return {
      kind: kind,
      text: kind === 'signup' ? SIGNUP_TEXT : ORDER_TEXT,
      termsVersion: TERMS_VERSION,
      agreedAt: at || new Date().toISOString()
    };
  }

  return { TERMS_VERSION: TERMS_VERSION, SIGNUP_TEXT: SIGNUP_TEXT, ORDER_TEXT: ORDER_TEXT, record: record };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Attestation;
