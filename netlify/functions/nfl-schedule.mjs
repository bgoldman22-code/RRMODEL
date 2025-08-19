// netlify/functions/nfl-schedule.mjs
// Robust Thu→Mon NFL scheduler with multiple ESPN fallbacks and deep event parsing.
// Includes preseason/regular/postseason and never fails hard.

import { normalizeTeam, gameKey } from "./lib/teamMaps.mjs";

async function j(url){
  try{
    const r = await fetch(url, { headers:{ 'accept':'application/json' } });
    const t = await r.text();
    if (!r.ok) return null;
    if (!t || t.trim().startsWith("<")) return null;
    return JSON.parse(t);
  }catch{return null;}
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
  const dow = d.getUTCDay();
  const toMonday = (dow + 6) % 7;
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - toMonday);
  const thursday = new Date(monday); thursday.setUTCDate(monday.getUTCDate() + 3);
  const dates = [];
  for (let i=0;i<5;i++){ const dt = new Date(thursday); dt.setUTCDate(thursday.getUTCDate()+i); dates.push(dt); }
  return { dates, fromISO: iso(thursday), toISO: iso(new Date(thursday.getTime()+4*86400000)) };
}
function nextThursdayISO(){
  const now = new Date();
  const dow = now.getUTCDay();
  const days = (4 - dow + 7) % 7;
  const cand = new Date(now); cand.setUTCDate(now.getUTCDate() + days);
  return iso(cand);
}
function iso(d){
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth()+1).padStart(2,'0'), day = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// Deeply search for ESPN-style event objects that have competitions[0].competitors
function collectEvents(obj){
  const out = [];
  const stack = [obj];
  while (stack.length){
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)){
      for (const it of cur) stack.push(it);
      continue;
    }
    // ESPN event shape usually has "competitions" (array)
    if (Array.isArray(cur.competitions) && cur.competitions.length){
      out.push(cur);
    }
    for (const k of Object.keys(cur)){
      stack.push(cur[k]);
    }
  }
  return out;
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const dateISO = (url.searchParams.get("date")||"").trim() || nextThursdayISO();
    const mode = (url.searchParams.get("mode")||"").toLowerCase();
    const { dates, fromISO, toISO } = (mode === "week") ? weekWindow(dateISO) : { dates:[new Date(dateISO + "T12:00:00Z")], fromISO: dateISO, toISO: dateISO };

    const bases = [
      (day, st) => `https://site.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${day}` + (st?`&seasontype=${st}`:''),
      (day, st) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${day}` + (st?`&seasontype=${st}`:''),
      (day, st) => `https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${day}` + (st?`&seasontype=${st}`:''),
      (day, st) => `https://cdn.espn.com/core/nfl/scoreboard?xhr=1&render=false&dates=${day}` + (st?`&seasontype=${st}`:'')
    ];
    const seasonTypes = [1,2,3,null];

    const games = [];
    let daysQueried = 0, eventsSeen = 0, urlsTried = 0;

    for (const dt of dates){
      const day = ymd(dt);
      daysQueried++;
      for (const make of bases){
        for (const st of seasonTypes){
          const u = make(day, st);
          urlsTried++;
          const data = await j(u);
          if (!data) continue;
          // Handle cdn.espn.com shape (data.content is a stringified JSON sometimes). Try parse again.
          if (data.content && typeof data.content === 'string'){
            try{ const inner = JSON.parse(data.content); Object.assign(data, inner); }catch{}
          }
          const events = [];
          // Prefer top-level 'events' if present
          if (Array.isArray(data.events)) events.push(...data.events);
          // Else deep scan
          if (events.length === 0){
            const deep = collectEvents(data);
            events.push(...deep);
          }
          if (events.length === 0) continue;
          eventsSeen += events.length;

          for (const ev of events){
            const comp = Array.isArray(ev.competitions) ? ev.competitions[0] : ev;
            const comps = Array.isArray(comp?.competitors) ? comp.competitors : [];
            if (comps.length < 2) continue;
            const homeC = comps.find(x => x?.homeAway === "home") || comps[0];
            const awayC = comps.find(x => x?.homeAway === "away") || comps[1];

            const rawHome = homeC?.team?.abbreviation || (homeC?.team?.displayName||'').split(' ').pop();
            const rawAway = awayC?.team?.abbreviation || (awayC?.team?.displayName||'').split(' ').pop();

            const home = normalizeTeam(rawHome) || (rawHome ? String(rawHome).toUpperCase() : null);
            const away = normalizeTeam(rawAway) || (rawAway ? String(rawAway).toUpperCase() : null);
            if (!home || !away) continue;

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
          // If we've found any games for this day from any base, no need to try more bases for the day
          if (games.some(g => g.kickoff && g.kickoff.startsWith(`${dt.getUTCFullYear()}-`))) {
            break;
          }
        }
      }
    }

    // De-dup
    const uniq = new Map();
    for (const g of games){ uniq.set(`${g.key}:${g.kickoff}`, g); }
    const list = Array.from(uniq.values());

    return new Response(JSON.stringify({ ok:true, games: list, meta:{ windowFrom: fromISO, windowTo: toISO, daysQueried, eventsSeen, urlsTried } }), {
      headers: { "content-type":"application/json", "cache-control":"no-store" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:true, games: [], meta:{ error: "exception" } }), {
      headers: { "content-type":"application/json", "cache-control":"no-store" }
    });
  }
}
