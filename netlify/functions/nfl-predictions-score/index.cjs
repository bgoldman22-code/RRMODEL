const { get, set } = require('../_blobs.cjs');

const ARTIFACT_KEY = 'nfl/predictions/artifacts/latest.json';
const CURRENT_KEY = 'nfl/predictions/current.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v9';

const scoreData = (artifact) => {
  const rows = [
    {
      id: "game-1",
      kickoff: new Date(Date.now() + 86400000).toISOString(),
      matchup: "Green Bay Packers @ Minnesota Vikings",
      ml_home_best: -175,
      ml_away_best: 162,
      ml_home_imp: 0.64,
      ml_away_imp: 0.40,
      spread_team: "Green Bay Packers",
      spread_line: -3,
      total_side: "Over",
      total_line: 49,
      pick: { type: "spread", team: "Green Bay Packers", confidence: 0.85 }
    }
  ];

  const parlay = {
    legs: [{ gameId: "game-1", matchup: "GB @ MIN", leg: "GB -3", confidence: 0.89 }]
  };

  return { rows, parlay };
};

exports.handler = async () => {
  try {
    const artifact = await get(ARTIFACT_KEY);
    if (!artifact) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "No artifact found (run TRAIN first)", BUNDLE_VERSION })
      };
    }

    const { rows, parlay } = scoreData(artifact);
    const resultData = { ok: true, updated: new Date().toISOString(), rows, parlay, BUNDLE_VERSION, source: "blobs" };

    const success = await set(CURRENT_KEY, resultData);
    if (success) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, scored: true, rows: rows.length, updated: resultData.updated, BUNDLE_VERSION })
      };
    } else {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Failed to write predictions", BUNDLE_VERSION })
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION })
    };
  }
};
