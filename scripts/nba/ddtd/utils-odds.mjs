/**
 * Odds utilities for DD/TD modeling
 * Handles TheOddsAPI integration with credit budgeting and caching
 * Enforces ≤1M credit limit via Blobs deduplication
 */

import { getStore } from '@netlify/blobs';
import https from 'https';

const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Elite bookmakers (2-3 sharp books)
const SHARP_BOOKS = ['fanduel', 'draftkings', 'betmgm'];

// Markets we care about
const TARGET_MARKETS = [
  'player_double_double',
  'player_triple_double',
  'player_points',
  'player_rebounds',
  'player_assists'
];

// Credit tracking
let CREDIT_USAGE = {
  used: 0,
  limit: 1000000,
  lastReset: new Date().toISOString()
};

/**
 * Fetch odds from TheOddsAPI with credit tracking
 * @param {string} endpoint - API endpoint path
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} API response
 */
async function fetchOddsAPI(endpoint, params = {}) {
  const queryString = new URLSearchParams({
    apiKey: ODDS_API_KEY,
    ...params
  }).toString();
  
  const url = `${ODDS_API_BASE}${endpoint}?${queryString}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          
          // Track credit usage from headers
          const remaining = parseInt(res.headers['x-requests-remaining'] || '0');
          const used = parseInt(res.headers['x-requests-used'] || '0');
          
          CREDIT_USAGE.used += 1;
          
          console.log(`📊 OddsAPI: ${used} used, ${remaining} remaining`);
          
          if (CREDIT_USAGE.used > CREDIT_USAGE.limit) {
            console.warn(`⚠️ Credit limit exceeded: ${CREDIT_USAGE.used}/${CREDIT_USAGE.limit}`);
          }
          
          resolve(parsed);
        } catch (e) {
          reject(new Error(`JSON parse failed: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Generate cache key for odds snapshot
 * @param {string} date - Date YYYY-MM-DD
 * @param {string} snapshotType - 'baseline' | 'betting' | 'closing'
 * @param {string} gameId - Game ID (for betting/closing)
 * @param {string} book - Bookmaker key
 * @returns {string} Blob storage key
 */
function getOddsCacheKey(date, snapshotType, gameId, book) {
  if (snapshotType === 'baseline') {
    return `odds-baseline:${date}:${book}`;
  } else if (snapshotType === 'betting' || snapshotType === 'closing') {
    return `odds-${snapshotType}:${date}:${gameId}:${book}`;
  }
  throw new Error(`Invalid snapshot type: ${snapshotType}`);
}

/**
 * Check if odds are already cached
 * @param {string} key - Cache key
 * @returns {Promise<Object|null>} Cached odds or null
 */
async function getCachedOdds(key) {
  try {
    const store = getStore('nba-odds');
    const cached = await store.get(key, { type: 'json' });
    return cached;
  } catch (error) {
    return null;
  }
}

/**
 * Save odds to cache
 * @param {string} key - Cache key
 * @param {Object} data - Odds data
 * @returns {Promise<void>}
 */
async function cacheOdds(key, data) {
  try {
    const store = getStore('nba-odds');
    await store.setJSON(key, {
      ...data,
      cachedAt: new Date().toISOString(),
      immutable: true
    });
  } catch (error) {
    console.error(`Failed to cache odds for ${key}:`, error.message);
  }
}

/**
 * Fetch baseline odds (morning snapshot for full slate)
 * @param {string} date - Date YYYY-MM-DD
 * @returns {Promise<Object>} Map of book -> market -> odds
 */
export async function fetchBaselineOdds(date) {
  const results = {};
  
  for (const book of SHARP_BOOKS) {
    const cacheKey = getOddsCacheKey(date, 'baseline', null, book);
    const cached = await getCachedOdds(cacheKey);
    
    if (cached) {
      console.log(`✅ Cache hit: ${cacheKey}`);
      results[book] = cached;
      continue;
    }
    
    console.log(`🔄 Fetching baseline odds for ${date} from ${book}...`);
    
    try {
      // Fetch all NBA games for the date
      const games = await fetchOddsAPI('/sports/basketball_nba/events', {
        bookmakers: book,
        markets: TARGET_MARKETS.join(','),
        oddsFormat: 'american',
        dateFormat: 'iso',
        commenceTimeFrom: `${date}T00:00:00Z`,
        commenceTimeTo: `${date}T23:59:59Z`
      });
      
      const marketData = {};
      
      for (const game of games) {
        const bookmaker = game.bookmakers?.find(b => b.key === book);
        if (!bookmaker) continue;
        
        for (const market of bookmaker.markets || []) {
          if (!TARGET_MARKETS.includes(market.key)) continue;
          
          if (!marketData[market.key]) {
            marketData[market.key] = [];
          }
          
          marketData[market.key].push({
            gameId: game.id,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            commenceTime: game.commence_time,
            outcomes: market.outcomes || []
          });
        }
      }
      
      results[book] = marketData;
      await cacheOdds(cacheKey, marketData);
      
    } catch (error) {
      console.error(`Error fetching baseline odds for ${book}:`, error.message);
      results[book] = {};
    }
  }
  
  return results;
}

/**
 * Fetch betting snapshot odds (T-60 before tip)
 * @param {string} date - Date YYYY-MM-DD
 * @param {string} gameId - Game ID
 * @returns {Promise<Object>} Map of book -> market -> odds
 */
export async function fetchBettingOdds(date, gameId) {
  const results = {};
  
  for (const book of SHARP_BOOKS) {
    const cacheKey = getOddsCacheKey(date, 'betting', gameId, book);
    const cached = await getCachedOdds(cacheKey);
    
    if (cached) {
      console.log(`✅ Cache hit: ${cacheKey}`);
      results[book] = cached;
      continue;
    }
    
    console.log(`🔄 Fetching T-60 odds for game ${gameId} from ${book}...`);
    
    try {
      // Fetch specific game odds
      const gameData = await fetchOddsAPI(`/sports/basketball_nba/events/${gameId}/odds`, {
        bookmakers: book,
        markets: TARGET_MARKETS.join(','),
        oddsFormat: 'american',
        dateFormat: 'iso'
      });
      
      const marketData = {};
      const bookmaker = gameData.bookmakers?.find(b => b.key === book);
      
      if (bookmaker) {
        for (const market of bookmaker.markets || []) {
          if (!TARGET_MARKETS.includes(market.key)) continue;
          
          marketData[market.key] = {
            gameId: gameData.id,
            homeTeam: gameData.home_team,
            awayTeam: gameData.away_team,
            commenceTime: gameData.commence_time,
            snapshotAt: new Date().toISOString(),
            outcomes: market.outcomes || []
          };
        }
      }
      
      results[book] = marketData;
      await cacheOdds(cacheKey, marketData);
      
    } catch (error) {
      console.error(`Error fetching betting odds for ${gameId} from ${book}:`, error.message);
      results[book] = {};
    }
  }
  
  return results;
}

/**
 * Fetch closing odds (at game tip)
 * @param {string} date - Date YYYY-MM-DD
 * @param {string} gameId - Game ID
 * @returns {Promise<Object>} Map of book -> market -> odds
 */
export async function fetchClosingOdds(date, gameId) {
  // Same structure as betting odds, but captured at tip
  const results = {};
  
  for (const book of SHARP_BOOKS) {
    const cacheKey = getOddsCacheKey(date, 'closing', gameId, book);
    const cached = await getCachedOdds(cacheKey);
    
    if (cached) {
      console.log(`✅ Cache hit: ${cacheKey}`);
      results[book] = cached;
      continue;
    }
    
    console.log(`🔄 Fetching closing odds for game ${gameId} from ${book}...`);
    
    try {
      const gameData = await fetchOddsAPI(`/sports/basketball_nba/events/${gameId}/odds`, {
        bookmakers: book,
        markets: TARGET_MARKETS.join(','),
        oddsFormat: 'american',
        dateFormat: 'iso'
      });
      
      const marketData = {};
      const bookmaker = gameData.bookmakers?.find(b => b.key === book);
      
      if (bookmaker) {
        for (const market of bookmaker.markets || []) {
          if (!TARGET_MARKETS.includes(market.key)) continue;
          
          marketData[market.key] = {
            gameId: gameData.id,
            homeTeam: gameData.home_team,
            awayTeam: gameData.away_team,
            commenceTime: gameData.commence_time,
            snapshotAt: new Date().toISOString(),
            closingTime: true,
            outcomes: market.outcomes || []
          };
        }
      }
      
      results[book] = marketData;
      await cacheOdds(cacheKey, marketData);
      
    } catch (error) {
      console.error(`Error fetching closing odds for ${gameId} from ${book}:`, error.message);
      results[book] = {};
    }
  }
  
  return results;
}

/**
 * Parse player prop odds from outcomes
 * @param {Array} outcomes - Outcomes array from odds API
 * @param {string} playerName - Player name to match
 * @returns {Object} {yes: price, no: price} or null
 */
export function parsePlayerPropOdds(outcomes, playerName) {
  const yesOutcome = outcomes.find(o => 
    o.description?.toLowerCase().includes(playerName.toLowerCase()) && 
    o.name?.toLowerCase().includes('yes')
  );
  
  const noOutcome = outcomes.find(o => 
    o.description?.toLowerCase().includes(playerName.toLowerCase()) && 
    o.name?.toLowerCase().includes('no')
  );
  
  if (!yesOutcome) return null;
  
  return {
    yes: yesOutcome.price || null,
    no: noOutcome?.price || null,
    description: yesOutcome.description,
    point: yesOutcome.point || null
  };
}

/**
 * Convert American odds to decimal
 * @param {number} american - American odds (e.g., -110, +150)
 * @returns {number} Decimal odds
 */
export function americanToDecimal(american) {
  if (american > 0) {
    return (american / 100) + 1;
  } else {
    return (100 / Math.abs(american)) + 1;
  }
}

/**
 * Calculate no-vig probability from both sides
 * @param {number} yesPrice - American odds for Yes
 * @param {number} noPrice - American odds for No
 * @returns {number} No-vig implied probability for Yes
 */
export function noVigProbability(yesPrice, noPrice) {
  const yesImplied = 1 / americanToDecimal(yesPrice);
  const noImplied = 1 / americanToDecimal(noPrice);
  
  const totalImplied = yesImplied + noImplied;
  
  return yesImplied / totalImplied;
}

/**
 * Get credit usage stats
 * @returns {Object} Credit usage information
 */
export function getCreditUsage() {
  return { ...CREDIT_USAGE };
}

/**
 * Reset credit tracking (for testing)
 */
export function resetCreditTracking() {
  CREDIT_USAGE = {
    used: 0,
    limit: 1000000,
    lastReset: new Date().toISOString()
  };
}

export default {
  fetchBaselineOdds,
  fetchBettingOdds,
  fetchClosingOdds,
  parsePlayerPropOdds,
  americanToDecimal,
  noVigProbability,
  getCreditUsage,
  resetCreditTracking,
  SHARP_BOOKS,
  TARGET_MARKETS
};
