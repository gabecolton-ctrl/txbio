// favorites-page.js — favorites.html: saved products with a size picker,
// Add to cart, and Remove. Family accounts see their price.
(function () {
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var catalog = null;
  function money(n) { return window.FamilyPricing ? FamilyPricing.money(n) : '$' + n; }
  function priceOf(slug, list) { return window.FamilyPricing && FamilyPricing.active() ? FamilyPricing.price(slug, list) : list; }
  function sizes(slug) {
    var p = catalog[slug];
    if (!p) return [];
    return p.doses
      ? Object.keys(p.doses).map(function (k) { var d = p.doses[k]; return { slug: k, label: d.label, price: d.price, packSize: d.packSize || ('1 vial x ' + d.label) }; })
      : [{ slug: slug, label: (String(p.packSize).match(/x\s*(.+)$/) || [])[1] || '', price: p.price, packSize: p.packSize }];
  }
  function render(list) {
    $('fav-loading').style.display = 'none';
    var items = list.filter(function (s) { return catalog[s]; });
    $('fav-empty').style.display = items.length ? 'none' : '';
    $('fav-grid').innerHTML = items.map(function (slug) {
      var p = catalog[slug], opts = sizes(slug);
      return '<div class="fav-item" data-item="' + esc(slug) + '">' +
        '<a href="products/' + esc(slug) + '.html"><img src="images/product-labels/' + esc(slug) + '.webp" alt="" loading="lazy"></a>' +
        '<div class="fav-item-body"><h3><a href="products/' + esc(slug) + '.html">' + esc(p.name) + '</a></h3>' +
        (opts.length > 1
          ? '<select class="fav-size" aria-label="Size">' + opts.map(function (o, i) { return '<option value="' + i + '">' + esc(o.label) + ' — ' + money(priceOf(o.slug, o.price)) + '</option>'; }).join('') + '</select>'
          : '<p class="fav-one">' + esc(opts[0] ? opts[0].label : '') + ' — ' + money(priceOf(opts[0].slug, opts[0].price)) + '</p>') +
        '<div class="fav-item-actions"><button type="button" class="btn fav-add">Add to cart</button><button type="button" class="fav-remove">Remove</button></div>' +
        '<p class="fav-added" role="status"></p></div></div>';
    }).join('');
    document.querySelectorAll('.fav-item').forEach(function (el) {
      var slug = el.getAttribute('data-item'), opts = sizes(slug);
      el.querySelector('.fav-remove').addEventListener('click', function () {
        Favorites.toggle(slug).then(function () { el.remove(); if (!document.querySelector('.fav-item')) $('fav-empty').style.display = ''; });
      });
      el.querySelector('.fav-add').addEventListener('click', function () {
        var sel = el.querySelector('.fav-size'), o = opts[sel ? Number(sel.value) : 0], btn = this;
        btn.disabled = true; btn.textContent = 'Adding…';
        Cart.addItem({ slug: o.slug, name: catalog[slug].name, packSize: o.packSize, price: o.price }, 1).then(function () {
          el.querySelector('.fav-added').textContent = 'Added to your cart.';
          return Cart.getItemCount();
        }).then(function (count) {
          var badge = $('floating-cart-badge');
          if (badge && typeof count === 'number') { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
        }).catch(function (err) { el.querySelector('.fav-added').textContent = 'Could not add: ' + err.message; })
          .then(function () { btn.disabled = false; btn.textContent = 'Add to cart'; });
      });
    });
  }
  document.addEventListener('userReady', function () {
    Promise.all([
      fetch('functions/catalog.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
      Favorites.ready(),
      window.FamilyPricing ? FamilyPricing.ready() : null
    ]).then(function (r) { catalog = r[0].products; render(r[1]); })
      .catch(function (err) { $('fav-loading').textContent = 'Could not load favorites: ' + err.message; });
  });
})();
