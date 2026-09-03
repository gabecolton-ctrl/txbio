# TXBioResearch Website

A 4-page static site: Home, About, Products (catalog), Contact.

## File structure
```
index.html
about.html
services.html
contact.html
css/style.css
js/main.js
```

## Editing the catalog
Open `services.html` and edit the `<table class="catalog-table">` rows.
Each row is: Product name / Pack size / Price / Intended Use tag.
Replace the `$0.00` placeholders with real prices.

## Editing the contact form
The form in `contact.html` currently has `action="#"` — it doesn't send anywhere yet.
To make it functional, you have two easy no-backend options:
1. **Formspree** (formspree.io) — sign up free, get a form endpoint, set
   `action="https://formspree.io/f/yourFormId"` and `method="POST"`.
2. **Netlify Forms** — only works if hosted on Netlify, not applicable here since you're using Namecheap.

## Deploying via GitHub + Namecheap

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial site"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/txbioresearch.git
git push -u origin main
```

### Step 2 — Enable GitHub Pages
1. Go to your repo on GitHub → **Settings** → **Pages**.
2. Under "Build and deployment", set Source to **Deploy from a branch**.
3. Branch: `main`, folder: `/ (root)`. Save.
4. GitHub will give you a URL like `https://YOUR_USERNAME.github.io/txbioresearch`.

### Step 3 — Add a custom domain (your Namecheap domain)
1. Still in **Settings → Pages**, under "Custom domain", enter your domain
   (e.g. `txbioresearch.com`) and save. This creates a `CNAME` file in your repo automatically.
2. In **Namecheap → Domain List → Manage → Advanced DNS**, add these records:

   For an apex domain (`txbioresearch.com`):
   | Type  | Host | Value                  |
   |-------|------|------------------------|
   | A     | @    | 185.199.108.153        |
   | A     | @    | 185.199.109.153        |
   | A     | @    | 185.199.110.153        |
   | A     | @    | 185.199.111.153        |
   | CNAME | www  | YOUR_USERNAME.github.io |

3. Wait for DNS to propagate (can take up to 24 hrs, often much faster).
4. Back in GitHub Pages settings, check **Enforce HTTPS** once the certificate is issued.

## Legal / compliance note
This site is built around a "research use only" model — every page carries
a disclaimer that products are not for human or animal consumption and are
sold only to qualified researchers/institutions. Keep this framing consistent
across any new pages or marketing copy you add, since removing it while still
marketing to individual/personal buyers would undermine the legal basis for
the research-use labeling.

## Firebase Authentication Setup

This site uses Firebase Authentication (Email/Password) to gate the Products
catalog and all individual product pages behind a login.

**Already configured:**
- Firebase project: `txbio-7cba9`
- Email/Password sign-in method enabled
- Config wired into `js/firebase-config.js`

**How the gate works:**
- `login.html` — sign in or register (name + institution + email + password)
- `js/auth-guard.js` — included on `services.html` and every page in `/products/`;
  checks if a user is signed in, redirects to `login.html` if not
- `js/nav-auth.js` — swaps the nav's "Researcher Login" link to "Sign Out" when
  a user is logged in

**To manage registered users:** Firebase Console → Authentication → Users tab.
You can view, disable, or delete accounts there manually — there's no automated
vetting of "is this really a researcher," so treat account approval as a manual
trust step if you want tighter control (e.g. periodically review new signups).

**Important:** anyone can currently self-register through login.html. If you
want approval-gated signup instead of instant self-registration, that requires
additional backend logic (e.g. a Cloud Function that holds new accounts in a
"pending" state until you approve them). Ask if you want that built.

## Editing product info

All product content (name, price, specs, description) lives in two places
that must be kept in sync:
1. `js/products.js` — a data reference file (not currently rendered directly,
   kept for future use if you want to auto-generate pages again)
2. `products/*.html` — the actual live pages, one per product, generated from
   this data. To change a price or description, edit the specific product's
   HTML file directly under `products/`.

## Adding a real product image

Each product page currently shows the TXBioResearch icon as a placeholder in
place of a product photo. To add a real image:
1. Add your image file to `/images/` (e.g. `images/retatrutide.jpg`)
2. In that product's HTML file under `/products/`, find the `<div class="product-media">`
   block and change the `src="../images/logo-icon.png"` to your new filename.

## Cart Feature (Firestore-backed)

Added: a shopping cart tied to each user's account, stored in Firestore
(Firebase's database) so it persists across devices and sessions.

**Setup already done:**
- Firestore database created (production mode)
- Security rules published so each user can only read/write their own cart:
  ```
  match /carts/{userId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
  ```

**New pages:**
- `cart.html` — view cart contents, adjust quantities, remove items
- `checkout.html` — order summary + "Submit Order Inquiry" (no live payment yet)

**New files:**
- `js/cart.js` — all cart logic (add/update/remove/clear), reads and writes
  to Firestore at `/carts/{the signed-in user's uid}`
- `js/product-page.js` — wires the "Add to Cart" button on each product page

**Important — no payment processor connected yet:**
Clicking "Submit Order Inquiry" on the checkout page currently just clears
the cart and shows a confirmation message. It does **not**:
- Charge any payment method
- Automatically email you the order details

Right now, if someone submits an order, you won't be notified anywhere.
Before this goes live for real customers, you'll want one of:
1. **Quick fix:** change the order form to also send an email (e.g. via
   Formspree, same as the Contact page) so you actually receive orders.
2. **Full fix:** once you pick a payment processor (Stripe, Square, etc.),
   the checkout page needs to be rebuilt to redirect to their hosted
   checkout flow, or use their JS SDK for a custom embedded form. Come back
   for this once you know which processor you're using — the amount of
   backend logic needed depends heavily on which one you pick.

**To see submitted orders in the meantime:** none are stored anywhere right
now (the cart is cleared on submit, not saved to an "orders" collection).
If you want a record of inquiries even before payment is wired up, ask —
that's a small addition (save to a `/orders` collection instead of just
clearing the cart).
