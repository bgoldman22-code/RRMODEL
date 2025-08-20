
// patch-over05-v2-2025-08-20/netlify/functions/odds-get.cjs
const { getStore } = require("@netlify/blobs");

const SITE_ID = process.env.NETLIFY_SITE_ID || "967be648-eddc-4cc5-a7cc-e2ab7db8ac75";
const BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263";

function makeStore(name) {
  return getStore({ name, siteID: SITE_ID, token: BLOBS_TOKEN });
}

exports.handler = async function () {
  try {
    const storeName = process.env.BLOBS_STORE || "mlb-odds";
    const store = makeStore(storeName);

    let data = null;
    if (typeof store.getJSON === "function") {
      data = await store.getJSON("mlb-hr-over05.json") || await store.getJSON("latest.json");
    } else {
      const raw = await store.get("mlb-hr-over05.json") || await store.get("latest.json");
      data = raw ? JSON.parse(raw) : null;
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data || { error: "No odds stored yet" }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message||err) }) };
  }
};
