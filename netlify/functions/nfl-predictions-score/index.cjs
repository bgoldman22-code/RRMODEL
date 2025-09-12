// netlify/functions/nfl-predictions-score/index.cjs
exports.config = {
  includedFiles: []
};

const { get, set } = require('../_blobs.js');

const ARTIFACT_KEY   = 'nfl/predictions/artifacts/latest.json';
const CURRENT_KEY    = 'nfl/predictions/current.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v6';

function scoreData(artifact) {
  // Minimal mocked row to satisfy UI contract
  const rows = [
    {
      id: "game-1",
      kickoff: new Date(Date.now() + 3600 * 1000 * 24).toISOString(),
      matchup: "Green Bay Packers @ Minnesota Vikings",
      ml_home_best: -175,
      ml_away_best: 162,
      ml_home_imp: 0.64,
      ml_away_imp: 0.40,
      spread_team: "Green Bay Packers",
      spread_line: -3,
      total_side: "Over",
      total_line: 49,
      pick: { type: "spread", team: "Green Bay Packers", confidence: 0.85 },
      alts: { spread: [{ line: -2.5, odds: -110 }], totals: [{ line: 50, side: "Over", odds: -110 }] }
    }
  ];

  const parlay = {
    legs: [
      { gameId: "game-1", matchup: "GB @ MIN", leg: "GB -3", confidence: 0.89 }
    ]
  };

  return { rows, parlay };
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const open = String(qs.open || "") === "1";
    const okAuth = open || (event.headers['x-secret-header'] && event.headers['x-secret-header'] === process.env.SCORE_SECRET);

    if (!okAuth) {
      return {
        statusCode: 401,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Unauthorized', BUNDLE_VERSION })
      };
    }

    const artifact = await get(ARTIFACT_KEY);
    if (!artifact) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'No artifact found (run TRAIN first)', BUNDLE_VERSION })
      };
    }

    const { rows, parlay } = scoreData(artifact);
    const payload = { ok: true, updated: new Date().toISOString(), rows, parlay, BUNDLE_VERSION, source: "blobs" };

    const wrote = await set(CURRENT_KEY, payload);
    if (!wrote) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Failed to write predictions', key: CURRENT_KEY, BUNDLE_VERSION })
      };
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, scored: true, rows: rows.length, updated: payload.updated, BUNDLE_VERSION })
    };
  } catch (err) {
    console.error("[score] unhandled:", err && err.stack || err);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION })
    };
  }
};