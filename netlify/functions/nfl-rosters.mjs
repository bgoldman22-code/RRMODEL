import { getJSON, ok, bad } from "./_lib/http.mjs";

const TEAM_IDS = {
  "ARI":22,"ATL":1,"BAL":33,"BUF":2,"CAR":29,"CHI":3,"CIN":4,"CLE":5,"DAL":6,
  "DEN":7,"DET":8,"GB":9,"HOU":34,"IND":11,"JAX":30,"KC":12,"LAC":24,"LAR":14,
  "LV":13,"MIA":15,"MIN":16,"NE":17,"NO":18,"NYG":19,"NYJ":20,"PHI":21,"PIT":23,
  "SEA":26,"SF":25,"TB":27,"TEN":10,"WSH":28
};

function pickPositions(entries) {
  // keep RB/WR/TE/QB, annotate depth if present
  const out = [];
  for (const e of entries || []) {
    const pos = e?.Position || e?.position || "";
    if (!["RB","WR","TE","QB","FB"].includes(pos)) continue;
    out.push({
      playerId: e?.PlayerID || e?.playerId,
      name: [e?.FirstName, e?.LastName].filter(Boolean).join(" ") || e?.Name || e?.name,
      position: pos === "FB" ? "RB" : pos,
      depth: e?.DepthOrder || e?.Depth || e?.depth || null,
      team: e?.Team || e?.team
    });
  }
  return out;
}

async function fetchSportsDataDepth(season, apiKey) {
  const url = `https://api.sportsdata.io/v3/nfl/scores/json/DepthCharts/${season}`;
  const res = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': apiKey }});
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`SportsData depth charts failed ${res.status}: ${t?.slice(0,160)}`);
  }
  const data = await res.json();
  // Map to { [abbr]: [players...] }
  const byTeam = {};
  for (const team of data || []) {
    const abbr = team?.Team || team?.TeamID || team?.Key;
    const entries = pickPositions(team?.DepthChart || team?.Players || team?.DepthChartPlayers || []);
    if (abbr && entries?.length) {
      byTeam[abbr] = entries;
    }
  }
  return byTeam;
}

export default async (event) => {
  try {
    const u = new URL(event.rawUrl || `https://x.invalid${event.rawQuery ? "?"+event.rawQuery : ""}`);
    const season = Number(u.searchParams.get("season") || 2025);
    const week = Number(u.searchParams.get("week") || 1);
    const debug = u.searchParams.get("debug") === "1";
    const keyOverride = u.searchParams.get("key");
    const apiKey = keyOverride || process.env.SPORTSDATA_API_KEY || process.env.FANTASYDATA_API_KEY;

    if (!apiKey) {
      // return empty but ok so front-end can still render
      return ok({ ok:true, season, week, teams: 0, used: "placeholder", rosters: {} });
    }

    const teams = await fetchSportsDataDepth(season, apiKey);
    // also index by numeric team id to match ESPN schedule join
    const rostersById = {};
    for (const [abbr, list] of Object.entries(teams)) {
      const id = TEAM_IDS[abbr];
      if (id) rostersById[id] = list;
    }
    return ok({ ok:true, season, week, teams: Object.keys(teams).length, used: "sportsdata", rosters: rostersById, rostersByAbbrev: teams, debug });
  } catch (err) {
    return bad(err);
  }
};