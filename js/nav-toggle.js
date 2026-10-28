// nav-toggle.js — mobile hamburger menu open/close
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.getElementById('nav-toggle-btn');
  var nav = document.querySelector('header nav');
  if (!toggle || !nav) return;
  // The open menu fills the screen below the header and scrolls (css).
  function setHeaderHeight() {
    var h = document.querySelector('header');
    if (h) document.documentElement.style.setProperty('--header-h', Math.round(h.getBoundingClientRect().bottom) + 'px');
  }
  toggle.addEventListener('click', function () {
    setHeaderHeight();
    nav.classList.toggle('nav-open');
  });
  window.addEventListener('resize', function () { if (nav.classList.contains('nav-open')) setHeaderHeight(); });
});

// Admin dropdown: close when clicking elsewhere or pressing Escape.
document.addEventListener('click', function (e) {
  document.querySelectorAll('.nav-admin-menu details[open]').forEach(function (d) {
    if (!d.contains(e.target)) d.removeAttribute('open');
  });
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.nav-admin-menu details[open]').forEach(function (d) {
    d.removeAttribute('open');
    var s = d.querySelector('summary'); if (s) s.focus();
  });
});
