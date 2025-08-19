// netlify/functions/nfl-schedule.mjs
// Thu→Mon scheduler with robust ESPN fallbacks + strong de-duplication.
// Dedup order: (1) by gameId if present, (2) by key + normalized kickoff (to minute).

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

function iso(d){
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const day = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
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
  return { dates, fromISO: iso(thursday), toISO: iso(new Date(thursday.getTime() + 4*86400000)) };
}

function nextThursdayISO(){
  const now = new Date();
  const dow = now.getUTCDay(); // 0..6
  const days = (4 - dow + 7) % 7;
  const cand = new Date(now);
  cand.setUTCDate(now.getUTCDate() + days);
  return iso(cand);
}

// normalize kickoff to minute precision to dedupe across slightly different timestamp formats
function normalizeKickoff(k){
  if (!k) return null;
  // accept "2025-08-21T23:00Z" or "2025-08-21T23:00:00Z" etc.
  // we only keep YYYY-MM-DDTHH:MMZ if Zulu, else return as-is trimmed to minute.
  try{
    const m = String(k).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (m) return `${m[1]}T${m[2]}Z`;
    // Fallback: Date parse and reformat to minute Z
    const d = new Date(k);
    if (!isNaN(d.getTime())){
      const y = d.getUTCFullYear();
      const mo = String(d.getUTCMonth()+1).padStart(2,'0');
      const da = String(d.getUTCDate()).padStart(2,'0');
      const hh = String(d.getUTCHours()).padStart(2,'0');
      const mm = String(d.getUTCMinutes()).padStart(2,'0');
      return `${y}-${mo}-${da}T${hh}:${mm}Z`;
    }
    return String(k);
  }catch{ return String(k); }
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const dateISO = (url.searchParams.get("date")||"").trim() || nextThursdayISO();
    const mode = (url.searchParams.get("mode")||"").toLowerCase();

    const { dates, fromISO, toISO } = (mode === "week") ? weekWindow(dateISO) : { dates:[new Date(dateISO + "T12:00:00Z")], fromISO: dateISO, toISO: dateISO };

    // Build list of ESPN URLs to try per day
    const seasonTypes = [1,2,3]; // pre/reg/post
    function urlsForDay(day){
      const base1 = `https://site.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${day}`;
      const base2 = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${day}`;
      const base3 = `https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${day}`;
      const core  = `https://cdn.espn.com/core/nfl/scoreboard?xhr=1&render=false&dates=${day}`;
      const list = [];
      for (const st of seasonTypes){
        list.push(`${base1}&seasontype=${st}`);
        list.push(`${base2}&seasontype=${st}`);
        list.push(`${base3}&seasontype=${st}`);
      }
      list.push(base1, base2, base3, core);
      return list;
    }

    const raw = [];

    for (const dt of dates){
      const day = ymd(dt);
      const urls = urlsForDay(day);
      for (const u of urls){
        const data = await j(u);
        if (!data) continue;
        // Try common shapes
        collectFrom(raw, data);
      }
    }

    // Strong de-dup: first by gameId, then by (key + normalized kickoff)
    const byId = new Map();
    const byKeyKick = new Map();
    const out = [];

    for (const g of raw){
      const gid = g.gameId || null;
      const kickN = normalizeKickoff(g.kickoff);
      const key = gameKey(g.away, g.home);

      if (gid){
        if (byId.has(gid)) continue;
        byId.set(gid, true);
        out.push({ ...g, kickoff: kickN, key });
      }else{
        const kk = `${key}:${kickN}`;
        if (byKeyKick.has(kk)) continue;
        byKeyKick.set(kk, true);
        out.push({ ...g, kickoff: kickN, key });
      }
    }

    return new Response(JSON.stringify({ ok:true, games: out, meta:{ windowFrom: fromISO, windowTo: toISO, uniqueById: byId.size, uniqueByKeyKick: byKeyKick.size, totalRaw: raw.length } }), {
      headers: { "content-type":"application/json", "cache-control":"no-store" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:true, games: [], meta:{ error: "exception" } }), {
      headers: { "content-type":"application/json", "cache-control":"no-store" }
    });
  }
}

// Pull competitions->competitors from whatever shape ESPN returns
function collectFrom(out, data){
  // v2 style
  if (Array.isArray(data.events)){
    for (const ev of data.events){
      const comp = ev?.competitions?.[0];
      const c = Array.isArray(comp?.competitors) ? comp.competitors : [];
      if (c.length < 2) continue;
      pushGame(out, ev, comp, c);
    }
  }
  // site/core variants often embed under 'content' or 'leagues'
  const content = data?.content;
  if (content && Array.isArray(content?.sbData?.events)){
    for (const ev of content.sbData.events){
      const comp = ev?.competitions?.[0];
      const c = Array.isArray(comp?.competitors) ? comp.competitors : [];
      if (c.length < 2) continue;
      pushGame(out, ev, comp, c);
    }
  }
  if (Array.isArray(data?.leagues)){
    for (const lg of data.leagues){
      if (Array.isArray(lg?.events)){
        for (const ev of lg.events){
          const comp = ev?.competitions?.[0];
          const c = Array.isArray(comp?.competitors) ? comp.competitors : [];
          if (c.length < 2) continue;
          pushGame(out, ev, comp, c);
        }
      }
    }
  }
}

function pushGame(out, ev, comp, competitors){
  const homeC = competitors.find(x => x?.homeAway === "home") || competitors[0];
  const awayC = competitors.find(x => x?.homeAway === "away") || competitors[1];

  const rawHome = homeC?.team?.abbreviation || (homeC?.team?.displayName||'').split(' ').pop();
  const rawAway = awayC?.team?.abbreviation || (awayC?.team?.displayName||'').split(' ').pop();

  const home = normalizeTeam(rawHome) || (rawHome ? String(rawHome).toUpperCase() : null);
  const away = normalizeTeam(rawAway) || (rawAway ? String(rawAway).toUpperCase() : null);

  out.push({
    gameId: ev?.id || comp?.id || null,
    kickoff: comp?.date || ev?.date || null,
    seasonType: (ev?.season?.type ?? ev?.seasonType?.type ?? null),
    home, away,
    venue: comp?.venue?.fullName || null
  });
}
