// star-fx.js — makes the home page star (.hero-mark svg) a live molecule:
// its nodes drift away from the cursor (or a tap) and spring back, with a
// faint idle wobble. Seasonal looks (Halloween, Thanksgiving, Black Friday)
// are set by splash.js as an html class; this adds their extras (bats,
// falling leaves) and the tap-three-times easter egg. Off with reduced motion.
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

    var season = seasonNow();
    if (season === 'halloween' && !svg.parentNode.classList.contains('has-bats')) addBats(svg.parentNode);
    if (EGGS[season]) seasonEgg(svg, verts, wake, EGGS[season], season);
  }

  function seasonNow() {
    var c = document.documentElement.classList;
    return c.contains('season-halloween') ? 'halloween' : c.contains('season-blackfriday') ? 'blackfriday' : c.contains('season-thanksgiving') ? 'thanksgiving' : '';
  }

  // ---------- Seasonal easter eggs: tap the star 3 times quickly ----------
  // Each code must exist on Admin → Promo codes (Any Order, Once per customer,
  // last day as below), or checkout quietly drops it.
  var EGGS = {
    halloween: { code: 'SPOOKY31', pct: 31, through: 'October 31', icon: '🎃', title: 'You found the secret!',
      hint: '🎃 Something\u2019s hiding in this star\u2026 <em>knock three times.</em>', found: '🎃 You found it!', key: 'txbio_egg_spooky' },
    thanksgiving: { code: 'THANKS20', pct: 20, through: 'Thanksgiving (November 26)', icon: '🍂', title: 'You shook one loose!',
      hint: '🍂 This star\u2019s still holding on to a leaf\u2026 <em>give it a little shake.</em>', found: '🍂 Thanks for shaking!', key: 'txbio_egg_thanks', autumn: true },
    blackfriday: { code: 'FRIDAY25', pct: 25, through: 'Cyber Monday (November 30)', icon: '🍁', title: 'Turned over a new leaf!',
      hint: '🍁 Black Friday\u2026 <em>shake the star again.</em>', found: '🍁 There it is!', key: 'txbio_egg_friday', autumn: true }
  };
  function seasonEgg(svg, verts, wake, EGG, season) {
    var host = svg.parentNode;
    var hint = document.createElement('p');
    hint.className = 'egg-hint';
    hint.innerHTML = EGG.hint;
    host.appendChild(hint);
    var taps = [];
    svg.addEventListener('pointerdown', function () {
      var now = Date.now();
      taps = taps.filter(function (t) { return now - t < 1400; });
      taps.push(now);
      if (EGG.autumn && window.__txbioLeafBurst) window.__txbioLeafBurst(3);
      if (taps.length >= 3) { taps = []; reveal(); }
    });
    function reveal() {
      verts.forEach(function (v) { var a = Math.random() * 6.28; v.vx += Math.cos(a) * 30; v.vy += Math.sin(a) * 30; });
      wake();
      if (EGG.autumn) {
        svg.classList.remove('egg-shake'); void svg.getBoundingClientRect(); svg.classList.add('egg-shake');
        if (window.__txbioLeafBurst) window.__txbioLeafBurst(14);
        if (window.__txbioGoldLeaf) window.__txbioGoldLeaf();
      } else {
        svg.classList.remove('egg-spin'); void svg.getBoundingClientRect(); svg.classList.add('egg-spin');
        for (var i = 0; i < 6; i++) {
          var b = host.querySelector('.bat-1').cloneNode(true);
          b.className = 'bat bat-swarm'; b.style.setProperty('--a', (i * 60 + Math.random() * 30) + 'deg'); b.style.animationDelay = (i * 0.05) + 's';
          host.appendChild(b);
          (function (el) { setTimeout(function () { el.remove(); }, 1800); })(b);
        }
      }
      try { localStorage.setItem(EGG.key, '1'); } catch (e) {}
      hint.innerHTML = EGG.found;
      setTimeout(showPrize, EGG.autumn ? 1300 : 700);
    }
    function showPrize() {
      if (document.getElementById('egg-prize')) return;
      var box = document.createElement('div');
      box.id = 'egg-prize'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'egg-title');
      if (EGG.autumn) box.className = 'egg-autumn';
      box.innerHTML = '<div class="egg-card">' +
        '<div class="egg-pumpkin" aria-hidden="true">' + EGG.icon + '</div>' +
        '<h2 id="egg-title">' + EGG.title + '</h2>' +
        '<p>Take <strong>' + EGG.pct + '% off everything</strong>, through ' + EGG.through + '.</p>' +
        '<div class="egg-code"><span>' + EGG.code + '</span><button type="button" class="btn-outline-light" id="egg-copy">Copy</button></div>' +
        '<div class="egg-actions"><a href="services.html" class="btn" id="egg-use">Shop with ' + EGG.code + '</a><button type="button" class="egg-close" id="egg-close">Maybe later</button></div>' +
        '<p class="egg-fine">Applied automatically at checkout. One use per customer; doesn\u2019t combine with other codes or buy-one-get-one.</p>' +
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

  // ---------- Autumn: leaves drifting down around the star ----------
  // They sway as they fall, scatter away from the cursor, and a tap on the star
  // shakes more loose. Drawn with a small physics loop (no images).
  var LEAF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 L13.6 5.2 L16.8 3.6 L16 8 L20.5 7 L18.6 10.8 L22 12 L17.6 14.2 L18.6 17.4 L13.4 15.8 L12.8 20.5 L11.2 20.5 L10.6 15.8 L5.4 17.4 L6.4 14.2 L2 12 L5.4 10.8 L3.5 7 L8 8 L7.2 3.6 L10.4 5.2 Z"/><path class="leaf-stem" d="M12 15 L12 23.5"/></svg>';
  var LEAF_COLORS = ['#d9622b', '#e8a23a', '#b8391f', '#f2c14e', '#c4512a', '#a8471c'];
  function addLeaves(host) {
    if (host.classList.contains('has-leaves')) return;
    host.classList.add('has-leaves');
    var leaves = [], pointer = null, last = performance.now();
    function W() { return host.clientWidth || 300; }
    function H() { return host.clientHeight || 300; }
    function make(opts) {
      var el = document.createElement('span');
      el.className = 'leaf' + (opts.gold ? ' leaf-gold' : '');
      el.innerHTML = LEAF;
      el.style.color = opts.gold ? '#f6c544' : LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)];
      var size = opts.gold ? 40 : 14 + Math.random() * 14;
      el.style.width = el.style.height = size + 'px';
      host.appendChild(el);
      var l = { el: el, size: size, x: opts.x, y: opts.y, vx: opts.vx || 0, vy: opts.vy || 0, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 2,
        phase: Math.random() * 6.28, fall: 0.35 + Math.random() * 0.45, temp: !!opts.temp, gold: !!opts.gold, born: performance.now() };
      leaves.push(l);
      return l;
    }
    for (var i = 0; i < 9; i++) make({ x: Math.random() * W(), y: -40 - Math.random() * H() });
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var r = host.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    }, { passive: true });
    document.addEventListener('pointerleave', function () { pointer = null; });
    // A shake: leaves pop out from the star and flutter down.
    window.__txbioLeafBurst = function (n) {
      for (var k = 0; k < n; k++) {
        var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = 2.5 + Math.random() * 3.5;
        make({ x: W() / 2, y: H() * 0.45, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, temp: true });
      }
    };
    // The golden leaf with the code drifts down the middle.
    window.__txbioGoldLeaf = function () { make({ x: W() / 2 - 20, y: -50, vy: 1.2, temp: true, gold: true }); };
    function step(now) {
      var dt = Math.min(3, (now - last) / 16.7); last = now;
      var w = W(), h = H(), t = now / 1000;
      for (var j = leaves.length - 1; j >= 0; j--) {
        var l = leaves[j];
        if (l.temp) { l.vy += 0.06 * dt; if (l.vy > l.fall * 2.4) l.vy = l.fall * 2.4; }
        else l.vy += (l.fall - l.vy) * 0.05 * dt;
        var sway = Math.sin(t * 1.3 + l.phase) * 0.7;
        if (pointer) {
          var dx = l.x - pointer.x, dy = l.y - pointer.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d < 110) { var f = (1 - d / 110) * 1.4; l.vx += dx / d * f * dt; l.vy += dy / d * f * 0.6 * dt; l.vr += (dx > 0 ? 1 : -1) * f; }
        }
        l.vx *= Math.pow(0.94, dt); l.vr *= Math.pow(0.97, dt);
        l.x += (l.vx + sway) * dt; l.y += l.vy * dt; l.rot += (l.vr + sway * 1.5) * dt;
        var fade = l.y > h - 40 ? Math.max(0, (h + 10 - l.y) / 50) : 1;
        l.el.style.opacity = (l.gold ? 1 : 0.85) * fade;
        l.el.style.transform = 'translate(' + l.x.toFixed(1) + 'px,' + l.y.toFixed(1) + 'px) rotate(' + l.rot.toFixed(1) + 'deg)';
        if (l.y > h + 20 || l.x < -60 || l.x > w + 60) {
          if (l.temp) { l.el.remove(); leaves.splice(j, 1); }
          else { l.x = Math.random() * w; l.y = -30; l.vx = 0; l.vy = l.fall; }
        }
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
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
      // Bats come out right away; the star's physics wait for it to finish drawing in.
      var svg = document.querySelector('.hero-mark > svg');
      var motionOk = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (svg && document.documentElement.classList.contains('season-halloween') && motionOk) {
        setTimeout(function () { if (!svg.parentNode.classList.contains('has-bats')) addBats(svg.parentNode); }, 500);
      }
      if (svg && document.documentElement.classList.contains('season-autumn') && motionOk) {
        setTimeout(function () { addLeaves(svg.parentNode); }, 400);
      }
      setTimeout(init, document.documentElement.classList.contains('entry-open') ? 2600 : 2400);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
