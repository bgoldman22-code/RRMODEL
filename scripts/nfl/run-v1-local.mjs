#!/usr/bin/env node
/**
 * Local runner for NFL V1 Predictions with FRESH ODDS
 * Usage: ODDS_API_KEY=<key> node scripts/nfl/run-v1-local.mjs [season] [week]
 * Example: ODDS_API_KEY=xxx node scripts/nfl/run-v1-local.mjs 2025 14
 * 
 * This script ALWAYS runs locally with fresh odds (never uses cached production data)
 * Requires ODDS_API_KEY environment variable for live odds
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '../..');

// Check for ODDS_API_KEY
if (!process.env.ODDS_API_KEY) {
  console.error('❌ ERROR: ODDS_API_KEY environment variable required for fresh odds');
  console.error('Usage: ODDS_API_KEY=<your_key> node scripts/nfl/run-v1-local.mjs [season] [week]');
  process.exit(1);
}

// Import V1 handler (required for local execution)
let v1Handler = null;

try {
  const v1Module = await import('../../netlify/functions/nfl-predictions-generate/index.mjs');
  v1Handler = v1Module.default;
  console.log('✅ Loaded V1 handler locally with fresh odds support');
} catch (error) {
  console.error('❌ Failed to load V1 handler locally:', error.message);
  console.error('Cannot run without local handler access');
  process.exit(1);
}

// Parse command line args
const season = process.argv[2] || '2025';
const week = process.argv[3] || getCurrentWeek();

function getCurrentWeek() {
  const now = new Date();
  // Week 14 starts around Dec 5, 2024
  // This is a rough estimate - adjust as needed
  const weekStart = new Date('2024-09-05'); // Week 1 start
  const weeksDiff = Math.floor((now - weekStart) / (7 * 24 * 60 * 60 * 1000));
  return Math.min(Math.max(weeksDiff + 1, 1), 18);
}


console.log(`\n🏈 Running NFL V1 Predictions (LOCAL MODE - FRESH ODDS)`);
console.log(`Season: ${season}, Week: ${week}`);
console.log(`ODDS_API_KEY: ${process.env.ODDS_API_KEY.substring(0, 8)}...`);
console.log(`⏰ Fetch Time: ${new Date().toISOString()}\n`);

// Run locally with fresh odds
const mockRequest = {
  url: `http://localhost:8888/.netlify/functions/nfl-predictions-generate?season=${season}&week=${week}`,
  method: 'GET',
  headers: new Map()
};

const mockContext = {
  log: console.log,
  error: console.error
};

try {
  const response = await v1Handler(mockRequest, mockContext);
  const result = await response.json();
  
  console.log('\n✅ V1 Predictions Generated with FRESH ODDS!\n');
  console.log(JSON.stringify(result, null, 2));
  
  if (result.predictions) {
    console.log(`\n📊 Summary:`);
    console.log(`  - Total Games: ${result.predictions.length}`);
    const spreadsWithBets = result.predictions.filter(p => p.predictions?.spread?.betRecommendation === 'BET').length;
    const moneylinesWithBets = result.predictions.filter(p => p.predictions?.moneyline?.betRecommendation === 'BET').length;
    const totalsWithBets = result.predictions.filter(p => p.predictions?.total?.betRecommendation === 'BET').length;
    console.log(`  - Recommended Spread Bets: ${spreadsWithBets}`);
    console.log(`  - Recommended ML Bets: ${moneylinesWithBets}`);
    console.log(`  - Recommended Total Bets: ${totalsWithBets}`);
    
    if (result.oddsMetadata) {
      console.log(`\n📡 Odds Metadata:`);
      console.log(`  - Fetch Time: ${result.oddsMetadata.fetchTime || 'N/A'}`);
      console.log(`  - Games with Odds: ${result.oddsMetadata.gamesWithOdds || 0}`);
      console.log(`  - Source: ${result.oddsMetadata.source || 'Unknown'}`);
    }
  }
  
} catch (error) {
  console.error('\n❌ Error running V1 predictions:');
  console.error(error);
  console.error('\nStack trace:', error.stack);
  process.exit(1);
}

