import { jsonResponse, getJSON } from "./_lib/http.mjs";

function originFromEvent(event){
  const host = event.headers?.['x-forwarded-host'] || event.headers?.host || "";
  const proto = event.headers?.['x-forwarded-proto'] || "https";
  return `${proto}://${host}`;
}

function fmtPct(x){ return Math.round(x*1000)/10; }

export async function handler(event){
  try{
    const q = event.queryStringParameters || {};
    const season = parseInt(q.season||"2025",10);
    const week = parseInt(q.week||"1",10);
    const debug = q.debug === "1" || q.debug === "true";

    const base = originFromEvent(event);

    const schedUrl = `${base}/.netlify/functions/nfl-bootstrap-nb?season=${season}&week=${week}`;
    const rostUrl  = `${base}/.netlify/functions/nfl-rosters-nb?season=${season}&week=${week}`;
    const [sched, rost] = await Promise.all([ getJSON(schedUrl), getJSON(rostUrl) ]);

    if(!sched?.ok) return jsonResponse(200, { ok:false, error: "schedule unavailable (nb)" });
    if(!rost?.ok)  return jsonResponse(200, { ok:false, error: "rosters unavailable (nb)" });

    const games = sched.schedule.games || [];
    const rosters = rost.rosters || {};

    // Index opp by abbrev
    const gamesByAbbrev = {};
    for(const g of games){
      if(g?.home?.abbrev && g?.away?.abbrev){
        gamesByAbbrev[g.home.abbrev] = { opp: g.away.abbrev, game: g };
        gamesByAbbrev[g.away.abbrev] = { opp: g.home.abbrev, game: g };
      }
    }

    const positions = new Set(["RB","WR","TE","QB","FB"]);
    const candidates = [];

    for(const teamAbbr of Object.keys(rosters)){
      const plist = rosters[teamAbbr] || [];
      const opp = gamesByAbbrev[teamAbbr]?.opp || null;

      for(const p of plist){
        const pos = (p.pos||"").toUpperCase();
        if(!positions.has(pos)) continue;

        const depth = p.depth || 99;
        const base = (pos==="QB") ? 0.12 : (pos==="RB" ? 0.28 : (pos==="WR"?0.22 : 0.16));
        const depthAdj = Math.max(0.2, 1.0 - (depth-1)*0.18); // 1.0, 0.82, 0.64, 0.46...
        const model = base * depthAdj;

        candidates.push({
          player: p.name || "Unknown",
          pos,
          team: teamAbbr,
          opp,
          modelTD: fmtPct(model),
          rz: fmtPct(model*0.68),
          xp: fmtPct(model*0.32),
          why: `${p.name||"?"} • ${pos} • depth ${depth}${opp?` • vs ${opp}`:""}`
        });
      }
    }

    candidates.sort((a,b)=> (b.modelTD - a.modelTD) || (a.player.localeCompare(b.player)));
    const out = { ok:true, season, week, count: candidates.length, candidates: candidates.slice(0, 200) };
    if(debug) out.debug = { schedCount: games.length, teamRosters: Object.keys(rosters).length };
    return jsonResponse(200, out);
  }catch(err){
    return jsonResponse(200, { ok:false, error: String(err) });
  }
}
