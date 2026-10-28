// Settings for the order automation job. Change and commit to adjust.
module.exports = {
  // Unpaid Venmo / Cash App / bank / Bitcoin orders:
  REMIND_AFTER_DAYS: 2,     // one friendly reminder email
  CANCEL_AFTER_DAYS: 5,     // then cancelled, stock and store credit returned, customer emailed
  CANCEL_FAMILY_ORDERS: false, // family (at-cost) orders get the reminder but are never auto-cancelled

  // Payment emails: how far back to look each run.
  LOOKBACK_DAYS: 10,
  // Only emails proven (DKIM/DMARC) to come from these domains are trusted.
  PAYMENT_SENDERS: {
    venmo: ['venmo.com'],
    cashapp: ['cash.app', 'square.com', 'squareup.com']
  },

  FROM_NAME: 'TXBioResearch',
  FROM_EMAIL: 'orders@txbioresearch.com',
  SITE_URL: 'https://txbioresearch.com'
};
