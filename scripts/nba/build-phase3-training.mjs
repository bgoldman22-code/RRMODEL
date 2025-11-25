#!/usr/bin/env node
/**
 * Phase 3 Training Dataset Builder
 * 
 * This script joins multi-season boxscores with historical odds to create
 * a zero-leakage walkforward training dataset for PRA prediction models.
 * 
 * Key Features:
 * - Zero data leakage (only uses data from date < game_date)
 * - Walkforward feature calculation (L5/L10/L999)
 * - Opponent defensive stats
 * - Player/team context features
 * 
 * Usage:
 *   node scripts/nba/build-phase3-training.mjs
 * 
 * Output:
 *   data/nba/training/phase3_training_v1_YYYYMMDD.jsonl
 *   data/nba/training/phase3_training_metadata_v1.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

const BOXSCORES_FILE = join(REPO_ROOT, 'data/nba/boxscores_multiseason_2022_26_v1.json');
const ODDS_DIR = join(REPO_ROOT, 'data/nba/historical_odds');
const OUTPUT_DIR = join(REPO_ROOT, 'data/nba/training');
const CHECKPOINT_FILE = join(REPO_ROOT, 'data/nba/phase3_checkpoints.json');

// Team name mappings (odds use full names, boxscores use abbreviations)
const TEAM_NAME_TO_ABBR = {
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU',
  'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS'
};

console.log('[build-phase3-training] Phase 3 Training Dataset Builder');
console.log('[build-phase3-training] Zero-leakage walkforward feature engineering\n');

/**
 * Load boxscores
 */
function loadBoxscores() {
  console.log('[1/6] Loading boxscores...');
  const data = JSON.parse(readFileSync(BOXSCORES_FILE, 'utf-8'));
  const games = data.games || [];
  
  // Sort chronologically (critical for walkforward)
  games.sort((a, b) => a.date.localeCompare(b.date));
  
  console.log(`  ✅ Loaded ${games.length} player-games`);
  console.log(`  📅 Date range: ${games[0]?.date} to ${games[games.length - 1]?.date}`);
  
  return games;
}

/**
 * Load historical odds
 */
function loadHistoricalOdds() {
  console.log('\n[2/6] Loading historical odds...');
  
  const files = readdirSync(ODDS_DIR)
    .filter(f => f.startsWith('nba_props_') && f.endsWith('.json') && f !== 'phase3_odds_manifest_v1.json');
  
  console.log(`  📁 Found ${files.length} odds files`);
  
  const allOdds = [];
  let totalProps = 0;
  
  for (const file of files) {
    const filepath = join(ODDS_DIR, file);
    const data = JSON.parse(readFileSync(filepath, 'utf-8'));
    
    // Extract date from filename (nba_props_YYYYMMDD_v1.json)
    const dateMatch = file.match(/nba_props_(\d{8})_v1\.json/);
    const date = dateMatch ? `${dateMatch[1].slice(0, 4)}-${dateMatch[1].slice(4, 6)}-${dateMatch[1].slice(6, 8)}` : data.date;
    
    for (const event of data.events || []) {
      for (const market in event.markets) {
        for (const prop of event.markets[market]) {
          allOdds.push({
            date,
            event_id: event.event_id,
            home_team: event.home_team,
            away_team: event.away_team,
            commence_time: event.commence_time,
            player: prop.player,
            market,
            side: prop.side,
            line: prop.line,
            odds: prop.odds,
            bookmaker: prop.bookmaker
          });
          totalProps++;
        }
      }
    }
  }
  
  console.log(`  ✅ Loaded ${totalProps} player props from ${files.length} dates`);
  
  return allOdds;
}

/**
 * Calculate rolling stats for a player (walkforward, no leakage)
 * 
 * ZERO-LEAKAGE: Only uses games where g.date < beforeDate
 * Windows: L5, L10, L20, L40, L999 (career)
 */
function calculateRollingStats(games, playerName, beforeDate, windows = [5, 10, 20, 40, 999]) {
  // Filter games before this date for this player
  const playerGames = games.filter(g => 
    g.player_name === playerName && 
    g.date < beforeDate
  ).sort((a, b) => a.date.localeCompare(b.date));
  
  const stats = {
    games_played: playerGames.length
  };
  
  for (const window of windows) {
    const recentGames = playerGames.slice(-window);
    const n = recentGames.length;
    
    if (n === 0) {
      // No prior games
      stats[`L${window}_games`] = 0;
      stats[`L${window}_ppg`] = 0;
      stats[`L${window}_rpg`] = 0;
      stats[`L${window}_apg`] = 0;
      stats[`L${window}_pra`] = 0;
      stats[`L${window}_minutes`] = 0;
      stats[`L${window}_fga`] = 0;
      stats[`L${window}_fta`] = 0;
    } else {
      stats[`L${window}_games`] = n;
      stats[`L${window}_ppg`] = recentGames.reduce((sum, g) => sum + (g.points || 0), 0) / n;
      stats[`L${window}_rpg`] = recentGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n;
      stats[`L${window}_apg`] = recentGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n;
      stats[`L${window}_pra`] = recentGames.reduce((sum, g) => sum + (g.pra || 0), 0) / n;
      stats[`L${window}_minutes`] = recentGames.reduce((sum, g) => sum + (g.minutes || 0), 0) / n;
      stats[`L${window}_fga`] = recentGames.reduce((sum, g) => sum + (g.fga || 0), 0) / n;
      stats[`L${window}_fta`] = recentGames.reduce((sum, g) => sum + (g.fta || 0), 0) / n;
    }
  }
  
  return stats;
}

/**
 * Get NBA season for a given date
 * NBA seasons run from October to April
 * 
 * @param {string} date - ISO date string (YYYY-MM-DD)
 * @returns {string} Season identifier (e.g., "2023-24")
 */
function getNBASeason(date) {
  const dateObj = new Date(date);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1; // 1-12
  
  // If October-December, season is year-nextYear
  // If January-September, season is prevYear-year
  if (month >= 10) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

/**
 * Calculate season-to-date stats (reset each NBA season)
 * 
 * ZERO-LEAKAGE: Only uses games in current season where g.date < beforeDate
 * NBA Season: October through April
 */
function calculateSeasonStats(games, playerName, beforeDate) {
  const currentSeason = getNBASeason(beforeDate);
  
  // Filter games in current season before this date
  const seasonGames = games.filter(g => {
    if (g.player_name !== playerName) return false;
    if (g.date >= beforeDate) return false; // CRITICAL: no leakage
    
    const gameSeason = getNBASeason(g.date);
    return gameSeason === currentSeason;
  }).sort((a, b) => a.date.localeCompare(b.date));
  
  const n = seasonGames.length;
  
  if (n === 0) {
    return {
      season_games_played: 0,
      season_ppg: 0,
      season_rpg: 0,
      season_apg: 0,
      season_pra: 0,
      season_minutes: 0,
      season_fga: 0,
      season_fta: 0
    };
  }
  
  return {
    season_games_played: n,
    season_ppg: seasonGames.reduce((sum, g) => sum + (g.points || 0), 0) / n,
    season_rpg: seasonGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n,
    season_apg: seasonGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n,
    season_pra: seasonGames.reduce((sum, g) => sum + (g.pra || 0), 0) / n,
    season_minutes: seasonGames.reduce((sum, g) => sum + (g.minutes || 0), 0) / n,
    season_fga: seasonGames.reduce((sum, g) => sum + (g.fga || 0), 0) / n,
    season_fta: seasonGames.reduce((sum, g) => sum + (g.fta || 0), 0) / n
  };
}

/**
 * Calculate head-to-head stats vs specific opponent (this season only)
 * 
 * ZERO-LEAKAGE: Only uses games in current season where:
 * - g.date < beforeDate (no future games)
 * - g.opponent === opponent (same opponent)
 * 
 * Example: If predicting Luka vs DEN on 2024-02-10
 * Include: 2024-01-03 DAL vs DEN, 2024-01-18 DAL @ DEN
 * Exclude: Any game after 2024-02-10, any from previous seasons
 */
function calculateH2HStats(games, playerName, opponent, beforeDate) {
  const currentSeason = getNBASeason(beforeDate);
  
  // Filter games vs this opponent in current season before this date
  const h2hGames = games.filter(g => {
    if (g.player_name !== playerName) return false;
    if (g.opponent !== opponent) return false;
    if (g.date >= beforeDate) return false; // CRITICAL: no leakage
    
    const gameSeason = getNBASeason(g.date);
    return gameSeason === currentSeason;
  }).sort((a, b) => a.date.localeCompare(b.date));
  
  const n = h2hGames.length;
  
  if (n === 0) {
    // No prior H2H games this season
    return {
      h2h_games_played: 0,
      h2h_ppg: 0,
      h2h_rpg: 0,
      h2h_apg: 0,
      h2h_pra: 0,
      h2h_minutes: 0,
      h2h_fga: 0,
      h2h_fta: 0
    };
  }
  
  return {
    h2h_games_played: n,
    h2h_ppg: h2hGames.reduce((sum, g) => sum + (g.points || 0), 0) / n,
    h2h_rpg: h2hGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n,
    h2h_apg: h2hGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n,
    h2h_pra: h2hGames.reduce((sum, g) => sum + (g.pra || 0), 0) / n,
    h2h_minutes: h2hGames.reduce((sum, g) => sum + (g.minutes || 0), 0) / n,
    h2h_fga: h2hGames.reduce((sum, g) => sum + (g.fga || 0), 0) / n,
    h2h_fta: h2hGames.reduce((sum, g) => sum + (g.fta || 0), 0) / n
  };
}

/**
 * Calculate opponent defensive stats (walkforward)
 */
function calculateOpponentDefense(games, opponentTeam, beforeDate, windows = [5, 10]) {
  // Games where this team was the opponent (gave up stats)
  const opponentGames = games.filter(g => 
    g.opponent === opponentTeam && 
    g.date < beforeDate
  );
  
  const stats = {};
  
  for (const window of windows) {
    const recentGames = opponentGames.slice(-window);
    const n = recentGames.length;
    
    if (n === 0) {
      stats[`opp_def_L${window}_pra_allowed`] = 0;
      stats[`opp_def_L${window}_ppg_allowed`] = 0;
      stats[`opp_def_L${window}_rpg_allowed`] = 0;
      stats[`opp_def_L${window}_apg_allowed`] = 0;
    } else {
      stats[`opp_def_L${window}_pra_allowed`] = recentGames.reduce((sum, g) => sum + (g.pra || 0), 0) / n;
      stats[`opp_def_L${window}_ppg_allowed`] = recentGames.reduce((sum, g) => sum + (g.points || 0), 0) / n;
      stats[`opp_def_L${window}_rpg_allowed`] = recentGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n;
      stats[`opp_def_L${window}_apg_allowed`] = recentGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n;
    }
  }
  
  return stats;
}

/**
 * Calculate rest days
 */
function calculateRestDays(games, playerName, beforeDate) {
  const playerGames = games.filter(g => 
    g.player_name === playerName && 
    g.date < beforeDate
  ).sort((a, b) => a.date.localeCompare(b.date));
  
  if (playerGames.length === 0) return 7; // Default to week rest if no prior games
  
  const lastGame = playerGames[playerGames.length - 1];
  const lastGameDate = new Date(lastGame.date);
  const currentDate = new Date(beforeDate);
  const diffTime = currentDate - lastGameDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Find actual game result
 */
function findActualResult(games, playerName, gameDate, team, opponent) {
  // Find the exact game
  const game = games.find(g => 
    g.player_name === playerName &&
    g.date === gameDate &&
    (g.team === team || g.opponent === opponent)
  );
  
  return game;
}

/**
 * Match player to team from odds event
 */
function matchPlayerToTeam(games, playerName, homeTeamFull, awayTeamFull, gameDate) {
  // Convert full team names to abbreviations
  const homeTeam = TEAM_NAME_TO_ABBR[homeTeamFull];
  const awayTeam = TEAM_NAME_TO_ABBR[awayTeamFull];
  
  if (!homeTeam || !awayTeam) {
    return { team: null, opponent: null, home: 0 };
  }
  
  // Find recent games for this player near this date (within same month)
  const monthStart = gameDate.substring(0, 7) + '-01';
  const recentGames = games.filter(g => 
    g.player_name === playerName &&
    g.date <= gameDate &&
    g.date >= monthStart
  );
  
  if (recentGames.length === 0) {
    // Try wider search (within 30 days)
    const dateObj = new Date(gameDate);
    const thirtyDaysAgo = new Date(dateObj);
    thirtyDaysAgo.setDate(dateObj.getDate() - 30);
    const searchDate = thirtyDaysAgo.toISOString().split('T')[0];
    
    const widerGames = games.filter(g => 
      g.player_name === playerName &&
      g.date <= gameDate &&
      g.date >= searchDate
    );
    
    if (widerGames.length === 0) return { team: null, opponent: null, home: 0 };
    
    // Use wider search results
    const homeGames = widerGames.filter(g => g.team === homeTeam);
    const awayGames = widerGames.filter(g => g.team === awayTeam);
    
    if (homeGames.length > 0) {
      return { team: homeTeam, opponent: awayTeam, home: 1 };
    } else if (awayGames.length > 0) {
      return { team: awayTeam, opponent: homeTeam, home: 0 };
    }
    
    return { team: null, opponent: null, home: 0 };
  }
  
  // Check if player was on home or away team
  const homeGames = recentGames.filter(g => g.team === homeTeam);
  const awayGames = recentGames.filter(g => g.team === awayTeam);
  
  if (homeGames.length > 0) {
    return { team: homeTeam, opponent: awayTeam, home: 1 };
  } else if (awayGames.length > 0) {
    return { team: awayTeam, opponent: homeTeam, home: 0 };
  }
  
  return { team: null, opponent: null, home: 0 };
}

/**
 * Build training dataset
 */
function buildTrainingDataset(games, odds) {
  console.log('\n[3/6] Building training dataset with walkforward features...');
  console.log('  ⚠️  This will take several minutes (~10-15 min for 70K props)');
  
  const trainingExamples = [];
  let processed = 0;
  let matched = 0;
  let unmatched = 0;
  
  const startTime = Date.now();
  
  for (const prop of odds) {
    processed++;
    
    if (processed % 5000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (processed / elapsed).toFixed(0);
      const remaining = Math.ceil((odds.length - processed) / rate);
      console.log(`  📊 Progress: ${processed}/${odds.length} (${rate}/sec, ~${remaining}s remaining)`);
    }
    
    // Match player to team
    const { team, opponent, home } = matchPlayerToTeam(games, prop.player, prop.home_team, prop.away_team, prop.date);
    
    if (!team) {
      unmatched++;
      continue; // Skip if can't match player to team
    }
    
    // Calculate walkforward features (CRITICAL: only use data from before this date)
    const rollingStats = calculateRollingStats(games, prop.player, prop.date);
    const seasonStats = calculateSeasonStats(games, prop.player, prop.date);
    const h2hStats = calculateH2HStats(games, prop.player, opponent, prop.date);
    const oppDefense = calculateOpponentDefense(games, opponent, prop.date);
    const restDays = calculateRestDays(games, prop.player, prop.date);
    
    // Find actual game result
    const actualGame = findActualResult(games, prop.player, prop.date, team, opponent);
    
    if (!actualGame) {
      unmatched++;
      continue; // Skip if can't find actual result
    }
    
    // Determine actual result based on market
    let actualValue, result;
    
    if (prop.market === 'player_points') {
      actualValue = actualGame.points || 0;
    } else if (prop.market === 'player_rebounds') {
      actualValue = actualGame.rebounds || 0;
    } else if (prop.market === 'player_assists') {
      actualValue = actualGame.assists || 0;
    }
    
    // Calculate result (1 = bet won, 0 = bet lost)
    if (prop.side === 'Over') {
      result = actualValue > prop.line ? 1 : 0;
    } else if (prop.side === 'Under') {
      result = actualValue < prop.line ? 1 : 0;
    }
    
    // Build training example
    const example = {
      // Identifiers
      id: `${prop.date}_${prop.player.replace(/\s+/g, '-')}_${prop.market}_${prop.side}_${prop.line}`,
      date: prop.date,
      player: prop.player,
      team,
      opponent,
      home,
      
      // Market info
      market: prop.market,
      side: prop.side,
      line: prop.line,
      odds: prop.odds,
      bookmaker: prop.bookmaker,
      
      // Rolling stats (L5/L10/L20/L40/L999)
      ...rollingStats,
      
      // Season-to-date stats
      ...seasonStats,
      
      // Head-to-head stats (vs this opponent, this season)
      ...h2hStats,
      
      // Opponent defense
      ...oppDefense,
      
      // Context
      rest_days: restDays,
      
      // Actual result
      actual_value: actualValue,
      actual_pra: actualGame.pra || 0,
      actual_points: actualGame.points || 0,
      actual_rebounds: actualGame.rebounds || 0,
      actual_assists: actualGame.assists || 0,
      actual_minutes: actualGame.minutes || 0,
      
      // Target
      result
    };
    
    trainingExamples.push(example);
    matched++;
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n  ✅ Built ${trainingExamples.length} training examples in ${elapsed}s`);
  console.log(`  📊 Matched: ${matched} | Unmatched: ${unmatched} | Match rate: ${(matched/processed*100).toFixed(1)}%`);
  
  return trainingExamples;
}

/**
 * Generate statistics
 */
function generateStats(examples) {
  console.log('\n[4/6] Generating dataset statistics...');
  
  const stats = {
    total_examples: examples.length,
    by_market: {},
    by_side: {},
    by_date: {},
    win_rate_overall: 0,
    avg_line: 0,
    unique_players: new Set(examples.map(e => e.player)).size,
    date_range: {
      earliest: examples[0]?.date,
      latest: examples[examples.length - 1]?.date
    }
  };
  
  // Stats by market
  for (const ex of examples) {
    stats.by_market[ex.market] = (stats.by_market[ex.market] || 0) + 1;
    stats.by_side[ex.side] = (stats.by_side[ex.side] || 0) + 1;
    
    const dateKey = ex.date.substring(0, 7); // YYYY-MM
    stats.by_date[dateKey] = (stats.by_date[dateKey] || 0) + 1;
  }
  
  // Win rate
  const wins = examples.filter(e => e.result === 1).length;
  stats.win_rate_overall = (wins / examples.length).toFixed(3);
  
  // Avg line
  stats.avg_line = (examples.reduce((sum, e) => sum + e.line, 0) / examples.length).toFixed(1);
  
  console.log(`  Total examples: ${stats.total_examples}`);
  console.log(`  Unique players: ${stats.unique_players}`);
  console.log(`  Overall win rate: ${(stats.win_rate_overall * 100).toFixed(1)}%`);
  console.log(`  By market:`, stats.by_market);
  console.log(`  By side:`, stats.by_side);
  
  return stats;
}

/**
 * Save training dataset
 */
function saveTrainingDataset(examples, stats) {
  console.log('\n[5/6] Saving training dataset...');
  
  mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const dataFile = join(OUTPUT_DIR, `phase3_training_v1_${dateStr}.jsonl`);
  const metadataFile = join(OUTPUT_DIR, `phase3_training_metadata_v1.json`);
  
  // Write JSONL (one JSON object per line)
  const tmpDataFile = dataFile + '.tmp';
  const lines = examples.map(ex => JSON.stringify(ex)).join('\n');
  writeFileSync(tmpDataFile, lines);
  renameSync(tmpDataFile, dataFile);
  
  console.log(`  ✅ Saved ${examples.length} examples to JSONL`);
  
  // Write metadata
  const metadata = {
    version: 'v1',
    created: new Date().toISOString(),
    source_boxscores: BOXSCORES_FILE,
    source_odds: ODDS_DIR,
    ...stats,
    features: [
      'L5_ppg', 'L10_ppg', 'L999_ppg',
      'L5_rpg', 'L10_rpg', 'L999_rpg',
      'L5_apg', 'L10_apg', 'L999_apg',
      'L5_pra', 'L10_pra', 'L999_pra',
      'L5_minutes', 'L10_minutes',
      'L5_fga', 'L10_fga',
      'L5_fta', 'L10_fta',
      'opp_def_L5_pra_allowed', 'opp_def_L10_pra_allowed',
      'opp_def_L5_ppg_allowed', 'opp_def_L10_ppg_allowed',
      'opp_def_L5_rpg_allowed', 'opp_def_L10_rpg_allowed',
      'opp_def_L5_apg_allowed', 'opp_def_L10_apg_allowed',
      'rest_days', 'home', 'line', 'games_played'
    ],
    target: 'result',
    leakage_prevention: 'All features computed using only data from date < game_date'
  };
  
  const tmpMetadataFile = metadataFile + '.tmp';
  writeFileSync(tmpMetadataFile, JSON.stringify(metadata, null, 2));
  renameSync(tmpMetadataFile, metadataFile);
  
  console.log(`  ✅ Saved metadata`);
  console.log(`\n  📁 Output files:`);
  console.log(`     ${dataFile}`);
  console.log(`     ${metadataFile}`);
  
  return { dataFile, metadataFile };
}

/**
 * Update checkpoint
 */
function updateCheckpoint(artifacts, stats) {
  console.log('\n[6/6] Updating checkpoint...');
  
  try {
    let checkpointData = { checkpoints: [] };
    if (existsSync(CHECKPOINT_FILE)) {
      checkpointData = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
    }
    
    checkpointData.checkpoints.push({
      timestamp: new Date().toISOString(),
      step: 'build_phase3_training_dataset',
      artifacts: Object.values(artifacts),
      notes: `Created ${stats.total_examples} training examples with zero-leakage walkforward features`
    });
    
    const tmpFile = CHECKPOINT_FILE + '.tmp';
    writeFileSync(tmpFile, JSON.stringify(checkpointData, null, 2));
    renameSync(tmpFile, CHECKPOINT_FILE);
    
    console.log('  ✅ Checkpoint updated');
  } catch (err) {
    console.log(`  ⚠️  Checkpoint update failed: ${err.message}`);
  }
}

/**
 * Main
 */
async function main() {
  const startTime = Date.now();
  
  console.log('='.repeat(60));
  console.log('Phase 3 Training Dataset Builder');
  console.log('Zero-Leakage Walkforward Feature Engineering');
  console.log('='.repeat(60) + '\n');
  
  // Load data
  const games = loadBoxscores();
  const odds = loadHistoricalOdds();
  
  // Build training dataset
  const examples = buildTrainingDataset(games, odds);
  
  // Generate stats
  const stats = generateStats(examples);
  
  // Save
  const artifacts = saveTrainingDataset(examples, stats);
  
  // Update checkpoint
  updateCheckpoint(artifacts, stats);
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ COMPLETE: Training dataset ready');
  console.log('='.repeat(60));
  console.log(`Total time: ${totalTime} minutes`);
  console.log(`\n🎯 Next step: Train PRA models (Phase D)`);
  console.log(`   Run: python scripts/nba/train-phase3-pra-models.py`);
}

main().catch(err => {
  console.error('\n❌ FATAL ERROR:', err);
  process.exit(1);
});
