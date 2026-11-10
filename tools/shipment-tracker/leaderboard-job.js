// leaderboard-job.js — rebuilds the monthly affiliate leaderboard each tracker
// run, and pays the prizes once when a month ends (js/leaderboard.js).
const path = require('path');
const crypto = require('crypto');
const Leaderboard = require(path.join(__dirname, '../../js/leaderboard.js'));

// Same short id the browser computes (SHA-256 of the lowercased email, 16 hex).
function idOf(email) { return crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 16); }

async function affiliates(db) {
  const codes = await db.collection('promoCodes').get();
  const emails = new Set();
  codes.docs.forEach((d) => { const e = String(d.data().affiliateEmail || '').trim().toLowerCase(); if (e) emails.add(e); });
  const out = [];
  for (const email of emails) {
    // Sales on either store count (TXBio credits + TexasBench budgetCredits).
    const [entries, users, profile, budgetEntries] = await Promise.all([
      db.collection('credits').doc(email).collection('entries').get(),
      db.collection('users').where('email', '==', email).get(),
      db.collection('affiliateProfiles').doc(email).get(),
      db.collection('budgetCredits').doc(email).collection('entries').get().catch(() => ({ docs: [] }))
    ]);
    const user = users.docs[0] ? users.docs[0].data() : {};
    const name = user.name || String(user.displayName || '').split(' — ')[0];
    out.push({ email, id: idOf(email), name: Leaderboard.displayName(name, profile.exists ? profile.data().nickname : ''), entries: entries.docs.concat(budgetEntries.docs).map((d) => d.data()) });
  }
  return out;
}

function standings(list, key) {
  return Leaderboard.rank(list.map((a) => ({ id: a.id, email: a.email, name: a.name, salesCents: Leaderboard.monthSales(a.entries, key) })));
}

// Pays one prize as store credit, once (the entry id makes it idempotent).
async function pay(db, email, cents, note, entryId) {
  const creditRef = db.collection('credits').doc(email);
  const entryRef = creditRef.collection('entries').doc(entryId);
  return db.runTransaction(async (t) => {
    const done = await t.get(entryRef);
    if (done.exists) return false;
    const snap = await t.get(creditRef);
    const c = snap.exists ? snap.data() : {};
    const at = new Date().toISOString();
    t.set(creditRef, { balanceCents: (c.balanceCents || 0) + cents, earnedCents: c.earnedCents || 0, spentCents: c.spentCents || 0, updatedAt: at }, { merge: true });
    t.set(entryRef, { type: 'adjusted', amountCents: cents, note, orderId: '', orderNumber: '', code: '', createdAt: at });
    return true;
  });
}

async function updateLeaderboard({ db, log = console.log, now = new Date() }) {
  const settingsSnap = await db.collection('settings').doc('leaderboard').get();
  const s = settingsSnap.exists ? settingsSnap.data() : {};
  if (!s.enabled) {
    // Hide the board on Referrals pages (no prizes, nothing paid).
    const cur = await db.collection('leaderboard').doc('current').get();
    if (cur.exists && cur.data().enabled !== false) await db.collection('leaderboard').doc('current').set({ enabled: false, updatedAt: new Date().toISOString() });
    return 'off';
  }
  const prizes = (s.prizes || []).map((n) => Math.max(0, Math.round(Number(n) || 0)));
  const key = Leaderboard.monthKey(now);
  const list = await affiliates(db);

  // Month that just ended: pay once, if the leaderboard was on for it.
  const prev = Leaderboard.prevMonthKey(key);
  const histRef = db.collection('leaderboard').doc(prev);
  const hist = await histRef.get();
  if (!hist.exists && s.since && prev >= s.since) {
    const rows = standings(list, prev);
    const rules = { minAffiliates: Number(s.minAffiliates) || 0, minSalesCents: Number(s.minSalesCents) || 0 };
    const wins = Leaderboard.winners(rows, prizes, rules);
    if (!wins.length && rows.length) log('Leaderboard ' + prev + ': no prizes (needs ' + (rules.minAffiliates || 1) + '+ affiliates with sales and $' + (rules.minSalesCents / 100) + '+ to win)');
    for (const w of wins) {
      const row = rows.find((r) => r.id === w.id);
      const paid = await pay(db, row.email, w.cents, 'Leaderboard #' + w.rank + ' · ' + Leaderboard.monthName(prev), 'leaderboard-' + prev + '-' + w.id);
      if (paid) log('Leaderboard ' + prev + ': #' + w.rank + ' ' + row.name + ' +$' + (w.cents / 100).toFixed(2));
    }
    await histRef.set({ month: prev, rows: rows.map((r) => ({ id: r.id, name: r.name, salesCents: r.salesCents, rank: r.rank })), winners: wins, prizes, rules, paidAt: new Date().toISOString() });
  }

  const rows = standings(list, key).map((r) => ({ id: r.id, name: r.name, salesCents: r.salesCents, rank: r.rank }));
  await db.collection('leaderboard').doc('current').set({ enabled: true, month: key, updatedAt: new Date().toISOString(), prizes, showAmounts: s.showAmounts !== false,
    minAffiliates: Number(s.minAffiliates) || 0, minSalesCents: Number(s.minSalesCents) || 0, rows: rows.slice(0, 25) });
  return rows.length;
}

module.exports = { updateLeaderboard, idOf };
