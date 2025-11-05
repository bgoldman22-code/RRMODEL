#!/usr/bin/env node
/**
 * NFL Model V2 - Historical Odds Fetcher
 * 
 * Fetches historical closing lines from TheOddsAPI for 2020-2024 seasons.
 * Stores data locally in data/historical-odds/
 * 
 * Run: node nfl-model-v2/scripts/01-fetch-historical-odds.mjs
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = JSON.parse(
  await fs.readFile(path.join(__dirname, '../config.json'), 'utf-8')
);

const API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';
const OUTPUT_DIR = path.join(__dirname, '../data/historical-odds');

// Ensure API key is set
if (!API_KEY) {
  console.error('❌ ERROR: ODDS_API_KEY environment variable not set');
  console.log('\nPlease add your TheOddsAPI key to .env file:');
  console.log('ODDS_API_KEY=your_key_here\n');
  process.exit(1);
}

/**
 * Fetch historical odds for a specific date (snapshot)
 * Uses TheOddsAPI historical endpoint which returns closest snapshot <= date
 */
async function fetchHistoricalOdds(date) {
  const url = `${BASE_URL}/historical/sports/${config.odds_api.sport}/odds`;
  
  // Historical endpoint requires ISO 8601 timestamp
  // Set to end of Sunday (when week typically ends) to get closing lines
  const timestamp = `${date}T23:00:00Z`;
  
  const params = new URLSearchParams({
    apiKey: API_KEY,
    regions: config.odds_api.regions,
    markets: config.odds_api.markets.join(','),
    oddsFormat: config.odds_api.oddsFormat,
    date: timestamp
  });

  console.log(`\n📡 Fetching historical snapshot for ${timestamp}...`);
  
  try {
    const response = await fetch(`${url}?${params}`);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error ${response.status}: ${error}`);
    }
    
    const snapshot = await response.json();
    
    // Log API usage (historical costs 10 credits per region per market)
    const remaining = response.headers.get('x-requests-remaining');
    const used = response.headers.get('x-requests-used');
    console.log(`   API Credits: ${used} used, ${remaining} remaining`);
    console.log(`   Snapshot timestamp: ${snapshot.timestamp}`);
    console.log(`   Games in snapshot: ${snapshot.data?.length || 0}`);
    
    return snapshot;
  } catch (error) {
    console.error(`   ❌ Failed to fetch odds: ${error.message}`);
    return null;
  }
}

/**
 * Generate date ranges for NFL regular season weeks
 * NFL season runs September through January (skip preseason)
 * 
 * Historical data available from 2020-06-06 onwards
 */
function generateSeasonDates(season) {
  const weeks = [];
  
  // NFL season start dates vary by year, but typically:
  // - First full week is after Labor Day (early September)
  // - Each week is Thu-Mon with games Thu/Sun/Mon
  // - Get closing lines on Tuesday morning after week ends
  
  const seasonStartDates = {
    2020: '2020-09-10', // Week 1: Sep 10-14
    2021: '2021-09-09', // Week 1: Sep 9-13
    2022: '2022-09-08', // Week 1: Sep 8-12
    2023: '2023-09-07', // Week 1: Sep 7-11
    2024: '2024-09-05'  // Week 1: Sep 5-9
  };
  
  const startDate = new Date(seasonStartDates[season] || `${season}-09-10`);
  
  // Regular season only (skip preseason)
  for (let week = 1; week <= config.weeks_regular_season; week++) {
    const weekDate = new Date(startDate);
    weekDate.setDate(startDate.getDate() + (week - 1) * 7);
    
    // Get snapshot on Tuesday after week ends (closing lines locked)
    weekDate.setDate(weekDate.getDate() + 2); // +2 days to Tuesday
    
    weeks.push({
      season,
      week,
      date: weekDate.toISOString().split('T')[0],
      description: `Week ${week} closing lines`
    });
  }
  
  return weeks;
}

/**
 * Save odds data to file
 */
async function saveOddsData(season, week, data) {
  const seasonDir = path.join(OUTPUT_DIR, String(season));
  await fs.mkdir(seasonDir, { recursive: true });
  
  const filename = path.join(seasonDir, `week${week}.json`);
  await fs.writeFile(filename, JSON.stringify(data, null, 2));
  
  console.log(`   ✅ Saved to ${filename}`);
}

/**
 * Load existing odds data (to avoid re-fetching)
 */
async function hasExistingData(season, week) {
  const filename = path.join(OUTPUT_DIR, String(season), `week${week}.json`);
  try {
    await fs.access(filename);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract closing lines from historical snapshot data
 * Historical API returns data wrapped in snapshot structure
 */
function extractClosingLines(snapshot) {
  const games = [];
  
  // Historical API wraps data in snapshot structure
  const events = snapshot.data || [];
  
  for (const event of events) {
    // Skip preseason games
    if (event.sport_title && event.sport_title.includes('Preseason')) {
      continue;
    }
    
    const game = {
      id: event.id,
      commence_time: event.commence_time,
      home_team: event.home_team,
      away_team: event.away_team,
      snapshot_timestamp: snapshot.timestamp,
      bookmakers: {}
    };
    
    // Extract odds from each bookmaker
    for (const bookmaker of event.bookmakers || []) {
      const books = {};
      
      for (const market of bookmaker.markets || []) {
        if (market.key === 'spreads') {
          const homeOutcome = market.outcomes.find(o => o.name === event.home_team);
          const awayOutcome = market.outcomes.find(o => o.name === event.away_team);
          
          books.spread = {
            home_line: homeOutcome?.point,
            away_line: awayOutcome?.point,
            home_price: homeOutcome?.price,
            away_price: awayOutcome?.price,
            last_update: bookmaker.last_update
          };
        } else if (market.key === 'totals') {
          const overOutcome = market.outcomes.find(o => o.name === 'Over');
          const underOutcome = market.outcomes.find(o => o.name === 'Under');
          
          books.total = {
            line: overOutcome?.point || underOutcome?.point,
            over_price: overOutcome?.price,
            under_price: underOutcome?.price,
            last_update: bookmaker.last_update
          };
        } else if (market.key === 'h2h') {
          const homeOutcome = market.outcomes.find(o => o.name === event.home_team);
          const awayOutcome = market.outcomes.find(o => o.name === event.away_team);
          
          books.moneyline = {
            home_price: homeOutcome?.price,
            away_price: awayOutcome?.price,
            last_update: bookmaker.last_update
          };
        }
      }
      
      game.bookmakers[bookmaker.key] = books;
    }
    
    games.push(game);
  }
  
  return games;
}

/**
 * Main execution
 */
async function main() {
  console.log('🏈 NFL Model V2 - Historical Odds Fetcher');
  console.log('=' .repeat(60));
  console.log(`Seasons: ${config.seasons.join(', ')}`);
  console.log(`Markets: ${config.odds_api.markets.join(', ')}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('=' .repeat(60));
  
  let totalGames = 0;
  let skippedWeeks = 0;
  let fetchedWeeks = 0;
  
  for (const season of config.seasons) {
    console.log(`\n📅 Processing ${season} Season...`);
    
    const weeks = generateSeasonDates(season);
    
    for (const { week, date, description } of weeks) {
      // Check if we already have this data
      if (await hasExistingData(season, week)) {
        console.log(`   ⏭️  Week ${week} already exists, skipping...`);
        skippedWeeks++;
        continue;
      }
      
      // Fetch historical snapshot for this week
      const snapshot = await fetchHistoricalOdds(date);
      
      if (snapshot && snapshot.data) {
        const closingLines = extractClosingLines(snapshot);
        
        // Filter for games within next 7 days (snapshot contains upcoming week's games)
        // Snapshot date is typically Saturday before games start (Thu/Sun/Mon)
        const weekGames = closingLines.filter(g => {
          const gameDate = new Date(g.commence_time);
          const snapshotDate = new Date(date);
          const weekEnd = new Date(snapshotDate);
          weekEnd.setDate(snapshotDate.getDate() + 7); // Look forward 7 days
          return gameDate >= snapshotDate && gameDate <= weekEnd;
        });
        
        await saveOddsData(season, week, {
          season,
          week,
          fetch_date: date,
          snapshot_timestamp: snapshot.timestamp,
          previous_timestamp: snapshot.previous_timestamp,
          next_timestamp: snapshot.next_timestamp,
          games: weekGames,
          metadata: {
            fetched_at: new Date().toISOString(),
            games_count: weekGames.length,
            total_snapshot_games: closingLines.length,
            description: description
          }
        });
        
        totalGames += weekGames.length;
        fetchedWeeks++;
        
        console.log(`   📊 Found ${weekGames.length} games for this week`);
        console.log(`   💰 Cost: 10 credits (historical snapshot)`);
      } else {
        console.log(`   ⚠️  No snapshot available for Week ${week}`);
      }
      
      // Rate limiting: wait 2 seconds between requests (historical endpoint is slower)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Historical Odds Fetch Complete!');
  console.log(`   Fetched: ${fetchedWeeks} weeks`);
  console.log(`   Skipped: ${skippedWeeks} weeks (already existed)`);
  console.log(`   Total Games: ${totalGames}`);
  console.log(`   Saved to: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  // Save summary
  const summary = {
    completed_at: new Date().toISOString(),
    seasons: config.seasons,
    weeks_fetched: fetchedWeeks,
    weeks_skipped: skippedWeeks,
    total_games: totalGames
  };
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'fetch_summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log('\n📝 Next Step: node nfl-model-v2/scripts/02-prepare-nflverse-data.mjs\n');
}

// Run main function
main().catch(error => {
  console.error('\n❌ Fatal Error:', error);
  process.exit(1);
});
