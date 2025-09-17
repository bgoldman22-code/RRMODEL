// netlify/functions/_lib/matchups.js
// Opponent-specific matchup calculations for enhanced predictions

/**
 * Calculate cross-matchup terms between team offense and opponent defense
 * Uses existing data fields with fallback logic for missing defensive stats
 */
export function calculateMatchups(homeMetrics, awayMetrics, league = {}) {
  // Safe accessor with fallbacks
  const getMetric = (team, path, fallback = 0) => {
    return path.split('.').reduce((obj, key) => obj?.[key], team) ?? fallback;
  };

  // League averages for defensive proxies (if not available in your data)
  const leagueAvg = {
    def_epa: league.means?.def_epa || 0,
    rz_td_def: league.means?.rz_td_def || 0.5,
    explosive_def: league.means?.explosive_def || 0.1
  };

  // Home team offense vs Away team defense
  const homeMatchups = {
    pass: getMetric(homeMetrics, 'core.pass_epa') - getMetric(awayMetrics, 'core.def_epa', leagueAvg.def_epa),
    rush: getMetric(homeMetrics, 'core.rush_epa') - getMetric(awayMetrics, 'core.def_epa', leagueAvg.def_epa),
    rz: getMetric(homeMetrics, 'situational.rz_td_off') - (1 - getMetric(awayMetrics, 'situational.rz_td_off', leagueAvg.rz_td_def)),
    expl: getMetric(homeMetrics, 'situational.explosive_off') - leagueAvg.explosive_def
  };

  // Away team offense vs Home team defense  
  const awayMatchups = {
    pass: getMetric(awayMetrics, 'core.pass_epa') - getMetric(homeMetrics, 'core.def_epa', leagueAvg.def_epa),
    rush: getMetric(awayMetrics, 'core.rush_epa') - getMetric(homeMetrics, 'core.def_epa', leagueAvg.def_epa),
    rz: getMetric(awayMetrics, 'situational.rz_td_off') - (1 - getMetric(homeMetrics, 'situational.rz_td_off', leagueAvg.rz_td_def)),
    expl: getMetric(awayMetrics, 'situational.explosive_off') - leagueAvg.explosive_def
  };

  return {
    home: homeMatchups,
    away: awayMatchups,
    summary: {
      home_total_advantage: Object.values(homeMatchups).reduce((sum, val) => sum + val, 0),
      away_total_advantage: Object.values(awayMatchups).reduce((sum, val) => sum + val, 0)
    }
  };
}

/**
 * Calculate expected plays for total predictions
 * Accounts for team pace and game script based on spread
 */
export function calculateExpectedPlays(homeTempo, awayTempo, marketSpread = 0) {
  const homePace = Math.max(homeTempo?.pace || 65, 58);
  const awayPace = Math.max(awayTempo?.pace || 65, 58);
  
  let basePlays = (homePace + awayPace) / 2;
  
  // Game script adjustment: large favorites tend to run more clock late
  const spreadAdjustment = Math.abs(marketSpread) > 10 ? -1.5 : 
                          Math.abs(marketSpread) > 7 ? -0.5 : 0;
  
  basePlays += spreadAdjustment;
  
  // Keep within reasonable bounds
  return Math.max(Math.min(basePlays, 70), 58);
}

/**
 * Matchup weights - conservative starting values
 * Total impact: ~10% of model (can increase if backtesting shows improvement)
 */
export const MATCHUP_WEIGHTS = {
  rz: 0.03,     // Red zone matchups most predictive
  pass: 0.025,  // Passing game matchups
  rush: 0.025,  // Rushing game matchups  
  expl: 0.02    // Explosive play matchups
  // Total: 0.10 (10% of model)
};

/**
 * Calculate total matchup score for a team
 */
export function calculateMatchupScore(matchupTerms, weights = MATCHUP_WEIGHTS) {
  if (!matchupTerms) return 0;
  
  return (
    (matchupTerms.rz || 0) * weights.rz +
    (matchupTerms.pass || 0) * weights.pass +
    (matchupTerms.rush || 0) * weights.rush +
    (matchupTerms.expl || 0) * weights.expl
  );
}
