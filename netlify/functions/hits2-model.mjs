// netlify/functions/hits2-model.mjs
// MLB 2+ Hits model using MLB StatsAPI — active rosters only (no prior day fallback).
// We compute per-AB p from blended season/L15 AVG, expected AB ~4.2 (bounded by PA), then P(X>=2) via binomial.
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function binomAtLeast2(ab, p) {
  const q = 1 - p;
  const p0 = Math.pow(q, ab);
  const p1 = ab * p * Math.pow(q, ab - 1);
  return clamp(1 - (p0 + p1), 0, 1);
}
async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent":"hits2/1.0" }, cache:"no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.json();
}
export const handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || new Date().toISOString().slice(0,10);
    const limitPerTeam = Math.max(6, parseInt(params.get("limitPerTeam") || "9", 10));

    // Schedule -> team ids + probable pitchers (for "Why")
    const sched = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team,probablePitcher`);
    const games = (sched.dates?.[0]?.games || []).map(g => ({
      gamePk: g.gamePk,
      home: { id: g.teams?.home?.team?.id, name: g.teams?.home?.team?.name, probableId: g.teams?.home?.probablePitcher?.id || null },
      away: { id: g.teams?.away?.team?.id, name: g.teams?.away?.team?.name, probableId: g.teams?.away?.probablePitcher?.id || null },
    }));
    const teamIds = Array.from(new Set(games.flatMap(g => [g.home.id, g.away.id]).filter(Boolean)));

    // Map for opponent info and game label
    const teamCtx = new Map();
    for (const g of games) {
      const gameLabel = `${g.away.name.split(" ").pop()}@${g.home.name.split(" ").pop()}`;
      teamCtx.set(g.home.id, { gamePk: g.gamePk, oppProbableId: g.away.probableId, game: gameLabel, name: g.home.name });
      teamCtx.set(g.away.id, { gamePk: g.gamePk, oppProbableId: g.home.probableId, game: gameLabel, name: g.away.name });
    }

    // Probable pitchers basic info (hand + BAA for "Why")
    const pitcherIds = Array.from(new Set(games.flatMap(g => [g.home.probableId, g.away.probableId]).filter(Boolean)));
    const pitchers = {};
    if (pitcherIds.length) {
      const pdat = await fetchJson(`https://statsapi.mlb.com/api/v1/people?personIds=${pitcherIds.join(",")}&hydrate=stats(type=season,group=pitching)`).catch(()=>({ people:[] }));
      for (const p of (pdat.people||[])) {
        const stat = (p.stats||[]).find(s => s.type?.displayName==="season" && s.group?.displayName==="pitching")?.splits?.[0]?.stat || {};
        pitchers[p.id] = { name: p.fullName, hand: p.pitchHand?.code, baa: stat.battingAverageAgainst!=null ? Number(stat.battingAverageAgainst) : null };
      }
    }

    // Active rosters -> hitters
    const hitters = [];
    for (const tid of teamIds) {
      const roster = await fetchJson(`https://statsapi.mlb.com/api/v1/teams/${tid}/roster?rosterType=active`).catch(()=>({ roster:[] }));
      const bats = (roster.roster||[]).filter(r => r.position?.code !== "1");
      const ids = bats.map(b=>b.person?.id).filter(Boolean);
      if (!ids.length) continue;

      const hydrate = encodeURIComponent("stats(type=season,group=hitting),stats(type=lastXGames,group=hitting,gameLog=false,gamesPlayed=15)");
      const people = await fetchJson(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(",")}&hydrate=${hydrate}`).catch(()=>({ people:[] }));
      for (const p of (people.people||[])) {
        const season = (p.stats||[]).find(s => s.type?.displayName==="season" && s.group?.displayName==="hitting")?.splits?.[0]?.stat || {};
        const last15 = (p.stats||[]).find(s => s.type?.displayName==="lastXGames" && s.group?.displayName==="hitting")?.splits?.[0]?.stat || {};
        const avg = Number(season.avg ?? season.avgString ?? 0) || 0;
        const l15 = Number(last15.avg ?? last15.avgString ?? 0) || avg;
        const pa = Number(season.plateAppearances || 0);
        const ab = Number(season.atBats || 0);
        if (!ab || avg <= 0) continue;

        const ctx = teamCtx.get(tid) || {};
        const opp = ctx.oppProbableId ? pitchers[ctx.oppProbableId] : null;

        // per-AB hit probability (bounded), expected AB ~ 4.2 with small PA-based bump
        const pAB = clamp(0.6*(avg||0.24) + 0.4*(l15||avg||0.24), 0.15, 0.45);
        const expAB = Math.round(clamp(3.8 + Math.min(0.6, pa/700), 3.5, 5.0));
        const p2 = binomAtLeast2(expAB, pAB);

        hitters.push({
          playerId: p.id,
          player: p.fullName,
          hand: p.batSide?.code || null,
          team: ctx.name || "",
          game: ctx.game || "",
          baseProb: p2,
          modelDetail: { seasonAVG: avg, last15AVG: l15, expAB, oppSP: opp?.name || null, spBAA: opp?.baa ?? null }
        });
      }
    }

    const unique = new Map();
    for (const h of hitters) {
      const k = (h.player || "").toLowerCase();
      const prev = unique.get(k);
      if (!prev || h.baseProb > prev.baseProb) unique.set(k, h);
    }
    const players = Array.from(unique.values()).sort((a,b)=>b.baseProb-a.baseProb).slice(0, 80);

    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:true, date, count: players.length, players }) };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:false, error:String(err) }) };
  }
};
