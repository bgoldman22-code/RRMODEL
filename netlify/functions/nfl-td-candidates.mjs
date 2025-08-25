// netlify/functions/nfl-td-candidates.mjs
import { openStore } from "./_lib/blobs-helper.mjs";
import { ok, err } from "./_lib/respond.js";

function fakeModelForRB(teamId, oppAbbrev) {
  // Dummy model numbers as placeholders
  return {
    modelTD: 0.366,
    rz: 0.249,
    exp: 0.117,
    why: `RB • depth 1 • vs ${oppAbbrev || "?"}`,
  };
}

export const handler = async (event) => {
  const debug = event.queryStringParameters?.debug === "1";
  const store = openStore("nfl");

  // Load schedule
  const pointer = await (await store).get("schedule.json", { type: "json" });
  if (!pointer?.ref) {
    return err("schedule unavailable", { diag: [{ step: "load schedule pointer", ok: false }] });
  }
  const sched = await (await store).get(pointer.ref, { type: "json" });
  if (!sched?.games?.length) {
    return err("schedule unavailable", { diag: [{ step: "load schedule doc", ok: false }, { pointer }] });
  }

  // Try depth charts (optional)
  const depth = await (await store).get("depth-charts.json", { type: "json" }).catch(()=>null);

  const candidates = [];
  for (const g of sched.games) {
    const home = g.home?.abbrev, away = g.away?.abbrev;
    // Add one RB starter per team as placeholder
    candidates.push({
      player: `RB1-${g.home?.id}`,
      pos: "RB",
      ...fakeModelForRB(g.home?.id, away),
    });
    candidates.push({
      player: `RB1-${g.away?.id}`,
      pos: "RB",
      ...fakeModelForRB(g.away?.id, home),
    });
  }

  return ok({
    season: sched.season, week: sched.week,
    games: sched.games.length,
    candidates,
    debug: debug ? { used: { scheduleKey: pointer.ref }, hasDepth: !!depth } : undefined
  });
};