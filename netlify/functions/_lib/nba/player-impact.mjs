/**
 * NBA Player Impact Calculator
 * 
 * Calculates production share for each player based on their
 * contribution to team stats (points, rebounds, assists).
 * 
 * Production Share = 50% points + 25% rebounds + 25% assists
 * (as % of team totals)
 * 
 * Used by injury-adjustments-v2 to weight injuries by player importance.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __playerImpactFilename = fileURLToPath(import.meta.url);
const __playerImpactDirname = path.dirname(__playerImpactFilename);

// Cache for production shares (calculated once per invocation)
let productionShareCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load player boxscores from local data file
 */
function loadPlayerBoxscores() {
  const possiblePaths = [
    path.join(__playerImpactDirname, '../../../../data/nba/player-boxscores-2025-26.json'),
    path.join(process.cwd(), 'data/nba/player-boxscores-2025-26.json'),
    '/opt/build/repo/data/nba/player-boxscores-2025-26.json',
    '/var/task/data/nba/player-boxscores-2025-26.json'
  ];

  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const boxscores = JSON.parse(data);
        console.log(`[PlayerImpact] ✅ Loaded ${boxscores.length} boxscores from ${filePath}`);
        return boxscores;
      }
    } catch (e) {
      // Try next path
    }
  }

  console.warn('[PlayerImpact] ⚠️ Could not load player-boxscores-2025-26.json');
  return [];
}

/**
 * Calculate production shares for all players on all teams
 * 
 * @returns {Map<string, Map<string, Object>>} Map of teamAbbr -> Map of playerName -> stats
 */
export function calculateAllProductionShares() {
  // Return cached if fresh
  if (productionShareCache && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL)) {
    return productionShareCache;
  }

  const boxscores = loadPlayerBoxscores();
  if (boxscores.length === 0) {
    return new Map();
  }

  // Group by team
  const teamData = new Map();
  
  for (const game of boxscores) {
    const team = game.teamTricode;
    if (!teamData.has(team)) {
      teamData.set(team, {
        players: new Map(),
        totals: { points: 0, rebounds: 0, assists: 0, minutes: 0 }
      });
    }
    
    const data = teamData.get(team);
    
    // Accumulate team totals
    data.totals.points += game.points || 0;
    data.totals.rebounds += game.rebounds || 0;
    data.totals.assists += game.assists || 0;
    data.totals.minutes += game.minutes || 0;
    
    // Accumulate player stats
    const playerName = game.playerName;
    if (!data.players.has(playerName)) {
      data.players.set(playerName, {
        games: 0,
        points: 0,
        rebounds: 0,
        assists: 0,
        minutes: 0
      });
    }
    
    const player = data.players.get(playerName);
    player.games++;
    player.points += game.points || 0;
    player.rebounds += game.rebounds || 0;
    player.assists += game.assists || 0;
    player.minutes += game.minutes || 0;
  }

  // Calculate production shares
  const result = new Map();
  
  for (const [team, data] of teamData) {
    const playerShares = new Map();
    
    for (const [playerName, stats] of data.players) {
      const pctPts = data.totals.points > 0 ? (stats.points / data.totals.points) : 0;
      const pctReb = data.totals.rebounds > 0 ? (stats.rebounds / data.totals.rebounds) : 0;
      const pctAst = data.totals.assists > 0 ? (stats.assists / data.totals.assists) : 0;
      
      // Production share: 50% points, 25% rebounds, 25% assists
      const productionShare = (pctPts * 0.5) + (pctReb * 0.25) + (pctAst * 0.25);
      
      // Average minutes per game
      const avgMinutes = stats.games > 0 ? (stats.minutes / stats.games) : 0;
      
      playerShares.set(playerName, {
        productionShare: Math.round(productionShare * 1000) / 10, // As percentage (e.g., 18.7%)
        pctPoints: Math.round(pctPts * 1000) / 10,
        pctRebounds: Math.round(pctReb * 1000) / 10,
        pctAssists: Math.round(pctAst * 1000) / 10,
        avgMinutes: Math.round(avgMinutes * 10) / 10,
        games: stats.games,
        // Tier classification
        tier: classifyPlayerTier(productionShare * 100, avgMinutes)
      });
    }
    
    result.set(team, playerShares);
  }

  // Cache the result
  productionShareCache = result;
  cacheTimestamp = Date.now();
  
  console.log(`[PlayerImpact] ✅ Calculated production shares for ${result.size} teams`);
  return result;
}

/**
 * Classify player into tier based on production share and minutes
 */
function classifyPlayerTier(productionShare, avgMinutes) {
  // Production share thresholds (as percentage)
  if (productionShare >= 15 || avgMinutes >= 32) return 'STAR';
  if (productionShare >= 10 || avgMinutes >= 25) return 'STARTER';
  if (productionShare >= 5 || avgMinutes >= 15) return 'ROTATION';
  return 'BENCH';
}

/**
 * Get production share for a specific player
 * 
 * @param {string} teamAbbr - Team abbreviation (e.g., 'BOS')
 * @param {string} playerName - Player name (e.g., 'Jaylen Brown')
 * @returns {Object|null} Player impact data or null if not found
 */
export function getPlayerImpact(teamAbbr, playerName) {
  const allShares = calculateAllProductionShares();
  
  const teamPlayers = allShares.get(teamAbbr);
  if (!teamPlayers) {
    console.log(`[PlayerImpact] Team not found: ${teamAbbr}`);
    return null;
  }
  
  // Try exact match first
  if (teamPlayers.has(playerName)) {
    return teamPlayers.get(playerName);
  }
  
  // Try fuzzy match (last name match)
  const lastName = playerName.split(' ').pop()?.toLowerCase();
  for (const [name, data] of teamPlayers) {
    if (name.toLowerCase().includes(lastName) || lastName?.includes(name.split(' ').pop()?.toLowerCase())) {
      console.log(`[PlayerImpact] Fuzzy match: "${playerName}" -> "${name}"`);
      return data;
    }
  }
  
  console.log(`[PlayerImpact] Player not found: ${playerName} on ${teamAbbr}`);
  return null;
}

/**
 * Get impact weight multiplier for injury calculations
 * 
 * Based on production share:
 * - 20%+ production share → 2.0x weight
 * - 15-20% → 1.5x weight  
 * - 10-15% → 1.2x weight
 * - 5-10% → 1.0x weight (baseline)
 * - <5% → 0.6x weight
 * 
 * @param {string} teamAbbr 
 * @param {string} playerName 
 * @returns {number} Weight multiplier (default 1.0)
 */
export function getInjuryWeightMultiplier(teamAbbr, playerName) {
  const impact = getPlayerImpact(teamAbbr, playerName);
  
  if (!impact) {
    // Unknown player - assume rotation level
    return 1.0;
  }
  
  const share = impact.productionShare;
  
  // Production share-based weights
  if (share >= 20) return 2.0;  // Superstar
  if (share >= 15) return 1.5;  // Star
  if (share >= 10) return 1.2;  // Quality starter
  if (share >= 5) return 1.0;   // Rotation player (baseline)
  return 0.6;                    // Deep bench
}

/**
 * Get top players for a team by production share
 * 
 * @param {string} teamAbbr 
 * @param {number} limit 
 * @returns {Array}
 */
export function getTopPlayersByImpact(teamAbbr, limit = 8) {
  const allShares = calculateAllProductionShares();
  const teamPlayers = allShares.get(teamAbbr);
  
  if (!teamPlayers) return [];
  
  return Array.from(teamPlayers.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.productionShare - a.productionShare)
    .slice(0, limit);
}

export default {
  calculateAllProductionShares,
  getPlayerImpact,
  getInjuryWeightMultiplier,
  getTopPlayersByImpact
};
