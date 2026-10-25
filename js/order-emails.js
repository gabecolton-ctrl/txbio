// order-emails.js — buyer emails sent from your own address via EmailJS.
//
// EmailJS relays mail through the Namecheap Private Email mailbox you connect
// in its dashboard, so buyers get mail from orders@txbioresearch.com.
//
// Fill in the four values below from your EmailJS dashboard. They are meant to
// be public (EmailJS is built for browser use), so they're safe in this repo.
// The mailbox password is entered only in the EmailJS dashboard, never here.
//
// Until all four are filled in, isConfigured() returns false and the site
// keeps its previous behavior.

var OrderEmails = (function () {
  var CONFIG = {
    publicKey: 'mCHNzwcAKKJCasPJ9',              // Account → General → Public Key
    serviceId: 'service_l76oqmw',              // Email Services → your Private Email service → Service ID
    confirmationTemplateId: 'template_q8ez627', // Email Templates → "Order confirmation" → Template ID
    shippedTemplateId: 'template_r6zmcve',    // Email Templates → "Order shipped" → Template ID
    cancelledTemplateId: ''                   // Email Templates → "Order cancelled" → Template ID (needs a 3rd template)
  };

  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  var sdkPromise = null;

  function isConfigured() {
    return !!(CONFIG.publicKey && CONFIG.serviceId && CONFIG.confirmationTemplateId && CONFIG.shippedTemplateId);
  }

  function loadSdk() {
    if (window.emailjs) return Promise.resolve(window.emailjs);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SDK_URL;
      s.onload = function () {
        if (!window.emailjs) return reject(new Error('Email service failed to load.'));
        window.emailjs.init({ publicKey: CONFIG.publicKey });
        resolve(window.emailjs);
      };
      s.onerror = function () { sdkPromise = null; reject(new Error('Email service failed to load.')); };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  function money(n) {
    return '$' + Number(n || 0).toFixed(2);
  }

  function addressText(addr) {
    addr = addr || {};
    return [addr.addressLine1, addr.addressLine2,
      [addr.city, addr.state].filter(Boolean).join(', ') + ' ' + (addr.zip || '')]
      .map(function (s) { return (s || '').trim(); })
      .filter(Boolean).join(', ');
  }

  function itemsText(items) {
    return (items || []).map(function (item) {
      return item.name + ' (' + item.packSize + ') x' + item.qty + ' — ' + money(item.price * item.qty);
    }).join('\n');
  }

  // Link to the buyer's order on the website (orders.html scrolls to it).
  var SITE_URL = 'https://txbioresearch.com';
  function orderUrl(order) {
    return SITE_URL + '/orders.html' + (order.orderNumber ? '#order-' + order.orderNumber : '');
  }

  function nextSteps(paymentMethod, order) {
    if ((paymentMethod === 'venmo' || paymentMethod === 'cashapp') && order && order.paymentHandle) {
      var app = paymentMethod === 'venmo' ? 'Venmo' : 'Cash App';
      var to = (paymentMethod === 'venmo' ? '@' : '$') + order.paymentHandle;
      return 'Send $' + Number(order.total || 0).toFixed(2) + ' on ' + app + ' to ' + to + ' with "Order ' + (order.orderNumber || '') +
        '" as the note (nothing else in the note). We ship once it arrives.';
    }
    if (paymentMethod === 'bitcoin') {
      return 'Send payment to the Bitcoin address shown on your confirmation screen, then reply to this email with your transaction ID.';
    }
    if (paymentMethod === 'bank') {
      return 'Complete your bank transfer using the details shown on your confirmation screen, then reply to this email with your transfer confirmation.';
    }
    return 'Our team will email you shortly to confirm details and arrange payment.';
  }

  function discountsText(order) {
    var lines = [];
    if (order.discount > 0) {
      lines.push('Promo' + (order.promoCode ? ' (' + order.promoCode + ')' : '') + ': -' + money(order.discount));
    }
    if (order.bogoDiscount > 0) {
      lines.push('BOGO: -' + money(order.bogoDiscount));
    }
    if (order.creditUsed > 0) {
      lines.push('Store credit: -' + money(order.creditUsed));
    }
    return lines.join('\n') || 'None';
  }

  // Order confirmation, sent to the buyer right after checkout.
  function sendConfirmation(order, toEmail) {
    if (!isConfigured() || !toEmail) return Promise.resolve(false);
    return loadSdk().then(function (emailjs) {
      return emailjs.send(CONFIG.serviceId, CONFIG.confirmationTemplateId, {
        to_email: toEmail,
        order_number: order.orderNumber || '',
        items: itemsText(order.items),
        subtotal: money(order.subtotal),
        shipping: money(order.shipping),
        shipping_option: order.shippingOption || '',
        discounts: discountsText(order),
        tax: money(order.tax),
        total: money(order.total),
        shipping_address: addressText(order.shippingAddress) || 'Not provided',
        payment_method: order.paymentMethod || '',
        next_steps: nextSteps(order.paymentMethod, order) + '\n\nView your order anytime: ' + orderUrl(order),
        order_url: orderUrl(order)
      });
    }).then(function () { return true; });
  }

  // Shipped notice. The admin page sends it from the browser when an order is
  // marked shipped; tools/shipment-tracker sends the same email through the
  // EmailJS REST API when UPS first scans the package.
  function shippedParams(order, trackingNumber) {
    return {
      to_email: order.userEmail,
      order_number: order.orderNumber || '',
      items: itemsText(order.items),
      shipping_address: addressText(order.shippingAddress) || 'the address on your order',
      tracking_number: trackingNumber || 'Not provided',
      tracking_line: (trackingNumber ? 'Tracking number: ' + trackingNumber : 'We’ll send tracking details if they become available.') +
        '\n\nView your order: ' + orderUrl(order),
      order_url: orderUrl(order)
    };
  }

  function sendShipped(order, trackingNumber) {
    if (!isConfigured() || !order.userEmail) return Promise.resolve(false);
    return loadSdk().then(function (emailjs) {
      return emailjs.send(CONFIG.serviceId, CONFIG.shippedTemplateId, shippedParams(order, trackingNumber));
    }).then(function () { return true; });
  }

  // Cancellation notice, sent when the admin cancels an order.
  function canSendCancelled() {
    return isConfigured() && !!CONFIG.cancelledTemplateId;
  }

  function sendCancelled(order, reason) {
    if (!canSendCancelled() || !order.userEmail) return Promise.resolve(false);
    return loadSdk().then(function (emailjs) {
      return emailjs.send(CONFIG.serviceId, CONFIG.cancelledTemplateId, {
        to_email: order.userEmail,
        order_number: order.orderNumber || '',
        items: itemsText(order.items),
        total: money(order.total),
        payment_method: order.paymentMethod || '',
        reason_line: reason ? 'Reason: ' + reason : 'If you have questions about this cancellation, reply to this email.',
        refund_line: 'If you already sent payment for this order, reply to this email and we\u2019ll arrange your refund.'
      });
    }).then(function () { return true; });
  }

  return {
    isConfigured: isConfigured,
    canSendCancelled: canSendCancelled,
    sendCancelled: sendCancelled,
    sendConfirmation: sendConfirmation,
    sendShipped: sendShipped,
    shippedParams: shippedParams,
    CONFIG: CONFIG
  };
})();

// Lets tools/shipment-tracker (Node) reuse the same email content and IDs.
if (typeof module !== 'undefined' && module.exports) module.exports = OrderEmails;
