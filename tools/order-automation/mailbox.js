// mailbox.js — reads recent payment emails over IMAP (read-only: nothing is
// moved, deleted, or marked read).
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { PAYMENT_SENDERS } = require('./config');

function imapMailbox({ host, port = 993, user, pass, folder = 'INBOX' }) {
  return {
    async recent(since) {
      const client = new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });
      await client.connect();
      const out = [];
      try {
        const lock = await client.getMailboxLock(folder, { readOnly: true });
        try {
          const domains = [].concat(PAYMENT_SENDERS.venmo, PAYMENT_SENDERS.cashapp);
          const uids = new Set();
          for (const d of domains) {
            const found = await client.search({ since, from: d }, { uid: true });
            (found || []).forEach((u) => uids.add(u));
          }
          if (uids.size) {
            for await (const msg of client.fetch([...uids].join(','), { source: true }, { uid: true })) {
              out.push(await simpleParser(msg.source));
            }
          }
        } finally { lock.release(); }
      } finally { await client.logout().catch(() => {}); }
      return out;
    }
  };
}

module.exports = { imapMailbox };
