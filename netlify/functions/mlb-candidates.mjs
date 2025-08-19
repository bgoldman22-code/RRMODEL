// netlify/functions/mlb-candidates.mjs
// Temporary stub to satisfy the UI while learning/predictions store is offline.
// Returns an empty candidate list instead of 404 HTML, so the front-end doesn't crash.
export default async (req) => {
  try {
    const url = new URL(req.url);
    const date = (url.searchParams.get("date") || "").trim();
    if (!date) return json(200, { ok:true, date:null, candidates: [], bonus: [], stats: { note:"missing date" } });
    return json(200, { ok:true, date, candidates: [], bonus: [], stats: { note:"stub: no predictions available" } });
  } catch (e) {
    return json(200, { ok:true, candidates: [], bonus: [], stats: { note: "stub error" } });
  }
}

function json(statusCode, body){
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type":"application/json", "cache-control":"no-store" }
  });
}
