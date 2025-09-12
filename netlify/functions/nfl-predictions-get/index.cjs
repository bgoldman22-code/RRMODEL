'use strict';
const { getStore } = require("@netlify/blobs");

function getNflStore() {
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
  try {
    // Works when Netlify injects Blobs context (Production, most contexts)
    return getStore(name);
  } catch (e) {
    // Manual fallback for contexts where Blobs isn't injected (some previews/local)
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN;
    if (!siteID || !token) {
      const msg = "Blobs context missing and no manual credentials provided. Set NETLIFY_SITE_ID and NETLIFY_API_TOKEN.";
      const err = new Error(msg);
      err.code = "MISSING_BLOBS_CREDS";
      throw err;
    }
    return getStore(name, { siteID, token });
  }
}

exports.handler = async () => {
  try {
    const store = getNflStore();
    const predictionData = await store.get("predictions/current.json", { type: "json" });

    if (!predictionData) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, message: "Prediction data not found." }) };
    }

    return { statusCode: 200, body: JSON.stringify(predictionData) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Failed to retrieve predictions.", details: error.message }) };
  }
};
