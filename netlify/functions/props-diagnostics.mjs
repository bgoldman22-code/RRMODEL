import { getStore } from './_blobs.js';

export async function handler(event) {
  try {
    const qs = event?.queryStringParameters || {};
    const model = qs.model || 'mlb_hits2';
    const date = qs.date || '';
    const storeName = qs.store || process.env.BLOBS_STORE || 'mlb-odds';

    const store = getStore(storeName);

    // list a few keys to prove access
    const keys = [];
    for await (const ent of store.list({ prefix: `${model}:` })) {
      keys.push({ key: ent.key, size: ent.size, uploadedAt: ent.uploadedAt });
      if (keys.length >= 20) break;
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        model,
        date,
        store: storeName,
        sampleKeys: keys
      })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(e) })
    };
  }
}
