// ship-cutoff.js — "Order in 3h 12m to ship today" on product pages and the
// cart. Uses Dallas (America/Chicago) time, ships Monday–Friday, skips UPS
// holidays. To change the cutoff, edit CUTOFF below (24-hour clock).
var ShipCutoff = (function () {
  var CUTOFF = { hour: 14, minute: 0 };   // 2:00 PM Central
  var SHIP_DAYS = [1, 2, 3, 4, 5];        // Mon–Fri (0 = Sunday)
  var TZ = 'America/Chicago';

  // Current date/time parts in Chicago.
  function chicagoNow(now) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
    var p = {};
    f.formatToParts(now || new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
  }

  function nthWeekday(y, m, weekday, n) { // n = 1..4, or -1 for last
    if (n > 0) { var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7; }
    var last = new Date(Date.UTC(y, m, 0)); var ld = last.getUTCDate(); return ld - ((last.getUTCDay() - weekday + 7) % 7);
  }
  // UPS doesn't pick up on these days.
  function isHoliday(y, m, d) {
    var key = m + '-' + d;
    if (key === '1-1' || key === '7-4' || key === '12-25') return true;
    if (m === 5 && d === nthWeekday(y, 5, 1, -1)) return true;   // Memorial Day
    if (m === 9 && d === nthWeekday(y, 9, 1, 1)) return true;    // Labor Day
    if (m === 11 && d === nthWeekday(y, 11, 4, 4)) return true;  // Thanksgiving
    return false;
  }
  function isShipDay(y, m, d) {
    var wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return SHIP_DAYS.indexOf(wd) !== -1 && !isHoliday(y, m, d);
  }

  // { today: true, minutesLeft } or { today: false, dayName, tomorrow }.
  function status(now) {
    var c = chicagoNow(now);
    var minsNow = c.h * 60 + c.min, cut = CUTOFF.hour * 60 + CUTOFF.minute;
    if (isShipDay(c.y, c.m, c.d) && minsNow < cut) return { today: true, minutesLeft: cut - minsNow };
    for (var i = 1; i <= 10; i++) {
      var dt = new Date(Date.UTC(c.y, c.m - 1, c.d + i));
      var y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
      if (isShipDay(y, m, d)) {
        return { today: false, tomorrow: i === 1, dayName: dt.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) };
      }
    }
    return { today: false, tomorrow: false, dayName: 'soon' };
  }

  function text(now) {
    var s = status(now);
    if (s.today) {
      var h = Math.floor(s.minutesLeft / 60), mm = s.minutesLeft % 60;
      return 'Order within <strong>' + (h ? h + 'h ' : '') + mm + 'm</strong> to ship <strong>today</strong>';
    }
    return 'Order now, ships <strong>' + (s.tomorrow ? 'tomorrow' : s.dayName) + '</strong>';
  }

  function mount(el) {
    if (!el) return;
    var draw = function () { el.innerHTML = '<span class="ship-cutoff-icon" aria-hidden="true">&#128666;</span> ' + text(); };
    draw();
    setInterval(draw, 30000);
  }

  // Product pages: under the Add to cart button. Cart: above the checkout area.
  function autoMount() {
    var spot = document.getElementById('add-to-cart-msg') || document.getElementById('free-ship-bar');
    if (!spot || document.querySelector('.ship-cutoff')) return;
    var el = document.createElement('p');
    el.className = 'ship-cutoff';
    spot.parentNode.insertBefore(el, spot.nextSibling);
    mount(el);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount);
    else autoMount();
  }

  return { status: status, text: text, isHoliday: isHoliday, CUTOFF: CUTOFF };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ShipCutoff;
