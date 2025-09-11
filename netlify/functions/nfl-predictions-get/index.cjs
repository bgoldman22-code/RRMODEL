// netlify/functions/nfl-predictions-get/index.cjs
// Augmented to blend a learned model (Elo) with market probabilities.
// If the model blob is missing, falls back to your existing market-only logic.

exports.config = { path: "/.netlify/functions/nfl-predictions-get" };

const { getBlobsStore } = require("../_blobs.js");
const { eloWinProb } = require("../lib/elo.js");
const https = require("https");

const STORE = process.env.BLOBS_STORE_NFL || "nfl-td";
const MODEL_BLEND_ALPHA = 0.6; // 60% model, 40% market

function httpJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

function implied(american) {
  if (american == null) return null;
  const a = Number(american);
  if (Number.isNaN(a)) return null;
  if (a < 0) return (-a) / ((-a) + 100);
  return 100 / (a + 100);
}

exports.handler = async (event) => {
  try {
    const season = Number(event.queryStringParameters?.season || new Date().getFullYear());
    const week = event.queryStringParameters?.week;

    // 1) Load model (may be null)
    const store = getBlobsStore(STORE);
    let model = null;
    try {
      const raw = await store.get(`models/nfl/${season}/elo.json`);
      if (raw) model = JSON.parse(raw);
    } catch {}

    // 2) Pull odds+consensus (existing helper endpoint already built in your site)
    //    We also pull schedule to get home/away for mapping.
    const oddsUrl = `https://${event.headers.host}/.netlify/functions/nfl-odds-get`;
    const schedUrl = `https://${event.headers.host}/.netlify/functions/nfl-schedule-get${week ? `?week=${week}&season=${season}` : ""}`;

    const [odds, sched] = await Promise.all([httpJson(oddsUrl), httpJson(schedUrl)]);

    const rows = (odds.games || []).map(g => {
      const id = g.id;
      const home = g.home_team;
      const away = g.away_team;

      // market implied
      const bestHome = g.consensus?.h2h?.home_best?.price ?? null;
      const bestAway = g.consensus?.h2h?.away_best?.price ?? null;
      const mlHomeImp = implied(bestHome);
      const mlAwayImp = implied(bestAway);

      // model win prob
      let modelHome = null, modelAway = null, blendHome = mlHomeImp, blendAway = mlAwayImp, modelSource = "market-only";
      if (model?.elo?.ratings && model?.elo?.hfa != null) {
        const Rh = model.elo.ratings[home] ?? 1500;
        const Ra = model.elo.ratings[away] ?? 1500;
        modelHome = eloWinProb(Rh, Ra, model.elo.hfa);
        modelAway = 1 - modelHome;
        // blend
        if (mlHomeImp != null) {
          blendHome = MODEL_BLEND_ALPHA * modelHome + (1 - MODEL_BLEND_ALPHA) * mlHomeImp;
          blendAway = 1 - blendHome;
          modelSource = "blend(model+market)";
        } else {
          blendHome = modelHome; blendAway = modelAway;
          modelSource = "model-only";
        }
      }

      const spreadTeam = g.consensus?.spreads?.team ?? null;
      const spreadLine = g.consensus?.spreads?.line ?? null;
      const totalSide = g.consensus?.totals?.side ?? null;
      const totalLine = g.consensus?.totals?.line ?? null;

      const pickType = "moneyline";
      const pickTeam = (blendHome ?? mlHomeImp ?? 0.5) >= (blendAway ?? mlAwayImp ?? 0.5) ? home : away;
      const confidence = (pickTeam === home ? (blendHome ?? mlHomeImp ?? 0.5) : (blendAway ?? mlAwayImp ?? 0.5));

      return {
        id,
        kickoff: g.commence_time,
        matchup: `${away} @ ${home}`,
        ml_home_best: bestHome,
        ml_away_best: bestAway,
        ml_home_imp: mlHomeImp,
        ml_away_imp: mlAwayImp,
        model_home: modelHome,
        model_away: modelAway,
        blend_home: blendHome,
        blend_away: blendAway,
        spread_team: spreadTeam,
        spread_line: spreadLine,
        total_side: totalSide,
        total_line: totalLine,
        pick: { type: pickType, team: pickTeam, confidence },
        source: model ? modelSource : "market-only",
      };
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ ok: true, season, updated: new Date().toISOString(), rows }),
    };
  } catch (e) {
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
