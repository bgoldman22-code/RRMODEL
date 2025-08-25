// netlify/functions/nfl-bootstrap.mjs
import { getStore } from "@netlify/blobs";
import { fetchJSON, buildScoreboardByWeek, buildScoreboardByDates, calendarUrl, parseSchedule, buildTeamDepthUrl, parseDepthChart, yyyymmdd, firstNFLThursday } from "./_util-espn.mjs";

const STORE = () => getStore({ name: process.env.NFL_TD_BLOBS || "nfl-td" });

export default async function handler(req) {
  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season") || new Date().getFullYear());
  let week = url.searchParams.get("week") || undefined;
  const refresh = url.searchParams.get("refresh") === "1";

  const store = STORE();
  const fetchLog = [];
  let games = [];
  let used = null;

  // 1) Try ESPN calendar to find current/next regular-season week
  let cal = await fetchJSON(calendarUrl(season), "calendar");
  if (cal.ok) {
    // calendar has season types with weeks and date ranges
    const cats = cal.data?.eventDate?.calendar || cal.data?.calendar || [];
    // Try to find regular season block
    const regs = Array.isArray(cats) ? cats : [];
    const today = new Date();
    let candidate = null;
    for (const block of regs) {
      // each block may have entries with startDate/endDate
      const entries = block?.entries || block?.calendar || [];
      for (const e of entries) {
        const st = new Date(e?.startDate || e?.startDateGMT || e?.startDateUTC || e?.startDateDisplay || e?.startDate);
        const en = new Date(e?.endDate || e?.endDateGMT || e?.endDateUTC || e?.endDateDisplay || e?.endDate);
        if (isFinite(st) && isFinite(en)) {
          if (today >= st && today <= en) { candidate = { start: st, end: en }; break; }
          if (!candidate && today < st) { candidate = { start: st, end: en }; } // next upcoming
        }
      }
      if (candidate) break;
    }
    if (candidate) {
      // Pull scoreboard by date range
      const startStr = yyyymmdd(candidate.start);
      const endStr = yyyymmdd(candidate.end);
      for (const u of buildScoreboardByDates({ start: startStr, end: endStr })) {
        const r = await fetchJSON(u, "scoreboard-dates");
        fetchLog.push({ url: u, ok: r.ok, status: r.meta?.status });
        if (r.ok) {
          games = parseSchedule(r.data);
          used = { mode: "calendar", start: startStr, end: endStr };
          break;
        }
      }
    }
  } else {
    fetchLog.push({ url: calendarUrl(season), ok: false, status: cal.meta?.status, err: cal.error });
  }

  // 2) Fallback: try explicit weeks 1..20 (regular season uses week parameter)
  if (!games.length) {
    for (let w = 1; w <= 20; w++) {
      for (const u of buildScoreboardByWeek({ season, week: w })) {
        const r = await fetchJSON(u, "scoreboard-week");
        fetchLog.push({ url: u, ok: r.ok, status: r.meta?.status });
        if (r.ok && (r.data?.events || []).length) {
          games = parseSchedule(r.data);
          week = w;
          used = { mode: "week", week };
          break;
        }
      }
      if (games.length) break;
    }
  }

  // 3) Final fallback for preseason gap: use known Week 1 window (first Thu of Sep +/- 6 days)
  if (!games.length) {
    const firstThu = firstNFLThursday(season);
    const start = new Date(firstThu);
    const end = new Date(firstThu); end.setDate(end.getDate()+6);
    const s = yyyymmdd(start), e = yyyymmdd(end);
    for (const u of buildScoreboardByDates({ start: s, end: e })) {
      const r = await fetchJSON(u, "scoreboard-week1-fallback");
      fetchLog.push({ url: u, ok: r.ok, status: r.meta?.status });
      if (r.ok && (r.data?.events || []).length) {
        games = parseSchedule(r.data);
        week = 1;
        used = { mode: "week1-fallback", start: s, end: e };
        break;
      }
    }
  }

  if (!games.length) {
    return json({ ok: false, error: "No NFL games found from ESPN", season, week: week || null, fetchLog }, 502);
  }

  // Cache schedule
  const targetWeek = week || 1;
  const cacheKey = `weeks/${season}/${targetWeek}/schedule.json`;
  try { if (refresh) await store.delete(cacheKey); } catch {}
  await store.setJSON(cacheKey, { season, week: targetWeek, games });

  // Fetch depth charts for teams in this schedule
  const teamIds = [...new Set(games.flatMap(g => [g.home?.id, g.away?.id]).filter(Boolean))];
  const depthLog = [];
  for (const teamId of teamIds) {
    const key = `weeks/${season}/${targetWeek}/depth/${teamId}.json`;
    if (!refresh) {
      try { const ex = await store.getJSON(key); if (ex) continue; } catch {}
    }
    const u = buildTeamDepthUrl({ teamId, season });
    const r = await fetchJSON(u, "depth");
    depthLog.push({ url: u, ok: r.ok, status: r.meta?.status });
    if (r.ok) {
      const chart = parseDepthChart(r.data);
      await store.setJSON(key, chart);
    }
  }

  return json({ ok: true, season, week: targetWeek, games: games.length, used, fetchLog, depthLog });
}

function json(body, status=200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
