// track17.js — tracking through 17TRACK (api.17track.net, Tracking API v2.4),
// used instead of UPS's own API when the TRACK17_API_KEY secret is set.
// 17TRACK detects the carrier itself, so UPS, USPS and FedEx numbers all work.
//
// Billing: a number uses one quota when it's first registered. Checking it
// again (gettrackinfo) is free, and registering it again is refused without
// another charge, so the tracker can just register before every check.

const BASE = 'https://api.17track.net/track/v2.4/';
const ALREADY_REGISTERED = -18019901;

function cleanNumber(n) { return String(n || '').replace(/\s+/g, '').toUpperCase(); }

// Anything shaped like a parcel number (letters and digits, 8–40 long).
function canTrack17(n) { return /^[0-9A-Z]{8,40}$/.test(cleanNumber(n)); }

function track17Client({ apiKey, fetchImpl = fetch }) {
  const registered = new Set();

  async function call(endpoint, body) {
    const res = await fetchImpl(BASE + endpoint, {
      method: 'POST',
      headers: { '17token': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.status === 401) throw new Error('17TRACK rejected the API key (401). Check TRACK17_API_KEY.');
    if (!res.ok) throw new Error('17TRACK ' + endpoint + ' failed (' + res.status + ')');
    const json = await res.json();
    if (json.code !== 0) throw new Error('17TRACK ' + endpoint + ' error ' + json.code + (json.data && json.data.errors ? ': ' + JSON.stringify(json.data.errors).slice(0, 200) : ''));
    return json.data || {};
  }

  async function register(num) {
    if (registered.has(num)) return;
    const data = await call('register', [{ number: num }]);
    const rej = (data.rejected || []).find((r) => cleanNumber(r.number) === num);
    if (rej && rej.error && rej.error.code !== ALREADY_REGISTERED && !/already/i.test(String(rej.error.message || ''))) {
      throw new Error('17TRACK could not register ' + num + ': ' + (rej.error.message || rej.error.code));
    }
    registered.add(num);
  }

  // Raw track_info for a number, or null when 17TRACK has nothing yet.
  async function track(trackingNumber) {
    const num = cleanNumber(trackingNumber);
    await register(num);
    const data = await call('gettrackinfo', [{ number: num }]);
    const hit = (data.accepted || []).find((a) => cleanNumber(a.number) === num);
    return hit ? (hit.track_info || null) : null;
  }

  async function status(trackingNumber) { return summarize17(await track(trackingNumber)); }

  return { name: '17TRACK', track, status, canTrack: canTrack17 };
}

function eventTime(e) { return (e && (e.time_iso || e.time_utc)) || null; }

// Same shape as ups.js summarize():
//   { state: 'label' | 'moving' | 'delivered' | 'unknown', at, deliveredAt, description }
function summarize17(info) {
  if (!info) return { state: 'unknown', at: null, deliveredAt: null, description: 'No tracking information yet' };
  const latest = info.latest_status || {};
  const latestEvent = info.latest_event || {};
  const statusName = String(latest.status || '');
  const description = latestEvent.description || statusName || 'No tracking information yet';
  const milestones = Array.isArray(info.milestone) ? info.milestone : [];
  const stageTime = (key) => { const m = milestones.find((x) => x && x.key_stage === key && eventTime(x)); return m ? eventTime(m) : null; };

  const extra = { stage: statusName, lastEventAt: eventTime(latestEvent), location: String(latestEvent.location || '').trim() };
  const out = (o) => Object.assign(o, extra);
  if (!statusName || statusName === 'NotFound') return out({ state: 'unknown', at: null, deliveredAt: null, description });
  if (statusName === 'InfoReceived') return out({ state: 'label', at: null, deliveredAt: null, description: description || 'Label created' });

  // First real scan: the "picked up" milestone, else the oldest event that
  // isn't just the label being created.
  let at = stageTime('PickedUp');
  if (!at) {
    const events = [];
    ((info.tracking && info.tracking.providers) || []).forEach((p) => (p.events || []).forEach((e) => events.push(e)));
    const real = events.filter((e) => eventTime(e) && e.stage !== 'InfoReceived' && e.sub_status !== 'InfoReceived');
    real.sort((a, b) => String(eventTime(a)).localeCompare(String(eventTime(b))));
    at = real.length ? eventTime(real[0]) : eventTime(latestEvent);
  }
  if (statusName === 'Delivered') {
    return out({ state: 'delivered', at, deliveredAt: stageTime('Delivered') || eventTime(latestEvent), description });
  }
  return out({ state: 'moving', at, deliveredAt: null, description });
}

module.exports = { track17Client, summarize17, canTrack17 };
