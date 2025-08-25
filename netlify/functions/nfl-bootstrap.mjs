
import { getStore } from "@netlify/blobs";

const STORE_NAME = process.env.NFL_TD_BLOBS || "nfl-td";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

// ESPN helpers
const ESPN_SB_WEB = "https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard";
const ESPN_SB_SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const ESPN_DEPTH = (teamId, season) => `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/${teamId}/depthchart?season=${season}`;
const ESPN_ROSTER = (teamId, season) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster${season ? `?season=${season}` : ""}`;

export default async function handler(req) {
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const debug = url.searchParams.get("debug") === "1";
  const season = Number(url.searchParams.get("season") || new Date().getFullYear());
  const weekParam = url.searchParams.get("week") ? Number(url.searchParams.get("week")) : null;

  let store = null;
  try { store = getStore({ name: STORE_NAME }); } catch (e) { /* non-fatal */ }

  const fetchLog = [];
  const depthLog = [];
  const rosterLog = [];

  // 1) Try to get scoreboard by week. ESPN week endpoints are flaky pre-season.
  let games = [];
  let selectedWeek = weekParam ?? undefined;

  if (typeof selectedWeek === "number") {
    const pair = await getScoreboardByWeek(season, selectedWeek, fetchLog);
    games = pair.games;
    if (!games.length) selectedWeek = undefined; // fall through to auto detect
  }

  if (typeof selectedWeek !== "number") {
    // Date-range fallback: first Thursday of Sept thru +6 days
    const firstThu = firstThursdayOfSeptember(season);
    const start = fmtDate(firstThu);
    const end = fmtDate(new Date(firstThu.getTime() + 6 * 86400000));
    const pair = await getScoreboardByDates(start, end, fetchLog);
    games = pair.games;
    selectedWeek = 1; // reasonable default for early season
    if (!games.length) {
      return json({ ok:false, error:"No games found from ESPN", fetchLog }, 502);
    }
  }

  // Normalize minimal schedule
  const schedule = normalizeSchedule(games);

  // 2) Persist schedule into blobs (best-effort)
  try {
    if (store) {
      await store.setJSON(`weeks/${season}/${selectedWeek}/schedule.json`, schedule);
    }
  } catch (e) {
    fetchLog.push({ note: "store.setJSON schedule failed", error: String(e) });
  }

  // 3) Build depth charts for each team: try ESPN depth; fallback to ESPN roster
  const teamIds = new Set();
  for (const g of schedule.games) {
    if (g.home?.id) teamIds.add(g.home.id);
    if (g.away?.id) teamIds.add(g.away.id);
  }

  for (const id of teamIds) {
    let chart = null;
    // Try depth endpoint first
    const durl = ESPN_DEPTH(id, season);
    let dres = await safeGet(durl);
    depthLog.push({ url: durl, ok: dres.ok, status: dres.status });
    if (dres.ok) {
      chart = parseEspnDepth(dres.json);
    }
    // Fallback to roster endpoint
    if (!chart || !hasOffensivePositions(chart)) {
      const rurl = ESPN_ROSTER(id, season);
      let rres = await safeGet(rurl);
      rosterLog.push({ url: rurl, ok: rres.ok, status: rres.status });
      if (rres.ok) chart = parseEspnRoster(rres.json);
    }
    // If still nothing, fabricate placeholder
    if (!chart || !hasOffensivePositions(chart)) {
      chart = {
        QB: [`QB1-${id}`],
        RB: [`RB1-${id}`, `RB2-${id}`],
        WR: [`WR1-${id}`, `WR2-${id}`, `WR3-${id}`],
        TE: [`TE1-${id}`],
      };
    }
    // Save (best-effort)
    try {
      if (store) await store.setJSON(`weeks/${season}/${selectedWeek}/depth/${id}.json`, chart);
    } catch (e) {
      depthLog.push({ note:"store.setJSON depth failed", team:id, error:String(e) });
    }
  }

  const used = { mode: "week1-fallback", start: "week-dates-or-unknown" };
  return json({
    ok: true,
    season,
    week: selectedWeek,
    games: schedule.games.length,
    schedule, // include full schedule payload for in-memory use
    used,
    fetchLog,
    depthLog,
    rosterLog,
  });
}

function normalizeSchedule(events) {
  const out = [];
  for (const ev of events) {
    // ESPN events have competitions[0] with competitors
    const comp = ev?.competitions?.[0] || ev?.competitions || {};
    const competitors = comp?.competitors || ev?.competitors || [];
    const findTeam = (side) => {
      const c = competitors.find(o => (o.homeAway || o.home_away) === side) || competitors[side === "home" ? 0 : 1] || {};
      const team = c.team || {};
      return {
        id: Number(team.id) || undefined,
        name: team.displayName || team.name,
        abbrev: team.abbreviation || team.abbrev,
      };
    };
    out.push({
      id: String(ev?.id || comp?.id || ""),
      date: ev?.date || comp?.date,
      home: findTeam("home"),
      away: findTeam("away"),
      venue: comp?.venue?.fullName || comp?.venue?.address || null,
    });
  }
  return { games: out };
}

async function getScoreboardByWeek(season, week, log) {
  const u1 = `${ESPN_SB_WEB}?season=${season}&week=${week}&seasontype=2`;
  const r1 = await safeGet(u1);
  log.push({ url:u1, ok:r1.ok, status:r1.status });
  if (r1.ok && r1.json?.events?.length) return { games: r1.json.events };

  const u2 = `${ESPN_SB_SITE}?season=${season}&week=${week}&seasontype=2`;
  const r2 = await safeGet(u2);
  log.push({ url:u2, ok:r2.ok, status:r2.status });
  if (r2.ok && r2.json?.events?.length) return { games: r2.json.events };

  return { games: [] };
}

async function getScoreboardByDates(startYYYYMMDD, endYYYYMMDD, log) {
  const u1 = `${ESPN_SB_WEB}?dates=${startYYYYMMDD}-${endYYYYMMDD}`;
  const r1 = await safeGet(u1);
  log.push({ url:u1, ok:r1.ok, status:r1.status });
  if (r1.ok && r1.json?.events?.length) return { games: r1.json.events };

  const u2 = `${ESPN_SB_SITE}?dates=${startYYYYMMDD}-${endYYYYMMDD}`;
  const r2 = await safeGet(u2);
  log.push({ url:u2, ok:r2.ok, status:r2.status });
  if (r2.ok && r2.json?.events?.length) return { games: r2.json.events };

  return { games: [] };
}

function firstThursdayOfSeptember(season) {
  const d = new Date(Date.UTC(season, 8, 1)); // Sept = 8
  // getDay: 0 Sun .. 6 Sat (UTC)
  const dow = d.getUTCDay(); // 0..6
  const add = (4 - dow + 7) % 7; // Thursday = 4
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

async function safeGet(url) {
  try {
    const r = await fetch(url, { headers: { "accept": "application/json" } });
    const t = r.headers.get("content-type") || "";
    let json = null;
    if (t.includes("application/json")) {
      json = await r.json().catch(()=>null);
    } else {
      const raw = await r.text().catch(()=>null);
      try { json = JSON.parse(raw); } catch { json = { raw }; }
    }
    return { ok: r.ok, status: r.status, json };
  } catch (e) {
    return { ok:false, status:0, json:null, error:String(e) };
  }
}

// Parse ESPN depth endpoint (very inconsistent; pick out QB/RB/WR/TE with order if possible)
function parseEspnDepth(data) {
  const out = { QB:[], RB:[], WR:[], TE:[] };
  const groups = data?.items || data?.athletes || [];
  const push = (pos, name) => { if (pos && out[pos] && name) out[pos].push(name); };

  function normPos(s){
    if (!s) return null;
    s = (s.abbreviation || s.abbrev || s.name || s.id || s).toString().toUpperCase();
    if (s.startsWith("QB")) return "QB";
    if (s.startsWith("RB") || s==="TB" || s==="FB") return "RB";
    if (s.startsWith("WR")) return "WR";
    if (s.startsWith("TE")) return "TE";
    return null;
  }

  // Try common shapes
  for (const g of Array.isArray(groups) ? groups : []) {
    const entries = g?.items || g?.athletes || g?.entries || [];
    for (const e of entries) {
      const pos = normPos(e?.position || e?.pos || e?.slot || e?.athlete?.position);
      const name = e?.athlete?.displayName || e?.displayName || e?.name || e?.athlete?.fullName;
      push(pos, name);
    }
  }
  // dedupe and limit
  for (const k of Object.keys(out)) {
    out[k] = Array.from(new Set(out[k])).filter(Boolean).slice(0, k==="WR"?5:(k==="RB"?4:(k==="TE"?3:2)));
  }
  return out;
}

// Parse ESPN roster endpoint into pseudo-depth
function parseEspnRoster(data) {
  const out = { QB:[], RB:[], WR:[], TE:[] };
  const buckets = [].concat(
    data?.athletes || [],
    data?.roster || [],
    data?.items || [],
  );

  const list = [];
  for (const b of buckets) {
    if (Array.isArray(b?.items)) list.push(...b.items);
    else if (Array.isArray(b?.athletes)) list.push(...b.athletes);
    else if (b && b?.athlete) list.push(b);
  }

  const players = list.map(p => {
    const a = p.athlete || p;
    const pos = a?.position?.abbreviation || a?.position?.abbrev || a?.position?.name || a?.position?.id;
    const name = a?.displayName || a?.fullName || a?.name;
    const jersey = Number(a?.jersey) || 999;
    const exp = Number(a?.experience?.years) || 0;
    const order = (pos && pos.startsWith("WR")) ? 500 + jersey :
                  (pos && pos.startsWith("RB")) ? 400 + jersey :
                  (pos && pos.startsWith("TE")) ? 300 + jersey :
                  (pos && pos.startsWith("QB")) ? 200 + jersey : 900 + jersey;
    return { pos, name, jersey, exp, order };
  }).filter(p => p.name);

  const push = (pos, name) => { if (pos && out[pos] && name) out[pos].push(name); };
  const sorted = players.sort((a,b)=> a.order - b.order);
  for (const p of sorted) {
    const up = (p.pos || "").toUpperCase();
    if (up.startsWith("QB")) push("QB", p.name);
    else if (up.startsWith("RB") || up==="TB" || up==="FB") push("RB", p.name);
    else if (up.startsWith("WR")) push("WR", p.name);
    else if (up.startsWith("TE")) push("TE", p.name);
  }
  for (const k of Object.keys(out)) {
    out[k] = Array.from(new Set(out[k])).filter(Boolean).slice(0, k==="WR"?5:(k==="RB"?4:(k==="TE"?3:2)));
  }
  return out;
}

function hasOffensivePositions(chart) {
  if (!chart) return false;
  return ["QB","RB","WR","TE"].some(k => Array.isArray(chart[k]) && chart[k].length);
}

// utils
function fmtDate(d) {
  if (typeof d === "string") return d.replaceAll("-","");
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2,"0");
  const day = String(d.getUTCDate()).padStart(2,"0");
  return `${y}${m}${day}`;
}
