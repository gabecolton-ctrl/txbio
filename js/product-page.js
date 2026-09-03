// product-page.js -- wires the Add to Cart button on individual product pages.
// Expects window.THIS_PRODUCT.slug to be set, and PRODUCTS array from products.js loaded.
//
// The click listener is attached as soon as the DOM is ready, independent of
// auth/userReady timing -- this avoids a race where the button silently never
// becomes clickable if userReady fires at an unexpected moment. Auth state is
// checked fresh at the moment of the click instead.

document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('add-to-cart-btn');
  var qtyInput = document.getElementById('qty-input');
  var msg = document.getElementById('add-to-cart-msg');
  if (!btn || !window.THIS_PRODUCT || !window.PRODUCTS) return;

  var product = PRODUCTS.find(function (p) { return p.slug === THIS_PRODUCT.slug; });
  if (!product) return;

  btn.addEventListener('click', function () {
    var qty = parseInt(qtyInput.value, 10) || 1;
    btn.disabled = true;
    btn.textContent = 'Adding...';
    Cart.addItem(product, qty).then(function () {
      btn.disabled = false;
      btn.textContent = 'Add to Cart';
      msg.style.display = 'block';
      setTimeout(function () { msg.style.display = 'none'; }, 2500);
      return Cart.getItemCount();
    }).then(function (count) {
      var badge = document.getElementById('floating-cart-badge');
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
      }
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Add to Cart';
      alert('Could not add to cart: ' + (err.message || err));
    });
  });
});
