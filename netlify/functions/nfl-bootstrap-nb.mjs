import { jsonResponse, getJSON } from "./_lib/http.mjs";

function toInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

// Hard fallback windows we *know* work for 2025 W1 (UTC date window ESPN supports)
const FALLBACK_WINDOWS = {
  "2025-1": { start: "20250904", end: "20250910" }
};

export async function handler(event) {
  try {
    const q = event.queryStringParameters || {};
    const season = toInt(q.season, 2025);
    const week   = toInt(q.week,   1);
    const debug  = q.debug === "1" || q.debug === "true";

    const used = {};
    let schedule = null;
    const fetchLog = [];

    // Try ESPN season/week first (may 404 sometimes before schedules are fully published per endpoint)
    const weekUrlWeb = `https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard?season=${season}&week=${week}&seasontype=2`;
    const weekUrlSite = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?season=${season}&week=${week}&seasontype=2`;

    const tryFetch = async (url) => {
      try {
        const data = await getJSON(url);
        fetchLog.push({ url, ok: true, status: 200 });
        return data;
      } catch (e) {
        const msg = `${e}`;
        const m = msg.match(/HTTP\s+(\d+)/);
        const status = m ? parseInt(m[1], 10) : 0;
        fetchLog.push({ url, ok: false, status });
        return null;
      }
    };

    let data = await tryFetch(weekUrlWeb);
    if (!data) data = await tryFetch(weekUrlSite);

    const normalize = (raw) => {
      if (!raw?.events?.length) return null;
      const games = raw.events.map(ev => {
        const c = ev.competitions?.[0];
        const home = c?.competitors?.find(t => t.homeAway === "home");
        const away = c?.competitors?.find(t => t.homeAway === "away");
        return {
          id: ev.id,
          date: ev.date,
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
      return { season, week, games };
    };

    schedule = normalize(data);

    if (!schedule || !schedule.games?.length) {
      // Fallback to known date window
      const win = FALLBACK_WINDOWS[`${season}-${week}`];
      if (!win) {
        return jsonResponse(200, { ok: false, error: "schedule unavailable and no fallback window" });
      }
      used.mode = "dates-fallback";
      used.window = win;

      const datesWeb = `https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${win.start}-${win.end}`;
      const datesSite = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${win.start}-${win.end}`;
      let data2 = await tryFetch(datesWeb);
      if (!data2) data2 = await tryFetch(datesSite);
      schedule = normalize(data2);
    } else {
      used.mode = "season-week";
    }

    if (!schedule || !schedule.games?.length) {
      return jsonResponse(200, { ok: false, error: "schedule unavailable", fetchLog, used });
    }

    const out = { ok: true, season, week, games: schedule.games.length, schedule, used };
    if (debug) out.fetchLog = fetchLog;
    return jsonResponse(200, out);
  } catch (err) {
    return jsonResponse(200, { ok: false, error: String(err) });
  }
}
