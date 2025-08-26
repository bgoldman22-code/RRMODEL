// netlify/functions/hits2-model.mjs
// HOTFIX: ensure non-empty slate by using active rosters and robust stat parsing.
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const binomAtLeast2 = (ab, p) => {
  const q = 1 - p;
  const p0 = Math.pow(q, ab);
  const p1 = ab * p * Math.pow(q, ab - 1);
  return clamp(1 - (p0 + p1), 0, 1);
};

export async function handler(event) {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || new Date().toISOString().slice(0,10);
    const limitPerTeam = Math.max(6, parseInt(params.get("limitPerTeam") || "9", 10));

    const fetchJson = async (url) => {
      const r = await fetch(url, { headers: { "User-Agent":"hits2/1.0" } });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.json();
    };

    const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team,probablePitcher`;
    const sched = await fetchJson(schedUrl);
    const games = (sched.dates?.[0]?.games || []).map(g => ({
      gamePk: g.gamePk,
      home: { id: g.teams?.home?.team?.id, name: g.teams?.home?.team?.name, probableId: g.teams?.home?.probablePitcher?.id || null },
      away: { id: g.teams?.away?.team?.id, name: g.teams?.away?.team?.name, probableId: g.teams?.away?.probablePitcher?.id || null },
    }));

    const teamIds = Array.from(new Set(games.flatMap(g => [g.home.id, g.away.id]).filter(Boolean)));
    const players = [];
    const teamMap = new Map();
    for (const g of games) {
      teamMap.set(g.home.id, { name: g.home.name, oppProbableId: g.away.probableId, gamePk: g.gamePk, game: `${g.away.name.split(" ").pop()}@${g.home.name.split(" ").pop()}` });
      teamMap.set(g.away.id, { name: g.away.name, oppProbableId: g.home.probableId, gamePk: g.gamePk, game: `${g.away.name.split(" ").pop()}@${g.home.name.split(" ").pop()}` });
    }

    // Probable pitchers info for platoon and BAA
    const pitcherIds = Array.from(new Set(games.flatMap(g => [g.home.probableId, g.away.probableId]).filter(Boolean)));
    let pitcherInfo = {};
    if (pitcherIds.length) {
      const pUrl = `https://statsapi.mlb.com/api/v1/people?personIds=${pitcherIds.join(",")}&hydrate=stats(type=season,group=pitching)`;
      const pdat = await fetchJson(pUrl).catch(()=>({ people:[] }));
      for (const p of (pdat.people||[])) {
        const stat = (p.stats||[]).find(s => s.type?.displayName==="season" && s.group?.displayName==="pitching")?.splits?.[0]?.stat || {};
        pitcherInfo[p.id] = { name: p.fullName, hand: p.pitchHand?.code, baa: (stat.battingAverageAgainst!=null? Number(stat.battingAverageAgainst): null) };
      }
    }

    for (const teamId of teamIds) {
      const rosterUrl = `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active`;
      const roster = await fetchJson(rosterUrl).catch(()=>({ roster:[] }));
      const batters = (roster.roster||[]).filter(r => r.position?.code !== "1");
      const ids = batters.map(b=>b.person?.id).filter(Boolean);
      if (!ids.length) continue;

      const hydrate = "stats(type=season,group=hitting),stats(type=lastXGames,group=hitting,gameLog=false,gamesPlayed=15)";
      const peopleUrl = `https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(",")}&hydrate=${encodeURIComponent(hydrate)}`;
      const pdata = await fetchJson(peopleUrl).catch(()=>({ people:[] }));

      for (const p of (pdata.people||[])) {
        const season = (p.stats||[]).find(s=>s.type?.displayName==="season" && s.group?.displayName==="hitting")?.splits?.[0]?.stat || {};
        const last15 = (p.stats||[]).find(s=>s.type?.displayName==="lastXGames" && s.group?.displayName==="hitting")?.splits?.[0]?.stat || {};
        const avgStr = season.avg ?? season.avgString ?? null;
        const l15Str = last15.avg ?? last15.avgString ?? null;
        const avg = avgStr ? Number(avgStr) : 0;
        const l15 = l15Str ? Number(l15Str) : avg;
        const pa = Number(season.plateAppearances || 0);
        const ab = Number(season.atBats || 0);

        if (ab <= 0 || avg <= 0) continue; // skip non-hitters

        players.push({
          playerId: p.id,
          player: p.fullName,
          hand: p.batSide?.code || null,
          teamId,
          seasonAVG: avg,
          last15AVG: (l15>0? l15: avg),
          seasonPA: pa,
          seasonAB: ab
        });
      }
    }

    const byTeam = new Map();
    for (const pl of players) {
      const tm = teamMap.get(pl.teamId);
      if (!tm) continue;
      const arr = byTeam.get(pl.teamId) || [];
      arr.push({ ...pl, team: tm.name, game: tm.game, gamePk: tm.gamePk, oppPid: tm.oppProbableId });
      byTeam.set(pl.teamId, arr);
    }

    const out = [];
    for (const [tid, arr] of byTeam.entries()) {
      arr.sort((a,b)=> (b.seasonPA||0) - (a.seasonPA||0));
      for (const pl of arr.slice(0, limitPerTeam)) {
        const oppP = pl.oppPid ? pitcherInfo[pl.oppPid] : null;
        const baseP = clamp(0.6*(pl.seasonAVG||0.24) + 0.4*(pl.last15AVG||pl.seasonAVG||0.24), 0.15, 0.42);
        const expAB = clamp(3.8 + Math.min(0.7, (pl.seasonPA/650)), 3.5, 4.8);
        let platoon = 1.0; if (oppP?.hand && pl.hand) platoon = (pl.hand !== oppP.hand) ? 1.03 : 0.98;
        let spBAA = 1.0; if (typeof oppP?.baa === "number" && oppP.baa > 0) spBAA = clamp(1 + (oppP.baa - 0.240), 0.95, 1.05);
        const pAdj = clamp(baseP * platoon * spBAA, 0.15, 0.45);
        const prob2plus = binomAtLeast2(Math.round(expAB), pAdj);
        out.push({
          playerId: pl.playerId, player: pl.player, team: pl.team, game: pl.game,
          hand: pl.hand, baseProb: prob2plus,
          modelDetail: { seasonAVG: pl.seasonAVG, last15AVG: pl.last15AVG, expAB: Math.round(expAB), platoon, spBAA: oppP?.baa || null, oppSP: oppP?.name || null }
        });
      }
    }

    return { statusCode: 200, headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok:true, date, count: out.length, players: out.sort((a,b)=>b.baseProb-a.baseProb).slice(0,60) }) };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok:false, error:String(err) }) };
  }
};
