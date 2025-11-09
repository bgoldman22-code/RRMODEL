#!/usr/bin/env node

/**
 * Historical MLB Home Run Odds Collector
 * 
 * Strategy: Two-step event-specific endpoint
 * 1. Get all game IDs for a date (10 credits)
 * 2. Query each game for batter_home_runs market (10 credits/game)
 * 
 * Cost: ~160 credits per date (10 + 15 games × 10)
 * Full 2024-2025: 324 dates × 160 = ~51,840 credits
 * 
 * Budget: 60,000 credits APPROVED ✅
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== CONFIG ====================
const API_KEY = process.env.THEODDS_API_KEY;
if (!API_KEY) {
  console.error('❌ ERROR: THEODDS_API_KEY environment variable not set');
  console.error('💡 Set it in Netlify UI: Site settings → Build & deploy → Environment');
  process.exit(1);
}

const SPORT = 'baseball_mlb';
const REGION = 'us';
const MARKET = 'batter_home_runs';

const MAX_CREDITS = 190000; // Auto-stop at 190K to preserve 10K buffer ✅
const CREDITS_USED_FILE = path.join(__dirname, '../data/mlb_historical/odds/credits_used.json');
const OUTPUT_DIR = path.join(__dirname, '../data/mlb_historical/odds');

// MLB Season dates (Opening Day to end of regular season)
const SEASON_DATES = {
  2024: {
    start: '2024-03-28',
    end: '2024-09-29'
  },
  2025: {
    start: '2025-03-27',
    end: '2025-09-28'
  }
};

// ==================== UTILITIES ====================

function loadCreditsUsed() {
  try {
    if (fs.existsSync(CREDITS_USED_FILE)) {
      return JSON.parse(fs.readFileSync(CREDITS_USED_FILE, 'utf8'));
    }
  } catch (err) {
    console.warn('⚠️  Could not load credits file, starting fresh');
  }
  return { total: 0, history: [] };
}

function saveCreditsUsed(data) {
  fs.mkdirSync(path.dirname(CREDITS_USED_FILE), { recursive: true });
  fs.writeFileSync(CREDITS_USED_FILE, JSON.stringify(data, null, 2));
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      const remaining = response.headers.get('x-requests-remaining');
      const used = response.headers.get('x-requests-used');
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error (attempt ${i + 1}/${maxRetries}):`, errorText.substring(0, 200));
        
        if (i === maxRetries - 1) {
          throw new Error(`API request failed after ${maxRetries} attempts`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
        continue;
      }
      
      const data = await response.json();
      return { data, remaining, used };
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
}

function generateDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

// ==================== CORE FUNCTIONS ====================

/**
 * Step 1: Get all game IDs for a specific date
 * Cost: 10 credits
 */
async function getGameIdsForDate(date) {
  const timestamp = `${date}T12:00:00Z`; // Noon UTC
  const url = `https://api.the-odds-api.com/v4/historical/sports/${SPORT}/odds?` +
    `apiKey=${API_KEY}&regions=${REGION}&markets=h2h&date=${timestamp}`;
  
  console.log(`📅 Fetching game IDs for ${date}...`);
  
  const result = await fetchWithRetry(url);
  const games = result.data.data || [];
  
  console.log(`   ✅ Found ${games.length} games (10 credits used, ${result.remaining} remaining)`);
  
  return games.map(game => ({
    id: game.id,
    home_team: game.home_team,
    away_team: game.away_team,
    commence_time: game.commence_time
  }));
}

/**
 * Step 2: Get player props for specific game
 * Cost: 10 credits per game
 */
async function getPlayerPropsForGame(gameId, date) {
  const timestamp = `${date}T12:00:00Z`;
  const url = `https://api.the-odds-api.com/v4/historical/sports/${SPORT}/events/${gameId}/odds?` +
    `apiKey=${API_KEY}&regions=${REGION}&markets=${MARKET}&date=${timestamp}`;
  
  try {
    const result = await fetchWithRetry(url);
    return result.data;
  } catch (err) {
    console.error(`   ⚠️  Failed to get props for game ${gameId}:`, err.message);
    return null;
  }
}

/**
 * Collect all odds for a specific date
 */
async function collectOddsForDate(date, creditsTracker) {
  const outputFile = path.join(OUTPUT_DIR, date.substring(0, 4), `${date}.json`);
  
  // Skip if already collected
  if (fs.existsSync(outputFile)) {
    console.log(`⏭️  ${date} already collected, skipping...`);
    return { date, skipped: true, creditsUsed: 0 };
  }
  
  try {
    // Step 1: Get game IDs (10 credits)
    const games = await getGameIdsForDate(date);
    creditsTracker.total += 10;
    
    if (games.length === 0) {
      console.log(`   ℹ️  No games on ${date}`);
      return { date, games: 0, creditsUsed: 10 };
    }
    
    // Check budget before continuing
    if (creditsTracker.total + (games.length * 10) > MAX_CREDITS) {
      console.error(`\n🛑 BUDGET LIMIT REACHED!`);
      console.error(`   Current: ${creditsTracker.total.toLocaleString()} credits`);
      console.error(`   Would need: ${(games.length * 10).toLocaleString()} more for this date`);
      console.error(`   Max budget: ${MAX_CREDITS.toLocaleString()} credits`);
      throw new Error('BUDGET_EXCEEDED');
    }
    
    // Step 2: Get player props for each game (10 credits × games)
    console.log(`   🎯 Fetching HR odds for ${games.length} games...`);
    const gamesWithOdds = [];
    
    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      console.log(`      [${i + 1}/${games.length}] ${game.away_team} @ ${game.home_team}...`);
      
      const oddsData = await getPlayerPropsForGame(game.id, date);
      creditsTracker.total += 10;
      
      if (oddsData && oddsData.data) {
        const bookmakerCount = oddsData.data.bookmakers?.length || 0;
        const playerCount = oddsData.data.bookmakers
          ?.flatMap(b => b.markets?.flatMap(m => m.outcomes || []) || [])
          .filter(o => o.name === 'Over')
          .length || 0;
        
        console.log(`         ✅ ${bookmakerCount} books, ${playerCount} players (10 credits)`);
        gamesWithOdds.push(oddsData.data);
      } else {
        console.log(`         ⚠️  No odds data (10 credits wasted)`);
      }
      
      // Rate limit: 0.5s between requests
      if (i < games.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Save results
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    const output = {
      date,
      timestamp: new Date().toISOString(),
      games_count: gamesWithOdds.length,
      credits_used: 10 + (games.length * 10),
      games: gamesWithOdds
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    
    const totalCredits = 10 + (games.length * 10);
    console.log(`   💾 Saved ${gamesWithOdds.length} games (${totalCredits} credits total)\n`);
    
    return {
      date,
      games: gamesWithOdds.length,
      creditsUsed: totalCredits
    };
    
  } catch (err) {
    if (err.message === 'BUDGET_EXCEEDED') {
      throw err;
    }
    console.error(`❌ Error collecting ${date}:`, err.message);
    return { date, error: err.message, creditsUsed: 0 };
  }
}

// ==================== MAIN ====================

async function main() {
  console.log('🚀 Historical MLB HR Odds Collector');
  console.log('=' .repeat(60));
  console.log(`📊 Budget: ${MAX_CREDITS.toLocaleString()} credits`);
  console.log(`🎯 Market: ${MARKET}`);
  console.log(`🏟️  Regions: ${REGION}`);
  console.log('=' .repeat(60));
  console.log();
  
  // Load credits tracker
  const creditsTracker = loadCreditsUsed();
  console.log(`💰 Credits already used: ${creditsTracker.total.toLocaleString()}`);
  console.log(`💳 Credits remaining: ${(MAX_CREDITS - creditsTracker.total).toLocaleString()}`);
  console.log();
  
  // Generate date ranges for both seasons
  const dates2024 = generateDateRange(SEASON_DATES[2024].start, SEASON_DATES[2024].end);
  const dates2025 = generateDateRange(SEASON_DATES[2025].start, SEASON_DATES[2025].end);
  const allDates = [...dates2024, ...dates2025].sort();
  
  console.log(`📅 Collection plan:`);
  console.log(`   2024: ${dates2024.length} dates (${SEASON_DATES[2024].start} to ${SEASON_DATES[2024].end})`);
  console.log(`   2025: ${dates2025.length} dates (${SEASON_DATES[2025].start} to ${SEASON_DATES[2025].end})`);
  console.log(`   Total: ${allDates.length} dates`);
  console.log();
  
  // Estimate
  const avgGamesPerDate = 15;
  const estimatedTotal = allDates.length * (10 + avgGamesPerDate * 10);
  console.log(`📈 Estimated cost: ~${estimatedTotal.toLocaleString()} credits`);
  console.log(`   (${allDates.length} dates × ~160 credits/date)`);
  console.log();
  
  if (estimatedTotal > MAX_CREDITS) {
    console.warn(`⚠️  WARNING: Estimated cost exceeds budget!`);
    console.warn(`   Will stop when limit reached.`);
    console.log();
  }
  
  // Confirm before starting
  console.log('⏳ Starting collection in 5 seconds...');
  console.log('   Press Ctrl+C to cancel');
  console.log();
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Collect odds for each date
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  
  try {
    for (let i = 0; i < allDates.length; i++) {
      const date = allDates[i];
      const progress = `[${i + 1}/${allDates.length}]`;
      
      console.log(`${progress} Processing ${date}...`);
      
      const result = await collectOddsForDate(date, creditsTracker);
      results.push(result);
      
      if (result.skipped) {
        skippedCount++;
      } else if (result.error) {
        errorCount++;
      } else {
        successCount++;
      }
      
      // Save credits tracker after each date
      creditsTracker.history.push(result);
      saveCreditsUsed(creditsTracker);
      
      // Progress update every 10 dates
      if ((i + 1) % 10 === 0) {
        console.log();
        console.log(`📊 Progress Update:`);
        console.log(`   Completed: ${i + 1}/${allDates.length} dates`);
        console.log(`   Success: ${successCount} | Skipped: ${skippedCount} | Errors: ${errorCount}`);
        console.log(`   Credits used: ${creditsTracker.total.toLocaleString()}/${MAX_CREDITS.toLocaleString()}`);
        console.log();
      }
      
      // Rate limit between dates
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (err) {
    if (err.message === 'BUDGET_EXCEEDED') {
      console.log(`\n🛑 Collection stopped: Budget limit reached`);
    } else {
      throw err;
    }
  }
  
  // Final summary
  console.log();
  console.log('=' .repeat(60));
  console.log('✅ COLLECTION COMPLETE');
  console.log('=' .repeat(60));
  console.log(`📊 Results:`);
  console.log(`   Total dates processed: ${results.length}`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Skipped (already collected): ${skippedCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log();
  console.log(`💰 Credits:`);
  console.log(`   Used: ${creditsTracker.total.toLocaleString()}`);
  console.log(`   Remaining: ${(MAX_CREDITS - creditsTracker.total).toLocaleString()}`);
  console.log(`   Budget: ${MAX_CREDITS.toLocaleString()}`);
  console.log();
  console.log(`💾 Data saved to: ${OUTPUT_DIR}`);
  console.log('=' .repeat(60));
}

// Run
main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
