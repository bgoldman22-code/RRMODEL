// netlify/functions/props-diagnostics.mjs
import { getStore } from './_blobs.js';

export async function handler(event) {
  try {
    const q = event?.queryStringParameters || {};
    const storeName = q.store || process.env.BLOBS_STORE || 'mlb-odds';
    const prefix = q.prefix || (q.model ? `props:${q.model}:` : '');
    const store = getStore(storeName);

    const keys = [];
    for await (const entry of store.list({ prefix })) {
      keys.push({ key: entry.key, size: entry.size, uploadedAt: entry.uploadedAt });
      if (keys.length >= 2000) break;
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, store: storeName, prefix, count: keys.length, keys }),
    };
  } catch (e) {
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
}
