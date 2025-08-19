
// netlify/functions/nfl-schedule.mjs
import { normalizeTeam, gameKey } from "./lib/teamMaps.mjs";

function nextThursdayISO() {
  const now = new Date();
  const dow = now.getUTCDay(); // 0..6
  const daysUntilThu = (4 - dow + 7) % 7;
  const cand = new Date(now);
  cand.setUTCDate(now.getUTCDate() + daysUntilThu);
  const y = cand.getUTCFullYear();
  const m = String(cand.getUTCMonth()+1).padStart(2,'0');
  const d = String(cand.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

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

function weekWindow(dateISO){
  const [Y,M,D] = dateISO.split('-').map(Number);
  const d = new Date(Date.UTC(Y, M-1, D));
  // find Monday
  const dow = d.getUTCDay();
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

export default async (req) => {
  try{
    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode")||"").toLowerCase();
    const dateISO = (url.searchParams.get("date")||"").trim() || nextThursdayISO();

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

    const uniq = new Map();
    for (const g of games){ uniq.set(`${g.key}:${g.kickoff}`, g); }
    return new Response(JSON.stringify({ ok:true, games: Array.from(uniq.values()) }), {
      headers: { 'content-type':'application/json', 'cache-control':'no-store' }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:true, games: [] }), {
      headers: { 'content-type':'application/json', 'cache-control':'no-store' }
    });
  }
}
