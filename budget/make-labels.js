// Makes the budget store's product label images (light, clinical) from
// js/products.js into budget/product-labels/ (PNG + WebP, same names as
// images/product-labels/). Run after adding products or renaming the store:
//   node budget/make-labels.js
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
global.window = {};
const src = fs.readFileSync(path.join(ROOT, 'js/products.js'), 'utf8');
const PRODUCTS = new Function(src + '; return PRODUCTS;')();
const site = JSON.parse(fs.readFileSync(path.join(__dirname, 'site.json'), 'utf8'));
const mark = fs.readFileSync(path.join(__dirname, 'logo.svg'), 'utf8').replace('<svg ', '<svg width="54" height="54" ');
const out = path.join(__dirname, 'product-labels');
fs.mkdirSync(out, { recursive: true });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function size(p) {
  const m = String(p.packSize || '').match(/x\s*(.+)$/i);
  return m ? m[1].trim() : 'Multiple sizes available';
}
function html(p) {
  const nameSize = p.name.length > 22 ? 26 : p.name.length > 14 ? 32 : 40;
  return `<html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  body{margin:0;width:500px;height:620px;display:grid;place-items:center;background:transparent;font-family:Inter,Arial,sans-serif}
  .l{width:430px;height:550px;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(15,29,51,.16);border:1px solid #d6dee9;overflow:hidden;display:flex;flex-direction:column}
  .top{background:#1756d1;color:#fff;display:flex;align-items:center;gap:14px;padding:22px 26px}
  .top svg rect{fill:#fff}.top svg path{stroke:#1756d1}.top svg path:last-child{fill:#1756d1}
  .brand{font-weight:800;font-size:24px;letter-spacing:-.4px}.sub{font-size:10px;letter-spacing:2.5px;opacity:.8;margin-top:2px}
  .body{flex:1;padding:30px 30px 0;display:flex;flex-direction:column}
  .name{font-weight:800;font-size:${nameSize}px;color:#0f1d33;letter-spacing:-.6px;line-height:1.1}
  .size{display:inline-block;margin-top:12px;background:#eaf1fd;color:#1756d1;font-weight:700;font-size:15px;padding:6px 12px;border-radius:6px;align-self:flex-start}
  .rows{margin-top:28px;border-top:1px solid #e6ecf3}
  .row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #e6ecf3;font-size:13px}
  .row span:first-child{color:#6b7a90;letter-spacing:1.2px;font-weight:600;font-size:11px}.row span:last-child{color:#0f1d33;font-weight:600}
  .warn{margin:auto 0 0;padding:14px 0 22px;font-size:11px;color:#c2362b;font-weight:700;letter-spacing:.8px;text-align:center}
  .foot{background:#f4f7fb;border-top:1px solid #e6ecf3;font-size:11px;color:#6b7a90;text-align:center;padding:10px;letter-spacing:.5px}
</style></head><body><div class="l">
  <div class="top">${mark}<div><div class="brand">${esc(site.name)}</div><div class="sub">RESEARCH SUPPLY</div></div></div>
  <div class="body">
    <div class="name">${esc(p.name)}</div>
    <div class="size">${esc(size(p))}</div>
    <div class="rows">
      <div class="row"><span>FORM</span><span>${esc(p.form || 'Lyophilized powder')}</span></div>
      <div class="row"><span>PURITY</span><span>${esc(p.purity || '')}</span></div>
      <div class="row"><span>USE</span><span>Laboratory research only</span></div>
    </div>
    <div class="warn">NOT FOR HUMAN OR ANIMAL USE</div>
  </div>
  <div class="foot">${esc(site.domain || site.name)}</div>
</div></body></html>`;
}

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 500, height: 620 } });
  for (const p of PRODUCTS) {
    await pg.setContent(html(p), { waitUntil: 'networkidle' }).catch(() => pg.setContent(html(p)));
    const png = path.join(out, p.slug + '.png');
    await pg.screenshot({ path: png, omitBackground: true });
    execFileSync('python3', ['-c', 'import sys;from PIL import Image;Image.open(sys.argv[1]).save(sys.argv[2],"WEBP",quality=82)', png, png.replace(/\.png$/, '.webp')]);
  }
  await b.close();
  console.log('Made ' + PRODUCTS.length + ' labels in budget/product-labels/');
})();
