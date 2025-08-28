// netlify/functions/props-diagnostics.mjs
import { getBlobsStore, diagBlobsEnv } from './_blobs.js';

export async function handler(event) {
  const qs = event?.queryStringParameters || {};
  // Accept either ?store= or ?model= (model kept for backward-compat)
  const storeName =
    qs.store ||
    (qs.model === 'mlb_hits2' ? (process.env.BLOBS_STORE || 'mlb-odds') : (process.env.BLOBS_STORE || 'mlb-odds'));

  try {
    const store = getBlobsStore(storeName);

    // Try listing a few keys as a connectivity probe
    const keysSample = [];
    if (store?.list && store.list()[Symbol.asyncIterator]) {
      let i = 0;
      for await (const entry of store.list()) {
        keysSample.push({ key: entry.key, size: entry.size, uploadedAt: entry.uploadedAt });
        if (++i >= 5) break;
      }
    }

    // Optional environment probe from _blobs.js (if present)
    const envProbe = typeof diagBlobsEnv === 'function' ? diagBlobsEnv() : null;

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        store: storeName,
        keysSample,
        envProbe
      })
    };
  } catch (e) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, error: String(e) })
    };
  }
}
