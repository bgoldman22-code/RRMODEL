import { makeStore } from "../_lib/blobs.mjs";
import { loadGames } from "../_lib/nflverse.mjs";
import { buildTeamForm, matchupPick } from "../_lib/features.mjs";
import { getScheduleWithOdds } from "./schedule-source.mjs";

/**
 * Self-healing predictions endpoint.
 * - Tries to load team_form from Blobs.
 * - If missing or ?force=1, computes features on the fly,
 *   then persists to Blobs when available.
 * - Always returns predictions (no front-end crashes).
 */
export async function handler(event) {
  try {
    const q = new URLSearchParams(event.queryStringParameters || {});
    const force = q.get("force");
    // Allow overriding seasons via query (?years=2023,2024,2025)
    const years = (q.get("years") || q.get("season") || "").split(",").map(s => s.trim()).filter(Boolean).map(Number);
    const seasons = years.length ? years : [2022, 2023, 2024, 2025];

    // 1) Try Blobs first (unless forced)
    const store = makeStore();
    let tf = null;
    let source = "blobs";
    let persisted = false;
    let persist_error = null;

    if (!force && store.hasBlobs) {
      const saved = await store.get("team_form.json");
      if (saved?.form?.length) {
        const map = new Map(saved.form.map(r => [r.team, { form: r.form }]));
        tf = { teams: map, params: saved.params || { window: 8, k: 3.0 } };
      }
    }

    // 2) If missing or forced: compute features and persist if possible
    if (!tf) {
      const games = await loadGames({ seasons });
      tf = buildTeamForm(games, { window: 8, k: 3.0 });
      source = "ephemeral";

      if (store.hasBlobs) {
        try {
          const payload = {
            seasons,
            updated: new Date().toISOString(),
            form: [...tf.teams.entries()].map(([team, v]) => ({ team, form: v.form })),
            params: tf.params,
          };
          const res = await store.set("team_form.json", payload);
          persisted = !!res?.ok;
          if (persisted) source = "ephemeral-and-persisted";
          if (!res?.ok) persist_error = res?.reason || "persist_failed";
        } catch (e) {
          persist_error = String(e?.message || e);
        }
      }
    }

    // 3) Schedule + odds join
    const sched = await getScheduleWithOdds();

    const rows = sched.map(g => {
      const moneyline = matchupPick({ home: g.homeTeam, away: g.awayTeam }, tf, g.odds).moneyline;
      return {
        id: g.id,
        matchup: `${g.awayTeam.toUpperCase()} @ ${g.homeTeam.toUpperCase()}`,
        kickoff: g.kickoff,
        moneylineText: moneyline?.text || "–",
        moneylineConf: moneyline?.confidence ?? null,
        spreadText: "–",
        spreadConf: null,
        totalText: "–",
        totalConf: null,
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        updated: new Date().toISOString(),
        meta: { source, persisted, persist_error, seasonsUsed: seasons },
        rows
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(e?.message||e) }) };
  }
}
