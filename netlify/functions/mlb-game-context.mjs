// netlify/functions/mlb-game-context.mjs
export const handler = async (event) => {
  const params = new URLSearchParams(event.queryStringParameters || {});
  const date = params.get("date") || new Date().toISOString().slice(0,10);
  const daysBack = 3;

  const fetchJson = async (url) => {
    const r = await fetch(url, { headers: { "User-Agent":"hits2/1.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  };

  try {
    const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team,linescore,probablePitcher`;
    const sched = await fetchJson(schedUrl);
    const games = (sched.dates?.[0]?.games || []).map(g => ({
      gamePk: g.gamePk,
      homeId: g.teams?.home?.team?.id,
      awayId: g.teams?.away?.team?.id,
      homeName: g.teams?.home?.team?.name,
      awayName: g.teams?.away?.team?.name,
      homeProbableId: g.teams?.home?.probablePitcher?.id,
      awayProbableId: g.teams?.away?.probablePitcher?.id,
    }));

    const pitcherIds = Array.from(new Set(
      games.flatMap(g => [g.homeProbableId, g.awayProbableId]).filter(Boolean)
    ));
    let pitcherInfo = {};
    if (pitcherIds.length) {
      const peopleUrl = `https://statsapi.mlb.com/api/v1/people?personIds=${pitcherIds.join(",")}&hydrate=stats(type=season,group=pitching)`;
      const people = await fetchJson(peopleUrl);
      for (const p of (people.people||[])) {
        const stats = (p.stats||[]).find(s=>s.type?.displayName==="season" && s.group?.displayName==="pitching");
        const splits = stats?.splits?.[0]?.stat || {};
        pitcherInfo[p.id] = {
          name: p.fullName,
          hand: p.pitchHand?.code,
          baa: splits?.battingAverageAgainst || null,
          ipPerStart: (splits?.inningsPitched && splits?.gamesStarted) ? (parseFloat(splits.inningsPitched) / Math.max(1, splits.gamesStarted)) : null
        };
      }
    }

    const dateObj = new Date(date+"T00:00:00Z");
    const start = new Date(dateObj); start.setUTCDate(start.getUTCDate()-daysBack);
    const dateList = [];
    for (let d=new Date(start); d<dateObj; d.setUTCDate(d.getUTCDate()+1)) dateList.push(d.toISOString().slice(0,10));

    const bullpenByTeamId = {};
    for (const d of dateList) {
      const boxUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${d}&hydrate=decisions,linescore,boxscore`;
      const day = await fetchJson(boxUrl);
      for (const g of (day.dates?.[0]?.games || [])) {
        const box = g.boxscore; if (!box) continue;
        for (const side of ["home","away"]) {
          const team = box.teams?.[side]; if (!team) continue;
          const teamId = team.team?.id; if (!teamId) continue;
          let ip = 0;
          for (const pid of Object.keys(team.players || {})) {
            const pl = team.players[pid];
            if (pl?.position?.code !== "1") continue; // pitcher slot
            const stats = pl.stats?.pitching; if (!stats) continue;
            const gs = stats.gamesStarted || 0; if (gs >= 1) continue; // bullpen only
            const iP = parseFloat(stats.inningsPitched || "0") || 0; ip += iP;
          }
          bullpenByTeamId[teamId] = (bullpenByTeamId[teamId] || 0) + ip;
        }
      }
    }

    const context = games.map(g => ({
      gamePk: g.gamePk,
      home: { teamId: g.homeId, name: g.homeName, starter: pitcherInfo[g.homeProbableId] || null, bullpenLast3dIP: bullpenByTeamId[g.homeId] || 0 },
      away: { teamId: g.awayId, name: g.awayName, starter: pitcherInfo[g.awayProbableId] || null, bullpenLast3dIP: bullpenByTeamId[g.awayId] || 0 },
    }));

    return { statusCode: 200, headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, date, daysBack, count: context.length, context }) };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
