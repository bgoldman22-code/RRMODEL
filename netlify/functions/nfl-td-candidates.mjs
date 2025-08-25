
// netlify/functions/nfl-td-candidates.mjs
export const config = { path: "/.netlify/functions/nfl-td-candidates" };

function jsonResponse(body, status=200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const SD_KEY = process.env.SPORTSDATA_API_KEY_NFL || process.env.FANTASYDATA_API_KEY_NFL || "";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function handler(event) {
  const url = new URL(event.rawUrl || `https://x/?${event.rawQuery}`);
  const debug = url.searchParams.get("debug") !== null;

  // quick schedule pull (stateless) from bootstrap endpoint to get matchups
  // if bootstrap is failing, return clear error
  const base = `${url.origin || ""}`;
  let schedule;
  try {
    const bootUrl = `${base}/.netlify/functions/nfl-bootstrap?mode=auto&debug=0&noblobs=1`;
    const bootRes = await fetch(bootUrl);
    const boot = await bootRes.json();
    if (!boot.ok) throw new Error(boot.error || "bootstrap failed");
    schedule = boot.schedule;
  } catch (e) {
    return jsonResponse({ ok: false, error: `schedule fetch failed: ${String(e)}` }, 200);
  }

  // SportsData.io is optional but recommended for real names & depth
  let playersByTeam = {};
  if (SD_KEY) {
    try {
      // free depth-like: use players endpoint (season=2025, json)
      const players = await fetchJson(`https://api.sportsdata.io/v3/nfl/scores/json/Players?key=${encodeURIComponent(SD_KEY)}`);
      for (const p of players) {
        const tid = String(p.TeamID || p.TeamId || p.Team || "").trim();
        if (!tid) continue;
        if (!playersByTeam[tid]) playersByTeam[tid] = [];
        playersByTeam[tid].push(p);
      }
    } catch (e) {
      // keep going with placeholders
      if (debug) console.log("sportsdata fetch failed", e);
    }
  }

  // build simple RB1 candidate list for each team in schedule
  const candidates = [];
  for (const g of schedule.games) {
    for (const side of ["home","away"]) {
      const team = g[side];
      const opp = side === "home" ? g.away : g.home;
      let name = `RB1-${team.id}`;
      let why = `RB • depth 1 • vs ${opp.abbrev}`;
      // if sportsdata present, try to pick the first RB starter-ish
      const teamPlayers = playersByTeam[team.id] || [];
      const rb = teamPlayers.find(p => (p.Position || p.FantasyPosition) === "RB");
      if (rb) {
        name = `${rb.FirstName || ""} ${rb.LastName || ""}`.trim() || name;
        why = `RB • likely starter • vs ${opp.abbrev}`;
      }
      candidates.push({
        player: name,
        pos: "RB",
        model_td: 0.365,
        rz_path: 0.248,
        exp_path: 0.117,
        why
      });
    }
  }

  return jsonResponse({ ok: true, season: 2025, week: 1, count: candidates.length, candidates });
}
