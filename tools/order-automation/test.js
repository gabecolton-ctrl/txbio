// Tests: real raw emails parsed by mailparser, an in-memory Firestore, and a
// fake mailer. Run: node test.js
const assert = require('assert');
const { simpleParser } = require('mailparser');
const { run } = require('./automation');
const { verify, parsePayment, verifySignature } = require('./parse');

function fakeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  let n = 0;
  const ref = (p) => ({
    id: p.split('/').pop(), path: p,
    get: async () => snap(p),
    set: async (d) => { data[p] = JSON.parse(JSON.stringify(d)); },
    update: async (f) => { if (!data[p]) throw new Error('no doc ' + p); Object.assign(data[p], f); },
    collection: (c) => col(p + '/' + c)
  });
  const snap = (p) => ({ id: p.split('/').pop(), ref: ref(p), exists: !!data[p], data: () => (data[p] ? JSON.parse(JSON.stringify(data[p])) : undefined) });
  const col = (c) => ({
    doc: (id) => ref(c + '/' + (id || 'auto' + n++)),
    where: (field, op, val) => ({ get: async () => ({ docs: Object.keys(data).filter((k) => k.startsWith(c + '/') && k.split('/').length === c.split('/').length + 1 && data[k][field] === val).map(snap) }) })
  });
  return {
    data, collection: col,
    runTransaction: async (fn) => {
      const writes = [];
      const t = {
        get: async (r) => snap(r.path),
        update: (r, f) => writes.push(() => Object.assign(data[r.path], f)),
        set: (r, d) => writes.push(() => { data[r.path] = JSON.parse(JSON.stringify(d)); })
      };
      const out = await fn(t);
      writes.forEach((w) => w());
      return out;
    }
  };
}

const PASS_VENMO = 'Authentication-Results: mail.privateemail.com; dkim=pass (2048-bit key) header.d=venmo.com header.i=@venmo.com; spf=pass smtp.mailfrom=venmo.com; dmarc=pass (p=reject) header.from=venmo.com';
const PASS_CASH = 'Authentication-Results: mx.google.com; dkim=pass header.i=@square.com header.s=s1; spf=pass smtp.mailfrom=cash@square.com; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=square.com';
const FAIL_VENMO = 'Authentication-Results: mail.privateemail.com; dkim=none; spf=fail smtp.mailfrom=venmo.com; dmarc=fail (p=reject) header.from=venmo.com';

const raw = ({ auth, from, subject, body, id }) => [
  ...(auth ? [auth] : []), 'From: ' + from, 'To: orders@txbioresearch.com', 'Subject: ' + subject,
  'Message-ID: <' + (id || Math.random().toString(36).slice(2)) + '@mail>', 'Date: Tue, 27 Oct 2026 15:00:00 -0500',
  'Content-Type: text/plain; charset=utf-8', '', body.replace(/\n/g, '\r\n')
].join('\r\n');
const mail = async (o) => simpleParser(raw(o));
const venmo = (o = {}) => mail(Object.assign({ auth: PASS_VENMO, from: 'Venmo <venmo@venmo.com>', subject: 'Jo Smith paid you $94.69', body: 'Jo Smith paid you $94.69\n\nOrder TXB-ABC123\n\nTransfer to your bank', id: 'v1' }, o));
const cash = (o = {}) => mail(Object.assign({ auth: PASS_CASH, from: 'Cash App <cash@square.com>', subject: 'You received $40.00 from Al Lee', body: 'You received $40.00\nFor Order TXB-XYZ789\nPayment from $AlLee', id: 'c1' }, o));

const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
const ORDER = (over) => Object.assign({
  orderNumber: 'TXB-ABC123', userEmail: 'jo@example.com', status: 'pending', paymentMethod: 'venmo', paymentHandle: 'TXBio-Research',
  total: 94.69, createdAt: ago(0.1), shippingAddress: { name: 'Jo Smith' },
  items: [{ slug: 'bpc-157-10mg', name: 'BPC 157', packSize: '1 vial x 10mg', qty: 2, fulfilled: 2 }, { slug: 'bac-water-10ml-case', unitSlug: 'bac-water-10ml', caseOf: 10, qty: 1, fulfilled: 10 }]
}, over);

async function scenario(seed, mails, opts = {}) {
  const db = fakeDb(seed);
  const sent = [];
  const mailer = { send: async (to, m) => { if (opts.mailFails) throw new Error('SMTP down'); sent.push({ to, subject: m.subject, text: m.text }); } };
  const logs = [];
  const sigCheck = opts.sigCheck || (async () => ({ ok: false, why: 'no signature (test)' }));
  const tally = await run({ db, mailbox: mails ? { recent: async () => mails } : null, mailer, log: (m) => logs.push(m), dryRun: !!opts.dryRun, sigCheck });
  return { db, sent, tally, logs };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('parse: Venmo and Cash App payment emails', async () => {
  const v = parsePayment(await venmo());
  assert.deepStrictEqual([v.app, v.amount, v.payer, v.orderNumber], ['venmo', 94.69, 'Jo Smith', 'TXB-ABC123']);
  const c = parsePayment(await cash());
  assert.deepStrictEqual([c.app, c.amount, c.payer, c.orderNumber], ['cashapp', 40, 'Al Lee', 'TXB-XYZ789']);
  assert.strictEqual(parsePayment(await venmo({ subject: 'You paid Bob $20.00' })), null);
  assert.strictEqual(parsePayment(await venmo({ subject: 'Bob requested $20.00' , body: 'Bob requests $20.00'})), null);
  assert.strictEqual(parsePayment(await mail({ auth: PASS_VENMO, from: 'Bob <bob@gmail.com>', subject: 'Jo paid you $94.69', body: 'Order TXB-ABC123' })), null);
});

test('verify: spoofed sender / failed DMARC / missing header are not trusted', async () => {
  const good = await venmo();
  assert.ok(verify('venmo', 'venmo@venmo.com', good.headerLines).ok);
  const bad = await venmo({ auth: FAIL_VENMO });
  assert.ok(!verify('venmo', 'venmo@venmo.com', bad.headerLines).ok);
  const none = await venmo({ auth: '' });
  assert.ok(!verify('venmo', 'venmo@venmo.com', none.headerLines).ok);
  // A forged pass header placed below the server's real one is ignored.
  const forged = await simpleParser(FAIL_VENMO + '\r\n' + raw({ auth: PASS_VENMO, from: 'Venmo <venmo@venmo.com>', subject: 'Jo paid you $94.69', body: 'Order TXB-ABC123' }));
  assert.ok(!verify('venmo', 'venmo@venmo.com', forged.headerLines).ok);
});

test('matching Venmo payment confirms the order and emails the customer once', async () => {
  const m = await venmo();
  const { db, sent, tally } = await scenario({ 'orders/o1': ORDER() }, [m]);
  assert.strictEqual(db.data['orders/o1'].status, 'confirmed');
  assert.ok(/auto \(Venmo email\)/.test(db.data['orders/o1'].paymentConfirmedBy));
  assert.strictEqual(tally['payment-confirmed'], 1);
  assert.strictEqual(sent.length, 1);
  assert.ok(/Payment received for order TXB-ABC123/.test(sent[0].subject));
  // Next run sees the same email: nothing happens.
  const again = await run({ db, mailbox: { recent: async () => [m] }, mailer: { send: async () => sent.push(1) }, log: () => {}, sigCheck: async () => ({ ok: false, why: 'x' }) });
  assert.strictEqual(again.seen, 1);
  assert.strictEqual(sent.length, 1);
});

test('Cash App payment confirms a Cash App order', async () => {
  const { db } = await scenario({ 'orders/o2': ORDER({ orderNumber: 'TXB-XYZ789', paymentMethod: 'cashapp', paymentHandle: 'TXBio', total: 40 }) }, [await cash()]);
  assert.strictEqual(db.data['orders/o2'].status, 'confirmed');
});

test('not confirmed: wrong amount, wrong app, no order #, spoofed, already confirmed', async () => {
  const cases = [
    [{ 'orders/o1': ORDER({ total: 120 }) }, await venmo(), 'unmatched', /order total is \$120/],
    [{ 'orders/o1': ORDER({ paymentMethod: 'cashapp' }) }, await venmo(), 'unmatched', /placed for cashapp/],
    [{ 'orders/o1': ORDER() }, await venmo({ body: 'Jo paid you $94.69 for stuff', id: 'v2' }), 'unmatched', /no order number/],
    [{ 'orders/o1': ORDER() }, await venmo({ auth: FAIL_VENMO, id: 'v3' }), 'untrusted', /DKIM\/DMARC/],
    [{ 'orders/o1': ORDER({ status: 'confirmed' }) }, await venmo({ id: 'v4' }), 'ignored', /already confirmed/]
  ];
  for (const [seed, m, status, why] of cases) {
    const { db, sent } = await scenario(seed, [m]);
    assert.strictEqual(db.data['orders/o1'].status, seed['orders/o1'].status, status);
    const rec = Object.keys(db.data).filter((k) => k.startsWith('paymentEmails/')).map((k) => db.data[k])[0];
    assert.strictEqual(rec.status, status);
    assert.ok(why.test(rec.reason), rec.reason);
    assert.strictEqual(sent.length, 0);
  }
});

test('unpaid: reminder after 2 days, once', async () => {
  const { db, sent } = await scenario({ 'orders/o1': ORDER({ createdAt: ago(2.5) }) }, null);
  assert.ok(db.data['orders/o1'].paymentReminderSentAt);
  assert.strictEqual(sent.length, 1);
  assert.ok(/waiting for payment/.test(sent[0].subject));
  assert.ok(/Send \$94\.69 on Venmo to @TXBio-Research/.test(sent[0].text));
  const again = await run({ db, mailbox: null, mailer: { send: async () => sent.push(1) }, log: () => {} });
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(again['unpaid-waiting'], 1);
});

test('unpaid: cancelled after 5 days, stock and store credit returned, customer emailed', async () => {
  const seed = {
    'orders/o1': ORDER({ createdAt: ago(5.2), paymentReminderSentAt: ago(3), creditUsedCents: 500 }),
    'inventory/bpc-157-10mg': { qty: 3 }, 'inventory/bac-water-10ml': { qty: 40 },
    'credits/jo@example.com': { balanceCents: 0, earnedCents: 0, spentCents: 500 }
  };
  const { db, sent } = await scenario(seed, null);
  const o = db.data['orders/o1'];
  assert.strictEqual(o.status, 'cancelled');
  assert.strictEqual(o.cancelledBy, 'system');
  assert.ok(o.cancelFollowUpAt && o.restockedAt && o.creditRefundedAt);
  assert.strictEqual(db.data['inventory/bpc-157-10mg'].qty, 5);
  assert.strictEqual(db.data['inventory/bac-water-10ml'].qty, 50);
  assert.strictEqual(db.data['credits/jo@example.com'].balanceCents, 500);
  assert.strictEqual(db.data['credits/jo@example.com'].spentCents, 0);
  assert.ok(Object.keys(db.data).some((k) => k.startsWith('credits/jo@example.com/entries/')));
  assert.ok(/was cancelled/.test(sent[0].subject) && /store credit you used has been returned/.test(sent[0].text));
});

test('unpaid: no cancel without a reminder first; family orders and card/inquiry orders are not cancelled', async () => {
  let r = await scenario({ 'orders/o1': ORDER({ createdAt: ago(6) }) }, null);
  assert.strictEqual(r.db.data['orders/o1'].status, 'pending');      // gets the reminder now, cancel later
  assert.ok(r.db.data['orders/o1'].paymentReminderSentAt);
  r = await scenario({ 'orders/o1': ORDER({ createdAt: ago(9), paymentReminderSentAt: ago(7), atCostCode: 'FAMILY' }) }, null);
  assert.strictEqual(r.db.data['orders/o1'].status, 'pending');
  r = await scenario({ 'orders/o1': ORDER({ createdAt: ago(9), paymentMethod: 'inquiry' }) }, null);
  assert.strictEqual(r.db.data['orders/o1'].status, 'pending');
  assert.strictEqual(r.sent.length, 0);
});

test('a payment that arrives on day 6 still confirms (payments run before cancelling)', async () => {
  const { db } = await scenario({ 'orders/o1': ORDER({ createdAt: ago(6), paymentReminderSentAt: ago(4) }) }, [await venmo({ id: 'late' })]);
  assert.strictEqual(db.data['orders/o1'].status, 'confirmed');
});

test('dry run changes nothing and sends nothing', async () => {
  const { db, sent, logs } = await scenario({ 'orders/o1': ORDER(), 'orders/o2': ORDER({ orderNumber: 'TXB-OLD999', createdAt: ago(3) }) }, [await venmo({ id: 'dry' })], { dryRun: true });
  assert.strictEqual(db.data['orders/o1'].status, 'pending');
  assert.ok(!db.data['orders/o2'].paymentReminderSentAt);
  assert.strictEqual(sent.length, 0);
  assert.ok(logs.some((l) => /would get a payment reminder/.test(l)));
  assert.ok(!Object.keys(db.data).some((k) => k.startsWith('paymentEmails/')));
});

test('email failure: order still confirmed; reminder retried next run', async () => {
  const r = await scenario({ 'orders/o1': ORDER() }, [await venmo({ id: 'ef' })], { mailFails: true });
  assert.strictEqual(r.db.data['orders/o1'].status, 'confirmed');
  const r2 = await scenario({ 'orders/o1': ORDER({ createdAt: ago(3) }) }, null, { mailFails: true });
  assert.ok(!r2.db.data['orders/o1'].paymentReminderSentAt);
});

// Real DKIM: sign a message with a test key for "venmo.com" and serve that
// key from a fake DNS resolver, then tamper with it.
const { dkimSign } = require('mailauth/lib/dkim/sign');
const cryptoMod = require('crypto');
async function signedVenmo({ tamper, lTag, domain = 'venmo.com' } = {}) {
  const { privateKey, publicKey } = cryptoMod.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' });
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const msg = raw({ from: 'Venmo <venmo@venmo.com>', subject: 'Jo Smith paid you $94.69', body: 'Jo Smith paid you $94.69\n\nOrder TXB-ABC123', id: 'sig' + Math.random() });
  const signed = await dkimSign(msg, { signatureData: [{ signingDomain: domain, selector: 's1', privateKey: pem, algorithm: 'rsa-sha256', canonicalization: 'relaxed/relaxed', maxBodyLength: lTag ? 20 : undefined }] });
  let full = signed.signatures + msg;
  if (tamper) full = full.replace('$94.69', '$9.69');
  const resolver = async (name, type) => { if (type === 'TXT' && name === 's1._domainkey.' + domain) return [['v=DKIM1; k=rsa; p=' + pub]]; const e = new Error('nx'); e.code = 'ENOTFOUND'; throw e; };
  const parsed = await simpleParser(full);
  parsed.__raw = Buffer.from(full);
  return { parsed, resolver };
}

test('signature fallback: genuine venmo.com signature trusted; tampered, wrong domain, partial (l=) refused', async () => {
  let r = await signedVenmo();
  assert.ok((await verifySignature('venmo', r.parsed.__raw, r.parsed.headerLines, { resolver: r.resolver })).ok);
  r = await signedVenmo({ tamper: true });
  assert.ok(!(await verifySignature('venmo', r.parsed.__raw, r.parsed.headerLines, { resolver: r.resolver })).ok);
  r = await signedVenmo({ domain: 'venmo-payments.co' });
  assert.ok(!(await verifySignature('venmo', r.parsed.__raw, r.parsed.headerLines, { resolver: r.resolver })).ok);
  r = await signedVenmo({ lTag: true });
  const partial = await verifySignature('venmo', r.parsed.__raw, r.parsed.headerLines, { resolver: r.resolver });
  assert.ok(!partial.ok && /part of the message/.test(partial.why));
});

test('no Authentication-Results header but a valid signature: order confirmed', async () => {
  const r = await signedVenmo();
  const { db } = await scenario({ 'orders/o1': ORDER() }, [r.parsed], {
    sigCheck: (app, rawMsg, hl) => verifySignature(app, rawMsg, hl, { resolver: r.resolver })
  });
  assert.strictEqual(db.data['orders/o1'].status, 'confirmed');
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('PASS ' + name); }
    catch (err) { failed++; console.log('FAIL ' + name + '\n  ' + (err.stack || err).split('\n').slice(0, 4).join('\n  ')); }
  }
  console.log(failed ? failed + ' failed' : 'All ' + tests.length + ' tests passed');
  process.exit(failed ? 1 : 0);
})();
