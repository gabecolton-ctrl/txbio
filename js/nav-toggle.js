// nav-toggle.js — mobile hamburger menu open/close
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.getElementById('nav-toggle-btn');
  var nav = document.querySelector('header nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', function () {
    nav.classList.toggle('nav-open');
  });
});
