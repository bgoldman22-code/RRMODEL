// netlify/functions/nfl-predictions-score/index.cjs
const { getBlobsStore } = require('../_blobs.js');
const BUNDLE_VERSION = "predictions-2025-09-12-v5";

exports.handler = async (event) => {
  try {
    const open = (event.queryStringParameters?.open ?? '') === '1';
    const secret = process.env.TRAIN_SECRET;
    if (!open) {
      const supplied = event.headers['x-train-secret'] || event.queryStringParameters?.secret;
      if (!secret || supplied !== secret) {
        return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Unauthorized', BUNDLE_VERSION }) };
      }
    }

    const store = getBlobsStore('rrmodelblobs');
    const key = 'nfl/predictions/current.json';
    const txt = await store.get(key);
    const data = txt ? JSON.parse(txt) : { rows: [], updated: null };

    // Placeholder scorer: ensure shape is valid and stamp updated time
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const out = { updated: new Date().toISOString(), rows };

    await store.put(key, out);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: true, scored: true, updated: out.updated, notes: 'No-op scorer (placeholder). Replace with real scoring logic when ready.', BUNDLE_VERSION })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION })
    };
  }
};
