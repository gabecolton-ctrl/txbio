"""Bumps the ?v= version on every page's scripts and stylesheet so browsers
load the newest files after a change. Run from the repo root:
    python3 tools/bump-version.py
"""
import glob, re, datetime
v = datetime.datetime.now().strftime('%Y%m%d%H%M')
n = 0
for f in glob.glob('*.html') + glob.glob('products/*.html'):
    s = open(f, encoding='utf-8').read()
    s2 = re.sub(r'(<script src="(?:\.\./)?js/[a-z0-9-]+\.js)(\?v=[^"]*)?"', r'\1?v=' + v + '"', s)
    s2 = re.sub(r'(href="(?:\.\./)?css/style\.css)(\?v=[^"]*)?"', r'\1?v=' + v + '"', s2)
    if s2 != s:
        open(f, 'w', encoding='utf-8').write(s2)
        n += 1
print('version', v, 'on', n, 'pages')
