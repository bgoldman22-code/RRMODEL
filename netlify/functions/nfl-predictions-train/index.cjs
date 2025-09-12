// netlify/functions/nfl-predictions-train/index.cjs
const { getBlobsStore } = require('../_blobs.js');
const BUNDLE_VERSION = "predictions-2025-09-12-v5";

function seedRows() {
  // Very small sample so UI has data even before full trainer is wired
  return [
    {
      id: 'sample-GB-WAS',
      kickoff: new Date(Date.now() + 3600e3).toISOString(),
      matchup: 'Washington Commanders @ Green Bay Packers',
      ml_home_best: -175, ml_away_best: 162,
      ml_home_imp: 0.644, ml_away_imp: 0.397,
      spread_team: 'Green Bay Packers', spread_line: -3,
      total_side: 'Over', total_line: 49,
      pick: { type: 'moneyline', team: 'Green Bay Packers', confidence: 0.644 }
    }
  ];
}

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

    // TODO: replace with real pipeline (OddsAPI + NFLVerse features)
    const rows = seedRows();
    const out = { updated: new Date().toISOString(), rows };
    await store.put(key, out);

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: true, trained: true, wrote: key, rows: rows.length, BUNDLE_VERSION })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION })
    };
  }
};
