// Highlight the current page in the nav
document.addEventListener('DOMContentLoaded', function () {
  var path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(function (link) {
    var href = link.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
});

// A hello for anyone who opens the browser's developer console.
(function () {
  if (!window.console || window.__txbioHello) return;
  window.__txbioHello = true;
  var star = [
    '             @',
    '            / \\',
    '   @-------o   o-------O',
    '     \\               /',
    '       o     @     o',
    '      /   /     \\   \\',
    '     O /           \\ @'
  ].join('\n');
  try {
    console.log('%c' + star, 'color:#5eead4; font: 13px/1.25 ui-monospace, Menlo, Consolas, monospace;');
    console.log('%cTexas Advanced BioResearch', 'color:#e6efed; font: 600 16px Georgia, serif; padding-top:6px;');
    console.log('%cBuilt in Dallas. Curious mind? We like that.', 'color:#93a8a5; font: 13px system-ui, sans-serif;');
    console.log('%cSay hi → info@txbioresearch.com', 'color:#5eead4; font: 12px system-ui, sans-serif;');
  } catch (e) {}
})();
