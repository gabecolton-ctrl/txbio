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
    publicKey: '',              // Account → General → Public Key
    serviceId: '',              // Email Services → your Private Email service → Service ID
    confirmationTemplateId: '', // Email Templates → "Order confirmation" → Template ID
    shippedTemplateId: ''       // Email Templates → "Order shipped" → Template ID
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

  function nextSteps(paymentMethod) {
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
        next_steps: nextSteps(order.paymentMethod)
      });
    }).then(function () { return true; });
  }

  // Shipped notice, sent when the admin marks an order shipped.
  function sendShipped(order, trackingNumber) {
    if (!isConfigured() || !order.userEmail) return Promise.resolve(false);
    return loadSdk().then(function (emailjs) {
      return emailjs.send(CONFIG.serviceId, CONFIG.shippedTemplateId, {
        to_email: order.userEmail,
        order_number: order.orderNumber || '',
        items: itemsText(order.items),
        shipping_address: addressText(order.shippingAddress) || 'the address on your order',
        tracking_number: trackingNumber || 'Not provided',
        tracking_line: trackingNumber ? 'Tracking number: ' + trackingNumber : 'We’ll send tracking details if they become available.'
      });
    }).then(function () { return true; });
  }

  return {
    isConfigured: isConfigured,
    sendConfirmation: sendConfirmation,
    sendShipped: sendShipped
  };
})();
