// netlify/functions/nfl-data.js
// Simple reader for blobs keys written by bootstrap/candidates

import { nflStore } from './_lib/blobs.js';

export const handler = async (event) => {
  try {
    const type = event.queryStringParameters?.type || 'schedule';
    const store = await nflStore();
    let key;
    if (type === 'schedule') key = 'weeks/2025/1/schedule.json';
    else if (type === 'candidates') key = 'weeks/2025/1/candidates.json';
    else if (type === 'list') {
      const keys = await store.list({ prefix: 'weeks/2025/1/' });
      return json(200, { ok: true, keys });
    } else {
      return json(400, { ok: false, error: 'unknown type' });
    }
    const res = await store.get(key, { type: 'json' });
    if (!res) return json(404, { ok: false, error: 'no data' });
    return json(200, { ok: true, data: res });
  } catch (err) {
    return json(500, { ok: false, error: String(err) });
  }
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(obj),
  };
}