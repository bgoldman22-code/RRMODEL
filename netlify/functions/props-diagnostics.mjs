import { getStore } from './_blobs.js';

export async function handler(event) {
  try {
    const qs = event?.queryStringParameters || {};
    const model = qs.model || 'mlb_hits2';
    const date = qs.date || null;
    const name = qs.store || process.env.BLOBS_STORE || 'mlb-odds';
    const store = getStore({ name });

    const keys = [];
    for await (const entry of store.list?.() || []) {
      if (entry?.key) keys.push(entry.key);
      if (keys.length >= 1000) break;
    }

    const probeKey = `${model}${date ? ':' + date : ''}:diag-probe.json`;
    await store.set(probeKey, JSON.stringify({ ts: Date.now(), model, date }), { contentType: 'application/json' });
    const back = await store.get(probeKey, { type: 'json' });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        model,
        date,
        store: name,
        wrote: !!back,
        keysPreview: keys.slice(0, 50),
        nKeysScanned: keys.length,
      }),
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
}
