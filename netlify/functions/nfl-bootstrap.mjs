import { getEnv } from "./_env.mjs";
import { getBlobsStoreSafe } from "./_blobs.mjs";
import { getWeekSchedule, getRoster } from "./_lib/espn-helpers.mjs";

export const handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.rawQuery || event.queryStringParameters || "");
    const season = Number(qs.get("season") || 2025);
    const week = Number(qs.get("week") || 1);
    const noblobs = (qs.get("noblobs") === "1" || qs.get("noblobs") === "true");
    const debug = (qs.get("debug") === "1" || qs.get("debug") === "true");
    const refresh = (qs.get("refresh") === "1" || qs.get("refresh") === "true");
    const env = getEnv();

    // blobs (optional)
    const { store, context } = await getBlobsStoreSafe(env.NFL_STORE_NAME, { noblobs });

    // Fetch schedule
    const sched = await getWeekSchedule({ season, week });

    // Optionally cache schedule
    if (store && (refresh || qs.get("cache") === "1")) {
      await store.setJSON(`weeks/${season}/${week}/schedule.json`, sched);
    }

    // Optionally prefetch and cache rosters (best-effort)
    const rosterKeys = [];
    if (store && (refresh || qs.get("rosters") === "1")) {
      for (const g of sched.games) {
        for (const tid of [g.home.id, g.away.id]) {
          if (!tid) continue;
          const players = await getRoster(tid, season).catch(() => []);
          await store.setJSON(`weeks/${season}/${week}/depth/${tid}.json`, players);
          rosterKeys.push(tid);
        }
      }
    }

    const body = {
      ok: true, season, week, games: sched.games.length, schedule: sched,
      blobs: { used: !!store, context, rosterKeys }
    };
    if (debug) body.debug = { env };
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
