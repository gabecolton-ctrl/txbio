// splash.js -- branded intro animation, shown once per browser session.
(function () {
  var SESSION_KEY = 'txbio_splash_shown';

  // Only show once per session -- skip entirely on repeat page loads/navigations.
  if (sessionStorage.getItem(SESSION_KEY)) {
    var existing = document.getElementById('splash-screen');
    if (existing) existing.remove();
    return;
  }
  sessionStorage.setItem(SESSION_KEY, '1');

  function runSplashTimer() {
    var splash = document.getElementById('splash-screen');
    if (!splash) return;

    setTimeout(function () {
      splash.classList.add('splash-fade-out');
      setTimeout(function () {
        splash.remove();
      }, 1000);
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runSplashTimer);
  } else {
    runSplashTimer();
  }
})();
