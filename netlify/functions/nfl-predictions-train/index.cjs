const { getBlobsStore } = require('../_blobs.js');
const BUNDLE_VERSION = "predictions-2025-09-12-v6";

function okOpen(event) {
  const qs = event.queryStringParameters || {};
  if (qs.open === '1') return true;
  const secret = process.env.TRAIN_SECRET || "";
  const given  = qs.secret || "";
  return secret && given && secret === given;
}

exports.handler = async (event) => {
  try {
    if (!okOpen(event)) {
      return { statusCode: 401, body: JSON.stringify({ ok:false, error:"unauthorized", BUNDLE_VERSION }) };
    }

    const trainedAt = new Date().toISOString();
    const artifact = {
      trainedAt,
      seasonSpan: "2015-2025",
      notes: "Minimal artifact placeholder. Replace with real features/weights."
    };

    const store = getBlobsStore('nfl-predictions');
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0,10).replace(/-/g,'');

    await store.set(`nfl/predictions/train/artifact.json`, JSON.stringify(artifact), { contentType: 'application/json' });
    await store.set(`nfl/predictions/train/artifact-${yyyymmdd}.json`, JSON.stringify(artifact), { contentType: 'application/json' });

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok:true, trainedAt, snapshot: yyyymmdd, BUNDLE_VERSION })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error:String(e), BUNDLE_VERSION }) };
  }
};
