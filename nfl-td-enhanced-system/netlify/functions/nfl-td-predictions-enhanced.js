// netlify/functions/nfl-td-predictions-enhanced.js
// CommonJS Netlify Function. Serves enhanced or lite TD predictions.
// Reads from Netlify Blobs first; falls back to committed JSONs under /data/nfl_r_pipeline/output.

const fs = require('fs/promises');
const path = require('path');

let getStore;
try {
  ({ getStore } = require('@netlify/blobs'));
} catch {
  getStore = null;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const PIPELINE_OUTPUT_DIR = path.join(__dirname, '..', '..', 'data', 'nfl_r_pipeline', 'output');

const STORE_NAME =
  process.env.BLOBS_STORE_TD ||
  process.env.BLOBS_STORE_NFL ||
  'nfl-td-enhanced';

const BLOB_KEYS = {
  lite: 'nfl_td_predictions_lite.json',
  enhanced: 'nfl_td_predictions_enhanced.json',
};

async function readFromBlobs(typeKey) {
  if (!getStore) return null;
  try {
    const store = getStore(STORE_NAME);
    const key = BLOB_KEYS[typeKey];
    if (!key) return null;
    const text = await store.get(key, { type: 'text' });
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    console.warn('[TD] Blobs read failed:', err?.message || err);
    return null;
  }
}

async function readFromDisk(typeKey) {
  const filename =
    typeKey === 'enhanced'
      ? 'nfl_td_predictions_enhanced.json'
      : 'nfl_td_predictions_lite.json';
  const filePath = path.join(PIPELINE_OUTPUT_DIR, filename);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const qp = event.queryStringParameters || {};
  const type = (qp.type || 'lite').toLowerCase();
  const typeKey = type === 'enhanced' ? 'enhanced' : 'lite';

  let data = await readFromBlobs(typeKey);
  if (!data) data = await readFromDisk(typeKey);

  if (!data) {
    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Predictions not available',
        hint: `Populate Netlify Blobs store "${STORE_NAME}" with ${BLOB_KEYS[typeKey]} or commit data/nfl_r_pipeline/output/*.json`,
      }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({
      source: data.source || (getStore ? 'blobs' : 'disk'),
      type: typeKey,
      updated_at: data.updated_at || null,
      payload: data.payload || data,
    }),
  };
};
