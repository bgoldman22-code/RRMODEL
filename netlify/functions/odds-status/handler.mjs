// netlify/functions/odds-status/handler.mjs
import { makeStore } from '../_lib/blobs-helper.mjs';

export const handler = async () => {
  const store = await makeStore();
  const storeName = store?.meta?.name || 'unknown';
  // You can expand this to read any health/status artifacts you keep in Blobs.
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true, store: storeName })
  };
};
