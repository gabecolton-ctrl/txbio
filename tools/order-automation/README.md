# Order automation

Runs every ~15 minutes on GitHub (`.github/workflows/order-automation.yml`).

1. **Payments.** Reads Venmo and Cash App "paid you" emails (read-only, over
   IMAP from Namecheap Private Email). An email is only trusted when it is
   provably from venmo.com / cash.app / square.com: either the mail server's
   `Authentication-Results` header shows DKIM/DMARC passing, or the job checks
   the email's DKIM signature itself (whole message signed, by that domain,
   matching the From address). If it names a pending order (`TXB-…`) placed
   with that app, for exactly the order total, the order is set to
   **Confirmed** and the customer gets a "Payment received" email. Anything
   else (wrong amount, no order number, unverified sender) is listed on
   **Admin → To-do → Payments to match by hand**.
2. **Unpaid orders** (Venmo, Cash App, bank, Bitcoin): one reminder after
   2 days; cancelled after 5 days (only after a reminder went out). Stock and
   any store credit used go back, and the customer is emailed. Family
   (at-cost) orders are reminded but never auto-cancelled. Change the days in
   `config.js`.

Customer emails are sent from orders@txbioresearch.com over SMTP, so they
don't use EmailJS's monthly quota.

## Setup (GitHub → repo → Settings → Secrets and variables → Actions)

| Secret | What |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Same as the shipment tracker: the Firebase key file's full contents. |
| `ORDERS_SMTP_PASSWORD` | Password for orders@txbioresearch.com. Also used to read payment emails from orders@. |
| `PAYMENT_IMAP_USER` / `PAYMENT_IMAP_PASSWORD` | Only if Venmo/Cash App notify a different Private Email address than orders@. |
| `PAYMENT_IMAP_HOST` | Only for a non-Namecheap inbox (default `mail.privateemail.com`). |

Don't forward the payment emails to another inbox: forwarding can break the
signature check, so they'd land on To-do instead of confirming. Read them
where they arrive.

First run: Actions → Order automation → Run workflow with **Dry run** ticked.
The log shows what it would confirm, remind and cancel, without changing or
sending anything.

Tests: `npm ci && node test.js` (also run before every scheduled run).
