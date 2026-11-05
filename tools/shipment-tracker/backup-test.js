// Tests for backup-core.js with a fake Firestore (no network).
const assert = require('assert');
const { dump, encrypt, decrypt } = require('./backup-core');

function fakeDb(data) {
  const docRef = (p) => ({
    id: p.split('/').pop(), path: p,
    listCollections: async () => subNames(p).map((n) => col(p + '/' + n))
  });
  const subNames = (p) => [...new Set(Object.keys(data).filter((k) => k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 2).map((k) => k.split('/')[p.split('/').length]))];
  const col = (p) => ({
    id: p.split('/').pop(),
    get: async () => ({ docs: Object.keys(data).filter((k) => k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1).map((k) => Object.assign(docRef(k), { ref: docRef(k), data: () => data[k] })) }),
    listDocuments: async () => [...new Set(Object.keys(data).filter((k) => k.startsWith(p + '/') && k.split('/').length > p.split('/').length + 1).map((k) => k.split('/').slice(0, p.split('/').length + 1).join('/')))].map(docRef)
  });
  return { listCollections: async () => [...new Set(Object.keys(data).map((k) => k.split('/')[0]))].map(col) };
}

(async () => {
  const db = fakeDb({
    'orders/a': { total: 10, createdAt: { seconds: 1, toDate: () => new Date('2026-11-05T00:00:00Z') } },
    'credits/x@y.com/entries/1': { amountCents: 500 },
    'users/u': { name: 'U' }, 'users/u/private/p': { note: 'n' }
  });
  const d = await dump(db);
  assert.deepStrictEqual(d.counts, { collections: 3, docs: 4 });
  assert.strictEqual(d.collections.orders.a.data.createdAt.__time, '2026-11-05T00:00:00.000Z');
  assert.strictEqual(d.collections.credits['x@y.com'].sub.entries['1'].data.amountCents, 500);
  assert.strictEqual(d.collections.users.u.sub.private.p.data.note, 'n');
  const bin = encrypt(d, 'correct horse battery');
  assert.ok(!bin.toString('latin1').includes('x@y.com'));
  assert.deepStrictEqual(decrypt(bin, 'correct horse battery'), JSON.parse(JSON.stringify(d)));
  assert.throws(() => decrypt(bin, 'wrong passphrase!!'), /Wrong passphrase/);
  console.log('Backup tests passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
