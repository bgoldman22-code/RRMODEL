const { getBlobsStore } = require('../_blobs.js');
const BUNDLE_VERSION = "predictions-2025-09-12-v6";

async function fetchOddsAndSchedule() {
  return { rows: [] };
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    if (!(qs.open === '1')) {
      // optional secret enforcement here
    }

    const store = getBlobsStore('nfl-predictions');

    const artTxt = await store.get('nfl/predictions/train/artifact.json');
    const artifact = artTxt ? JSON.parse(artTxt) : null;

    const { rows } = await fetchOddsAndSchedule();

    let finalRows = rows;
    const prevTxt = await store.get('nfl/predictions/current.json');
    if ((!rows || rows.length === 0) && prevTxt) {
      const prev = JSON.parse(prevTxt);
      finalRows = prev.rows || [];
    }

    const payload = {
      updated: new Date().toISOString(),
      rows: finalRows,
      notes: artifact ? `Using artifact trainedAt=${artifact.trainedAt}` : 'No artifact found (cold start)',
      source: 'blobs'
    };

    await store.set('nfl/predictions/current.json', JSON.stringify(payload), { contentType: 'application/json' });

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok:true, scored:true, ...payload, BUNDLE_VERSION })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error:String(e), BUNDLE_VERSION }) };
  }
};
