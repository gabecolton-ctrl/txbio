// Tests for cart reminders with an in-memory Firestore and a fake EmailJS.
const assert = require('assert');
const path = require('path');
const OrderEmails = require(path.join(__dirname, '../../js/order-emails.js'));
const { run, plan } = require('./cart-reminders-core');

function fakeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  const snap = (p) => ({ id: p.split('/').pop(), data: () => JSON.parse(JSON.stringify(data[p])) });
  return {
    data,
    collection: (c) => ({
      get: async () => ({ docs: Object.keys(data).filter((k) => k.startsWith(c + '/')).map(snap) }),
      doc: (id) => ({ update: async (f) => { Object.assign(data[c + '/' + id], f); }, set: async (f) => { data[c + '/' + id] = Object.assign(data[c + '/' + id] || {}, f); } })
    })
  };
}
const NOW = Date.parse('2026-11-10T18:00:00Z');
const ago = (h) => new Date(NOW - h * 36e5).toISOString();
const line = { slug: 'bpc-157-10mg', name: 'BPC 157', price: 73, qty: 2 };

(async () => {
  let failed = 0;
  const test = async (name, fn) => { try { await fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message); } };

  await test('plan: idle 24h+ gets a reminder; recent, old, empty, opted out, reminded do not', async () => {
    const u = { email: 'a@x.com' };
    assert.ok(plan({ items: [line], updatedAt: ago(4) }, u, NOW).send);
    assert.strictEqual(plan({ items: [line], updatedAt: ago(2) }, u, NOW).skip, 'recent');
    assert.strictEqual(plan({ items: [line], updatedAt: ago(24 * 8) }, u, NOW).skip, 'old');
    assert.strictEqual(plan({ items: [], updatedAt: ago(30) }, u, NOW).skip, 'empty');
    assert.strictEqual(plan({ items: [line], updatedAt: ago(30) }, { email: 'a@x.com', cartReminders: false }, NOW).skip, 'opted out');
    assert.strictEqual(plan({ items: [line], updatedAt: ago(30) }, { email: 'a@x.com', cartReminderAt: ago(26) }, NOW).skip, 'reminded this week');
  });

  await test('run: sends once with count (no product names), records the time, then skips', async () => {
    OrderEmails.CONFIG.cartReminderTemplateId = 'template_cart';
    const db = fakeDb({
      'carts/u1': { items: [line, { slug: 'bac-water-10ml-case', name: 'Bac water', price: 200, qty: 1, caseOf: 10 }], updatedAt: ago(30) },
      'users/u1': { email: 'Jo@Example.com', name: 'Jo Smith' },
      'carts/u2': { items: [line], updatedAt: ago(1) }, 'users/u2': { email: 'b@x.com' }
    });
    const sent = [];
    const email = { send: async (t, p) => { sent.push([t, p]); } };
    const r = await run({ db, email, now: NOW, log: () => {} });
    assert.strictEqual(r.sent, 1);
    assert.deepStrictEqual(sent[0], ['template_cart', { to_email: 'jo@example.com', to_name: 'Jo', items: '2 items (12 units)', cart_total: '$346.00',
      cart_url: 'https://txbioresearch.com/cart.html', unsubscribe_url: 'https://txbioresearch.com/account.html#email-prefs',
      store_name: 'TXBioResearch', store_full_name: 'Texas Advanced BioResearch', store_url: 'https://txbioresearch.com', store_domain: 'txbioresearch.com', reply_to: 'orders@txbioresearch.com' }]);
    assert.ok(!JSON.stringify(sent).includes('BPC'));
    assert.strictEqual(db.data['users/u1'].cartReminderAt, new Date(NOW).toISOString());
    const again = await run({ db, email, now: NOW + 36e5, log: () => {} });
    assert.strictEqual(again.sent, 0);
  });

  await test('run: TexasBench carts get a TexasBench reminder, tracked separately', async () => {
    const db = fakeDb({
      'budgetCarts/u1': { items: [line], updatedAt: ago(30) }, 'carts/u1': { items: [line], updatedAt: ago(30) },
      'users/u1': { email: 'jo@x.com', name: 'Jo' }
    });
    const sent = [];
    const email = { send: async (t, p, cfg) => { sent.push([t, p, cfg && cfg.serviceId]); } };
    const r = await run({ db, email, now: NOW, log: () => {} });
    assert.strictEqual(r.sent, 2);
    const tb = sent.find((x) => x[1].store_name === 'TexasBench');
    assert.ok(tb, 'TexasBench reminder sent');
    assert.strictEqual(tb[1].cart_url, 'https://texasbench.com/cart.html');
    assert.strictEqual(tb[1].reply_to, 'orders@texasbench.com');
    assert.strictEqual(tb[2], OrderEmails.BUDGET_CONFIG.serviceId);
    assert.ok(db.data['users/u1'].budgetCartReminderAt && db.data['users/u1'].cartReminderAt);
  });

  await test('run: account with no saved email uses the sign-in email and saves it', async () => {
    const db = fakeDb({ 'carts/u1': { items: [line], updatedAt: ago(5) }, 'users/u1': { lastSeenAt: ago(1) }, 'carts/u2': { items: [line], updatedAt: ago(5) } });
    const auth = { getUser: async (uid) => { if (uid === 'u1') return { email: 'Kim@X.com' }; throw new Error('user-not-found'); } };
    const sent = [];
    const r = await run({ db, email: { send: async (t, p) => { sent.push(p.to_email); } }, auth, now: NOW, log: () => {} });
    assert.deepStrictEqual(sent, ['kim@x.com']);
    assert.strictEqual(db.data['users/u1'].email, 'kim@x.com');
    assert.strictEqual(r.skipped['no email'], 1);
  });

  await test('run: no template ID yet sends nothing', async () => {
    OrderEmails.CONFIG.cartReminderTemplateId = '';
    const r = await run({ db: fakeDb({ 'carts/u1': { items: [line], updatedAt: ago(30) }, 'users/u1': { email: 'a@x.com' } }), email: { send: async () => { throw new Error('should not send'); } }, now: NOW, log: () => {} });
    assert.strictEqual(r.sent, 0);
  });

  console.log(failed ? failed + ' failed' : 'All cart reminder tests passed');
  process.exit(failed ? 1 : 0);
})();
