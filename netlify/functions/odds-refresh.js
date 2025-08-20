const fetch = require("node-fetch");
const { getStore } = require("@netlify/blobs");

const SITE_ID = process.env.NETLIFY_SITE_ID || "967be648-eddc-4cc5-a7cc-e2ab7db8ac75";
const BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263";

exports.handler = async function () {
  try {
    const storeName = process.env.BLOBS_STORE || "mlb-odds";

    const store = getStore({
      name: storeName,
      siteID: SITE_ID,
      token: BLOBS_TOKEN,
    });

    const resp = await fetch("https://api.the-odds-api.com/v4/sports/baseball_mlb/odds", {
      headers: { "x-api-key": process.env.THEODDS_API_KEY },
    });

    if (!resp.ok) throw new Error(`OddsAPI error: ${resp.statusText}`);

    const data = await resp.json();
    await store.setJSON("latest-refresh.json", data);

    return { statusCode: 200, body: JSON.stringify({ ok: true, count: data.length }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
