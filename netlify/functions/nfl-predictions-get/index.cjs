// netlify/functions/nfl-predictions-get/index.cjs
const { get } = require('../_blobs');

const CURRENT_KEY = 'nfl/predictions/current.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v5';

exports.handler = async () => {
  try {
    const data = await get(CURRENT_KEY);
    if (data) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      };
    }
    // Cold/empty fallback
    const fallback = {
      ok: true,
      updated: null,
      rows: [],
      source: 'empty',
      key: CURRENT_KEY,
      BUNDLE_VERSION
    };
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fallback)
    };
  } catch (err) {
    console.error('Unhandled error in nfl-predictions-get:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: `Unhandled exception: ${String(err)}`,
        BUNDLE_VERSION,
        source: 'error'
      })
    };
  }
};
