// messages.js — the customer emails this job sends (from orders@). Short and
// plain on purpose (no product names), like the other order emails, so they
// stay out of junk folders.
const path = require('path');
const PaymentApps = require(path.join(__dirname, '../../js/payment-apps.js'));
const { SITE_URL } = require('./config');

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => '$' + Number(n || 0).toFixed(2);
const firstName = (o) => String((o.shippingAddress && o.shippingAddress.name) || o.userName || '').trim().split(/\s+/)[0] || 'there';
const orderLink = (o) => SITE_URL + '/orders.html' + (o.orderNumber ? '#order-' + o.orderNumber : '');

function wrap(paragraphs, o) {
  const text = paragraphs.join('\n\n') + '\n\nView your order: ' + orderLink(o) + '\n\nTXBioResearch · Dallas, TX\nQuestions? Just reply to this email.';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:560px">' +
    paragraphs.map((p) => '<p>' + esc(p) + '</p>').join('') +
    '<p><a href="' + orderLink(o) + '" style="color:#0f9f8d">View your order</a></p>' +
    '<p style="color:#666;font-size:13px">TXBioResearch · Dallas, TX<br>Questions? Just reply to this email.</p></div>';
  return { text, html };
}

function howToPay(o) {
  if ((o.paymentMethod === 'venmo' || o.paymentMethod === 'cashapp') && o.paymentHandle) {
    return PaymentApps.instructions(o.paymentMethod, o.paymentHandle, o.total, o.orderNumber);
  }
  if (o.paymentMethod === 'bank') return 'Send ' + money(o.total) + ' by bank transfer with order ' + o.orderNumber + ' in the memo. The transfer details are on your order page.';
  if (o.paymentMethod === 'bitcoin') return 'Send the equivalent of ' + money(o.total) + ' in Bitcoin. The address is on your order page; reply with your transaction ID once sent.';
  return 'Your payment details are on your order page.';
}

function paymentReceived(o, app) {
  return Object.assign({ subject: 'Payment received for order ' + o.orderNumber }, wrap([
    'Hi ' + firstName(o) + ',',
    'We received your ' + (app === 'venmo' ? 'Venmo' : app === 'cashapp' ? 'Cash App' : '') + ' payment of ' + money(o.total) + ' for order ' + o.orderNumber + '. Thank you!',
    'We’re getting your order ready, and you’ll get another email with tracking as soon as it ships.'
  ], o));
}

function reminder(o, cancelDays) {
  return Object.assign({ subject: 'Reminder: order ' + o.orderNumber + ' is waiting for payment' }, wrap([
    'Hi ' + firstName(o) + ',',
    'Your order ' + o.orderNumber + ' (' + money(o.total) + ') is reserved for you, but we haven’t received payment yet.',
    howToPay(o),
    'Unpaid orders are cancelled after ' + cancelDays + ' days. Already paid? Reply with the details and we’ll match it up. Changed your mind? You can cancel it from your order page.'
  ], o));
}

function cancelled(o, cancelDays) {
  return Object.assign({ subject: 'Order ' + o.orderNumber + ' was cancelled' }, wrap([
    'Hi ' + firstName(o) + ',',
    'We didn’t receive payment for order ' + o.orderNumber + ' within ' + cancelDays + ' days, so it has been cancelled and nothing will be charged or shipped.' +
      (o.creditUsedCents > 0 ? ' The store credit you used has been returned to your account.' : ''),
    'If you already paid, reply to this email and we’ll sort it out right away. You can also reorder anytime from your order page.'
  ], o));
}

module.exports = { paymentReceived, reminder, cancelled, howToPay };
