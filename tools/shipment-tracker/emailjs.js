// emailjs.js — sends an EmailJS template from Node via the REST API.
// Needs the account's private key, and "Allow EmailJS API for non-browser
// applications" turned on (EmailJS → Account → Security).
const path = require('path');
const OrderEmails = require(path.join(__dirname, '../../js/order-emails.js'));

function emailjsClient({ privateKey, fetchImpl = fetch }) {
  return {
    async send(templateId, params) {
      const res = await fetchImpl('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: OrderEmails.CONFIG.serviceId,
          template_id: templateId,
          user_id: OrderEmails.CONFIG.publicKey,
          accessToken: privateKey,
          template_params: params
        })
      });
      if (!res.ok) throw new Error('EmailJS ' + res.status + ': ' + (await res.text()).slice(0, 200));
    }
  };
}

module.exports = { emailjsClient };
