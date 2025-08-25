
// netlify/functions/nfl-bootstrap.mjs
// Fetch week schedule from ESPN and optionally persist to Blobs if available.
// Blobs are OPTIONAL. Use ?noblobs=1 to hard-bypass.
export const config = { path: "/.netlify/functions/nfl-bootstrap" };

const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

import { getStoreOrNull, hasBlobsEnv, putJSONIfStore } from "./_lib/blobs-optional.mjs";

function jsonResponse(body, status=200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function yyyymmdd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,"0");
  const dd = String(d.getUTCDate()).padStart(2,"0");
  return `${y}${m}${dd}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function windowForWeek1() {
  // Week 1 typical window (Thu to Wed) — adjust if needed
  const start = "20250904";
  const end = "20250910";
  return { start, end };
}

function toGame(g) {
  return {
    id: String(g?.id ?? g?.uid ?? ""),
    date: g?.date ? new Date(g.date).toISOString().replace(".000","") : null,
    home: {
      id: g?.competitions?.[0]?.competitors?.find(c=>c.homeAway==="home")?.team?.id ?? null,
      abbrev: g?.competitions?.[0]?.competitors?.find(c=>c.homeAway==="home")?.team?.abbreviation ?? null,
      displayName: g?.competitions?.[0]?.competitors?.find(c=>c.homeAway==="home")?.team?.displayName ?? null,
    },
    away: {
      id: g?.competitions?.[0]?.competitors?.find(c=>c.homeAway==="away")?.team?.id ?? null,
      abbrev: g?.competitions?.[0]?.competitors?.find(c=>c.homeAway==="away")?.team?.abbreviation ?? null,
      displayName: g?.competitions?.[0]?.competitors?.find(c=>c.homeAway==="away")?.team?.displayName ?? null,
    },
  };
}

export async function handler(event) {
  const url = new URL(event.rawUrl || `https://x/?${event.rawQuery}`);
  const debug = url.searchParams.get("debug") !== null;
  const noblobs = url.searchParams.get("noblobs") === "1";
  const mode = url.searchParams.get("mode") || "auto";

  const diag = { HAS_NETLIFY: !!process.env.NETLIFY, HAS_BLOBS_ENV: hasBlobsEnv(), noblobs, mode };

  try {
    const { start, end } = windowForWeek1();
    const api = `${ESPN_SCOREBOARD}?dates=${start}-${end}`;
    const data = await fetchJson(api);
    const gamesRaw = Array.isArray(data?.events) ? data.events : [];
    const games = gamesRaw.map(toGame).filter(g => g.id && g.home?.id && g.away?.id);

    const body = {
      ok: true,
      season: 2025,
      week: 1,
      games: games.length,
      schedule: { season: 2025, week: 1, games },
      used: { mode: "auto→preseason-week1" },
    };

    // Optional: persist to blobs if available and not bypassed
    if (!noblobs) {
      const store = await getStoreOrNull(["BLOBS_STORE_NFL"]);
      if (store) {
        await putJSONIfStore(store, `weeks/2025/1/schedule.json`, body.schedule);
      } else {
        body.blobs = { skipped: true, reason: "no-store" };
      }
    } else {
      body.blobs = { skipped: true, reason: "noblobs=1" };
    }

    if (debug) body.diag = diag;
    return jsonResponse(body);
  } catch (err) {
    const e = String(err && err.message ? err.message : err);
    const body = { ok: false, error: e, diag };
    return jsonResponse(body, 200);
  }
}
