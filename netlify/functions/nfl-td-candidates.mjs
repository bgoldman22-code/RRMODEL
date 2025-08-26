// netlify/functions/nfl-td-candidates.mjs
import { fetchJSON, jsonResponse, getInt } from "./_lib/http.mjs";

async function getSchedule(origin, season, week) {
  const u = `${origin}/.netlify/functions/nfl-bootstrap?season=${season}&week=${week}&debug=0`;
  const j = await fetchJSON(u, { timeoutMs: 12000 });
  return j?.schedule?.games || [];
}

async function getRosters(origin, season, week) {
  const u = `${origin}/.netlify/functions/nfl-rosters?season=${season}&week=${week}&debug=0`;
  const j = await fetchJSON(u, { timeoutMs: 15000 });
  return j?.rosters || {};
}

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const qs = url.searchParams;
    const debug = qs.get("debug") === "1";
    const season = getInt(qs, "season", 2025);
    const week = getInt(qs, "week", 1);
    const origin = process.env.URL || `${url.protocol}//${url.host}`;

    const [games, rosters] = await Promise.all([
      getSchedule(origin, season, week),
      getRosters(origin, season, week)
    ]);

    const opponentOf = {};
    for (const g of games) {
      const h = g.home?.abbrev, a = g.away?.abbrev;
      if (h && a) { opponentOf[h] = a; opponentOf[a] = h; }
    }

    const baseByPos = { RB: 0.20, WR: 0.12, TE: 0.09, QB: 0.05 };
    const depthPenalty = [0, 0.0, -0.06, -0.12, -0.18];
    const clamp = (x,min=0,max=0.95)=>Math.max(min,Math.min(max,x));

    const rows = [];
    for (const team of Object.keys(rosters)) {
      const opp = opponentOf[team] || "?";
      for (const p of rosters[team].players || []) {
        const base = baseByPos[p.pos] ?? 0.05;
        const depthIdx = Math.min((p.depth||1), 4);
        const td = clamp(base + depthPenalty[depthIdx-1]);
        rows.push({
          player: p.name,
          team,
          pos: p.pos,
          opponent: opp,
          modelTdProb: Number((td*100).toFixed(1)),
          why: `${p.pos} • depth ${p.depth||1} • vs ${opp}`
        });
      }
    }

    rows.sort((a,b) => (b.modelTdProb - a.modelTdProb) || (a.pos.localeCompare(b.pos)));

    return jsonResponse({
      ok: true,
      season, week,
      games: games.length,
      candidates: rows.slice(0, 200)
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
