// netlify/functions/nfl-predictions-get/index.cjs
exports.config = { schedule: null };

const { getBlobsStore } = require('../_blobs.js');
const BUNDLE_VERSION = "predictions-get-v6";
const CURRENT_KEY = "nfl/predictions/current.json";

exports.handler = async () => {
  try {
    const store = getBlobsStore();
    const str = await store.get(CURRENT_KEY);
    if (str) {
      try {
        const obj = JSON.parse(str);
        // normalize shape (always return rows array)
        const rows = Array.isArray(obj.rows) ? obj.rows : [];
        return json({ ok:true, updated: obj.updated || null, rows, source:"blobs", key: CURRENT_KEY, BUNDLE_VERSION });
      } catch {
        // legacy payload might be raw rows
        return json({ ok:true, updated:null, rows:[], source:"blobs(raw)", key: CURRENT_KEY, BUNDLE_VERSION });
      }
    }
    return json({ ok:true, updated:null, rows:[], source:"empty", key: CURRENT_KEY, BUNDLE_VERSION });
  } catch (err) {
    return json({ ok:false, error:String(err), BUNDLE_VERSION });
  }
};

function json(obj) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(obj)
  };
}
