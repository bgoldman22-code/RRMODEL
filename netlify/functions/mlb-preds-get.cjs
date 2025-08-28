// Returns the raw saved predictions JSON for a given date from Netlify Blobs.
// Usage: /.netlify/functions/mlb-preds-get?date=YYYY-MM-DD
const { getStore } = require('./_blobs.js');

async function handler(event) { ... } exports.handler = handler;
  try {
    const params = event.queryStringParameters || {};
    const date = (params.date || "").trim();
    if (!date) return json(400, { ok:false, error:"Missing date=YYYY-MM-DD" });

    const store = getStore("mlb-logs");
    const keys = [
      `predictions-with-ctx/${date}.json`,
      `predictions/${date}.json`,
    ];
    for (const key of keys){
      const val = await store.get(key);
      if (val) {
        return json(200, { ok:true, key, data: JSON.parse(val) });
      }
    }
    return json(404, { ok:false, error:"No predictions file for that date." });
  } catch (e) {
    return json(500, { ok:false, error: e?.message || "Server error" });
  }
};

function json(statusCode, body){
  return { statusCode, headers: { "content-type":"application/json" }, body: JSON.stringify(body) };
}
