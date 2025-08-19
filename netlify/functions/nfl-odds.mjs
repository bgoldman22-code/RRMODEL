
// netlify/functions/nfl-odds.mjs
// Attempts to fetch Anytime TD player props. Gracefully returns [] if key/market unsupported.
import { normalizeTeam } from "./lib/teamMaps.mjs";

async function j(url){
  const r = await fetch(url, { headers:{ 'accept':'application/json' } });
  const t = await r.text();
  if (!r.ok) return null;
  if (!t || t.trim().startsWith("<")) return null;
  try{ return JSON.parse(t); }catch{ return null; }
}

export default async (req) => {
  try{
    const API_KEY = process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY || "";
    const url = new URL(req.url);
    const date = (url.searchParams.get("date")||"").trim();
    if (!API_KEY) return json(200, { ok:true, props: [], note:"no api key" });

    // The Odds API, player props endpoint (market names may vary by provider).
    const sport = "americanfootball_nfl";
    const markets = "player_touchdown_anytime";
    const oddsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?regions=us&markets=${markets}&dateFormat=iso&oddsFormat=american&apiKey=${API_KEY}`;
    const data = await j(oddsUrl) || [];

    const props = [];
    for (const event of data){
      const away = normalizeTeam(event?.away_team?.split(" ").pop());
      const home = normalizeTeam(event?.home_team?.split(" ").pop());
      if (!home || !away) continue;
      const offers = Array.isArray(event?.bookmakers) ? event.bookmakers : [];
      for (const bm of offers){
        for (const mk of (bm?.markets||[])){
          if (mk?.key !== markets) continue;
          for (const o of (mk?.outcomes||[])){
            if (!o?.name) continue;
            props.push({
              player: o.name,
              american: o.price ?? null,
              team: o?.team ? normalizeTeam(o.team) : null,
              home, away,
              book: bm?.title || bm?.key || "book",
              eventId: event?.id || null
            });
          }
        }
      }
    }

    return json(200, { ok:true, props });
  }catch(e){
    return json(200, { ok:true, props: [] });
  }
}

function json(statusCode, body){
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type":"application/json", "cache-control":"no-store" }
  });
}
