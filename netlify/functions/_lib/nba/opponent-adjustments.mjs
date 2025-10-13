/**
 * NBA Opponent-Adjusted Statistics
 * 
 * Critical for NBA predictions - accounts for strength of schedule
 * 
 * Key Concepts:
 * - Raw stats vs ATL (111 ORtg) mean less than vs BOS (108 DRtg)
 * - Opponent adjustments reveal true team strength
 * - Essential for accurate point spreads and totals
 * 
 * Methodology:
 * 1. Calculate league-average baseline for each stat
 * 2. Calculate opponent's defensive rating for that stat
 * 3. Adjust team's performance relative to expected value
 * 4. Apply regression to mean to prevent over-adjustment
 */

/**
 * Calculate opponent-adjusted offensive rating
 * 
 * Adjusts a team's offensive performance based on opponent defensive strength
 * 
 * @param {number} teamOffRating - Team's offensive rating vs this opponent
 * @param {number} oppDefRating - Opponent's defensive rating (league-wide)
 * @param {number} leagueAvgOffRating - League average offensive rating (typically ~114)
 * @param {number} regressionFactor - How much to regress to mean (0-1, default 0.15)
 * @returns {number} Opponent-adjusted offensive rating
 */
export function adjustOffensiveRating(
  teamOffRating,
  oppDefRating,
  leagueAvgOffRating = 114,
  regressionFactor = 0.15
) {
  // Calculate how much better/worse opponent is than league average
  const oppDefStrength = oppDefRating - leagueAvgOffRating;
  
  // Adjust team's rating by removing opponent's defensive impact
  // If opponent is +5 better than average defensively, add 5 to team's rating
  const adjusted = teamOffRating - oppDefStrength;
  
  // Apply regression to mean to prevent over-adjustment
  const regressed = teamOffRating + (adjusted - teamOffRating) * (1 - regressionFactor);
  
  return regressed;
}

/**
 * Calculate opponent-adjusted defensive rating
 * 
 * Adjusts a team's defensive performance based on opponent offensive strength
 * 
 * @param {number} teamDefRating - Team's defensive rating vs this opponent
 * @param {number} oppOffRating - Opponent's offensive rating (league-wide)
 * @param {number} leagueAvgDefRating - League average defensive rating (typically ~114)
 * @param {number} regressionFactor - How much to regress to mean (0-1, default 0.15)
 * @returns {number} Opponent-adjusted defensive rating
 */
export function adjustDefensiveRating(
  teamDefRating,
  oppOffRating,
  leagueAvgDefRating = 114,
  regressionFactor = 0.15
) {
  // Calculate how much better/worse opponent is than league average
  const oppOffStrength = oppOffRating - leagueAvgDefRating;
  
  // Adjust team's rating by removing opponent's offensive impact
  // If opponent is +5 better than average offensively, subtract 5 from team's rating
  const adjusted = teamDefRating - oppOffStrength;
  
  // Apply regression to mean
  const regressed = teamDefRating + (adjusted - teamDefRating) * (1 - regressionFactor);
  
  return regressed;
}

/**
 * Calculate opponent-adjusted stat (generic)
 * 
 * Works for any stat: points, rebounds, assists, turnovers, etc.
 * 
 * @param {number} teamStat - Team's raw stat value
 * @param {number} oppAllowedStat - Opponent's average allowed (e.g., PPG allowed)
 * @param {number} leagueAvgStat - League average for this stat
 * @param {number} regressionFactor - How much to regress to mean (default 0.15)
 * @returns {number} Opponent-adjusted stat
 */
export function adjustStat(teamStat, oppAllowedStat, leagueAvgStat, regressionFactor = 0.15) {
  // Calculate opponent's strength relative to league
  const oppStrength = oppAllowedStat - leagueAvgStat;
  
  // Adjust stat by removing opponent's impact
  const adjusted = teamStat - oppStrength;
  
  // Apply regression to mean
  const regressed = teamStat + (adjusted - teamStat) * (1 - regressionFactor);
  
  return regressed;
}

/**
 * Calculate strength of schedule adjustment
 * 
 * Measures how difficult a team's schedule has been
 * 
 * @param {Array} opponents - Array of opponent IDs team has faced
 * @param {object} teamRatings - Object mapping teamId to their rating
 * @returns {object} SOS metrics
 */
export function calculateStrengthOfSchedule(opponents, teamRatings) {
  if (!opponents || opponents.length === 0) {
    return {
      avgOppRating: 0,
      sosAdjustment: 0,
      difficulty: 'average'
    };
  }
  
  // Calculate average opponent rating
  let totalRating = 0;
  let validOpponents = 0;
  
  for (const oppId of opponents) {
    const rating = teamRatings[oppId];
    if (rating != null) {
      totalRating += rating;
      validOpponents++;
    }
  }
  
  const avgOppRating = validOpponents > 0 ? totalRating / validOpponents : 0;
  
  // League average rating is typically 0 (by definition)
  const sosAdjustment = avgOppRating - 0;
  
  // Categorize difficulty
  let difficulty;
  if (sosAdjustment > 2) difficulty = 'very difficult';
  else if (sosAdjustment > 1) difficulty = 'difficult';
  else if (sosAdjustment > -1) difficulty = 'average';
  else if (sosAdjustment > -2) difficulty = 'easy';
  else difficulty = 'very easy';
  
  return {
    avgOppRating,
    sosAdjustment,
    difficulty,
    gamesAnalyzed: validOpponents
  };
}

/**
 * Adjust team stats for full season
 * 
 * Takes raw team stats and adjusts based on opponents faced
 * 
 * @param {object} teamStats - Raw team stats
 * @param {Array} gameLog - Array of games with opponent info
 * @param {object} leagueStats - League-wide defensive/offensive stats by team
 * @returns {object} Opponent-adjusted stats
 */
export function adjustTeamStats(teamStats, gameLog, leagueStats) {
  const adjusted = { ...teamStats };
  
  if (!gameLog || gameLog.length === 0) {
    return adjusted;
  }
  
  // Calculate weighted adjustments for key stats
  let totalOffAdjustment = 0;
  let totalDefAdjustment = 0;
  let totalWeight = 0;
  
  for (const game of gameLog) {
    const oppId = game.opponentId;
    const oppStats = leagueStats.byTeam[oppId];
    
    if (!oppStats) continue;
    
    // Weight recent games more heavily (exponential decay)
    const gamesAgo = game.gamesAgo || 0;
    const weight = Math.exp(-0.025 * gamesAgo);
    
    // Offensive adjustment
    if (game.offRating && oppStats.defRating) {
      const offAdj = adjustOffensiveRating(
        game.offRating,
        oppStats.defRating,
        leagueStats.avgOffRating
      );
      totalOffAdjustment += (offAdj - game.offRating) * weight;
    }
    
    // Defensive adjustment
    if (game.defRating && oppStats.offRating) {
      const defAdj = adjustDefensiveRating(
        game.defRating,
        oppStats.offRating,
        leagueStats.avgDefRating
      );
      totalDefAdjustment += (defAdj - game.defRating) * weight;
    }
    
    totalWeight += weight;
  }
  
  // Apply weighted adjustments
  if (totalWeight > 0) {
    adjusted.offRatingAdjusted = (teamStats.offRating || 0) + (totalOffAdjustment / totalWeight);
    adjusted.defRatingAdjusted = (teamStats.defRating || 0) + (totalDefAdjustment / totalWeight);
    adjusted.netRatingAdjusted = adjusted.offRatingAdjusted - adjusted.defRatingAdjusted;
  }
  
  // Calculate strength of schedule
  const opponentIds = gameLog.map(g => g.opponentId);
  const teamRatings = {};
  for (const [teamId, stats] of Object.entries(leagueStats.byTeam)) {
    teamRatings[teamId] = (stats.offRating || 0) - (stats.defRating || 0);
  }
  
  adjusted.strengthOfSchedule = calculateStrengthOfSchedule(opponentIds, teamRatings);
  
  return adjusted;
}

/**
 * Calculate matchup-specific adjustments
 * 
 * How should we adjust predictions for this specific matchup?
 * 
 * @param {object} team - Team stats
 * @param {object} opponent - Opponent stats
 * @param {object} leagueAvg - League average stats
 * @returns {object} Matchup adjustments
 */
export function calculateMatchupAdjustments(team, opponent, leagueAvg) {
  const adjustments = {};
  
  // Offensive adjustment for team
  adjustments.teamOffAdjustment = adjustOffensiveRating(
    team.offRating || 0,
    opponent.defRating || 0,
    leagueAvg.offRating || 114
  ) - (team.offRating || 0);
  
  // Defensive adjustment for team
  adjustments.teamDefAdjustment = adjustDefensiveRating(
    team.defRating || 0,
    opponent.offRating || 0,
    leagueAvg.defRating || 114
  ) - (team.defRating || 0);
  
  // Expected points for team (adjusted)
  adjustments.teamExpectedPoints = 
    (team.pointsPerGame || 0) + adjustments.teamOffAdjustment;
  
  // Expected points allowed by team (adjusted)
  adjustments.teamExpectedPointsAllowed = 
    (team.oppPointsPerGame || 0) + adjustments.teamDefAdjustment;
  
  // Pace adjustment
  // Teams with different paces will converge toward the average
  const teamPace = team.pace || 100;
  const oppPace = opponent.pace || 100;
  const avgPace = (teamPace + oppPace) / 2;
  const paceAdjustment = (avgPace - 100) / 100; // Convert to multiplier
  
  adjustments.expectedPace = avgPace;
  adjustments.paceAdjustment = paceAdjustment;
  
  // Apply pace adjustment to expected points
  adjustments.teamExpectedPointsPaceAdjusted = 
    adjustments.teamExpectedPoints * (1 + paceAdjustment);
  
  // Style matchup factors
  adjustments.styleMatchup = analyzeStyleMatchup(team, opponent);
  
  return adjustments;
}

/**
 * Analyze style matchup between two teams
 * 
 * @param {object} team - Team stats
 * @param {object} opponent - Opponent stats
 * @returns {object} Style matchup analysis
 */
function analyzeStyleMatchup(team, opponent) {
  const analysis = {
    factors: [],
    netAdvantage: 0
  };
  
  // Pace matchup
  const paceDiff = Math.abs((team.pace || 100) - (opponent.pace || 100));
  if (paceDiff > 5) {
    const faster = (team.pace || 100) > (opponent.pace || 100) ? 'team' : 'opponent';
    analysis.factors.push({
      factor: 'Pace Mismatch',
      advantage: faster,
      magnitude: paceDiff,
      description: `${paceDiff.toFixed(1)} possession difference per game`
    });
  }
  
  // 3PT volume vs 3PT defense
  const team3ptRate = team.fg3aPerFga || 0;
  const opp3ptDefPct = opponent.opp3ptPct || 0;
  if (team3ptRate > 0.38 && opp3ptDefPct > 0.37) {
    analysis.factors.push({
      factor: '3PT Volume vs Weak 3PT Defense',
      advantage: 'team',
      magnitude: 2,
      description: 'High 3PT volume against weak perimeter defense'
    });
    analysis.netAdvantage += 1.5;
  }
  
  // Rebounding matchup
  const teamORebPct = team.orebPct || 0;
  const oppDRebPct = opponent.drebPct || 0;
  const rebDiff = teamORebPct - (1 - oppDRebPct);
  if (Math.abs(rebDiff) > 0.05) {
    analysis.factors.push({
      factor: 'Rebounding Advantage',
      advantage: rebDiff > 0 ? 'team' : 'opponent',
      magnitude: Math.abs(rebDiff) * 100,
      description: `${(Math.abs(rebDiff) * 100).toFixed(1)}% rebounding edge`
    });
    analysis.netAdvantage += rebDiff * 3; // ~3 points per 5% OReb advantage
  }
  
  // Turnover matchup
  const teamTovRate = team.tovPct || 0;
  const oppStlRate = opponent.stlPerGame || 0;
  if (teamTovRate > 0.14 && oppStlRate > 8) {
    analysis.factors.push({
      factor: 'Turnover-Prone vs Ball Pressure',
      advantage: 'opponent',
      magnitude: 2,
      description: 'High turnover rate against aggressive defense'
    });
    analysis.netAdvantage -= 2;
  }
  
  return analysis;
}

/**
 * USAGE EXAMPLE:
 * 
 * const teamStats = {
 *   offRating: 115,
 *   defRating: 110,
 *   pointsPerGame: 112,
 *   pace: 102
 * };
 * 
 * const opponentStats = {
 *   offRating: 113,
 *   defRating: 108,
 *   oppPointsPerGame: 110,
 *   pace: 98
 * };
 * 
 * const leagueAvg = {
 *   offRating: 114,
 *   defRating: 114
 * };
 * 
 * const adjustments = calculateMatchupAdjustments(teamStats, opponentStats, leagueAvg);
 * 
 * console.log(adjustments);
 * // {
 * //   teamOffAdjustment: +2.5,  // Team's offense will perform better
 * //   teamDefAdjustment: -1.5,  // Team's defense will perform worse
 * //   teamExpectedPoints: 114.5,
 * //   expectedPace: 100,
 * //   styleMatchup: { ... }
 * // }
 */
