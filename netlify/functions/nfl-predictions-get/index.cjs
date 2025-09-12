'use strict';
const { getStore } = require("@netlify/blobs");

exports.handler = async () => {
  try {
    const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
    const store = getStore(storeName);
    const predictionData = await store.get("predictions/current.json", { type: "json" });

    if (!predictionData) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, message: "Prediction data not found." }) };
    }

    return { statusCode: 200, body: JSON.stringify(predictionData) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Failed to retrieve predictions.", details: error.message }) };
  }
};
