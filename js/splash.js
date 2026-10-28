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
          '<p class="entry-lead">This site sells research chemicals for laboratory use only. To continue, please confirm:</p>' +
          '<ul class="entry-list">' +
            '<li>I am <strong>21 years of age or older</strong>.</li>' +
            '<li>I am ordering <strong>on behalf of a laboratory or research institution, or for research purposes only</strong>, not for human or animal consumption.</li>' +
          '</ul>' +
          '<div class="entry-actions"><button type="button" class="btn" id="entry-yes">I confirm, enter site</button>' +
          '<a href="https://www.google.com" class="entry-leave" id="entry-no">Leave</a></div>' +
          '<p class="entry-fine">By entering you agree to our <a href="' + base + 'terms.html">Terms &amp; Conditions</a>.</p>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(gate, document.body.firstChild);
    document.documentElement.classList.add('entry-open');

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The star it will land on, hidden until it arrives.
    function target() {
      var hero = document.querySelector('.hero-mark svg');
      if (hero && hero.getBoundingClientRect().width > 0) return hero;
      var logo = document.querySelector('header .logo-icon');
      return logo && logo.getBoundingClientRect().width > 0 ? logo : null;
    }
    document.addEventListener('DOMContentLoaded', function () {
      var t = target(); if (t) t.classList.add('entry-target-hidden');
      var btn = document.getElementById('entry-yes');
      if (btn) btn.focus();
    });

    function finish() {
      document.documentElement.classList.remove('entry-open');
      gate.remove();
      document.querySelectorAll('.entry-target-hidden').forEach(function (el) { el.classList.remove('entry-target-hidden'); });
    }

    gate.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('#entry-yes')) return;
      try { localStorage.setItem(ENTRY_KEY, String(Date.now())); } catch (err) {}
      var star = gate.querySelector('.entry-mark svg');
      var t = target();
      gate.classList.add('is-leaving'); // fades the backdrop and text
      if (!t || !star || reduce) {
        if (t) t.classList.remove('entry-target-hidden');
        setTimeout(finish, reduce ? 250 : 600);
        return;
      }
      // Glide: pin the star where it is, then move/scale it onto the target.
      var from = star.getBoundingClientRect();
      if (t.scrollIntoView && t.getBoundingClientRect().bottom > window.innerHeight) window.scrollTo(0, 0);
      var to = t.getBoundingClientRect();
      var isLogo = t.tagName === 'IMG';
      // The logo icon's star fills ~80% of its tile; the hero svg matches 1:1.
      var tw = isLogo ? to.width * 0.86 : to.width, th = isLogo ? to.height * 0.8 : to.height;
      var tx = to.left + (to.width - tw) / 2, ty = to.top + (to.height - th) / 2;
      star.style.position = 'fixed';
      star.style.left = from.left + 'px'; star.style.top = from.top + 'px';
      star.style.width = from.width + 'px'; star.style.height = from.height + 'px';
      star.style.margin = '0'; star.style.zIndex = '10001';
      document.body.appendChild(star);
      star.classList.add('entry-flying');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          star.style.transform = 'translate(' + (tx - from.left) + 'px,' + (ty - from.top) + 'px) scale(' + (tw / from.width) + ',' + (th / from.height) + ')';
        });
      });
      setTimeout(function () {
        t.classList.remove('entry-target-hidden'); // crossfade: target in, flying star out
        star.classList.add('entry-landed');
        setTimeout(function () { star.remove(); finish(); }, 450);
      }, 950);
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
