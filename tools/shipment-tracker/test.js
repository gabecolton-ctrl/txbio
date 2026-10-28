// Tests for the shipment tracker with an in-memory Firestore and fake UPS/EmailJS.
const assert = require('assert');
const { run } = require('./tracker');
const { summarize } = require('./ups');

// --- tiny Firestore stand-in (the subset tracker.js uses) ---
function fakeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  let n = 0;
  const ref = (p) => ({
    id: p.split('/').pop(), path: p,
    get: async () => snap(p),
    update: async (f) => { if (!data[p]) throw new Error('no doc ' + p); Object.assign(data[p], f); },
    collection: (c) => col(p + '/' + c)
  });
  const snap = (p) => ({ id: p.split('/').pop(), ref: ref(p), exists: !!data[p], data: () => (data[p] ? JSON.parse(JSON.stringify(data[p])) : undefined) });
  const col = (c) => ({
    doc: (id) => ref(c + '/' + (id || 'auto' + n++)),
    where: (field, op, val) => ({
      get: async () => ({
        docs: Object.keys(data).filter((k) => k.startsWith(c + '/') && k.split('/').length === c.split('/').length + 1 && data[k][field] === val).map(snap)
      })
    })
  });
  return {
    data,
    collection: col,
    runTransaction: async (fn) => {
      const writes = [];
      const t = {
        get: async (r) => snap(r.path),
        update: (r, f) => writes.push(() => Object.assign(data[r.path], f)),
        set: (r, d, o) => writes.push(() => { data[r.path] = o && o.merge ? Object.assign(data[r.path] || {}, JSON.parse(JSON.stringify(d))) : JSON.parse(JSON.stringify(d)); })
      };
      const out = await fn(t);
      writes.forEach((w) => w());
      return out;
    }
  };
}

// --- UPS payloads ---
const act = (type, date, time, description) => ({ date, time, status: { type, description } });
const LABEL = { trackResponse: { shipment: [{ package: [{ activity: [act('M', '20261025', '090000', 'Shipper created a label, UPS has not received the package yet.')] }] }] } };
const DROPPED = { trackResponse: { shipment: [{ package: [{
  currentStatus: { description: 'On the Way' },
  activity: [act('I', '20261025', '183000', 'Departed from Facility'), act('I', '20261025', '161500', 'Dropped off at a UPS Access Point'), act('M', '20261025', '090000', 'Label created')]
}] }] } };
const DELIVERED = { trackResponse: { shipment: [{ package: [{
  currentStatus: { description: 'Delivered' },
  activity: [act('D', '20261027', '141000', 'DELIVERED'), act('I', '20261025', '161500', 'Dropped off'), act('M', '20261025', '090000', 'Label created')]
}] }] } };

const T = (s) => '1Z999AA1' + s; // 18-char UPS numbers
const ORDER = (over) => Object.assign({
  userEmail: 'buyer@example.com', orderNumber: '1001', status: 'label-created', trackingNumber: T('0123456784'),
  subtotal: 200, discount: 20, items: [{ name: 'BPC 157', packSize: '1 vial x 5mg', price: 30, qty: 2 }],
  shippingAddress: { addressLine1: '1 Lab Way', city: 'Dallas', state: 'TX', zip: '75201' }
}, over);

async function scenario(seed, upsByNumber, opts = {}) {
  const db = fakeDb(seed);
  const sent = [];
  const calls = [];
  const carrier = { track: async (num) => { calls.push(num); if (upsByNumber[num] instanceof Error) throw upsByNumber[num]; return upsByNumber[num] || null; } };
  const email = { send: async (tpl, params) => { if (opts.emailFails && opts.emailFails-- > 0) throw new Error('EmailJS down'); sent.push({ tpl, params }); } };
  const logs = [];
  const tally = await run({ db, carrier, email, log: (m) => logs.push(m) });
  return { db, sent, calls, tally, logs };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('summarize: label only, first scan, delivered', () => {
  assert.strictEqual(summarize(LABEL).state, 'label');
  const d = summarize(DROPPED);
  assert.strictEqual(d.state, 'moving');
  assert.strictEqual(d.at, '2026-10-25T16:15:00');
  const v = summarize(DELIVERED);
  assert.strictEqual(v.state, 'delivered');
  assert.strictEqual(v.deliveredAt, '2026-10-27T14:10:00');
  assert.strictEqual(summarize(null).state, 'unknown');
});

test('label only: order stays label-created, no email', async () => {
  const { db, sent } = await scenario({ 'orders/a': ORDER() }, { [T('0123456784')]: LABEL });
  assert.strictEqual(db.data['orders/a'].status, 'label-created');
  assert.strictEqual(sent.length, 0);
  assert.ok(db.data['orders/a'].trackingCheckedAt);
});

test('first scan: shipped, emailed once with tracking + order link, affiliate credited', async () => {
  const seed = {
    'orders/a': ORDER({ promoCode: 'BOOP12' }),
    'promoCodes/BOOP12': { affiliateEmail: 'Aff@Example.com', active: true },
    'credits/aff@example.com': { balanceCents: 500, earnedCents: 500, spentCents: 0 }
  };
  const { db, sent } = await scenario(seed, { [T('0123456784')]: DROPPED });
  const o = db.data['orders/a'];
  assert.strictEqual(o.status, 'shipped');
  assert.strictEqual(o.shippedAt, '2026-10-25T16:15:00');
  assert.ok(o.shippedEmailSentAt);
  assert.strictEqual(o.shippedEmailPending, false);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].tpl, 'template_r6zmcve');
  assert.strictEqual(sent[0].params.to_email, 'buyer@example.com');
  assert.strictEqual(sent[0].params.tracking_number, T('0123456784'));
  assert.ok(sent[0].params.tracking_line.includes('orders.html#order-1001'));
  assert.strictEqual(o.affiliateCreditCents, 1800); // 10% of 200 - 20
  assert.strictEqual(db.data['credits/aff@example.com'].balanceCents, 2300);
  const entries = Object.keys(db.data).filter((k) => k.startsWith('credits/aff@example.com/entries/'));
  assert.strictEqual(entries.length, 1);
});

test('running again does not email or credit twice', async () => {
  const seed = { 'orders/a': ORDER({ promoCode: 'BOOP12' }), 'promoCodes/BOOP12': { affiliateEmail: 'aff@example.com' } };
  const first = await scenario(seed, { [T('0123456784')]: DROPPED });
  const db2 = first.db.data;
  const second = await scenario(db2, { [T('0123456784')]: DROPPED });
  assert.strictEqual(second.sent.length, 0);
  assert.strictEqual(second.db.data['credits/aff@example.com'].balanceCents, 1800);
});

test('self-referral is skipped', async () => {
  const seed = { 'orders/a': ORDER({ promoCode: 'ME', userEmail: 'me@example.com' }), 'promoCodes/ME': { affiliateEmail: 'me@example.com' } };
  const { db } = await scenario(seed, { [T('0123456784')]: DROPPED });
  assert.ok(db.data['orders/a'].affiliateSkipped);
  assert.ok(!db.data['credits/me@example.com']);
});

test('email failure: order still shipped, retried next run', async () => {
  const first = await scenario({ 'orders/a': ORDER() }, { [T('0123456784')]: DROPPED }, { emailFails: 1 });
  let o = first.db.data['orders/a'];
  assert.strictEqual(o.status, 'shipped');
  assert.strictEqual(o.shippedEmailPending, true);
  assert.ok(o.shippedEmailError);
  assert.strictEqual(first.sent.length, 0);
  const second = await scenario(first.db.data, { [T('0123456784')]: DROPPED });
  o = second.db.data['orders/a'];
  assert.strictEqual(second.sent.length, 1);
  assert.strictEqual(o.shippedEmailPending, false);
  assert.ok(o.shippedEmailSentAt);
});

test('already delivered at first check: delivered + emailed', async () => {
  const { db, sent } = await scenario({ 'orders/a': ORDER() }, { [T('0123456784')]: DELIVERED });
  assert.strictEqual(db.data['orders/a'].status, 'delivered');
  assert.strictEqual(db.data['orders/a'].deliveredAt, '2026-10-27T14:10:00');
  assert.strictEqual(sent.length, 1);
});

test('shipped orders move to delivered, no email', async () => {
  const recent = new Date(Date.now() - 2 * 864e5).toISOString();
  const { db, sent } = await scenario({ 'orders/a': ORDER({ status: 'shipped', shippedAt: recent, shippedEmailSentAt: recent }) }, { [T('0123456784')]: DELIVERED });
  assert.strictEqual(db.data['orders/a'].status, 'delivered');
  assert.strictEqual(sent.length, 0);
});

test('old shipped orders and non-UPS numbers are not looked up', async () => {
  const old = new Date(Date.now() - 40 * 864e5).toISOString();
  const { calls, db } = await scenario({
    'orders/a': ORDER({ status: 'shipped', shippedAt: old }),
    'orders/b': ORDER({ trackingNumber: '9400111899223197428490' })
  }, {});
  assert.deepStrictEqual(calls, []);
  assert.strictEqual(db.data['orders/b'].status, 'label-created');
  assert.ok(/Not a UPS/.test(db.data['orders/b'].trackingStatusText));
});

test('a UPS error on one order does not stop the others', async () => {
  const { db, tally } = await scenario({
    'orders/a': ORDER({ trackingNumber: T('0000000001') }),
    'orders/b': ORDER({ trackingNumber: T('0000000002'), orderNumber: '1002' })
  }, { [T('0000000001')]: new Error('UPS 500'), [T('0000000002')]: DROPPED });
  assert.strictEqual(tally.error, 1);
  assert.strictEqual(db.data['orders/b'].status, 'shipped');
});

test('order cancelled meanwhile is not shipped', async () => {
  const { db, sent } = await scenario({ 'orders/a': ORDER({ status: 'cancelled' }) }, { [T('0123456784')]: DROPPED });
  assert.strictEqual(db.data['orders/a'].status, 'cancelled');
  assert.strictEqual(sent.length, 0);
});

test('loyalty: Silver buyer earns 3% on an auto-shipped order; Member earns nothing', async () => {
  const prior = (id, sub, created) => ({ ['orders/' + id]: { userId: 'u1', userEmail: 'buyer@example.com', status: 'delivered', subtotal: sub, discount: 0, createdAt: created } });
  const seed = Object.assign({}, prior('p1', 400, '2026-09-01'), prior('p2', 200, '2026-09-15'),
    { 'orders/a': ORDER({ userId: 'u1', createdAt: '2026-10-20', subtotal: 300, discount: 0, promoCode: null }) });
  const { db } = await scenario(seed, { [T('0123456784')]: DROPPED });
  assert.strictEqual(db.data['orders/a'].loyaltyCreditCents, 900);
  assert.strictEqual(db.data['orders/a'].loyaltyTier, 'Silver');
  assert.strictEqual(db.data['credits/buyer@example.com'].balanceCents, 900);
  const r2 = await scenario({ 'orders/a': ORDER({ userId: 'u9', createdAt: '2026-10-20', promoCode: null }) }, { [T('0123456784')]: DROPPED });
  assert.ok(!r2.db.data['orders/a'].loyaltyCreditedAt);
});

// --- supplier shipments (Admin → Incoming) ---
const SHIP = (over) => Object.assign({
  supplier: 'Lab Supply', reference: 'PO-7', status: 'ordered', trackingNumber: T('5550000001'), autoReceive: true,
  createdAt: new Date().toISOString(),
  items: [{ slug: 'bpc-157-10mg', name: 'BPC 157 10mg', kits: 2, qty: 20 }, { slug: 'kpv-5mg', name: 'KPV 5mg', kits: 1, qty: 10 }]
}, over);

test('incoming: label only stays ordered; first scan → in transit', async () => {
  let r = await scenario({ 'incoming/s': SHIP() }, { [T('5550000001')]: LABEL });
  assert.strictEqual(r.db.data['incoming/s'].status, 'ordered');
  r = await scenario({ 'incoming/s': SHIP() }, { [T('5550000001')]: DROPPED });
  assert.strictEqual(r.db.data['incoming/s'].status, 'in-transit');
  assert.ok(r.db.data['incoming/s'].shippedAt);
});

test('incoming: delivered + auto-receive adds kits×10 to stock once', async () => {
  const seed = { 'incoming/s': SHIP({ status: 'in-transit' }), 'inventory/bpc-157-10mg': { qty: 5 } };
  const r = await scenario(seed, { [T('5550000001')]: DELIVERED });
  const d = r.db.data;
  assert.strictEqual(d['incoming/s'].status, 'received');
  assert.strictEqual(d['inventory/bpc-157-10mg'].qty, 25);
  assert.strictEqual(d['inventory/kpv-5mg'].qty, 10); // wasn't tracked: starts at the received count
  assert.ok(/auto/.test(d['incoming/s'].receivedBy));
  const line = d['incoming/s'].receivedItems.find((l) => l.slug === 'kpv-5mg');
  assert.strictEqual(line.before, null);
  // A second receive does nothing.
  const Incoming = require('../../js/incoming.js');
  const again = await Incoming.receive(r.db, 's', { by: 'admin' });
  assert.strictEqual(again.already, true);
  assert.strictEqual(d['inventory/bpc-157-10mg'].qty, 25);
});

test('lots: receiving creates lots; auto-ship assigns first-to-expire-first', async () => {
  const seed = {
    'incoming/s': SHIP({ status: 'in-transit', items: [
      { slug: 'bpc-157-10mg', name: 'BPC 157 10mg', kits: 1, qty: 10, lot: 'LATE', exp: '2027-09-01' },
      { slug: 'bpc-157-10mg', name: 'BPC 157 10mg', kits: 1, qty: 10, lot: 'SOON', exp: '2027-02-01' }] }),
    'orders/a': ORDER({ items: [{ slug: 'bpc-157-10mg', name: 'BPC 157', packSize: '1 vial x 10mg', price: 73, qty: 12 }] })
  };
  // Run 1: shipment delivered → received (two lots). Order still label-created (UPS label only).
  const r1 = await scenario(seed, { [T('5550000001')]: DELIVERED, [T('0123456784')]: LABEL });
  const lots = Object.keys(r1.db.data).filter((k) => k.startsWith('lots/')).map((k) => r1.db.data[k]);
  assert.deepStrictEqual(lots.map((l) => l.lot).sort(), ['LATE', 'SOON']);
  // Run 2 on the same data: the order gets its first scan → shipped, lots assigned.
  const db = r1.db;
  const { run } = require('./tracker');
  await run({ db, carrier: { track: async () => DROPPED }, email: { send: async () => {} }, log: () => {} });
  const alloc = db.data['orders/a'].lotAllocations;
  assert.deepStrictEqual(alloc.map((a) => [a.lot, a.qty]), [['SOON', 10], ['LATE', 2]]);
  const left = Object.keys(db.data).filter((k) => k.startsWith('lots/')).map((k) => db.data[k]).reduce((m, l) => (m[l.lot] = l.qtyRemaining, m), {});
  assert.deepStrictEqual(left, { SOON: 0, LATE: 8 });
});

test('incoming: delivered without auto-receive waits for the admin', async () => {
  const r = await scenario({ 'incoming/s': SHIP({ autoReceive: false }), 'inventory/bpc-157-10mg': { qty: 5 } }, { [T('5550000001')]: DELIVERED });
  assert.strictEqual(r.db.data['incoming/s'].status, 'delivered');
  assert.strictEqual(r.db.data['inventory/bpc-157-10mg'].qty, 5);
});

test('incoming: received/cancelled/no-tracking/non-UPS are not looked up', async () => {
  const r = await scenario({
    'incoming/a': SHIP({ status: 'received' }), 'incoming/b': SHIP({ status: 'cancelled' }),
    'incoming/c': SHIP({ trackingNumber: '' }), 'incoming/d': SHIP({ trackingNumber: '9400111899223344556677' })
  }, {});
  assert.deepStrictEqual(r.calls, []);
  assert.ok(/Not a UPS/.test(r.db.data['incoming/d'].trackingStatusText));
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('PASS ' + name); }
    catch (err) { failed++; console.log('FAIL ' + name + '\n  ' + (err.stack || err).split('\n').slice(0, 3).join('\n  ')); }
  }
  console.log(failed ? failed + ' failed' : 'All ' + tests.length + ' tests passed');
  process.exit(failed ? 1 : 0);
})();
