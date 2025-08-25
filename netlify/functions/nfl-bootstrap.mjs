// nfl-bootstrap.mjs
// Orchestrates: pick season/week, fetch schedule + depth charts, cache to Blobs
import { getStore } from "@netlify/blobs";
import { inferSeasonYear, fetchWeeks, pickCurrentWeek, fetchScoreboardWeek, fetchTeamsMap, fetchDepthChartsForTeams } from "./_util-espn.mjs";

function cors() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
  };
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { headers: cors() });
  const url = new URL(req.url);
  const forceWeek = url.searchParams.get("week");
  const seasonQ = url.searchParams.get("season");
  const doDepth = url.searchParams.get("depth") !== "0";
  const storeName = process.env.NFL_TD_BLOBS || "nfl-td";

  const season = seasonQ ? Number(seasonQ) : inferSeasonYear(new Date());
  const weeks = await fetchWeeks(season, 2);
  const week = forceWeek ? Number(forceWeek) : pickCurrentWeek(weeks, new Date());

  // Fetch schedule
  const games = await fetchScoreboardWeek(season, week, 2);

  // Fetch team map for display and to ensure abbrs exist
  const teamsMap = await fetchTeamsMap(season);

  // Depth charts only for teams in this week
  let depthChartsByTeamId = {};
  if (doDepth) {
    const teamIds = new Set();
    for (const g of games) {
      if (g.home?.id) teamIds.add(String(g.home.id));
      if (g.away?.id) teamIds.add(String(g.away.id));
    }
    depthChartsByTeamId = await fetchDepthChartsForTeams(season, Array.from(teamIds));
  }

  // Convert depth charts to team abbr keyed object
  const depthCharts = {};
  for (const [teamId, dc] of Object.entries(depthChartsByTeamId)) {
    const meta = teamsMap.get(String(teamId));
    const abbr = meta?.abbr || `T${teamId}`;
    depthCharts[abbr] = dc;
  }

  // Normalize schedule to abbrs
  const schedule = games.map(g => ({
    eventId: g.eventId,
    kickoff: g.startTime,
    week,
    season,
    home: teamsMap.get(String(g.home.id))?.abbr || g.home.abbr,
    away: teamsMap.get(String(g.away.id))?.abbr || g.away.abbr,
  }));

  // Cache to Blobs (best-effort)
  try {
    const store = getStore({ name: storeName });
    await store.setJSON(`weeks/${season}/${week}/schedule.json`, schedule);
    if (doDepth) await store.setJSON(`weeks/${season}/${week}/depth-charts.json`, depthCharts);
    await store.setJSON(`weeks/current.json`, { season, week, updatedAt: new Date().toISOString() });
  } catch { /* optional */ }

  return new Response(JSON.stringify({ ok: true, season, week, games: schedule.length, schedule, depthCharts }), {
    headers: cors(),
  });
}
