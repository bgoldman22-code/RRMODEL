import { makeStore } from "../_lib/blobs.mjs";
import { loadGames } from "../_lib/nflverse.mjs";
import { buildTeamForm } from "../_lib/features.mjs";

export async function handler(event) {
  try {
    const q = new URLSearchParams(event.queryStringParameters || {});
    const years = (q.get("years") || q.get("season") || "").split(",").map(s => s.trim()).filter(Boolean).map(s => Number(s));
    const seasons = years.length ? years : [2025];
    const games = await loadGames({ seasons });
    const tf = buildTeamForm(games, { window: 8, k: 3.0 });

    const store = makeStore();
    let persisted = false, persist_error = null;
    if (store.hasBlobs) {
      const res = await store.set("team_form.json", {
        seasons,
        updated: new Date().toISOString(),
        form: [...tf.teams.entries()].map(([team, v]) => ({ team, form: v.form })),
        params: tf.params,
      });
      persisted = res.ok;
      if (!res.ok) persist_error = res.reason;
    }

    console.log("[TRAIN]", { seasons, teams: tf.teams.size, rows: games.length, persisted, store: store.name });
    return json200({
      ok: true,
      meta: { seasons, persisted, wrote: persisted ? "team_form.json" : null, persist_error },
      summary: { teams: tf.teams.size, totalRows: games.length },
      updated: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[TRAIN][ERR]", e);
    return json500(e);
  }
}

function json200(obj){ return { statusCode: 200, body: JSON.stringify(obj) }; }
function json500(e){ return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(e?.message||e) }) }; }
