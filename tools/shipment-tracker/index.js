// Shipment tracker: run by .github/workflows/track-shipments.yml every 30 min.
// Secrets (GitHub → Settings → Secrets and variables → Actions):
//   FIREBASE_SERVICE_ACCOUNT  the JSON key file's full contents
//   UPS_CLIENT_ID, UPS_CLIENT_SECRET
//   EMAILJS_PRIVATE_KEY
// See README.md in this folder for setup.
const admin = require('firebase-admin');
const { upsClient } = require('./ups');
const { emailjsClient } = require('./emailjs');
const { run } = require('./tracker');

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.log('Not set up yet: missing ' + name + '. See tools/shipment-tracker/README.md. Exiting without changes.');
    process.exit(0);
  }
  return v;
}

(async () => {
  const sa = JSON.parse(need('FIREBASE_SERVICE_ACCOUNT'));
  const carrier = upsClient({ clientId: need('UPS_CLIENT_ID'), clientSecret: need('UPS_CLIENT_SECRET') });
  const email = emailjsClient({ privateKey: need('EMAILJS_PRIVATE_KEY') });
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const tally = await run({ db: admin.firestore(), carrier, email });
  if (tally.error) process.exitCode = 1; // show the run as failed so it's noticed
})().catch((err) => { console.error(err); process.exit(1); });
