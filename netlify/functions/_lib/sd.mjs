// netlify/functions/_lib/sd.mjs
// Lightweight SportsData.io (a.k.a. FantasyData) client for NFL
// Uses native fetch on Netlify. No node-fetch import required.

const API_BASE = process.env.SPORTSDATA_API_BASE || "https://api.sportsdata.io/v3/nfl";
const API_KEY = process.env.SPORTSDATA_API_KEY || process.env.FANTASYDATA_API_KEY || process.env.SPORTSDATA_API_KEY_NFL || process.env.FANTASYDATA_API_KEY_NFL;

/**
 * Generic GET helper with SportsData 'Ocp-Apim-Subscription-Key' header.
 */
export async function sdGet(path, params = {}) {
  if (!API_KEY) {
    return { ok: false, error: "Missing SPORTS/FANTASYDATA API key (set SPORTSDATA_API_KEY or FANTASYDATA_API_KEY)." };
  }
  const u = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  const res = await fetch(u.toString(), {
    headers: {
      "Ocp-Apim-Subscription-Key": API_KEY
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: `SportsData GET ${path} failed`, body: txt };
  }
  const data = await res.json();
  return { ok: true, data };
}

/**
 * Get basic active players / roster for a team (by key/abbr), season optional.
 * SportsData team keys are typically like "PHI", "DAL", etc.
 * Fallback: if teamKey is unknown, returns empty list.
 */
export async function getTeamRoster(teamKey, season = undefined) {
  if (!teamKey) return { ok: true, data: [] };
  // Endpoint: /scores/json/Players/{team}
  // Docs: https://sportsdata.io/developers/api-documentation/nfl#/free
  // (Players – by Team) – available on several plans; we use it here for names/positions.
  const { ok, data, error, status, body } = await sdGet(`/scores/json/Players/${encodeURIComponent(teamKey)}`);
  if (!ok) return { ok, error, status, body };
  // Normalize to a light shape we need
  const players = (data || []).map(p => ({
    PlayerID: p.PlayerID,
    Name: p.Name || [p.FirstName, p.LastName].filter(Boolean).join(" ").trim(),
    FirstName: p.FirstName,
    LastName: p.LastName,
    Position: p.Position,
    Team: p.Team,
    DepthChartOrder: p.DepthChartOrder ?? null,
    Status: p.Status,
    Number: p.Number,
  }));
  return { ok: true, data: players };
}

/**
 * Optional: simple map from ESPN numeric team id -> common 2-3 letter key
 * (Matches both ESPN and SportsData common abbreviations where possible).
 */
export const ESPN_ID_TO_KEY = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE",
  6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN",
  11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA",
  16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ",
  21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF",
  26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX",
  33: "BAL", 34: "HOU"
};

/**
 * Quick helper to pick starters by position from a roster.
 * We choose lowest DepthChartOrder (1 preferred), then lowest jersey Number as tie-breaker.
 */
export function pickStarters(roster, positions = ["RB","WR","TE"], perPos = 1) {
  const starters = [];
  for (const pos of positions) {
    const pool = (roster || []).filter(p => p.Position === pos);
    pool.sort((a,b) => {
      const da = a.DepthChartOrder ?? 99;
      const db = b.DepthChartOrder ?? 99;
      if (da !== db) return da - db;
      const na = (a.Number ?? 999);
      const nb = (b.Number ?? 999);
      return na - nb;
    });
    starters.push(...pool.slice(0, perPos));
  }
  return starters;
}