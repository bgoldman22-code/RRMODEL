import { loadFromBlobs } from "../_lib/blobs-helper.mjs";
import { log } from "../_lib/log.mjs";

export async function handler(event) {
  try {
    const force = event.queryStringParameters?.force;
    const features = await loadFromBlobs("team_form.json");
    if (!features) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, rows: [], meta: { source: "stub", force } }) };
    }
    // Fake picks for now
    const rows = (features.results || []).map(r => ({
      matchup: `TeamA @ TeamB`,
      moneylineText: "TEAM A (-150)",
      moneylineConf: 0.6,
      spreadText: "TEAM A -3.5 (-110)",
      spreadConf: 0.55,
      totalText: "OVER 45.5",
      totalConf: 0.58
    }));
    log("sample_output", rows.slice(0, 2));
    return { statusCode: 200, body: JSON.stringify({ ok: true, updated: new Date().toISOString(), rows }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
}
