// netlify/functions/_lib/nhl-advanced-projection-v2.mjs
// ELITE UPGRADE: ZINB, state decomposition, rink effects, score effects

import {
  fetchPlayerGameLog,
  fetchPlayerStats,
  fetchTeamStats,
  calculateRestDays
} from './nhl-data-fetch.mjs';

/**
 * ELITE UPGRADE 1: ZERO-INFLATED NEGATIVE BINOMIAL (ZINB)
 * Better models reality: some players genuinely get 0 shots (healthy scratch, 4th line)
 */

/**
 * ZINB Probability Mass Function
 * @param {number} k - Number of shots (0, 1, 2, ...)
 * @param {number} pi - Zero-inflation parameter (0-1)
 * @param {number} mu - Mean shots (when not zero-inflated)
 * @param {number} r - Dispersion parameter (shape)
 */
function zinbPMF(k, pi, mu, r) {
  if (k === 0) {
    // P(X=0) = pi + (1-pi) * NB(0; mu, r)
    const nbZero = Math.pow(r / (r + mu), r);
    return pi + (1 - pi) * nbZero;
  } else {
    // P(X=k) = (1-pi) * NB(k; mu, r) for k > 0
    const p = r / (r + mu);
    const nbProb = (gamma(k + r) / (gamma(k + 1) * gamma(r))) *
                   Math.pow(p, r) * Math.pow(1 - p, k);
    return (1 - pi) * nbProb;
  }
}

/**
 * Gamma function (for NB combinations)
 */
function gamma(z) {
  if (z === 1) return 1;
  if (z === 0.5) return Math.sqrt(Math.PI);
  if (z < 1) return gamma(z + 1) / z;
  return (z - 1) * gamma(z - 1);
}

/**
 * ELITE UPGRADE 2: STATE DECOMPOSITION
 * SOG = SOG_5v5 + SOG_PP + SOG_SH
 */

/**
 * Project shots by game state
 * @param {Object} playerStats - Player season stats
 * @param {Array} gameLog - Recent game log
 * @param {Object} opponent - Opponent team stats
 * @param {Object} context - Game context (home/road, rest, etc.)
 */
export async function projectSOGByState(playerStats, gameLog, opponent, context) {
  const { position, seasonStats } = playerStats;
  
  // 5v5 projection
  const fiveVfive = await project5v5SOG(playerStats, gameLog, opponent, context);
  
  // Power Play projection
  const powerPlay = await projectPPSOG(playerStats, gameLog, opponent, context);
  
  // Shorthanded projection (mostly defensemen)
  const shortHanded = position === 'D' ? 
    await projectSHSOG(playerStats, gameLog, opponent, context) : 
    { mu: 0, r: 1, pi: 0.95 };
  
  // Combined distribution parameters
  const totalMu = fiveVfive.mu + powerPlay.mu + shortHanded.mu;
  
  // Weighted dispersion (higher variance states get more weight)
  const totalR = (
    (fiveVfive.mu * fiveVfive.r) + 
    (powerPlay.mu * powerPlay.r) + 
    (shortHanded.mu * shortHanded.r)
  ) / (totalMu || 1);
  
  // Zero-inflation (scratch risk + DNP risk)
  const scratchRisk = calculateScratchRisk(playerStats, gameLog);
  const totalPi = Math.min(0.3, scratchRisk); // Cap at 30% zero inflation
  
  return {
    total: {
      mu: totalMu,
      r: totalR,
      pi: totalPi
    },
    breakdown: {
      fiveVfive,
      powerPlay,
      shortHanded
    }
  };
}

/**
 * Project 5v5 SOG
 */
async function project5v5SOG(playerStats, gameLog, opponent, context) {
  const { seasonStats } = playerStats;
  
  // Base rate: Season 5v5 SOG/60
  const seasonSOG60 = seasonStats.shots / (seasonStats.gamesPlayed || 1) / 
                      ((seasonStats.avgToiSeconds || 900) / 3600);
  
  // Recent form (last 5 games 5v5 SOG/60)
  const recentSOG60 = calculateRecent5v5Rate(gameLog);
  
  // Weighted baseline
  let mu5v5 = (seasonSOG60 * 0.65) + (recentSOG60 * 0.35);
  
  // Expected TOI at 5v5 (total TOI - expected PP time)
  const expectedPPTime = estimatePPTime(playerStats, context.teamPenaltyDraw);
  const expected5v5TOI = ((seasonStats.avgToiSeconds || 900) - expectedPPTime) / 3600;
  
  // Convert rate to expected shots
  mu5v5 *= expected5v5TOI;
  
  // ELITE UPGRADE 3: RINK SCORER BIAS
  mu5v5 *= RINK_EFFECTS[context.venue] || 1.0;
  
  // ELITE UPGRADE 4: SCORE EFFECTS & PACE
  const scoreEffect = calculateScoreEffect(context.expectedGameScript);
  mu5v5 *= scoreEffect;
  
  // ELITE UPGRADE 5: LINE MATCHING
  const matchupPenalty = calculateMatchupPenalty(playerStats, opponent);
  mu5v5 *= matchupPenalty;
  
  // ELITE UPGRADE 6: FATIGUE
  const fatigueFactor = calculateFatigueFactor(context.restDays, context.travelDistance);
  mu5v5 *= fatigueFactor;
  
  // 🔥 DISPERSION RECALIBRATION: Lower r = wider variance = less edge inflation
  // Old: D=3.5, F=2.8 created tight distributions with inflated edges
  // New: D=2.5, F=2.0 creates realistic variance for better edge accuracy
  const r5v5 = position === 'D' ? 2.5 : 2.0; // D-men more consistent
  
  return { mu: Math.max(0, mu5v5), r: r5v5, pi: 0.02 }; // 2% zero-inflation at 5v5
}

/**
 * Project PP SOG
 */
async function projectPPSOG(playerStats, gameLog, opponent, context) {
  const { position, seasonStats } = playerStats;
  
  // PP unit assignment (PP1 vs PP2)
  const ppUnit = determinePPUnit(playerStats, gameLog);
  
  if (ppUnit === 'NONE') {
    return { mu: 0, r: 1, pi: 0.98 }; // Rarely sees PP time
  }
  
  // Base PP SOG rate
  const ppSOGRate = seasonStats.powerPlayPoints > 3 ? 
    (position === 'D' ? 0.4 : 0.6) : // PP1 gunners
    (position === 'D' ? 0.2 : 0.3);  // PP2 or non-shooters
  
  // Expected PP opportunities (team penalty draw rate × league avg PP/game)
  const expectedPPOpps = context.teamPenaltyDraw * 3.2; // ~3.2 PP/game league avg
  
  // PP time allocation
  const ppTimeShare = ppUnit === 'PP1' ? 0.65 : 0.35;
  const expectedPPTime = expectedPPOpps * 2 * ppTimeShare / 60; // 2 min per PP
  
  // PP SOG projection
  let muPP = ppSOGRate * expectedPPTime * 60; // Convert to per-60 basis
  
  // Opponent PP kill strength
  const oppPKStrength = opponent.penaltyKillPct || 0.80;
  muPP *= (1.1 - oppPKStrength * 0.5); // Strong PKs suppress shots
  
  // 🔥 DISPERSION RECALIBRATION: PP has high variance, lower r
  // Old: 1.8 was too tight, New: 1.5 for realistic variance
  const rPP = 1.5;
  
  return { mu: Math.max(0, muPP), r: rPP, pi: 0.05 };
}

/**
 * Project SH SOG (mostly zero for forwards)
 */
async function projectSHSOG(playerStats, gameLog, opponent, context) {
  // Only PK specialists get SH shots
  const isPKSpecialist = playerStats.seasonStats.shortHandedGoals > 0;
  
  if (!isPKSpecialist) {
    return { mu: 0, r: 1, pi: 0.98 };
  }
  
  // Minimal SH SOG (rush chances only)
  const muSH = 0.1 * context.teamPenaltyTake; // Team's PK opportunities
  
  return { mu: muSH, r: 1.5, pi: 0.15 };
}

/**
 * ELITE UPGRADE 3: RINK SCORER BIAS (RTSS tracking variance)
 */
export const RINK_EFFECTS = {
  // High-tracking arenas (generous SOG recording)
  'Bell Centre': 1.045,           // Montreal +4.5%
  'Canadian Tire Centre': 1.035,  // Ottawa +3.5%
  'Rogers Arena': 1.030,          // Vancouver +3%
  'Scotiabank Arena': 1.020,      // Toronto +2%
  'Enterprise Center': 1.025,     // St. Louis +2.5%
  
  // Low-tracking arenas (conservative SOG)
  'TD Garden': 0.985,             // Boston -1.5%
  'Madison Square Garden': 0.975, // NYR -2.5%
  'Prudential Center': 0.970,     // New Jersey -3%
  'Bridgestone Arena': 0.980,     // Nashville -2%
  'PNC Arena': 0.975,             // Carolina -2.5%
  
  // Neutral (league average)
  'default': 1.000
};

/**
 * ELITE UPGRADE 4: SCORE EFFECTS & PACE
 * Leading teams sit back (fewer shots), trailing teams press (more shots)
 */
function calculateScoreEffect(expectedGameScript) {
  // expectedGameScript: { leadingProb, trailingProb, tiedProb }
  // Simplified: if team expected to lead, slight penalty; if trail, slight boost
  
  if (!expectedGameScript) return 1.0;
  
  const { leadingProb, trailingProb } = expectedGameScript;
  
  // Leading reduces shot volume ~3%, trailing increases ~5%
  const scoreEffect = 1.0 + (trailingProb * 0.05) - (leadingProb * 0.03);
  
  return Math.max(0.92, Math.min(1.08, scoreEffect)); // Cap at ±8%
}

/**
 * ELITE UPGRADE 5: LINE MATCHING & OPPONENT QUALITY
 */
function calculateMatchupPenalty(playerStats, opponent) {
  // If player faces shutdown D-pairs, suppress SOG
  // Proxy: opponent's top-4 D quality (blocked shots, shot suppression)
  
  const oppBlockRate = opponent.blockedShotsPerGame || 15;
  const leagueAvgBlocks = 15.5;
  
  // High-blocking teams (Carolina, NJ) suppress shots
  const blockPenalty = 1.0 - ((oppBlockRate - leagueAvgBlocks) / 100);
  
  return Math.max(0.92, Math.min(1.08, blockPenalty));
}

/**
 * ELITE UPGRADE 6: FATIGUE & TRAVEL
 */
function calculateFatigueFactor(restDays, travelDistance = 0) {
  let fatigue = 1.0;
  
  // Back-to-back penalty (position-adjusted)
  if (restDays === 0) {
    fatigue *= 0.93; // -7% on B2B
  } else if (restDays === 1) {
    fatigue *= 0.97; // -3% on 1-day rest
  } else if (restDays >= 3) {
    fatigue *= 1.02; // +2% on fresh legs
  }
  
  // Travel distance penalty (cross-country flights)
  if (travelDistance > 2000) {
    fatigue *= 0.97; // -3% on long travel
  }
  
  return fatigue;
}

/**
 * Calculate scratch risk (for zero-inflation)
 */
function calculateScratchRisk(playerStats, gameLog) {
  // Recent healthy scratches
  const recentGames = gameLog.slice(0, 5);
  const scratches = recentGames.filter(g => g.toiSeconds === 0).length;
  
  if (scratches > 2) return 0.25; // 25% scratch risk
  if (scratches > 0) return 0.10; // 10% scratch risk
  
  // TOI trending down sharply
  const toiTrend = calculateToiTrend(gameLog);
  if (toiTrend < -20) return 0.15; // Major role reduction
  
  return 0.02; // Minimal scratch risk
}

/**
 * Helper: Recent 5v5 SOG rate
 */
function calculateRecent5v5Rate(gameLog) {
  if (!gameLog || gameLog.length === 0) return 0;
  
  const last5 = gameLog.slice(0, 5);
  const totalShots = last5.reduce((sum, g) => sum + (g.shots || 0), 0);
  const totalTOI = last5.reduce((sum, g) => sum + (g.toiSeconds || 0), 0);
  
  return totalTOI > 0 ? (totalShots / (totalTOI / 3600)) : 0;
}

/**
 * Helper: Estimate PP time
 */
function estimatePPTime(playerStats, teamPenaltyDraw = 3.2) {
  const ppUnit = determinePPUnit(playerStats);
  
  if (ppUnit === 'NONE') return 0;
  
  const ppOpps = teamPenaltyDraw;
  const ppTimeShare = ppUnit === 'PP1' ? 0.65 : 0.35;
  
  return ppOpps * 2 * ppTimeShare * 60; // Seconds
}

/**
 * Helper: Determine PP unit
 */
function determinePPUnit(playerStats, gameLog = []) {
  const ppPoints = playerStats.seasonStats?.powerPlayPoints || 0;
  const ppGoals = playerStats.seasonStats?.powerPlayGoals || 0;
  
  // PP1 indicators: high PP production
  if (ppPoints > 10 || ppGoals > 5) return 'PP1';
  
  // PP2 indicators: some PP time
  if (ppPoints > 3 || ppGoals > 1) return 'PP2';
  
  // Check recent game logs for PP ice time (if available)
  // For now, default to NONE if no clear PP role
  return 'NONE';
}

/**
 * Helper: TOI trend
 */
function calculateToiTrend(gameLog) {
  if (gameLog.length < 5) return 0;
  
  const last3 = gameLog.slice(0, 3);
  const avgRecent = last3.reduce((sum, g) => sum + g.toiSeconds, 0) / 3;
  
  const seasonAvg = gameLog.reduce((sum, g) => sum + g.toiSeconds, 0) / gameLog.length;
  
  return ((avgRecent - seasonAvg) / seasonAvg) * 100;
}

/**
 * ELITE UPGRADE 9: PROPER LINE PRICING (HANDLE PUSHES)
 */
export function calculateLineProbabilityZINB(params, line) {
  const { mu, r, pi } = params;
  
  // Determine if whole line (3.0) or half line (3.5)
  const isWholeLine = line === Math.floor(line);
  
  let overProb = 0;
  let underProb = 0;
  let pushProb = 0;
  
  // Calculate probabilities up to k=20 (extended tail)
  for (let k = 0; k <= 20; k++) {
    const prob = zinbPMF(k, pi, mu, r);
    
    if (isWholeLine) {
      // Whole line: X > L (over), X < L (under), X = L (push)
      if (k > line) overProb += prob;
      else if (k < line) underProb += prob;
      else pushProb += prob;
    } else {
      // Half line: X > L (over), X ≤ L (under)
      if (k > Math.floor(line)) overProb += prob;
      else underProb += prob;
    }
  }
  
  // ELITE UPGRADE 10: NORMALIZE (ensure sum to 1.0)
  const totalProb = overProb + underProb + pushProb;
  if (totalProb > 0) {
    overProb /= totalProb;
    underProb /= totalProb;
    pushProb /= totalProb;
  }
  
  return {
    over: Math.round(overProb * 10000) / 100,   // As percentage
    under: Math.round(underProb * 10000) / 100,
    push: Math.round(pushProb * 10000) / 100
  };
}

/**
 * MASTER PROJECTION WITH ALL ELITE UPGRADES
 */
export async function projectPlayerSOGElite(playerId, opponentTeamAbbrev, gameContext) {
  const {
    isHome,
    venue,
    gameDate,
    teamPenaltyDraw = 3.2,
    teamPenaltyTake = 3.2,
    expectedGameScript = null,
    travelDistance = 0
  } = gameContext;
  
  // 1. Fetch player data
  const [playerStats, gameLog, opponentStats] = await Promise.all([
    fetchPlayerStats(playerId),
    fetchPlayerGameLog(playerId, '20252026', 10),
    fetchTeamStats(opponentTeamAbbrev, '20252026')
  ]);
  
  if (!playerStats || !gameLog || gameLog.length === 0) {
    return null;
  }
  
  // 2. Calculate rest days
  const restDays = calculateRestDays(gameDate, gameLog[0]?.gameDate);
  
  // 3. Build full context
  const context = {
    venue,
    isHome,
    restDays,
    travelDistance,
    teamPenaltyDraw,
    teamPenaltyTake,
    expectedGameScript
  };
  
  // 4. Project by state (5v5, PP, SH)
  const projection = await projectSOGByState(playerStats, gameLog, opponentStats, context);
  
  // 5. Return comprehensive projection
  return {
    playerId,
    playerName: playerStats.fullName,
    team: playerStats.teamAbbrev,
    position: playerStats.position,
    opponent: opponentTeamAbbrev,
    
    // ZINB parameters
    params: projection.total,
    
    // Breakdown
    breakdown: projection.breakdown,
    
    // Metadata
    metadata: {
      scratchRisk: projection.total.pi,
      restDays,
      venue,
      rinkEffect: RINK_EFFECTS[venue] || 1.0
    }
  };
}

export default {
  projectPlayerSOGElite,
  projectSOGByState,
  calculateLineProbabilityZINB,
  RINK_EFFECTS
};
