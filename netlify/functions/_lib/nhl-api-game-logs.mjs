/**
 * NHL API REAL-TIME GAME LOG INTEGRATION
 * 
 * Fetches player game logs directly from NHL API instead of relying on cached JSON
 * Updates every 6 hours to catch same-day changes
 * 
 * API: https://api-web.nhle.com/v1/player/{playerId}/game-log/now
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'data', 'nhl', 'game_logs_cache');
const CACHE_DURATION_HOURS = 6;

/**
 * Fetch player's recent game log from NHL API
 */
export async function fetchPlayerGameLog(playerId) {
  try {
    const url = `https://api-web.nhle.com/v1/player/${playerId}/game-log/now`;
    
    console.log(`📡 Fetching game log for player ${playerId}...`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`NHL API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.gameLog || data.gameLog.length === 0) {
      console.warn(`⚠️ No game log data for player ${playerId}`);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Failed to fetch game log for ${playerId}:`, error.message);
    return null;
  }
}

/**
 * Parse TOI string (MM:SS) to decimal minutes
 */
function parseTOI(toiString) {
  if (!toiString || toiString === '--' || toiString === '0:00') return 0;
  
  const parts = toiString.split(':');
  if (parts.length !== 2) return 0;
  
  const mins = parseInt(parts[0]) || 0;
  const secs = parseInt(parts[1]) || 0;
  
  return mins + (secs / 60);
}

/**
 * Calculate L3, L5, L10 averages from game log
 */
export function calculateGameLogAverages(gameLog) {
  if (!gameLog || gameLog.length === 0) {
    return { L3: null, L5: null, L10: null };
  }
  
  // Sort by date descending (most recent first)
  const sortedGames = gameLog.sort((a, b) => {
    return new Date(b.gameDate) - new Date(a.gameDate);
  });
  
  // Calculate averages for L3, L5, L10
  const L3games = sortedGames.slice(0, 3);
  const L5games = sortedGames.slice(0, 5);
  const L10games = sortedGames.slice(0, 10);
  
  function calculateAvg(games) {
    if (games.length === 0) return null;
    
    const totalShots = games.reduce((sum, g) => sum + (g.shots || 0), 0);
    const totalTOI = games.reduce((sum, g) => sum + parseTOI(g.toi), 0);
    const totalPPTOI = games.reduce((sum, g) => sum + parseTOI(g.ppToi || '0:00'), 0);
    const totalGoals = games.reduce((sum, g) => sum + (g.goals || 0), 0);
    const totalAssists = games.reduce((sum, g) => sum + (g.assists || 0), 0);
    
    return {
      shots: (totalShots / games.length).toFixed(2),
      toi: (totalTOI / games.length).toFixed(1),
      ppToi: (totalPPTOI / games.length).toFixed(1),
      goals: (totalGoals / games.length).toFixed(2),
      assists: (totalAssists / games.length).toFixed(2),
      points: ((totalGoals + totalAssists) / games.length).toFixed(2),
      games: games.length
    };
  }
  
  return {
    L3: calculateAvg(L3games),
    L5: calculateAvg(L5games),
    L10: calculateAvg(L10games),
    rawGames: sortedGames
  };
}

/**
 * Get cached game log or fetch fresh
 */
export async function getPlayerGameLog(playerId, playerName, useCache = true) {
  const cacheFile = path.join(CACHE_DIR, `${playerId}.json`);
  
  // Check cache
  if (useCache) {
    try {
      const cached = await fs.readFile(cacheFile, 'utf-8');
      const data = JSON.parse(cached);
      
      // Check if cache is still valid (< 6 hours old)
      const cacheAge = Date.now() - data.timestamp;
      const maxAge = CACHE_DURATION_HOURS * 60 * 60 * 1000;
      
      if (cacheAge < maxAge) {
        console.log(`✅ Using cached game log for ${playerName} (${playerId})`);
        return data.gameLog;
      } else {
        console.log(`🔄 Cache expired for ${playerName}, fetching fresh...`);
      }
    } catch (error) {
      // Cache doesn't exist or is corrupt, fetch fresh
    }
  }
  
  // Fetch fresh from API
  const apiData = await fetchPlayerGameLog(playerId);
  if (!apiData) return null;
  
  const gameLogData = calculateGameLogAverages(apiData.gameLog);
  
  // Save to cache
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(
      cacheFile,
      JSON.stringify({
        playerId,
        playerName,
        timestamp: Date.now(),
        gameLog: gameLogData
      }, null, 2)
    );
    console.log(`💾 Cached game log for ${playerName}`);
  } catch (error) {
    console.warn(`⚠️ Failed to cache game log for ${playerName}:`, error.message);
  }
  
  return gameLogData;
}

/**
 * Batch fetch game logs for multiple players
 */
export async function batchFetchGameLogs(players, useCache = true) {
  console.log(`📊 Fetching game logs for ${players.length} players...`);
  
  const results = {};
  const batchSize = 5; // Fetch 5 at a time to avoid rate limiting
  
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);
    
    const promises = batch.map(async (player) => {
      const gameLog = await getPlayerGameLog(player.playerId, player.name, useCache);
      if (gameLog) {
        results[player.playerId] = gameLog;
      }
    });
    
    await Promise.all(promises);
    
    // Rate limiting: wait 500ms between batches
    if (i + batchSize < players.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`✅ Fetched ${Object.keys(results).length}/${players.length} game logs`);
  
  return results;
}

/**
 * Clear cache (force refresh)
 */
export async function clearGameLogCache() {
  try {
    const files = await fs.readdir(CACHE_DIR);
    for (const file of files) {
      await fs.unlink(path.join(CACHE_DIR, file));
    }
    console.log(`🗑️ Cleared ${files.length} cached game logs`);
  } catch (error) {
    console.warn('⚠️ Failed to clear cache:', error.message);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  try {
    const files = await fs.readdir(CACHE_DIR);
    const stats = {
      totalCached: files.length,
      oldestCache: null,
      newestCache: null
    };
    
    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      if (!stats.oldestCache || data.timestamp < stats.oldestCache) {
        stats.oldestCache = data.timestamp;
      }
      if (!stats.newestCache || data.timestamp > stats.newestCache) {
        stats.newestCache = data.timestamp;
      }
    }
    
    if (stats.oldestCache) {
      stats.oldestCacheAge = Math.floor((Date.now() - stats.oldestCache) / (60 * 60 * 1000));
      stats.newestCacheAge = Math.floor((Date.now() - stats.newestCache) / (60 * 60 * 1000));
    }
    
    return stats;
  } catch (error) {
    return { totalCached: 0, error: error.message };
  }
}
