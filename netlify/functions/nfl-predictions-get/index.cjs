// netlify/functions/nfl-predictions-get/index.cjs
exports.config = {
  includedFiles: []
};

const { get } = require('../_blobs.js');

const CURRENT_KEY    = 'nfl/predictions/current.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v6';

exports.handler = async () => {
  try {
    const data = await get(CURRENT_KEY);
    if (data) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      };
    }
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, updated: null, rows: [], source: 'empty', key: CURRENT_KEY, BUNDLE_VERSION })
    };
  } catch (err) {
    console.error("[get] unhandled:", err && err.stack || err);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION, source: 'error' })
    };
  }
};