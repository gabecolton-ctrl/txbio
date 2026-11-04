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
    cancelledTemplateId: '',                  // Email Templates → "Order cancelled" → Template ID (needs a 3rd template)
    deliveredTemplateId: '',                  // Email Templates → "Order delivered" → Template ID (sent by the tracker when the carrier delivers)
    giftCardTemplateId: '',                   // Email Templates → "Gift card" → Template ID (emails a bought gift card to the friend)
    cartReminderTemplateId: ''                // Email Templates → "Cart reminder" → Template ID (hourly job, tools/shipment-tracker/cart-reminders.js)
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

  // Buyer emails don't name products: peptide and compound names are strong
  // spam triggers (Outlook in particular junks them), so the email gives the
  // count and total and links to My orders for the details.
  function itemsText(items) {
    var lines = (items || []).length;
    var units = (items || []).reduce(function (n, item) {
      return n + (Number(item.qty) || 0) * (item.caseOf ? Number(item.caseOf) : 1);
    }, 0);
    if (!lines) return '';
    return lines + (lines === 1 ? ' item' : ' items') + (units !== lines ? ' (' + units + ' units)' : '') +
      '. See the full list in your account under My orders.';
  }

  // Link to the buyer's order on the website (orders.html scrolls to it).
  var SITE_URL = 'https://txbioresearch.com';
  function orderUrl(order) {
    return SITE_URL + '/orders.html' + (order.orderNumber ? '#order-' + order.orderNumber : '');
  }

  // No dollar amounts, handles, app names or "Bitcoin" here: "send $X on
  // Cash App to $handle" from a new domain reads like a payment scam to spam
  // filters and lands the confirmation in junk. The order page (linked) shows
  // the full payment instructions.
  function nextSteps(paymentMethod, order) {
    if (paymentMethod === 'venmo' || paymentMethod === 'cashapp' || paymentMethod === 'bitcoin' || paymentMethod === 'bank') {
      return 'Payment instructions for this order are on your order page (link below). We ship as soon as payment arrives.';
    }
    return 'We’ll be in touch shortly to confirm the details of your order.';
  }

  // Neutral wording for the payment method line.
  function methodText(pm) {
    return ({ venmo: 'Payment app', cashapp: 'Payment app', bitcoin: 'Digital payment', bank: 'Bank transfer', cash: 'Cash', inquiry: 'We’ll follow up' })[pm] || '';
  }

  function discountsText(order) {
    var lines = [];
    if (order.discount > 0 && !order.atCostCode) {
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
        subtotal: money(order.atCostCode ? order.subtotal - (order.discount || 0) : order.subtotal),
        shipping: money(order.shipping),
        shipping_option: order.shippingOption || '',
        discounts: discountsText(order),
        tax: money(order.tax),
        total: money(order.total),
        shipping_address: addressText(order.shippingAddress) || 'Not provided',
        payment_method: methodText(order.paymentMethod),
        next_steps: nextSteps(order.paymentMethod, order) + '\n\nYour order: ' + orderUrl(order),
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

  // Delivered notice: sent once, when the carrier reports delivery (the
  // tracker) or the admin marks the order Delivered.
  function canSendDelivered() { return isConfigured() && !!CONFIG.deliveredTemplateId; }
  function deliveredParams(order) {
    var d = order.deliveredAt ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(order.deliveredAt) ? order.deliveredAt + 'T12:00:00' : order.deliveredAt) : null;
    return {
      to_email: order.userEmail,
      order_number: order.orderNumber || '',
      items: itemsText(order.items),
      delivered_on: d && !isNaN(d) ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' }) : 'today',
      shipping_address: addressText(order.shippingAddress) || 'the address on your order',
      order_url: orderUrl(order)
    };
  }
  function sendDelivered(order) {
    if (!canSendDelivered() || !order.userEmail) return Promise.resolve(false);
    return loadSdk().then(function (emailjs) {
      return emailjs.send(CONFIG.serviceId, CONFIG.deliveredTemplateId, deliveredParams(order));
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
        payment_method: methodText(order.paymentMethod),
        reason_line: reason ? 'Reason: ' + reason : 'If you have questions about this cancellation, reply to this email.',
        refund_line: 'If you already sent payment for this order, reply to this email and we\u2019ll arrange your refund.'
      });
    }).then(function () { return true; });
  }

  // Gift card bought for a friend: emailed to them when the order's payment
  // is confirmed (js/gift-cards.js). Needs the "Gift card" template.
  function sendGiftCard(card, code) {
    if (!CONFIG.publicKey || !CONFIG.serviceId || !CONFIG.giftCardTemplateId || !card.toEmail) return Promise.resolve(false);
    return loadSdk().then(function (emailjs) {
      var amount = '$' + ((card.amountCents || 0) / 100).toFixed((card.amountCents || 0) % 100 ? 2 : 0);
      return emailjs.send(CONFIG.serviceId, CONFIG.giftCardTemplateId, {
        to_email: card.toEmail,
        to_name: card.toName || 'there',
        from_name: card.from || 'A friend',
        amount: amount,
        message: card.message || '',
        gift_code: code,
        redeem_url: SITE_URL + '/gift.html?code=' + encodeURIComponent(code)
      });
    }).then(function () { return true; });
  }

  return {
    isConfigured: isConfigured,
    canSendCancelled: canSendCancelled,
    sendCancelled: sendCancelled,
    sendConfirmation: sendConfirmation,
    sendShipped: sendShipped,
    sendGiftCard: sendGiftCard,
    shippedParams: shippedParams,
    canSendDelivered: canSendDelivered,
    deliveredParams: deliveredParams,
    sendDelivered: sendDelivered,
    CONFIG: CONFIG
  };
})();

// Lets tools/shipment-tracker (Node) reuse the same email content and IDs.
if (typeof module !== 'undefined' && module.exports) module.exports = OrderEmails;
