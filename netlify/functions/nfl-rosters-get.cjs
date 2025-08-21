// netlify/functions/nfl-rosters-get.cjs
const { getStore } = require("@netlify/blobs");

const CANDIDATE_KEYS = [
  "depth-charts.json",
  "depthCharts.json",
  "nfl/depth-charts.json",
  "rosters/depth-charts.json",
  "data/depth-charts.json"
];

exports.handler = async (event) => {
  try {
    const qs = event?.queryStringParameters || {};
    const debug = qs.debug === "1" || qs.debug === "true";

    const storeName = process.env.NFL_TD_BLOBS || "nfl-td";
    const store = getStore(storeName);

    // try keys in order
    for (const key of CANDIDATE_KEYS) {
      try {
        const json = await store.get(key, { type: "json" });
        if (json) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              ok: true,
              store: storeName,
              key,
              teams: Array.isArray(json?.teams) ? json.teams.length : (json?.length || Object.keys(json||{}).length),
              depthCharts: json
            })
          };
        }
      } catch (e) {
        if (debug) console.log("get error for", key, String(e));
      }
    }

    // Enumerate all keys to help debug
    let listed = [];
    try {
      for await (const entry of store.list()) {
        listed.push({ key: entry.key, size: entry.size });
      }
    } catch (e) {
      if (debug) console.log("list error", String(e));
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: false,
        error: "missing_depth_charts",
        store: storeName,
        tried: CANDIDATE_KEYS,
        listed
      })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
