// netlify/functions/nfl-bootstrap.mjs
import { maybeGetStore, parseQuery, blobsDiag } from "./_blobs.mjs";

const ESPN_WEB = "https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard";
const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

// Helper: fetch JSON with retries across ESPN endpoints
async function fetchJson(urls, retries=1) {
  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetch(url, { timeout: 10000 });
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  if (retries > 0) return fetchJson(urls, retries - 1);
  throw lastErr || new Error("fetch failed");
}

function seasonWeekFromToday() {
  // Simple heuristic for preseason Week 1 fallback window if not given
  // Sep 4-10, 2025 based on your earlier logs
  return { season: 2025, week: 1, start: "20250904", end: "20250910" };
}

function makeSchedulePayload(scoreboard) {
  // Map ESPN scoreboard format into the structure your UI expects
  const games = (scoreboard?.events || []).map(evt => {
    const comp = evt?.competitions?.[0];
    const [home, away] = (comp?.competitors || []).sort((a,b)=> (a?.homeAway === "home" ? -1 : 1));
    const toTeam = t => ({
      id: String(t?.team?.id || ""),
      abbrev: t?.team?.abbreviation || "",
      displayName: t?.team?.displayName || t?.team?.name || ""
    });
    return {
      id: String(evt?.id || comp?.id || ""),
      date: evt?.date || comp?.date || null,
      home: toTeam(home || {}),
      away: toTeam(away || {})
    };
  });
  return games;
}

export const handler = async (event) => {
  const q = parseQuery(event);
  const season = q.season ? Number(q.season) : 2025;
  const week = q.week ? Number(q.week) : 1;

  // Try read from blobs cache if available
  const store = await maybeGetStore(event, { fallbackName: "nfl-td" });
  const cacheKey = `weeks/${season}/${week}/schedule.json`;
  if (store) {
    try {
      const cached = await store.get(cacheKey, { type: "json" });
      if (cached) {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ok: true, season, week, games: cached?.games?.length || 0, schedule: cached, used: { mode: "cache" } })
        };
      }
    } catch {}
  }

  // Build URLs and fetch fresh from ESPN
  const { start, end } = seasonWeekFromToday();
  const urls = [
    `${ESPN_WEB}?dates=${start}-${end}`,
    `${ESPN_SITE}?dates=${start}-${end}`
  ];

  try {
    const data = await fetchJson(urls, 1);
    const games = makeSchedulePayload(data);
    const schedule = { season, week, games };

    // Write-through to blobs if available
    if (store) {
      try { await store.set(cacheKey, JSON.stringify(schedule), { contentType: "application/json" }); } catch {}
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, season, week, games: games.length, schedule, used: { mode: "live" } })
    };
  } catch (err) {
    // Return a helpful diagnostic that does NOT hard-require blobs
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: String(err),
        blobs: blobsDiag(event)
      })
    };
  }
};
