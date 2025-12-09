#!/usr/bin/env node
/**
 * NFL V1 Predictions with GUARANTEED FRESH ODDS
 * Usage: ODDS_API_KEY=<key> node scripts/nfl/run-v1-fresh-odds.mjs [season] [week]
 * Example: ODDS_API_KEY=xxx node scripts/nfl/run-v1-fresh-odds.mjs 2025 14
 * 
 * This script always fetches fresh odds from TheOddsAPI and forces a new prediction run.
 * NO CACHING - every run is fresh data.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '../..');

// Check for ODDS_API_KEY
if (!process.env.ODDS_API_KEY) {
  console.error('❌ ERROR: ODDS_API_KEY environment variable required for fresh odds');
  console.error('Usage: ODDS_API_KEY=<your_key> node scripts/nfl/run-v1-fresh-odds.mjs [season] [week]');
  process.exit(1);
}

// Parse command line args
const season = process.argv[2] || '2025';
const week = process.argv[3] || getCurrentWeek();

function getCurrentWeek() {
  const now = new Date();
  const weekStart = new Date('2024-09-05'); // Week 1 start (2024 season)
  const weeksDiff = Math.floor((now - weekStart) / (7 * 24 * 60 * 60 * 1000));
  return Math.min(Math.max(weeksDiff + 1, 1), 18);
}

const fetchTime = new Date().toISOString();

console.log(`\n🏈 NFL V1 Predictions with FRESH ODDS`);
console.log(`Season: ${season}, Week: ${week}`);
console.log(`⏰ Fetch Time: ${fetchTime}`);
console.log(`🔑 API Key: ${process.env.ODDS_API_KEY.substring(0, 8)}...`);
console.log(`\n📡 Fetching fresh odds from TheOddsAPI + generating predictions...\n`);

// Add cache-busting timestamp to force fresh execution
const cacheBuster = Date.now();
const url = `https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?season=${season}&week=${week}&_t=${cacheBuster}`;

try {
  const response = await fetch(url, {
    headers: {
      'X-Odds-API-Key': process.env.ODDS_API_KEY, // Pass key to production function
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const result = await response.json();
  
  console.log('\n✅ V1 Predictions Generated with FRESH ODDS!\n');
  
  // Display odds metadata FIRST to verify freshness
  if (result.oddsMetadata) {
    console.log('📊 ODDS FRESHNESS CHECK:');
    console.log(`  ⏰ Fetch Time: ${result.oddsMetadata.fetchTime}`);
    console.log(`  📡 Source: ${result.oddsMetadata.source}`);
    console.log(`  🎲 Games with Odds: ${result.oddsMetadata.gamesWithOdds}`);
    console.log(`  🔑 API Key Used: ${result.oddsMetadata.apiKeyPresent ? 'YES ✅' : 'NO ❌'}`);
    console.log('');
  } else {
    console.warn('⚠️  WARNING: No odds metadata found - may be using cached data!\n');
  }
  
  // Show predictions
  console.log(JSON.stringify(result, null, 2));
  
  if (result.predictions) {
    console.log(`\n📈 BETTING SUMMARY:`);
    console.log(`  - Total Games: ${result.predictions.length}`);
    const spreadsWithBets = result.predictions.filter(p => p.predictions?.spread?.betRecommendation === 'BET').length;
    const moneylinesWithBets = result.predictions.filter(p => p.predictions?.moneyline?.betRecommendation === 'BET').length;
    const totalsWithBets = result.predictions.filter(p => p.predictions?.total?.betRecommendation === 'BET').length;
    console.log(`  - Recommended Spread Bets: ${spreadsWithBets}`);
    console.log(`  - Recommended ML Bets: ${moneylinesWithBets}`);
    console.log(`  - Recommended Total Bets: ${totalsWithBets}`);
    
    // Show specific game if requested
    if (process.argv[4]) {
      const teamCode = process.argv[4].toUpperCase();
      const game = result.predictions.find(p => 
        p.home_team === teamCode || p.away_team === teamCode
      );
      if (game) {
        console.log(`\n🎯 ${teamCode} GAME DETAILS:`);
        console.log(JSON.stringify(game, null, 2));
      }
    }
  }
  
  // Warning about data staleness
  const fetchAge = Date.now() - new Date(result.oddsMetadata?.fetchTime || 0).getTime();
  const ageMinutes = Math.floor(fetchAge / 60000);
  if (ageMinutes > 5) {
    console.log(`\n⚠️  WARNING: Odds data is ${ageMinutes} minutes old - consider re-running for freshest lines`);
  } else {
    console.log(`\n✅ Odds are fresh (${ageMinutes} minutes old)`);
  }
  
} catch (error) {
  console.error('\n❌ Error fetching V1 predictions with fresh odds:');
  console.error(error.message);
  console.error('\nStack:', error.stack);
  process.exit(1);
}
