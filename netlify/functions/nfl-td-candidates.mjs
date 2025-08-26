import { getJSON, ok, bad } from "./_lib/http.mjs";

// Simple priors by position & depth slot (to be replaced with your learned model)
const POS_PRIOR = { RB: 0.24, WR: 0.17, TE: 0.11, QB: 0.06 };
const DEPTH_PENALTY = [1.00, 0.55, 0.25, 0.15]; // depth 1..4

function scoreFor(p, oppAbbrev) {
  const base = POS_PRIOR[p.position] || 0.05;
  const depthIdx = Math.min(Math.max((p.depth||1)-1, 0), DEPTH_PENALTY.length-1);
  const depthMult = DEPTH_PENALTY[depthIdx];
  const td = base * depthMult;
  return {
    tdProb: td,
    rzPath: td * 0.68,
    expPath: td * 0.32,
    why: `${p.position} • depth ${p.depth || 1}${oppAbbrev ? ` • vs ${oppAbbrev}` : ""}`
  };
}

export default async (event) => {
  try {
    const u = new URL(event.rawUrl || `https://x.invalid${event.rawQuery ? "?"+event.rawQuery : ""}`);
    const season = Number(u.searchParams.get("season") || 2025);
    const week = Number(u.searchParams.get("week") || 1);
    const debug = u.searchParams.get("debug") === "1";
    const host = event.headers?.["x-forwarded-host"];
    const proto = (event.headers?.["x-forwarded-proto"] || "https");
    const base = `${proto}://${host}`;

    // Get schedule (no blobs bootstrap)
    const schedUrl = `${base}/.netlify/functions/nfl-bootstrap?season=${season}&week=${week}`;
    const schedRes = await getJSON(schedUrl);
    if (!schedRes?.ok) throw new Error(`Failed to load schedule: ${JSON.stringify(schedRes).slice(0,160)}`);
    const games = schedRes?.schedule?.games || [];

    // Get rosters
    const rostUrl = `${base}/.netlify/functions/nfl-rosters?season=${season}&week=${week}`;
    const rostRes = await getJSON(rostUrl);
    const rosters = rostRes?.rosters || {};

    // Build candidates
    const out = [];
    for (const g of games) {
      const home = g?.home?.id, away = g?.away?.id;
      const homeAbbr = g?.home?.abbrev, awayAbbr = g?.away?.abbrev;
      const homeList = rosters[Number(home)] || [];
      const awayList = rosters[Number(away)] || [];

      for (const p of homeList) {
        const s = scoreFor(p, awayAbbr);
        out.push({ player: p.name, pos: p.position, team: homeAbbr, opp: awayAbbr, modelTD: s.tdProb, rzPath: s.rzPath, expPath: s.expPath, why: s.why });
      }
      for (const p of awayList) {
        const s = scoreFor(p, homeAbbr);
        out.push({ player: p.name, pos: p.position, team: awayAbbr, opp: homeAbbr, modelTD: s.tdProb, rzPath: s.rzPath, expPath: s.expPath, why: s.why });
      }
    }

    // sort desc by modelTD and cap
    out.sort((a,b)=> b.modelTD - a.modelTD);
    const top = out.slice(0, 150);

    return ok({ ok:true, season, week, games: games.length, candidates: top, note: rostRes?.used || 'unknown', debug });
  } catch (err) {
    return bad(err);
  }
};