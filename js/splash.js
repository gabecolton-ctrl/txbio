// splash.js — branded intro animation, shown once per browser session.
(function () {
  var SESSION_KEY = 'txbio_splash_shown';

  // Only show once per session — skip entirely on repeat page loads/navigations.
  if (sessionStorage.getItem(SESSION_KEY)) {
    var existing = document.getElementById('splash-screen');
    if (existing) existing.remove();
    return;
  }
  sessionStorage.setItem(SESSION_KEY, '1');

  function runSplashTimer() {
    var splash = document.getElementById('splash-screen');
    if (!splash) return;

    // Let the logo/text animate in, hold briefly, then fade the whole
    // overlay out and remove it from the DOM.
    setTimeout(function () {
      splash.classList.add('splash-fade-out');
      setTimeout(function () {
        splash.remove();
      }, 1000);
    }, 2000);
  }

  // If DOMContentLoaded has already fired by the time this script runs,
  // the listener below would never call back — so check readyState first
  // and run immediately in that case instead of waiting for an event that
  // has already happened.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runSplashTimer);
  } else {
    runSplashTimer();
  }
})();
