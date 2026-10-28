// splash.js — the welcome screen, on every page (loaded at the top of <body>).
//
// First visit (or after 30 days): an age / research-use confirmation over the
// animated star mark. On "I confirm", the star glides into the star on the
// home page (or the header logo on other pages) and the page appears.
// Already confirmed: the short branded intro, once per browser session.
(function () {
  var SESSION_KEY = 'txbio_splash_shown';
  var ENTRY_KEY = 'txbio_entry_ok';
  var ENTRY_DAYS = 30;

  function entryOk() {
    try {
      var t = Number(localStorage.getItem(ENTRY_KEY));
      return t && Date.now() - t < ENTRY_DAYS * 864e5;
    } catch (e) { return true; } // storage blocked: don't trap the visitor
  }

  var STAR = '<svg viewBox="0 0 400 370" aria-hidden="true">' +
    '<path class="bond" pathLength="100" d="M200 55 L233 155 L335 155 L253 215 L284 315 L200 255 L116 315 L145 215 L63 155 L166 155 L200 55"/>' +
    '<circle class="halo" cx="200" cy="55" r="46"/><circle class="halo" cx="63" cy="155" r="46"/><circle class="halo" cx="284" cy="315" r="46"/>' +
    '<circle class="node" cx="200" cy="55" r="28" style="animation-delay:.9s"/><circle class="node" cx="63" cy="155" r="28" style="animation-delay:1.02s"/>' +
    '<circle class="node" cx="284" cy="315" r="28" style="animation-delay:1.14s"/><circle class="node" cx="200" cy="255" r="20" style="animation-delay:1.26s"/>' +
    '<circle class="ring" cx="335" cy="155" r="27" style="animation-delay:1.38s"/><circle class="ring" cx="116" cy="315" r="27" style="animation-delay:1.5s"/>' +
    '<circle class="ring" cx="166" cy="155" r="17" style="animation-delay:1.62s"/><circle class="ring" cx="233" cy="155" r="17" style="animation-delay:1.74s"/>' +
    '<circle class="ring" cx="145" cy="215" r="17" style="animation-delay:1.86s"/><circle class="ring" cx="253" cy="215" r="17" style="animation-delay:1.98s"/></svg>';

  // ---------- Entry confirmation ----------
  if (!entryOk()) {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
    var oldSplash = document.getElementById('splash-screen');
    if (oldSplash) oldSplash.remove();
    var base = /\/products\//.test(location.pathname) ? '../' : '';
    var gate = document.createElement('div');
    gate.id = 'entry-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'entry-title');
    gate.innerHTML =
      '<div class="entry-inner">' +
        '<div class="entry-mark">' + STAR + '</div>' +
        '<div class="entry-copy">' +
          '<h2 id="entry-title">Texas Advanced BioResearch</h2>' +
          '<p class="entry-lead">This site sells research chemicals for laboratory use only. To continue, check both boxes:</p>' +
          '<div class="entry-checks">' +
            '<label class="entry-check"><input type="checkbox" id="entry-age"><span class="entry-box" aria-hidden="true"></span>' +
              '<span>I am <strong>21 years of age or older</strong>.</span></label>' +
            '<label class="entry-check"><input type="checkbox" id="entry-research"><span class="entry-box" aria-hidden="true"></span>' +
              '<span>I am ordering <strong>on behalf of a laboratory or research institution, or for research purposes only</strong>, not for human or animal consumption.</span></label>' +
          '</div>' +
          '<div class="entry-actions"><button type="button" class="btn" id="entry-yes" disabled aria-disabled="true">I confirm, enter site</button>' +
          '<a href="https://www.google.com" class="entry-leave" id="entry-no">Leave</a></div>' +
          '<p class="entry-fine">By entering you agree to our <a href="' + base + 'terms.html">Terms &amp; Conditions</a>.</p>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(gate, document.body.firstChild);
    document.documentElement.classList.add('entry-open');

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The home page star waits (paused at the very start of its draw-in)
    // until the visitor confirms, then plays as the welcome star shrinks away.
    document.documentElement.classList.add('hero-paused');
    // Confirm unlocks only when both boxes are ticked.
    var boxes = gate.querySelectorAll('.entry-check input');
    var yes = gate.querySelector('#entry-yes');
    function sync() {
      var all = Array.prototype.every.call(boxes, function (b) { return b.checked; });
      yes.disabled = !all; yes.setAttribute('aria-disabled', all ? 'false' : 'true');
      Array.prototype.forEach.call(boxes, function (b) { b.closest('.entry-check').classList.toggle('is-on', b.checked); });
    }
    Array.prototype.forEach.call(boxes, function (b) { b.addEventListener('change', sync); });
    document.addEventListener('DOMContentLoaded', function () { if (boxes[0]) boxes[0].focus(); });

    function finish() {
      document.documentElement.classList.remove('entry-open');
      gate.remove();
    }

    gate.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('#entry-yes') || yes.disabled) return;
      try { localStorage.setItem(ENTRY_KEY, String(Date.now())); } catch (err) {}
      var star = gate.querySelector('.entry-mark svg');
      var hero = document.querySelector('.hero-mark svg');
      if (hero && hero.getBoundingClientRect().width === 0) hero = null;
      gate.classList.add('is-leaving'); // text and backdrop fade
      if (reduce || !star) {
        document.documentElement.classList.remove('hero-paused');
        setTimeout(finish, 300);
        return;
      }
      if (hero && hero.getBoundingClientRect().bottom > window.innerHeight) window.scrollTo(0, 0);
      // Shrink the star into the centre of where the home page star sits
      // (or in place on other pages), fading as it goes.
      var from = star.getBoundingClientRect();
      var dx = 0, dy = 0;
      if (hero) {
        var to = hero.getBoundingClientRect();
        dx = (to.left + to.width / 2) - (from.left + from.width / 2);
        dy = (to.top + to.height * 0.52) - (from.top + from.height * 0.52);
      }
      star.classList.add('entry-shrinking');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          star.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(-30deg) scale(0.04)';
          star.style.opacity = '0';
        });
      });
      // As it vanishes, the home page star starts drawing itself in.
      setTimeout(function () { document.documentElement.classList.remove('hero-paused'); }, 280);
      setTimeout(finish, 900);
    });
    return;
  }

  // ---------- Returning visitor: short branded intro, once per session ----------
  var seen = false;
  try { seen = !!sessionStorage.getItem(SESSION_KEY); } catch (e) { seen = true; }
  if (seen) {
    var existing = document.getElementById('splash-screen');
    if (existing) existing.remove();
    return;
  }
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}

  function runSplashTimer() {
    var splash = document.getElementById('splash-screen');
    if (!splash) return;
    setTimeout(function () {
      splash.classList.add('splash-fade-out');
      setTimeout(function () { splash.remove(); }, 1000);
    }, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runSplashTimer);
  else runSplashTimer();
})();
