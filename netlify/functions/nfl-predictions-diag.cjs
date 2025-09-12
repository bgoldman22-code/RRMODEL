// netlify/functions/nfl-predictions-diag.cjs
const BUNDLE_VERSION = "predictions-2025-09-12-v7";
function json(statusCode, obj) { return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) }; }

exports.handler = async () => {
  try {
    const env = {
      node: process.version,
      BLOBS_STORE_NFL: process.env.BLOBS_STORE_NFL || null,
      NETLIFY_SITE_ID: !!process.env.NETLIFY_SITE_ID,
      NETLIFY_BLOBS_TOKEN: !!process.env.NETLIFY_BLOBS_TOKEN
    };
    let info = {};
    try {
      const { getStore } = require("@netlify/blobs");
      const store = getStore({ name: process.env.BLOBS_STORE_NFL || "rrmodelblobs", siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
      const key = "nfl/predictions/__diag.json";
      const stamp = { ok:true, ts: Date.now(), ver:BUNDLE_VERSION };
      await store.set(key, JSON.stringify(stamp));
      const got = await store.get(key, { type:"json" }).catch(()=>null);
      info = { key, wrote:true, read:got };
    } catch (e) {
      return json(500, { ok:false, stage:"@netlify/blobs", error:String(e), env, BUNDLE_VERSION });
    }
    return json(200, { ok:true, env, info, BUNDLE_VERSION });
  } catch (err) {
    return json(500, { ok:false, error:String(err), BUNDLE_VERSION });
  }
};