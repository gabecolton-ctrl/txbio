// bogo-badges.js — shows which products are buy-one-get-one, using the same
// on/off list as checkout (Firestore bogoProducts, managed on admin-bogo.html).
//   Catalog: a "BOGO" badge on each eligible product card, plus a
//            "Buy one, get one" filter chip.
//   Product page: a badge by the title and a note explaining how it applies.
// Needs bogo.js loaded first; runs after sign-in (auth-guard's userReady).

(function () {
  function productSlugFromHref(href) {
    var m = String(href || '').match(/products\/([^/?#]+)\.html/);
    return m ? m[1] : null;
  }

  function badge() {
    var b = document.createElement('span');
    b.className = 'bogo-badge';
    b.textContent = 'BOGO';
    b.title = 'Buy one, get one free';
    return b;
  }

  function decorateCatalog(eligible) {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.product-card'));
    var count = 0;
    cards.forEach(function (card) {
      var link = card.querySelector('a.product-card-link');
      var slug = link && productSlugFromHref(link.getAttribute('href'));
      if (!slug || eligible.indexOf(slug) === -1) return;
      count++;
      card.classList.add('is-bogo');
      var top = card.querySelector('.product-card-top');
      if (top && !top.querySelector('.bogo-badge')) top.appendChild(badge());
      var price = card.querySelector('.product-card-price');
      if (price && !card.querySelector('.bogo-card-note')) {
        var note = document.createElement('p');
        note.className = 'bogo-card-note';
        note.textContent = 'Buy one, get one free';
        price.parentNode.insertBefore(note, price.nextSibling);
      }
    });
    if (!count) return;

    // Filter chip in the category bar: show only BOGO products.
    var nav = document.querySelector('.category-nav');
    if (!nav || nav.querySelector('.bogo-filter')) return;
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'category-nav-link bogo-filter';
    chip.setAttribute('aria-pressed', 'false');
    chip.textContent = 'Buy one, get one (' + count + ')';
    nav.insertBefore(chip, nav.firstChild);
    chip.addEventListener('click', function () {
      var on = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      document.body.classList.toggle('bogo-only', on);
      if (on) {
        var first = document.querySelector('.product-card.is-bogo');
        var section = first && first.closest('section');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  function decorateProductPage(eligible) {
    if (!window.THIS_PRODUCT || eligible.indexOf(THIS_PRODUCT.slug) === -1) return;
    var h1 = document.querySelector('.product-info h1');
    if (h1 && !h1.querySelector('.bogo-badge')) h1.appendChild(badge());
    var subtitle = document.querySelector('.product-info .product-subtitle');
    if (subtitle && !document.querySelector('.bogo-product-note')) {
      var note = document.createElement('p');
      note.className = 'bogo-product-note';
      note.innerHTML = '<strong>Buy one, get one free.</strong> Add 2 single vials of the same ' +
        (document.getElementById('dose-select') ? 'dose' : 'product') +
        ' and one is free at checkout. Doesn’t apply to cases.';
      subtitle.parentNode.insertBefore(note, subtitle.nextSibling);
    }
  }

  // Signed-in visitors (userReady) and, on public pages, signed-out ones (guestReady).
  function start() {
    if (!window.Bogo) return;
    // Family accounts don't get BOGO (they pay at cost), so wait for the
    // family-pricing check before drawing any badges (js/family-pricing.js).
    var familyCheck = window.FamilyPricing ? FamilyPricing.ready() : Promise.resolve(null);
    familyCheck.then(function (family) {
      if (family) return null;
      return Bogo.getEligibleSlugs();
    }).then(function (eligible) {
      if (!eligible || !eligible.length) return;
      decorateCatalog(eligible);
      decorateProductPage(eligible);
    }).catch(function (err) {
      console.error('Could not load BOGO products:', err);
    });
  }
  document.addEventListener('userReady', start);
  document.addEventListener('guestReady', start);
})();
