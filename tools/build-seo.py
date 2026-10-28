"""Search-engine basics for txbioresearch.com. Run from the repo root after
adding or renaming products:
    python3 tools/build-seo.py

Writes, for every public page: a clear <title> and meta description, a
canonical URL, and social-share (Open Graph) tags; for product pages also
structured Product data (JSON-LD) Google can read. Private pages (cart,
checkout, account, orders, admin) get noindex. Also writes sitemap.xml and
robots.txt. Generated head tags sit between <!-- seo:start --> and
<!-- seo:end --> and are replaced on each run.
"""
import datetime
import glob
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'data'))
import compounds as D  # noqa: E402

SITE = 'https://txbioresearch.com'
BRAND = 'TXBioResearch'
OG_IMAGE = SITE + '/images/icon-512.png'
START, END = '<!-- seo:start -->', '<!-- seo:end -->'

PUBLIC_PAGES = {
    'index.html': ('Research Peptides for Laboratories | Texas Advanced BioResearch',
                   'Research-grade peptides and lab supplies from Dallas, TX. Detailed specs, sequences and CAS numbers, case pricing, and fast US shipping. For laboratory research use only.'),
    'services.html': ('Research Peptide Catalog: GLP-1s, BPC-157, Blends & More | TXBioResearch',
                      'Browse 60+ research peptides and lab supplies: GLP-1 analogs, growth hormone secretagogues, tissue-repair, cognitive, and mitochondrial research compounds. Case pricing available.'),
    'calculator.html': ('Peptide Reconstitution Calculator (mg, mcg, mL) | TXBioResearch',
                        'Free peptide reconstitution calculator: enter the vial amount and diluent volume to get concentration in mg/mL and mcg/mL, the volume for a target amount, and aliquots per vial. For laboratory research use only.'),
    'about.html': ('About Texas Advanced BioResearch | TXBioResearch',
                   'Texas Advanced BioResearch supplies research-use peptides and reagents to laboratories and researchers from Dallas, TX.'),
    'contact.html': ('Contact Us | TXBioResearch',
                     'Questions about a product, an order, or bulk pricing? Contact Texas Advanced BioResearch in Dallas, TX.'),
    'shipping.html': ('Shipping & Returns | TXBioResearch',
                      'Shipping options, processing times, tracking, and the returns policy for TXBioResearch orders.'),
    'terms.html': ('Terms & Conditions | TXBioResearch', 'Terms and conditions of sale for TXBioResearch research products.'),
    'privacy.html': ('Privacy Policy | TXBioResearch', 'How TXBioResearch collects, uses, and protects your information.'),
}
PRIVATE = ['cart.html', 'checkout.html', 'account.html', 'orders.html', 'login.html', 'referrals.html']
SUPPLY_SLUGS = {'bac-water', 'sterile-water', 'acetic-acid-water', 'b12', 'l-carnitine-600mg'}

e = lambda v: html.escape(v, quote=True)


def clip(text, n):
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) <= n:
        return text
    cut = text[:n - 1].rsplit(' ', 1)[0].rstrip(',;:')
    return cut + '…'


def load_products():
    js = open(os.path.join(ROOT, 'js', 'products.js'), encoding='utf-8').read()
    names = dict(re.findall(r'slug:\s*"([^"]+)",\s*name:\s*"([^"]*)"', js))
    cat = json.load(open(os.path.join(ROOT, 'functions', 'catalog.json')))
    return names, cat['products']


def product_meta(slug, site_name, cat_entry):
    p = D.P.get(slug, {})
    comps = [D.C[k] for k in p.get('compounds', [])]
    if len(comps) == 1:
        name = comps[0]['name']
        overview = comps[0]['overview']
    else:
        name = site_name
        overview = (p.get('text') or {}).get('overview') or (comps[0]['overview'] if comps else '')
    if comps and p.get('blend'):
        overview = f"Research blend: {p['blend']}. " + ' '.join(c['overview'].split('. ')[0] + '.' for c in comps[:2])
    kind = 'Lab Supply' if slug in SUPPLY_SLUGS or 'text' in p else (
        'Research Peptide' if any(re.search(r'peptid|GHRH|analog|hormone|cathelicidin', c.get('type', ''), re.I) for c in comps) or p.get('blend')
        else 'Research Compound')
    doses = cat_entry.get('doses') or {}
    labels = [d['label'] for d in doses.values()]
    size = f" ({labels[0]}–{labels[-1]})" if len(labels) > 1 else ''
    title = clip(f"{name}{size} {kind} | {BRAND}", 70)
    first = overview.split('. ')[0].rstrip('.') + '.' if overview else f'{name} for laboratory research.'
    suffix = ' Specs, CAS and case pricing. For laboratory research use only.'
    desc = clip(first, 160 - len(suffix)) + suffix  # the research-use line always fits
    prices = [d['price'] for d in doses.values()] or [cat_entry['price']]
    aka = comps[0].get('aka', '') if len(comps) == 1 else ''
    return name, title, desc, prices, aka, kind


def faq_ld(path):
    # FAQPage data from the page's "Common questions" rows, so Google can show them.
    src = open(path, encoding='utf-8').read()
    block = re.search(r'class="rows calc-faq">(.*?)</section>', src, re.S)
    qa = re.findall(r'<h3>(.*?)</h3><p>(.*?)</p>', block.group(1) if block else '', re.S)
    plain = lambda t: html.unescape(re.sub(r'<[^>]+>', '', t)).replace('\xa0', ' ')
    return '<script type="application/ld+json">' + json.dumps({
        '@context': 'https://schema.org', '@type': 'FAQPage',
        'mainEntity': [{'@type': 'Question', 'name': plain(q), 'acceptedAnswer': {'@type': 'Answer', 'text': plain(a)}} for q, a in qa]
    }, ensure_ascii=False) + '</script>'


def head_block(page_path, title, desc, extra='', noindex=False, og_type='website', image=OG_IMAGE):
    url = SITE + '/' + page_path.replace('index.html', '')
    parts = [START]
    if noindex:
        parts.append('<meta name="robots" content="noindex">')
    else:
        parts += [
            f'<link rel="canonical" href="{e(url)}">',
            f'<meta property="og:type" content="{og_type}">',
            f'<meta property="og:site_name" content="Texas Advanced BioResearch">',
            f'<meta property="og:title" content="{e(title)}">',
            f'<meta property="og:description" content="{e(desc)}">',
            f'<meta property="og:url" content="{e(url)}">',
            f'<meta property="og:image" content="{e(image)}">',
            '<meta name="twitter:card" content="summary">',
        ]
    if extra:
        parts.append(extra)
    parts.append(END)
    return '\n'.join(parts)


def apply(path, title=None, desc=None, block=''):
    s = open(path, encoding='utf-8').read()
    s = re.sub(r'\n?' + re.escape(START) + r'.*?' + re.escape(END), '', s, flags=re.S)
    if title:
        s = re.sub(r'<title>.*?</title>', '<title>' + e(title) + '</title>', s, count=1, flags=re.S)
    if desc is not None:
        if re.search(r'<meta name="description" content="[^"]*">', s):
            s = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="' + e(desc) + '">', s, count=1)
        else:
            s = s.replace('</title>', '</title>\n<meta name="description" content="' + e(desc) + '">', 1)
    s = s.replace('</head>', block + '\n</head>', 1)
    open(path, 'w', encoding='utf-8').write(s)


def main():
    names, catalog = load_products()
    today = datetime.date.today().isoformat()
    urls = []

    for page, (title, desc) in PUBLIC_PAGES.items():
        extra = ''
        if page == 'index.html':
            extra = '<script type="application/ld+json">' + json.dumps({
                '@context': 'https://schema.org', '@type': 'Organization', 'name': 'Texas Advanced BioResearch',
                'alternateName': BRAND, 'url': SITE + '/', 'logo': OG_IMAGE,
                'email': 'info@txbioresearch.com',
                'address': {'@type': 'PostalAddress', 'addressLocality': 'Dallas', 'addressRegion': 'TX', 'addressCountry': 'US'}
            }) + '</script>'
        if page == 'calculator.html':
            extra = faq_ld(os.path.join(ROOT, page))
        apply(os.path.join(ROOT, page), title, desc, head_block(page, title, desc, extra))
        urls.append((SITE + '/' + page.replace('index.html', ''), '1.0' if page in ('index.html', 'services.html') else '0.8' if page == 'calculator.html' else '0.5'))

    for path in sorted(glob.glob(os.path.join(ROOT, 'products', '*.html'))):
        slug = os.path.basename(path)[:-5]
        entry = catalog.get(slug)
        if not entry:
            continue
        name, title, desc, prices, aka, kind = product_meta(slug, names.get(slug, slug), entry)
        page = 'products/' + slug + '.html'
        image = SITE + '/images/product-labels/' + slug + '.png'
        offer = ({'@type': 'Offer', 'price': f'{prices[0]:.2f}', 'priceCurrency': 'USD'} if len(prices) == 1 else
                 {'@type': 'AggregateOffer', 'lowPrice': f'{min(prices):.2f}', 'highPrice': f'{max(prices):.2f}', 'priceCurrency': 'USD', 'offerCount': len(prices)})
        offer.update({'url': SITE + '/' + page, 'availability': 'https://schema.org/InStock',
                      'seller': {'@type': 'Organization', 'name': 'Texas Advanced BioResearch'}})
        ld = {'@context': 'https://schema.org', '@type': 'Product', 'name': name, 'sku': slug,
              'description': desc, 'image': image, 'category': kind,
              'brand': {'@type': 'Brand', 'name': BRAND}, 'offers': offer}
        if aka:
            ld['alternateName'] = aka
        extra = '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>'
        apply(path, title, desc, head_block(page, title, desc, extra, og_type='product', image=image))
        urls.append((SITE + '/' + page, '0.8'))

    for page in PRIVATE + [os.path.basename(p) for p in glob.glob(os.path.join(ROOT, 'admin-*.html'))]:
        apply(os.path.join(ROOT, page), block=head_block(page, '', '', noindex=True))

    with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for url, pr in urls:
            f.write(f'  <url><loc>{e(url)}</loc><lastmod>{today}</lastmod><priority>{pr}</priority></url>\n')
        f.write('</urlset>\n')
    with open(os.path.join(ROOT, 'robots.txt'), 'w', encoding='utf-8') as f:
        f.write('User-agent: *\n'
                'Disallow: /admin-\n'
                'Disallow: /cart.html\n'
                'Disallow: /checkout.html\n'
                'Disallow: /account.html\n'
                'Disallow: /orders.html\n'
                'Disallow: /referrals.html\n'
                'Disallow: /functions/\n'
                'Disallow: /tools/\n'
                'Disallow: /data/\n'
                '\n'
                'Sitemap: ' + SITE + '/sitemap.xml\n')
    print('SEO tags on', len(urls), 'public pages; sitemap.xml and robots.txt written.')


if __name__ == '__main__':
    main()
