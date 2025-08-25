// netlify/functions/nfl-bootstrap.mjs
// ESM function. No node-fetch needed.
import { getStore } from '@netlify/blobs';

const NFL_STORE_NAME = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';

export async function handler(event) {
  const debug = new URLSearchParams(event.rawQuery || event.queryStringParameters || {}).get('debug');
  try {
    const store = getStore({ name: NFL_STORE_NAME });
    // quick sanity ping
    const meta = await store.get('meta-rosters.json', { type: 'json' });
    const sched = await store.get('weeks/2025/1/schedule.json', { type: 'json' });
    const depth = await store.get('depth-charts.json', { type: 'json' });
    const resp = {
      ok: true,
      store: NFL_STORE_NAME,
      hasMeta: !!meta,
      hasSchedule: !!sched,
      hasDepth: !!depth,
      schedule: sched || null
    };
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(resp)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: String(err),
        store: NFL_STORE_NAME,
        hint: 'Ensure Netlify Blobs add-on is enabled and BLOBS_STORE_NFL is set to the store name.'
      })
    };
  }
}
