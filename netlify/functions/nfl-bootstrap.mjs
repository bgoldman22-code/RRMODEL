// netlify/functions/nfl-bootstrap.mjs
import { getStore } from "@netlify/blobs";
import { fetchJSON, buildScoreboardUrls, parseSchedule, buildTeamDepthUrl, parseDepthChart } from "./_util-espn.mjs";

const STORE = () => getStore({ name: process.env.NFL_TD_BLOBS || "nfl-td" });

export default async function handler(req) {
  const url = new URL(req.url);
  const season = url.searchParams.get("season") || new Date().getFullYear();
  const week = url.searchParams.get("week") || undefined;
  const refresh = url.searchParams.get("refresh") === "1";
  const debug = url.searchParams.get("debug") === "1";

  // If week not provided, try to determine by asking "current" week via week=1..18 probe (fast, stop on first non-empty)
  let targetWeek = week;
  const tried = [];
  if (!targetWeek) {
    for (let w = 1; w <= 20; w++) {
      const candidates = buildScoreboardUrls({ season, week: w });
      for (const u of candidates) {
        const r = await fetchJSON(u, `scoreboard season=${season} week=${w}`);
        tried.push({ url: u, ok: r.ok, status: r.meta?.status, len: (r.data?.events || []).length });
        if (r.ok && Array.isArray(r.data?.events) && r.data.events.length > 0) {
          targetWeek = w;
          break;
        }
      }
      if (targetWeek) break;
    }
  }

  if (!targetWeek) {
    return json({ ok: false, error: "Could not detect an active week from ESPN", tried }, 502);
  }

  const cacheKey = `weeks/${season}/${targetWeek}/schedule.json`;
  const depthKeyPrefix = `weeks/${season}/${targetWeek}/depth/`;
  const store = STORE();

  // Reuse cached if exists unless refresh=1
  let schedule = null;
  if (!refresh) {
    try { schedule = await store.getJSON(cacheKey); } catch {}
  }

  const fetchLog = [];
  if (!schedule) {
    // Pull schedule from ESPN
    let board = null;
    for (const u of buildScoreboardUrls({ season, week: targetWeek })) {
      const r = await fetchJSON(u, "scoreboard");
      fetchLog.push({ url: u, ok: r.ok, status: r.meta?.status, err: r.error });
      if (r.ok) { board = r.data; break; }
    }
    if (!board) return json({ ok: false, error: "Failed to fetch ESPN scoreboard", fetchLog, season, week: targetWeek }, 502);
    const games = parseSchedule(board);
    if (!games.length) return json({ ok: false, error: "ESPN returned zero games", season, week: targetWeek }, 502);
    schedule = { season, week: targetWeek, games };
    // cache
    try { await store.setJSON(cacheKey, schedule); } catch {}
  }

  // Depth charts per team
  const teams = new Set();
  for (const g of schedule.games) {
    if (g.home?.id) teams.add(g.home.id);
    if (g.away?.id) teams.add(g.away.id);
  }

  const depthCharts = {};
  const depthLog = [];
  for (const teamId of teams) {
    const key = `${depthKeyPrefix}${teamId}.json`;
    let data = null;
    if (!refresh) {
      try { data = await store.getJSON(key); } catch {}
    }
    if (!data) {
      const u = buildTeamDepthUrl({ teamId, season });
      const r = await fetchJSON(u, `depth team=${teamId}`);
      depthLog.push({ url: u, ok: r.ok, status: r.meta?.status, err: r.error });
      if (!r.ok) continue;
      data = parseDepthChart(r.data);
      try { await store.setJSON(key, data); } catch {}
    }
    depthCharts[teamId] = data;
  }

  const teamsResolved = Object.values(depthCharts).filter(Boolean).length;
  const ok = teamsResolved >= Math.max(1, Math.floor(teams.size * 0.7)); // consider ok if we got >=70% to start

  return json({ ok, season, week: schedule.week, games: schedule.games.length, teams: teams.size, teamsResolved, cacheKey, depthPrefix: depthKeyPrefix, fetchLog, depthLog }, ok ? 200 : 206);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
