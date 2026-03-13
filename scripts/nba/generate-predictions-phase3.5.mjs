#!/usr/bin/env node

/**
 * Phase 3.5 Production Prediction Generator
 * NBA Player Props - Mixed Logistic + LightGBM System
 * 
 * PURPOSE:
 * Generates daily NBA player prop predictions using the Phase 3.5 hybrid system:
 * - Logistic PRA for Assists (61% WR, +14.2% ROI)
 * - LightGBM for Points (58.7% WR, +10.3% ROI)
 * - LightGBM for Rebounds (54.2% WR, +1.1% ROI)
 * 
 * INPUTS:
 * - data/nba/player-boxscores-2025-26.json (current season player-game data)
 * - data/nba/models/phase3_model_registry.json (production model registry)
 * - data/nba/models/phase3/* (Logistic PRA models)
 * - data/nba/models/phase3_lgbm/* (LightGBM models)
 * - TheOddsAPI (live odds via ODDS_API_KEY env var)
 * 
 * OUTPUTS:
 * - public/data/nba/nba-props-v2-live.json (atomic write via .tmp)
 * 
 * DATA SAFETY:
 * - READ-ONLY on all input data files
 * - Atomic writes: always write to .tmp first, then rename
 * - No destructive edits to existing data
 * 
 * USAGE:
 *   export ODDS_API_KEY=your_key_here
 *   node scripts/nba/generate-predictions-phase3.5.mjs
 * 
 * REQUIREMENTS:
 * - Python 3 with lightgbm installed (for LightGBM models)
 * - Strict walkforward: only use games BEFORE target date for features
 * - No data leakage in rolling stat calculations
 */

import fs from 'fs';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

import { augmentLineAwareFeatures } from './_lib/line-feature-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import Phase 3.5 inference engine
import { createInferenceEngine } from '../../netlify/functions/_lib/nba-props-engine-v3.mjs';

// ====================================================================
// CONFIGURATION
// ====================================================================

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_SPORT = 'basketball_nba';
const ODDS_API_REGIONS = 'us';
const ODDS_API_MARKETS = 'player_points,player_rebounds,player_assists';
const ODDS_API_ODDS_FORMAT = 'american';

// Whitelist of allowed sportsbooks (case-insensitive matching)
const ALLOWED_BOOKS = [
  'betmgm',
  'caesars',
  'draftkings',
  'espnbet',
  'scorebet',
  'fanatics',
  'fanduel',
  'novig'
];

/**
 * Check if a bookmaker is in the allowed list
 * @param {string} bookmakerName - The bookmaker name from the API
 * @returns {boolean} - True if allowed, false otherwise
 */
function isAllowedBook(bookmakerName) {
  if (!bookmakerName) return false;
  const normalized = bookmakerName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALLOWED_BOOKS.some(allowed => normalized.includes(allowed));
}

// Output path (with atomic write)
const OUTPUT_DIR = path.join(__dirname, '../../public/data/nba');
const OUTPUT_FILE = 'nba-props-v2-live.json';
const OUTPUT_TMP = 'nba-props-v2-live.json.tmp';

const MODEL_VERSION_TAGS = {
  player_points: 'points_v1',
  player_rebounds: 'rebounds_v2',
  player_assists: 'assists_logistic'
};

// ====================================================================
// DATA LOADING
// ====================================================================

console.log('\n=== Phase 3.5 Production Prediction Generator ===');
console.log('Started:', new Date().toISOString());
console.log();

// Load current season boxscores
console.log('[1/6] Loading boxscore data...');
const boxscoresPath = path.join(__dirname, '../../data/nba/player-history-2024-2026.json');

if (!existsSync(boxscoresPath)) {
  console.error('❌ ERROR: Boxscores file not found:', boxscoresPath);
  console.error('Please ensure data/nba/player-history-2024-2026.json exists.');
  process.exit(1);
}

const allBoxscores = JSON.parse(readFileSync(boxscoresPath, 'utf-8'));

// Normalize date format: "Nov 25, 2025" → "2025-11-25"
allBoxscores.forEach(g => {
  if (g.gameDate && g.gameDate.includes(',')) {
    // Convert "Nov 25, 2025" to "2025-11-25"
    const d = new Date(g.gameDate);
    g.date = d.toISOString().split('T')[0];
  } else if (g.gameDate) {
    g.date = g.gameDate; // Already in correct format
  }
});

console.log(`✅ Loaded ${allBoxscores.length} player-game records`);
console.log(`   Data includes 2024-25 + 2025-26 seasons`);

// Build player → current team lookup (most recent game's teamTricode)
const playerTeamMap = new Map();
const sortedBoxscores = [...allBoxscores].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
for (const g of sortedBoxscores) {
  if (g.playerName && g.teamTricode) {
    playerTeamMap.set(g.playerName, g.teamTricode);
  }
}
console.log(`   Built player→team map: ${playerTeamMap.size} players`);

// Full team name → tricode mapping (Odds API uses full names)
const TEAM_FULL_TO_TRICODE = {
  'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'LA Clippers': 'LAC',
  'Memphis Grizzlies': 'MEM', 'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN', 'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC', 'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX', 'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS', 'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS',
};
// Reverse: tricode → full name  
const TEAM_TRICODE_TO_FULL = {};
for (const [full, tri] of Object.entries(TEAM_FULL_TO_TRICODE)) {
  TEAM_TRICODE_TO_FULL[tri] = full;
}
// Handle alternate tricodes that appear in boxscores (ESPN variants)
const NORMALIZE_TRICODE = {
  'GS': 'GSW', 'SA': 'SAS', 'NO': 'NOP', 'NY': 'NYK',
  'PHO': 'PHX', 'UTAH': 'UTA', 'WSH': 'WAS',
  // identity mappings
  'GSW': 'GSW', 'SAS': 'SAS', 'NOP': 'NOP', 'NYK': 'NYK',
  'PHX': 'PHX', 'UTA': 'UTA', 'WAS': 'WAS',
};
function normalizeTricode(tc) {
  return NORMALIZE_TRICODE[tc] || tc;
}

// Load inference engine
console.log('[2/6] Loading Phase 3.5 inference engine...');
const engine = await createInferenceEngine();
console.log(`✅ Loaded models:`, Object.keys(engine.loadedModels));

// ====================================================================
// FEATURE CALCULATION (STRICT WALKFORWARD - ZERO LEAKAGE)
// ====================================================================

/**
 * Get NBA season identifier from a date
 * NBA season runs Oct-Apr, e.g., "2023-24" for games from Oct 2023 to Apr 2024
 */
function getNBASeason(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  
  if (month >= 10) {
    // Oct-Dec: season is YYYY-(YYYY+1)
    return `${year}-${String(year + 1).slice(-2)}`;
  } else {
    // Jan-Sep: season is (YYYY-1)-YYYY
    return `${year - 1}-${String(year).slice(-2)}`;
  }
}

/**
 * Calculate rolling stats for a window
 */
function calculateRollingStats(games, window, stat) {
  if (games.length === 0) return 0;
  const windowGames = games.slice(-window);
  const sum = windowGames.reduce((acc, g) => acc + (g[stat] || 0), 0);
  return sum / windowGames.length;
}

/**
 * Calculate all 60 features for a player on a specific target date
 * Uses ONLY games before the target date (strict walkforward, zero leakage)
 * 
 * @param {string} playerName - Player name
 * @param {string} targetDate - Target date (YYYY-MM-DD)
 * @param {string} opponent - Opponent team abbreviation (for H2H stats)
 * @param {number} isHome - 1 if home game, 0 if away
 * @returns {Object} - Feature object with all 60 features
 */
function calculateFeatures(playerName, targetDate, opponent, isHome) {
  // Get all games for this player BEFORE target date, excluding DNP games (minutes = 0)
  const priorGames = allBoxscores
    .filter(g => {
      if (g.playerName !== playerName) return false;
      if (g.date >= targetDate) return false;
      // Exclude DNP games (player didn't play)
      const minutes = g.minutes || 0;
      if (minutes === 0 || minutes === '0') return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date)); // Chronological order

  if (priorGames.length === 0) {
    // DEBUG: Log first few failures to diagnose
    const allPlayerGames = allBoxscores.filter(g => g.playerName === playerName);
    if (Math.random() < 0.01) { // 1% sample
      console.log(`   DEBUG: No data for ${playerName} before ${targetDate}`);
      console.log(`   DEBUG: Total games for ${playerName}: ${allPlayerGames.length}`);
      if (allPlayerGames.length > 0) {
        const dates = allPlayerGames.map(g => g.date).sort();
        console.log(`   DEBUG: Date range: ${dates[0]} → ${dates[dates.length-1]}`);
      }
    }
    return null; // No historical data
  }

  const features = {
    home: isHome,
    games_played: priorGames.length
  };

  // Rolling windows: L5, L10, L20, L40 (full stat suite) + L999 (points/rebounds/assists/PRA only)
  const rollingWindows = [
    { label: 'L5', size: 5, includeMinutes: true, includeShooting: true },
    { label: 'L10', size: 10, includeMinutes: true, includeShooting: true },
    { label: 'L20', size: 20, includeMinutes: true, includeShooting: true },
    { label: 'L40', size: 40, includeMinutes: true, includeShooting: true },
    { label: 'L999', size: 999, includeMinutes: false, includeShooting: false }
  ];

  for (const { label, size, includeMinutes, includeShooting } of rollingWindows) {
    const windowGames = size === 999 ? priorGames : priorGames.slice(-size);
    const n = windowGames.length;

    if (n > 0) {
      features[`${label}_ppg`] = windowGames.reduce((sum, g) => sum + (g.points || 0), 0) / n;
      features[`${label}_rpg`] = windowGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n;
      features[`${label}_apg`] = windowGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n;
      features[`${label}_pra`] = windowGames.reduce((sum, g) => sum + ((g.points || 0) + (g.rebounds || 0) + (g.assists || 0)), 0) / n;

      if (includeMinutes) {
        features[`${label}_minutes`] = windowGames.reduce((sum, g) => sum + (g.minutes || 0), 0) / n;
      }

      if (includeShooting) {
        features[`${label}_fga`] = windowGames.reduce((sum, g) => sum + (g.fgAtt || g.fga || 0), 0) / n;
        features[`${label}_fta`] = windowGames.reduce((sum, g) => sum + (g.ftAtt || g.fta || 0), 0) / n;
      }
    } else {
      features[`${label}_ppg`] = 0;
      features[`${label}_rpg`] = 0;
      features[`${label}_apg`] = 0;
      features[`${label}_pra`] = 0;

      if (includeMinutes) {
        features[`${label}_minutes`] = 0;
      }

      if (includeShooting) {
        features[`${label}_fga`] = 0;
        features[`${label}_fta`] = 0;
      }
    }
  }

  // Season-to-date stats (current NBA season only, before target date)
  const targetSeason = getNBASeason(targetDate);
  const seasonGames = priorGames.filter(g => getNBASeason(g.date) === targetSeason);
  
  if (seasonGames.length > 0) {
    const n = seasonGames.length;
    features.season_games_played = n;
    features.season_ppg = seasonGames.reduce((sum, g) => sum + (g.points || 0), 0) / n;
    features.season_rpg = seasonGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n;
    features.season_apg = seasonGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n;
    features.season_pra = seasonGames.reduce((sum, g) => sum + ((g.points || 0) + (g.rebounds || 0) + (g.assists || 0)), 0) / n;
    features.season_minutes = seasonGames.reduce((sum, g) => sum + (g.minutes || 0), 0) / n;
    features.season_fga = seasonGames.reduce((sum, g) => sum + (g.fgAtt || g.fga || 0), 0) / n;
    features.season_fta = seasonGames.reduce((sum, g) => sum + (g.ftAtt || g.fta || 0), 0) / n;
  } else {
    features.season_games_played = 0;
    features.season_ppg = 0;
    features.season_rpg = 0;
    features.season_apg = 0;
    features.season_pra = 0;
    features.season_minutes = 0;
    features.season_fga = 0;
    features.season_fta = 0;
  }

  // Head-to-head stats (vs same opponent, current season only, before target date)
  const h2hGames = seasonGames.filter(g => g.opponent === opponent);
  
  if (h2hGames.length > 0) {
    const n = h2hGames.length;
    features.h2h_games_played = n;
    features.h2h_ppg = h2hGames.reduce((sum, g) => sum + (g.points || 0), 0) / n;
    features.h2h_rpg = h2hGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n;
    features.h2h_apg = h2hGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n;
    features.h2h_pra = h2hGames.reduce((sum, g) => sum + ((g.points || 0) + (g.rebounds || 0) + (g.assists || 0)), 0) / n;
    features.h2h_minutes = h2hGames.reduce((sum, g) => sum + (g.minutes || 0), 0) / n;
    features.h2h_fga = h2hGames.reduce((sum, g) => sum + (g.fgAtt || g.fga || 0), 0) / n;
    features.h2h_fta = h2hGames.reduce((sum, g) => sum + (g.ftAtt || g.fta || 0), 0) / n;
  } else {
    features.h2h_games_played = 0;
    features.h2h_ppg = 0;
    features.h2h_rpg = 0;
    features.h2h_apg = 0;
    features.h2h_pra = 0;
    features.h2h_minutes = 0;
    features.h2h_fga = 0;
    features.h2h_fta = 0;
  }

  // Opponent defense stats (L5 and L10 allowed to this position)
  // NOTE: This is a simplified version - you may want to enhance this
  // by loading actual defensive stats from a separate file
  const oppGames = allBoxscores.filter(g => 
    g.team === opponent && g.date < targetDate
  ).slice(-10);
  
  if (oppGames.length >= 5) {
    const L5_opp = oppGames.slice(-5);
    const n5 = L5_opp.length;
    features.opp_def_L5_ppg_allowed = L5_opp.reduce((sum, g) => sum + (g.points || 0), 0) / n5;
    features.opp_def_L5_rpg_allowed = L5_opp.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n5;
    features.opp_def_L5_apg_allowed = L5_opp.reduce((sum, g) => sum + (g.assists || 0), 0) / n5;
    features.opp_def_L5_pra_allowed = L5_opp.reduce((sum, g) => sum + ((g.points || 0) + (g.rebounds || 0) + (g.assists || 0)), 0) / n5;
    
    const n10 = oppGames.length;
    features.opp_def_L10_ppg_allowed = oppGames.reduce((sum, g) => sum + (g.points || 0), 0) / n10;
    features.opp_def_L10_rpg_allowed = oppGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n10;
    features.opp_def_L10_apg_allowed = oppGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n10;
    features.opp_def_L10_pra_allowed = oppGames.reduce((sum, g) => sum + ((g.points || 0) + (g.rebounds || 0) + (g.assists || 0)), 0) / n10;
  } else {
    features.opp_def_L5_ppg_allowed = 0;
    features.opp_def_L5_rpg_allowed = 0;
    features.opp_def_L5_apg_allowed = 0;
    features.opp_def_L5_pra_allowed = 0;
    features.opp_def_L10_ppg_allowed = 0;
    features.opp_def_L10_rpg_allowed = 0;
    features.opp_def_L10_apg_allowed = 0;
    features.opp_def_L10_pra_allowed = 0;
  }

  // Rest days (simplified - days since last game)
  if (priorGames.length > 0) {
    const lastGameDate = new Date(priorGames[priorGames.length - 1].date);
    const targetDateObj = new Date(targetDate);
    const restDays = Math.floor((targetDateObj - lastGameDate) / (1000 * 60 * 60 * 24));
    features.rest_days = restDays;
  } else {
    features.rest_days = 0;
  }

  return features;
}

/**
 * Calculate L5/L10/L20 hit rates vs a specific line
 * Shows how often player hit the line in the direction we're betting
 * 
 * @param {string} playerName - Player name
 * @param {string} market - Market type ('player_points', 'player_rebounds', 'player_assists')
 * @param {number} line - The betting line value
 * @param {string} targetDate - Target date (YYYY-MM-DD)
 * @param {string} side - 'over' or 'under' - which way we're betting
 * @returns {Object} - { L5_over_pct, L10_over_pct, L20_over_pct, L5_avg, L10_avg, L20_avg, L5_sample_size, L10_sample_size, L20_sample_size }
 */
function calculateLineHitRates(playerName, market, line, targetDate, side) {
  // Get stat field based on market
  const statField = market === 'player_points' ? 'points' :
                    market === 'player_rebounds' ? 'rebounds' : 'assists';
  
  // Get all games for this player BEFORE target date, excluding DNP games (minutes = 0)
  const priorGames = allBoxscores
    .filter(g => {
      if (g.playerName !== playerName) return false;
      if (g.date >= targetDate) return false;
      // Exclude DNP games (player didn't play)
      const minutes = g.minutes || 0;
      if (minutes === 0 || minutes === '0') return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date)); // Reverse chronological (most recent first)

  if (priorGames.length === 0) {
    return {
      L5_over_pct: null,
      L10_over_pct: null,
      L20_over_pct: null,
      L5_avg: null,
      L10_avg: null,
      L20_avg: null,
      L5_sample_size: 0,
      L10_sample_size: 0,
      L20_sample_size: 0
    };
  }

  const calcWindow = (games) => {
    if (games.length === 0) return { hitRate: null, avg: null, sampleSize: 0 };
    
    // Filter out DNP games (minutes = 0) and ensure stat value exists
    const validGames = games.filter(g => {
      const val = g[statField];
      const minutes = g.minutes || 0;
      // Exclude games where player didn't play (DNP/injury/rest)
      if (minutes === 0 || minutes === '0') return false;
      return val !== null && val !== undefined && !isNaN(val);
    });
    
    if (validGames.length === 0) return { hitRate: null, avg: null, sampleSize: 0 };
    
    // Count hits based on which side we're betting
    const hitCount = side.toLowerCase() === 'over' 
      ? validGames.filter(g => g[statField] > line).length
      : validGames.filter(g => g[statField] < line).length;
    
    const hitRate = hitCount / validGames.length;
    const avg = validGames.reduce((sum, g) => sum + g[statField], 0) / validGames.length;
    
    return {
      hitRate,
      avg: parseFloat(avg.toFixed(1)),
      sampleSize: validGames.length
    };
  };

  const L5 = calcWindow(priorGames.slice(0, 5));
  const L10 = calcWindow(priorGames.slice(0, 10));
  const L20 = calcWindow(priorGames.slice(0, 20));

  return {
    L5_over_pct: L5.hitRate,
    L10_over_pct: L10.hitRate,
    L20_over_pct: L20.hitRate,
    L5_avg: L5.avg,
    L10_avg: L10.avg,
    L20_avg: L20.avg,
    L5_sample_size: L5.sampleSize,
    L10_sample_size: L10.sampleSize,
    L20_sample_size: L20.sampleSize
  };
}

// ====================================================================
// ODDS API INTEGRATION
// ====================================================================

/**
 * Fetch live odds from TheOddsAPI
 * Uses event-specific endpoint: /events/{event_id}/odds (player props supported)
 * NOT /odds/ endpoint (player props NOT supported on that one)
 */
async function fetchOdds() {
  if (!ODDS_API_KEY) {
    console.warn('⚠️  ODDS_API_KEY not set, using historical test data');
    return loadHistoricalOdds();
  }

  try {
    // Step 1: Fetch list of upcoming events
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/${ODDS_API_SPORT}/events?apiKey=${ODDS_API_KEY}`;
    const events = await fetchJSON(eventsUrl);
    
    if (!Array.isArray(events) || events.length === 0) {
      console.warn('⚠️  No upcoming games found, using historical test data');
      return loadHistoricalOdds();
    }
    
    console.log(`   Found ${events.length} upcoming games`);
    
    // Step 2: Fetch player props for each event (using event-specific endpoint)
    console.log(`   Fetching player props for each game...`);
    const allEvents = [];
    let fetchCount = 0;
    for (const event of events) {
      const oddsUrl = `https://api.the-odds-api.com/v4/sports/${ODDS_API_SPORT}/events/${event.id}/odds?` +
        `apiKey=${ODDS_API_KEY}&` +
        `regions=${ODDS_API_REGIONS}&` +
        `markets=${ODDS_API_MARKETS}&` +
        `oddsFormat=${ODDS_API_ODDS_FORMAT}`;
      
      try {
        fetchCount++;
        process.stdout.write(`\r   [${fetchCount}/${events.length}] Fetching ${event.home_team} vs ${event.away_team}...`);
        const eventOdds = await fetchJSON(oddsUrl);
        if (eventOdds && eventOdds.bookmakers) {
          allEvents.push(eventOdds);
        }
        // Small delay to be respectful to API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.warn(`\n   Skipping ${event.home_team} vs ${event.away_team}: ${err.message}`);
      }
    }
    console.log(''); // New line after progress
    
    if (allEvents.length === 0) {
      console.warn('⚠️  No player props found, using historical test data');
      return loadHistoricalOdds();
    }
    
    return allEvents;
    
  } catch (err) {
    console.warn(`⚠️  API request failed: ${err.message}`);
    console.warn('   Falling back to historical test data...');
    return loadHistoricalOdds();
  }
}

/**
 * Helper to fetch and parse JSON from a URL
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error_code || parsed.message) {
            reject(new Error(parsed.message || 'API error'));
          } else {
            resolve(parsed);
          }
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${err.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Load most recent historical odds file for testing
 */
function loadHistoricalOdds() {
  const oddsDir = path.join(__dirname, '../../data/nba/historical_odds');
  const files = fs.readdirSync(oddsDir)
    .filter(f => f.startsWith('nba_props_') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    throw new Error('No historical odds files found');
  }
  
  const testFile = path.join(oddsDir, files[0]);
  console.log(`   Using test data: ${files[0]}`);
  
  const data = JSON.parse(fs.readFileSync(testFile, 'utf8'));
  return data; // Returns { events: [...] } format
}

/**
 * Parse odds API response into normalized prop bets
 * Groups by player/market/line and finds BEST odds for each side
 */
function parseOdds(oddsData) {
  // Handle both new API format (events array) and old format (bookmakers array)
  const events = Array.isArray(oddsData) ? oddsData : (oddsData.events || []);
  
  // Map to store best odds: key = "player|market|line|side"
  const bestOddsMap = new Map();
  
  // Track unique sportsbooks seen (for logging)
  const booksSeenSet = new Set();
  const booksFilteredSet = new Set();

  for (const event of events) {
    const { home_team, away_team, commence_time, bookmakers, markets } = event;

    // Handle two possible formats:
    // 1. event.bookmakers[].markets[] (TheOddsAPI format)
    // 2. event.markets.player_points[] (our historical format)
    
    if (bookmakers) {
      // TheOddsAPI format
      for (const bookmaker of bookmakers) {
        booksSeenSet.add(bookmaker.title);
        
        // Filter to only allowed sportsbooks
        if (!isAllowedBook(bookmaker.title)) {
          booksFilteredSet.add(bookmaker.title);
          continue;
        }
        
        for (const market of bookmaker.markets) {
          const marketKey = market.key; // 'player_points', 'player_rebounds', 'player_assists'

          for (const outcome of market.outcomes) {
            // TheOddsAPI format: name=side, description=player (opposite of what you'd expect!)
            const { name: side, description: playerName, price: odds, point: line } = outcome;
            
            const key = `${playerName}|${marketKey}|${line}|${side}`;
            const existing = bestOddsMap.get(key);
            
            // Keep the bet with the best odds (most favorable for bettor)
            if (!existing || odds > existing.odds) {
              bestOddsMap.set(key, {
                player: playerName,
                market: marketKey,
                side: side, // 'Over' or 'Under'
                line: parseFloat(line),
                odds: parseInt(odds),
                bookmaker: bookmaker.title,
                home_team,
                away_team,
                commence_time
              });
            }
          }
        }
      }
    } else if (markets) {
      // Historical format: markets.player_points[], markets.player_rebounds[], etc.
      for (const [marketKey, outcomes] of Object.entries(markets)) {
        if (!marketKey.startsWith('player_')) continue;
        
        for (const outcome of outcomes) {
          const { player: playerName, side, line, odds, bookmaker } = outcome;
          
          if (bookmaker) booksSeenSet.add(bookmaker);
          
          // Filter to only allowed sportsbooks
          if (!isAllowedBook(bookmaker)) {
            if (bookmaker) booksFilteredSet.add(bookmaker);
            continue;
          }
          
          const key = `${playerName}|${marketKey}|${line}|${side}`;
          const existing = bestOddsMap.get(key);
          
          // Keep the bet with the best odds (most favorable for bettor)
          if (!existing || odds > existing.odds) {
            bestOddsMap.set(key, {
              player: playerName,
              market: marketKey,
              side: side, // 'Over' or 'Under'
              line: parseFloat(line),
              odds: parseInt(odds),
              bookmaker: bookmaker,
              home_team,
              away_team,
              commence_time
            });
          }
        }
      }
    }
  }
  
  // Log sportsbook filtering stats
  const booksUsed = Array.from(booksSeenSet).filter(book => !booksFilteredSet.has(book));
  const booksFiltered = Array.from(booksFilteredSet);
  
  console.log(`   📚 Sportsbooks: ${booksUsed.length} used, ${booksFiltered.length} filtered`);
  if (booksUsed.length > 0) {
    console.log(`      ✅ Used: ${booksUsed.join(', ')}`);
  }
  if (booksFiltered.length > 0) {
    console.log(`      ❌ Filtered: ${booksFiltered.join(', ')}`);
  }

  return Array.from(bestOddsMap.values());
}

function computeMarketBreakdown(picks) {
  return picks.reduce((acc, pick) => {
    const market = pick.propType;
    acc[market] = (acc[market] || 0) + 1;
    return acc;
  }, { points: 0, rebounds: 0, assists: 0 });
}

function oddsToImpliedProbability(odds) {
  const american = Number(odds);
  if (!Number.isFinite(american) || american === 0) return 0.5;
  if (american > 0) {
    return 100 / (american + 100);
  }
  return -american / (-american + 100);
}

function canonicalizePicks(picks) {
  const grouped = new Map();

  for (const pick of picks) {
    const key = `${pick.player}|${pick.propType}|${pick.betSide}`;
    const edgeValue = Number(pick.edge);
    if (!Number.isFinite(edgeValue) || edgeValue <= 0) continue;

    const lineValue = Number(pick.vegasLine);
    const impliedProbability = oddsToImpliedProbability(pick.odds);
    const closenessToMain = Math.abs(impliedProbability - 0.5);
    const existing = grouped.get(key);

    const shouldReplace =
      !existing ||
      closenessToMain < existing.closeness ||
      (closenessToMain === existing.closeness && edgeValue > existing.edge) ||
      (closenessToMain === existing.closeness && edgeValue === existing.edge && lineValue > existing.line);

    if (shouldReplace) {
      grouped.set(key, { edge: edgeValue, line: lineValue, closeness: closenessToMain, pick });
    }
  }

  return Array.from(grouped.values()).map(entry => entry.pick);
}

function calculateKellyUnits(probability, odds, bankrollUnits = 400, maxUnits = 6) {
  const p = Number(probability) || 0;
  const american = Number(odds) || 0;
  const decimalOdds = american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american || 1);
  const b = decimalOdds - 1;
  if (b <= 0) {
    return { units: 0, fraction: 0 };
  }
  const k = p - ((1 - p) / b);
  const stakeFraction = Math.max(0, k);
  const unitsRaw = stakeFraction * bankrollUnits;
  const capped = Math.min(unitsRaw, maxUnits);
  const rounded = Math.round(capped * 10) / 10;
  return { units: rounded, fraction: stakeFraction };
}

// ====================================================================
// PREDICTION GENERATION
// ====================================================================

console.log('[3/6] Fetching live odds from TheOddsAPI...');
const oddsData = await fetchOdds();
console.log(`✅ Fetched odds for ${oddsData.length} games`);

console.log('[4/6] Parsing odds into prop bets...');
const allProps = parseOdds(oddsData);
console.log(`✅ Found ${allProps.length} total prop bets`);

console.log('[5/6] Generating predictions...');
const predictions = [];
const errors = [];
const skipped = { noFeatures: 0, lowConfidence: 0 };
const today = new Date().toISOString().split('T')[0];

for (const prop of allProps) {
  try {
    const { player, market, side, line, odds, bookmaker, home_team, away_team, commence_time } = prop;

    // Determine player's actual team from boxscore history
    const playerTricode = normalizeTricode(playerTeamMap.get(player) || '');
    const homeTricode = normalizeTricode(TEAM_FULL_TO_TRICODE[home_team] || '');
    const awayTricode = normalizeTricode(TEAM_FULL_TO_TRICODE[away_team] || '');

    // Determine if player is home or away
    let isHome;
    let team, opponent;
    if (playerTricode && playerTricode === homeTricode) {
      isHome = 1;
      team = home_team;
      opponent = away_team;
    } else if (playerTricode && playerTricode === awayTricode) {
      isHome = 0;
      team = away_team;
      opponent = home_team;
    } else {
      // Fallback: can't determine — default to away (conservative)
      isHome = 0;
      team = away_team;
      opponent = home_team;
    }

    // Calculate features (walkforward, zero leakage)
    // opponent param must be a tricode for H2H lookups against boxscore data
    const opponentTricode = isHome === 1 ? awayTricode : homeTricode;
    const features = calculateFeatures(player, today, opponentTricode, isHome);

    if (!features) {
      // No historical data for this player
      skipped.noFeatures++;
      continue;
    }

  // Add the line value and derived line-awareness features
  features.line = line;
  augmentLineAwareFeatures(features, market, line);

  // Predict using Phase 3.5 engine (engine normalizes per-model)
  const result = await engine.predict(market, features, line, odds, side);

    // Only include picks that meet threshold
    if (!result.meetsThreshold) {
      skipped.lowConfidence++;
      continue;
    }

    const { units: kellyUnits, fraction: kellyFraction } = calculateKellyUnits(result.prob_win, odds);

    // Calculate L5/L10/L20 hit rates vs this line (based on predicted side)
    const hitRates = calculateLineHitRates(player, market, line, today, side);

    // Add to predictions
    predictions.push({
      player,
      team,
      opponent,
      propType: market.replace('player_', ''),
      prediction: result.prob_win,
      modelProbability: result.prob_win, // For frontend compatibility
      vegasLine: line,
      betSide: side.toUpperCase(),
      edge: result.edge * 100, // Convert to percentage, keep as number
      confidence: Math.round(result.prob_win * 100),
      odds,
      book: bookmaker,
      game: `${away_team} @ ${home_team}`,
      gameTime: commence_time,
      model: result.use_this_model,
      threshold: result.threshold,
      kellyStake: kellyUnits,
      kellyFraction,
      modelVersion: MODEL_VERSION_TAGS[market] || result.use_this_model,
      // Hit rates: L5/L10/L20 hit rates and averages vs this specific line and side
      hitRates: {
        L5_hitRate: hitRates.L5_over_pct !== null ? parseFloat((hitRates.L5_over_pct * 100).toFixed(1)) : null,
        L5_avg: hitRates.L5_avg,
        L5_games: hitRates.L5_sample_size,
        L10_hitRate: hitRates.L10_over_pct !== null ? parseFloat((hitRates.L10_over_pct * 100).toFixed(1)) : null,
        L10_avg: hitRates.L10_avg,
        L10_games: hitRates.L10_sample_size,
        L20_hitRate: hitRates.L20_over_pct !== null ? parseFloat((hitRates.L20_over_pct * 100).toFixed(1)) : null,
        L20_avg: hitRates.L20_avg,
        L20_games: hitRates.L20_sample_size
      },
      // Legacy fields for backward compatibility
      L5_over_pct: hitRates.L5_over_pct,
      L10_over_pct: hitRates.L10_over_pct,
      L5_sample_size: hitRates.L5_sample_size,
      L10_sample_size: hitRates.L10_sample_size
    });

  } catch (err) {
    errors.push({
      prop,
      error: err.message
    });
  }
}

console.log(`✅ Generated ${predictions.length} predictions (${errors.length} errors)`);
console.log(`   Skipped: ${skipped.noFeatures} (no historical data), ${skipped.lowConfidence} (below threshold)`);

if (errors.length > 0) {
  console.log(`\n⚠️  ${errors.length} errors during prediction. Sample errors:`);
  errors.slice(0, 5).forEach(e => console.log(`  - ${e.prop.player} ${e.prop.market}: ${e.error}`));
  if (errors.length > 5) {
    console.log(`  ... and ${errors.length - 5} more errors`);
  }
}

const rawMarketBreakdown = computeMarketBreakdown(predictions);
const canonicalPicks = canonicalizePicks(predictions);
const canonicalMarketBreakdown = computeMarketBreakdown(canonicalPicks);

console.log('\n📊 Raw summary');
console.log(`   Props parsed: ${allProps.length}`);
console.log(`   Raw picks: ${predictions.length} (points: ${rawMarketBreakdown.points}, rebounds: ${rawMarketBreakdown.rebounds}, assists: ${rawMarketBreakdown.assists})`);
console.log('📉 Canonical summary');
console.log(`   Canonical picks: ${canonicalPicks.length} (points: ${canonicalMarketBreakdown.points}, rebounds: ${canonicalMarketBreakdown.rebounds}, assists: ${canonicalMarketBreakdown.assists})`);

// ====================================================================
// OUTPUT GENERATION (ATOMIC WRITE)
// ====================================================================

console.log('[6/6] Writing output file...');

const output = {
  generated_at: new Date().toISOString(),
  model_version: 'nba_phase3.5_mixed_logistic_lgbm_v1_20251125',
  source: 'Phase 3.5: Logistic PRA + LightGBM per-market',
  filters: {
    assists_prob_min: 0.534,
    points_prob_min: 0.57,
    rebounds_prob_min: 0.535
  },
  picks: canonicalPicks,
  stats: {
    total_picks: canonicalPicks.length,
    by_market: {
      points: canonicalMarketBreakdown.points,
      rebounds: canonicalMarketBreakdown.rebounds,
      assists: canonicalMarketBreakdown.assists
    },
    errors: errors.length
  }
};

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Atomic write: write to .tmp first, then rename
const tmpPath = path.join(OUTPUT_DIR, OUTPUT_TMP);
const finalPath = path.join(OUTPUT_DIR, OUTPUT_FILE);

writeFileSync(tmpPath, JSON.stringify(output, null, 2));
renameSync(tmpPath, finalPath);

console.log(`✅ Output written to: ${finalPath}`);
console.log('\n=== Generation Complete ===');
console.log('Raw picks:', predictions.length);
console.log('Canonical picks:', canonicalPicks.length);
console.log('  - Assists:', output.stats.by_market.assists);
console.log('  - Points:', output.stats.by_market.points);
console.log('  - Rebounds:', output.stats.by_market.rebounds);
console.log('Finished:', new Date().toISOString());
console.log();
