// netlify/functions/mlb-preds-get.cjs
const { getBlobsStore } = require('./_blobs.js'); // <- use the unified helper

async function handler(event) {
  const qs = event && event.queryStringParameters || {};
  const date = qs.date || new Date().toISOString().slice(0,10);
  const debug = qs.debug === '1' || qs.debug === 'true';

  try {
    // EXAMPLE skeleton — keep your existing logic here.
    // Make sure any blobs access goes through getBlobsStore('mlb-odds') or your chosen store name.
    const store = getBlobsStore(process.env.BLOBS_STORE || 'mlb-odds');

    // ... your current code that builds rows, attaches meta.weather & meta.bvp, etc.

    // Return the same shape your frontend expects:
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, date /*, rows, info, etc. */ })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
}

exports.handler = handler;
