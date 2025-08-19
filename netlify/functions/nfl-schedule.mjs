
// netlify/functions/nfl-schedule.mjs
import { normalizeTeam, gameKey } from "./lib/teamMaps.mjs";

async function j(url){
  const r = await fetch(url, { headers:{ 'accept':'application/json' } });
  const t = await r.text();
  if (!r.ok) return null;
  if (!t || t.trim().startsWith("<")) return null;
  try{ return JSON.parse(t); }catch{ return null; }
}

function ymd(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}${m}${day}`;
}
// Given a date, compute Thu..Mon window dates (inclusive)
function weekWindow(dateISO){
  const [Y,M,D] = dateISO.split('-').map(Number);
  const d = new Date(Date.UTC(Y, M-1, D));
  // find the Thursday of this NFL week: go back to Monday, then forward to Thursday
  const jsDow = d.getUTCDay(); // 0=Sun..6=Sat
  const toMonday = (jsDow + 6) % 7; // days back to Monday
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - toMonday);
  const thursday = new Date(monday); thursday.setUTCDate(monday.getUTCDate() + 3);
  const dates = [];
  for (let i=0;i<5;i++){ // Thu..Mon
    const dt = new Date(thursday); dt.setUTCDate(thursday.getUTCDate()+i);
    dates.push(dt);
  }
  return dates;
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const dateISO = (url.searchParams.get("date")||"").trim();
    const mode = (url.searchParams.get("mode")||"").toLowerCase();
    if (!dateISO) return json(200, { ok:true, games: [] });

    const dates = (mode === "week") ? weekWindow(dateISO) : [new Date(dateISO + "T12:00:00Z")];
    const games = [];

    for (const dt of dates){
      const data = await j(`https://site.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${ymd(dt)}`);
      const events = Array.isArray(data?.events) ? data.events : [];
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
        });
      }
    }

    // de-dup
    const uniq = new Map();
    for (const g of games){ uniq.set(`${g.key}:${g.kickoff}`, g); }
    return json(200, { ok:true, games: Array.from(uniq.values()) });
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
