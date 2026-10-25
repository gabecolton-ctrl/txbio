# Server checkout (Cloud Functions)

`placeOrder` places orders on Google's servers instead of in the buyer's
browser. The browser sends only the buyer's choices; the server works out
every price, discount, tax, store credit, and stock change itself and writes
the order. Buyers can't change prices, totals, stock, or credit.

- `index.js`: the `placeOrder` function
- `checkout.js`: the checkout logic
- `pricing.js`: the price math
- `catalog.json`: the price list the server trusts, built from the site's own
  product files by `tools/build-catalog.js` (runs automatically on deploy)
- `test/run-tests.js`: tests (`npm test`)

## Deploy (one time, about 15 minutes, all in the browser)

1. **Switch Firebase to pay-as-you-go.** Firebase console → your project →
   the plan name at the bottom left → **Upgrade** to **Blaze**. Then set a
   budget alert (Google Cloud console → Billing → Budgets & alerts) at a small
   amount, for example $5, so any unexpected usage emails you.
2. **Open Cloud Shell:** go to https://shell.cloud.google.com signed in as the
   account that owns the Firebase project.
3. **Paste these lines** one at a time:

   ```
   git clone https://github.com/gabecolton-ctrl/txbio.git
   cd txbio/functions && npm install && cd ..
   npx -y firebase-tools@latest login --no-localhost
   npx -y firebase-tools@latest deploy --only functions --project txbio-7cba9
   ```

   The login line prints a link: open it, sign in, and paste the code it
   gives you back into Cloud Shell. The first deploy may ask to enable a few
   Google Cloud services; answer yes. It finishes with
   `Deploy complete!`.
4. **Turn it on** (or ask Claude to): set `USE_SERVER_CHECKOUT = true` in
   `js/site-config.js`, merge, then publish `firestore.rules.server-checkout`
   in Firebase → Firestore → Rules.

## After changing prices

The server only knows prices from its last deploy. After you change a price,
add a product, or change case pricing, shipping options, or tax, redeploy:

```
cd txbio && git pull
npx -y firebase-tools@latest deploy --only functions --project txbio-7cba9
```
