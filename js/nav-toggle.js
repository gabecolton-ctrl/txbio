// nav-toggle.js — mobile hamburger menu open/close
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.getElementById('nav-toggle-btn');
  var nav = document.querySelector('header nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', function () {
    nav.classList.toggle('nav-open');
  });
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
