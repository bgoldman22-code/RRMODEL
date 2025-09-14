const { getStore } = require("@netlify/blobs");

exports.handler = async () => {
  try {
    const name = process.env.BLOBS_STORE_NFL || "nfl-td";
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN;
    const store = (siteID && token) ? getStore({ siteID, token, name }) : getStore(name);

    const predictionData = await store.get("predictions/current.json", { type: "json" });
    if (!predictionData) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, rows: [], note: "No predictions yet." }) };
    }
    return { statusCode: 200, body: JSON.stringify(predictionData) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Failed to retrieve predictions.", details: error.message }) };
  }
};
