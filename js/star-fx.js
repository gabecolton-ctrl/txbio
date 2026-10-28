// star-fx.js — makes the home page star (.hero-mark svg) a live molecule:
// its nodes drift away from the cursor (or a tap) and spring back, with a
// faint idle wobble. Seasonal looks (e.g. Halloween) are set by splash.js
// as an html class; this adds their extras (bats). Off with reduced motion.
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init() {
    var svg = document.querySelector('.hero-mark > svg');
    if (!svg || reduce) return;
    var bond = svg.querySelector('.bond');
    var pts = (bond.getAttribute('d').match(/-?\d+(\.\d+)?\s+-?\d+(\.\d+)?/g) || []).map(function (p) {
      var xy = p.trim().split(/\s+/).map(Number); return { x: xy[0], y: xy[1] };
    });
    // One moving point per distinct vertex; circles follow the vertex they sit on.
    var verts = [], byKey = {};
    pts.forEach(function (p) {
      var k = p.x + ',' + p.y;
      if (!byKey[k]) { byKey[k] = { x: p.x, y: p.y, ox: 0, oy: 0, vx: 0, vy: 0, kx: 0, ky: 0, circles: [], seed: Math.random() * 6.28 }; verts.push(byKey[k]); }
    });
    svg.querySelectorAll('circle').forEach(function (c) {
      var v = byKey[c.getAttribute('cx') + ',' + c.getAttribute('cy')];
      if (v) v.circles.push(c);
    });

    var pointer = null, R = 150, PUSH = 48, running = false, visible = true, t0 = performance.now();
    function toSvg(x, y) {
      var m = svg.getScreenCTM(); if (!m) return null;
      var p = svg.createSVGPoint(); p.x = x; p.y = y;
      return p.matrixTransform(m.inverse());
    }
    function onMove(e) { if (e.pointerType === 'touch') return; pointer = toSvg(e.clientX, e.clientY); wake(); }
    function onLeave() { pointer = null; wake(); }
    // A tap (or click) gives the nodes a push away from that point.
    function poke(e) {
      var p = toSvg(e.clientX, e.clientY); if (!p) return;
      verts.forEach(function (v) {
        var dx = v.x - p.x, dy = v.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var f = Math.max(0, 1 - d / 280) * 24;
        v.vx += dx / d * f; v.vy += dy / d * f;
      });
      svg.classList.remove('is-poked'); void svg.getBoundingClientRect(); svg.classList.add('is-poked');
      wake();
    }

    function step(now) {
      var t = (now - t0) / 1000, energy = 0;
      verts.forEach(function (v) {
        var tx = Math.sin(t * 0.9 + v.seed) * 1.6, ty = Math.cos(t * 0.7 + v.seed * 1.3) * 1.6; // idle wobble
        if (pointer) {
          var dx = v.x - pointer.x, dy = v.y - pointer.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d < R) { var f = Math.pow(1 - d / R, 2) * PUSH; tx += dx / d * f; ty += dy / d * f; }
        }
        v.vx += (tx - v.ox) * 0.09; v.vy += (ty - v.oy) * 0.09;
        v.vx *= 0.82; v.vy *= 0.82;
        v.ox += v.vx; v.oy += v.vy;
        energy += Math.abs(v.vx) + Math.abs(v.vy);
        v.circles.forEach(function (c) { c.setAttribute('transform', 'translate(' + v.ox.toFixed(2) + ' ' + v.oy.toFixed(2) + ')'); });
      });
      bond.setAttribute('d', pts.map(function (p, i) {
        var v = byKey[p.x + ',' + p.y];
        return (i ? 'L' : 'M') + (p.x + v.ox).toFixed(2) + ' ' + (p.y + v.oy).toFixed(2);
      }).join(' '));
      if (visible && !document.hidden) requestAnimationFrame(step); else running = false;
    }
    function wake() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(step); } }

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    svg.addEventListener('pointerdown', poke);
    document.addEventListener('visibilitychange', wake);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; wake(); }).observe(svg);
    }
    svg.style.cursor = 'pointer';
    svg.style.webkitTapHighlightColor = 'transparent';
    wake();

    if (document.documentElement.classList.contains('season-halloween')) {
      addBats(svg.parentNode);
      halloweenEgg(svg, verts, wake);
    }
  }

  // ---------- Halloween easter egg: tap the star 3 times quickly ----------
  // The code must exist on Admin → Promo codes (31%, Any Order, last day Oct 31).
  var EGG = { code: 'SPOOKY31', pct: 31, through: 'October 31' };
  function halloweenEgg(svg, verts, wake) {
    var host = svg.parentNode;
    var hint = document.createElement('p');
    hint.className = 'egg-hint';
    hint.innerHTML = '🎃 Something\u2019s hiding in this star\u2026 <em>knock three times.</em>';
    host.appendChild(hint);
    var taps = [];
    svg.addEventListener('pointerdown', function () {
      var now = Date.now();
      taps = taps.filter(function (t) { return now - t < 1400; });
      taps.push(now);
      if (taps.length >= 3) { taps = []; reveal(); }
    });
    function reveal() {
      // Big burst + spin, more bats, then the prize.
      verts.forEach(function (v) { var a = Math.random() * 6.28; v.vx += Math.cos(a) * 30; v.vy += Math.sin(a) * 30; });
      wake();
      svg.classList.remove('egg-spin'); void svg.getBoundingClientRect(); svg.classList.add('egg-spin');
      for (var i = 0; i < 6; i++) {
        var b = host.querySelector('.bat-1').cloneNode(true);
        b.className = 'bat bat-swarm'; b.style.setProperty('--a', (i * 60 + Math.random() * 30) + 'deg'); b.style.animationDelay = (i * 0.05) + 's';
        host.appendChild(b);
        (function (el) { setTimeout(function () { el.remove(); }, 1800); })(b);
      }
      try { localStorage.setItem('txbio_egg_spooky', '1'); } catch (e) {}
      hint.innerHTML = '🎃 You found it!';
      setTimeout(showPrize, 700);
    }
    function showPrize() {
      if (document.getElementById('egg-prize')) return;
      var base = '';
      var box = document.createElement('div');
      box.id = 'egg-prize'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'egg-title');
      box.innerHTML = '<div class="egg-card">' +
        '<div class="egg-pumpkin" aria-hidden="true">🎃</div>' +
        '<h2 id="egg-title">You found the secret!</h2>' +
        '<p>Take <strong>' + EGG.pct + '% off everything</strong>, through ' + EGG.through + '.</p>' +
        '<div class="egg-code"><span>' + EGG.code + '</span><button type="button" class="btn-outline-light" id="egg-copy">Copy</button></div>' +
        '<div class="egg-actions"><a href="' + base + 'services.html" class="btn" id="egg-use">Shop with ' + EGG.code + '</a><button type="button" class="egg-close" id="egg-close">Maybe later</button></div>' +
        '<p class="egg-fine">Applied automatically at checkout. Doesn\u2019t combine with other codes or buy-one-get-one.</p>' +
      '</div>';
      document.body.appendChild(box);
      requestAnimationFrame(function () { box.classList.add('is-open'); });
      function close() { box.classList.remove('is-open'); setTimeout(function () { box.remove(); }, 300); }
      // Save the code so checkout applies it (same as a referral link, js/referral.js).
      function save() { try { localStorage.setItem('txbio_ref_code', JSON.stringify({ code: EGG.code, at: Date.now() })); } catch (e) {} }
      box.querySelector('#egg-use').addEventListener('click', save);
      box.querySelector('#egg-copy').addEventListener('click', function () {
        var b = this; save();
        var done = function () { b.textContent = 'Copied'; };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(EGG.code).then(done, done); else done();
      });
      box.querySelector('#egg-close').addEventListener('click', close);
      box.addEventListener('click', function (e) { if (e.target === box) close(); });
      document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
      box.querySelector('#egg-use').focus();
    }
  }

  // Halloween: a few bats fluttering around the star.
  function addBats(host) {
    var BAT = '<svg viewBox="0 0 64 32" aria-hidden="true"><g class="bat-body"><path class="wing wing-l" d="M32 14 C26 4 14 2 2 8 C8 10 10 14 9 18 C14 15 18 17 20 21 C23 17 28 16 32 18Z"/>' +
      '<path class="wing wing-r" d="M32 14 C38 4 50 2 62 8 C56 10 54 14 55 18 C50 15 46 17 44 21 C41 17 36 16 32 18Z"/>' +
      '<ellipse cx="32" cy="17" rx="4" ry="6"/><path d="M29 12 L30 8 L32 11 L34 8 L35 12Z"/></g></svg>';
    host.classList.add('has-bats');
    [1, 2, 3].forEach(function (n) {
      var b = document.createElement('span');
      b.className = 'bat bat-' + n; b.innerHTML = BAT;
      host.appendChild(b);
    });
  }

  function start() {
    // Wait until the star has finished drawing in (and the welcome screen is gone).
    var tries = 0;
    (function wait() {
      if (document.documentElement.classList.contains('hero-paused') && tries++ < 600) return setTimeout(wait, 200);
      setTimeout(init, document.documentElement.classList.contains('entry-open') ? 2600 : 2400);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
