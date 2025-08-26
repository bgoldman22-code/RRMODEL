// netlify/functions/hits2-model.mjs
// Builds slate of 2+ hits candidates with base probabilities from MLB StatsAPI.
// Approach: For each game on date, gather top-9 likely starters by season PA/AVG for both teams.
// Compute base P(X>=2) with X~Binomial(expAB, p), where p ~= AVG adjusted by L15 form and platoon vs probable SP.
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const binomAtLeast2 = (ab, p) => {
  // 1 - [P(0) + P(1)] for Binomial(n=ab, p)
  const q = 1 - p;
  const p0 = Math.pow(q, ab);
  const p1 = ab * p * Math.pow(q, ab - 1);
  return clamp(1 - (p0 + p1), 0, 1);
};
const clean = (s) => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\./g,"").replace(/\s+/g," ").trim();
const toKey = (s) => clean(s).toLowerCase();

export const handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || new Date().toISOString().slice(0,10);
    const limitPerTeam = Math.max(6, parseInt(params.get("limitPerTeam") || "9", 10)); // take top N candidates per team

    const fetchJson = async (url) => {
      const r = await fetch(url, { headers: { "User-Agent":"hits2/1.0" } });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.json();
    };

    // 1) Schedule for date (probable pitchers included)
    const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team,probablePitcher`;
    const sched = await fetchJson(schedUrl);
    const games = (sched.dates?.[0]?.games || []).map(g => ({
      gamePk: g.gamePk,
      home: { id: g.teams?.home?.team?.id, name: g.teams?.home?.team?.name, probableId: g.teams?.home?.probablePitcher?.id || null },
      away: { id: g.teams?.away?.team?.id, name: g.teams?.away?.team?.name, probableId: g.teams?.away?.probablePitcher?.id || null },
    }));

    // 2) For each team, pull roster & basic batting season stats, plus L15 form
    const teamIds = Array.from(new Set(games.flatMap(g => [g.home.id, g.away.id]).filter(Boolean)));
    const players = []; // collect candidates

    for (const teamId of teamIds) {
      // roster
      const rosterUrl = `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster`;
      const roster = await fetchJson(rosterUrl).catch(()=>({ roster:[] }));
      const batters = (roster.roster||[]).filter(r => (r.position?.code !== "1")); // exclude pitchers

      // batch people ids
      const ids = batters.map(b=>b.person?.id).filter(Boolean);
      if (!ids.length) continue;

      // people with season batting + last15
      const peopleUrl = `https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(",")}&hydrate=stats(type=season,group=hitting),stats(type=lastXGames,group=hitting,gameLog=false,gamesPlayed=15),stats(type=byMonth,group=hitting)`;
      const people = await fetchJson(peopleUrl).catch(()=>({ people:[] }));

      for (const p of (people.people||[])) {
        const season = (p.stats||[]).find(s=>s.type?.displayName==="season" && s.group?.displayName==="hitting")?.splits?.[0]?.stat || {};
        const last15 = (p.stats||[]).find(s=>s.type?.displayName==="lastXGames" && s.group?.displayName==="hitting")?.splits?.[0]?.stat || {};
        const avg = Number(season.avg || season.avgString || 0);
        const l15avg = Number(last15.avg || last15.avgString || avg || 0);
        const pa = Number(season.plateAppearances || 0);
        const ab = Number(season.atBats || 0);
        if (!ab || avg<=0) continue; // skip non-hitters

        players.push({
          playerId: p.id,
          player: p.fullName,
          hand: p.batSide?.code || null,
          teamId,
          team: "", // fill later from team map
          seasonAVG: avg,
          last15AVG: l15avg || avg,
          seasonPA: pa,
          seasonAB: ab
        });
      }
    }

    // Build team map & opponent SP hand for platoon adj
    const teamMap = new Map();
    for (const g of games) {
      teamMap.set(g.home.id, { name: g.home.name, oppProbableId: g.away.probableId, gamePk: g.gamePk, oppTeamId: g.away.id, game: `${g.away.name.split(" ").pop()}@${g.home.name.split(" ").pop()}` });
      teamMap.set(g.away.id, { name: g.away.name, oppProbableId: g.home.probableId, gamePk: g.gamePk, oppTeamId: g.home.id, game: `${g.away.name.split(" ").pop()}@${g.home.name.split(" ").pop()}` });
    }

    const pitcherIds = Array.from(new Set(games.flatMap(g => [g.home.probableId, g.away.probableId]).filter(Boolean)));
    let pitcherInfo = {};
    if (pitcherIds.length) {
      const peopleUrl = `https://statsapi.mlb.com/api/v1/people?personIds=${pitcherIds.join(",")}&hydrate=stats(type=season,group=pitching)`;
      const people = await fetchJson(peopleUrl).catch(()=>({ people:[] }));
      for (const p of (people.people||[])) {
        const stats = (p.stats||[]).find(s=>s.type?.displayName==="season" && s.group?.displayName==="pitching")?.splits?.[0]?.stat || {};
        pitcherInfo[p.id] = { name: p.fullName, hand: p.pitchHand?.code, baa: Number(stats.battingAverageAgainst || 0) || null };
      }
    }

    // 3) Score candidates per team: choose top N by season PA (proxy for starters)
    const byTeam = new Map();
    for (const pl of players) {
      const tm = teamMap.get(pl.teamId);
      if (!tm) continue;
      pl.team = tm.name;
      pl.game = tm.game;
      pl.gamePk = tm.gamePk;
      const arr = byTeam.get(pl.teamId) || [];
      arr.push(pl);
      byTeam.set(pl.teamId, arr);
    }

    const candidates = [];
    for (const [tid, arr] of byTeam.entries()) {
      arr.sort((a,b)=> (b.seasonPA||0) - (a.seasonPA||0));
      const top = arr.slice(0, limitPerTeam);
      for (const pl of top) {
        const oppPid = teamMap.get(tid)?.oppProbableId;
        const oppP = oppPid ? pitcherInfo[oppPid] : null;
        // base p = blend of season avg and L15 avg (60/40)
        const baseP = clamp(0.6*(pl.seasonAVG||0.24) + 0.4*(pl.last15AVG||pl.seasonAVG||0.24), 0.15, 0.42);
        // expected AB for likely starters ~ 4.3; bump slightly for leadoff/high PA guys
        const expAB = clamp(3.8 + Math.min(0.7, (pl.seasonPA/650)), 3.5, 4.8);
        // platoon adjustment vs probable SP hand (small, bounded)
        let platoon = 1.0;
        if (oppP?.hand && pl.hand) {
          // Favor opposite hand slightly
          platoon = (pl.hand !== oppP.hand) ? 1.03 : 0.98;
        }
        // SP BAA adjustment around league .240
        let spBAA = 1.0;
        if (typeof oppP?.baa === "number" && oppP.baa > 0) {
          spBAA = clamp(1 + (oppP.baa - 0.240), 0.95, 1.05);
        }
        const pAdj = clamp(baseP * platoon * spBAA, 0.15, 0.45);
        const prob2plus = binomAtLeast2(Math.round(expAB), pAdj);
        candidates.push({
          playerId: pl.playerId,
          player: pl.player,
          team: teamMap.get(tid)?.name || "",
          game: teamMap.get(tid)?.game || "",
          hand: pl.hand,
          baseProb: prob2plus,
          modelDetail: { seasonAVG: pl.seasonAVG, last15AVG: pl.last15AVG, expAB: Math.round(expAB), platoon, spBAA: oppP?.baa || null, oppSP: oppP?.name || null }
        });
      }
    }

    // 4) Return slate
    // Deduplicate players that might appear multiple times (defensive), and sort by prob
    const uniq = new Map();
    for (const c of candidates) {
      const k = toKey(c.player);
      const prev = uniq.get(k);
      if (!prev || c.baseProb > prev.baseProb) uniq.set(k, c);
    }
    const slate = Array.from(uniq.values()).sort((a,b)=>b.baseProb-a.baseProb).slice(0, 60);

    return { statusCode: 200, headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok:true, date, count: slate.length, players: slate }) };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok:false, error:String(err) }) };
  }
};
