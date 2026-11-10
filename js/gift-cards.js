// gift-cards.js — gift cards that load store credit (js/credits.js).
//
// Firestore (see firestore.rules):
//   giftCards/{CODE}  { amountCents, toName, toEmail, forEmail, from, message,
//                       paidCents, paidMethod, createdAt, createdBy,
//                       void, redeemedBy, redeemedAt }
// The admin creates them (Admin → Gift cards). Anyone signed in who has the
// code can redeem it once on gift.html (or at checkout): the card is marked
// redeemed and the amount is added to their store credit, in one batch the
// rules check. forEmail, if set, limits redemption to that account.
// Codes look like TXB-7KQ2-M9XD-4HPA (12 random characters, ~60 bits).
var GiftCards = (function () {
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
  var CODE_RE = /^TXB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  var SITE = 'https://txbioresearch.com';

  function makeCode() {
    var bytes = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    var s = '';
    for (var i = 0; i < 12; i++) s += ALPHABET.charAt(bytes[i] % ALPHABET.length);
    return 'TXB-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
  }

  // Accepts any spacing / dashes / case the customer typed.
  function normalize(raw) {
    var s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.indexOf('TXB') === 0) s = s.slice(3);
    if (s.length !== 12) return '';
    return 'TXB-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
  }

  // The store a card belongs to (js/sites.js): the card's own site, else the
  // store this page is on.
  function storeOf(card) {
    var id = card && card.site ? card.site : (typeof Sites !== 'undefined' ? Sites.current() : 'main');
    return id === 'budget' ? 'budget' : 'main';
  }
  function storeUrl(card) { return typeof Sites !== 'undefined' ? Sites.info(storeOf(card)).url : SITE; }
  function redeemUrl(code, card) { return storeUrl(card) + '/gift.html?code=' + encodeURIComponent(code); }
  function money(cents) {
    var d = (cents || 0) / 100;
    return '$' + (d % 1 ? d.toFixed(2) : d.toLocaleString('en-US'));
  }

  // Redeems a card into the signed-in buyer's store credit.
  // Resolves { amountCents, balanceCents }; rejects with a readable message.
  function redeem(db, email, raw) {
    email = String(email || '').toLowerCase();
    var code = normalize(raw);
    if (!email) return Promise.reject(new Error('Please sign in first.'));
    if (!CODE_RE.test(code)) return Promise.reject(new Error('That doesn’t look like a gift card code. It looks like TXB-XXXX-XXXX-XXXX.'));
    var gref = db.collection('giftCards').doc(code);
    var cref = db.collection('credits').doc(email);
    return Promise.all([gref.get(), cref.get()]).then(function (r) {
      var g = r[0], c = r[1];
      if (!g.exists) throw new Error('We couldn’t find that gift card. Check the code and try again.');
      var d = g.data();
      if (d.void) throw new Error('This gift card is no longer valid.');
      if (d.redeemedBy) throw new Error(d.redeemedBy === email ? 'You already redeemed this gift card. It’s in your store credit.' : 'This gift card has already been redeemed.');
      if (d.forEmail && d.forEmail !== email) throw new Error('This gift card was sent to a different account. Sign in with the email it was sent to.');
      var amt = Number(d.amountCents) || 0;
      var now = new Date().toISOString();
      var batch = db.batch();
      var balance;
      if (c.exists) {
        var a = c.data();
        balance = (a.balanceCents || 0) + amt;
        batch.update(cref, { balanceCents: balance, giftCents: (a.giftCents || 0) + amt, lastGiftCard: code, updatedAt: now });
      } else {
        balance = amt;
        batch.set(cref, { balanceCents: amt, earnedCents: 0, spentCents: 0, giftCents: amt, lastGiftCard: code, updatedAt: now });
      }
      batch.update(gref, { redeemedBy: email, redeemedAt: now });
      batch.set(cref.collection('entries').doc(), {
        type: 'gift', amountCents: amt, code: code, orderId: '', orderNumber: '',
        note: d.from ? 'From ' + String(d.from).slice(0, 80) : '', createdAt: now
      });
      return batch.commit().then(function () { return { amountCents: amt, balanceCents: balance }; });
    }).catch(function (err) {
      if (/permission/i.test(err.message || '')) throw new Error('This gift card can’t be redeemed on this account.');
      throw err;
    });
  }

  // ---------- The card picture (canvas), for downloading or texting ----------
  function loadImage(src) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { resolve(null); };
      im.src = src;
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrap(ctx, text, maxW) {
    var words = String(text || '').split(/\s+/), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }
  // card: { code, amountCents, toName, from, message, noQr }. Resolves the canvas.
  // TXBio: dark teal. TexasBench: white and blue.
  var LOOKS = {
    main: { bg: '#0a1416', glow: 'rgba(94,234,212,0.22)', glow0: 'rgba(94,234,212,0)', lines: 'rgba(94,234,212,0.10)', edge: 'rgba(94,234,212,0.35)',
      text: '#e6efed', accent: '#5eead4', muted: '#93a8a5', quote: '#c7d6d3', qrBg: '#e6efed', qrInk: '#0f1b1d', serif: 'Georgia, "Times New Roman", serif' },
    budget: { bg: '#ffffff', glow: 'rgba(23,86,209,0.10)', glow0: 'rgba(23,86,209,0)', lines: 'rgba(23,86,209,0.10)', edge: 'rgba(23,86,209,0.45)',
      text: '#0f1d33', accent: '#1756d1', muted: '#4b5b72', quote: '#334155', qrBg: '#eef3fa', qrInk: '#0f1d33', serif: 'Inter, "Segoe UI", Arial, sans-serif' }
  };
  function drawCard(canvas, card, logoSrc) {
    var W = 1500, H = 945;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var store = storeOf(card), L = LOOKS[store];
    var info = typeof Sites !== 'undefined' ? Sites.info(store) : { fullName: 'Texas Advanced BioResearch', url: SITE, logo: 'images/logo-icon.png' };
    var domain = String(info.url).replace(/^https?:\/\//, '');
    return loadImage(logoSrc || info.logo || 'images/logo-icon.png').then(function (logo) {
      // Background with a soft glow.
      ctx.fillStyle = L.bg; roundRect(ctx, 0, 0, W, H, 56); ctx.fill();
      ctx.save(); roundRect(ctx, 0, 0, W, H, 56); ctx.clip();
      var g = ctx.createRadialGradient(W * 0.2, H * 0.1, 40, W * 0.2, H * 0.1, W * 0.9);
      g.addColorStop(0, L.glow); g.addColorStop(1, L.glow0);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // Faint molecule lines in the corner.
      ctx.strokeStyle = L.lines; ctx.lineWidth = 3;
      var pts = [[1180, 120], [1330, 200], [1290, 360], [1420, 450], [1250, 520]];
      ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
      pts.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 12, 0, Math.PI * 2); ctx.stroke(); });
      ctx.restore();
      ctx.strokeStyle = L.edge; ctx.lineWidth = 3; roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 55); ctx.stroke();

      // Brand.
      if (logo) {
        ctx.save(); roundRect(ctx, 80, 72, 96, 96, 22); ctx.clip(); ctx.drawImage(logo, 80, 72, 96, 96); ctx.restore();
      }
      ctx.fillStyle = L.text; ctx.font = (store === 'budget' ? '700 ' : '') + '48px ' + L.serif;
      ctx.fillText(info.fullName || info.name, 200, 136);
      ctx.fillStyle = L.accent; ctx.font = '600 30px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillText('G I F T   C A R D', 82, 250);

      // Amount.
      ctx.fillStyle = L.text; ctx.font = (store === 'budget' ? '800 ' : '') + '200px ' + L.serif;
      ctx.fillText(money(card.amountCents), 70, 450);

      // To / from / message.
      var y = 530;
      ctx.font = '36px system-ui, -apple-system, "Segoe UI", sans-serif';
      if (card.toName) { ctx.fillStyle = L.muted; ctx.fillText('For', 82, y); ctx.fillStyle = L.text; ctx.fillText(card.toName, 150, y); y += 56; }
      if (card.from) { ctx.fillStyle = L.muted; ctx.fillText('From', 82, y); ctx.fillStyle = L.text; ctx.fillText(card.from, 175, y); y += 56; }
      if (card.message) {
        ctx.fillStyle = L.quote; ctx.font = 'italic 34px ' + L.serif;
        wrap(ctx, '“' + card.message + '”', 900).slice(0, 2).forEach(function (l) { ctx.fillText(l, 82, y + 8); y += 48; });
      }

      // Code + how to redeem.
      ctx.fillStyle = L.accent; ctx.font = '600 46px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(card.code, 82, 820);
      ctx.fillStyle = L.muted; ctx.font = '28px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillText('Redeem at ' + domain + '/gift  ·  added to your store credit', 82, 872);

      // QR to the redeem page, on a light panel so every phone can scan it.
      if (window.qrcode && !card.noQr) {
        var qr = window.qrcode(0, 'M'); qr.addData(redeemUrl(card.code, card)); qr.make();
        var n = qr.getModuleCount(), size = 300, cell = Math.floor(size / (n + 4)), qs = cell * (n + 4);
        var qx = W - 80 - qs, qy = H - 80 - qs;
        ctx.fillStyle = L.qrBg; roundRect(ctx, qx, qy, qs, qs, 26); ctx.fill();
        ctx.fillStyle = L.qrInk;
        for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
          if (qr.isDark(r, c)) ctx.fillRect(qx + (c + 2) * cell, qy + (r + 2) * cell, cell, cell);
        }
      }
      return canvas;
    });
  }

  // ---------- Buying a gift card for a friend (gift-cards.html → cart) ----------
  // A cart line: { slug: 'gift-card', name, packSize, price, qty: 1, giftId,
  //   giftCard: { toName, toEmail, from, message } }. When the admin confirms
  // the order's payment, issueForOrder() creates the card and emails the friend.
  var SLUG = 'gift-card', MIN = 10, MAX = 1000;
  function isGiftLine(item) { return !!(item && item.giftCard); }
  function lineFor(amount, giftCard) {
    var id = makeCode().replace(/-/g, '').slice(3, 11).toLowerCase();
    return {
      slug: SLUG, name: 'Gift card', price: Math.round(Number(amount) * 100) / 100, qty: 1,
      packSize: money(Math.round(Number(amount) * 100)) + ' for ' + (giftCard.toName || giftCard.toEmail),
      giftId: id, giftCard: giftCard
    };
  }

  // ADMIN. Creates the cards for an order's gift lines that don't have one yet,
  // saves the codes on the order, and emails each friend (js/order-emails.js).
  // Resolves the list of { code, line, emailed }.
  function issueForOrder(db, order, by) {
    var items = (order.items || []).map(function (i) { return Object.assign({}, i); });
    var todo = items.filter(function (i) { return isGiftLine(i) && !i.giftCode; });
    if (!todo.length) return Promise.resolve([]);
    var now = new Date().toISOString();
    var made = [];
    return Promise.all(todo.map(function (line) {
      var code = makeCode();
      var g = line.giftCard || {};
      var card = {
        amountCents: Math.round(Number(line.price) * 100), toName: g.toName || '', toEmail: String(g.toEmail || '').toLowerCase(), forEmail: '',
        from: g.from || '', message: g.message || '', paidCents: Math.round(Number(line.price) * 100), paidMethod: order.paymentMethod || '',
        orderId: order.id || '', orderNumber: order.orderNumber || '', buyerEmail: order.userEmail || '',
        createdAt: now, createdBy: by || '', void: false, redeemedBy: ''
      };
      if (order.site === 'budget') card.site = 'budget'; // its email comes from the budget store
      return db.collection('giftCards').doc(code).set(card).then(function () {
        line.giftCode = code; line.giftIssuedAt = now;
        made.push({ code: code, line: line, card: card });
      });
    })).then(function () {
      return db.collection('orders').doc(order.id).update({ items: items });
    }).then(function () {
      order.items = items;
      return Promise.all(made.map(function (m) {
        if (!window.OrderEmails || !OrderEmails.sendGiftCard || !m.card.toEmail) return Promise.resolve(false);
        return OrderEmails.sendGiftCard(m.card, m.code).then(function (sent) {
          if (!sent) return false;
          m.line.giftEmailedAt = new Date().toISOString();
          return true;
        }).catch(function () { return false; });
      }));
    }).then(function (sent) {
      made.forEach(function (m, i) { m.emailed = !!sent[i]; });
      if (!made.some(function (m) { return m.emailed; })) return made;
      return db.collection('orders').doc(order.id).update({ items: order.items }).then(function () { return made; });
    });
  }

  // ADMIN. Voids an order's unredeemed gift cards (when the order is cancelled).
  function voidForOrder(db, order) {
    var codes = (order.items || []).filter(function (i) { return isGiftLine(i) && i.giftCode; }).map(function (i) { return i.giftCode; });
    return Promise.all(codes.map(function (code) {
      var ref = db.collection('giftCards').doc(code);
      return ref.get().then(function (d) {
        if (!d.exists || d.data().redeemedBy || d.data().void) return false;
        return ref.update({ void: true, voidedAt: new Date().toISOString() }).then(function () { return true; });
      });
    }));
  }

  // The text a buyer or the admin can send by hand.
  function shareText(card, code) {
    return (card.toName ? 'Hi ' + String(card.toName).split(' ')[0] + '! ' : '') + 'Here’s a ' + money(card.amountCents) + ' ' + (typeof Sites !== 'undefined' ? Sites.info(storeOf(card)).name : 'TXBioResearch') + ' gift card' +
      (card.from ? ' from ' + card.from : '') + '. Redeem it here (it goes into your store credit): ' + redeemUrl(code, card) + '  Code: ' + code;
  }

  return {
    makeCode: makeCode, normalize: normalize, redeemUrl: redeemUrl, money: money, redeem: redeem, drawCard: drawCard, CODE_RE: CODE_RE,
    SLUG: SLUG, MIN: MIN, MAX: MAX, isGiftLine: isGiftLine, lineFor: lineFor, issueForOrder: issueForOrder, voidForOrder: voidForOrder, shareText: shareText
  };
})();
