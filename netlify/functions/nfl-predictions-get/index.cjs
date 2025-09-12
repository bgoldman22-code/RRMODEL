// netlify/functions/nfl-predictions-get/index.cjs
const { get } = require('../_blobs');

const CURRENT_KEY = 'nfl/predictions/current.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v9';

exports.handler = async () => {
  try {
    const data = await get(CURRENT_KEY);
    if (data && typeof data === 'object') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify(data)
      };
    }
    const fallback = { ok: true, updated: null, rows: [], parlay: { legs: [] }, source: 'empty', key: CURRENT_KEY, BUNDLE_VERSION };
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(fallback) };
  } catch (err) {
    console.error('nfl-predictions-get error:', err);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok:false, error:String(err), BUNDLE_VERSION }) };
  }
};
