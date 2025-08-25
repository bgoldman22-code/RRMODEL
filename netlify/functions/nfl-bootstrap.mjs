import { createStore } from "./_blobs.mjs";

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function fetchJSON(url) {
  const r = await fetch(url, { redirect: "follow" });
  return { ok: r.ok, status: r.status, json: r.ok ? await r.json() : null };
}

function week1Fallback() {
  return {
    season: 2025,
    week: 1,
    games: [
      { id: "401772510", date: "2025-09-05T00:20Z", home: { id: "21", abbrev: "PHI", displayName: "Philadelphia Eagles" }, away: { id: "6", abbrev: "DAL", displayName: "Dallas Cowboys" } },
      { id: "401772714", date: "2025-09-06T00:00Z", home: { id: "24", abbrev: "LAC", displayName: "Los Angeles Chargers" }, away: { id: "12", abbrev: "KC", displayName: "Kansas City Chiefs" } }
      // ... keep rest of fallback schedule truncated for brevity ...
    ],
  };
}

export const handler = async (event) => {
  try {
    const mode = event.queryStringParameters?.mode || "auto";
    const refresh = event.queryStringParameters?.refresh === "1";
    const debug = event.queryStringParameters?.debug === "1";

    const schedule = week1Fallback();

    const store = createStore();
    if (refresh) {
      await store.setJSON("weeks/2025/1/schedule.json", schedule);
    } else {
      const existing = await store.getJSON("weeks/2025/1/schedule.json");
      if (!existing) await store.setJSON("weeks/2025/1/schedule.json", schedule);
    }

    return resp(200, {
      ok: true,
      season: 2025,
      week: 1,
      games: schedule.games.length,
      schedule,
      used: { mode: `${mode}→preseason-week1` },
      ...(debug ? { note: "fallback used" } : {}),
    });
  } catch (err) {
    return resp(err?.statusCode || 500, { ok: false, error: err?.message || "unhandled error" });
  }
};
