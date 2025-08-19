// netlify/functions/mlb-schedule.mjs
// Minimal schedule with probables that does NOT require Netlify Blobs.
export default async (req) => {
  try {
    const url = new URL(req.url);
    const date = (url.searchParams.get("date") || "").trim();
    if (!date) return json(400, { ok:false, error:"Missing date=YYYY-MM-DD" });

    const api = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}&hydrate=probablePitcher(person),venue`;
    const r = await fetch(api, { headers: { "accept":"application/json" } });
    if (!r.ok) return json(502, { ok:false, error:`statsapi ${r.status}` });
    const d = await r.json();
    const games = (d?.dates?.[0]?.games) || [];

    const out = games.map(g => {
      const home = g?.teams?.home?.team?.abbreviation || g?.teams?.home?.team?.triCode || g?.teams?.home?.team?.name;
      const away = g?.teams?.away?.team?.abbreviation || g?.teams?.away?.team?.triCode || g?.teams?.away?.team?.name;
      const hp   = g?.teams?.home?.probablePitcher?.fullName || g?.teams?.home?.probablePitcher?.person?.fullName || null;
      const ap   = g?.teams?.away?.probablePitcher?.fullName || g?.teams?.away?.probablePitcher?.person?.fullName || null;
      return { home, away, home_probable_pitcher_name: hp, away_probable_pitcher_name: ap };
    });

    return json(200, { ok:true, schedule: out });
  } catch (e) {
    return json(500, { ok:false, error: e?.message || "server-error" });
  }
}

function json(statusCode, body){
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type":"application/json", "cache-control":"no-store" }
  });
}
