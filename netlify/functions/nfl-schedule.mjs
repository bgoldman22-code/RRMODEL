// netlify/functions/nfl-schedule.mjs
// Thu→Mon scheduler that merges ESPN preseason(1) + regular(2) (and postseason 3) scoreboards.
// Safe: if a day returns nothing, continue; if normalization fails, still include teams.

import { normalizeTeam, gameKey } from "./lib/teamMaps.mjs";

async function j(url){
  const r = await fetch(url, { headers:{ 'accept':'application/json' } });
  const t = await r.text();
  if (!r.ok) return null;
  if (!t || t.trim().startsWith("<")) return null;
  try{ return JSON.parse(t); }catch{ return null; }
}

function ymd(d){
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const day = String(d.getUTCDate()).padStart(2,'0');
  return `${y}${m}${day}`;
}

// Thu→Mon window around a given ISO date (UTC-based)
function weekWindow(dateISO){
  const [Y,M,D] = dateISO.split('-').map(Number);
  const d = new Date(Date.UTC(Y, M-1, D));
  // Back to Monday then +3 to Thursday
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const toMonday = (dow + 6) % 7;
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - toMonday);
  const thursday = new Date(monday); thursday.setUTCDate(monday.getUTCDate() + 3);
  const dates = [];
  for (let i=0;i<5;i++){
    const dt = new Date(thursday); dt.setUTCDate(thursday.getUTCDate()+i);
    dates.push(dt);
  }
  return dates;
}

function nextThursdayISO(){
  const now = new Date();
  const dow = now.getUTCDay(); // 0..6
  const days = (4 - dow + 7) % 7;
  const cand = new Date(now);
  cand.setUTCDate(now.getUTCDate() + days);
  const y = cand.getUTCFullYear();
  const m = String(cand.getUTCMonth()+1).padStart(2,'0');
  const d = String(cand.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const dateISO = (url.searchParams.get("date")||"").trim() || nextThursdayISO();
    const mode = (url.searchParams.get("mode")||"").toLowerCase();

    const dates = (mode === "week") ? weekWindow(dateISO) : [new Date(dateISO + "T12:00:00Z")];
    const seasonTypes = [1,2,3]; // 1=pre, 2=reg, 3=post
    const games = [];

    for (const dt of dates){
      const day = ymd(dt);
      // Try explicit season types first, then generic fallback
      const urls = seasonTypes.map(st => `https://site.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${day}&seasontype=${st}`);
      urls.push(`https://site.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${day}`);

      for (const u of urls){
        const data = await j(u);
        const events = Array.isArray(data?.events) ? data.events : [];
        if (events.length === 0) continue;

        for (const ev of events){
          const comp = ev?.competitions?.[0];
          const c = Array.isArray(comp?.competitors) ? comp.competitors : [];
          if (c.length < 2) continue;

          const homeC = c.find(x => x?.homeAway === "home") || c[0];
          const awayC = c.find(x => x?.homeAway === "away") || c[1];

          // Prefer ESPN abbreviation; fallback to last word of team name
          const rawHome = homeC?.team?.abbreviation || (homeC?.team?.displayName||'').split(' ').pop();
          const rawAway = awayC?.team?.abbreviation || (awayC?.team?.displayName||'').split(' ').pop();

          const home = normalizeTeam(rawHome) || (rawHome ? String(rawHome).toUpperCase() : null);
          const away = normalizeTeam(rawAway) || (rawAway ? String(rawAway).toUpperCase() : null);

          if (!home || !away) continue; // must have recognizable teams to key

          const rec = {
            gameId: ev?.id || comp?.id || null,
            kickoff: comp?.date || ev?.date || null,
            seasonType: (ev?.season?.type ?? ev?.seasonType?.type ?? null),
            home, away,
            key: gameKey(away, home),
            venue: comp?.venue?.fullName || null
          };
          games.push(rec);
        }
      }
    }

    // De-dup by key+kickoff
    const uniq = new Map();
    for (const g of games){ uniq.set(`${g.key}:${g.kickoff}`, g); }
    const list = Array.from(uniq.values());

    return new Response(JSON.stringify({ ok:true, games: list }), {
      headers: { "content-type":"application/json", "cache-control":"no-store" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:true, games: [] }), {
      headers: { "content-type":"application/json", "cache-control":"no-store" }
    });
  }
}
