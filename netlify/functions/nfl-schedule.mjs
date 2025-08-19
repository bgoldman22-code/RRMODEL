
// netlify/functions/nfl-schedule.mjs
import { normalizeTeam, gameKey } from "./lib/teamMaps.mjs";

async function j(url){
  const r = await fetch(url, { headers:{ 'accept':'application/json' } });
  const t = await r.text();
  if (!r.ok) return null;
  if (!t || t.trim().startsWith("<")) return null;
  try{ return JSON.parse(t); }catch{ return null; }
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const date = (url.searchParams.get("date")||"").replace(/-/g,"");
    if (!date) return json(200, { ok:true, games: [] });

    // ESPN NFL scoreboard (public)
    const data = await j(`https://site.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${date}`);
    const events = Array.isArray(data?.events) ? data.events : [];
    const games = [];

    for (const ev of events){
      const comp = ev?.competitions?.[0];
      const c = Array.isArray(comp?.competitors) ? comp.competitors : [];
      if (c.length !== 2) continue;
      const homeC = c.find(x => x?.homeAway === "home");
      const awayC = c.find(x => x?.homeAway === "away");
      const home = normalizeTeam(homeC?.team?.abbreviation);
      const away = normalizeTeam(awayC?.team?.abbreviation);
      if (!home || !away) continue;
      games.push({
        gameId: ev?.id || comp?.id || null,
        kickoff: comp?.date || ev?.date || null,
        home, away,
        key: gameKey(away, home),
        venue: comp?.venue?.fullName || null,
        coords: comp?.venue?.address ? {
          city: comp?.venue?.address?.city || null
        } : null
      });
    }

    return json(200, { ok:true, games });
  }catch(e){
    return json(200, { ok:true, games: [] });
  }
}

function json(statusCode, body){
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type":"application/json", "cache-control":"no-store" }
  });
}
