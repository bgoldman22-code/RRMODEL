#!/usr/bin/env node
/**
 * NFL Model V2 - NFLVerse Data Loader
 * 
 * Downloads and caches NFLVerse play-by-play and game summary data locally.
 * Data is free and comprehensive for 2020-2024 seasons.
 * 
 * Run: node nfl-model-v2/scripts/02-prepare-nflverse-data.mjs
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { promisify } from 'util';
import { pipeline } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gunzip = promisify(zlib.gunzip);
const streamPipeline = promisify(pipeline);

// Configuration
const config = JSON.parse(
  await fs.readFile(path.join(__dirname, '../config.json'), 'utf-8')
);

const OUTPUT_DIR = path.join(__dirname, '../data/nflverse');

/**
 * Download and decompress NFLVerse play-by-play data
 */
async function downloadPlayByPlay(season) {
  const url = config.nflverse.pbp_url.replace('{season}', season);
  console.log(`\n📥 Downloading play-by-play for ${season}...`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Get compressed data
    const buffer = await response.buffer();
    console.log(`   Downloaded: ${(buffer.length / 1024 / 1024).toFixed(2)} MB (compressed)`);
    
    // Decompress
    const decompressed = await gunzip(buffer);
    console.log(`   Decompressed: ${(decompressed.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Save CSV
    const filename = path.join(OUTPUT_DIR, `pbp_${season}.csv`);
    await fs.writeFile(filename, decompressed);
    console.log(`   ✅ Saved to ${filename}`);
    
    // Parse and create summary
    const csvText = decompressed.toString('utf-8');
    const lines = csvText.split('\n');
    const plays = lines.length - 1; // Subtract header
    
    return { season, plays, filename };
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);
    return null;
  }
}

/**
 * Download NFLVerse game summaries
 */
async function downloadGameSummaries() {
  const url = config.nflverse.games_url;
  console.log(`\n📥 Downloading game summaries...`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const csv = await response.text();
    console.log(`   Downloaded: ${(csv.length / 1024).toFixed(2)} KB`);
    
    // Save CSV
    const filename = path.join(OUTPUT_DIR, 'games.csv');
    await fs.writeFile(filename, csv);
    console.log(`   ✅ Saved to ${filename}`);
    
    // Parse games
    const lines = csv.split('\n');
    const games = lines.length - 1;
    
    return { games, filename };
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);
    return null;
  }
}

/**
 * Check if data already exists
 */
async function hasExistingData(season) {
  const filename = path.join(OUTPUT_DIR, `pbp_${season}.csv`);
  try {
    const stats = await fs.stat(filename);
    return stats.size > 0;
  } catch {
    return false;
  }
}

/**
 * Parse CSV line into object
 */
function parseCSVLine(line, headers) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = values[index] || null;
  });
  
  return obj;
}

/**
 * Create game-level aggregates from play-by-play data
 */
async function createGameAggregates(season) {
  console.log(`\n📊 Creating game aggregates for ${season}...`);
  
  const pbpFile = path.join(OUTPUT_DIR, `pbp_${season}.csv`);
  const pbpData = await fs.readFile(pbpFile, 'utf-8');
  const lines = pbpData.split('\n');
  
  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  // Aggregate by game
  const gameStats = {};
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const play = parseCSVLine(lines[i], headers);
    const gameId = play.game_id;
    
    if (!gameId) continue;
    
    if (!gameStats[gameId]) {
      gameStats[gameId] = {
        game_id: gameId,
        season: play.season,
        week: play.week,
        home_team: play.home_team,
        away_team: play.away_team,
        home_score: 0,
        away_score: 0,
        plays: 0,
        home_epa: 0,
        away_epa: 0,
        home_success_plays: 0,
        away_success_plays: 0,
        home_explosive_plays: 0,
        away_explosive_plays: 0
      };
    }
    
    const stats = gameStats[gameId];
    stats.plays++;
    
    // Update scores
    if (play.total_home_score) stats.home_score = parseInt(play.total_home_score);
    if (play.total_away_score) stats.away_score = parseInt(play.total_away_score);
    
    // EPA tracking
    const epa = parseFloat(play.epa) || 0;
    const yards = parseFloat(play.yards_gained) || 0;
    const success = play.success === '1' || play.success === 'TRUE';
    
    if (play.posteam === play.home_team) {
      stats.home_epa += epa;
      if (success) stats.home_success_plays++;
      if (yards >= 20) stats.home_explosive_plays++;
    } else if (play.posteam === play.away_team) {
      stats.away_epa += epa;
      if (success) stats.away_success_plays++;
      if (yards >= 20) stats.away_explosive_plays++;
    }
  }
  
  // Convert to array and calculate rates
  const games = Object.values(gameStats).map(game => ({
    ...game,
    home_epa_per_play: game.plays > 0 ? game.home_epa / game.plays : 0,
    away_epa_per_play: game.plays > 0 ? game.away_epa / game.plays : 0,
    home_success_rate: game.plays > 0 ? game.home_success_plays / game.plays : 0,
    away_success_rate: game.plays > 0 ? game.away_success_plays / game.plays : 0,
    home_explosive_rate: game.plays > 0 ? game.home_explosive_plays / game.plays : 0,
    away_explosive_rate: game.plays > 0 ? game.away_explosive_plays / game.plays : 0
  }));
  
  // Save aggregates
  const outputFile = path.join(OUTPUT_DIR, `game_aggregates_${season}.json`);
  await fs.writeFile(outputFile, JSON.stringify(games, null, 2));
  
  console.log(`   ✅ Created ${games.length} game aggregates`);
  console.log(`   ✅ Saved to ${outputFile}`);
  
  return games.length;
}

/**
 * Main execution
 */
async function main() {
  console.log('🏈 NFL Model V2 - NFLVerse Data Loader');
  console.log('='.repeat(60));
  console.log(`Seasons: ${config.seasons.join(', ')}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  let totalPlays = 0;
  let totalGames = 0;
  let skipped = 0;
  
  // Download play-by-play for each season
  for (const season of config.seasons) {
    console.log(`\n📅 Processing ${season} Season...`);
    
    // Check if already downloaded
    if (await hasExistingData(season)) {
      console.log(`   ⏭️  Play-by-play data already exists, skipping download...`);
      skipped++;
      
      // Still create aggregates if they don't exist
      const aggregateFile = path.join(OUTPUT_DIR, `game_aggregates_${season}.json`);
      try {
        await fs.access(aggregateFile);
        console.log(`   ⏭️  Game aggregates already exist, skipping...`);
      } catch {
        const games = await createGameAggregates(season);
        totalGames += games;
      }
      
      continue;
    }
    
    // Download play-by-play
    const result = await downloadPlayByPlay(season);
    
    if (result) {
      totalPlays += result.plays;
      
      // Create game-level aggregates
      const games = await createGameAggregates(season);
      totalGames += games;
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Download game summaries (all seasons in one file)
  const summariesFile = path.join(OUTPUT_DIR, 'games.csv');
  try {
    await fs.access(summariesFile);
    console.log('\n⏭️  Game summaries already exist, skipping...');
  } catch {
    await downloadGameSummaries();
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ NFLVerse Data Loading Complete!');
  console.log(`   Total Plays: ${totalPlays.toLocaleString()}`);
  console.log(`   Total Games: ${totalGames}`);
  console.log(`   Skipped Seasons: ${skipped}`);
  console.log(`   Saved to: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  // Save summary
  const summary = {
    completed_at: new Date().toISOString(),
    seasons: config.seasons,
    total_plays: totalPlays,
    total_games: totalGames,
    files: await fs.readdir(OUTPUT_DIR)
  };
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'load_summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log('\n📝 Next Step: node nfl-model-v2/scripts/03-generate-features.mjs\n');
}

// Run main function
main().catch(error => {
  console.error('\n❌ Fatal Error:', error);
  process.exit(1);
});
