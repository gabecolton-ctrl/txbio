// Shipment tracker: run by .github/workflows/track-shipments.yml every 30 min.
// Secrets (GitHub → Settings → Secrets and variables → Actions):
//   FIREBASE_SERVICE_ACCOUNT  the JSON key file's full contents
//   TRACK17_API_KEY (17TRACK)  — or —  UPS_CLIENT_ID, UPS_CLIENT_SECRET (UPS's own API)
//   EMAILJS_PRIVATE_KEY
// See README.md in this folder for setup.
const admin = require('firebase-admin');
const { upsClient } = require('./ups');
const { track17Client } = require('./track17');
const { combinedCarrier } = require('./carriers');
const { emailjsClient } = require('./emailjs');
const { run } = require('./tracker');
const { updateLeaderboard } = require('./leaderboard-job');
const { backfillReferrals } = require('./referral-backfill');
const { processAccountDeletes } = require('./account-deletes');

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
  // UPS numbers use UPS's own API (live) when its keys are set; everything
  // else, and UPS as a fallback, uses 17TRACK. Needs at least one of the two.
  const ups = process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET
    ? upsClient({ clientId: process.env.UPS_CLIENT_ID, clientSecret: process.env.UPS_CLIENT_SECRET }) : null;
  const track17 = process.env.TRACK17_API_KEY ? track17Client({ apiKey: process.env.TRACK17_API_KEY }) : null;
  if (!ups && !track17) need('TRACK17_API_KEY');
  const carrier = combinedCarrier({ ups, track17 });
  console.log('Tracking with ' + (carrier.name || 'UPS'));
  const email = emailjsClient({ privateKey: need('EMAILJS_PRIVATE_KEY') });
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  // One time: save referrals for customers credited before saved referrals existed.
  try { await backfillReferrals({ db: admin.firestore() }); } catch (err) { console.log('Referral backfill failed: ' + err.message); }
  // Accounts the admin deleted on Admin → Customers.
  try { const n = await processAccountDeletes({ db: admin.firestore(), auth: admin.auth() }); if (n) console.log('Deleted ' + n + ' account(s)'); }
  catch (err) { console.log('Account deletes failed: ' + err.message); }
  const tally = await run({ db: admin.firestore(), carrier, email });
  // Monthly affiliate leaderboard (Admin → Promo codes turns it on).
  try { const r = await updateLeaderboard({ db: admin.firestore() }); if (r !== 'off') console.log('Leaderboard: ' + r + ' affiliates with sales this month'); }
  catch (err) { console.log('Leaderboard update failed: ' + err.message); }
  if (tally.error) process.exitCode = 1; // show the run as failed so it's noticed
})().catch((err) => { console.error(err); process.exit(1); });
