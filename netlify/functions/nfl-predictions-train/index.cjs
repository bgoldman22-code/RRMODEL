const { set } = require('../_blobs.cjs');

const ARTIFACT_KEY = 'nfl/predictions/artifacts/latest.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v9';

const fetchAndProcessData = async () => {
  return {
    meta: {
      lastUpdated: new Date().toISOString(),
      sampleSize: 10,
      notes: "Mock artifact for testing."
    },
    historicalData: [
      { id: 'game-1', matchup: 'GB @ MIN', outcome: 'GB Win' },
      { id: 'game-2', matchup: 'KC @ DEN', outcome: 'KC Win' }
    ]
  };
};

exports.handler = async () => {
  try {
    const artifactData = await fetchAndProcessData();
    const success = await set(ARTIFACT_KEY, artifactData);

    if (success) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, wrote: ARTIFACT_KEY, BUNDLE_VERSION })
      };
    } else {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Failed to write artifact", BUNDLE_VERSION })
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
