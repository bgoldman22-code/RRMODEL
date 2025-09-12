// netlify/functions/nfl-predictions-diag/index.cjs
const { set, get, storeName } = require('../_blobs.js');
const KEY = 'nfl/predictions/__diag.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v9';

exports.handler = async () => {
  try {
    const writeVal = { ok:true, ts: Date.now(), ver: BUNDLE_VERSION };
    const wrote = await set(KEY, writeVal);
    const read = await get(KEY);
    const env = {
      node: process.version,
      BLOBS_STORE_NFL: process.env.BLOBS_STORE_NFL || null,
      NETLIFY_SITE_ID: !!process.env.NETLIFY_SITE_ID,
      NETLIFY_BLOBS_TOKEN: !!process.env.NETLIFY_BLOBS_TOKEN
    };
    return { statusCode: 200, headers:{'content-type':'application/json'},
      body: JSON.stringify({ ok:true, env, info:{ key: KEY, wrote, read }, storeName, BUNDLE_VERSION })};
  } catch (e) {
    return { statusCode: 200, headers:{'content-type':'application/json'},
      body: JSON.stringify({ ok:false, error:String(e), BUNDLE_VERSION })};
  }
};
