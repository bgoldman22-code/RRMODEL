// netlify/functions/nfl-rosters-get.cjs
// Return depth-charts.json from Netlify Blobs so the frontend can use it.
const { getStore } = require("@netlify/blobs");

exports.handler = async () => {
  try {
    const storeName = process.env.NFL_TD_BLOBS || "nfl-td";
    const store = getStore(storeName);
    const key = "depth-charts.json";
    const json = await store.get(key, { type: "json" });
    if (!json) {
      return { statusCode: 200, body: JSON.stringify({ ok:false, error:"missing_depth_charts", store:storeName, key }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok:true, store: storeName, key, teams: Array.isArray(json?.teams) ? json.teams.length : Object.keys(json||{}).length, depthCharts: json }) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
