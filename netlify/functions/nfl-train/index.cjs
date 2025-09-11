// netlify/functions/nfl-train/index.cjs
exports.config = { includedFiles: ["netlify/functions/**"] };

const { getBlobsStore } = require("../_blobs.js");
const {
  seasonWeight,
  impliedFromEloDiff,
  getNflverseGames,
  ensureTeam,
  updateElo,
  rollSeasonStart,
} = require("../lib/elo.js");

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const season = Number(q.season || new Date().getUTCFullYear());
    const seasonsBack = Number(q.back || 10);
    const rebuild = String(q.rebuild || "0") === "1";

    const seasons = [];
    for (let s = season - seasonsBack + 1; s <= season; s++) seasons.push(s);

    const rows = await getNflverseGames(seasons);

    const ratings = {}; // team -> elo
    let currentSeason = rows.length ? rows[0].season : season;

    for (const g of rows) {
      if (g.season !== currentSeason) {
        // season rollover
        rollSeasonStart(ratings);
        currentSeason = g.season;
      }
      const home = g.home_team;
      const away = g.away_team;
      ensureTeam(ratings, home);
      ensureTeam(ratings, away);

      const homeWon = (g.home_score || 0) > (g.away_score || 0);
      const w = seasonWeight(g.season, season);
      updateElo(ratings, home, away, homeWon, w);
    }

    // Write to blobs
    const store = getBlobsStore(process.env.BLOBS_STORE_NFL || "nfl-td");
    const key = `models/nfl/${season}/elo.json`;
    const doc = {
      season,
      trained_on: seasons,
      updated: new Date().toISOString(),
      ratings,
      meta: {
        k_base: 22,
        hfa: 60,
        retention: 0.80,
        weighting: "current=1.0, last=0.75, -2=0.60, -3=0.50, older exp-decay >=0.25",
      }
    };
    await store.setJSON(key, doc);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ ok: true, season, teams: Object.keys(ratings).length, wrote: key })
    };
  } catch (e) {
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};