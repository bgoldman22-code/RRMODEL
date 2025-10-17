/**
 * NFL Predictions Lock Manager
 * 
 * Handles persistent storage of locked-in predictions for games.
 * Once a game starts (or is manually locked), the picks are frozen and never change.
 * 
 * Storage: localStorage with season/week keys
 * Format: { gameId: { moneyline, spread, total, timestamp, gameStart } }
 */

const STORAGE_KEY_PREFIX = 'nfl_locked_picks';

/**
 * Get storage key for a specific week/season
 */
function getStorageKey(season, week) {
  return `${STORAGE_KEY_PREFIX}_${season}_week${week}`;
}

/**
 * Load locked picks for a specific week
 */
export function loadLockedPicks(season, week) {
  try {
    const key = getStorageKey(season, week);
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error loading locked picks:', error);
    return {};
  }
}

/**
 * Save locked picks for a specific week
 */
export function saveLockedPicks(season, week, lockedPicks) {
  try {
    const key = getStorageKey(season, week);
    localStorage.setItem(key, JSON.stringify(lockedPicks));
  } catch (error) {
    console.error('Error saving locked picks:', error);
  }
}

/**
 * Lock picks for a single game
 */
export function lockGamePicks(season, week, gameId, picks, gameStart) {
  const lockedPicks = loadLockedPicks(season, week);
  
  lockedPicks[gameId] = {
    ...picks,
    lockedAt: new Date().toISOString(),
    gameStart: gameStart,
    gameId: gameId
  };
  
  saveLockedPicks(season, week, lockedPicks);
  
  return lockedPicks;
}

/**
 * Check if a game has locked picks
 */
export function isGameLocked(season, week, gameId) {
  const lockedPicks = loadLockedPicks(season, week);
  return !!lockedPicks[gameId];
}

/**
 * Get locked picks for a specific game
 */
export function getGameLockedPicks(season, week, gameId) {
  const lockedPicks = loadLockedPicks(season, week);
  return lockedPicks[gameId] || null;
}

/**
 * Auto-lock games that have already started
 * Call this when loading predictions to ensure games are locked once they start
 * CRITICAL: Locks CLOSING ODDS at game time, not live odds
 */
export function autoLockStartedGames(season, week, predictions) {
  const now = new Date();
  const lockedPicks = loadLockedPicks(season, week);
  let updated = false;
  
  for (const prediction of predictions) {
    const gameStart = new Date(prediction.start);
    const gameId = prediction.game_id || prediction.gameId;
    
    // If game has started and not yet locked, lock it with CLOSING ODDS
    if (gameStart <= now && !lockedPicks[gameId]) {
      // Store predictions AND odds at lock time (these are the closing odds)
      lockedPicks[gameId] = {
        moneyline: prediction.predictions?.moneyline,
        spread: prediction.predictions?.spread,
        total: prediction.predictions?.total,
        
        // 🔒 CRITICAL: Store the odds at lock time (closing odds)
        // These will be used instead of live odds when displaying
        odds: {
          moneyline: prediction.odds?.moneyline,
          spread: prediction.odds?.spread,
          total: prediction.odds?.total,
          display: prediction.odds?.display,
          display_book: prediction.odds?.display_book
        },
        
        lockedAt: now.toISOString(),
        gameStart: prediction.start,
        gameId: gameId,
        autoLocked: true
      };
      updated = true;
      
      console.log(`🔒 Auto-locked ${gameId} with closing odds at ${now.toLocaleString()}`);
    }
  }
  
  if (updated) {
    saveLockedPicks(season, week, lockedPicks);
  }
  
  return lockedPicks;
}

/**
 * Merge locked picks into predictions
 * Replaces predictions AND odds with locked versions for games that are locked
 * CRITICAL: Uses CLOSING ODDS from lock time, not live odds
 */
export function mergeLockedPicks(season, week, predictions) {
  const lockedPicks = loadLockedPicks(season, week);
  
  return predictions.map(pred => {
    const gameId = pred.game_id || pred.gameId;
    const locked = lockedPicks[gameId];
    
    if (locked) {
      // 🔒 Use locked picks AND locked odds (closing odds at game time)
      return {
        ...pred,
        predictions: {
          moneyline: locked.moneyline,
          spread: locked.spread,
          total: locked.total
        },
        // 🔒 CRITICAL: Use locked odds (closing), not live odds
        odds: locked.odds || pred.odds,
        isLocked: true,
        lockedAt: locked.lockedAt,
        autoLocked: locked.autoLocked || false,
        // Add flag so UI knows these are closing odds
        usingClosingOdds: !!locked.odds
      };
    }
    
    return pred;
  });
}

/**
 * Unlock a game (for testing/debugging only)
 */
export function unlockGame(season, week, gameId) {
  const lockedPicks = loadLockedPicks(season, week);
  delete lockedPicks[gameId];
  saveLockedPicks(season, week, lockedPicks);
}

/**
 * Clear all locked picks for a week (use with caution)
 */
export function clearAllLocks(season, week) {
  const key = getStorageKey(season, week);
  localStorage.removeItem(key);
}

/**
 * Get summary of locked games
 */
export function getLockedGamesSummary(season, week) {
  const lockedPicks = loadLockedPicks(season, week);
  const gameIds = Object.keys(lockedPicks);
  
  return {
    count: gameIds.length,
    games: gameIds.map(id => ({
      gameId: id,
      lockedAt: lockedPicks[id].lockedAt,
      autoLocked: lockedPicks[id].autoLocked || false
    }))
  };
}

export default {
  loadLockedPicks,
  saveLockedPicks,
  lockGamePicks,
  isGameLocked,
  getGameLockedPicks,
  autoLockStartedGames,
  mergeLockedPicks,
  unlockGame,
  clearAllLocks,
  getLockedGamesSummary
};
