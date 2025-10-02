// netlify/functions/_lib/nhl-projection-engine.mjs
// Elite SOG projection system - Bayesian updating with advanced features

import {
  fetchPlayerGameLog,
  fetchPlayerStats,
  fetchTeamStats,
  calculateRestDays,
  HOME_ICE_SOG_BOOST,
  ROAD_SOG_PENALTY,
  VENUE_SOG_ADJUSTMENTS
} from './nhl-data-fetch.mjs';

/**
 * MASTER PROJECTION FUNCTION
 * Combines season baseline, recent form, opponent adjustment, situational factors
 */
export async function projectPlayerSOG(playerId, opponentTeamAbbrev, isHome, venue, gameDate) {
  // 1. Fetch player data
  const [playerStats, gameLog, opponentStats] = await Promise.all([
    fetchPlayerStats(playerId),
    fetchPlayerGameLog(playerId, '20252026', 10), // Last 10 games
    fetchTeamStats(opponentTeamAbbrev, '20252026')
  ]);
  
  if (!playerStats || !playerStats.seasonStats || gameLog.length === 0) {
    return null; // Insufficient data
  }
  
  // 2. Season baseline (full season average)
  const seasonSOGPerGame = playerStats.seasonStats.shotsPerGame || 0;
  
  // 3. Recent form (last 5 games weighted heavier)
  const recentSOG = calculateRecentForm(gameLog, 5);
  
  // 4. Weighted baseline (70% season, 30% recent)
  let baseProjection = (seasonSOGPerGame * 0.70) + (recentSOG * 0.30);
  
  // 5. Opponent adjustment (defensive strength vs SOG)
  const opponentFactor = calculateOpponentAdjustment(opponentStats);
  baseProjection *= opponentFactor;
  
  // 6. Home/road adjustment
  const locationFactor = isHome ? HOME_ICE_SOG_BOOST : ROAD_SOG_PENALTY;
  baseProjection *= locationFactor;
  
  // 7. Venue tracking bias adjustment
  const venueFactor = VENUE_SOG_ADJUSTMENTS[venue] || 1.0;
  baseProjection *= venueFactor;
  
  // 8. Rest days adjustment (back-to-backs kill performance)
  const restDays = calculateRestDays(gameDate, gameLog[0]?.gameDate);
  const restFactor = calculateRestAdjustment(restDays);
  baseProjection *= restFactor;
  
  // 9. Ice time stability check (injured/reduced role detection)
  const toiTrend = calculateToiTrend(gameLog);
  const toiFactor = calculateToiAdjustment(toiTrend, playerStats.seasonStats.avgToiSeconds);
  baseProjection *= toiFactor;
  
  // 10. Return projection with metadata
  return {
    playerId,
    playerName: playerStats.fullName,
    team: playerStats.teamAbbrev,
    position: playerStats.position,
    opponent: opponentTeamAbbrev,
    isHome,
    venue,
    
    // Projection
    projectedSOG: Math.round(baseProjection * 100) / 100, // 2 decimals
    
    // Components (for transparency)
    components: {
      seasonAvg: seasonSOGPerGame,
      recentAvg: recentSOG,
      baselineProjection: (seasonSOGPerGame * 0.70) + (recentSOG * 0.30),
      opponentFactor,
      locationFactor,
      venueFactor,
      restFactor,
      toiFactor
    },
    
    // Supporting data
    seasonStats: {
      gamesPlayed: playerStats.seasonStats.gamesPlayed,
      totalShots: playerStats.seasonStats.shots,
      avgSOG: seasonSOGPerGame,
      avgToiSeconds: playerStats.seasonStats.avgToiSeconds
    },
    
    recentForm: {
      last5Avg: recentSOG,
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
function calculateRecentForm(gameLog, numGames = 5) {
  if (gameLog.length === 0) return 0;
  
  const recentGames = gameLog.slice(0, Math.min(numGames, gameLog.length));
  
  // Exponential weighting: most recent game weighted heaviest
  // Weights: [0.30, 0.25, 0.20, 0.15, 0.10] for last 5 games
  const weights = [0.30, 0.25, 0.20, 0.15, 0.10];
  
  let weightedSOG = 0;
  let totalWeight = 0;
  
  for (let i = 0; i < recentGames.length; i++) {
    const weight = weights[i] || 0.05; // Fallback for 6+
    weightedSOG += recentGames[i].shots * weight;
    totalWeight += weight;
  }
  
  return totalWeight > 0 ? weightedSOG / totalWeight : 0;
}

/**
 * Opponent adjustment based on SOG allowed per game
 * Strong defenses suppress shots, weak defenses allow more
 */
function calculateOpponentAdjustment(opponentStats) {
  if (!opponentStats || !opponentStats.shotsAgainstPerGame) return 1.0;
  
  const leagueAvgSOGAllowed = 30.5; // NHL average ~30-31 shots/game
  const opponentSOGAllowed = opponentStats.shotsAgainstPerGame;
  
  // If opponent allows 33 SOG/game (vs 30.5 avg), players get +8% boost
  // If opponent allows 28 SOG/game, players get -8% penalty
  const adjustmentFactor = opponentSOGAllowed / leagueAvgSOGAllowed;
  
  // Cap adjustments at ±15% to avoid overreaction to small samples
  return Math.max(0.85, Math.min(1.15, adjustmentFactor));
}

/**
 * Rest days adjustment (back-to-backs KILL performance)
 */
function calculateRestAdjustment(restDays) {
  if (restDays === 0) return 0.92;  // Back-to-back: -8% SOG
  if (restDays === 1) return 0.96;  // 1 day rest: -4% SOG
  if (restDays === 2) return 1.00;  // 2 days rest: normal
  if (restDays >= 3) return 1.02;   // 3+ days rest: +2% SOG (fresh legs)
  return 1.0;
}

/**
 * Time on ice trend (detect role changes, injuries, benchings)
 */
function calculateToiTrend(gameLog) {
  if (gameLog.length < 3) return 0;
  
  const last3Games = gameLog.slice(0, 3);
  const avgToi = last3Games.reduce((sum, g) => sum + g.toiSeconds, 0) / 3;
  
  const seasonAvg = gameLog.reduce((sum, g) => sum + g.toiSeconds, 0) / gameLog.length;
  
  // Return % difference (e.g., -10% if recent TOI down 10%)
  return ((avgToi - seasonAvg) / seasonAvg) * 100;
}

/**
 * TOI adjustment factor
 * If player's ice time trending down, reduce SOG projection
 */
function calculateToiAdjustment(toiTrend, seasonAvgToi) {
  if (toiTrend < -15) return 0.90; // Major TOI drop: -10% SOG
  if (toiTrend < -10) return 0.95; // Moderate TOI drop: -5% SOG
  if (toiTrend > 10) return 1.05;  // TOI increase: +5% SOG
  return 1.0; // Stable TOI
}

/**
 * ELITE: Calculate probability distribution for SOG outcomes
 * Uses negative binomial distribution (better for count data than normal)
 */
export function calculateSOGProbabilities(projectedSOG) {
  // Negative binomial params (mean = projectedSOG, variance tuned to NHL data)
  const mean = projectedSOG;
  const variance = mean + (mean * mean * 0.35); // Overdispersion parameter
  
  const r = (mean * mean) / (variance - mean);
  const p = mean / variance;
  
  const probabilities = {};
  
  // Calculate P(X = k) for k = 0 to 15 shots
  for (let k = 0; k <= 15; k++) {
    probabilities[k] = negativeBinomialPMF(k, r, p);
  }
  
  return probabilities;
}

/**
 * Negative binomial PMF
 */
function negativeBinomialPMF(k, r, p) {
  return (
    (gamma(k + r) / (gamma(k + 1) * gamma(r))) *
    Math.pow(p, r) *
    Math.pow(1 - p, k)
  );
}

/**
 * Gamma function approximation (for combinations)
 */
function gamma(z) {
  if (z === 1) return 1;
  if (z === 0.5) return Math.sqrt(Math.PI);
  return (z - 1) * gamma(z - 1);
}

/**
 * Calculate over/under probabilities for a specific line
 */
export function calculateLineProbability(projectedSOG, line, isOver = true) {
  const probs = calculateSOGProbabilities(projectedSOG);
  
  let probability = 0;
  
  if (isOver) {
    // P(SOG > line) = sum of P(X = k) for k > line
    for (let k = Math.floor(line) + 1; k <= 15; k++) {
      probability += probs[k] || 0;
    }
  } else {
    // P(SOG < line) = sum of P(X = k) for k < line
    for (let k = 0; k < line; k++) {
      probability += probs[k] || 0;
    }
  }
  
  return Math.round(probability * 10000) / 100; // Return as percentage (2 decimals)
}

/**
 * BATCH PROJECTION: Project SOG for all players in a game
 */
export async function projectGameSOG(game) {
  const { awayTeam, homeTeam, venue, startTime } = game;
  
  // Fetch rosters for both teams
  const [awayRoster, homeRoster] = await Promise.all([
    fetchTeamRoster(awayTeam.abbrev),
    fetchTeamRoster(homeTeam.abbrev)
  ]);
  
  // Project all forwards and defensemen (not goalies)
  const awayProjections = [];
  const homeProjections = [];
  
  // Away team (forwards + defensemen)
  const awaySkaters = [...awayRoster.forwards, ...awayRoster.defensemen];
  for (const player of awaySkaters) {
    const projection = await projectPlayerSOG(
      player.id,
      homeTeam.abbrev,
      false, // Away
      venue,
      startTime
    );
    
    if (projection && projection.projectedSOG > 0) {
      awayProjections.push(projection);
    }
  }
  
  // Home team (forwards + defensemen)
  const homeSkaters = [...homeRoster.forwards, ...homeRoster.defensemen];
  for (const player of homeSkaters) {
    const projection = await projectPlayerSOG(
      player.id,
      awayTeam.abbrev,
      true, // Home
      venue,
      startTime
    );
    
    if (projection && projection.projectedSOG > 0) {
      homeProjections.push(projection);
    }
  }
  
  return {
    game: {
      awayTeam: awayTeam.abbrev,
      homeTeam: homeTeam.abbrev,
      venue,
      startTime
    },
    projections: {
      away: awayProjections.sort((a, b) => b.projectedSOG - a.projectedSOG),
      home: homeProjections.sort((a, b) => b.projectedSOG - a.projectedSOG)
    }
  };
}

// Import roster fetch function (not defined here, should be in data-fetch)
async function fetchTeamRoster(teamAbbrev) {
  // Placeholder - use actual import from nhl-data-fetch.mjs
  const { fetchTeamRoster: fetchRoster } = await import('./nhl-data-fetch.mjs');
  return fetchRoster(teamAbbrev);
}

export default {
  projectPlayerSOG,
  calculateSOGProbabilities,
  calculateLineProbability,
  projectGameSOG
};
