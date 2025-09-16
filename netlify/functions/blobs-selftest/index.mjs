// netlify/functions/blobs-selftest/index.mjs
// End-to-end sanity check to confirm deployed helper & blob access.
import { HELPER_MODE, HELPER_VERSION, nflBlobsGetJSON, nflBlobsPutJSON, nflBlobsDelete } from '../_lib/blobs-nfl.js';

export default async (req, context) => {
  try {
    const key = 'diag_selftest_' + Date.now();
    const payload = { ok: true, t: new Date().toISOString(), rand: Math.random() };
    await nflBlobsPutJSON(key, payload);
    const roundTrip = await nflBlobsGetJSON(key, null);
    const del = await nflBlobsDelete(key);

    const details = {
      helperMode: HELPER_MODE,
      helperVersion: HELPER_VERSION,
      store: process.env.BLOBS_STORE_NFL || 'nfl-td',
      roundTripOK: !!(roundTrip && roundTrip.ok === true),
      deleted: !!del?.deleted,
      env: {
        has_URL: !!process.env.URL,
        has_ODDS_API_KEY: !!process.env.ODDS_API_KEY
      }
    };
    return json({ ok: true, details });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { 'content-type': 'application/json' } });
}
