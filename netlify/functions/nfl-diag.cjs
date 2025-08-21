// netlify/functions/nfl-diag.cjs
// Returns diagnostics for NFL TD pipeline: envs, blobs depth charts status, odds probe.

const { getStore } = require("@netlify/blobs");

async function readBlobJson(store, key) {
  try {
    const res = await store.get(key);
    if (!res) return null;
    const txt = await res.text();
    return JSON.parse(txt);
  } catch (_) {
    return null;
  }
}

function envPick(k) {
  const v = process.env[k];
  if (!v) return null;
  if (/TOKEN|KEY|SECRET/i.test(k)) return "<set>";
  return v;
}

module.exports.handler = async () => {
  const STORE_NAME = process.env.NFL_TD_BLOBS || "nfl-td";
  let store;
  try {
    store = getStore(STORE_NAME);
  } catch (e) {
    // Option B manual creds
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_AUTH_TOKEN;
    if (siteID && token) store = getStore({ name: STORE_NAME, siteID, token });
  }

  // Read blobs if possible
  let depthCharts = null, meta = null;
  if (store) {
    depthCharts = await readBlobJson(store, "depth-charts.json");
    meta = await readBlobJson(store, "meta-rosters.json");
  }

  // Probe odds function via local call is not possible here reliably;
  // instead expose the URL to hit and return key env values.
  const env = {
    NODE_VERSION: envPick("NODE_VERSION"),
    NFL_ROSTERS_SOURCE: envPick("NFL_ROSTERS_SOURCE") || "auto",
    NFL_TD_BLOBS: envPick("NFL_TD_BLOBS") || STORE_NAME,
    NETLIFY_SITE_ID: envPick("NETLIFY_SITE_ID") ? "<set>" : null,
    NETLIFY_AUTH_TOKEN: envPick("NETLIFY_AUTH_TOKEN") ? "<set>" : null,
    ODDSAPI_BOOKMAKER_NFL: envPick("ODDSAPI_BOOKMAKER_NFL") || "draftkings",
    ODDSAPI_MARKET_NFL: envPick("ODDSAPI_MARKET_NFL") || "player_anytime_td",
    ODDS_API_KEY_NFL: envPick("ODDS_API_KEY_NFL") ? "<set>" : null
  };

  const teams = depthCharts ? Object.keys(depthCharts).length : 0;

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      env,
      blobs: {
        store: STORE_NAME,
        hasDepthCharts: !!depthCharts,
        teams,
        meta
      },
      oddsEndpoint: "/.netlify/functions/nfl-odds?book=draftkings&market=player_anytime_td",
      tips: [
        "Set ODDS_API_KEY_NFL in env to enable live offers.",
        "Ensure NFL_ROSTERS_SOURCE=auto (or espn) so blobs depth-charts.json stays fresh.",
        "Use /._netlify/functions/nfl-rosters-run?debug=1 if teams=0."
      ]
    })
  };
};
