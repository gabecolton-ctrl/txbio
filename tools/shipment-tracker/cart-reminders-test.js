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
      doc: (id) => ({ update: async (f) => { Object.assign(data[c + '/' + id], f); } })
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
    assert.ok(plan({ items: [line], updatedAt: ago(25) }, u, NOW).send);
    assert.strictEqual(plan({ items: [line], updatedAt: ago(5) }, u, NOW).skip, 'recent');
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
      'carts/u2': { items: [line], updatedAt: ago(2) }, 'users/u2': { email: 'b@x.com' }
    });
    const sent = [];
    const email = { send: async (t, p) => { sent.push([t, p]); } };
    const r = await run({ db, email, now: NOW, log: () => {} });
    assert.strictEqual(r.sent, 1);
    assert.deepStrictEqual(sent[0], ['template_cart', { to_email: 'jo@example.com', to_name: 'Jo', items: '2 items (12 units)', cart_total: '$346.00',
      cart_url: 'https://txbioresearch.com/cart.html', unsubscribe_url: 'https://txbioresearch.com/account.html#email-prefs' }]);
    assert.ok(!JSON.stringify(sent).includes('BPC'));
    assert.strictEqual(db.data['users/u1'].cartReminderAt, new Date(NOW).toISOString());
    const again = await run({ db, email, now: NOW + 36e5, log: () => {} });
    assert.strictEqual(again.sent, 0);
  });

  await test('run: no template ID yet sends nothing', async () => {
    OrderEmails.CONFIG.cartReminderTemplateId = '';
    const r = await run({ db: fakeDb({ 'carts/u1': { items: [line], updatedAt: ago(30) }, 'users/u1': { email: 'a@x.com' } }), email: { send: async () => { throw new Error('should not send'); } }, now: NOW, log: () => {} });
    assert.strictEqual(r.sent, 0);
  });

  console.log(failed ? failed + ' failed' : 'All cart reminder tests passed');
  process.exit(failed ? 1 : 0);
})();
