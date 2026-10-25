"""Writes researched compound data into every product page and js/products.js.

Data lives in data/compounds.py. Run from the repo root:
    python3 tools/build-product-research.py
Safe to re-run: generated rows and sections are marked and replaced.
"""
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'data'))
import compounds as D  # noqa: E402

e = html.escape
GEN_ROW = ' class="gen-row"'
START, END = '<!-- research:start -->', '<!-- research:end -->'


def rows(c, prefix=True):
    out = []
    def add(label, value, mono=False):
        if value:
            cls = ' class="mono"' if mono else ''
            out.append(f'<tr{GEN_ROW}><td>{label}</td><td{cls}>{e(value)}</td></tr>')
    add('Also known as', c.get('aka'))
    add('Compound type', c.get('type'))
    add('Sequence', c.get('sequence'), mono=True)
    add('Molecular formula', c.get('formula'), mono=True)
    mw = c.get('mw')
    if mw and 'kDa' not in mw:
        mw = mw + ' g/mol'
    add('Molecular weight', mw)
    add('CAS number', c.get('cas'), mono=True)
    return out


def sources_html(keys):
    keys = list(dict.fromkeys(keys))
    if not keys:
        return ''
    items = ''.join(f'<li><a href="{e(D.S[k][1])}" target="_blank" rel="noopener">{e(D.S[k][0])}</a></li>' for k in keys)
    return f'<h3>Sources</h3><ul class="research-sources">{items}</ul>'


def areas_html(areas):
    if not areas:
        return ''
    return '<h3>Research areas</h3><ul class="research-areas">' + ''.join(f'<li>{e(a)}</li>' for a in areas) + '</ul>'


def build(slug, name):
    p = D.P[slug]
    spec_rows, body, src, short = [], [], [], ''
    note = p.get('note', '')

    if p.get('blend_unknown'):
        short = f'{name} is a multi-compound research blend.'
        body.append(f'<p>{e(name)} is a multi-compound blend supplied for laboratory research. '
                    'The compounds it contains and the amount of each are listed on the vial label.</p>')
    elif 'text' in p:
        t = p['text']
        spec_rows += rows({'type': t['type']})
        short = t['overview'].split('. ')[0] + '.'
        body.append(f'<p>{e(t["overview"])}</p>')
        body.append(areas_html(t['areas']))
        src += t['sources']
    else:
        comps = [D.C[k] for k in p['compounds']]
        if len(comps) == 1:
            c = comps[0]
            spec_rows += rows(c)
            short = c['overview'].split('. ')[0] + '.'
            body.append(f'<p>{e(c["overview"])}</p>')
            body.append(areas_html(c['areas']))
            src += c['sources']
        else:
            if p.get('blend'):
                spec_rows.append(f'<tr{GEN_ROW}><td>Contents</td><td>{e(p["blend"])}</td></tr>')
                short = f'{name} is a research blend of ' + ' and '.join(c['name'] for c in comps) + '.'
                body.append(f'<p>This vial combines {" and ".join(e(c["name"]) for c in comps)} ({e(p["blend"])}).</p>')
            else:
                short = comps[0]['overview'].split('. ')[0] + '.'
            for c in comps:
                body.append(f'<h3>{e(c["name"])}</h3><p>{e(c["overview"])}</p>')
                body.append(f'<table class="spec-table compound-table">{"".join(rows(c))}</table>')
                src += c['sources']
            areas = list(dict.fromkeys(a for c in comps for a in c['areas']))
            body.append(areas_html(areas))
    if note:
        body.insert(1 if len(body) else 0, f'<p class="research-note">{e(note)}</p>')
    body.append(sources_html(src))
    return spec_rows, '\n    '.join(b for b in body if b), short


def update_page(path, spec_rows, body):
    s = open(path, encoding='utf-8').read()
    s = re.sub(r'\n\s*<tr class="gen-row">.*?</tr>', '', s)
    m = re.search(r'(<tr><td>Pack size</td><td>.*?</td></tr>)', s)
    if not m:
        raise SystemExit(f'{path}: no Pack size row')
    indent = '\n        '
    s = s[:m.end()] + ''.join(indent + r for r in spec_rows) + s[m.end():]
    new = f'<section>\n    <h2>Research overview</h2>\n    {START}\n    {body}\n    {END}\n  </section>'
    s, n = re.subn(r'<section>\s*<h2>Research overview</h2>.*?</section>', lambda _: new, s, count=1, flags=re.S)
    if n != 1:
        raise SystemExit(f'{path}: no Research overview section')
    open(path, 'w', encoding='utf-8').write(s)


def main():
    pj = os.path.join(ROOT, 'js', 'products.js')
    js = open(pj, encoding='utf-8').read()
    for path in sorted(os.listdir(os.path.join(ROOT, 'products'))):
        slug = path[:-5]
        m = re.search(r'slug:\s*"' + re.escape(slug) + r'",\s*name:\s*"([^"]*)"', js)
        if not m:
            raise SystemExit(f'{slug}: not in products.js')
        spec_rows, body, short = build(slug, m.group(1))
        update_page(os.path.join(ROOT, 'products', path), spec_rows, body)
        # Catalog description (first sentence of the overview).
        js = re.sub(r'(slug:\s*"' + re.escape(slug) + r'",.*?description:\s*)"(?:[^"\\]|\\.)*"',
                    lambda mm: mm.group(1) + json.dumps(short, ensure_ascii=False), js, count=1, flags=re.S)
    open(pj, 'w', encoding='utf-8').write(js)
    print('updated', len(os.listdir(os.path.join(ROOT, 'products'))), 'pages')


if __name__ == '__main__':
    main()
