// Cart reminders: run by .github/workflows/cart-reminders.yml every hour.
// Uses the same GitHub secrets as the shipment tracker:
//   FIREBASE_SERVICE_ACCOUNT, EMAILJS_PRIVATE_KEY
// and the "Cart reminder" EmailJS template (ID in js/order-emails.js).
const admin = require('firebase-admin');
const { emailjsClient } = require('./emailjs');
const { run } = require('./cart-reminders-core');

function need(name) {
  const v = process.env[name];
  if (!v) { console.log('Not set up yet: missing ' + name + '. Exiting without changes.'); process.exit(0); }
  return v;
}

(async () => {
  const sa = JSON.parse(need('FIREBASE_SERVICE_ACCOUNT'));
  const email = emailjsClient({ privateKey: need('EMAILJS_PRIVATE_KEY') });
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const tally = await run({ db: admin.firestore(), email });
  if (tally.failed) process.exitCode = 1;
})().catch((err) => { console.error(err); process.exit(1); });
