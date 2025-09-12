const { get } = require('../_blobs.cjs');

const CURRENT_KEY = 'nfl/predictions/current.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v9';

exports.handler = async () => {
  try {
    const data = await get(CURRENT_KEY);
    if (data) {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
    } else {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, updated: null, rows: [], source: "empty", key: CURRENT_KEY, BUNDLE_VERSION })
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION, source: "error" })
    };
  }
};
