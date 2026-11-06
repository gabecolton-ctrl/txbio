// referrals-page.js — the affiliate dashboard (referrals.html). Shows the
// signed-in user's referral code(s) with a link to copy or share, how many
// orders the code brought in, credit earned, and the current balance.
// Reads only what the user can already read: promo codes (signed-in users)
// and their own credits/{email} + entries. The admin can preview any
// affiliate with ?as=their@email.
(function () {
  var ADMIN_EMAIL = 'gabecolton@gmail.com';
  var SITE = 'https://txbioresearch.com';
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  var TYPE_TEXT = { 'first-order': 'on their first order', 'repeat-order': 'on repeat orders', always: 'on every order' };

  function copy(btn, text) {
    var done = function () {
      var label = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('is-done');
      setTimeout(function () { btn.textContent = label; btn.classList.remove('is-done'); }, 1600);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { prompt('Copy this link:', text); });
    else prompt('Copy this link:', text);
  }

  function linkCard(promo) {
    var code = promo.code, url = SITE + '/?code=' + encodeURIComponent(code);
    var perks = promo.active
      ? 'Gives customers <strong>' + esc(promo.discountPercent) + '% off</strong> ' + esc(TYPE_TEXT[promo.type] || '') + '.'
      : '<span class="ref-paused">This code is paused right now. Contact us if you think that’s a mistake.</span>';
    var extra = [['Catalog', '/services.html']];
    return '<div class="ref-card">' +
      '<span class="ref-card-label">Your link · code ' + esc(code) + '</span>' +
      '<div class="ref-card-row"><code class="ref-card-url">' + esc(url.replace('https://', '')) + '</code>' +
      '<button type="button" class="btn ref-copy-main" data-copy="' + esc(url) + '">Copy link</button>' +
      (navigator.share ? '<button type="button" class="btn-outline-light ref-share" data-share="' + esc(url) + '">Share</button>' : '') + '</div>' +
      '<p class="ref-card-perk">' + perks + '</p>' +
      '<p class="ref-card-more">Your code works on any page. Other links to share: ' + extra.map(function (x) {
        var u = SITE + x[1] + '?code=' + encodeURIComponent(code);
        return '<button type="button" class="ref-mini" data-copy="' + esc(u) + '">' + esc(x[0]) + '</button>';
      }).join(' ') + '</p>' +
    '</div>';
  }

  function chicagoDay(d) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d); }
    catch (e) { return d.toISOString().slice(0, 10); }
  }

  // Visits and people brought in by the link(s), plus a 30-day column chart.
  function renderTraffic(traffic) {
    var visits = 0, visitors = 0, days = {};
    traffic.forEach(function (t) {
      visits += Number(t.visits) || 0;
      visitors += Number(t.visitors) || 0;
      var d = t.days || {};
      Object.keys(d).forEach(function (k) { days[k] = (days[k] || 0) + (Number(d[k]) || 0); });
    });
    var now = Date.now(), list = [];
    for (var i = 29; i >= 0; i--) { var k = chicagoDay(new Date(now - i * 864e5)); list.push({ day: k, n: days[k] || 0 }); }
    var last7 = list.slice(-7).reduce(function (s, x) { return s + x.n; }, 0);
    var today = list[list.length - 1].n;
    $('ref-traffic').innerHTML = [
      ['People reached', visitors.toLocaleString('en-US'), 'different people who opened your link'],
      ['Link visits', visits.toLocaleString('en-US'), 'all time'],
      ['Last 7 days', last7.toLocaleString('en-US'), 'visits'],
      ['Today', today.toLocaleString('en-US'), 'visits so far']
    ].map(function (r) {
      return '<div class="pnl-tile"><span class="pnl-label">' + r[0] + '</span><span class="pnl-value">' + r[1] + '</span><span class="pnl-sub">' + r[2] + '</span></div>';
    }).join('');
    var total30 = list.reduce(function (s, x) { return s + x.n; }, 0);
    $('ref-chart-total').textContent = total30 ? total30.toLocaleString('en-US') + ' visits' : 'No visits yet. Share your link to get started.';
    drawChart(list);
  }

  function drawChart(list) {
    var el = $('ref-chart'), tip = $('ref-tip');
    var W = Math.max(280, el.clientWidth || 600), H = 150, padL = 28, padB = 22, padT = 8;
    var max = Math.max(4, Math.max.apply(null, list.map(function (x) { return x.n; })));
    var top = Math.ceil(max / 4) * 4;
    var plotW = W - padL - 4, plotH = H - padB - padT, band = plotW / list.length, bw = Math.max(2, Math.min(16, band - 2));
    var label = function (d, long) { var x = new Date(d + 'T12:00:00'); return x.toLocaleDateString(undefined, long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'numeric', day: 'numeric' }); };
    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">';
    for (var g = 0; g <= 2; g++) {
      var gy = padT + plotH - plotH * g / 2;
      svg += '<line x1="' + padL + '" x2="' + (W - 4) + '" y1="' + gy + '" y2="' + gy + '" class="tr-grid-line"/><text x="' + (padL - 6) + '" y="' + (gy + 4) + '" class="tr-axis" text-anchor="end">' + (top * g / 2) + '</text>';
    }
    list.forEach(function (x, i) {
      var h = plotH * x.n / top, bx = padL + band * i + (band - bw) / 2, y = padT + plotH - h, r = Math.min(4, bw / 2, h);
      if (h > 0) svg += '<path class="tr-col" d="M' + bx + ',' + (padT + plotH) + 'V' + (y + r) + 'Q' + bx + ',' + y + ' ' + (bx + r) + ',' + y + 'H' + (bx + bw - r) + 'Q' + (bx + bw) + ',' + y + ' ' + (bx + bw) + ',' + (y + r) + 'V' + (padT + plotH) + 'Z"/>';
      svg += '<rect class="tr-hit" data-i="' + i + '" x="' + (padL + band * i) + '" y="' + padT + '" width="' + band + '" height="' + plotH + '"/>';
      if (i % 7 === 2 || i === list.length - 1) svg += '<text x="' + (padL + band * i + band / 2) + '" y="' + (H - 6) + '" class="tr-axis" text-anchor="middle">' + label(x.day) + '</text>';
    });
    el.innerHTML = svg + '</svg>';
    el.querySelectorAll('.tr-hit').forEach(function (r) {
      function show() {
        var x = list[Number(r.getAttribute('data-i'))];
        tip.innerHTML = '<strong>' + esc(label(x.day, true)) + '</strong><br>' + x.n + ' visit' + (x.n === 1 ? '' : 's');
        tip.style.display = 'block';
        tip.style.left = Math.min(Math.max(Number(r.getAttribute('x')) + band / 2 - 70, 0), W - 150) + 'px';
        r.classList.add('is-hover');
      }
      function hide() { tip.style.display = 'none'; r.classList.remove('is-hover'); }
      r.addEventListener('mouseenter', show); r.addEventListener('mouseleave', hide);
      r.addEventListener('touchstart', show, { passive: true });
    });
  }

  // Partner tier (js/affiliate-tiers.js) from referred sales in their history.
  function renderTier(entries) {
    if (!window.AffiliateTiers) return;
    var money = function (n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var whole = function (n) { return '$' + Number(n).toLocaleString('en-US'); };
    var st = AffiliateTiers.status(entries);
    var sales = st.sales, tier = st.tier, next = st.next;
    var pct = Math.round(tier.rate * 100);
    var date = function (ms) { return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
    $('ref-earn-rate').textContent = 'You earn ' + pct + '%';
    $('aff-badge').textContent = tier.name;
    $('aff-badge').className = 'loyalty-badge aff-' + tier.name.toLowerCase().replace(/\s+/g, '-');
    $('aff-rate').textContent = pct + '% back on every referred order';
    $('aff-sales').textContent = money(sales);
    $('aff-fill').style.width = next ? Math.min(100, Math.max(0, sales - tier.min) / (next.min - tier.min) * 100) + '%' : '100%';
    var lines = [];
    if (next) lines.push(money(st.toNext) + ' more in referred sales (last 90 days) to reach ' + next.name + ' (' + Math.round(next.rate * 100) + '%).');
    else lines.push('You’re at the top tier. Thank you!');
    if (st.heldUntil) lines.push('Your ' + pct + '% rate is locked in through ' + date(st.heldUntil) + '. Each sale that keeps you at ' + money(tier.min) + '+ in 90 days extends it.');
    $('aff-next').textContent = lines.join(' ');
    $('aff-tiers').innerHTML = AffiliateTiers.TIERS.map(function (t) {
      var on = t === tier;
      return '<li class="tier-step aff-' + t.name.toLowerCase().replace(/\s+/g, '-') + (on ? ' is-on' : '') + '">' + (on ? '<span class="tier-here">You’re here</span>' : '') +
        '<strong>' + esc(t.name) + '</strong><span class="tier-min">' + whole(t.min) + '+</span><span class="tier-pct">' + Math.round(t.rate * 100) + '%</span></li>';
    }).join('');
  }

  // ---------- Monthly leaderboard (js/leaderboard.js; built by the tracker job) ----------
  function sha16(text) {
    if (!window.crypto || !crypto.subtle || !window.TextEncoder) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').slice(0, 16);
    }).catch(function () { return ''; });
  }
  function renderLeaderboard(email, entries) {
    if (!window.Leaderboard) return;
    var db = firebase.firestore();
    var key = Leaderboard.monthKey();
    Promise.all([
      db.collection('leaderboard').doc('current').get(),
      db.collection('affiliateProfiles').doc(email).get().catch(function () { return null; }),
      sha16(email)
    ]).then(function (r) {
      var cur = r[0].exists ? r[0].data() : null;
      if (!cur || cur.enabled === false) return;
      var myId = r[2];
      var fmt = function (c) { return '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
      var fmt0 = function (c) { return '$' + (Number(c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 }); };
      var rows = cur.month === key ? (cur.rows || []) : [];
      var left = Leaderboard.daysLeft();
      $('lb-wrap').style.display = '';
      $('lb-title').textContent = Leaderboard.monthName(key) + ' leaderboard';
      $('lb-days').textContent = left === 1 ? 'Last day!' : left + ' days left';
      var medals = ['🥇', '🥈', '🥉'];
      $('lb-prizes').innerHTML = (cur.prizes || []).map(function (c, i) { return c > 0 ? medals[i] + ' ' + fmt0(c) : ''; }).filter(Boolean).join(' &nbsp; ');
      var rules = [];
      if (cur.minSalesCents > 0) rules.push('winners need ' + fmt0(cur.minSalesCents) + '+ in sales');
      if (cur.minAffiliates > 1) rules.push('prizes are paid when ' + cur.minAffiliates + '+ partners make sales that month');
      if (rules.length) $('lb-prizes').innerHTML += '<span class="lb-rules">' + esc(rules.join('; ')) + '</span>';
      $('lb-list').innerHTML = rows.length ? rows.slice(0, 10).map(function (row) {
        var me = myId && row.id === myId;
        return '<li class="lb-row' + (me ? ' lb-me' : '') + (row.rank <= 3 ? ' lb-top' : '') + '">' +
          '<span class="lb-rank">' + (row.rank <= 3 ? medals[row.rank - 1] : '#' + row.rank) + '</span>' +
          '<span class="lb-name">' + esc(row.name) + (me ? ' <em>(you)</em>' : '') + '</span>' +
          (cur.showAmounts !== false || me ? '<span class="lb-amt">' + fmt(row.salesCents) + '</span>' : '') + '</li>';
      }).join('') : '<li class="lb-row lb-empty">No sales yet this month. The first one takes the top spot.</li>';
      var mine = Leaderboard.monthSales(entries, key);
      var myRow = rows.find(function (x) { return x.id === myId; });
      var top = rows[0];
      var msg = 'Your referred sales this month: <strong>' + fmt(Math.max(0, mine)) + '</strong>';
      if (myRow) msg += ' · you’re <strong>#' + myRow.rank + '</strong>';
      if (myRow && myRow.rank > 1 && top) msg += ' · ' + fmt(top.salesCents - myRow.salesCents) + ' behind #1';
      else if (!myRow && top && cur.showAmounts !== false) msg += ' · ' + fmt(Math.max(0, top.salesCents - mine)) + ' behind #1';
      $('lb-you').innerHTML = msg;
      var prof = r[1] && r[1].exists ? r[1].data() : {};
      $('lb-nick').value = prof.nickname || '';
    }).catch(function () {});
    var form = $('lb-nick-form');
    if (form && !form.__bound) {
      form.__bound = true;
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var nick = $('lb-nick').value.trim().slice(0, 24), st = $('lb-nick-status');
        var ref = firebase.firestore().collection('affiliateProfiles').doc(email);
        (nick ? ref.set({ nickname: nick, updatedAt: new Date().toISOString() }) : ref.delete()).then(function () {
          st.style.color = 'var(--text-light)'; st.textContent = 'Saved. The board shows it after the next update (about 10 minutes).';
        }).catch(function (err) { st.style.color = 'var(--danger)'; st.textContent = 'Could not save: ' + err.message; });
      });
    }
  }

  function render(email, codes, account, entries, traffic, saved) {
    $('ref-loading').style.display = 'none';
    if (!codes.length) { $('ref-none').style.display = ''; return; }
    $('ref-body').style.display = '';
    $('ref-links').innerHTML = codes.map(linkCard).join('');
    renderTier(entries);
    renderLeaderboard(email, entries);

    var myCodes = codes.map(function (c) { return c.code; });
    var placed = codes.reduce(function (n, c) { return n + (Number(c.timesUsed) || 0); }, 0);
    var credited = {}, earnedCents = 0;
    entries.forEach(function (en) {
      if (en.type === 'earned') { earnedCents += en.amountCents || 0; if (en.orderId) credited[en.orderId] = true; }
      if (en.type === 'reversed') { earnedCents += en.amountCents || 0; if (en.orderId) delete credited[en.orderId]; }
    });
    var shipped = Object.keys(credited).length;
    renderTraffic(traffic || []);
    var fmt = window.Credits ? Credits.formatCents : function (c) { return '$' + (c / 100).toFixed(2); };
    $('ref-stats').innerHTML = [
      ['Orders from your link or code', placed, ''],
      ['Orders shipped', shipped, 'these earned you credit'],
      ['Credit earned', fmt(Math.max(0, earnedCents)), 'all time'],
      ['Credit balance', fmt(account ? account.balanceCents : 0), 'ready to use at checkout'],
      ['Customers saved to you', (saved || []).filter(function (x) { return window.ReferralAttribution ? ReferralAttribution.isActive(x) : true; }).length, 'you earn on all their orders for 18 months']
    ].map(function (r) {
      return '<div class="pnl-tile"><span class="pnl-label">' + r[0] + '</span><span class="pnl-value">' + r[1] + '</span>' + (r[2] ? '<span class="pnl-sub">' + r[2] + '</span>' : '') + '</div>';
    }).join('');

    var LABELS = { earned: 'Referral credit', reversed: 'Referral reversed (order cancelled)', spent: 'Used at checkout', refunded: 'Returned (order cancelled)', adjusted: 'Adjustment', loyalty: 'Rewards credit', 'loyalty-reversed': 'Rewards credit taken back', gift: 'Gift card redeemed' };
    var rows = entries.map(function (en) {
      var amt = en.amountCents || 0;
      var activity = (LABELS[en.type] || en.type) + (en.type === 'earned' && typeof en.rate === 'number' ? ' · ' + Math.round(en.rate * 100) + '%' : '') + (en.type === 'earned' && en.code && myCodes.length > 1 ? ' (' + esc(en.code) + ')' : '');
      return '<tr><td>' + esc(en.createdAt ? new Date(en.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '') + '</td>' +
        '<td>' + activity + '</td><td>' + esc(en.orderNumber ? '#' + en.orderNumber : '') + '</td>' +
        '<td class="' + (amt < 0 ? 'ref-neg' : 'ref-pos') + '">' + (amt < 0 ? '-' : '+') + fmt(Math.abs(amt)) + '</td></tr>';
    });
    $('ref-history').innerHTML = rows.join('');
    $('ref-history-wrap').style.display = rows.length ? '' : 'none';
    $('ref-history-empty').style.display = rows.length ? 'none' : '';

    document.querySelectorAll('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copy(b, b.getAttribute('data-copy')); }); });
    document.querySelectorAll('[data-share]').forEach(function (b) {
      b.addEventListener('click', function () {
        navigator.share({ title: 'TXBioResearch', text: 'Research peptides from Dallas, TX. My code saves you money:', url: b.getAttribute('data-share') }).catch(function () {});
      });
    });
  }

  document.addEventListener('userReady', function (e) {
    var user = e.detail.user;
    var email = String(user.email || '').toLowerCase();
    var as = new URLSearchParams(location.search).get('as');
    var who = as && window.Staff ? Staff.role(user) : Promise.resolve(user.email === ADMIN_EMAIL ? 'admin' : null);
    who.then(function (r) {
      // Staff (admin or manager) can preview an affiliate's dashboard.
      if (as && (r === 'admin' || r === 'manager')) {
        email = as.trim().toLowerCase();
        $('ref-lead').textContent = 'Staff preview: what ' + email + ' sees.';
      }
      show(email);
    });
  });

  function show(email) {
    var db = firebase.firestore();
    db.collection('promoCodes').where('affiliateEmail', '==', email).get().then(function (snap) {
      var codes = [];
      snap.forEach(function (d) { codes.push(Object.assign({ code: d.id }, d.data())); });
      codes.sort(function (a, b) { return (b.active ? 1 : 0) - (a.active ? 1 : 0) || (a.code < b.code ? -1 : 1); });
      if (!codes.length || !window.Credits) return render(email, codes, null, []);
      return Promise.all([
        Credits.getAccount(email).catch(function () { return null; }),
        Credits.getEntries(email, 1000).catch(function () { return []; }),
        Promise.all(codes.map(function (c) {
          return db.collection('refTraffic').doc(c.code).get().then(function (d) { return d.exists ? d.data() : null; }).catch(function () { return null; });
        })).then(function (list) { return list.filter(Boolean); }),
        db.collection('referredCustomers').where('affiliateEmail', '==', email).get().then(function (snap) {
          var list = []; snap.forEach(function (d) { list.push(d.data()); }); return list;
        }).catch(function () { return []; })
      ]).then(function (r) { render(email, codes, r[0], r[1], r[2], r[3]); });
    }).catch(function (err) {
      $('ref-loading').textContent = 'Could not load your referrals: ' + err.message;
    });
  }
})();
