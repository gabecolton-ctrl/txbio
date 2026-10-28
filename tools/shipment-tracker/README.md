# Automatic "shipped" emails

When you paste a UPS tracking number into an order on **Admin → Orders**, the
order becomes **Label created**. About every 30 minutes, GitHub runs this
tracker. It asks UPS about each Label-created order, and at the package's
first scan (your drop-off) it:

1. marks the order **Shipped** (or **Delivered**, if UPS already delivered it),
2. sends the buyer the shipped email, with tracking and a link to their order,
3. credits the affiliate, if the order used an affiliate code (same 10% rule as before).

Later checks move shipped orders to **Delivered** when UPS delivers them. No
email is sent for that. Non-UPS tracking numbers are left alone, so mark those
shipped by hand as before.

It runs on GitHub Actions and is free for this public repository. Firebase's
Blaze plan isn't needed.

## One-time setup (about 30 minutes)

Add four secrets in GitHub: **repo → Settings → Secrets and variables →
Actions → New repository secret**. Secrets are encrypted and never shown in
the public code or logs. Don't paste them into chat or email.

| Secret | Where to get it |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase console → ⚙ Project settings → **Service accounts** → **Generate new private key**. Open the downloaded .json file and paste its entire contents. Then delete the file from your computer. |
| `UPS_CLIENT_ID` | [developer.ups.com](https://developer.ups.com) → sign in or create a free account → **Create Application** → add the **Tracking** API product → copy the Client ID. |
| `UPS_CLIENT_SECRET` | The same UPS app → Client Secret. |
| `EMAILJS_PRIVATE_KEY` | EmailJS → **Account → API keys** → Private Key. On the **Security** tab, also turn on **Allow EmailJS API for non-browser applications**. |

Then:

1. In `js/site-config.js`, set `AUTO_SHIP_TRACKING = true` and publish. From
   then on, saving a tracking number makes the order Label created.
2. In GitHub → **Actions → Track shipments → Run workflow**, start a manual
   run to check the setup. A green check with "Done: …" in the log means it's
   working. A red X shows the error.

If UPS asks for a UPS account number when creating the app and you don't have
one, say so: the tracker can switch to a tracking service such as Ship24,
which doesn't need one.

## Good to know

- **Timing:** GitHub sometimes starts scheduled runs late when it's busy, so
  an email can go out up to an hour or so after the scan.
- **The email goes out once.** Runs claim the order before emailing. If an
  email fails, the order is still marked shipped, Admin → Orders shows the
  error, and the next run retries. You can always use **Resend shipped email**.
- **Changing your mind:** set an order's status by hand at any time. The
  tracker only touches orders that are Label created (and, for delivery,
  orders shipped in the last 21 days).
- **Pausing:** GitHub → Actions → Track shipments → ⋯ → Disable workflow, or
  set `AUTO_SHIP_TRACKING = false` so new tracking numbers don't become Label
  created.

## Developing

```
cd tools/shipment-tracker
npm install
npm test        # fake Firestore, UPS and EmailJS. No secrets needed.
```

The tracker reuses `js/order-emails.js` (email content and template IDs) and
`js/credits.js` (commission math), so the automatic and manual paths match.

## Supplier shipments (Admin → Incoming)

Each run also checks `incoming` shipments that are `ordered` or `in-transit`
and have a UPS tracking number: first scan → `in-transit`, delivery →
`delivered`. If the shipment has "Add to stock automatically" ticked, its
kits (×10 vials) are added to `inventory` and it becomes `received`
(`js/incoming.js`, one transaction, never twice). Shipments are watched for
60 days.
