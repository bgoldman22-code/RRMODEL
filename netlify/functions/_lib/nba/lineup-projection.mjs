/**
 * NBA Lineup Projection System
 * 
 * Minutes projection model for injury impact analysis
 * Critical for accurate predictions when stars are injured/resting
 * 
 * Features:
 * - Minutes projection from recent games (L10)
 * - Starter identification (>20 MPG)
 * - Usage rate adjustments on absences
 * - Pace/shot share deltas
 * - Confidence dampening for uncertain lineups
 */

/**
 * Calculate projected minutes for each player
 * Based on recent games with exponential decay
 * 
 * @param {Array<object>} recentGames - Last 10 games with player stats
 * @param {number} targetDate - Game date timestamp
 * @returns {object} Projected minutes by player
 */
export function projectMinutes(recentGames, targetDate = Date.now()) {
  const playerMinutes = {};
  const decayRate = 0.1; // Weight recent games more
  
  // Sort games by date descending (most recent first)
  const sortedGames = recentGames
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10); // Last 10 games
  
  // Calculate weighted average minutes
  for (let i = 0; i < sortedGames.length; i++) {
    const game = sortedGames[i];
    const weight = Math.exp(-decayRate * i); // Exponential decay
    
    if (!game.players) continue;
    
    for (const player of game.players) {
      if (!playerMinutes[player.id]) {
        playerMinutes[player.id] = {
          name: player.name,
          position: player.position,
          totalWeightedMinutes: 0,
          totalWeight: 0,
          gamesPlayed: 0,
          lastPlayed: null
        };
      }
      
      playerMinutes[player.id].totalWeightedMinutes += player.minutes * weight;
      playerMinutes[player.id].totalWeight += weight;
      playerMinutes[player.id].gamesPlayed += 1;
      
      if (!playerMinutes[player.id].lastPlayed || new Date(game.date) > new Date(playerMinutes[player.id].lastPlayed)) {
        playerMinutes[player.id].lastPlayed = game.date;
      }
    }
  }
  
  // Calculate projected minutes
  const projections = {};
  
  for (const [playerId, data] of Object.entries(playerMinutes)) {
    const projectedMinutes = data.totalWeight > 0 
      ? data.totalWeightedMinutes / data.totalWeight 
      : 0;
    
    // Adjust for sample size (reduce confidence if few games)
    const sampleSizeFactor = Math.min(data.gamesPlayed / 5, 1); // Need 5 games for full confidence
    
    // Days since last played
    const daysSinceLastPlayed = data.lastPlayed 
      ? (targetDate - new Date(data.lastPlayed)) / (1000 * 60 * 60 * 24)
      : 999;
    
    // Reduce confidence if haven't played recently
    const recencyFactor = daysSinceLastPlayed <= 7 ? 1 : Math.exp(-0.1 * (daysSinceLastPlayed - 7));
    
    projections[playerId] = {
      ...data,
      projectedMinutes: projectedMinutes * sampleSizeFactor * recencyFactor,
      confidence: sampleSizeFactor * recencyFactor,
      isStarter: projectedMinutes >= 20, // Starters typically play 20+ min
      daysSinceLastPlayed
    };
  }
  
  return projections;
}

/**
 * Identify starting lineup based on projected minutes
 * 
 * @param {object} projections - Minutes projections by player
 * @param {number} minStarters - Minimum starters to return (default: 5)
 * @returns {Array<object>} Starting lineup
 */
export function identifyStarters(projections, minStarters = 5) {
  const sorted = Object.entries(projections)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.projectedMinutes - a.projectedMinutes);
  
  // Take top 5 by minutes, or more if tied at 20+ MPG
  const starters = sorted.filter((p, i) => 
    i < minStarters || p.projectedMinutes >= 20
  );
  
  return starters;
}

/**
 * Calculate usage rate adjustments when a player is absent
 * 
 * @param {object} projections - Minutes projections
 * @param {Array<string>} absentPlayerIds - IDs of absent players
 * @param {object} historicalUsage - Historical usage rates by player
 * @returns {object} Adjusted projections and usage
 */
export function adjustForAbsences(projections, absentPlayerIds, historicalUsage = {}) {
  const adjustedProjections = { ...projections };
  
  // Calculate minutes to redistribute
  let redistributedMinutes = 0;
  for (const playerId of absentPlayerIds) {
    if (projections[playerId]) {
      redistributedMinutes += projections[playerId].projectedMinutes;
      delete adjustedProjections[playerId];
    }
  }
  
  if (redistributedMinutes === 0) {
    return {
      projections: adjustedProjections,
      usageAdjustments: {},
      paceAdjustment: 0,
      shotShareAdjustment: 0
    };
  }
  
  // Get remaining players sorted by current minutes
  const remainingPlayers = Object.entries(adjustedProjections)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.projectedMinutes - a.projectedMinutes);
  
  // Redistribute minutes proportionally to bench players
  // Starters get less boost, bench gets more
  const usageAdjustments = {};
  let totalCurrentMinutes = remainingPlayers.reduce((sum, p) => sum + p.projectedMinutes, 0);
  
  for (const player of remainingPlayers) {
    // Bench players (< 20 MPG) get more of the redistribution
    const benchBoost = player.projectedMinutes < 20 ? 1.5 : 1.0;
    const share = (player.projectedMinutes / totalCurrentMinutes) * benchBoost;
    
    const minutesBoost = redistributedMinutes * share;
    adjustedProjections[player.id].projectedMinutes += minutesBoost;
    
    // Calculate usage rate adjustment
    const oldUsage = historicalUsage[player.id] || 0.20; // League average ~20%
    const minutesIncrease = minutesBoost / player.projectedMinutes;
    const usageIncrease = minutesIncrease * 0.7; // Usage increases less than minutes
    
    usageAdjustments[player.id] = {
      oldMinutes: player.projectedMinutes,
      newMinutes: adjustedProjections[player.id].projectedMinutes,
      oldUsage,
      newUsage: oldUsage * (1 + usageIncrease),
      minutesBoost,
      usageBoost: usageIncrease
    };
  }
  
  // Estimate team-level impacts
  // Losing a star typically slows pace slightly
  const absentMinutes = redistributedMinutes;
  const totalTeamMinutes = 240; // 48 min * 5 players
  const absentShare = absentMinutes / totalTeamMinutes;
  
  // Rough estimates (calibrate with historical data)
  const paceAdjustment = -absentShare * 2; // Pace drops ~2 possessions per 20% minutes lost
  const shotShareAdjustment = absentShare; // Shot distribution becomes more even
  
  return {
    projections: adjustedProjections,
    usageAdjustments,
    paceAdjustment,
    shotShareAdjustment,
    redistributedMinutes
  };
}

/**
 * Calculate confidence dampening based on lineup uncertainty
 * 
 * @param {object} projections - Minutes projections
 * @param {number} gameTime - Unix timestamp of game
 * @returns {number} Confidence multiplier (0-1)
 */
export function calculateLineupConfidence(projections, gameTime) {
  const now = Date.now();
  const hoursUntilGame = (gameTime - now) / (1000 * 60 * 60);
  
  // Full confidence within 90 minutes of game
  if (hoursUntilGame < 1.5) {
    return 1.0;
  }
  
  // Reduce confidence if far from game time
  const timeFactor = hoursUntilGame > 24 
    ? 0.85  // 24+ hours out
    : 0.90 + (0.10 * (24 - hoursUntilGame) / 24); // Linear interpolation
  
  // Check projection confidence (based on recent games played)
  const players = Object.values(projections);
  const avgConfidence = players.reduce((sum, p) => sum + p.confidence, 0) / players.length;
  
  // Combine time and data confidence
  return timeFactor * avgConfidence;
}

/**
 * Generate lineup impact report for display
 * 
 * @param {object} baselineProjections - Normal lineup projections
 * @param {object} adjustedProjections - Adjusted projections with absences
 * @param {Array<string>} absentPlayerIds - IDs of absent players
 * @returns {object} Lineup impact summary
 */
export function generateLineupImpactReport(baselineProjections, adjustedProjections, absentPlayerIds) {
  const report = {
    absences: [],
    beneficiaries: [],
    teamImpact: {
      paceChange: adjustedProjections.paceAdjustment || 0,
      shotDistributionChange: adjustedProjections.shotShareAdjustment || 0,
      totalMinutesRedistributed: adjustedProjections.redistributedMinutes || 0
    }
  };
  
  // Absent players
  for (const playerId of absentPlayerIds) {
    if (baselineProjections[playerId]) {
      report.absences.push({
        id: playerId,
        name: baselineProjections[playerId].name,
        position: baselineProjections[playerId].position,
        normalMinutes: baselineProjections[playerId].projectedMinutes,
        isStarter: baselineProjections[playerId].isStarter
      });
    }
  }
  
  // Top beneficiaries (biggest minute increases)
  if (adjustedProjections.usageAdjustments) {
    const beneficiaries = Object.entries(adjustedProjections.usageAdjustments)
      .map(([id, adj]) => ({
        id,
        name: adjustedProjections.projections[id]?.name,
        minutesIncrease: adj.minutesBoost,
        newMinutes: adj.newMinutes,
        usageIncrease: adj.usageBoost
      }))
      .sort((a, b) => b.minutesIncrease - a.minutesIncrease)
      .slice(0, 5);
    
    report.beneficiaries = beneficiaries;
  }
  
  return report;
}

/**
 * USAGE EXAMPLES:
 * 
 * // 1. Project minutes from recent games
 * const projections = projectMinutes(last10Games, gameTimestamp);
 * 
 * // 2. Identify starting lineup
 * const starters = identifyStarters(projections);
 * 
 * // 3. Adjust for injuries
 * const injured = ['player123', 'player456'];
 * const adjusted = adjustForAbsences(projections, injured, historicalUsage);
 * 
 * // 4. Calculate confidence
 * const confidence = calculateLineupConfidence(adjusted.projections, gameTimestamp);
 * 
 * // 5. Generate impact report
 * const report = generateLineupImpactReport(projections, adjusted, injured);
 * console.log(`Pace change: ${report.teamImpact.paceChange.toFixed(1)} possessions`);
 * console.log(`Top beneficiary: ${report.beneficiaries[0].name} (+${report.beneficiaries[0].minutesIncrease.toFixed(1)} min)`);
 */
