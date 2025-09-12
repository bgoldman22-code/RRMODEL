// netlify/functions/nfl-predictions-train/index.cjs
exports.config = {
  includedFiles: []
};

const { set } = require('../_blobs.js');

const ARTIFACT_KEY   = 'nfl/predictions/artifacts/latest.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v6';

async function fetchAndProcessData() {
  // TODO: replace this mock with real loader + feature engineering
  return {
    meta: {
      lastUpdated: new Date().toISOString(),
      sampleSize: 10,
      notes: "Mock artifact to validate store write + JSON contract."
    },
    historicalData: [
      { id: 'game-1', matchup: 'GB @ MIN', outcome: 'GB Win' },
      { id: 'game-2', matchup: 'KC @ DEN', outcome: 'KC Win' }
    ]
  };
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const open = String(qs.open || "") === "1";
    const okAuth = open || (event.headers['x-secret-header'] && event.headers['x-secret-header'] === process.env.TRAIN_SECRET);

    if (!okAuth) {
      return {
        statusCode: 401,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Unauthorized', BUNDLE_VERSION })
      };
    }

    const artifact = await fetchAndProcessData(); // never throws in mock
    const wrote = await set(ARTIFACT_KEY, artifact);

    if (!wrote) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Failed to write artifact', key: ARTIFACT_KEY, BUNDLE_VERSION })
      };
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, wrote: ARTIFACT_KEY, BUNDLE_VERSION })
    };
  } catch (err) {
    console.error("[train] unhandled:", err && err.stack || err);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION })
    };
  }
};