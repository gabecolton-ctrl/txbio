// Makes the budget store's PNG icons from budget/logo.svg (run after editing it):
//   node budget/make-icons.js
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const svg = fs.readFileSync(path.join(__dirname, 'logo.svg'), 'utf8');
const out = path.join(__dirname, 'icons');
fs.mkdirSync(out, { recursive: true });
const SIZES = { 'logo-icon.png': [380, 0], 'icon-192.png': [192, 0], 'icon-512.png': [512, 0], 'apple-touch-icon.png': [180, 0], 'icon-maskable-512.png': [512, 0.1] };
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage();
  for (const [name, [size, pad]] of Object.entries(SIZES)) {
    await pg.setViewportSize({ width: size, height: size });
    const inner = Math.round(size * (1 - pad * 2));
    await pg.setContent('<html><body style="margin:0;background:' + (pad ? '#1756d1' : 'transparent') + ';display:grid;place-items:center;width:' + size + 'px;height:' + size + 'px">' +
      svg.replace('<svg ', '<svg width="' + inner + '" height="' + inner + '" ') + '</body></html>');
    await pg.screenshot({ path: path.join(out, name), omitBackground: !pad });
  }
  // iPhone launch screens (same sizes as images/launch/): white with the mark.
  fs.mkdirSync(path.join(__dirname, 'launch'), { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'images', 'launch'))) {
    const m = f.match(/(\d+)x(\d+)/); if (!m) continue;
    const w = +m[1], h = +m[2], mark = Math.round(w * 0.28);
    await pg.setViewportSize({ width: w, height: h });
    await pg.setContent('<html><body style="margin:0;width:' + w + 'px;height:' + h + 'px;background:#ffffff;display:grid;place-items:center">' + svg.replace('<svg ', '<svg width="' + mark + '" height="' + mark + '" ') + '</body></html>');
    await pg.screenshot({ path: path.join(__dirname, 'launch', f) });
  }
  // Wide logo: mark + name
  const site = JSON.parse(fs.readFileSync(path.join(__dirname, 'site.json'), 'utf8'));
  await pg.setViewportSize({ width: 1800, height: 640 });
  await pg.setContent('<html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@800&display=swap" rel="stylesheet"></head><body style="margin:0;width:1800px;height:640px;display:flex;align-items:center;gap:56px;padding:0 90px;box-sizing:border-box;font-family:Inter,Arial,sans-serif">' +
    svg.replace('<svg ', '<svg width="420" height="420" ') + '<span style="font-size:190px;font-weight:800;letter-spacing:-6px;color:#0f1d33">' + site.name + '</span></body></html>');
  await pg.screenshot({ path: path.join(out, 'logo.png'), omitBackground: true });
  await b.close();
  console.log('Icons written to budget/icons/');
})();
