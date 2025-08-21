// netlify/functions/nfl-odds-diag.cjs
// Lightweight diagnostics for odds pipeline (env + suggested test URLs)
const DEFAULT_MARKET_ALIASES = [
  "player_anytime_td",
  "player_touchdown_anytime",
  "anytime_td",
  "touchdown_scorer_anytime"
];

const pick = (env, def) => {
  const v = (env ?? "").toString().trim();
  return v || def;
};

exports.handler = async (event) => {
  const sport = "americanfootball_nfl";
  const bookmaker = pick(process.env.ODDSAPI_BOOKMAKER_NFL, "draftkings").toLowerCase();
  const marketPref = pick(process.env.ODDSAPI_MARKET_NFL, "player_anytime_td").toLowerCase();
  const marketsToTry = Array.from(new Set([marketPref, ...DEFAULT_MARKET_ALIASES]));
  const hasKey = !!(process.env.ODDS_API_KEY_NFL || process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY);

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      env: {
        NODE_VERSION: process.env.NODE_VERSION || null,
        ODDSAPI_BOOKMAKER_NFL: bookmaker,
        ODDSAPI_MARKET_NFL: marketPref,
        ODDS_API_KEY_NFL: hasKey ? "<set>" : null
      },
      testUrls: {
        odds: "/.netlify/functions/nfl-odds?book=draftkings&market=player_anytime_td&debug=1"
      },
      notes: [
        "If offers=[], UI should render model-only. This is expected early in Week 1 windows until APIs fill.",
        "Market aliases tried in order: " + marketsToTry.join(", ")
      ]
    })
  };
};
