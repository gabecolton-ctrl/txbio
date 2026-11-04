// Shipment tracker: run by .github/workflows/track-shipments.yml every 30 min.
// Secrets (GitHub → Settings → Secrets and variables → Actions):
//   FIREBASE_SERVICE_ACCOUNT  the JSON key file's full contents
//   TRACK17_API_KEY (17TRACK)  — or —  UPS_CLIENT_ID, UPS_CLIENT_SECRET (UPS's own API)
//   EMAILJS_PRIVATE_KEY
// See README.md in this folder for setup.
const admin = require('firebase-admin');
const { upsClient } = require('./ups');
const { track17Client } = require('./track17');
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
  // 17TRACK when its key is set (any carrier); otherwise UPS's own API.
  const carrier = process.env.TRACK17_API_KEY
    ? track17Client({ apiKey: process.env.TRACK17_API_KEY })
    : upsClient({ clientId: need('UPS_CLIENT_ID'), clientSecret: need('UPS_CLIENT_SECRET') });
  console.log('Tracking with ' + (carrier.name || 'UPS'));
  const email = emailjsClient({ privateKey: need('EMAILJS_PRIVATE_KEY') });
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const tally = await run({ db: admin.firestore(), carrier, email });
  if (tally.error) process.exitCode = 1; // show the run as failed so it's noticed
})().catch((err) => { console.error(err); process.exit(1); });
