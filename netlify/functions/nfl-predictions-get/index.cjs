// netlify/functions/nfl-predictions-get/index.cjs
exports.config = {
  includedFiles: ["netlify/functions/_data/**"]
};

const { getBlobsStore } = require('../_blobs.js');

const BUNDLE_VERSION = "predictions-2025-09-12-v5";

exports.handler = async () => {
  try {
    const store = getBlobsStore('rrmodelblobs');
    const key = 'nfl/predictions/current.json';
    const txt = await store.get(key);
    if (!txt) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        body: JSON.stringify({ ok: true, updated: null, rows: [], source: 'empty', key, BUNDLE_VERSION })
      };
    }
    const data = JSON.parse(txt);
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: true, updated: data.updated || null, rows, source: 'blobs', key, BUNDLE_VERSION })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION })
    };
  }
};
