// netlify/functions/nfl-train/index.cjs
exports.config = { path: "/.netlify/functions/nfl-train" };

const { getBlobsStore } = require("../_blobs.js");
const {
  fetchNflverseGamesCsvGz,
  parseCsv,
  initRatings,
  updateElo,
  seasonFromDate,
} = require("../lib/elo.js");

const STORE = process.env.BLOBS_STORE_NFL || "nfl-td";
const MODEL_KEY = (season) => `models/nfl/${season}/elo.json`;

exports.handler = async (event) => {
  try {
    const season = Number(event.queryStringParameters?.season || new Date().getFullYear());
    const rebuild = !!event.queryStringParameters?.rebuild;

    const store = getBlobsStore(STORE);
    if (!rebuild) {
      const existing = await store.get(MODEL_KEY(season));
      if (existing) {
        return ok({ season, already: true, note: "Model exists (use ?rebuild=1 to force)" });
      }
    }

    const csv = await fetchNflverseGamesCsvGz();
    const rows = parseCsv(csv)
      .filter(r => r.season && Number(r.season) <= season && r.home_team && r.away_team && r.home_score && r.away_score)
      .sort((a,b) => new Date(a.game_date) - new Date(b.game_date));

    // keep last ~10 seasons for training context
    const minSeason = season - 10;
    const train = rows.filter(r => Number(r.season) >= minSeason);

    // Build team set
    const teams = Array.from(new Set(train.flatMap(r => [r.home_team, r.away_team])));
    const ratings = initRatings(teams);

    // Simple Elo with fixed params; safe defaults
    const K = 22;
    const HFA = 60;

    for (const g of train) {
      const home = g.home_team;
      const away = g.away_team;
      const hs = Number(g.home_score);
      const as = Number(g.away_score);
      if (Number.isFinite(hs) && Number.isFinite(as)) {
        updateElo(ratings, home, away, hs, as, K, HFA);
      }
    }

    const model = {
      season,
      trained_at: new Date().toISOString(),
      elo: { ratings, k: K, hfa: HFA },
      meta: { source: "nflverse/games.csv.gz", span: `${minSeason}-${season}` }
    };

    await store.setJSON(MODEL_KEY(season), model);
    return ok({ season, teams: Object.keys(ratings).length, wrote: MODEL_KEY(season) });
  } catch (e) {
    return err(e);
  }
};

function ok(data) {
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, ...data }) };
}
function err(e) {
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) };
}
