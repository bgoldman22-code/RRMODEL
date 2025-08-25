// netlify/functions/nfl-bootstrap.mjs
// Fetches schedule (ESPN) and returns normalized schedule JSON.
// Minimal, no blobs write by default. Use &noblobs=1 to guarantee no blobs.

/** ESPN scoreboard for date range or week */
async function fetchEspnScheduleByDates(startYmd, endYmd) {
  const u = new URL("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
  u.searchParams.set("dates", `${startYmd}-${endYmd}`);
  const res = await fetch(u.toString());
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: "ESPN by dates failed", body: t };
  }
  const j = await res.json();
  return parseEspnScoreboard(j);
}

function parseEspnScoreboard(j) {
  try {
    const events = j?.events || [];
    const games = events.map(ev => {
      const id = ev?.id;
      const date = ev?.date;
      const comps = ev?.competitions?.[0];
      const home = comps?.competitors?.find(c => c.homeAway === "home");
      const away = comps?.competitors?.find(c => c.homeAway === "away");
      const mk = t => (t ? {
        id: t.team?.id ? Number(t.team.id) : null,
        abbrev: t.team?.abbreviation || null,
        displayName: t.team?.displayName || t.team?.shortDisplayName || null
      } : null);
      return {
        id,
        date,
        home: mk(home),
        away: mk(away)
      };
    }).filter(g => g.home && g.away);
    return { ok: true, schedule: { games } };
  } catch (e) {
    return { ok: false, error: "parse error: " + (e?.message || String(e)) };
  }
}

function yyyymmdd(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth()+1).padStart(2,"0");
  const dd = String(d.getUTCDate()).padStart(2,"0");
  return `${yyyy}${mm}${dd}`;
}

export const handler = async (event) => {
  try {
    const debug = event.queryStringParameters?.debug ? true : false;
    const mode = event.queryStringParameters?.mode || "auto";
    // Week 1 2025 known window (Thu-Mon): 20250904-20250910
    // We'll default to that if auto.
    const start = event.queryStringParameters?.start || "20250904";
    const end = event.queryStringParameters?.end || "20250910";

    let scheduleResp;
    if (mode === "auto") {
      scheduleResp = await fetchEspnScheduleByDates(start, end);
    } else {
      scheduleResp = await fetchEspnScheduleByDates(start, end);
    }

    if (!scheduleResp.ok) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok:false, error: scheduleResp.error || "schedule fetch failed", detail: scheduleResp })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        season: 2025,
        week: 1,
        games: scheduleResp.schedule.games.length,
        schedule: scheduleResp.schedule,
        used: { mode, start, end }
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok:false, error: String(e?.message || e) })
    };
  }
};