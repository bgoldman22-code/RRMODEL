// netlify/functions/nfl-odds.mjs
// Pulls Anytime TD props from The Odds API, supporting both market keys:
// - player_anytime_td  (common env naming)
// - player_touchdown_anytime (The Odds API canonical key in many docs)
import { normalizeTeam } from "./lib/teamMaps.mjs";

async function j(url){
  const r = await fetch(url, { headers:{ 'accept':'application/json' } });
  const t = await r.text();
  if (!r.ok) return null;
  if (!t || t.trim().startsWith("<")) return null;
  try{ return JSON.parse(t); }catch{ return null; }
}

function parseTeamFromName(name){
  if (!name) return null;
  // The Odds API team names are full names; we take last token as abbr attempt.
  const last = String(name).split(" ").pop();
  return normalizeTeam(last);
}

export default async (req) => {
  const url = new URL(req.url);
  const date = (url.searchParams.get("date")||"").trim(); // optional
  const sport = "americanfootball_nfl";
  const apiKey = process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY || "";
  const regions = process.env.ODDS_REGIONS || "us";
  const oddsFormat = "american";

  // Accept both market keys, using env if present
  const envMkts = (process.env.ODDS_MARKETS||"").split(",").map(s=>s.trim()).filter(Boolean);
  const wantsAnytime = envMkts.some(m => m === "player_anytime_td" || m === "player_touchdown_anytime");
  const markets = wantsAnytime ? envMkts.join(",") : "player_anytime_td,player_touchdown_anytime";

  if (!apiKey){
    return json(200, { ok:true, props: [], note: "no ODDS_API_KEY" });
  }

  const q = new URLSearchParams({
    regions, markets, dateFormat: "iso", oddsFormat, apiKey
  }).toString();

  const endpoint = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?${q}`;
  const data = await j(endpoint);
  if (!Array.isArray(data)) return json(200, { ok:true, props: [], note:"no data" });

  const props = [];
  for (const event of data){
    const awayRaw = event?.away_team || null;
    const homeRaw = event?.home_team || null;
    const away = parseTeamFromName(awayRaw);
    const home = parseTeamFromName(homeRaw);
    if (!away || !home) continue;

    const books = Array.isArray(event?.bookmakers) ? event.bookmakers : [];
    for (const bm of books){
      const marketsArr = Array.isArray(bm?.markets) ? bm.markets : [];
      for (const mk of marketsArr){
        const mkey = mk?.key || "";
        const isAnytime = mkey === "player_anytime_td" || mkey === "player_touchdown_anytime";
        if (!isAnytime) continue;
        for (const o of (mk?.outcomes || [])){
          // Typical outcome: { name: "Player Name", price: +160, ... }
          if (!o?.name) continue;
          props.push({
            player: o.name,
            american: (o.price ?? null),
            team: o?.team ? normalizeTeam(o.team) : null,
            home, away,
            book: bm?.title || bm?.key || "book",
            eventId: event?.id || null,
          });
        }
      }
    }
  }

  return json(200, { ok:true, props });
}

function json(statusCode, body){
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type":"application/json", "cache-control":"no-store" }
  });
}
