// supplier-codes.js — the codes your supplier prints on boxes and packing
// lists (e.g. RT10 = R-3 10mg), matched to inventory slugs. Saved on
// Admin → Inventory in settings/supplierCodes { codes: { slug: 'RT10' } };
// DEFAULTS fill in until you change them.
var SupplierCodes = (function () {
  var DEFAULTS = {
    'glutathione-1500mg': 'GTT1500', 'mots-c-human-10mg': 'MS10', 'mots-c-human-20mg': 'MS20', 'nad-plus-1000mg': 'NAD1000',
    '5-amino-1mq-10mg': '10AM', '5-amino-1mq-50mg': '50AM', 'ipamorelin-10mg': 'IP10', 'igf-1-lr3': 'IG01',
    'tesamorelin-10mg': 'TSM10', 'glow-blend': 'GLOW', 'klow-blend': 'KLOW', 'pt141': 'PT141',
    'r-3-10mg': 'RT10', 'r-3-15mg': 'RT15', 'r-3-20mg': 'RT20', 'tirzepatide-10mg': 'TR10',
    'semaglutide-5mg': 'SM5', 'semaglutide-10mg': 'SM10', 'semaglutide-20mg': 'SM20',
    'tb500-thymosin-beta-4-10mg': 'TB10', 'kisspeptin-10': 'KS10', 'ss-31-50mg': '2S50',
    'ghk-cu-100mg': 'CU100', 'ahk-cu': 'AU100', 'lipo-c': 'LC216', 'b12': 'B-12',
    // Best guesses: confirm against the supplier's list.
    'bac-water-10ml': 'BA10', 'bac-water-3ml': 'BA3-1', 'selank': 'SK10', 'semax-10mg': 'XA10', 'semax-10mg-selank-10mg': 'XS20'
  };

  function norm(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  // saved: { slug: code } from settings/supplierCodes. Returns the merged map.
  function merged(saved) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (s) { out[s] = DEFAULTS[s]; });
    Object.keys(saved || {}).forEach(function (s) { if (saved[s]) out[s] = saved[s]; else delete out[s]; });
    return out;
  }

  // "RT10: 22", "RT10 22", "F46 (HGH): 28", "SM20:10" → [{ code, qty, line }]
  function parse(text) {
    return String(text || '').split(/\r?\n|,(?=\s*[A-Za-z0-9-]+\s*[:=-])/).map(function (line) {
      var raw = line.trim();
      if (!raw) return null;
      var m = /^(.+?)\s*[:=\-–]?\s*(\d+)\s*$/.exec(raw);
      if (!m) return { line: raw, code: '', qty: null };
      var code = m[1].replace(/\(.*?\)/g, '').replace(/[:=\-–]\s*$/, '').trim();
      return { line: raw, code: code, qty: parseInt(m[2], 10) };
    }).filter(Boolean);
  }

  // codes: { slug: code } → { NORMCODE: slug }
  function index(codes) {
    var out = {};
    Object.keys(codes).forEach(function (s) { if (codes[s]) out[norm(codes[s])] = s; });
    return out;
  }

  return { DEFAULTS: DEFAULTS, norm: norm, merged: merged, parse: parse, index: index };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SupplierCodes;
