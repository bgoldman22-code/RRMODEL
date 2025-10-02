// netlify/functions/_lib/nhl-projection-v3-learned.mjs
// ELITE v3.0: Projections with LEARNED parameters from historical data
// PRODUCTION: Hard-wired injury/lineup factors

import {
  fetchPlayerHistoricalGames,
  fitZINBFromHistory,
  shrinkToPositionPrior
} from './nhl-historical-data-pipeline.mjs';

import {
  fetchPlayerGameLog,
  fetchPlayerStats,
  fetchTeamStats,
  calculateRestDays
} from './nhl-data-fetch.mjs';

import { RINK_EFFECTS } from './nhl-advanced-projection-v2.mjs';

/**
 * v3.0 MASTER PROJECTION: Uses LEARNED ZINB priors, not hardcoded
 * 
 * ELITE PRODUCTION UPGRADE:
 * - REQUIRES injuryLineupFactors parameter
 * - Applies TOI/PP/usage multipliers directly to projection
 * - Force zero projection for scratched players
 * - Confidence haircut for uncertain lineup status
 */
export async function projectPlayerSOGv3(playerId, opponentTeamAbbrev, gameContext, injuryLineupFactors = null) {
  const {
    isHome,
    venue,
    gameDate,
    teamPenaltyDraw = 3.2,
    teamPenaltyTake = 3.2,
    expectedGameScript = null,
    travelDistance = 0
  } = gameContext;
  
  // ELITE CHECK: Require injury/lineup context
  if (!injuryLineupFactors) {
    console.warn(`⚠️ projectPlayerSOGv3 called without injuryLineupFactors for player ${playerId}`);
    console.warn(`⚠️ Using default safe values - projection accuracy may be reduced`);
  }
  
  // Extract injury/lineup factors with safe defaults
  const {
    toiMultiplier = 1.0,
    ppMultiplier = 1.0,
    usageMultiplier = 1.0,
    scratchRisk = 0.05,
    roleVolatility = 0.15,
    lineChangeRisk = 0.10,
    confirmedScratch = false,
    injuryStatus = 'healthy',
    linePosition = null,
    ppUnit = null
  } = injuryLineupFactors || {};
  
  // CRITICAL: Force zero projection for confirmed scratches
  if (confirmedScratch || scratchRisk >= 0.95) {
    console.log(`🚫 Player ${playerId} is scratched/inactive - forcing zero projection`);
    return {
      projection: 0.0,
      variance: 0.0,
      confidence: 0.0,
      scratchRisk: 1.0,
      ev: null, // Auto-PASS in scanner
      recommendation: 'AVOID - Player scratched'
    };
  }
  
  // 1. Fetch current season data
  const [playerStats, gameLog, opponentStats] = await Promise.all([
    fetchPlayerStats(playerId),
    fetchPlayerGameLog(playerId, '20252026', 10),
    fetchTeamStats(opponentTeamAbbrev, '20252026')
  ]);
  
  if (!playerStats || !gameLog || gameLog.length === 0) {
    return null;
  }
  
  // 2. ELITE UPGRADE: Fetch 3-season historical data
  const historicalGames = await fetchPlayerHistoricalGames(playerId, [
    '20222023',
    '20232024',
    '20242025'
  ]);
  
  // 3. FIT ZINB PRIORS FROM HISTORICAL DATA (not hardcoded!)
  const empiricalParams = fitZINBFromHistory(historicalGames, playerStats.position);
  
  // 4. Hierarchical shrinkage (blend with position prior)
  const priorParams = shrinkToPositionPrior(
    empiricalParams,
    playerStats.position,
    historicalGames.length,
    0.2 // 20% shrinkage
  );
  
  // 5. Recent form adjustment (last 10 games)
  const recentForm = calculateRecentForm(gameLog);
  
  // 6. Blend historical prior with recent form
  // 60% historical prior, 40% recent form
  let mu = (priorParams.mu * 0.60) + (recentForm.avgSOG * 0.40);
  let r = priorParams.r; // Variance stays from prior
  let pi = priorParams.pi; // Zero-inflation from prior
  
  // 7. Apply contextual adjustments (same as v2.0)
  const restDays = calculateRestDays(gameDate, gameLog[0]?.gameDate);
  
  // Opponent adjustment
  const opponentFactor = calculateOpponentAdjustment(opponentStats);
  mu *= opponentFactor;
  
  // Home/road
  const locationFactor = isHome ? 1.015 : 0.985;
  mu *= locationFactor;
  
  // Rink effect
  const rinkFactor = RINK_EFFECTS[venue] || 1.0;
  mu *= rinkFactor;
  
  // Fatigue
  const fatigueFactor = calculateFatigueFactor(restDays, travelDistance);
  mu *= fatigueFactor;
  
  // Score effects
  if (expectedGameScript) {
    const scoreEffect = calculateScoreEffect(expectedGameScript);
    mu *= scoreEffect;
  }
  
  // Matchup penalty
  const matchupPenalty = calculateMatchupPenalty(opponentStats);
  mu *= matchupPenalty;
  
  // 8. ELITE: Apply injury/lineup multipliers to expected usage
  mu *= toiMultiplier;
  mu *= usageMultiplier;
  
  // Apply PP adjustment if player is on power play unit
  if (ppUnit !== null) {
    mu *= ppMultiplier;
  }
  
  // 9. Update scratch risk based on recent activity vs. injury data
  const recentScratchRisk = calculateScratchRisk(gameLog);
  const finalScratchRisk = Math.max(scratchRisk, recentScratchRisk); // Use max of injury data or recent pattern
  pi = Math.max(pi, finalScratchRisk);
  
  // 10. Confidence haircut for lineup uncertainty
  let confidenceMultiplier = 1.0;
  if (roleVolatility > 0.30) confidenceMultiplier *= 0.90; // High role volatility
  if (lineChangeRisk > 0.25) confidenceMultiplier *= 0.92; // Recent line demotion risk
  if (injuryStatus !== 'healthy' && injuryStatus !== null) confidenceMultiplier *= 0.85; // Injury concern
  
  // 11. Return learned projection with injury integration
  return {
    playerId,
    playerName: playerStats.fullName,
    team: playerStats.teamAbbrev,
    position: playerStats.position,
    opponent: opponentTeamAbbrev,
    
    // LEARNED ZINB parameters (not hardcoded!)
    params: {
      mu: Math.max(0, mu),
      r: r,
      pi: Math.min(0.5, pi)
    },
    
    // ELITE: Injury/lineup integration metadata
    injuryFactors: {
      toiMultiplier,
      ppMultiplier,
      usageMultiplier,
      scratchRisk: finalScratchRisk,
      roleVolatility,
      lineChangeRisk,
      confirmedScratch,
      injuryStatus,
      linePosition,
      ppUnit
    },
    
    // Metadata
    metadata: {
      priorSource: 'LEARNED', // vs 'HARDCODED' in v2.0
      historicalGames: historicalGames.length,
      empiricalMu: empiricalParams.mu,
      shrunkMu: priorParams.mu,
      recentFormMu: recentForm.avgSOG,
      scratchRisk: finalScratchRisk,
      restDays,
      venue,
      rinkEffect: rinkFactor,
      
      // Model confidence (with lineup uncertainty haircut)
      confidence: calculateModelConfidence(
        historicalGames.length,
        gameLog.length,
        finalScratchRisk
      ) * confidenceMultiplier
    },
    
    // Supporting data
    seasonStats: {
      gamesPlayed: playerStats.seasonStats.gamesPlayed,
      totalShots: playerStats.seasonStats.shots,
      avgSOG: playerStats.seasonStats.shotsPerGame
    },
    
    recentForm: {
      last10Avg: recentForm.avgSOG,
      last10Games: gameLog.map(g => ({
        date: g.gameDate,
        opponent: g.opponentAbbrev,
        shots: g.shots,
        toi: g.toi
      }))
    }
  };
}

/**
 * Calculate recent form (weighted average of last N games)
 */
function calculateRecentForm(gameLog, numGames = 10) {
  if (gameLog.length === 0) return { avgSOG: 0, variance: 0 };
  
  const recentGames = gameLog.slice(0, Math.min(numGames, gameLog.length));
  
  // Exponential weighting (most recent weighted heaviest)
  const weights = Array.from({ length: recentGames.length }, (_, i) => 
    Math.exp(-i * 0.2) // Decay factor
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  
  let weightedSOG = 0;
  for (let i = 0; i < recentGames.length; i++) {
    weightedSOG += recentGames[i].shots * (weights[i] / totalWeight);
  }
  
  // Calculate variance
  const avgSOG = recentGames.reduce((sum, g) => sum + g.shots, 0) / recentGames.length;
  const variance = recentGames.reduce((sum, g) => 
    sum + Math.pow(g.shots - avgSOG, 2), 0
  ) / recentGames.length;
  
  return { avgSOG: weightedSOG, variance };
}

/**
 * Opponent adjustment (same as v2.0)
 */
function calculateOpponentAdjustment(opponentStats) {
  if (!opponentStats || !opponentStats.shotsAgainstPerGame) return 1.0;
  
  const leagueAvg = 30.5;
  const oppSOG = opponentStats.shotsAgainstPerGame;
  
  const factor = oppSOG / leagueAvg;
  return Math.max(0.85, Math.min(1.15, factor));
}

/**
 * Fatigue factor (same as v2.0)
 */
function calculateFatigueFactor(restDays, travelDistance = 0) {
  let fatigue = 1.0;
  
  if (restDays === 0) fatigue *= 0.93;
  else if (restDays === 1) fatigue *= 0.97;
  else if (restDays >= 3) fatigue *= 1.02;
  
  if (travelDistance > 2000) fatigue *= 0.97;
  
  return fatigue;
}

/**
 * Score effects (same as v2.0)
 */
function calculateScoreEffect(expectedGameScript) {
  const { leadingProb, trailingProb } = expectedGameScript;
  const effect = 1.0 + (trailingProb * 0.05) - (leadingProb * 0.03);
  return Math.max(0.92, Math.min(1.08, effect));
}

/**
 * Matchup penalty (same as v2.0)
 */
function calculateMatchupPenalty(opponentStats) {
  const oppBlockRate = opponentStats?.blockedShotsPerGame || 15;
  const leagueAvg = 15.5;
  const penalty = 1.0 - ((oppBlockRate - leagueAvg) / 100);
  return Math.max(0.92, Math.min(1.08, penalty));
}

/**
 * Scratch risk (same as v2.0)
 */
function calculateScratchRisk(gameLog) {
  const recentGames = gameLog.slice(0, 5);
  const scratches = recentGames.filter(g => g.toiSeconds === 0).length;
  
  if (scratches > 2) return 0.25;
  if (scratches > 0) return 0.10;
  
  const toiTrend = calculateToiTrend(gameLog);
  if (toiTrend < -20) return 0.15;
  
  return 0.02;
}

/**
 * TOI trend
 */
function calculateToiTrend(gameLog) {
  if (gameLog.length < 5) return 0;
  
  const last3 = gameLog.slice(0, 3);
  const avgRecent = last3.reduce((sum, g) => sum + g.toiSeconds, 0) / 3;
  const seasonAvg = gameLog.reduce((sum, g) => sum + g.toiSeconds, 0) / gameLog.length;
  
  return ((avgRecent - seasonAvg) / seasonAvg) * 100;
}

/**
 * Model confidence score (0-100)
 * Higher confidence = more historical data + recent games + low scratch risk
 */
function calculateModelConfidence(historicalGames, recentGames, scratchRisk) {
  // Historical sample size (0-40 points)
  const historicalScore = Math.min(historicalGames / 5, 40); // 200 games = max 40
  
  // Recent sample size (0-30 points)
  const recentScore = Math.min(recentGames * 3, 30); // 10 games = max 30
  
  // Scratch risk penalty (0-30 points)
  const scratchScore = (1 - scratchRisk) * 30; // Low risk = high score
  
  const totalScore = historicalScore + recentScore + scratchScore;
  
  return Math.round(Math.min(100, totalScore));
}

export default {
  projectPlayerSOGv3
};
