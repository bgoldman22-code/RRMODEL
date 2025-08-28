// netlify/functions/props-diagnostics.mjs
import { getStore, getJSON, setJSON } from './_blobs.js';

export async function handler(event) {
  try {
    const params = event?.queryStringParameters || {};
    const storeName = params.store || process.env.BLOBS_STORE || 'mlb-odds';
    const store = getStore(storeName);

    await setJSON(store, 'env-dump-probe.json', { ok: true, t: Date.now() });
    const got = await getJSON(store, 'env-dump-probe.json');

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, store: storeName, roundTrip: got })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
}
