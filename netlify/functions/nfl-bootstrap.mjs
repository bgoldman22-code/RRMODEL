// netlify/functions/nfl-bootstrap.mjs
import { openStore } from "./_lib/blobs-helper.mjs";
import { ok, err } from "./_lib/respond.js";

const ESPN_WEB = "https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard";
const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) return { ok: false, status: res.status, len: 0 };
  const data = await res.json();
  return { ok: true, status: res.status, len: JSON.stringify(data).length, data };
}

function week1Dates(season) {
  // Hardcode 2025 week 1 window used earlier: 20250904-20250910
  if (season === 2025) return "20250904-20250910";
  // Fallback: a 7-day window starting Sep 1 of given season
  return `${season}0901-${season}0907`;
}

export const handler = async (event) => {
  const debug = event.queryStringParameters?.debug === "1";
  const mode = event.queryStringParameters?.mode || "auto";
  const refresh = event.queryStringParameters?.refresh === "1";
  const season = Number(event.queryStringParameters?.season || 2025);
  const week = Number(event.queryStringParameters?.week || 1);

  const store = openStore("nfl");
  const fetchLog = [];
  const depthLog = [];

  let schedule;

  // Try week1 date window (since ESPN week param can be unreliable preseason/early)
  const dates = week1Dates(season);
  for (const base of [ESPN_WEB, ESPN_SITE]) {
    const url = `${base}?dates=${dates}`;
    const r = await fetchJson(url);
    fetchLog.push({ url, ok: r.ok, status: r.status });
    if (r.ok) {
      // Transform to a compact schedule doc
      const games = (r.data?.events || []).map((ev) => ({
        id: ev.id,
        date: ev.date,
        home: {
          id: ev.competitions?.[0]?.competitors?.find(c=>c.homeAway==="home")?.team?.id,
          abbrev: ev.competitions?.[0]?.competitors?.find(c=>c.homeAway==="home")?.team?.abbreviation,
          displayName: ev.competitions?.[0]?.competitors?.find(c=>c.homeAway==="home")?.team?.displayName,
        },
        away: {
          id: ev.competitions?.[0]?.competitors?.find(c=>c.homeAway==="away")?.team?.id,
          abbrev: ev.competitions?.[0]?.competitors?.find(c=>c.homeAway==="away")?.team?.abbreviation,
          displayName: ev.competitions?.[0]?.competitors?.find(c=>c.homeAway==="away")?.team?.displayName,
        },
      }));
      schedule = { season, week, games };
      break;
    }
  }

  if (!schedule) {
    return err("Could not fetch schedule", { fetchLog });
  }

  // Persist to blobs: week cache + a canonical pointer
  const weekKey = `weeks/${season}/${week}/schedule.json`;
  await (await store).set(weekKey, JSON.stringify(schedule), { contentType: "application/json" });
  await (await store).set("schedule.json", JSON.stringify({ season, week, ref: weekKey }), { contentType: "application/json" });

  return ok({
    season, week, games: schedule.games?.length || 0,
    schedule,
    used: { mode: `${mode}→preseason-week1` },
    fetchLog,
    depthLog
  });
};