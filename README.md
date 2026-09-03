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
