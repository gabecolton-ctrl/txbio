// mailer.js — sends customer emails from orders@ over SMTP (Namecheap
// Private Email), so they pass SPF/DKIM like your other order mail.
const nodemailer = require('nodemailer');
const { FROM_NAME, FROM_EMAIL } = require('./config');

function smtpMailer({ host = 'mail.privateemail.com', port = 465, user = FROM_EMAIL, pass }) {
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return {
    async send(to, msg) {
      if (!to) throw new Error('no customer email on the order');
      await transport.sendMail({ from: { name: FROM_NAME, address: FROM_EMAIL }, to, replyTo: FROM_EMAIL, subject: msg.subject, text: msg.text, html: msg.html });
    }
  };
}

module.exports = { smtpMailer };
