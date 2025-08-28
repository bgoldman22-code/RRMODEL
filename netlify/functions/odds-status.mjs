// netlify/functions/odds-status.mjs
// Optional status endpoint: shows how many FanDuel HR odds were matched for a given date
import { makeStore } from "./_blobs.js";

export const handler = async (event) => {
  try {
    const date = (event.queryStringParameters?.date || '').trim(); // YYYY-MM-DD (optional)
    const dateEt = date || new Date().toISOString().slice(0,10);
    const store = makeStore("rrmodel");
    const key = `mlb/odds/fanduel/${dateEt}.json`;
    const json = await store.get(key, { type: "json" });

    if (!json) {
      return jsonResp(404, { ok:false, error:"no_odds_dump_for_date", dateEt, hint:"Ensure slate function writes this blob after mapping odds." });
    }
    const matched = Number(json.matched ?? 0);
    const total = Number(json.total ?? 0);
    return jsonResp(200, { ok:true, dateEt, matched, total, sample: (json.sample || []).slice(0,10) });
  } catch (e) {
    return jsonResp(500, { ok:false, error:String(e?.message || e) });
  }
};

function jsonResp(statusCode, body){
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body)
  };
}
