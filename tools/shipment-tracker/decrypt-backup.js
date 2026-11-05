// Opens a nightly backup file. On your computer (Node 20+), in this folder:
//   node decrypt-backup.js txbio-backup-2026-11-05.bin
// It asks for the passphrase and writes txbio-backup-2026-11-05.json next to it.
// That JSON has every collection and document as of that night. Keep it private
// (it has customer details) and delete it when you're done.
const fs = require('fs');
const readline = require('readline');
const { decrypt } = require('./backup-core');

const file = process.argv[2];
if (!file) { console.log('Usage: node decrypt-backup.js <backup .bin file>'); process.exit(1); }
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Backup passphrase: ', (pass) => {
  rl.close();
  try {
    const data = decrypt(fs.readFileSync(file), pass.trim());
    const out = file.replace(/\.bin$/, '') + '.json';
    fs.writeFileSync(out, JSON.stringify(data, null, 2));
    console.log('Opened: ' + data.counts.docs + ' documents from ' + data.exportedAt + ' → ' + out);
  } catch (e) { console.log(e.message); process.exit(1); }
});
