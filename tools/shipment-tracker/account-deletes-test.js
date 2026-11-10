// node account-deletes-test.js
const assert = require('assert');
const { processAccountDeletes } = require('./account-deletes');

function fakeDb(data) {
  const ref = (p) => ({
    id: p.split('/').pop(), path: p,
    get: async () => ({ exists: p in data, id: p.split('/').pop(), data: () => data[p] }),
    set: async (v) => { data[p] = v; }, delete: async () => { delete data[p]; },
    collection: (c) => col(p + '/' + c)
  });
  const col = (c, filters = []) => ({
    doc: (id) => ref(c + '/' + id),
    where: (f, op, v) => col(c, filters.concat([[f, v]])),
    get: async () => {
      const docs = Object.keys(data).filter((k) => k.startsWith(c + '/') && k.split('/').length === c.split('/').length + 1)
        .filter((k) => filters.every(([f, v]) => data[k][f] === v)).map((k) => ({ id: k.split('/').pop(), ref: ref(k), data: () => data[k] }));
      return { docs, size: docs.length, empty: !docs.length };
    }
  });
  return { collection: (c) => col(c) };
}

(async () => {
  const data = {
    'accountDeletions/t1': { email: 'test@x.com', status: 'queued' },
    'accountDeletions/r1': { email: 'real@x.com', status: 'queued' },
    'users/t1': { email: 'test@x.com' }, 'carts/t1': { items: [] }, 'budgetCarts/t1': { items: [] },
    'customerNotes/test@x.com': { note: 'x' }, 'credits/test@x.com': { balanceCents: 0 }, 'credits/test@x.com/entries/e1': { type: 'gift' },
    'orders/o1': { userId: 't1', status: 'cancelled', orderNumber: 'TB-1' },
    'users/r1': { email: 'real@x.com' }, 'orders/o2': { userId: 'r1', status: 'shipped', orderNumber: 'TXB-2' },
    'users/keep': { email: 'keep@x.com' }
  };
  const deleted = [];
  const auth = { deleteUser: async (uid) => { deleted.push(uid); } };
  const n = await processAccountDeletes({ db: fakeDb(data), auth, log: () => {}, now: new Date('2026-11-10T20:00:00Z') });
  assert.strictEqual(n, 1);
  assert.deepStrictEqual(deleted, ['t1']);
  for (const k of ['users/t1', 'carts/t1', 'budgetCarts/t1', 'customerNotes/test@x.com', 'credits/test@x.com', 'credits/test@x.com/entries/e1', 'orders/o1']) assert.ok(!(k in data), k + ' should be gone');
  assert.strictEqual(data['accountDeletions/t1'].status, 'done');
  // Real customer with a shipped order: nothing touched.
  assert.strictEqual(data['accountDeletions/r1'].status, 'blocked');
  assert.ok(data['users/r1'] && data['orders/o2']);
  assert.ok(data['users/keep']);
  // Already-gone sign-in is fine.
  data['accountDeletions/g1'] = { email: '', status: 'queued' };
  const n2 = await processAccountDeletes({ db: fakeDb(data), auth: { deleteUser: async () => { const e = new Error('no user'); e.code = 'auth/user-not-found'; throw e; } }, log: () => {} });
  assert.strictEqual(n2, 1);
  console.log('Account delete tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
