import { fetchSeasonData } from "../_lib/fastr-sources.mjs";
import { saveToBlobs } from "../_lib/blobs-helper.mjs";
import { log } from "../_lib/log.mjs";

export async function handler(event) {
  try {
    const years = (event.queryStringParameters?.years || "").split(",").map(y => y.trim()).filter(Boolean);
    const force = event.queryStringParameters?.force;
    const results = [];
    for (const year of years) {
      const res = await fetchSeasonData(year);
      results.push(res);
    }
    if (force) {
      await saveToBlobs("team_form.json", { years, results, updated: new Date().toISOString() });
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, years, results, updated: new Date().toISOString() })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
}
