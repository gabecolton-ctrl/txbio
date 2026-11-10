# Budget store

A second storefront built from these same pages: own name, look, prices,
cart and emails; shared stock, customer logins, admin and order list.

| What | Where |
|---|---|
| Name, domain, contact emails | `budget/site.json` and `js/sites.js` |
| Page wording that differs | `budget/copy.json`, `budget/hero-mark.html` |
| Look | `budget/theme.css`, `budget/logo.svg` (`node budget/make-icons.js`) |
| Product label images | `node budget/make-labels.js` → `budget/product-labels/` |
| Prices | Admin → Pricing → Budget store (percent off TXBio, or per product) |
| Buyer emails | `BUDGET_CONFIG` in `js/order-emails.js` (its own EmailJS service and templates) |
| Orders | Admin → Orders, "Budget" badge and store filter; order numbers start `BB-` |

Build locally: `python3 tools/build-budget.py` → `dist-budget/`.

Hosting: a separate GitHub repo (`budget-store`) with `budget/publish.yml` as
`.github/workflows/publish.yml` and Pages set to "GitHub Actions". It rebuilds
from txbio every 30 minutes, so page changes here reach the budget store
within half an hour. Price changes on Admin → Pricing are instant.
