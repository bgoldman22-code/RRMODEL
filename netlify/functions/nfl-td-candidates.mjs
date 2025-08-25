import { getEnv } from "./_env.mjs";
import { getBlobsStoreSafe } from "./_blobs.mjs";
import { getWeekSchedule, getRoster } from "./_lib/espn-helpers.mjs";

const POS_ORDER = ["RB","WR","TE"];

function naiveDepth(players) {
  // Group by position; keep first N as depth by jersey (not perfect but decent)
  const byPos = {};
  for (const p of players) {
    const pos = (p.position || "").toUpperCase();
    if (!byPos[pos]) byPos[pos] = [];
    byPos[pos].push(p);
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a,b) => (Number(a.jersey||999) - Number(b.jersey||999)));
  }
  return byPos;
}

function modelFor(pos, depthIdx) {
  // Very simple priors; to be replaced by FantasyData model later
  const base = pos === "RB" ? 0.33 : pos === "WR" ? 0.26 : pos === "TE" ? 0.18 : 0.05;
  const depthPenalty = 0.85 ** (depthIdx);
  const rz = base * 0.68 * depthPenalty;
  const exp = base * 0.32 * depthPenalty;
  return { td: round((rz+exp)*100,1), rz: round(rz*100,1), exp: round(exp*100,1) };
}

function round(x, d=1){ const k = 10**d; return Math.round(x*k)/k; }

export const handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.rawQuery || event.queryStringParameters || "");
    const season = Number(qs.get("season") || 2025);
    const week = Number(qs.get("week") || 1);
    const noblobs = (qs.get("noblobs") === "1" || qs.get("noblobs") === "true");
    const debug = (qs.get("debug") === "1" || qs.get("debug") === "true");
    const env = getEnv();

    const { store } = await getBlobsStoreSafe(env.NFL_STORE_NAME, { noblobs });

    // Get schedule (prefer blobs if present)
    let sched;
    if (store) {
      sched = await store.getJSON(`weeks/${season}/${week}/schedule.json`);
    }
    if (!sched || !sched.games) {
      const s = await getWeekSchedule({ season, week });
      sched = s;
    }

    // Build candidates
    const out = [];
    for (const g of sched.games) {
      const oppById = {};
      oppById[g.home.id] = g.away;
      oppById[g.away.id] = g.home;

      for (const tid of [g.home.id, g.away.id]) {
        if (!tid) continue;
        // roster from cache first
        let roster = null;
        if (store) roster = await store.getJSON(`weeks/${season}/${week}/depth/${tid}.json`);
        if (!roster) roster = await getRoster(tid, season).catch(() => []);

        const byPos = naiveDepth(roster);
        for (const pos of POS_ORDER) {
          const list = byPos[pos] || [];
          list.slice(0,3).forEach((p, idx) => {
            const m = modelFor(pos, idx);
            const opp = oppById[tid];
            out.push({
              player: p.fullName || `${pos}${idx+1}-${tid}`,
              team: tid,
              pos,
              modelTD: m.td,
              rzPath: m.rz,
              expPath: m.exp,
              why: `${pos} • depth ${idx+1} • vs ${opp?.abbrev || "?"}`,
              gameId: g.id,
              opp: opp?.abbrev || "?"
            });
          });
        }
      }
    }

    // top N
    out.sort((a,b) => b.modelTD - a.modelTD);
    const body = {
      ok: true,
      season, week,
      games: (sched.games || []).length,
      candidates: out.slice(0, 150)
    };
    if (debug) body.sample = out.slice(0,10);
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
