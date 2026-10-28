# Order automation

Runs every ~15 minutes on GitHub (`.github/workflows/order-automation.yml`).

1. **Payments.** Reads Venmo and Cash App "paid you" emails (read-only, over
   IMAP). An email is only trusted when the mail server's
   `Authentication-Results` header shows DKIM/DMARC passing for venmo.com /
   cash.app / square.com. If it names a pending order (`TXB-…`) placed with
   that app, for exactly the order total, the order is set to **Confirmed**
   and the customer gets a "Payment received" email. Anything else (wrong
   amount, no order number, unverified sender) is listed on **Admin → To-do →
   Payments to match by hand**.
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
| `ORDERS_SMTP_PASSWORD` | Password for orders@txbioresearch.com (Namecheap Private Email). |
| `PAYMENT_IMAP_USER` | The email address your Venmo/Cash App notifications go to. |
| `PAYMENT_IMAP_PASSWORD` | Its password, or an **app password** for Gmail. |
| `PAYMENT_IMAP_HOST` | `imap.gmail.com` for Gmail; leave unset for orders@ (mail.privateemail.com). |

Without the `PAYMENT_IMAP_*` secrets, payment matching is skipped and only
reminders/cancellations run. Don't forward the payment emails to another
inbox: forwarding breaks the DKIM check, so they'd never auto-confirm. Read
them where they arrive.

First run: Actions → Order automation → Run workflow with **Dry run** ticked.
The log shows what it would confirm, remind and cancel, without changing or
sending anything.

Tests: `npm ci && node test.js` (also run before every scheduled run).
