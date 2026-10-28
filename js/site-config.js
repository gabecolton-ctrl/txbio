// site-config.js — site-wide switches.

// Server checkout: when true, checkout sends orders to the placeOrder Cloud
// Function (functions/), which prices them on the server. Turn on only after
// the function is deployed (see functions/README.md), then publish
// firestore.rules.server-checkout so browsers can no longer write orders,
// stock, promo usage, or credit directly.
var USE_SERVER_CHECKOUT = false;

// Automatic "shipped" (tools/shipment-tracker, run by GitHub every ~30 min):
// when true, saving a tracking number on Admin → Orders sets the order to
// "Label created", and the tracker marks it shipped and emails the buyer at
// UPS's first scan. Turn on only after the GitHub secrets are added (see
// tools/shipment-tracker/README.md); until then, mark orders shipped by hand.
var AUTO_SHIP_TRACKING = false;

// Bitcoin address shown at checkout and on My orders for unpaid Bitcoin orders.
var BTC_ADDRESS = '3LUok9839v13tLejLzaex4iucW3QeAaDU2';
