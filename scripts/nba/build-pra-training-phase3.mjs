#!/usr/bin/env node

/**
 * NBA PRA Training Table Builder - PHASE 3 MULTI-SEASON
 * 
 * Builds comprehensive training dataset with:
 * - 2023-24 and 2024-25 season player logs
 * - Phase 3 historical odds (610 games, 75 dates)
 * - Temporal features with LEAK PREVENTION
 * - Rolling averages (past-5, past-10, season)
 * - Opponent defense stats
 * - Rest-day features
 * - Minutes-based segments
 * 
 * Output: data/nba/features/pra/training_multi_season_phase3.jsonl
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DATA_DIR = path.join(__dirname, '../../data/nba');
const PLAYER_LOGS_DIR = path.join(DATA_DIR, 'player-logs');
const ODDS_FILE = path.join(DATA_DIR, 'odds-sample-multi-season-phase3.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'features/pra/training_multi_season_phase3.jsonl');

const SEASONS = ['2023-24', '2024-25'];
const MIN_GAMES_FOR_ROLLING = 5; // Need 5 games before we can compute rolling stats

console.log('🏀 NBA PRA TRAINING TABLE BUILDER - PHASE 3 MULTI-SEASON');
console.log('═'.repeat(70));
console.log(`Seasons: ${SEASONS.join(', ')}`);
console.log(`Odds file: ${ODDS_FILE}`);
console.log(`Output: ${OUTPUT_FILE}\n`);

/**
 * Load all player logs from both seasons
 */
function loadPlayerLogs() {
  console.log('📂 Loading player logs...');
  const allLogs = [];
  
  for (const season of SEASONS) {
    const seasonDir = path.join(PLAYER_LOGS_DIR, season);
    if (!fs.existsSync(seasonDir)) {
      console.log(`  ⚠️  Season ${season} directory not found, skipping`);
      continue;
    }
    
    const files = fs.readdirSync(seasonDir).filter(f => f.endsWith('.json'));
    console.log(`  ${season}: ${files.length} player files`);
    
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(seasonDir, file), 'utf-8'));
        const games = data.games || [];
        
        for (const game of games) {
          // Parse game date from ISO string to YYYY-MM-DD
          const gameDate = game.date ? game.date.split('T')[0] : null;
          if (!gameDate) continue;
          
          // Determine if home or away
          const matchup = game.home ? `${game.team} vs. ${game.opponent}` : `${game.team} @ ${game.opponent}`;
          
          allLogs.push({
            player_id: data.playerId || file.split('_')[0],
            player_name: data.playerName || file.split('_').slice(1).join('_').replace('.json', ''),
            team_abbr: game.team,
            game_id: game.gameId,
            game_date: gameDate,
            matchup: matchup,
            wl: null, // Not available in this format
            min: parseFloat(game.minutes) || 0,
            // Basic stats available
            pts: parseInt(game.points) || 0,
            reb: parseInt(game.rebounds) || 0,
            ast: parseInt(game.assists) || 0,
            // Extended stats (may not be present in all files)
            fgm: parseInt(game.fgm) || 0,
            fga: parseInt(game.fga) || 0,
            fg_pct: game.fga > 0 ? (game.fgm / game.fga) : 0,
            fg3m: parseInt(game.fg3m) || 0,
            fg3a: parseInt(game.fg3a) || 0,
            fg3_pct: game.fg3a > 0 ? (game.fg3m / game.fg3a) : 0,
            ftm: parseInt(game.ftm) || 0,
            fta: parseInt(game.fta) || 0,
            ft_pct: game.fta > 0 ? (game.ftm / game.fta) : 0,
            oreb: parseInt(game.oreb) || 0,
            dreb: parseInt(game.dreb) || 0,
            stl: parseInt(game.steals) || 0,
            blk: parseInt(game.blocks) || 0,
            tov: parseInt(game.turnovers) || 0,
            pf: parseInt(game.fouls) || 0,
            plus_minus: parseFloat(game.plusMinus) || 0,
            season: season
          });
        }
      } catch (e) {
        console.log(`    ⚠️  Error loading ${file}: ${e.message}`);
      }
    }
  }
  
  console.log(`  ✅ Total logs loaded: ${allLogs.length.toLocaleString()}\n`);
  return allLogs;
}

/**
 * Parse game date to YYYY-MM-DD format
 */
function parseGameDate(dateStr) {
  // Input: "NOV 20, 2023" or "2023-11-20"
  if (dateStr.includes('-')) return dateStr;
  
  const months = {
    'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
    'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
    'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
  };
  
  const parts = dateStr.split(' ');
  if (parts.length !== 3) return null;
  
  const month = months[parts[0].toUpperCase()];
  const day = parts[1].replace(',', '').padStart(2, '0');
  const year = parts[2];
  
  return month ? `${year}-${month}-${day}` : null;
}

/**
 * Extract opponent from matchup string
 */
function getOpponent(matchup, team) {
  // matchup: "BOS vs. NYK" or "BOS @ NYK"
  const parts = matchup.split(/ vs\. | @ /);
  if (parts.length !== 2) return null;
  return parts[0] === team ? parts[1] : parts[0];
}

/**
 * Normalize market key from API format to internal format
 * (Phase 2.5 compatibility)
 */
function mapMarketKey(raw) {
  switch (raw) {
    case 'player_points':
    case 'points':
      return 'points';
    case 'player_rebounds':
    case 'rebounds':
      return 'rebounds';
    case 'player_assists':
    case 'assists':
      return 'assists';
    default:
      return null;
  }
}

/**
 * Build composite odds key with lowercase player name
 * (Phase 2.5 compatibility)
 */
function buildOddsKey(date, playerName, market) {
  return `${date}|${playerName.toLowerCase()}|${market}`;
}

/**
 * Lookup odds for a player on a specific date
 * (Phase 2.5 compatibility)
 */
function lookupOdds(oddsIndex, gameDate, playerName) {
  if (!oddsIndex || !oddsIndex.size) return null;
  
  const pointsKey = buildOddsKey(gameDate, playerName, 'points');
  const reboundsKey = buildOddsKey(gameDate, playerName, 'rebounds');
  const assistsKey = buildOddsKey(gameDate, playerName, 'assists');
  
  const points = oddsIndex.get(pointsKey);
  const rebounds = oddsIndex.get(reboundsKey);
  const assists = oddsIndex.get(assistsKey);
  
  if (!points && !rebounds && !assists) return null;
  
  return {
    points_line: points?.points ?? null,
    points_over: points?.points_over ?? null,
    points_under: points?.points_under ?? null,
    rebounds_line: rebounds?.rebounds ?? null,
    rebounds_over: rebounds?.rebounds_over ?? null,
    rebounds_under: rebounds?.rebounds_under ?? null,
    assists_line: assists?.assists ?? null,
    assists_over: assists?.assists_over ?? null,
    assists_under: assists?.assists_under ?? null,
    book: points?.book || rebounds?.book || assists?.book || null,
  };
}

/**
 * Load Phase 3 odds with Phase 2.5-compatible structure
 * Uses FLAT MAP with composite keys and lowercase player names
 */
function loadOdds() {
  console.log('💰 Loading Phase 3 odds...');
  
  if (!fs.existsSync(ODDS_FILE)) {
    console.error(`  ❌ Odds file not found: ${ODDS_FILE}`);
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(ODDS_FILE, 'utf-8'));
  console.log(`  Games in odds file: ${data.length}`);
  
  // Build FLAT odds index with composite keys (Phase 2.5 style)
  // Key format: "YYYY-MM-DD|playername|market"
  const oddsIndex = new Map();
  
  for (const game of data) {
    const gameDate = game.date;
    if (!gameDate) continue;
    
    const bookmakers = game.odds?.bookmakers || [];
    
    for (const bookmaker of bookmakers) {
      const bookKey = bookmaker.key || 'unknown';
      const markets = bookmaker.markets || [];
      
      for (const market of markets) {
        // Normalize market key: "player_points" -> "points"
        const mapped = mapMarketKey(market.key);
        if (!mapped) continue;
        
        const outcomes = market.outcomes || [];
        
        // Group outcomes by player (Over/Under pairs)
        const playerOdds = new Map();
        for (const outcome of outcomes) {
          const playerName = (outcome.description || '').trim();
          if (!playerName) continue;
          
          const line = outcome.point ?? null;
          const price = outcome.price ?? null;
          const direction = outcome.name; // "Over" or "Under"
          
          if (line === null || price === null) continue;
          
          if (!playerOdds.has(playerName)) {
            playerOdds.set(playerName, { line, over: null, under: null });
          }
          
          const po = playerOdds.get(playerName);
          if (direction === 'Over') po.over = price;
          if (direction === 'Under') po.under = price;
        }
        
        // Store in odds index (only first bookmaker)
        for (const [playerName, odds] of playerOdds.entries()) {
          const oddsKey = buildOddsKey(gameDate, playerName, mapped);
          
          if (!oddsIndex.has(oddsKey)) {
            oddsIndex.set(oddsKey, {
              [mapped]: odds.line,  // Store line
              [`${mapped}_over`]: odds.over,  // Store Over price
              [`${mapped}_under`]: odds.under,  // Store Under price
              book: bookKey,
              updatedAt: bookmaker.last_update || null,
            });
          }
        }
      }
    }
  }
  
  console.log(`  Unique odds entries (player-date-market): ${oddsIndex.size}`);
  console.log(`  Expected ~62k entries for Phase 3 dataset`);
  console.log(`  ✅ Odds index built\n`);
  
  return oddsIndex;
}

/**
 * Compute rolling averages (LEAK-SAFE: only use games BEFORE current game)
 */
function computeRollingStats(logs, currentIndex, windows = [5, 10, 999]) {
  const current = logs[currentIndex];
  const currentDate = parseGameDate(current.game_date);
  
  // Get all prior games for this player (BEFORE current game date)
  const priorGames = logs
    .filter((log, idx) => {
      if (idx >= currentIndex) return false; // Don't include current or future
      if (log.player_id !== current.player_id) return false;
      const logDate = parseGameDate(log.game_date);
      return logDate < currentDate; // Only STRICTLY BEFORE
    })
    .sort((a, b) => {
      const dateA = parseGameDate(a.game_date);
      const dateB = parseGameDate(b.game_date);
      return dateA.localeCompare(dateB);
    });
  
  const stats = {};
  
  for (const window of windows) {
    const windowGames = priorGames.slice(-window);
    const n = windowGames.length;
    
    if (n === 0) {
      stats[`pts_L${window}`] = null;
      stats[`reb_L${window}`] = null;
      stats[`ast_L${window}`] = null;
      stats[`min_L${window}`] = null;
      continue;
    }
    
    stats[`pts_L${window}`] = windowGames.reduce((sum, g) => sum + g.pts, 0) / n;
    stats[`reb_L${window}`] = windowGames.reduce((sum, g) => sum + g.reb, 0) / n;
    stats[`ast_L${window}`] = windowGames.reduce((sum, g) => sum + g.ast, 0) / n;
    stats[`min_L${window}`] = windowGames.reduce((sum, g) => sum + g.min, 0) / n;
  }
  
  stats.games_played = priorGames.length;
  
  return stats;
}

/**
 * Compute opponent defense stats (LEAK-SAFE: only use games BEFORE current game)
 */
function computeOpponentDefense(logs, currentIndex) {
  const current = logs[currentIndex];
  const currentDate = parseGameDate(current.game_date);
  const opponent = getOpponent(current.matchup, current.team_abbr);
  
  if (!opponent) return { opp_pts_allowed: null, opp_reb_allowed: null, opp_ast_allowed: null };
  
  // Get all games where opponent played BEFORE current date
  const oppGames = logs.filter(log => {
    const logDate = parseGameDate(log.game_date);
    if (logDate >= currentDate) return false; // Only before
    
    // Check if this opponent was in the game
    const logOpp = getOpponent(log.matchup, log.team_abbr);
    return logOpp === opponent || log.team_abbr === opponent;
  });
  
  const n = oppGames.length;
  if (n === 0) return { opp_pts_allowed: null, opp_reb_allowed: null, opp_ast_allowed: null };
  
  return {
    opp_pts_allowed: oppGames.reduce((sum, g) => sum + g.pts, 0) / n,
    opp_reb_allowed: oppGames.reduce((sum, g) => sum + g.reb, 0) / n,
    opp_ast_allowed: oppGames.reduce((sum, g) => sum + g.ast, 0) / n
  };
}

/**
 * Compute rest days (LEAK-SAFE)
 */
function computeRestDays(logs, currentIndex) {
  const current = logs[currentIndex];
  const currentDate = new Date(parseGameDate(current.game_date));
  
  // Find previous game for this player
  const priorGames = logs
    .filter((log, idx) => {
      if (idx >= currentIndex) return false;
      if (log.player_id !== current.player_id) return false;
      const logDate = parseGameDate(log.game_date);
      return logDate < parseGameDate(current.game_date);
    })
    .sort((a, b) => {
      const dateA = parseGameDate(a.game_date);
      const dateB = parseGameDate(b.game_date);
      return dateB.localeCompare(dateA); // Descending
    });
  
  if (priorGames.length === 0) return null;
  
  const lastGameDate = new Date(parseGameDate(priorGames[0].game_date));
  const diffMs = currentDate - lastGameDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

/**
 * Build training table
 */
function buildTrainingTable() {
  const logs = loadPlayerLogs();
  const oddsIndex = loadOdds();
  
  // Sort logs chronologically (CRITICAL for leak prevention)
  logs.sort((a, b) => {
    const dateA = parseGameDate(a.game_date);
    const dateB = parseGameDate(b.game_date);
    return dateA.localeCompare(dateB);
  });
  
  console.log('🔨 Building training table with temporal features...');
  console.log('  (This may take a few minutes for rolling calculations)\n');
  
  const trainingData = [];
  let withOdds = 0;
  let withoutOdds = 0;
  
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const gameDate = parseGameDate(log.game_date);
    
    if (!gameDate) continue;
    if (log.min < 1) continue; // Skip DNPs
    
    // Progress indicator
    if ((i + 1) % 5000 === 0) {
      console.log(`  Processed ${(i + 1).toLocaleString()} / ${logs.length.toLocaleString()} logs...`);
    }
    
    // Compute temporal features (LEAK-SAFE)
    const rolling = computeRollingStats(logs, i);
    
    // Skip if not enough history
    if (rolling.games_played < MIN_GAMES_FOR_ROLLING) continue;
    
    const oppDef = computeOpponentDefense(logs, i);
    const restDays = computeRestDays(logs, i);
    
    // Base features
    const features = {
      player_id: log.player_id,
      player_name: log.player_name,
      team: log.team_abbr,
      opponent: getOpponent(log.matchup, log.team_abbr),
      game_id: log.game_id,
      game_date: gameDate,
      season: log.season,
      
      // Actuals
      min: log.min,
      pts: log.pts,
      reb: log.reb,
      ast: log.ast,
      
      // Rolling features
      ...rolling,
      
      // Opponent defense
      ...oppDef,
      
      // Rest
      rest_days: restDays,
      
      // Minutes segment
      min_segment: log.min < 15 ? 'bench' :
                   log.min < 25 ? 'rotation' :
                   log.min < 33 ? 'starter' : 'star'
    };
    
    // Try to join with odds using Phase 2.5-compatible lookup
    const odds = lookupOdds(oddsIndex, gameDate, log.player_name);
    
    if (odds) {
      // Add odds lines and prices to features
      features.pts_line = odds.points_line;
      features.pts_over_odds = odds.points_over;
      features.pts_under_odds = odds.points_under;
      features.reb_line = odds.rebounds_line;
      features.reb_over_odds = odds.rebounds_over;
      features.reb_under_odds = odds.rebounds_under;
      features.ast_line = odds.assists_line;
      features.ast_over_odds = odds.assists_over;
      features.ast_under_odds = odds.assists_under;
      features.odds_book = odds.book;
      
      // Add to training data
      trainingData.push(features);
      withOdds++;
    } else {
      // No odds found - exclude from training data
      withoutOdds++;
    }
  }
  
  console.log('\n✅ Training table built!');
  console.log(`  Total rows: ${trainingData.length.toLocaleString()}`);
  console.log(`  With odds: ${withOdds.toLocaleString()}`);
  console.log(`  Without odds (excluded): ${withoutOdds.toLocaleString()}`);
  console.log(`  Join rate: ${((withOdds / (withOdds + withoutOdds)) * 100).toFixed(1)}%\n`);
  
  return trainingData;
}

/**
 * Save training data as JSONL
 */
function saveTrainingData(data) {
  console.log('💾 Saving training data...');
  
  // Ensure directory exists
  const dir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Write as JSONL
  const lines = data.map(row => JSON.stringify(row)).join('\n');
  fs.writeFileSync(OUTPUT_FILE, lines);
  
  const fileSize = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`  ✅ Saved to: ${OUTPUT_FILE}`);
  console.log(`  File size: ${fileSize} MB\n`);
  
  // Print summary stats
  const uniquePlayers = new Set(data.map(r => r.player_name)).size;
  const uniqueDates = new Set(data.map(r => r.game_date)).size;
  const seasons = new Set(data.map(r => r.season));
  
  console.log('📊 Dataset Summary:');
  console.log(`  Unique players: ${uniquePlayers}`);
  console.log(`  Unique dates: ${uniqueDates}`);
  console.log(`  Seasons: ${Array.from(seasons).join(', ')}`);
  console.log(`  Avg rows per player: ${(data.length / uniquePlayers).toFixed(1)}`);
  
  // Sample rows
  console.log('\n📋 Sample rows:');
  for (let i = 0; i < Math.min(3, data.length); i++) {
    const row = data[i];
    console.log(`  ${i + 1}. ${row.player_name} (${row.team}) vs ${row.opponent} on ${row.game_date}`);
    console.log(`     ${row.pts} pts (line: ${row.pts_line}), ${row.reb} reb (line: ${row.reb_line}), ${row.ast} ast (line: ${row.ast_line})`);
    console.log(`     L5: ${row.pts_L5?.toFixed(1)} pts, ${row.reb_L5?.toFixed(1)} reb, ${row.ast_L5?.toFixed(1)} ast\n`);
  }
}

/**
 * Main execution
 */
function main() {
  console.log('Starting Phase 3 training table build...\n');
  
  const trainingData = buildTrainingTable();
  
  if (trainingData.length === 0) {
    console.error('❌ No training data generated! Check your data sources.');
    process.exit(1);
  }
  
  saveTrainingData(trainingData);
  
  console.log('═'.repeat(70));
  console.log('🎯 PHASE 3 TRAINING TABLE BUILD COMPLETE!\n');
}

main();
