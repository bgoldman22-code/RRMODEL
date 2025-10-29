/**
 * NBA Team Priors - 2024-25 Season End-of-Season Stats
 * Used as fallback when current season boxscore data is unavailable
 * 
 * Source: data/nba/aggregates/archive/team_seasons_2024_25.json
 * Note: Values are season-long averages, will be regressed 70% team + 30% league
 */

export const TEAM_PRIORS_2024_25 = {
  ATL: { offRtg: 117.1, defRtg: 119.5, netRtg: -2.4, pace: 101.1, efg: 0.547, ts: 0.589, tovPct: 0.130, orbPct: 0.245, ftRate: 0.241 },
  BOS: { offRtg: 122.2, defRtg: 110.6, netRtg: 11.6, pace: 100.5, efg: 0.594, ts: 0.614, tovPct: 0.119, orbPct: 0.263, ftRate: 0.254 },
  BKN: { offRtg: 113.3, defRtg: 115.9, netRtg: -2.6, pace: 99.9, efg: 0.554, ts: 0.573, tovPct: 0.122, orbPct: 0.242, ftRate: 0.250 },
  CHA: { offRtg: 110.3, defRtg: 118.9, netRtg: -8.6, pace: 100.4, efg: 0.534, ts: 0.563, tovPct: 0.136, orbPct: 0.267, ftRate: 0.274 },
  CHI: { offRtg: 114.7, defRtg: 116.0, netRtg: -1.3, pace: 98.8, efg: 0.557, ts: 0.584, tovPct: 0.128, orbPct: 0.224, ftRate: 0.259 },
  CLE: { offRtg: 116.5, defRtg: 111.5, netRtg: 5.0, pace: 98.1, efg: 0.570, ts: 0.592, tovPct: 0.118, orbPct: 0.247, ftRate: 0.260 },
  DAL: { offRtg: 118.7, defRtg: 115.9, netRtg: 2.8, pace: 97.8, efg: 0.585, ts: 0.598, tovPct: 0.109, orbPct: 0.233, ftRate: 0.229 },
  DEN: { offRtg: 117.0, defRtg: 113.4, netRtg: 3.6, pace: 98.7, efg: 0.580, ts: 0.604, tovPct: 0.129, orbPct: 0.238, ftRate: 0.273 },
  DET: { offRtg: 109.7, defRtg: 120.1, netRtg: -10.4, pace: 100.5, efg: 0.534, ts: 0.564, tovPct: 0.128, orbPct: 0.249, ftRate: 0.293 },
  GSW: { offRtg: 113.8, defRtg: 114.7, netRtg: -0.9, pace: 99.6, efg: 0.567, ts: 0.583, tovPct: 0.134, orbPct: 0.214, ftRate: 0.217 },
  HOU: { offRtg: 115.0, defRtg: 108.6, netRtg: 6.4, pace: 100.5, efg: 0.555, ts: 0.581, tovPct: 0.115, orbPct: 0.260, ftRate: 0.282 },
  IND: { offRtg: 122.3, defRtg: 118.0, netRtg: 4.3, pace: 103.5, efg: 0.591, ts: 0.610, tovPct: 0.114, orbPct: 0.256, ftRate: 0.251 },
  LAC: { offRtg: 114.6, defRtg: 110.7, netRtg: 3.9, pace: 98.4, efg: 0.566, ts: 0.591, tovPct: 0.119, orbPct: 0.233, ftRate: 0.275 },
  LAL: { offRtg: 113.9, defRtg: 113.2, netRtg: 0.7, pace: 100.0, efg: 0.547, ts: 0.577, tovPct: 0.129, orbPct: 0.245, ftRate: 0.284 },
  MEM: { offRtg: 111.9, defRtg: 113.7, netRtg: -1.8, pace: 101.4, efg: 0.540, ts: 0.565, tovPct: 0.127, orbPct: 0.289, ftRate: 0.255 },
  MIA: { offRtg: 111.7, defRtg: 112.0, netRtg: -0.3, pace: 97.1, efg: 0.551, ts: 0.574, tovPct: 0.130, orbPct: 0.247, ftRate: 0.262 },
  MIL: { offRtg: 118.2, defRtg: 114.1, netRtg: 4.1, pace: 100.5, efg: 0.572, ts: 0.597, tovPct: 0.117, orbPct: 0.231, ftRate: 0.279 },
  MIN: { offRtg: 114.1, defRtg: 109.5, netRtg: 4.6, pace: 98.6, efg: 0.563, ts: 0.588, tovPct: 0.120, orbPct: 0.261, ftRate: 0.273 },
  NO: { offRtg: 111.5, defRtg: 114.9, netRtg: -3.4, pace: 99.3, efg: 0.542, ts: 0.571, tovPct: 0.131, orbPct: 0.256, ftRate: 0.285 },
  NY: { offRtg: 115.1, defRtg: 111.7, netRtg: 3.4, pace: 97.5, efg: 0.566, ts: 0.588, tovPct: 0.115, orbPct: 0.282, ftRate: 0.271 },
  OKC: { offRtg: 119.7, defRtg: 109.5, netRtg: 10.2, pace: 97.9, efg: 0.582, ts: 0.604, tovPct: 0.111, orbPct: 0.271, ftRate: 0.270 },
  ORL: { offRtg: 111.7, defRtg: 106.2, netRtg: 5.5, pace: 97.2, efg: 0.554, ts: 0.577, tovPct: 0.121, orbPct: 0.245, ftRate: 0.267 },
  PHI: { offRtg: 113.8, defRtg: 112.5, netRtg: 1.3, pace: 98.1, efg: 0.556, ts: 0.581, tovPct: 0.117, orbPct: 0.249, ftRate: 0.278 },
  PHX: { offRtg: 116.0, defRtg: 113.4, netRtg: 2.6, pace: 99.3, efg: 0.576, ts: 0.596, tovPct: 0.120, orbPct: 0.223, ftRate: 0.248 },
  POR: { offRtg: 108.6, defRtg: 117.8, netRtg: -9.2, pace: 98.9, efg: 0.532, ts: 0.562, tovPct: 0.136, orbPct: 0.246, ftRate: 0.293 },
  SAC: { offRtg: 115.9, defRtg: 117.1, netRtg: -1.2, pace: 100.4, efg: 0.569, ts: 0.590, tovPct: 0.127, orbPct: 0.217, ftRate: 0.247 },
  SA: { offRtg: 109.5, defRtg: 116.3, netRtg: -6.8, pace: 99.9, efg: 0.545, ts: 0.572, tovPct: 0.123, orbPct: 0.265, ftRate: 0.278 },
  TOR: { offRtg: 111.5, defRtg: 116.5, netRtg: -5.0, pace: 98.1, efg: 0.546, ts: 0.574, tovPct: 0.128, orbPct: 0.241, ftRate: 0.260 },
  UTAH: { offRtg: 115.3, defRtg: 122.6, netRtg: -7.3, pace: 99.1, efg: 0.565, ts: 0.590, tovPct: 0.131, orbPct: 0.257, ftRate: 0.264 },
  WAS: { offRtg: 112.3, defRtg: 121.5, netRtg: -9.2, pace: 99.4, efg: 0.552, ts: 0.580, tovPct: 0.126, orbPct: 0.231, ftRate: 0.284 }
};

// League averages for regression
export const LEAGUE_AVG_2024_25 = {
  offRtg: 114.5,
  defRtg: 114.5,
  netRtg: 0.0,
  pace: 99.5,
  efg: 0.558,
  ts: 0.584,
  tovPct: 0.124,
  orbPct: 0.249,
  ftRate: 0.267
};

/**
 * Get regressed team prior (70% team + 30% league average)
 * @param {string} teamAbbr - Team abbreviation
 * @returns {object} - Regressed prior stats
 */
export function getRegressedPrior(teamAbbr) {
  const prior = TEAM_PRIORS_2024_25[teamAbbr];
  
  if (!prior) {
    console.warn(`[NBA] No prior for ${teamAbbr}, using league average`);
    return { ...LEAGUE_AVG_2024_25 };
  }
  
  // Regress toward league mean (70% team, 30% league)
  const teamWeight = 0.70;
  const leagueWeight = 0.30;
  
  return {
    offRtg: prior.offRtg * teamWeight + LEAGUE_AVG_2024_25.offRtg * leagueWeight,
    defRtg: prior.defRtg * teamWeight + LEAGUE_AVG_2024_25.defRtg * leagueWeight,
    netRtg: prior.netRtg * teamWeight + LEAGUE_AVG_2024_25.netRtg * leagueWeight,
    pace: prior.pace * teamWeight + LEAGUE_AVG_2024_25.pace * leagueWeight,
    efg: prior.efg * teamWeight + LEAGUE_AVG_2024_25.efg * leagueWeight,
    ts: prior.ts * teamWeight + LEAGUE_AVG_2024_25.ts * leagueWeight,
    tovPct: prior.tovPct * teamWeight + LEAGUE_AVG_2024_25.tovPct * leagueWeight,
    orbPct: prior.orbPct * teamWeight + LEAGUE_AVG_2024_25.orbPct * leagueWeight,
    ftRate: prior.ftRate * teamWeight + LEAGUE_AVG_2024_25.ftRate * leagueWeight
  };
}
