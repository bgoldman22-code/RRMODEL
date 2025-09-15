import { parseSeasons } from "../_lib/util.mjs";
import { fetchGamesCsv } from "../_lib/nflverse.mjs";
import { buildTeamForm } from "../_lib/features.mjs";
import { saveToBlobs } from "../_lib/blobs-helper.mjs";

export async function handler(event){
  try{
    const qs = event.queryStringParameters || {};
    const seasons = parseSeasons(qs);
    const rows = await fetchGamesCsv({ seasons });
    const formMap = buildTeamForm(rows);
    // shape to JSON object { TEAM: value }
    const team_form = Object.fromEntries(formMap.entries());

    let persisted = false, wrote = null, persist_error = null;
    try{
      const res = await saveToBlobs("team_form.json", team_form);
      persisted = !!res?.persisted;
      wrote = persisted ? "team_form.json" : null;
      if (!persisted) persist_error = res?.reason || "unknown";
    }catch(e){
      persist_error = String(e?.message || e);
    }

    const meta = { years: seasons, persisted, wrote, persist_error };
    const summary = { teams: Object.keys(team_form).length, totalRows: rows.length };
    const seasonResults = seasons.map(y => ({ year: y, ok: true, source: "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv", reason: null }));
    const body = { ok: true, meta, summary, seasonResults, updated: new Date().toISOString() };
    console.log("[TRAIN]", JSON.stringify({ ...meta, ...summary }));
    return { statusCode: 200, body: JSON.stringify(body) };
  }catch(err){
    return { statusCode: 200, body: JSON.stringify({ ok:false, error:String(err) }) };
  }
}

export default { handler };
