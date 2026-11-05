// backup-core.js — nightly backup of the whole Firestore database.
// Every collection and sub-collection is read into one JSON document, gzipped,
// and encrypted with AES-256-GCM using a key made from BACKUP_PASSPHRASE
// (scrypt). Without the passphrase the file is unreadable, so it's safe to keep
// as a GitHub Actions artifact. decrypt-backup.js turns it back into JSON.
const crypto = require('crypto');
const zlib = require('zlib');

const MAGIC = 'TXBIOBK1';

// Firestore values → plain JSON (timestamps as { __time: ISO }).
function plain(v) {
  if (v === null || v === undefined) return v;
  if (typeof v.toDate === 'function' && typeof v.seconds === 'number') return { __time: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') {
    if (v.constructor && v.constructor.name === 'DocumentReference') return { __ref: v.path };
    const out = {};
    Object.keys(v).forEach((k) => { out[k] = plain(v[k]); });
    return out;
  }
  return v;
}

async function dumpCollection(col, counts) {
  const out = {};
  const snap = await col.get();
  for (const doc of snap.docs) {
    const entry = { data: plain(doc.data()) };
    const subs = doc.ref.listCollections ? await doc.ref.listCollections() : [];
    if (subs.length) {
      entry.sub = {};
      for (const sub of subs) entry.sub[sub.id] = await dumpCollection(sub, counts);
    }
    out[doc.id] = entry;
    counts.docs++;
  }
  return out;
}

// Also finds sub-collections under documents that don't exist themselves
// (e.g. credits/{email}/entries with no credits/{email} doc).
async function dumpCollectionDeep(col, counts) {
  const out = await dumpCollection(col, counts);
  if (typeof col.listDocuments === 'function') {
    const refs = await col.listDocuments();
    for (const ref of refs) {
      if (out[ref.id]) continue;
      const subs = await ref.listCollections();
      if (!subs.length) continue;
      const entry = { data: null, sub: {} };
      for (const sub of subs) entry.sub[sub.id] = await dumpCollection(sub, counts);
      out[ref.id] = entry;
    }
  }
  return out;
}

async function dump(db) {
  const counts = { collections: 0, docs: 0 };
  const collections = {};
  const cols = await db.listCollections();
  for (const col of cols) {
    collections[col.id] = await dumpCollectionDeep(col, counts);
    counts.collections++;
  }
  return { format: 'txbio-firestore-backup', version: 1, exportedAt: new Date().toISOString(), counts, collections };
}

function encrypt(obj, passphrase) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify(obj)))), cipher.final()]);
  return Buffer.concat([Buffer.from(MAGIC), salt, iv, cipher.getAuthTag(), body]);
}

function decrypt(buf, passphrase) {
  if (buf.slice(0, 8).toString() !== MAGIC) throw new Error('Not a TXBio backup file.');
  const salt = buf.slice(8, 24), iv = buf.slice(24, 36), tag = buf.slice(36, 52), body = buf.slice(52);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let plainBuf;
  try { plainBuf = Buffer.concat([decipher.update(body), decipher.final()]); }
  catch (e) { throw new Error('Wrong passphrase, or the file is damaged.'); }
  return JSON.parse(zlib.gunzipSync(plainBuf).toString());
}

module.exports = { dump, encrypt, decrypt, plain };
