// netlify/functions/_lib/nhl-historical-data-pipeline.mjs
// ELITE PHASE 2A: Historical multi-season data ingestion and storage

/**
 * OBJECTIVE: Fetch 3-5 seasons of NHL player-game logs to train ZINB priors
 * 
 * Data Sources:
 * 1. NHL Stats API (free, official)
 * 2. Store in Netlify Blobs (persistent storage)
 * 3. Build training dataset for ML layer
 */

const NHL_STATS_API = 'https://api.nhle.com/stats/rest/en';
const NHL_API_BASE = 'https://api-web.nhle.com/v1';

/**
 * Fetch all player IDs for a season
 */
export async function fetchSeasonPlayerIds(season = '20242025') {
  const url = `${NHL_STATS_API}/skater/summary?cayenneExp=seasonId=${season}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch player IDs: ${response.status}`);
    
    const data = await response.json();
    
    return data.data.map(p => ({
      playerId: p.playerId,
      playerName: p.skaterFullName,
      team: p.teamAbbrevs,
      position: p.positionCode,
      gamesPlayed: p.gamesPlayed
    }));
  } catch (error) {
    console.error('Error fetching season player IDs:', error);
    return [];
  }
}

/**
 * Fetch detailed game logs for a player across multiple seasons
 */
export async function fetchPlayerHistoricalGames(playerId, seasons = ['20222023', '20232024', '20242025']) {
  const allGames = [];
  
  for (const season of seasons) {
    const gameLog = await fetchPlayerSeasonGames(playerId, season);
    allGames.push(...gameLog);
  }
  
  return allGames;
}

/**
 * Fetch game log for a single season
 */
async function fetchPlayerSeasonGames(playerId, season) {
  const url = `${NHL_API_BASE}/player/${playerId}/game-log/${season}/2`; // 2 = regular season
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`No data for player ${playerId} in ${season}`);
      return [];
    }
    
    const data = await response.json();
    const gameLog = data.gameLog || [];
    
    return gameLog.map(game => ({
      // Game identifiers
      gameId: game.gameId,
      season: season,
      gameDate: game.gameDate,
      
      // Opponent & venue
      opponentAbbrev: game.opponentAbbrev,
      homeRoadFlag: game.homeRoadFlag, // H or R
      
      // Performance
      goals: game.goals || 0,
      assists: game.assists || 0,
      points: game.points || 0,
      shots: game.shots || 0,
      
      // Ice time
      toi: game.toi,
      toiSeconds: parseTimeToSeconds(game.toi),
      
      // Power play
      powerPlayGoals: game.powerPlayGoals || 0,
      powerPlayPoints: game.powerPlayPoints || 0,
      powerPlayToi: game.ppToi || '00:00',
      powerPlayToiSeconds: parseTimeToSeconds(game.ppToi || '00:00'),
      
      // Short-handed
      shortHandedGoals: game.shGoals || 0,
      shortHandedPoints: game.shPoints || 0,
      
      // Other
      plusMinus: game.plusMinus || 0,
      pim: game.pim || 0,
      blockedShots: game.blockedShots || 0,
      hits: game.hits || 0,
      faceoffWinPct: game.faceoffWinningPctg || 0
    }));
  } catch (error) {
    console.error(`Error fetching games for player ${playerId} in ${season}:`, error);
    return [];
  }
}

/**
 * Parse MM:SS time to seconds
 */
function parseTimeToSeconds(timeString) {
  if (!timeString || typeof timeString !== 'string') return 0;
  
  const parts = timeString.split(':');
  if (parts.length !== 2) return 0;
  
  const minutes = parseInt(parts[0], 10) || 0;
  const seconds = parseInt(parts[1], 10) || 0;
  
  return (minutes * 60) + seconds;
}

/**
 * Build comprehensive training dataset
 * Includes player games + opponent stats + contextual features
 */
export async function buildTrainingDataset(seasons = ['20222023', '20232024']) {
  console.log('Building training dataset for seasons:', seasons);
  
  const trainingData = [];
  
  for (const season of seasons) {
    console.log(`\nProcessing season ${season}...`);
    
    // 1. Get all players for season
    const players = await fetchSeasonPlayerIds(season);
    console.log(`Found ${players.length} players`);
    
    // 2. For each player with significant games, fetch historical games
    let processed = 0;
    for (const player of players) {
      // Only process players with 10+ games (filter noise)
      if (player.gamesPlayed < 10) continue;
      
      const games = await fetchPlayerSeasonGames(player.playerId, season);
      
      for (const game of games) {
        // Add player metadata
        const record = {
          playerId: player.playerId,
          playerName: player.playerName,
          position: player.position,
          ...game
        };
        
        trainingData.push(record);
      }
      
      processed++;
      if (processed % 50 === 0) {
        console.log(`  Processed ${processed}/${players.length} players`);
      }
      
      // Rate limiting (10 requests per second)
      await sleep(100);
    }
  }
  
  console.log(`\nTraining dataset complete: ${trainingData.length} player-game observations`);
  return trainingData;
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate shooting statistics from historical games
 */
export function calculateShootingStats(historicalGames) {
  if (!historicalGames || historicalGames.length === 0) {
    return null;
  }
  
  const stats = {
    gamesPlayed: historicalGames.length,
    
    // Overall totals
    totalShots: 0,
    totalGoals: 0,
    totalTOI: 0,
    
    // 5v5 stats (estimated: total - PP - SH)
    total5v5TOI: 0,
    total5v5Shots: 0,
    
    // Power play
    totalPPTOI: 0,
    totalPPGoals: 0,
    
    // Home/road splits
    homeGames: 0,
    homeShots: 0,
    roadGames: 0,
    roadShots: 0,
    
    // Variance metrics
    shotVariance: 0,
    shotsPerGame: []
  };
  
  // Aggregate totals
  for (const game of historicalGames) {
    stats.totalShots += game.shots;
    stats.totalGoals += game.goals;
    stats.totalTOI += game.toiSeconds;
    stats.totalPPTOI += game.powerPlayToiSeconds;
    stats.totalPPGoals += game.powerPlayGoals;
    
    // Estimate 5v5 TOI (total - PP)
    const fiveVfiveTOI = game.toiSeconds - game.powerPlayToiSeconds;
    stats.total5v5TOI += fiveVfiveTOI;
    
    // Home/road
    if (game.homeRoadFlag === 'H') {
      stats.homeGames++;
      stats.homeShots += game.shots;
    } else {
      stats.roadGames++;
      stats.roadShots += game.shots;
    }
    
    stats.shotsPerGame.push(game.shots);
  }
  
  // Calculate rates
  stats.shotsPerGame_avg = stats.totalShots / stats.gamesPlayed;
  stats.sog60_overall = (stats.totalShots / (stats.totalTOI / 3600)) || 0;
  stats.sog60_5v5 = (stats.total5v5Shots / (stats.total5v5TOI / 3600)) || 0;
  stats.shootingPct = stats.totalGoals / stats.totalShots || 0;
  
  // Calculate variance (for ZINB 'r' parameter)
  const mean = stats.shotsPerGame_avg;
  const squaredDiffs = stats.shotsPerGame.map(x => Math.pow(x - mean, 2));
  stats.shotVariance = squaredDiffs.reduce((a, b) => a + b, 0) / stats.gamesPlayed;
  stats.shotStdDev = Math.sqrt(stats.shotVariance);
  
  // Home/road rates
  stats.sog_home_avg = stats.homeGames > 0 ? stats.homeShots / stats.homeGames : 0;
  stats.sog_road_avg = stats.roadGames > 0 ? stats.roadShots / stats.roadGames : 0;
  
  return stats;
}

/**
 * ELITE: Fit ZINB distribution parameters from historical data
 * This is what was HARDCODED in v2.0 - now we LEARN it
 */
export function fitZINBFromHistory(historicalGames, position) {
  const stats = calculateShootingStats(historicalGames);
  
  if (!stats || stats.gamesPlayed < 10) {
    // Fallback to position priors if insufficient data
    return getPositionPriors(position);
  }
  
  // Mean (mu): historical shots per game
  const mu = stats.shotsPerGame_avg;
  
  // Variance: from empirical shot distribution
  const variance = stats.shotVariance;
  
  // Derive 'r' (dispersion) from mean-variance relationship
  // For Negative Binomial: Var = mu + (mu^2 / r)
  // Solve for r: r = mu^2 / (Var - mu)
  let r;
  if (variance > mu) {
    r = (mu * mu) / (variance - mu);
  } else {
    // Poisson-like (variance ≈ mean)
    r = 10; // High r = low overdispersion
  }
  
  // Zero-inflation (pi): proportion of 0-shot games
  const zeroGames = historicalGames.filter(g => g.shots === 0).length;
  const empiricalZeroProb = zeroGames / stats.gamesPlayed;
  
  // NB expected zero probability
  const nbZeroProb = Math.pow(r / (r + mu), r);
  
  // Zero-inflation parameter
  const pi = Math.max(0, empiricalZeroProb - nbZeroProb);
  
  return {
    mu,
    r: Math.max(0.5, Math.min(r, 20)), // Bound r to reasonable range
    pi: Math.max(0, Math.min(pi, 0.5)), // Cap zero-inflation at 50%
    sampleSize: stats.gamesPlayed
  };
}

/**
 * Position-level priors (fallback when insufficient player data)
 */
function getPositionPriors(position) {
  // Based on NHL averages (rough estimates - would refine with actual data)
  const priors = {
    'C': { mu: 2.8, r: 2.5, pi: 0.08 },  // Centers: high volume
    'L': { mu: 2.5, r: 2.3, pi: 0.10 },  // Left wing
    'R': { mu: 2.4, r: 2.3, pi: 0.10 },  // Right wing
    'D': { mu: 1.8, r: 3.5, pi: 0.12 },  // Defense: more consistent, lower volume
    'F': { mu: 2.5, r: 2.4, pi: 0.10 }   // Generic forward
  };
  
  return priors[position] || priors['F'];
}

/**
 * Hierarchical Bayesian shrinkage
 * Blend player-specific empirical distribution with position prior
 */
export function shrinkToPositionPrior(playerParams, position, sampleSize, shrinkageFactor = 0.3) {
  const positionPrior = getPositionPriors(position);
  
  // More games = less shrinkage (trust player's data more)
  // Fewer games = more shrinkage (trust position prior more)
  const weight = Math.min(sampleSize / 50, 1.0); // Full weight at 50+ games
  const shrinkage = (1 - weight) * shrinkageFactor;
  
  return {
    mu: playerParams.mu * (1 - shrinkage) + positionPrior.mu * shrinkage,
    r: playerParams.r * (1 - shrinkage) + positionPrior.r * shrinkage,
    pi: playerParams.pi * (1 - shrinkage) + positionPrior.pi * shrinkage
  };
}

/**
 * STORAGE: Save training dataset to Netlify Blobs
 * (In production, would use this for persistence)
 */
export async function saveTrainingDataset(dataset, filename = 'nhl-training-data.json') {
  // For now, just return the dataset
  // In production with Netlify Blobs:
  // const { getStore } = await import('@netlify/blobs');
  // const store = getStore('nhl-historical-data');
  // await store.setJSON(filename, dataset);
  
  console.log(`Training dataset ready: ${dataset.length} observations`);
  return dataset;
}

export default {
  fetchSeasonPlayerIds,
  fetchPlayerHistoricalGames,
  buildTrainingDataset,
  calculateShootingStats,
  fitZINBFromHistory,
  shrinkToPositionPrior,
  saveTrainingDataset
};
