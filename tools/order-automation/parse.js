// parse.js — reads a payment notification email (already parsed by
// mailparser) and decides whether it can be trusted.
//
// Trust: the receiving mail server's Authentication-Results header must show
// DMARC (or DKIM) passing for venmo.com / cash.app, and the From address must
// be on that domain. Anyone can type "Venmo" into an email; nobody else can
// pass DKIM for venmo.com. Emails that fail this are never used to confirm.

const { PAYMENT_SENDERS } = require('./config');
const { dkimVerify } = require('mailauth/lib/dkim/verify');

const ORDER_RE = /\bTXB-[A-Z0-9]{4,12}\b/i;

function domainOf(addr) {
  const m = String(addr || '').toLowerCase().match(/@([a-z0-9.-]+)/);
  return m ? m[1] : '';
}
function onDomain(host, domains) {
  return domains.some((d) => host === d || host.endsWith('.' + d));
}

// The first (top-most) Authentication-Results header is the one our own
// mail server added; lower ones could have been written by the sender.
function authResults(headerLines) {
  const line = (headerLines || []).find((h) => String(h.key).toLowerCase() === 'authentication-results');
  return line ? String(line.line || '').replace(/^authentication-results:\s*/i, '') : '';
}

function verify(app, fromAddress, headerLines) {
  const domains = PAYMENT_SENDERS[app] || [];
  const fromDomain = domainOf(fromAddress);
  if (!onDomain(fromDomain, domains)) return { ok: false, why: 'sender is not ' + domains[0] };
  const ar = authResults(headerLines).toLowerCase().replace(/\s+/g, ' ');
  if (!ar) return { ok: false, why: 'no Authentication-Results header from the mail server' };
  const dmarc = ar.match(/dmarc=(\w+)[^;]*?header\.from=([a-z0-9.-]+)/);
  if (dmarc && dmarc[1] === 'pass' && onDomain(dmarc[2], domains)) return { ok: true };
  const dkims = [...ar.matchAll(/dkim=(\w+)[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)/g)];
  if (dkims.some((d) => d[1] === 'pass' && onDomain(d[2], domains))) return { ok: true };
  return { ok: false, why: 'DKIM/DMARC did not pass for ' + domains[0] };
}

// Fallback when the mail server doesn't label incoming mail: check the
// DKIM signature ourselves (DNS lookup of the sender's public key). Must be
// a passing signature by the payment app's domain, aligned with From, and
// covering the whole body (signatures with an l= length limit are refused,
// since text could be appended after the signed part).
async function verifySignature(app, raw, headerLines, opts = {}) {
  const domains = PAYMENT_SENDERS[app] || [];
  if (!raw) return { ok: false, why: 'no raw message to check' };
  const sigs = (headerLines || []).filter((h) => String(h.key).toLowerCase() === 'dkim-signature').map((h) => String(h.line));
  if (sigs.some((l) => /(^|[;\s])l\s*=\s*\d/i.test(l.replace(/^dkim-signature:/i, '')))) return { ok: false, why: 'DKIM signature only covers part of the message' };
  const res = await dkimVerify(Buffer.isBuffer(raw) ? raw : Buffer.from(raw), opts.resolver ? { resolver: opts.resolver } : undefined);
  const good = (res.results || []).some((r) => r.status && r.status.result === 'pass' && onDomain(String(r.signingDomain || '').toLowerCase(), domains) && r.status.aligned);
  return good ? { ok: true, via: 'signature' } : { ok: false, why: 'no valid ' + domains[0] + ' DKIM signature' };
}

function money(s) {
  const n = Number(String(s).replace(/[$,\s]/g, ''));
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// Figures out app, amount, payer and order number from a parsed email.
// Returns null when it isn't an incoming-payment email at all.
function parsePayment(mail) {
  const from = (mail.from && mail.from.value && mail.from.value[0]) || {};
  const fromAddress = from.address || '';
  const subject = String(mail.subject || '');
  const text = String(mail.text || '').replace(/ /g, ' ');
  const host = domainOf(fromAddress);
  let app = null;
  if (onDomain(host, PAYMENT_SENDERS.venmo)) app = 'venmo';
  else if (onDomain(host, PAYMENT_SENDERS.cashapp)) app = 'cashapp';
  if (!app) return null;

  // Incoming money only: "X paid you $Y", "You received $Y from X", "X sent you $Y".
  let m = subject.match(/^(.*?)\s+(?:paid|sent)\s+you\s+\$\s?([\d,]+(?:\.\d{2})?)/i);
  let payer = m ? m[1].trim() : '';
  let amount = m ? money(m[2]) : null;
  if (!m) {
    m = subject.match(/you\s+(?:received|got)\s+\$\s?([\d,]+(?:\.\d{2})?)(?:\s+from\s+(.+))?/i);
    if (m) { amount = money(m[1]); payer = (m[2] || '').trim(); }
  }
  if (amount == null) {
    // Some formats put it only in the body.
    const b = text.match(/(?:paid you|sent you|you received)\s+\$\s?([\d,]+(?:\.\d{2})?)/i);
    if (!b) return null;
    amount = money(b[1]);
  }
  if (/request|requested|refund|declined|failed|you paid|you sent/i.test(subject)) return null;
  const order = (subject + '\n' + text).match(ORDER_RE);
  return {
    app, amount, payer: payer.replace(/^"|"$/g, ''),
    orderNumber: order ? order[0].toUpperCase() : '',
    fromAddress, subject,
    messageId: mail.messageId || '',
    date: mail.date ? new Date(mail.date).toISOString() : new Date().toISOString()
  };
}

module.exports = { parsePayment, verify, verifySignature, authResults, ORDER_RE };
