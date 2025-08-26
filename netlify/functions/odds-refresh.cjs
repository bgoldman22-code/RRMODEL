// CommonJS Netlify Functions (.cjs) — compatible with package.json "type":"module"
// Uses built-in fetch (Node 18+) — no 'node-fetch' dep
// Explicit Netlify Blobs credentials so it works in any runtime
const { getStore } = require("@netlify/blobs");

const SITE_ID = process.env.NETLIFY_SITE_ID || "967be648-eddc-4cc5-a7cc-e2ab7db8ac75";
const BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263";

function makeStore(name) {
  if (!SITE_ID || !BLOBS_TOKEN) {
    throw new Error("Missing NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN");
  }
  // Use two-arg form to avoid SDK complaining about env
  return getStore({ name: name, siteID: SITE_ID, token: BLOBS_TOKEN });
}

exports.handler = async function(){
  try {
    const storeName = process.env.BLOBS_STORE || "mlb-odds";
    const store = makeStore(storeName);
    const stamp = { ok:true, refreshed: new Date().toISOString() };
    await store.setJSON("latest-refresh.json", stamp);
    return { statusCode: 200, body: JSON.stringify(stamp) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message||err) }) };
  }
};
