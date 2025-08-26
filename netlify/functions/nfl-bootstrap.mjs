// netlify/functions/nfl-bootstrap.mjs
import { fetchJSON, jsonResponse, getInt } from "./_lib/http.mjs";

const ESPN_SCOREBOARD_DATES = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const qs = url.searchParams;
    const debug = qs.get("debug") === "1";
    const season = getInt(qs, "season", 2025);
    const week = getInt(qs, "week", 1);
    const mode = qs.get("mode") || "auto";
    const dates = qs.get("dates") || "20250904-20250910";

    const sb = await fetchJSON(`${ESPN_SCOREBOARD_DATES}?dates=${dates}`, { timeoutMs: 12000 });
    const games = (sb.events || []).map(ev => {
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

    const payload = {
      ok: true,
      season,
      week,
      games: games.length,
      schedule: { season, week, games },
      used: { mode: `${mode}→espn-dates` }
    };
    return jsonResponse(debug ? { ...payload, rawCount: (games||[]).length } : payload);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
