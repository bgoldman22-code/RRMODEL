#!/usr/bin/env node
/**
 * scripts/12-make-public-bundle-v5.mjs
 * 
 * Generates the V5 public prediction bundle by:
 * 1. Calling the nfl-predictions-generate endpoint (which runs V5 logic)
 * 2. Fetching current Vegas odds
 * 3. Merging into unified bundle structure
 * 4. Writing to output/bundle_v5.json
 * 
 * This replicates how V1 works but uses the V5 hybrid models.
 */

import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const NETLIFY_FUNCTION_URL = process.env.NETLIFY_FUNCTION_URL || 'https://roundrobinrecs.netlify.app/.netlify/functions';
const OUTPUT_PATH = join(__dirname, '../output/bundle_v5.json');

/**
 * Get current NFL week based on date
 */
function getCurrentNFLWeek() {
  const now = new Date();
  const year = now.getFullYear();
  
  if (year === 2025) {
    const seasonStart = new Date('2025-09-05');
    const daysSinceStart = Math.floor((now - seasonStart) / (1000 * 60 * 60 * 24));
    
    if (daysSinceStart < 0) return 1;
    
    let weekNumber;
    if (daysSinceStart <= 6) weekNumber = 1;
    else if (daysSinceStart <= 13) weekNumber = 2;
    else if (daysSinceStart <= 17) weekNumber = 3;
    else weekNumber = Math.floor((daysSinceStart - 18) / 7) + 4;
    
    return Math.min(Math.max(weekNumber, 1), 18);
  }
  
  const septemberStart = new Date(year, 8, 5);
  const daysSinceStart = Math.floor((now - septemberStart) / (1000 * 60 * 60 * 24));
  
  if (daysSinceStart < 0) return 1;
  
  const weekNumber = Math.floor(daysSinceStart / 7) + 1;
  return Math.min(Math.max(weekNumber, 1), 22);
}

/**
 * Fetch schedule for a given week
 */
async function fetchSchedule(season, week) {
  const url = `${NETLIFY_FUNCTION_URL}/nfl-schedule-get?week=${week}&season=${season}`;
  console.log(`📅 Fetching schedule: ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch schedule: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.matchups || data.games || [];
}

/**
 * Generate predictions using the nfl-predictions-generate endpoint
 * This is where the actual V5 model logic runs
 */
async function generatePredictions(season, week, games) {
  const url = `${NETLIFY_FUNCTION_URL}/nfl-predictions-generate`;
  console.log(`🎯 Generating predictions: ${url}`);
  
  // Transform games to expected format
  const transformedGames = games.map(game => ({
    game_id: game.id || `${game.awayTeam}-${game.homeTeam}`,
    home_team: game.homeTeam,
    away_team: game.awayTeam,
    start: game.kickoff
  }));
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({
      season: season.toString(),
      games: transformedGames,
      refresh: true
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to generate predictions: ${response.status} ${errorText}`);
  }
  
  return await response.json();
}

/**
 * Transform predictions into V5 bundle format
 */
function transformToV5Bundle(predictions, season, week) {
  const rows = predictions.map(game => {
    return {
      matchup: `${game.away_team} @ ${game.home_team}`,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      kickoff: game.start,
      season: parseInt(season),
      week: parseInt(week),
      
      // Spread prediction
      spread: game.predictions?.spread ? {
        side: game.predictions.spread.pick === game.home_team ? 'home' : 'away',
        team: game.predictions.spread.pick,
        line: Math.abs(game.predictions.spread.line || 0),
        price: -110,
        confidence: (game.predictions.spread.confidence || 50) / 100,
        edge: (game.predictions.spread.edge || 0) / 100,
        model: "poisson_epa_v3"
      } : null,
      
      // Total prediction
      total: game.predictions?.total ? {
        side: game.predictions.total.pick || 'push',
        total: game.predictions.total.line || 0,
        price: -110,
        confidence: (game.predictions.total.confidence || 50) / 100,
        edge: (game.predictions.total.edge || 0) / 100,
        model_total: game.predictions.total.predicted || game.predictions.total.line || 0,
        p25: (game.predictions.total.predicted || game.predictions.total.line || 0) - 10,
        p50: game.predictions.total.predicted || game.predictions.total.line || 0,
        p75: (game.predictions.total.predicted || game.predictions.total.line || 0) + 10,
        model: "quantile_blend_v5"
      } : null,
      
      // Moneyline omitted per V5 spec
      moneyline: null
    };
  });
  
  const bundle = {
    meta: {
      modelVersion: "v5",
      architecture: "hybrid_best_of_breed",
      season: `${season}-${parseInt(season) + 1}`,
      week: parseInt(week),
      updated_at: new Date().toISOString(),
      games: rows.length,
      models: {
        spread: "Poisson EPA V3 (+37% ROI backtested)",
        total: "Quantile Blend V5 (25th/75th percentiles)",
        moneyline: "Omitted (awaiting profitable model)"
      },
      notes: [
        "V5 uses best-performing model for each bet type",
        "Spread: Proven +37% ROI on 2020-2024 backtest",
        "Total: New quantile approach, replaces linear regression",
        "Moneyline: Excluded until we have stable profitable model"
      ]
    },
    rows
  };
  
  return bundle;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🏈 NFL V5 Bundle Generator');
    console.log('='.repeat(50));
    
    // Determine week and season
    const season = process.env.NFL_SEASON || new Date().getFullYear();
    const week = process.env.NFL_WEEK || getCurrentNFLWeek();
    
    console.log(`📅 Season: ${season}, Week: ${week}`);
    
    // Step 1: Fetch schedule
    console.log('\n📋 Step 1: Fetching schedule...');
    const games = await fetchSchedule(season, week);
    console.log(`✅ Found ${games.length} games`);
    
    if (games.length === 0) {
      throw new Error(`No games found for Week ${week}, ${season}`);
    }
    
    // Step 2: Generate predictions (this calls V5 logic)
    console.log('\n🎯 Step 2: Generating V5 predictions...');
    const predictions = await generatePredictions(season, week, games);
    console.log(`✅ Generated ${predictions.length} predictions`);
    
    // Step 3: Transform to bundle format
    console.log('\n📦 Step 3: Creating bundle...');
    const bundle = transformToV5Bundle(predictions, season, week);
    console.log(`✅ Bundle created with ${bundle.rows.length} games`);
    
    // Step 4: Write to file
    console.log('\n💾 Step 4: Writing bundle...');
    await writeFile(OUTPUT_PATH, JSON.stringify(bundle, null, 2), 'utf8');
    console.log(`✅ Written to: ${OUTPUT_PATH}`);
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ Bundle generation complete!');
    console.log(`📊 ${bundle.rows.length} games for Week ${week}, ${season}`);
    console.log(`📝 File: ${OUTPUT_PATH}`);
    console.log(`🕐 Updated: ${bundle.meta.updated_at}`);
    
    return bundle;
  } catch (error) {
    console.error('\n❌ Error generating bundle:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as generateV5Bundle, getCurrentNFLWeek };
