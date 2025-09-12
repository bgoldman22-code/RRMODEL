// netlify/functions/nfl-predictions-train/index.cjs
const { set } = require('../_blobs');

const ARTIFACT_KEY = 'nfl/predictions/artifacts/latest.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v5';

// Placeholder for real training that fetches + processes NFLVerse/ESPN/Odds.
const fetchAndProcessData = async () => {
  console.log('Starting data fetching and processing...');

  // TODO: Replace with real ingestion + feature engineering.
  const artifact = {
    meta: {
      lastUpdated: new Date().toISOString(),
      sampleSize: 10,
      notes: "Mock artifact — replace with real training output."
    },
    historicalData: [
      { id: 'game-1', matchup: 'GB @ MIN', outcome: 'GB Win' },
      { id: 'game-2', matchup: 'KC @ DEN', outcome: 'KC Win' }
    ]
  };

  return artifact;
};

exports.handler = async (event) => {
  // TEMPORARY: allow open run via ?open=1 (no secret).
  const isAuthorized = (event.queryStringParameters && event.queryStringParameters.open === '1')
    || event.headers['x-secret-header'] === process.env.TRAIN_SECRET;

  if (!isAuthorized) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Unauthorized', BUNDLE_VERSION })
    };
  }

  try {
    console.log('Attempting to run nfl-predictions-train...');
    const artifactData = await fetchAndProcessData();
    const success = await set(ARTIFACT_KEY, artifactData);

    if (success) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, wrote: ARTIFACT_KEY, BUNDLE_VERSION })
      };
    } else {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Failed to write artifact to blob store.', BUNDLE_VERSION })
      };
    }
  } catch (err) {
    console.error('Unhandled error in nfl-predictions-train:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: `Unhandled exception: ${String(err)}`, BUNDLE_VERSION })
    };
  }
};
