// Cloud Functions for TXBioResearch.
//
// placeOrder — server-side checkout. The browser sends only choices (shipping
// option, payment method, promo code, whether to use store credit, address,
// notes). Everything with money in it is worked out here from the catalog
// (functions/catalog.json, built from the site's own product files) and the
// database, then written in one transaction:
//   stock counts, store credit spend, promo code usage, the order, cart clear.
// Buyers can't change prices, totals, stock, or credit from their browser.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const catalog = require('./catalog.json');
const { placeOrderHandler } = require('./checkout');

admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// Keep costs bounded: at most 10 copies of the function run at once.
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

exports.placeOrder = onCall(async (request) => {
  const auth = request.auth;
  try {
    return await placeOrderHandler({
      db,
      FieldValue: admin.firestore.FieldValue,
      uid: auth && auth.uid,
      email: auth && auth.token && auth.token.email,
      data: request.data,
      catalog
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('placeOrder failed', e);
    throw new HttpsError('internal', 'Your order could not be placed. Please try again.');
  }
});

