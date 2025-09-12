// netlify/functions/nfl-predictions-score/index.cjs
const { get, set } = require('../_blobs');

const ARTIFACT_KEY = 'nfl/predictions/artifacts/latest.json';
const CURRENT_KEY = 'nfl/predictions/current.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v5';

// Placeholder scoring to satisfy UI contract. Replace with real scoring later.
function scoreData(artifact) {
  console.log('Starting scoring based on artifact (mock)...');
  const rows = [
    {
      id: "game-1",
      kickoff: new Date(Date.now() + 86400000).toISOString(), // +1 day
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
    const isAuthorized = event.headers?.['x-secret-header'] === process.env.SCORE_SECRET || qs.open === '1';
    if (!isAuthorized) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Unauthorized', BUNDLE_VERSION }) };
    }

    console.log('Attempting to run nfl-predictions-score...');
    const artifact = await get(ARTIFACT_KEY);
    if (!artifact) {
      const errorMsg = 'Could not find artifact. Run the TRAIN function first.';
      console.warn(errorMsg);
      return { statusCode: 404, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: errorMsg, BUNDLE_VERSION }) };
    }

    const { rows, parlay } = scoreData(artifact);
    const resultData = {
      ok: true,
      updated: new Date().toISOString(),
      rows,
      parlay,
      BUNDLE_VERSION,
      source: "blobs"
    };

    const ok = await set(CURRENT_KEY, resultData);
    if (ok) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, scored: true, rows: rows.length, updated: resultData.updated, BUNDLE_VERSION }) };
    } else {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Failed to write predictions to blob store.', BUNDLE_VERSION }) };
    }
  } catch (err) {
    console.error('Unhandled error in nfl-predictions-score:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: `Unhandled exception: ${String(err)}`, BUNDLE_VERSION }) };
  }
};
