// netlify/functions/nfl-rosters-nb.mjs
// No-blobs roster/depth endpoint (SportsData.io/FantasyData).
// Reads key from ENV: SPORTSDATA_API_KEY or FANTASYDATA_API_KEY, or from ?key=
// Query: ?season=2025&week=1&debug=1

const TEAM_ABBREV = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
  9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
  17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
  25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
};

const json = (status, obj) => ({
  statusCode: status,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(obj)
});

const getParam = (url, name) => new URL(url).searchParams.get(name);

export async function handler(event) {
  const debug = getParam(event.rawUrl, "debug") === "1";
  const season = Number(getParam(event.rawUrl, "season") || "2025");
  const week = Number(getParam(event.rawUrl, "week") || "1");

  const keyFromEnv = process.env.SPORTSDATA_API_KEY || process.env.FANTASYDATA_API_KEY || "";
  const key = getParam(event.rawUrl, "key") || keyFromEnv;

  if (!key) {
    return json(200, { ok: true, season, week, teams: 0, used: "placeholder", rosters: {}, note: "No API key provided; returning placeholder structure." });
  }

  // SportsData.io depth charts endpoint (Team depth charts by season).
  // Docs: https://sportsdata.io/developers/api-documentation/nfl
  // Example: https://api.sportsdata.io/v3/nfl/scores/json/DepthCharts/2025?key=YOUR_KEY
  const url = `https://api.sportsdata.io/v3/nfl/scores/json/DepthCharts/${season}?key=${key}`;

  try {
    const res = await fetch(url, { headers: { "accept": "application/json" } });
    if (!res.ok) {
      const text = await res.text();
      return json(500, { ok: false, error: `SportsData.io error ${res.status}`, detail: text.slice(0, 300) });
    }
    const data = await res.json();

    // Normalize into { teamAbbrev: { QB: [...], RB: [...], WR: [...], TE: [...]} }
    const rosters = {};
    for (const team of data || []) {
      const teamId = team?.TeamID || team?.TeamId || team?.TeamId;
      // *** IMPORTANT FIX: disambiguate ?? with || using parentheses ***
      const abbrev = (team?.Team || team?.TeamAbbreviation || TEAM_ABBREV[teamId]) || team?.Key || team?.TeamKey || "UNK";

      const add = (pos, arr) => {
        if (!arr || !arr.length) return;
        rosters[abbrev] ||= {};
        rosters[abbrev][pos] = arr
          .filter(Boolean)
          .map((p, idx) => ({
            id: p?.PlayerID || p?.PlayerId || null,
            name: p?.Name || [p?.FirstName, p?.LastName].filter(Boolean).join(" ") || null,
            pos: pos,
            depth: idx + 1,
          }));
      };

      // SportsData DepthChart object contains arrays like Quarterbacks, RunningBacks, WideReceivers, TightEnds
      add("QB", team?.Quarterbacks);
      add("RB", team?.RunningBacks);
      add("WR", team?.WideReceivers);
      add("TE", team?.TightEnds);
    }

    return json(200, { ok: true, season, week, teams: Object.keys(rosters).length, used: "sportsdata-depth", rosters });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.stack || err) });
  }
}
