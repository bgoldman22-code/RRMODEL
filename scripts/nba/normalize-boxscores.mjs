#!/usr/bin/env node
/**
 * Normalize and combine multi-season boxscores
 * 
 * This script:
 * 1. Reads raw season files from data/nba/raw/
 * 2. Combines them into a single normalized dataset
 * 3. Validates data quality
 * 4. Writes to data/nba/boxscores_multiseason_2022_26_v1.json
 * 
 * Usage:
 *   node scripts/nba/normalize-boxscores.mjs
 * 
 * Data Safety:
 *   - Atomic writes (.tmp → rename)
 *   - Versioned output filename
 *   - Updates phase3_checkpoints.json
 */

import { readFileSync, writeFileSync, readdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

// Configuration
const RAW_DIR = join(REPO_ROOT, 'data/nba/raw');
const OUTPUT_FILE = join(REPO_ROOT, 'data/nba/boxscores_multiseason_2022_26_v1.json');
const CHECKPOINT_FILE = join(REPO_ROOT, 'data/nba/phase3_checkpoints.json');

console.log('[normalize-boxscores] NBA Multi-Season Boxscores Normalizer');
console.log('[normalize-boxscores] Raw directory:', RAW_DIR);
console.log('[normalize-boxscores] Output file:', OUTPUT_FILE);

/**
 * Load all raw season files
 */
function loadRawSeasons() {
  console.log('\n[normalize-boxscores] Loading raw season files...');
  
  const files = readdirSync(RAW_DIR).filter(f => f.startsWith('boxscores_') && f.endsWith('.json'));
  
  console.log(`[normalize-boxscores] Found ${files.length} season files:`);
  files.forEach(f => console.log(`  - ${f}`));
  
  const seasons = [];
  
  for (const file of files) {
    const filepath = join(RAW_DIR, file);
    try {
      const data = JSON.parse(readFileSync(filepath, 'utf-8'));
      console.log(`\n[normalize-boxscores] Loaded ${file}:`);
      console.log(`  Season: ${data.season}`);
      console.log(`  Games: ${data.total_games || data.games?.length || 0}`);
      console.log(`  Source: ${data.source || 'unknown'}`);
      
      seasons.push({
        season: data.season,
        source: data.source,
        fetched_at: data.fetched_at,
        games: data.games || []
      });
    } catch (err) {
      console.error(`  ❌ Error loading ${file}:`, err.message);
    }
  }
  
  return seasons;
}

/**
 * Validate and normalize a game record
 */
function validateGame(game, season) {
  const errors = [];
  
  // Required fields
  if (!game.date) errors.push('missing date');
  if (!game.player_name) errors.push('missing player_name');
  if (!game.team) errors.push('missing team');
  
  // Numeric fields should be numbers
  const numericFields = ['minutes', 'points', 'rebounds', 'assists', 'pra', 'fga', 'fta'];
  for (const field of numericFields) {
    if (game[field] !== null && game[field] !== undefined) {
      const val = Number(game[field]);
      if (isNaN(val)) {
        errors.push(`${field} is not a number: ${game[field]}`);
      } else {
        game[field] = val; // Ensure it's a number
      }
    } else {
      game[field] = 0; // Default to 0 if missing
    }
  }
  
  // Ensure PRA is calculated
  if (!game.pra || game.pra === 0) {
    game.pra = (game.points || 0) + (game.rebounds || 0) + (game.assists || 0);
  }
  
  // Add season field if missing
  if (!game.season) {
    game.season = season;
  }
  
  return { valid: errors.length === 0, errors, game };
}

/**
 * Combine and normalize all seasons
 */
function combineSeasons(seasons) {
  console.log('\n[normalize-boxscores] Combining seasons...');
  
  const allGames = [];
  const stats = {
    total_games: 0,
    by_season: {},
    by_player: {},
    validation_errors: 0
  };
  
  for (const seasonData of seasons) {
    const season = seasonData.season;
    console.log(`\n[normalize-boxscores] Processing ${season}...`);
    
    let validCount = 0;
    let errorCount = 0;
    
    for (const game of seasonData.games) {
      const { valid, errors, game: normalizedGame } = validateGame(game, season);
      
      if (valid) {
        allGames.push(normalizedGame);
        validCount++;
        
        // Track stats
        const playerName = normalizedGame.player_name;
        stats.by_player[playerName] = (stats.by_player[playerName] || 0) + 1;
      } else {
        errorCount++;
        if (errorCount <= 5) { // Only log first 5 errors per season
          console.log(`  ⚠️  Validation error: ${errors.join(', ')}`);
          console.log(`      Player: ${game.player_name}, Date: ${game.date}`);
        }
      }
    }
    
    stats.by_season[season] = validCount;
    stats.total_games += validCount;
    stats.validation_errors += errorCount;
    
    console.log(`  ✅ Valid games: ${validCount}`);
    if (errorCount > 0) {
      console.log(`  ⚠️  Invalid games: ${errorCount}`);
    }
  }
  
  // Sort by date (chronological)
  console.log('\n[normalize-boxscores] Sorting by date...');
  allGames.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return 0;
  });
  
  return { games: allGames, stats };
}

/**
 * Generate summary statistics
 */
function generateStats(games) {
  console.log('\n[normalize-boxscores] Generating statistics...');
  
  const stats = {
    total_games: games.length,
    date_range: {
      earliest: games[0]?.date || null,
      latest: games[games.length - 1]?.date || null
    },
    unique_players: new Set(games.map(g => g.player_name)).size,
    unique_teams: new Set(games.map(g => g.team)).size,
    by_season: {},
    top_players: {}
  };
  
  // Count games by season
  for (const game of games) {
    const season = game.season || 'unknown';
    stats.by_season[season] = (stats.by_season[season] || 0) + 1;
  }
  
  // Find top players by game count
  const playerCounts = {};
  for (const game of games) {
    const player = game.player_name;
    playerCounts[player] = (playerCounts[player] || 0) + 1;
  }
  
  const topPlayers = Object.entries(playerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  stats.top_players = Object.fromEntries(topPlayers);
  
  return stats;
}

/**
 * Save combined dataset
 */
function saveData(games, metadata) {
  console.log('\n[normalize-boxscores] Saving combined dataset...');
  
  const data = {
    version: 'v1',
    created: new Date().toISOString(),
    source: 'nba_api via fetch-multiseason-boxscores.py',
    description: 'Combined multi-season NBA player boxscores (2022-23 through 2025-26)',
    ...metadata,
    games
  };
  
  // Atomic write: .tmp → rename
  const tmpFile = OUTPUT_FILE + '.tmp';
  
  console.log(`[normalize-boxscores] Writing ${games.length} games to disk...`);
  writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  
  renameSync(tmpFile, OUTPUT_FILE);
  
  console.log(`✅ Saved: ${OUTPUT_FILE}`);
  
  // Calculate file size
  const fileSizeBytes = Buffer.byteLength(JSON.stringify(data));
  const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
  console.log(`📊 File size: ${fileSizeMB} MB`);
}

/**
 * Update checkpoint file
 */
function updateCheckpoint(metadata) {
  console.log('\n[normalize-boxscores] Updating checkpoint...');
  
  try {
    let checkpointData = { checkpoints: [] };
    
    if (readFileSync(CHECKPOINT_FILE, 'utf-8')) {
      checkpointData = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
    }
    
    const newCheckpoint = {
      timestamp: new Date().toISOString(),
      step: 'normalize_multiseason_boxscores',
      artifacts: [OUTPUT_FILE],
      notes: `Combined ${metadata.total_games} games from ${Object.keys(metadata.by_season).length} seasons`
    };
    
    checkpointData.checkpoints.push(newCheckpoint);
    
    // Atomic write
    const tmpFile = CHECKPOINT_FILE + '.tmp';
    writeFileSync(tmpFile, JSON.stringify(checkpointData, null, 2));
    renameSync(tmpFile, CHECKPOINT_FILE);
    
    console.log('✅ Checkpoint updated');
  } catch (err) {
    console.error('⚠️  Failed to update checkpoint:', err.message);
  }
}

/**
 * Main execution
 */
function main() {
  try {
    // Load raw seasons
    const seasons = loadRawSeasons();
    
    if (seasons.length === 0) {
      console.error('\n❌ No season files found!');
      console.error('Run: python scripts/nba/fetch-multiseason-boxscores.py first');
      process.exit(1);
    }
    
    // Combine and normalize
    const { games, stats: combineStats } = combineSeasons(seasons);
    
    if (games.length === 0) {
      console.error('\n❌ No valid games after normalization!');
      process.exit(1);
    }
    
    // Generate statistics
    const metadata = generateStats(games);
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total games: ${metadata.total_games}`);
    console.log(`Date range: ${metadata.date_range.earliest} to ${metadata.date_range.latest}`);
    console.log(`Unique players: ${metadata.unique_players}`);
    console.log(`Unique teams: ${metadata.unique_teams}`);
    console.log('\nGames by season:');
    for (const [season, count] of Object.entries(metadata.by_season)) {
      console.log(`  ${season}: ${count.toLocaleString()}`);
    }
    console.log('\nTop 10 players by games:');
    for (const [player, count] of Object.entries(metadata.top_players)) {
      console.log(`  ${player}: ${count}`);
    }
    
    if (combineStats.validation_errors > 0) {
      console.log(`\n⚠️  Validation errors: ${combineStats.validation_errors}`);
    }
    
    // Save combined dataset
    saveData(games, metadata);
    
    // Update checkpoint
    updateCheckpoint(metadata);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ COMPLETE: Multi-season boxscores normalized');
    console.log('='.repeat(60));
    console.log(`\n📁 Output: ${OUTPUT_FILE}`);
    console.log('\n🎯 Next step: Collect historical odds (Phase B)');
    
  } catch (err) {
    console.error('\n❌ FATAL ERROR:', err);
    process.exit(1);
  }
}

main();
