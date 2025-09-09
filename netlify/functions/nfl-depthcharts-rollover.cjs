// netlify/functions/nfl-depthcharts-rollover.cjs
// Updates Blobs key depth/season/2025/current.json to point to the latest week
const { getBlobsStore } = require('./_blobs.js');

exports.handler = async () => {
  const store = getBlobsStore('nfl-td');
  const season = 2025;
  // Simple heuristic: if weekN exists, point current to the highest N (1..18)
  let latest = 0;
  for (let w = 1; w <= 18; w++) {
    const key = `depth/season/${season}/week${w}.json`;
    const res = await store.get(key);
    if (res) latest = w;
  }
  if (latest === 0) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error:"No weeks found in store" }) };
  }
  const currentKey = `depth/season/${season}/current.json`;
  const payload = { season, week: latest, path: `week${latest}/depth-charts.json`, updated: new Date().toISOString() };
  await store.set(currentKey, JSON.stringify(payload), { contentType: 'application/json' });
  return { statusCode: 200, body: JSON.stringify({ ok:true, current: payload }) };
};
