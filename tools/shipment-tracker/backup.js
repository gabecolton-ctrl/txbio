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
  const line = 'Backed up ' + data.counts.docs + ' documents in ' + data.counts.collections + ' collections → ' + path.basename(file) + ' (' + Math.round(bin.length / 1024) + ' KB, encrypted)';
  console.log(line);
  // Shown on the run's summary page.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = Object.keys(data.collections).sort().map((c) => {
      let n = 0;
      const walk = (col) => Object.values(col).forEach((d) => { if (d.data) n++; Object.values(d.sub || {}).forEach(walk); });
      walk(data.collections[c]);
      return '| ' + c + ' | ' + n + ' |';
    });
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '## ✅ Backup complete\n\n' + line + '\n\nSaved ' + data.exportedAt.replace('T', ' ').slice(0, 16) + ' UTC. Download it under **Artifacts** below (kept 90 days).\n\n' +
      '| Collection | Documents |\n|---|---|\n' + rows.join('\n') + '\n');
  }
})().catch((err) => { console.error('Backup failed: ' + err.message); process.exit(1); });
