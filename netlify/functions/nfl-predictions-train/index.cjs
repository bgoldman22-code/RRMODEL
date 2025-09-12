// netlify/functions/nfl-predictions-train/index.cjs
const { set } = require('../_blobs');

const ARTIFACT_KEY = 'nfl/predictions/artifacts/latest.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v5';

// Placeholder for real data fetching (NFLVerse/ESPN/Odds). Replace later.
async function fetchAndProcessData() {
  console.log('Starting data fetching and processing (mock)...');
  const artifact = {
    meta: {
      lastUpdated: new Date().toISOString(),
      sampleSize: 10,
      notes: "Mock artifact created by TRAIN function (replace with real pipeline)."
    },
    historicalData: [
      { id: 'game-1', matchup: 'GB @ MIN', outcome: 'GB Win' },
      { id: 'game-2', matchup: 'KC @ DEN', outcome: 'KC Win' }
    ]
  };
  return artifact;
}

exports.handler = async (event) => {
  try {
    // Temporary, tokenless access for testing with ?open=1
    const qs = event.queryStringParameters || {};
    const isAuthorized = event.headers?.['x-secret-header'] === process.env.TRAIN_SECRET || qs.open === '1';
    if (!isAuthorized) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Unauthorized', BUNDLE_VERSION }) };
    }

    console.log('Attempting to run nfl-predictions-train...');
    const artifactData = await fetchAndProcessData();
    const ok = await set(ARTIFACT_KEY, artifactData);

    if (ok) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, wrote: ARTIFACT_KEY, BUNDLE_VERSION }) };
    } else {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Failed to write artifact to blob store.', BUNDLE_VERSION }) };
    }
  } catch (err) {
    console.error('Unhandled error in nfl-predictions-train:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: `Unhandled exception: ${String(err)}`, BUNDLE_VERSION }) };
  }
};
