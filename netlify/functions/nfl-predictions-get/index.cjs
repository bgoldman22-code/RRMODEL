exports.config = { includedFiles: ["netlify/functions/_data/**"] };

const { getBlobsStore } = require('../_blobs.js');
const BUNDLE_VERSION = "predictions-2025-09-12-v6";

exports.handler = async () => {
  try {
    const store = getBlobsStore('nfl-predictions');
    const key = 'nfl/predictions/current.json';
    const txt = await store.get(key);
    if (!txt) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, updated: null, rows: [], source: 'empty', key, BUNDLE_VERSION })
      };
    }
    const data = JSON.parse(txt);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: true, ...data, BUNDLE_VERSION })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(e), BUNDLE_VERSION })
    };
  }
};
