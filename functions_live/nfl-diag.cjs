// netlify/functions/nfl-diag.cjs
const { getStore } = require("@netlify/blobs");

async function readJson(store, key) {
  try {
    const res = await store.get(key);
    if (!res) return null;
    return JSON.parse(await res.text());
  } catch { return null; }
}

function envMask(k) {
  const v = process.env[k];
  if (!v) return null;
  if (/KEY|TOKEN|SECRET/i.test(k)) return "<set>";
  return v;
}

module.exports.handler = async () => {
  const env = {
    NODE_VERSION: envMask("NODE_VERSION") || process.version,
    NFL_ROSTERS_SOURCE: envMask("NFL_ROSTERS_SOURCE") || "auto",
    NFL_TD_BLOBS: envMask("NFL_TD_BLOBS") || "nfl-td",
    NETLIFY_SITE_ID: envMask("NETLIFY_SITE_ID"),
    NETLIFY_AUTH_TOKEN: envMask("NETLIFY_AUTH_TOKEN"),
    ODDSAPI_BOOKMAKER_NFL: envMask("ODDSAPI_BOOKMAKER_NFL") || "draftkings",
    ODDSAPI_MARKET_NFL: envMask("ODDSAPI_MARKET_NFL") || "player_anytime_td",
    ODDS_API_KEY_NFL: envMask("ODDS_API_KEY_NFL"),
  };

  let store;
  try { store = getStore(env.NFL_TD_BLOBS || "nfl-td"); } catch {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_AUTH_TOKEN;
    if (siteID && token) store = getStore({ name: env.NFL_TD_BLOBS || "nfl-td", siteID, token });
  }

  const depth = store ? await readJson(store, "depth-charts.json") : null;
  const meta = store ? await readJson(store, "meta-rosters.json") : null;
  const teams = depth ? Object.keys(depth).length : 0;

  const next = [];
  if (!teams) next.push("Run /._netlify/functions/nfl-rosters-run to populate depth-charts.json");
  next.push("Check /._netlify/functions/nfl-odds to verify Anytime TD offers");

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      env,
      blobs: { hasDepthCharts: !!depth, teams, meta },
      actions: {
        runRostersNow: "/.netlify/functions/nfl-rosters-run?debug=1",
        checkOddsNow: "/.netlify/functions/nfl-odds?book=draftkings&market=player_anytime_td"
      },
      tips: next
    })
  };
};
