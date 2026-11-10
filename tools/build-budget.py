#!/usr/bin/env python3
"""Builds the budget store into dist-budget/ from the TXBio pages.

Same pages, stock, accounts and checkout; different name, look and prices:
  - brand: budget/site.json (name, domain, emails) replaces TXBio's everywhere
    a buyer can see it
  - look: budget/theme.css on top of css/style.css, budget/logo.svg icons
  - prices: set on Admin -> Pricing (settings/pricing.budget); the pages set
    window.SITE_ID = 'budget' and js/price-book.js shows budget prices
  - admin pages aren't copied; the admin menu links to the TXBio admin

    python3 tools/build-budget.py            # -> dist-budget/
    python3 tools/build-budget.py OUT_DIR

Deployed by the budget site's own repo (see budget/README.md).
"""
import json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, 'dist-budget')
SITE = json.load(open(os.path.join(ROOT, 'budget', 'site.json')))
MAIN = SITE['mainSiteUrl'].rstrip('/')
DOMAIN = SITE.get('domain') or ''
URL = ('https://' + DOMAIN) if DOMAIN else SITE['previewUrl'].rstrip('/')

COPY_DIRS = ['css', 'js', 'images', 'products']
SKIP_FILES = {'js/sites.js', 'js/order-emails.js'}   # keep both stores' settings intact
SKIP_JS = re.compile(r'^js/admin-')                  # admin code stays on TXBio
TEXT_EXT = ('.html', '.js', '.css', '.webmanifest', '.xml', '.txt', '.json')

def brand(text):
    text = text.replace('Texas Advanced BioResearch', SITE['longName'])
    text = text.replace('TXBioResearch', SITE['name'])
    text = re.sub(r'\bTXBio\b', SITE['shortName'], text)
    text = text.replace('orders@txbioresearch.com', SITE['ordersEmail'])
    text = text.replace('info@txbioresearch.com', SITE['infoEmail'])
    text = re.sub(r'@txbioresearch\.com', '@' + (SITE['infoEmail'].split('@')[1]), text)
    text = text.replace('https://txbioresearch.com', URL).replace('txbioresearch.com', DOMAIN or URL.replace('https://', ''))
    return text

def relink(text, depth):
    """Root links ("/services.html") -> relative, so a preview URL with a path works."""
    up = '../' * depth
    text = re.sub(r'(href|src|action)="/(?!/)', lambda m: m.group(1) + '="' + up, text)
    return text

def admin_links(text):
    # Admin pages live on TXBio only.
    return re.sub(r'href="(?:\.\./)?(admin-[a-z-]+\.html)', lambda m: 'href="' + MAIN + '/' + m.group(1), text)

COPY = json.load(open(os.path.join(ROOT, 'budget', 'copy.json')))
HERO = os.path.join(ROOT, 'budget', 'hero-mark.html')

def page(text, depth, rel=''):
    up = '../' * depth
    # TXBio-only extras: intro splash and seasonal effects.
    text = re.sub(r'<script src="(?:\.\./)?js/(?:splash|star-fx)\.js(?:\?v=\d+)?"></script>\n?', '', text)
    if rel == 'index.html' and os.path.exists(HERO):
        text = re.sub(r'<div class="hero-mark">.*?</svg>\s*</div>', lambda m: open(HERO).read().strip(), text, count=1, flags=re.S)
    head = '<head>\n<script>window.SITE_ID = \'budget\';</script>\n'
    if SITE.get('noindex'):
        head += '<meta name="robots" content="noindex, nofollow">\n'
        text = re.sub(r'<meta name="robots" content="[^"]*">\n?', '', text)
    text = text.replace('<head>', head, 1)
    text = re.sub(r'(<link rel="stylesheet" href="' + re.escape(up) + r'css/style\.css(\?v=\d+)?">)',
                  lambda m: m.group(1) + '\n<link rel="stylesheet" href="' + up + 'css/theme-budget.css' + (m.group(2) or '') + '">', text, count=1)
    # Product rich results carry TXBio prices; the budget pages go without.
    text = re.sub(r'<script type="application/ld\+json">\{"@context": "https://schema.org", "@type": "Product".*?</script>\n?', '', text, flags=re.S)
    text = re.sub(r'<meta property="(?:product|og):price:[^>]*>\n?', '', text)
    text = re.sub(r'<meta name="theme-color" content="[^"]*">', '<meta name="theme-color" content="' + SITE['themeColor'] + '">', text)
    text = brand(text)
    for old, new in COPY.get(rel, []):
        if old not in text:
            print('  budget/copy.json: text not found on %s: %s...' % (rel, old[:60]))
        text = text.replace(old, new)
    return admin_links(relink(text, depth))

def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    files = [f for f in os.listdir(ROOT) if f.endswith('.html') and not f.startswith('admin-')]
    files += ['manifest.webmanifest', 'robots.txt', 'sitemap.xml']
    for d in COPY_DIRS:
        for base, _, names in os.walk(os.path.join(ROOT, d)):
            for n in names:
                rel = os.path.relpath(os.path.join(base, n), ROOT)
                if SKIP_JS.match(rel) or '/launch' in rel or n == 'label-template.svg':
                    continue
                files.append(rel)
    files.append('functions/catalog.json')
    for rel in files:
        src, dst = os.path.join(ROOT, rel), os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if not rel.endswith(TEXT_EXT) or rel in SKIP_FILES or rel == 'functions/catalog.json':
            shutil.copyfile(src, dst)
            continue
        text = open(src, encoding='utf-8').read()
        if rel.endswith('.html'):
            text = page(text, rel.count('/'), rel)
        else:
            text = brand(text)
        open(dst, 'w', encoding='utf-8').write(text)

    shutil.copyfile(os.path.join(ROOT, 'budget', 'theme.css'), os.path.join(OUT, 'css', 'theme-budget.css'))
    # Manifest, robots, CNAME
    man = json.load(open(os.path.join(OUT, 'manifest.webmanifest')))
    man.update({'name': SITE['name'], 'short_name': SITE['shortName'], 'background_color': SITE['themeColor'], 'theme_color': SITE['themeColor'],
                'start_url': 'index.html', 'scope': './'})
    for i in man.get('icons', []):
        i['src'] = i['src'].lstrip('/')
    json.dump(man, open(os.path.join(OUT, 'manifest.webmanifest'), 'w'), indent=2)
    if SITE.get('noindex'):
        open(os.path.join(OUT, 'robots.txt'), 'w').write('User-agent: *\nDisallow: /\n')
        os.remove(os.path.join(OUT, 'sitemap.xml'))
    if DOMAIN:
        open(os.path.join(OUT, 'CNAME'), 'w').write(DOMAIN + '\n')
    open(os.path.join(OUT, '.nojekyll'), 'w').write('')
    icons()
    leftover = subprocess.run(['grep', '-rIl', '-e', 'Texas Advanced BioResearch', '-e', 'TXBioResearch', OUT], capture_output=True, text=True).stdout.split()
    leftover = [f for f in leftover if not f.endswith(('js/sites.js', 'js/order-emails.js'))]
    print('Built %d files into %s%s' % (len(files), OUT, ('; TXBio name still in: ' + ', '.join(leftover)) if leftover else ''))

def icons():
    """PNG icons from budget/logo-icon.png etc. (made by budget/make-icons.js)."""
    src = os.path.join(ROOT, 'budget', 'icons')
    for n in (os.listdir(src) if os.path.isdir(src) else []):
        shutil.copyfile(os.path.join(src, n), os.path.join(OUT, 'images', n))
    # Product labels with the budget name (budget/make-labels.js).
    labels = os.path.join(ROOT, 'budget', 'product-labels')
    for n in (os.listdir(labels) if os.path.isdir(labels) else []):
        shutil.copyfile(os.path.join(labels, n), os.path.join(OUT, 'images', 'product-labels', n))

if __name__ == '__main__':
    main()
