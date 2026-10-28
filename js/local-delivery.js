// local-delivery.js — local pickup / drop-off, offered at checkout only to the
// customers the admin lists on Admin → Roles (localMembers/{email}).
// Shared by checkout and the server checkout (copied to functions/).
var LocalDelivery = (function () {
  var VALUE = 'local';
  var PRICE = 5;
  var LABEL = 'Local pickup / drop-off — $5';
  return { VALUE: VALUE, PRICE: PRICE, LABEL: LABEL };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalDelivery;
