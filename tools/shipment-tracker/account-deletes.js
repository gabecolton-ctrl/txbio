// account-deletes.js — deletes customer accounts the admin queued on
// Admin → Customers (accountDeletions/{uid}). Runs with each tracker run.
//
// Only a server can delete a Firebase sign-in, so the admin page just queues
// the request; this removes the sign-in and the account's data:
//   users/{uid}, carts/{uid}, budgetCarts/{uid}, customerNotes/{email},
//   referredCustomers/{email}, affiliateProfiles/{email}, and the account's
//   cancelled orders. Store credit is removed only when the balance is $0.
// An account with an order that isn't cancelled is never deleted (the request
// is marked "blocked"), so real sales records stay.

async function deleteDocs(snap) {
  for (const d of snap.docs) await d.ref.delete();
}

async function deleteOne({ db, auth, req, log }) {
  const uid = req.uid;
  const email = String(req.email || '').toLowerCase();
  const orders = await db.collection('orders').where('userId', '==', uid).get();
  const open = orders.docs.filter((d) => (d.data().status || 'pending') !== 'cancelled');
  if (open.length) return { status: 'blocked', reason: open.length + ' order(s) not cancelled: ' + open.map((d) => d.data().orderNumber || d.id).join(', ') };

  try { await auth.deleteUser(uid); } catch (err) {
    if (!/user-not-found|no user record/i.test(String(err && (err.code || err.message)))) throw err;
  }
  await deleteDocs(orders);
  const docs = [['users', uid], ['carts', uid], ['budgetCarts', uid]];
  if (email) docs.push(['customerNotes', email], ['referredCustomers', email], ['affiliateProfiles', email]);
  for (const [c, id] of docs) await db.collection(c).doc(id).delete();

  let creditNote = '';
  if (email) {
    const credit = await db.collection('credits').doc(email).get();
    if (credit.exists) {
      if ((credit.data().balanceCents || 0) === 0) {
        await deleteDocs(await db.collection('credits').doc(email).collection('entries').get());
        await db.collection('credits').doc(email).delete();
      } else creditNote = ' (kept store credit: balance not $0)';
    }
  }
  log('Deleted account ' + (email || uid) + (orders.size ? ' and ' + orders.size + ' cancelled order(s)' : '') + creditNote);
  return { status: 'done', note: creditNote.trim() };
}

async function processAccountDeletes({ db, auth, log = console.log, now = new Date() }) {
  const snap = await db.collection('accountDeletions').where('status', '==', 'queued').get();
  let done = 0;
  for (const d of snap.docs) {
    const req = Object.assign({ uid: d.id }, d.data());
    try {
      const r = await deleteOne({ db, auth, req, log });
      await d.ref.set(Object.assign({}, req, r, { finishedAt: now.toISOString() }));
      if (r.status === 'done') done++;
      else log('Account delete blocked for ' + (req.email || req.uid) + ': ' + r.reason);
    } catch (err) {
      log('Account delete failed for ' + (req.email || req.uid) + ' (will retry): ' + (err && err.message || err));
    }
  }
  return done;
}

module.exports = { processAccountDeletes };
