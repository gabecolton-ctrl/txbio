// Nightly backup: run by .github/workflows/nightly-backup.yml.
// Secrets: FIREBASE_SERVICE_ACCOUNT, BACKUP_PASSPHRASE (12+ characters).
// Writes backup/txbio-backup-YYYY-MM-DD.bin (encrypted); the workflow keeps it
// as an artifact for 90 days. Never writes an unencrypted copy.
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { dump, encrypt, decrypt } = require('./backup-core');

(async () => {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT, pass = process.env.BACKUP_PASSPHRASE;
  if (!sa) { console.log('Not set up yet: missing FIREBASE_SERVICE_ACCOUNT.'); process.exit(1); }
  if (!pass || pass.length < 12) { console.log('Not set up yet: add a BACKUP_PASSPHRASE secret (12+ characters). Nothing was backed up.'); process.exit(1); }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
  const data = await dump(admin.firestore());
  const bin = encrypt(data, pass);
  decrypt(bin, pass); // prove it opens before keeping it
  const day = data.exportedAt.slice(0, 10);
  fs.mkdirSync(path.join(__dirname, 'backup'), { recursive: true });
  const file = path.join(__dirname, 'backup', 'txbio-backup-' + day + '.bin');
  fs.writeFileSync(file, bin);
  console.log('Backed up ' + data.counts.docs + ' documents in ' + data.counts.collections + ' collections → ' + path.basename(file) + ' (' + Math.round(bin.length / 1024) + ' KB, encrypted)');
})().catch((err) => { console.error('Backup failed: ' + err.message); process.exit(1); });
