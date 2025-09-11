// netlify/functions/nfl-predictions-get/index.cjs

exports.config = {
  includedFiles: ["netlify/functions/nfl-predictions-get/_data/**"]
};

const path = require("path");
const fs = require("fs/promises");

const BUNDLE_VERSION = "2025-09-11-PR1";
const LOCAL_BASE = path.join(__dirname, "_data");

async function readJson(p) {
  try {
    const s = await fs.readFile(p, "utf8");
    return JSON.parse(s);
  } catch (_e) {
    return null;
  }
}

// Load predictions JSON with fallback chain
async function loadPredictions(season, week) {
  // 1) week file: /_data/2025/week2.json
  const wk = path.join(LOCAL_BASE, String(season), `week${week}.json`);
  const wj = await readJson(wk);
  if (wj?.games) return { ...wj, source: `local:${path.relative(process.cwd(), wk)}` };

  // 2) season-level current: /_data/2025/current.json (if you decide to use it later)
  const curr = path.join(LOCAL_BASE, String(season), "current.json");
  const cj = await readJson(curr);
  if (cj?.games) return { ...cj, source: `local:${path.relative(process.cwd(), curr)}` };

  // 3) generic fallback: /_data/current.json
  const gen = path.join(LOCAL_BASE, "current.json");
  const gj = await readJson(gen);
  if (gj?.games) return { ...gj, source: `local:${path.relative(process.cwd(), gen)}` };

  return null;
}

// Very lightweight server-side parlay builder using provided model outputs
function buildParlays(pred) {
  const games = Array.isArray(pred?.games) ? pred.games : [];
  // filter out picks with confidence scores
  const moneylineCandidates = games
    .map(g => {
      const pHome = Number(g.win_prob_home);
      const pAway = 1 - pHome;
      // choose side with higher prob
      if (Number.isFinite(pHome) && Number.isFinite(pAway)) {
        const side = pHome >= 0.5 ? "HOME" : "AWAY";
        const prob = pHome >= 0.5 ? pHome : pAway;
        const team = side === "HOME" ? g.home : g.away;
        return { game_id: g.game_id, team, side, prob, confidence: g.confidence || prob, kickoff: g.start_iso };
      }
      return null;
    })
    .filter(Boolean)
    // avoid extremes crowding: prefer 0.58–0.70 window for parlays to trade payout/edge
    .filter(x => x.prob >= 0.58 && x.prob <= 0.72);

  // naive de-duplications across games (already unique), sort by confidence desc
  moneylineCandidates.sort((a,b) => (b.confidence - a.confidence) || (b.prob - a.prob));

  const legs3 = moneylineCandidates.slice(0,3);
  const legs5 = moneylineCandidates.slice(0,5);

  return {
    legs3,
    legs5
  };
}

exports.handler = async (event) => {
  try {
    const season = Number(event.queryStringParameters?.season || 2025);
    const week   = Number(event.queryStringParameters?.week   || 2);

    const pred = await loadPredictions(season, week);

    if (!pred?.games?.length) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({ ok: false, error: "No predictions found", season, week, BUNDLE_VERSION })
      };
    }

    const parlays = buildParlays(pred);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ ok: true, season, week, source: pred.source, BUNDLE_VERSION, ...pred, parlays })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION })
    };
  }
};