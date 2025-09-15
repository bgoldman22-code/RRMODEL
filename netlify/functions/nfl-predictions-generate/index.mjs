import { makeStore } from "../_lib/blobs.mjs";
import { loadGames } from "../_lib/nflverse.mjs";
import { buildTeamForm, matchupPick } from "../_lib/features.mjs";
import { getScheduleWithOdds } from "./schedule-source.mjs";

export async function handler(event) {
  try {
    const q = new URLSearchParams(event.queryStringParameters || {});
    const force = q.get("force");

    // try blobs first
    const store = makeStore();
    let source = "blobs";
    let tf = null;

    if (!force && store.hasBlobs) {
      const saved = await store.get("team_form.json");
      if (saved?.form?.length) {
        const map = new Map(saved.form.map(r => [r.team, { form: r.form }]));
        tf = { teams: map, params: saved.params || { window: 8, k: 3.0 } };
      }
    }

    // fallback: compute ephemeral
    if (!tf) {
      const seasons = [2022, 2023, 2024, 2025];
      const games = await loadGames({ seasons });
      tf = buildTeamForm(games, { window: 8, k: 3.0 });
      source = "ephemeral";
    }

    // schedule + odds
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

    console.log("[PREDS]", { source, rows: rows.length });
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, updated: new Date().toISOString(), meta: { source }, rows }),
    };
  } catch (e) {
    console.error("[PREDS][ERR]", e);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(e?.message||e) }) };
  }
}
