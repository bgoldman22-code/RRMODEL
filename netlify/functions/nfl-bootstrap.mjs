// netlify/functions/nfl-bootstrap.mjs
import { getStore } from "@netlify/blobs";
import {
  fetchJSON, parseSchedule, buildScoreboardDates,
  buildTeamDepthUrl, buildTeamRosterUrl, synthesizeDepthFromRoster,
  yyyymmdd, firstNFLThursday
} from "./_util-espn.mjs";

const STORE = () => getStore({ name: process.env.NFL_TD_BLOBS || "nfl-td" });

export default async function handler(req) {
  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season") || new Date().getFullYear());
  let week = url.searchParams.get("week") ? Number(url.searchParams.get("week")) : undefined;
  const refresh = url.searchParams.get("refresh") === "1";
  const mode = url.searchParams.get("mode") || "auto"; // "auto" or "week1" or "range"
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  const store = STORE();
  const fetchLog = [];
  let games = [];
  let used = {};

  // Strategy:
  // - If explicit date range given, use it.
  // - Else if 'week1' requested, use computed Week 1 window (First Thu of Sep +6 days).
  // - Else 'auto': if today before season, also use week1 window. If in-season, use a 7-day rolling window from today.
  const today = new Date();
  let sStr, eStr;
  if (start && end) {
    sStr = start; eStr = end; used.mode = "explicit-range";
  } else if (mode === "week1") {
    const ft = firstNFLThursday(season);
    const s = new Date(ft), e = new Date(ft); e.setDate(e.getDate()+6);
    sStr = yyyymmdd(s); eStr = yyyymmdd(e); used.mode = "week1-fallback";
    week = 1;
  } else {
    // auto
    const ft = firstNFLThursday(season);
    if (today < ft) {
      const s = new Date(ft), e = new Date(ft); e.setDate(e.getDate()+6);
      sStr = yyyymmdd(s); eStr = yyyymmdd(e); used.mode = "auto→preseason-week1";
      week = 1;
    } else {
      // in-season: rolling 7 days from today
      const s = new Date(today), e = new Date(today); e.setDate(e.getDate()+6);
      sStr = yyyymmdd(s); eStr = yyyymmdd(e); used.mode = "auto→rolling";
      // keep caller-provided week if any; else leave undefined
    }
  }

  // Pull scoreboard by dates (two variants; one usually returns)
  let board = null;
  for (const u of buildScoreboardDates(sStr, eStr)) {
    const r = await fetchJSON(u, "scoreboard-dates");
    fetchLog.push({ url: u, ok: r.ok, status: r.meta?.status });
    if (r.ok) { board = r.data; break; }
  }
  if (!board) return json({ ok:false, error:"Scoreboard fetch failed", season, week: week||null, used, fetchLog }, 502);

  games = parseSchedule(board);
  if (!games.length) return json({ ok:false, error:"No games in date window", season, used, fetchLog }, 404);

  // If no week provided, infer 1 for preseason window (week1) else leave null
  if (!week) week = 1;

  const schedule = { season, week, games };
  const schedKey = `weeks/${season}/${week}/schedule.json`;
  try { if (refresh) { try { await store.delete(schedKey); } catch {} } } catch {}
  try { await store.setJSON(schedKey, schedule); } catch {}

  // Depth charts per team: depth endpoint → roster fallback → placeholder
  const teamIds = [...new Set(games.flatMap(g => [g.home?.id, g.away?.id]).filter(Boolean))];
  const depthLog = [];
  for (const id of teamIds) {
    const key = `weeks/${season}/${week}/depth/${id}.json`;
    if (!refresh) {
      try { const ex = await store.getJSON(key); if (ex) continue; } catch {}
    }
    // try depth charts
    let chart = null;
    const depthUrl = buildTeamDepthUrl(id, season);
    const d = await fetchJSON(depthUrl, "depth");
    depthLog.push({ url: depthUrl, ok: d.ok, status: d.meta?.status });
    if (d.ok) {
      chart = parseDepth(d.data);
    } else {
      // fallback to roster
      const rosterUrl = buildTeamRosterUrl(id, season);
      const r = await fetchJSON(rosterUrl, "roster");
      depthLog.push({ url: rosterUrl, ok: r.ok, status: r.meta?.status });
      if (r.ok) chart = synthesizeDepthFromRoster(r.data);
    }
    if (!chart) chart = placeholderDepth(id);
    try { await store.setJSON(key, chart); } catch {}
  }

  return json({ ok:true, season, week, games: games.length, schedule, used, fetchLog, depthLog });
}

function parseDepth(payload) {
  const positions = payload?.items || payload?.positions || [];
  const out = { QB: [], RB: [], WR: [], TE: [] };
  for (const pos of positions) {
    const key = (pos.abbrev || pos.position || pos.name || "").toUpperCase();
    if (!out[key]) continue;
    const athletes = pos?.athletes || pos?.items || [];
    for (const a of athletes) {
      const name = a?.athlete?.displayName || a?.athlete?.fullName || a?.displayName || a?.name;
      if (name) out[key].push(name);
    }
  }
  return out;
}

function placeholderDepth(teamId) {
  return {
    QB: [`QB1-${teamId}`],
    RB: [`RB1-${teamId}`, `RB2-${teamId}`],
    WR: [`WR1-${teamId}`, `WR2-${teamId}`, `WR3-${teamId}`],
    TE: [`TE1-${teamId}`],
  };
}

function json(body, status=200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type":"application/json" } });
}
