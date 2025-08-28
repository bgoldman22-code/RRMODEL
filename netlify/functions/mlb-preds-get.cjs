// netlify/functions/mlb-preds-get.cjs
const { getStore, getJSON } = require('./_blobs.js');

exports.handler = async (event) => {
  try {
    const params = event?.queryStringParameters || {};
    const date = params.date || new Date().toISOString().slice(0,10);
    const store = getStore(process.env.BLOBS_STORE || 'mlb-odds');

    const slate = await getJSON(store, `mlb:preds:${date}.json`);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, date, slate })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
