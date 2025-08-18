// netlify/functions/odds-get.js (CommonJS)
const { getStore } = require("@netlify/blobs");
function initStore(){
  const name = process.env.BLOBS_STORE || "mlb-odds";
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}
exports.handler = async () => {
  try {
    const store = initStore();
    const s = await store.get("latest.json");
    if (!s) return { statusCode: 404, body: JSON.stringify({ ok:false, error:"no snapshot for latest.json" }) };
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: s };
  } catch (e){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
