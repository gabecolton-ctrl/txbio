// carriers.js — picks the tracking source per number:
//   UPS numbers (1Z…) → UPS's own Tracking API when its keys are set (live data)
//   everything else, or UPS if its API fails → 17TRACK (refreshes every 6–12 h)
const { summarize, isUpsNumber } = require('./ups');

function combinedCarrier({ ups, track17, log = console.log }) {
  const parts = [ups && 'UPS', track17 && '17TRACK'].filter(Boolean);
  let upsBroken = false;
  return {
    name: parts.join(' + '),
    canTrack(num) { return (ups && isUpsNumber(num)) || (track17 ? track17.canTrack(num) : false); },
    async status(num) {
      if (ups && !upsBroken && isUpsNumber(num)) {
        try { return summarize(await ups.track(num)); }
        catch (err) {
          if (!track17) throw err;
          if (/sign-in failed/i.test(err.message)) upsBroken = true; // bad keys: don't retry every number
          log('  UPS failed for ' + num + ' (' + err.message + '); using 17TRACK');
        }
      }
      if (!track17) throw new Error('No tracking source for ' + num);
      return track17.status(num);
    }
  };
}

module.exports = { combinedCarrier };
