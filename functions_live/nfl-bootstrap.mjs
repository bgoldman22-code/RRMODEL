import { getJSON, ok, bad } from "./_lib/http.mjs";

function datesForSeasonWeek(season, week) {
  // Hardcode Week 1 (Thu 9/4 to Wed 9/10 UTC window) for 2025 if needed
  if (Number(season) === 2025 && Number(week) === 1) return "20250904-20250910";
  return null;
}

async function fetchSchedule({ season, week, dates }) {
  // Prefer ESPN date-window endpoint, which is stable
  const d = dates || datesForSeasonWeek(season, week);
  if (!d) throw new Error("No dates window for schedule. Provide ?dates=YYYYMMDD-YYYYMMDD or season/week=2025/1.");

  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${d}`;
  const j = await getJSON(url);
  const games = (j?.events || []).map(ev => {
    const comp = ev?.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === "home") || {};
    const away = comp?.competitors?.find(c => c.homeAway === "away") || {};
    return {
      id: ev?.id,
      date: ev?.date,
      home: {
        id: home?.team?.id,
        abbrev: home?.team?.abbreviation,
        displayName: home?.team?.displayName
      },
      away: {
        id: away?.team?.id,
        abbrev: away?.team?.abbreviation,
        displayName: away?.team?.displayName
      }
    };
  });
  return { season: Number(season)||2025, week: Number(week)||1, games };
}

export default async (event) => {
  try {
    const u = new URL(event.rawUrl || `https://x.invalid${event.rawQuery ? "?"+event.rawQuery : ""}`);
    const season = u.searchParams.get("season") || 2025;
    const week = u.searchParams.get("week") || 1;
    const dates = u.searchParams.get("dates");
    const debug = u.searchParams.get("debug") === "1";

    const schedule = await fetchSchedule({ season, week, dates });
    return ok({ ok:true, season:Number(season), week:Number(week), games:schedule.games.length, schedule, used: { mode: "no-blobs/espn-dates" }, debug });
  } catch (err) {
    return bad(err);
  }
};