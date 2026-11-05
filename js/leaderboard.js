// leaderboard.js — monthly affiliate leaderboard. Shared by the browser
// (referrals.html, admin-promos.html) and the shipment tracker job, which
// rebuilds it every run and pays the prizes when a month ends.
//
// Firestore:
//   settings/leaderboard        { enabled, prizes: [cents for 1st, 2nd, 3rd], showAmounts }  (admin)
//   leaderboard/current         { month: 'YYYY-MM', updatedAt, showAmounts, prizes, rows: [{ id, name, salesCents, rank }] }
//   leaderboard/{YYYY-MM}       final standings + winners paid, written once when the month ends
//   affiliateProfiles/{email}   { nickname }  (the affiliate's name on the board)
//
// Score: referred sales credited during the month (Chicago time), the same
// sales that earn commission: earned entries minus reversed ones. Emails never
// leave the server; rows carry a short hash so a page can find "you".
var Leaderboard = (function () {
  var TZ = 'America/Chicago';

  function monthKey(d) {
    var p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(d || new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month;
  }
  function prevMonthKey(key) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7) - 1;
    if (m === 0) { y--; m = 12; }
    return y + '-' + (m < 10 ? '0' : '') + m;
  }
  function monthName(key) {
    return new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  // Days left in the Chicago month (including today).
  function daysLeft(now) {
    var key = monthKey(now), y = +key.slice(0, 4), m = +key.slice(5, 7);
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, day: 'numeric' }).formatToParts(now || new Date()).forEach(function (x) { p[x.type] = x.value; });
    return last - +p.day + 1;
  }

  // Sale cents an entry adds to the month (earned +, reversed −).
  function entrySale(en) {
    if (en.type !== 'earned' && en.type !== 'reversed') return 0;
    var s = typeof en.saleCents === 'number' ? en.saleCents : Math.round((en.amountCents || 0) / 0.10);
    if (en.type === 'reversed') s = -Math.abs(s);
    return s;
  }
  function monthSales(entries, key) {
    return (entries || []).reduce(function (n, en) {
      return en && en.createdAt && monthKey(new Date(en.createdAt)) === key ? n + entrySale(en) : n;
    }, 0);
  }

  // "Gabriel Colton" → "Gabriel C."; a nickname wins.
  function displayName(name, nickname) {
    var nick = String(nickname || '').trim();
    if (nick) return nick.slice(0, 24);
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Partner';
    return parts[0] + (parts.length > 1 ? ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.' : '');
  }

  // affiliates: [{ id, name, salesCents }] → ranked rows with sales > 0.
  // Ties share a rank (1, 2, 2, 4).
  function rank(affiliates) {
    var rows = affiliates.filter(function (a) { return a.salesCents > 0; })
      .sort(function (a, b) { return b.salesCents - a.salesCents || String(a.name).localeCompare(String(b.name)); });
    var prev = null, prevRank = 0;
    rows.forEach(function (r, i) {
      r.rank = prev !== null && r.salesCents === prev ? prevRank : i + 1;
      prev = r.salesCents; prevRank = r.rank;
    });
    return rows;
  }

  // Prize for each row (rows sharing a place each get that place's prize).
  // rules: { minAffiliates: prizes only when at least this many affiliates had
  // sales that month; minSalesCents: a winner needs at least this much in sales }.
  function winners(rows, prizes, rules) {
    rules = rules || {};
    if (rules.minAffiliates > 0 && rows.length < rules.minAffiliates) return [];
    return rows.filter(function (r) { return r.rank <= (prizes || []).length && prizes[r.rank - 1] > 0 && r.salesCents >= (rules.minSalesCents || 0); })
      .map(function (r) { return { id: r.id, rank: r.rank, cents: prizes[r.rank - 1] }; });
  }

  return { monthKey: monthKey, prevMonthKey: prevMonthKey, monthName: monthName, daysLeft: daysLeft, monthSales: monthSales,
    displayName: displayName, rank: rank, winners: winners };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Leaderboard;
