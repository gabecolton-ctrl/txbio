// orders-page.js — the buyer's order history on orders.html: status, tracking,
// totals, and the Reorder button (js/reorder.js).
(function () {
  // Order status for buyers: a friendly label, tracking with a carrier link
  // when the number's format identifies the carrier, ship date, and any
  // cancellation reason.
  var STATUS_LABELS = {
    pending: 'Awaiting payment',
    confirmed: 'Payment received',
    processing: 'Preparing to ship',
    'label-created': 'Label created',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled'
  };
  function escHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function trackingLink(num) {
    var n = String(num || '').replace(/\s+/g, '').toUpperCase();
    if (/^1Z[0-9A-Z]{16}$/.test(n)) return { carrier: 'UPS', url: 'https://www.ups.com/track?tracknum=' + n };
    if (/^9\d{19,21}$/.test(n) || /^[A-Z]{2}\d{9}US$/.test(n)) return { carrier: 'USPS', url: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + n };
    if (/^(\d{12}|\d{15})$/.test(n)) return { carrier: 'FedEx', url: 'https://www.fedex.com/fedextrack/?trknbr=' + n };
    return null;
  }
  function orderStatusHtml(order) {
    var status = order.status || 'pending';
    var html = '<div class="order-status"><span class="status-pill status-' + escHtml(status) + '">' + escHtml(STATUS_LABELS[status] || status) + '</span>';
    if (order.trackingNumber && status !== 'cancelled') {
      var link = trackingLink(order.trackingNumber);
      html += '<span class="order-status-detail">Tracking: ' + (link
        ? '<a href="' + link.url + '" target="_blank" rel="noopener">' + escHtml(order.trackingNumber) + '</a> (' + link.carrier + ')'
        : escHtml(order.trackingNumber)) + '</span>';
    }
    if (status === 'pending') {
      html += '<span class="order-status-detail">We\u2019ll confirm your order and get it ready to ship as soon as your payment arrives.</span>';
    } else if (status === 'confirmed') {
      html += '<span class="order-status-detail">Thanks! We\u2019re getting your order ready to ship.</span>';
    }
    if (order.shippedEmailSentAt && status !== 'cancelled') {
      html += '<span class="order-status-detail">Shipped ' + new Date(order.shippedEmailSentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '</span>';
    }
    if (status === 'cancelled' && order.cancelReason) {
      html += '<span class="order-status-detail">' + (order.cancelledBy === 'customer' ? 'You cancelled this order' + (order.cancelReason && order.cancelReason.indexOf('Customer: ') === 0 ? ': ' + escHtml(order.cancelReason.slice(10)) : '') : 'Reason: ' + escHtml(order.cancelReason)) + '</span>';
    }
    return html + '</div>';
  }

  // Cancelling: buyers can cancel a pending order themselves (firestore.rules
  // allows only that change). Once it's confirmed or further along, money may
  // need refunding, so they ask by email instead.
  var CANCEL_REASONS = ['Ordered by mistake', 'Need to change items or quantities', 'Wrong shipping address', 'Found a different option', 'Other'];
  var REQUEST_STATUSES = ['confirmed', 'processing', 'label-created'];
  function cancelHtml(order) {
    var status = order.status || 'pending';
    if (status === 'pending') return '<button type="button" class="btn-outline-light cancel-btn">Cancel order</button>';
    if (REQUEST_STATUSES.indexOf(status) !== -1) {
      var subject = encodeURIComponent('Cancel order #' + (order.orderNumber || order.id));
      var body = encodeURIComponent('Please cancel order #' + (order.orderNumber || order.id) + '.\n\nReason: ');
      return '<a class="cancel-request-link" href="mailto:orders@txbioresearch.com?subject=' + subject + '&body=' + body + '">Need to cancel? Email us</a>';
    }
    return '';
  }

  function wireCancel(box, order) {
    var btn = box.querySelector('.cancel-btn');
    if (!btn) return;
    var panel = box.querySelector('.cancel-panel');
    btn.addEventListener('click', function () {
      panel.innerHTML =
        '<p><strong>Cancel order #' + escHtml(order.orderNumber || order.id) + '?</strong> Any store credit you used is returned. If you already sent a payment, email <a href="mailto:orders@txbioresearch.com">orders@txbioresearch.com</a> and we’ll refund it.</p>' +
        '<label for="cancel-reason-' + order.id + '">Reason (optional)</label>' +
        '<select id="cancel-reason-' + order.id + '"><option value="">Choose a reason</option>' +
        CANCEL_REASONS.map(function (r) { return '<option>' + escHtml(r) + '</option>'; }).join('') + '</select>' +
        '<div class="cancel-panel-actions"><button type="button" class="btn cancel-confirm">Yes, cancel order</button>' +
        '<button type="button" class="btn-outline-light cancel-keep">Keep order</button></div>' +
        '<p class="cancel-error" style="display:none;"></p>';
      panel.style.display = 'block';
      btn.style.display = 'none';
      panel.querySelector('.cancel-keep').addEventListener('click', function () {
        panel.style.display = 'none';
        btn.style.display = '';
      });
      panel.querySelector('.cancel-confirm').addEventListener('click', function () {
        var confirmBtn = this;
        var reason = panel.querySelector('select').value;
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Cancelling…';
        var fields = { status: 'cancelled', cancelledBy: 'customer', cancelledAt: new Date().toISOString(), cancelReason: reason ? 'Customer: ' + reason : 'Cancelled by customer' };
        firebase.firestore().collection('orders').doc(order.id).update(fields).then(function () {
          Object.assign(order, fields);
          notifyStore(order, reason);
          renderOrders();
        }).catch(function (err) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Yes, cancel order';
          var e = panel.querySelector('.cancel-error');
          e.textContent = /permission/i.test(err.message)
            ? 'This order can no longer be cancelled online, because it may already be confirmed. Please email orders@txbioresearch.com.'
            : 'Could not cancel: ' + err.message;
          e.style.display = 'block';
        });
      });
    });
  }

  // Lets the store know (same channel as new-order notifications).
  function notifyStore(order, reason) {
    try {
      var fd = new FormData();
      fd.append('_subject', 'Order #' + (order.orderNumber || order.id) + ' cancelled by customer');
      fd.append('_captcha', 'false');
      fd.append('_template', 'box');
      fd.append('Order', '#' + (order.orderNumber || order.id));
      fd.append('Customer', order.userEmail || '');
      fd.append('Total', '$' + Number(order.total || 0).toFixed(2));
      fd.append('Reason', reason || '(none given)');
      fd.append('Next step', 'Open Admin → Orders. Stock and any store credit used are returned automatically when the page loads.');
      fetch('https://formsubmit.co/orders@txbioresearch.com', { method: 'POST', body: fd }).catch(function () {});
    } catch (e) {}
  }

  function wireReorder(box, order) {
    var btn = box.querySelector('.reorder-btn');
    var msg = box.querySelector('.reorder-msg');
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Adding to cart…';
      msg.style.display = 'none';
      Reorder.run(order).then(function (result) {
        if (result.added.length && !result.skipped.length) {
          window.location.href = 'cart.html';
          return;
        }
        btn.disabled = false;
        btn.textContent = 'Reorder';
        var html = '';
        if (result.added.length) {
          html += '<p>Added ' + result.added.length + ' of ' + (result.added.length + result.skipped.length) + ' items to your cart.</p>';
        }
        html += '<p>' + (result.added.length ? 'Not added:' : 'None of these items can be reordered:') + '</p><ul>' +
          result.skipped.map(function (s) {
            return '<li>' + escHtml(s.name) + (s.packSize ? ' (' + escHtml(s.packSize) + ')' : '') + ': ' + escHtml(s.reason) + '</li>';
          }).join('') + '</ul>';
        if (result.added.length) html += '<a href="cart.html" class="btn">View cart</a>';
        else html += '<a href="services.html" class="btn-outline">Browse the catalog</a>';
        msg.innerHTML = html;
        msg.style.display = 'block';
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Reorder';
        msg.innerHTML = '<p>Could not add these items to your cart: ' + escHtml(err.message) + '</p>';
        msg.style.display = 'block';
      });
    });
  }

  function renderOrders() {
    var loading = document.getElementById('orders-loading');
    var empty = document.getElementById('orders-empty');
    var list = document.getElementById('orders-list');

    Account.getOrderHistory().then(function (orders) {
      loading.style.display = 'none';
      if (orders.length === 0) {
        empty.style.display = 'block';
        list.style.display = 'none';
        return;
      }
      empty.style.display = 'none';
      list.style.display = 'block';
      list.innerHTML = '';
      orders.forEach(function (order) {
        var date = new Date(order.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        var box = document.createElement('div');
        box.className = 'order-summary-box';
        if (order.orderNumber) box.id = 'order-' + order.orderNumber;
        box.style.marginBottom = '18px';
        // Family (at-cost) orders show what they actually paid per line.
        var fam = !!order.atCostCode;
        var itemsHtml = order.items.map(function (item) {
          var qtyDisplay = item.qty;
          if (typeof item.backordered === 'number' && item.backordered > 0) {
            qtyDisplay = item.qty + ' (' + item.fulfilled + ' shipped, ' + item.backordered + ' backordered)';
          }
          return '<tr><td data-label="Product">' + item.name + '</td><td data-label="Pack Size">' + item.packSize + '</td><td data-label="Qty">' + qtyDisplay + '</td><td data-label="Subtotal">$' + (fam && typeof item.atCostPrice === 'number' ? item.atCostPrice.toFixed(2) : (item.price * item.qty)) + '</td></tr>';
        }).join('');
        var breakdownHtml = '';
        if (typeof order.shipping !== 'undefined') {
          var discountRowHtml = '';
          if (order.discount && order.discount > 0 && !fam) {
            discountRowHtml = '<tr><td>Discount' + (order.promoCode ? ' (' + order.promoCode + ')' : '') + '</td><td>-$' + order.discount + '</td></tr>';
          }
          breakdownHtml =
            '<table class="spec-table" style="margin-bottom:0;">' +
            '<tr><td>Subtotal</td><td>$' + (fam ? (order.subtotal - (order.discount || 0)).toFixed(2) : order.subtotal) + '</td></tr>' +
            '<tr><td>Shipping' + (order.shippingOption ? ' (' + order.shippingOption + ')' : '') + '</td><td>$' + order.shipping + '</td></tr>' +
            discountRowHtml +
            (order.bogoDiscount > 0 ? '<tr><td>BOGO discount</td><td>-$' + Number(order.bogoDiscount).toFixed(2) + '</td></tr>' : '') +
            '<tr><td>Tax</td><td>$' + order.tax + '</td></tr>' +
            (order.creditUsed > 0 ? '<tr><td>Store credit</td><td>-$' + Number(order.creditUsed).toFixed(2) + '</td></tr>' : '') +
            '<tr><td style="font-weight:700;">Total</td><td style="font-weight:700;">$' + order.total + '</td></tr>' +
            '</table>';
        } else {
          breakdownHtml = '<p style="text-align:right; font-weight:700; margin-bottom:0;">Total: $' + order.total + '</p>';
        }
        var addressHtml = '';
        if (order.shippingAddress) {
          var addr = order.shippingAddress;
          var addrLines = [];
          if (addr.addressLine1) addrLines.push(addr.addressLine1);
          if (addr.addressLine2) addrLines.push(addr.addressLine2);
          var addrCityStateZip = [addr.city, addr.state].filter(Boolean).join(', ') + (addr.zip ? ' ' + addr.zip : '');
          if (addrCityStateZip.trim()) addrLines.push(addrCityStateZip.trim());
          if (addrLines.length > 0) {
            addressHtml = '<p style="font-size:0.9rem; color:var(--text-light); margin-bottom:10px;"><strong>Ship to:</strong> ' + addrLines.join(', ') + '</p>';
          }
        }
        // Unpaid Venmo / Cash App orders: how to pay.
        var payHtml = '';
        if ((order.status || 'pending') === 'pending' && (order.paymentMethod === 'venmo' || order.paymentMethod === 'cashapp') && order.paymentHandle && window.PaymentApps) {
          payHtml = '<div class="order-pay-box"><p>' + escHtml(PaymentApps.instructions(order.paymentMethod, order.paymentHandle, order.total, order.orderNumber)) + '</p>' +
            '<a class="btn-outline" target="_blank" rel="noopener" href="' + escHtml(PaymentApps.payLink(order.paymentMethod, order.paymentHandle, order.total, order.orderNumber)) + '">Open ' +
            (order.paymentMethod === 'venmo' ? 'Venmo' : 'Cash App') + '</a></div>';
        } else if ((order.status || 'pending') === 'pending' && (order.paymentMethod === 'bank' || order.paymentMethod === 'bitcoin')) {
          var amt = '$' + Number(order.total || 0).toFixed(2);
          payHtml = '<div class="order-pay-box"><p>' + (order.paymentMethod === 'bank'
            ? 'Send ' + amt + ' by bank transfer using the details in your order confirmation email, with order #' + escHtml(order.orderNumber || '') + ' in the memo.'
            : 'Send ' + amt + ' in Bitcoin using the details in your order confirmation email.') +
            ' Can\u2019t find the email? <a href="contact.html">Contact us</a> and we\u2019ll resend it.</p></div>';
        }
        box.innerHTML =
          '<p style="margin-bottom:8px;"><strong>' + (order.orderNumber ? 'Order #' + order.orderNumber + ' — ' : '') + date + '</strong>' + (order.paymentMethod ? ' &middot; Payment: ' + ((window.PaymentApps && PaymentApps.LABELS[order.paymentMethod]) || order.paymentMethod) : '') + '</p>' +
          orderStatusHtml(order) + payHtml +
          addressHtml +
          '<table class="cart-table" style="margin-bottom:10px;"><thead><tr><th>Product</th><th>Pack Size</th><th>Qty</th><th>Subtotal</th></tr></thead><tbody>' + itemsHtml + '</tbody></table>' +
          breakdownHtml +
          '<div class="order-actions"><button type="button" class="btn reorder-btn">Reorder</button>' +
          '<span class="reorder-hint">Adds these items to your cart at today’s prices.</span>' + cancelHtml(order) + '</div>' +
          '<div class="cancel-panel" style="display:none;"></div>' +
          '<div class="reorder-msg" role="status" style="display:none;"></div>';
        wireReorder(box, order);
        wireCancel(box, order);
        list.appendChild(box);
      });
      // Links from order emails point at orders.html#order-<number>.
      var target = location.hash && document.getElementById(location.hash.slice(1));
      if (target) {
        target.classList.add('order-highlight');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }).catch(function (err) {
      loading.textContent = 'Could not load order history: ' + err.message;
    });
  }

  document.addEventListener('userReady', renderOrders);
})();
