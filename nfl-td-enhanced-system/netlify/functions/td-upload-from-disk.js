// netlify/functions/td-upload-from-disk.js
// One-off admin function: reads JSONs from /data/nfl_r_pipeline/output and uploads into Netlify Blobs.
// **Disable or delete after first use.**

const fs = require('fs/promises');
const path = require('path');
const { getStore } = require('@netlify/blobs');

const PIPELINE_OUTPUT_DIR = path.join(__dirname, '..', '..', 'data', 'nfl_r_pipeline', 'output');

const STORE_NAME =
  process.env.BLOBS_STORE_TD ||
  process.env.BLOBS_STORE_NFL ||
  'nfl-td-enhanced';

const files = {
  lite: 'nfl_td_predictions_lite.json',
  enhanced: 'nfl_td_predictions_enhanced.json',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Use POST' };
  }
  try {
    const store = getStore(STORE_NAME);
    const results = {};
    for (const [key, fname] of Object.entries(files)) {
      const p = path.join(PIPELINE_OUTPUT_DIR, fname);
      const raw = await fs.readFile(p, 'utf-8');
      await store.set(fname, raw, { metadata: { uploaded_by: 'td-upload-from-disk' } });
      results[key] = { key: fname, bytes: Buffer.byteLength(raw, 'utf8') };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, store: STORE_NAME, results }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
