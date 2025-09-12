'use strict';
const { getStore } = require("@netlify/blobs");

function getNflStore() {
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  if (siteID && token) return getStore(name, { siteID, token });
  return getStore(name);
}

function storeDiag() {
  return {
    storeName: process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td",
    hasSiteId: !!process.env.NETLIFY_SITE_ID,
    hasToken: !!process.env.NETLIFY_API_TOKEN,
    hasInternalFunctionsUrl: !!process.env.INTERNAL_FUNCTIONS_URL,
    url: process.env.URL || null,
    deployUrl: process.env.DEPLOY_URL || null,
    node: process.version
  };
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
