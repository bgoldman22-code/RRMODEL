// netlify/functions/nfl-predictions-diag/index.cjs
const { get, set } = require('../_blobs');
const BUNDLE_VERSION = 'predictions-2025-09-12-v9';
const KEY = 'nfl/predictions/__diag.json';

exports.handler = async () => {
  try {
    const stamp = { ok:true, ts: Date.now(), ver: BUNDLE_VERSION };
    await set(KEY, stamp);
    const read = await get(KEY);
    const env = {
      node: process.version,
      BLOBS_STORE_NFL: process.env.BLOBS_STORE_NFL || null,
      NETLIFY_SITE_ID: !!process.env.NETLIFY_SITE_ID,
      NETLIFY_BLOBS_TOKEN: !!process.env.NETLIFY_BLOBS_TOKEN,
      NFL_SCHEDULE_URL: process.env.NFL_SCHEDULE_URL || null,
      NFL_ODDS_BRIDGE_URL: process.env.NFL_ODDS_BRIDGE_URL || null
    };
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok:true, env, info: { key: KEY, wrote: true, read }, BUNDLE_VERSION }) };
  } catch (e) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok:false, error:String(e), BUNDLE_VERSION }) };
  }
};
