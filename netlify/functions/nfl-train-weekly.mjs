// netlify/functions/nfl-train-weekly.mjs
// Scheduled function (e.g., Tuesdays) that ingests last week's games and performs online updates
import { loadModels, saveModels } from "./_ml/nfl-model.mjs";
import { getNFLStore } from "./_blobs.mjs";
import { buildGameFeatures } from "./_ml/features-nfl.mjs";

async function readJSON(key) {
  const store = getNFLStore();
  try { return await store.get(key, { type: "json" }); } catch (_) { return null; }
}

function outcomeToTargets(game) {
  const margin = (game.homeScore ?? game.home_points ?? 0) - (game.awayScore ?? game.away_points ?? 0);
  return { y_ml: margin > 0 ? 1 : 0, y_spread: margin };
}

async function getFinalGames({ season, week }) {
  const sched = await readJSON(`weeks/${season}/${week}/schedule.json`) || [];
  // Normalize schema
  return sched.filter(g => (g.status?.toLowerCase?.() === "final") || g.isFinal || g.final)
              .map(g => ({
                homeTeam: g.homeTeam || g.home || g.home_abbr || g.home_abbrev,
                awayTeam: g.awayTeam || g.away || g.away_abbr || g.away_abbrev,
                homeScore: g.homeScore ?? g.home_score ?? g.home_points ?? 0,
                awayScore: g.awayScore ?? g.away_score ?? g.away_points ?? 0,
              }))
              .filter(g => g.homeTeam && g.awayTeam);
}

export default async (req, context) => {
  try {
    const now = new Date();
    const season = Number(req.queryStringParameters?.season) || now.getUTCFullYear();
    const weekQ = req.queryStringParameters?.week;
    const week = weekQ ? Number(weekQ) : null;

    const { ml, sp, snapshot } = await loadModels();

    // Determine which week to train – default: last completed week
    const w = week || await autoDetectLastCompletedWeek(season);
    const games = await getFinalGames({ season, week: w });

    let trained = 0;
    for (const g of games) {
      const x = await buildGameFeatures({ season, week: w, home: g.homeTeam, away: g.awayTeam });
      const { y_ml, y_spread } = outcomeToTargets(g);
      ml.update(x, y_ml);
      sp.update(x, y_spread);
      trained += 1;
    }
    await saveModels({ ml, sp, snapshot, deltaGames: trained });

    return new Response(JSON.stringify({ ok: true, season, week: w, trained }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e.stack || e) }), { status: 500 });
  }
}

async function autoDetectLastCompletedWeek(season) {
  // look for highest week with schedule.json present in Blobs, then pick the last one whose games are final
  const store = getNFLStore();
  const listing = await store.list({ prefix: `weeks/${season}/` });
  const weeks = new Set((listing.objects || []).map(o => Number((o.key.split("/")[2] || "0"))).filter(n => Number.isFinite(n)));
  const sorted = Array.from(weeks).sort((a,b)=>a-b);
  return sorted.length ? sorted[sorted.length - 1] : 1;
}
