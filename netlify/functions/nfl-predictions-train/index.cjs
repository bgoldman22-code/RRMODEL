// netlify/functions/nfl-predictions-train/index.cjs
exports.config = { schedule: null };

const { getBlobsStore } = require('../_blobs.js');

const BUNDLE_VERSION = "predictions-train-v6";

exports.handler = async (event) => {
  try {
    const open = event.queryStringParameters && event.queryStringParameters.open === '1';

    // In your final setup, enforce secret unless ?open=1 for backfill
    if (!open) {
      const sent = (event.headers['x-train-secret'] || event.headers['X-Train-Secret'] || '').trim();
      const need = (process.env.TRAIN_SECRET || '').trim();
      if (!need || sent !== need) {
        return json({ ok:false, error:"Unauthorized. Missing or bad TRAIN_SECRET." });
      }
    }

    const store = getBlobsStore();

    // TODO: Replace this stub with real feature engineering (NFLVerse/ESPN pulls).
    const artifact = {
      updated: new Date().toISOString(),
      note: "Stub artifact to verify blobs IO",
      version: BUNDLE_VERSION,
      // minimal model params; extend as needed
      features: { seasons: 10, recency_bias: { in_season_weeks: 4, season_vs_last: 0.6 } }
    };

    const artifactKey = "nfl/predictions/artifacts/latest.json";
    await store.set(artifactKey, artifact, { contentType: 'application/json' });

    return json({ ok:true, wrote:artifactKey, BUNDLE_VERSION });
  } catch (err) {
    return json({ ok:false, error:String(err), BUNDLE_VERSION });
  }
};

function json(obj) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(obj)
  };
}
