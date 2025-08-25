import { createStore } from "./_blobs.mjs";

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function pct(n) { return `${(n * 100).toFixed(1)}%`; }

function simpleModelForRB1() {
  const total = 0.366;
  const rz = 0.249;
  const exp = total - rz;
  return { total, rz, exp };
}

export const handler = async (event) => {
  try {
    const debug = event.queryStringParameters?.debug === "1";
    const store = createStore();

    const schedule = await store.getJSON("weeks/2025/1/schedule.json");
    if (!schedule) {
      return resp(200, { ok: false, error: "schedule unavailable" });
    }

    const candidates = [];

    for (const g of schedule.games) {
      // mock candidate per game for now
      const m = simpleModelForRB1();
      candidates.push({
        player: "RB1-" + g.home.id,
        pos: "RB",
        modelTD: pct(m.total),
        rzPath: pct(m.rz),
        expPath: pct(m.exp),
        why: `RB • depth 1 • vs ${g.away.abbrev}`,
      });
    }

    return resp(200, {
      ok: true,
      season: schedule.season,
      week: schedule.week,
      games: schedule.games?.length || 0,
      candidates,
      ...(debug ? { candidateCount: candidates.length } : {}),
    });
  } catch (err) {
    return resp(err?.statusCode || 500, { ok: false, error: err?.message || "unhandled error" });
  }
};
