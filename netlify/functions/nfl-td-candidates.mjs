// netlify/functions/nfl-td-candidates.mjs
// Build Anytime TD candidate list with real player names using SportsData roster.
// No Blobs dependency; pure fetch each call. Supports debug.

import { getTeamRoster, ESPN_ID_TO_KEY, pickStarters } from "./_lib/sd.mjs";

async function getSchedule() {
  // Call the local bootstrap with no blobs use
  const u = new URL(process.env.SELF_BOOTSTRAP_URL || "http://localhost/.netlify/functions/nfl-bootstrap");
  u.searchParams.set("mode","auto");
  u.searchParams.set("start", "20250904");
  u.searchParams.set("end", "20250910");
  const res = await fetch(u.toString());
  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    return { ok:false, error: "bootstrap failed", status: res.status, body: t };
  }
  const j = await res.json();
  return j.ok ? { ok:true, schedule: j.schedule } : { ok:false, error: j.error || "unknown schedule error", detail: j };
}

function simpleModelProb(pos) {
  // Very basic starting priors per position; real model to replace later.
  if (pos === "RB") return 0.35;
  if (pos === "WR") return 0.27;
  if (pos === "TE") return 0.18;
  return 0.10;
}

export const handler = async (event) => {
  const debug = !!event.queryStringParameters?.debug;
  try {
    const scheduleRes = await getSchedule();
    if (!scheduleRes.ok) {
      return { statusCode: 500, headers: {"content-type":"application/json"}, body: JSON.stringify({ ok:false, error: scheduleRes.error, bootstrap: scheduleRes.detail || null }) };
    }
    const games = scheduleRes.schedule.games || [];
    const out = [];
    const diag = [];

    for (const g of games) {
      const homeKey = ESPN_ID_TO_KEY[g.home?.id] || g.home?.abbrev;
      const awayKey = ESPN_ID_TO_KEY[g.away?.id] || g.away?.abbrev;
      // Fetch rosters for both sides
      const [homeR, awayR] = await Promise.all([
        getTeamRoster(homeKey),
        getTeamRoster(awayKey)
      ]);

      diag.push({ game: g.id, homeKey, awayKey, homeRosterOk: !!homeR.ok, awayRosterOk: !!awayR.ok });

      const homeStarters = homeR.ok ? pickStarters(homeR.data) : [];
      const awayStarters = awayR.ok ? pickStarters(awayR.data) : [];

      const addCands = (arr, oppKey) => {
        for (const p of arr) {
          const prob = simpleModelProb(p.Position);
          out.push({
            player: p.Name,
            pos: p.Position,
            team: p.Team,
            opp: oppKey,
            model_td: Number((prob*100).toFixed(1)),
            why: `${p.Position} • depth ${p.DepthChartOrder ?? "?"} • vs ${oppKey}`
          });
        }
      };
      addCands(homeStarters, awayKey);
      addCands(awayStarters, homeKey);
    }

    // sort by model_td desc then name
    out.sort((a,b) => b.model_td - a.model_td || a.player.localeCompare(b.player));

    const body = { ok:true, season: 2025, week: 1, count: out.length, candidates: out };
    if (debug) body.diag = diag;

    return { statusCode: 200, headers: {"content-type":"application/json"}, body: JSON.stringify(body) };
  } catch (e) {
    return { statusCode: 500, headers: {"content-type":"application/json"}, body: JSON.stringify({ ok:false, error: String(e?.message || e) }) };
  }
};