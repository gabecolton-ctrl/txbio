// sites.js — the two storefronts that share this code, stock, admin and orders.
//
//   main    txbioresearch.com (this repo, GitHub Pages)
//   budget  the lower-price store, built from these same pages by
//           tools/build-budget.py (name, look and prices from budget/)
//
// A page knows which store it's on from window.SITE_ID, which the budget build
// sets; the TXBio pages leave it unset ('main'). Orders, gift cards and budget
// carts carry `site: 'budget'`; anything without it is a TXBio order.
//
// tools/build-budget.py leaves this file alone (no brand swap), so both sites
// see the same list.
var Sites = (function () {
  var LIST = {
    main: { id: 'main', name: 'TXBioResearch', url: 'https://txbioresearch.com', orderPrefix: 'TXB', badge: 'TXBio', email: 'orders@txbioresearch.com', fullName: 'Texas Advanced BioResearch' },
    budget: { id: 'budget', name: 'TexasBench', url: 'https://texasbench.com', orderPrefix: 'TB', badge: 'Budget', email: 'orders@texasbench.com', fullName: 'TexasBench Research Supply' }
  };
  function current() { return (typeof window !== 'undefined' && window.SITE_ID === 'budget') ? 'budget' : 'main'; }
  function of(thing) { return thing && thing.site === 'budget' ? 'budget' : 'main'; }
  function info(id) { return LIST[id === 'budget' ? 'budget' : 'main']; }
  return { LIST: LIST, current: current, of: of, info: info, isBudget: function () { return current() === 'budget'; } };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sites;
