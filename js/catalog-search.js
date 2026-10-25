// catalog-search.js — search box on the catalog (services.html).
// Matches product names, other names, compound types and blend contents
// (js/product-search.js), plus the category heading. Ignores spaces, dashes
// and case, so "bpc157", "BPC 157" and "bpc-157" all find BPC-157.
(function () {
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9α-ωβ]+/g, '');
  }
  function slugOf(card) {
    var a = card.querySelector('a.product-card-link');
    var m = a && String(a.getAttribute('href')).match(/products\/([^/?#]+)\.html/);
    return m ? m[1] : '';
  }

  function init() {
    var nav = document.querySelector('.category-nav');
    if (!nav) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll('.product-card'));
    var extra = window.PRODUCT_SEARCH || {};
    var index = cards.map(function (card) {
      var section = card.closest('section');
      var h2 = section && section.querySelector('h2');
      var text = [card.textContent, extra[slugOf(card)], h2 && h2.textContent].join(' ');
      // Each word of the search must appear somewhere; match on separate words
      // (case/space-insensitive) and on the whole string squashed together.
      return { card: card, section: section, flat: norm(text) };
    });
    var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'))
      .filter(function (s) { return s.querySelector('.product-card'); });

    var wrap = document.createElement('div');
    wrap.className = 'catalog-search';
    wrap.innerHTML =
      '<label for="catalog-search-input" class="sr-only">Search the catalog</label>' +
      '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      '<input type="search" id="catalog-search-input" placeholder="Search products, e.g. BPC-157, GLP-1, copper peptide" autocomplete="off" spellcheck="false">' +
      '<p class="catalog-search-status" id="catalog-search-status" aria-live="polite"></p>';
    nav.parentNode.insertBefore(wrap, nav);
    var input = wrap.querySelector('input');
    var status = wrap.querySelector('.catalog-search-status');
    var empty = document.createElement('p');
    empty.className = 'catalog-search-empty';
    empty.style.display = 'none';
    sections[0].parentNode.insertBefore(empty, sections[0]);

    function run() {
      var q = input.value.trim();
      var terms = q.toLowerCase().split(/\s+/).map(norm).filter(Boolean);
      var whole = norm(q);
      document.body.classList.toggle('catalog-searching', !!terms.length);
      var shown = 0;
      index.forEach(function (it) {
        var hit = !terms.length || it.flat.indexOf(whole) !== -1 ||
          terms.every(function (t) { return it.flat.indexOf(t) !== -1; });
        it.card.classList.toggle('search-hide', !hit);
        if (hit) shown++;
      });
      sections.forEach(function (s) {
        var any = s.querySelector('.product-card:not(.search-hide)');
        s.classList.toggle('search-hide', !any);
      });
      if (!terms.length) {
        status.textContent = '';
        empty.style.display = 'none';
      } else if (!shown) {
        status.textContent = '';
        empty.style.display = '';
        empty.innerHTML = 'No products match “' + q.replace(/[&<>"]/g, '') + '”. Try another name, or <a href="contact.html">ask us</a> if you’re looking for something we don’t list.';
      } else {
        empty.style.display = 'none';
        status.textContent = shown + (shown === 1 ? ' product' : ' products') + ' found';
      }
    }
    input.addEventListener('input', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; run(); }
    });
    // "/" focuses the search, like many stores.
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== input && !/input|textarea|select/i.test(document.activeElement.tagName)) {
        e.preventDefault(); input.focus();
      }
    });
    var params = new URLSearchParams(location.search);
    if (params.get('q')) { input.value = params.get('q'); run(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
