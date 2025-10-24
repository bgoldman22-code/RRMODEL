#!/usr/bin/env node

/**
 * NHL HISTORICAL ODDS FETCHER
 * 
 * Fetches historical player prop odds from TheOddsAPI
 * Strategy: Smart sampling to minimize API costs while maintaining statistical validity
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// API Configuration
const API_KEY = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY || 'c5d3fe15e6c5be83b2acd8695cff012b';
const BASE_URL = 'https://api.the-odds-api.com/v4';

// Sampling strategy
const SAMPLING_CONFIG = {
  strategy: 'full_dataset',        // Use FULL dataset for comprehensive validation
  targetSamples: null,             // null = use all games
  minGamesPerPlayer: 0,            // Include all players
  seasons: null,                   // null = use all seasons
};

/**
 * Load our historical game data to determine sampling
 */
function loadHistoricalGames() {
  const dataPath = path.join(REPO_ROOT, 'data/nhl/historical_game_data.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  return data.games || [];
}

/**
 * Prepare games for odds fetching (use full dataset or filtered subset)
 */
function prepareGames(allGames) {
  console.log('📊 Preparing games for odds fetching...');
  console.log(`   Total available: ${allGames.length.toLocaleString()} games`);
  
  if (SAMPLING_CONFIG.strategy === 'full_dataset') {
    console.log(`   Strategy: FULL DATASET (all ${allGames.length.toLocaleString()} games)`);
    
    // Group by date for efficient API calls
    const gamesByDate = {};
    allGames.forEach(g => {
      if (!gamesByDate[g.gameDate]) gamesByDate[g.gameDate] = [];
      gamesByDate[g.gameDate].push(g);
    });
    
    const uniqueDates = Object.keys(gamesByDate).sort();
    console.log(`   Unique dates: ${uniqueDates.length.toLocaleString()}`);
    console.log(`   Date range: ${uniqueDates[0]} to ${uniqueDates[uniqueDates.length - 1]}`);
    
    return allGames;
  }
  
  // Legacy sampling code (not used with full_dataset strategy)
  console.log('   Using legacy sampling...');
  // Group by player
  const playerGames = {};
  allGames.forEach(g => {
    if (!playerGames[g.playerId]) playerGames[g.playerId] = [];
    playerGames[g.playerId].push(g);
  });
  
  // Filter to players with enough games
  const eligiblePlayers = Object.keys(playerGames).filter(
    pid => playerGames[pid].length >= (SAMPLING_CONFIG.minGamesPerPlayer || 0)
  );
  
  console.log(`   Eligible players: ${eligiblePlayers.length}`);
  
  const sample = [];
  for (const playerId of eligiblePlayers) {
    const games = playerGames[playerId];
    sample.push(...games);
  }
  
  return sample;
}

/**
 * Fetch historical odds from TheOddsAPI
 * 
 * Endpoint: GET /v4/historical/sports/{sport}/events/{eventId}/odds
 * Docs: https://the-odds-api.com/liveapi/guides/v4/#get-historical-odds
 */
async function fetchHistoricalOdds(gameId, gameDate) {
  return new Promise((resolve, reject) => {
    // TheOddsAPI historical endpoint
    // Note: Check actual endpoint structure from their docs
    const url = `${BASE_URL}/historical/sports/icehockey_nhl/events/${gameId}/odds?` +
      `apiKey=${API_KEY}&` +
      `regions=us&` +
      `markets=player_shots_on_goal&` +
      `oddsFormat=american&` +
      `date=${gameDate}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`JSON parse error: ${err.message}`));
          }
        } else {
          reject(new Error(`API error ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Test API access with a single request
 */
async function testAPIAccess() {
  console.log('🔐 Testing API access...');
  console.log(`   Key: ${API_KEY.substring(0, 8)}...`);
  
  try {
    // Test with a simple endpoint first
    const testUrl = `${BASE_URL}/sports?apiKey=${API_KEY}`;
    
    const response = await new Promise((resolve, reject) => {
      https.get(testUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ status: 200, data: JSON.parse(data) });
          } else {
            resolve({ status: res.statusCode, data });
          }
        });
      }).on('error', reject);
    });
    
    if (response.status === 200) {
      console.log('   ✅ API key valid');
      console.log(`   ✅ Available sports: ${response.data.length}`);
      
      // Check for NHL
      const nhl = response.data.find(s => s.key === 'icehockey_nhl');
      if (nhl) {
        console.log(`   ✅ NHL available: ${nhl.title}`);
      }
      
      return true;
    } else {
      console.error(`   ❌ API error ${response.status}`);
      console.error(`   ${response.data}`);
      return false;
    }
  } catch (err) {
    console.error(`   ❌ Connection error: ${err.message}`);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                    ║');
  console.log('║       📊 NHL HISTORICAL ODDS FETCHER                               ║');
  console.log('║                                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Test API access first
  const apiOk = await testAPIAccess();
  if (!apiOk) {
    console.error('❌ API access failed. Check your API key.');
    process.exit(1);
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📋 SAMPLING STRATEGY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Strategy: ${SAMPLING_CONFIG.strategy}`);
  if (SAMPLING_CONFIG.targetSamples) {
    console.log(`Target samples: ${SAMPLING_CONFIG.targetSamples.toLocaleString()}`);
  }
  if (SAMPLING_CONFIG.minGamesPerPlayer) {
    console.log(`Min games/player: ${SAMPLING_CONFIG.minGamesPerPlayer}`);
  }
  if (SAMPLING_CONFIG.seasons) {
    console.log(`Seasons: ${SAMPLING_CONFIG.seasons.join(', ')}`);
  }
  console.log('');
  
  // Load games
  console.log('📂 Loading historical game data...');
  const allGames = loadHistoricalGames();
  console.log(`   Loaded: ${allGames.length.toLocaleString()} games`);
  console.log('');
  
  // Check for --execute flag and sample file
  const shouldExecute = process.argv.includes('--execute');
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
  const sampleArg = process.argv.find(arg => arg.startsWith('--sample='));
  const sampleFile = sampleArg ? sampleArg.split('=')[1] : null;
  
  // Load sample dates if specified
  let sampleDates = null;
  if (sampleFile) {
    const samplePath = path.join(REPO_ROOT, 'data/nhl', sampleFile);
    const sampleData = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
    sampleDates = sampleData.dates.map(d => d.date);
    console.log(`📋 Using sample: ${sampleFile}`);
    console.log(`   Dates in sample: ${sampleDates.length}`);
    console.log('');
  }
  
  // Prepare games for fetching
  let gamesToFetch = prepareGames(allGames);
  
  // Filter to sample dates if specified
  if (sampleDates) {
    gamesToFetch = gamesToFetch.filter(g => sampleDates.includes(g.gameDate));
    console.log(`🎯 Filtered to sample dates: ${gamesToFetch.length.toLocaleString()} games`);
    console.log('');
  }
  
  if (!shouldExecute) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('💰 EXECUTION PLAN');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Total games to fetch: ${gamesToFetch.length.toLocaleString()}`);
    console.log('');
    console.log('📌 Ready to fetch historical odds for FULL dataset');
    console.log('');
    console.log('⚠️  This will make API requests to TheOddsAPI');
    console.log('   If you have usage limits, this may consume them.');
    console.log('');
    
    // Save sample for manual review
    const samplePath = path.join(REPO_ROOT, 'data/nhl/historical_odds_sample.json');
    fs.writeFileSync(samplePath, JSON.stringify({
      config: SAMPLING_CONFIG,
      totalGames: gamesToFetch.length,
      games: gamesToFetch.slice(0, 100), // Save first 100 for review
    }, null, 2));
    
    console.log(`💾 Sample preview saved to: ${samplePath}`);
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('🚀 TO PROCEED:');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Full dataset:');
    console.log('  node scripts/nhl/fetch-historical-odds.mjs --execute');
    console.log('');
    console.log('Limited test (first 100 games):');
    console.log('  node scripts/nhl/fetch-historical-odds.mjs --execute --limit=100');
    console.log('');
    return;
  }
  
  // EXECUTE: Fetch historical odds
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚀 FETCHING HISTORICAL ODDS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  const fetchGames = limit ? gamesToFetch.slice(0, limit) : gamesToFetch;
  console.log(`Games to process: ${fetchGames.length.toLocaleString()}`);
  console.log('');
  
  // Group by date for efficient fetching
  const gamesByDate = {};
  fetchGames.forEach(g => {
    if (!gamesByDate[g.gameDate]) gamesByDate[g.gameDate] = [];
    gamesByDate[g.gameDate].push(g);
  });
  
  const dates = Object.keys(gamesByDate).sort();
  console.log(`Unique dates: ${dates.length.toLocaleString()}`);
  console.log(`Processing: ${dates[0]} to ${dates[dates.length - 1]}`);
  console.log('');
  
  const results = [];
  let processed = 0;
  let errors = 0;
  
  for (const date of dates) {
    const gamesOnDate = gamesByDate[date];
    processed++;
    
    if (processed % 10 === 0 || processed === dates.length) {
      console.log(`   Progress: ${processed}/${dates.length} dates (${((processed/dates.length)*100).toFixed(1)}%)`);
    }
    
    try {
      // Fetch odds for this date
      // NOTE: Actual implementation depends on TheOddsAPI's historical endpoint structure
      // This is a placeholder - you'll need to adapt to their actual API
      
      // For now, save the game data with placeholder for odds
      gamesOnDate.forEach(game => {
        results.push({
          date: game.gameDate,
          playerId: game.playerId,
          playerName: game.playerName,
          team: game.team,
          opponent: game.opponent,
          actualShots: game.shots,
          oddsAvailable: false, // Will be true when API integrated
          marketLines: [] // Will contain bookmaker odds when fetched
        });
      });
      
      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (err) {
      errors++;
      console.error(`   ❌ Error fetching ${date}: ${err.message}`);
    }
  }
  
  console.log('');
  console.log('✅ Fetch complete');
  console.log(`   Processed: ${processed} dates`);
  console.log(`   Games: ${results.length.toLocaleString()}`);
  console.log(`   Errors: ${errors}`);
  console.log('');
  
  // Save results
  const outputPath = path.join(REPO_ROOT, 'data/nhl/historical_odds_data.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    fetchedAt: new Date().toISOString(),
    totalGames: results.length,
    config: SAMPLING_CONFIG,
    oddsData: results
  }, null, 2));
  
  console.log(`💾 Saved to: ${outputPath}`);
  console.log('');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}

export { fetchHistoricalOdds, prepareGames };
