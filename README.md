# TXBioResearch website

Static site for txbioresearch.com, served by GitHub Pages from the `main`
branch (root folder). Sign-in, carts, orders, stock, promo codes and BOGO run
on Firebase (Auth + Firestore). Order and contact emails go through
FormSubmit: new-order notifications to orders@txbioresearch.com,
contact form messages to info@txbioresearch.com.

Merging to `main` publishes the site; changes appear within a few minutes.

## Pages

| Page | What it is |
|---|---|
| `index.html`, `about.html`, `contact.html`, `terms.html` | Public pages |
| `login.html` | Sign in / register (`login.html#register` opens Register) |
| `services.html` | Catalog (signed-in researchers only) |
| `products/*.html` | One page per product |
| `cart.html`, `checkout.html`, `account.html` | Buyer flow |
| `admin-inventory.html`, `admin-orders.html`, `admin-promos.html`, `admin-bogo.html` | Admin only (gabecolton@gmail.com) |

## Where things live

- **Design:** everything visual is in `css/style.css`. Colors are the variables at the top.
- **Product data:** `js/products.js` (name, pack size, price, specs). Products
  with a dosage dropdown keep their per-dose prices in `DOSE_PRICES` near the
  bottom of their own page in `products/`.
- **Catalog cards:** hand-written in `services.html`, grouped by category.
- **Case pricing:** `js/case-pricing.js`. A case is 10 vials and the buyer pays
  for 7. Case size, free vials, and which products are single-vial only are
  set at the top of the file.
- **Stock:** `admin-inventory.html`. Products with dosages are tracked per dose
  (for example `semaglutide-10mg`). A case pulls 10 units from its dose's count.
  Leaving a product untracked treats it as always in stock.
- **Bank transfer details:** stored in Firestore, not in this repo (see below).

## Firestore setup

`firestore.rules` holds the security rules the site expects. After editing it,
paste it into Firebase console → Firestore → Rules and publish.

Bank transfer details shown after checkout come from the document
`settings/bankTransfer` with these string fields:

- `accountNumber`
- `routingNumber`
- `bankName` (optional)
- `accountName` (optional)

If that document is missing, buyers who choose bank transfer are told the
details will be emailed to them.
