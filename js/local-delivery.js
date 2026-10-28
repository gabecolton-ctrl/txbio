// local-delivery.js — local pickup / drop-off, offered at checkout only to the
// customers the admin lists on Admin → Roles (localMembers/{email}).
// The price is set on that page too (settings/localDelivery { price }).
// Shared by checkout and the server checkout (copied to functions/).
var LocalDelivery = (function () {
  var VALUE = 'local';
  var DEFAULT_PRICE = 5;
  function priceOf(settings) {
    if (!settings || settings.price == null || settings.price === '') return DEFAULT_PRICE;
    var p = Number(settings.price);
    return p >= 0 && p <= 1000 ? Math.round(p * 100) / 100 : DEFAULT_PRICE;
  }
  function labelFor(price) {
    return 'Local pickup / drop-off — ' + (price === 0 ? 'FREE' : '$' + (price % 1 ? price.toFixed(2) : price));
  }
  return { VALUE: VALUE, DEFAULT_PRICE: DEFAULT_PRICE, priceOf: priceOf, labelFor: labelFor };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalDelivery;
