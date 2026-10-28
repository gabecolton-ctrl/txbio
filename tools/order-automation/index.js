// Order automation: run by .github/workflows/order-automation.yml every 15 min.
// Secrets (GitHub → Settings → Secrets and variables → Actions):
//   FIREBASE_SERVICE_ACCOUNT   the Firebase key file's full contents (same as the tracker)
//   ORDERS_SMTP_PASSWORD       password for orders@txbioresearch.com (sends customer emails)
//   PAYMENT_IMAP_USER          optional: the Private Email address Venmo/Cash App
//   PAYMENT_IMAP_PASSWORD        notify, if it isn't orders@ (default: orders@ with
//   PAYMENT_IMAP_HOST            the SMTP password; host mail.privateemail.com).
// DRY_RUN=1 logs what would happen without changing or sending anything.
// See README.md in this folder.
const admin = require('firebase-admin');
const { run } = require('./automation');
const { smtpMailer } = require('./mailer');
const { imapMailbox } = require('./mailbox');

const env = (k) => (process.env[k] || '').trim();

(async () => {
  if (!env('FIREBASE_SERVICE_ACCOUNT') || !env('ORDERS_SMTP_PASSWORD')) {
    console.log('Not set up yet: needs FIREBASE_SERVICE_ACCOUNT and ORDERS_SMTP_PASSWORD. See tools/order-automation/README.md. Exiting without changes.');
    return;
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(env('FIREBASE_SERVICE_ACCOUNT'))) });
  const mailer = smtpMailer({ pass: env('ORDERS_SMTP_PASSWORD') });
  // Payment emails are read from orders@ unless another inbox is given.
  const mailbox = imapMailbox({
    host: env('PAYMENT_IMAP_HOST') || 'mail.privateemail.com',
    user: env('PAYMENT_IMAP_USER') || 'orders@txbioresearch.com',
    pass: env('PAYMENT_IMAP_PASSWORD') || env('ORDERS_SMTP_PASSWORD')
  });
  const tally = await run({ db: admin.firestore(), mailbox, mailer, dryRun: env('DRY_RUN') === '1' });
  if (tally.error) process.exitCode = 1;
})().catch((err) => { console.error(err); process.exit(1); });
