// netlify/functions/nfl-train/index.mjs
import { computeTeamForm, toPersistableJSON } from "../_lib/feature-engineering.mjs";

// blobs helper is ESM; this file is ESM too, so we can import directly.
import { openStore, putJSONSafe } from "../_lib/blobs-helper.mjs";

export const handler = async (event) => {
  const qs = new URLSearchParams(event.rawQuery || event.rawQueryString || "");
  const years = (qs.get("years") || "").split(",").map(s=>+s).filter(Boolean);
  const season = qs.get("season");
  const week = qs.get("week");
  const force = !!(qs.get("force") || qs.get("force_refresh"));

  let yearsList = years;
  if (!yearsList.length && season) {
    // if season provided, backfill a rolling window of seasons (last 4 + current)
    const y = +season;
    yearsList = [y-3, y-2, y-1, y].filter(Boolean);
  }
  if (!yearsList.length) yearsList = [2022, 2023, 2024, 2025];

  const logs = [];
  let persisted = false, wrote = null, persist_error = null;

  try {
    const { teams, logs: feLogs } = await computeTeamForm(yearsList, {});
    logs.push(...feLogs);

    // Try to persist to blobs
    try {
      const store = await openStore(process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "rrmodel");
      const key = "team_form.json";
      await putJSONSafe(store, key, teams);
      persisted = true;
      wrote = key;
      logs.push({ level:"info", msg:"persist_ok", key });
    } catch (e) {
      persist_error = e?.message || String(e);
      logs.push({ level:"warn", msg:"persist_failed", error: persist_error });
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        meta: { years: yearsList, persisted, wrote, persist_error },
        summary: { teams: teams.size },
        logs,
        updated: new Date().toISOString()
      })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: String(e),
        logs,
      })
    };
  }
};

export default { handler };
