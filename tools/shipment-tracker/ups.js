// ups.js — reads UPS tracking for a tracking number (UPS Tracking API v1).
// Needs a free UPS developer app with the Tracking API: client ID + secret.

const TOKEN_URL = 'https://onlinetools.ups.com/security/v1/oauth/token';
const TRACK_URL = 'https://onlinetools.ups.com/api/track/v1/details/';

function isUpsNumber(n) {
  return /^1Z[0-9A-Z]{16}$/.test(String(n || '').replace(/\s+/g, '').toUpperCase());
}

function upsClient({ clientId, clientSecret, fetchImpl = fetch }) {
  let token = null;
  let tokenExpires = 0;

  async function getToken() {
    if (token && Date.now() < tokenExpires - 60000) return token;
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });
    if (!res.ok) throw new Error('UPS sign-in failed (' + res.status + '). Check UPS_CLIENT_ID and UPS_CLIENT_SECRET.');
    const data = await res.json();
    token = data.access_token;
    tokenExpires = Date.now() + Number(data.expires_in || 3600) * 1000;
    return token;
  }

  // Returns the raw UPS response, or null when UPS has no record yet.
  async function track(trackingNumber) {
    const n = String(trackingNumber).replace(/\s+/g, '').toUpperCase();
    const res = await fetchImpl(TRACK_URL + encodeURIComponent(n) + '?locale=en_US&returnSignature=false', {
      headers: {
        Authorization: 'Bearer ' + (await getToken()),
        transId: 'txbio-' + Date.now(),
        transactionSrc: 'txbioresearch'
      }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('UPS tracking request failed (' + res.status + ')');
    return res.json();
  }

  return { track };
}

// Boils a UPS response down to what the tracker needs:
//   { state: 'label' | 'moving' | 'delivered' | 'unknown', at, deliveredAt, description }
// 'label' = UPS only has the label (type M); anything else means UPS has the
// package. `at` is the time of the first real scan (ISO, UPS local time).
function summarize(resp) {
  const pkg = resp && resp.trackResponse && resp.trackResponse.shipment &&
    resp.trackResponse.shipment[0] && resp.trackResponse.shipment[0].package &&
    resp.trackResponse.shipment[0].package[0];
  if (!pkg) return { state: 'unknown', at: null, description: 'No tracking information yet' };
  const acts = (pkg.activity || []).filter((a) => a && a.status);
  const real = acts.filter((a) => String(a.status.type || '').toUpperCase() !== 'M');
  const current = pkg.currentStatus || (acts[0] && acts[0].status) || {};
  const description = current.description || (acts[0] && acts[0].status.description) || '';
  if (!real.length) return { state: 'label', at: null, description: description || 'Label created' };
  // UPS lists newest first; the first scan is the oldest non-label activity.
  const first = real[real.length - 1];
  const deliveredAct = real.find((a) => String(a.status.type || '').toUpperCase() === 'D');
  return {
    state: deliveredAct ? 'delivered' : 'moving',
    at: upsTime(first.date, first.time),
    deliveredAt: deliveredAct ? upsTime(deliveredAct.date, deliveredAct.time) : null,
    description
  };
}

function upsTime(date, time) {
  if (!/^\d{8}$/.test(String(date || ''))) return null;
  const d = String(date), t = String(time || '000000').padStart(6, '0');
  return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) + 'T' + t.slice(0, 2) + ':' + t.slice(2, 4) + ':' + t.slice(4, 6);
}

module.exports = { upsClient, summarize, isUpsNumber, upsTime };
