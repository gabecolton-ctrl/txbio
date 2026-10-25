// case-pricing.js — "Case of 10" bulk pricing on product pages.
//
// A case is 10 vials of the same product and dosage where the buyer pays for 7:
// 3 vials free, which is 30% off the single-vial price. Research supplies (waters, B12, L-carnitine, capsules, blends in the
// Research Reagents & Supplies section) are sold by the vial only.
//
// Case items go into the cart as their own line: slug "<vial-slug>-case",
// with caseOf: 10 and unitSlug: "<vial-slug>" so checkout can pull 10 units
// from stock per case. BOGO never applies to case items (see bogo.js).
//
// Product pages call CasePricing.apply(product) right before Cart.addItem().

var CasePricing = (function () {
  var CASE_SIZE = 10;
  var FREE_VIALS = 3;
  var CASE_DISCOUNT = FREE_VIALS / CASE_SIZE; // 30%

  // Base product slugs sold by the vial only.
  var NOT_CASE_ELIGIBLE = [
    'b12',
    'l-carnitine-600mg',
    'bac-water',
    'sterile-water',
    'acetic-acid-water',
    'slu-pp-332-capsule',
    'super-human-blend'
  ];

  var mode = 'single';
  var baseSlug = null;
  var ui = null;

  function isEligible(slug) {
    return !!slug && NOT_CASE_ELIGIBLE.indexOf(slug) === -1;
  }

  function casePrice(unitPrice) {
    return unitPrice * (CASE_SIZE - FREE_VIALS);
  }

  function isCaseItem(item) {
    return !!(item && (item.caseOf || /-case$/.test(item.slug || '')));
  }

  function money(n) {
    var cents = Math.round(n * 100) % 100 !== 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
  }

  function currentUnitPrice() {
    var doseSelect = document.getElementById('dose-select');
    if (window.DOSE_PRICES && doseSelect) return DOSE_PRICES[doseSelect.value];
    if (window.PRODUCTS) {
      var p = PRODUCTS.find(function (x) { return x.slug === baseSlug; });
      if (p) return p.price;
    }
    return null;
  }

  function render() {
    var unit = currentUnitPrice();
    if (!ui || unit == null) return;
    var total = casePrice(unit);
    var perVial = total / CASE_SIZE;
    var saved = unit * CASE_SIZE - total;

    ui.singlePrice.textContent = money(unit);
    ui.casePrice.textContent = money(total);
    ui.caseSave.textContent = FREE_VIALS + ' vials free';

    var priceEl = document.querySelector('.product-info .product-price');
    if (priceEl) priceEl.textContent = mode === 'case' ? money(total) : money(unit);

    ui.note.textContent = mode === 'case'
      ? 'Pay for ' + (CASE_SIZE - FREE_VIALS) + ', get ' + CASE_SIZE + ': ' + money(perVial) + ' per vial. You save ' + money(saved) + ' versus buying single vials.'
      : '';
    ui.note.style.display = mode === 'case' ? '' : 'none';
    if (ui.qtyLabel) ui.qtyLabel.textContent = mode === 'case' ? 'Cases' : 'Quantity';
    // Dosage dropdown: show each dose's case price while "Case of 10" is picked.
    if (ui.doseOptions) {
      ui.doseOptions.forEach(function (o) {
        var unitForDose = window.DOSE_PRICES ? DOSE_PRICES[o.el.value] : null;
        o.el.textContent = (mode === 'case' && unitForDose != null)
          ? o.original.replace(/\$[\d,.]+/, money(casePrice(unitForDose)) + ' per case')
          : o.original;
      });
    }
    if (ui.packCell) ui.packCell.textContent = mode === 'case'
      ? ui.packOriginal.replace(/^1 vial/i, 'Case of ' + CASE_SIZE + ' vials')
      : ui.packOriginal;
  }

  function init() {
    if (!window.THIS_PRODUCT || !isEligible(THIS_PRODUCT.slug)) return;
    baseSlug = THIS_PRODUCT.slug;

    var info = document.querySelector('.product-info');
    var anchor = info && info.querySelector('.spec-table');
    if (!anchor) return;

    var wrap = document.createElement('div');
    wrap.className = 'buy-mode';
    wrap.innerHTML =
      '<p class="buy-mode-label" id="buy-mode-label">Buy as</p>' +
      '<div class="buy-mode-options" role="radiogroup" aria-labelledby="buy-mode-label">' +
        '<label class="buy-option"><input type="radio" name="buy-mode" value="single" checked>' +
          '<span class="buy-option-body"><span class="buy-option-title">Single vial</span>' +
          '<span class="buy-option-price" data-role="single-price"></span></span></label>' +
        '<label class="buy-option"><input type="radio" name="buy-mode" value="case">' +
          '<span class="buy-option-body"><span class="buy-option-title">Case of ' + CASE_SIZE + '</span>' +
          '<span class="buy-option-price" data-role="case-price"></span>' +
          '<span class="buy-option-save" data-role="case-save"></span></span></label>' +
      '</div>' +
      '<p class="buy-mode-note" data-role="note" style="display:none;"></p>';
    info.insertBefore(wrap, anchor);

    ui = {
      singlePrice: wrap.querySelector('[data-role="single-price"]'),
      casePrice: wrap.querySelector('[data-role="case-price"]'),
      caseSave: wrap.querySelector('[data-role="case-save"]'),
      note: wrap.querySelector('[data-role="note"]'),
      qtyLabel: document.querySelector('label[for="qty-input"]')
    };
    var doseSel = document.getElementById('dose-select');
    if (doseSel) {
      ui.doseOptions = Array.prototype.map.call(doseSel.options, function (el) {
        return { el: el, original: el.textContent };
      });
    }
    // The spec table's "Pack size" row follows the selection too.
    Array.prototype.forEach.call(anchor.querySelectorAll('tr'), function (tr) {
      if (tr.cells.length === 2 && /pack size/i.test(tr.cells[0].textContent)) {
        ui.packCell = tr.cells[1];
        ui.packOriginal = tr.cells[1].textContent;
      }
    });

    wrap.addEventListener('change', function (e) {
      if (e.target.name === 'buy-mode') { mode = e.target.value; render(); }
    });
    var doseSelect = document.getElementById('dose-select');
    if (doseSelect) doseSelect.addEventListener('change', render);
    render();
  }

  // Turns a single-vial cart product into its case equivalent when the
  // buyer has "Case of 10" selected. Otherwise returns it unchanged.
  function apply(product) {
    if (mode !== 'case' || !isEligible(baseSlug)) return product;
    var pack = String(product.packSize || '');
    var casePack = /^1 vial/i.test(pack)
      ? pack.replace(/^1 vial/i, 'Case of ' + CASE_SIZE + ' vials')
      : 'Case of ' + CASE_SIZE + ' (' + pack + ' each)';
    return {
      slug: product.slug + '-case',
      name: product.name,
      packSize: casePack,
      price: casePrice(product.price),
      caseOf: CASE_SIZE,
      unitSlug: product.slug
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    CASE_SIZE: CASE_SIZE,
    CASE_DISCOUNT: CASE_DISCOUNT,
    FREE_VIALS: FREE_VIALS,
    isEligible: isEligible,
    isCaseItem: isCaseItem,
    casePrice: casePrice,
    apply: apply
  };
})();
