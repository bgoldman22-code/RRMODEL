#!/usr/bin/env node

/**
 * NBA Historical Player Props Odds Collector (CORRECTED VERSION)
 * 
 * Uses the correct TheOddsAPI endpoints:
 * 1. /v4/historical/sports/basketball_nba/events - Get event IDs for a date
 * 2. /v4/historical/sports/basketball_nba/events/{eventId}/odds - Get player props for an event
 * 
 * Cost: 10 credits per region per market per event
 * Budget: 40,000 credits
 * Target: 2024-25 NBA season (Oct 22, 2024 - Apr 13, 2025)
 * Markets: player_points, player_rebounds, player_assists
 * Expected: 1,230 games × 30 credits = 36,900 credits
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BASE_URL = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';
const REGIONS = 'us';
const MARKETS = ['player_points', 'player_rebounds', 'player_assists'];
const BOOKMAKERS = ['draftkings', 'fanduel'];
const ODDS_FORMAT = 'american';

// API limits and safety
const MAX_CREDITS = 40000;
const SAFETY_ABORT_CREDITS = 39000; // Abort if we hit this
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second between requests
const MAX_RETRIES = 3;

// CLI args
const args = process.argv.slice(2);
const apiKey = args.find(arg => arg.startsWith('--api-key='))?.split('=')[1] || process.env.ODDS_API_KEY;
const season = args.find(arg => arg.startsWith('--season='))?.split('=')[1] || '2024';
const startDate = args.find(arg => arg.startsWith('--start-date='))?.split('=')[1];
const endDate = args.find(arg => arg.startsWith('--end-date='))?.split('=')[1];
const outputPath = args.find(arg => arg.startsWith('--output='))?.split('=')[1] || 
  path.join(__dirname, `../../data/nba/historical-odds-${season}.json`);

if (!apiKey) {
  console.error('❌ ERROR: --api-key required (use --api-key=KEY or set ODDS_API_KEY env var)');
  console.log('\nUsage:');
  console.log('  node collect-historical-odds-v2.js \\');
  console.log('    --api-key=YOUR_KEY \\');
  console.log('    --season=2024 \\');
  console.log('    --start-date=2024-10-22 \\');
  console.log('    --end-date=2025-04-13 \\');
  console.log('    --output=data/nba/odds.json');
  process.exit(1);
}

// Generate date range for the season
function generateDateRange(start, end) {
  const dates = [];
  const current = new Date(start);
  const endDate = new Date(end);
  
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

// Get season date range
function getSeasonDateRange(season) {
  const seasonStart = {
    '2024': '2024-10-22',
    '2023': '2023-10-24',
    '2022': '2022-10-18'
  };
  
  const seasonEnd = {
    '2024': '2025-04-13',
    '2023': '2024-04-14',
    '2022': '2023-04-09'
  };
  
  return {
    start: startDate || seasonStart[season],
    end: endDate || seasonEnd[season]
  };
}

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with retries
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      
      // Check if we have credits remaining
      const creditsRemaining = response.headers.get('x-requests-remaining');
      const creditsUsed = response.headers.get('x-requests-used');
      
      if (creditsRemaining !== null) {
        console.log(`  Credits: ${creditsUsed || '?'} used, ${creditsRemaining} remaining`);
        
        if (parseInt(creditsRemaining) < (MAX_CREDITS - SAFETY_ABORT_CREDITS)) {
          console.error(`\n⚠️  SAFETY ABORT: Approaching credit limit (${creditsRemaining} remaining)`);
          process.exit(1);
        }
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.log(`  Retry ${i + 1}/${retries}: ${error.message}`);
      if (i === retries - 1) throw error;
      await sleep(2000 * (i + 1)); // Exponential backoff
    }
  }
}

/**
 * Step 1: Get list of event IDs for a specific date
 * Endpoint: GET /v4/historical/sports/basketball_nba/events
 * Cost: 1 credit per request
 */
async function getHistoricalEvents(date) {
  const url = `${BASE_URL}/historical/sports/${SPORT}/events`;
  const params = new URLSearchParams({
    apiKey,
    date: `${date}T12:00:00Z` // Noon on the target date
  });
  
  try {
    const data = await fetchWithRetry(`${url}?${params}`);
    
    if (!data || !data.data) {
      console.log(`  ⚠️  No events data for ${date}`);
      return [];
    }
    
    return data.data || [];
  } catch (error) {
    console.log(`  ❌ Failed to fetch events: ${error.message}`);
    return [];
  }
}

/**
 * Step 2: Get player props odds for a specific event
 * Endpoint: GET /v4/historical/sports/basketball_nba/events/{eventId}/odds
 * Cost: 10 credits per region per market (our case: 1 region × 3 markets = 30 credits)
 */
async function getEventOdds(eventId, eventDate) {
  const url = `${BASE_URL}/historical/sports/${SPORT}/events/${eventId}/odds`;
  const params = new URLSearchParams({
    apiKey,
    date: `${eventDate}T23:59:00Z`, // Get closing lines (right before game start)
    regions: REGIONS,
    markets: MARKETS.join(','),
    bookmakers: BOOKMAKERS.join(','),
    oddsFormat: ODDS_FORMAT
  });
  
  try {
    const data = await fetchWithRetry(`${url}?${params}`);
    return data;
  } catch (error) {
    console.log(`  ❌ Failed to fetch odds for ${eventId}: ${error.message}`);
    return null;
  }
}

/**
 * Main collection loop
 */
async function collectHistoricalOdds() {
  console.log('🏀 NBA Historical Player Props Odds Collector v2');
  console.log('================================================\n');
  
  const { start, end } = getSeasonDateRange(season);
  const dates = generateDateRange(start, end);
  
  console.log(`📅 Date range: ${start} to ${end}`);
  console.log(`📊 Total dates: ${dates.length}`);
  console.log(`💰 Budget: ${MAX_CREDITS.toLocaleString()} credits`);
  console.log(`🎯 Markets: ${MARKETS.join(', ')}`);
  console.log(`📚 Bookmakers: ${BOOKMAKERS.join(', ')}`);
  console.log(`💾 Output: ${outputPath}\n`);
  
  const allGamesData = [];
  let totalEvents = 0;
  let successfulEvents = 0;
  let totalCreditsUsed = 0;
  
  // Create checkpoints directory
  const checkpointDir = path.join(path.dirname(outputPath), 'checkpoints');
  if (!fs.existsSync(checkpointDir)) {
    fs.mkdirSync(checkpointDir, { recursive: true });
  }
  
  for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
    const date = dates[dateIndex];
    console.log(`\n[${dateIndex + 1}/${dates.length}] Processing ${date}...`);
    
    // Step 1: Get events for this date
    console.log('  Step 1: Fetching event IDs...');
    const events = await getHistoricalEvents(date);
    
    if (events.length === 0) {
      console.log('  No games on this date');
      await sleep(DELAY_BETWEEN_REQUESTS);
      continue;
    }
    
    console.log(`  Found ${events.length} game(s)`);
    totalEvents += events.length;
    
    // Step 2: Get odds for each event
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      console.log(`\n  Step 2: Fetching odds for game ${i + 1}/${events.length}`);
      console.log(`    ${event.away_team} @ ${event.home_team}`);
      console.log(`    Event ID: ${event.id}`);
      console.log(`    Commence: ${event.commence_time}`);
      
      const oddsData = await getEventOdds(event.id, date);
      
      if (oddsData && oddsData.data) {
        successfulEvents++;
        
        // Store the odds data with metadata
        allGamesData.push({
          date,
          eventId: event.id,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          commenceTime: event.commence_time,
          snapshot: {
            timestamp: oddsData.timestamp,
            previousTimestamp: oddsData.previous_timestamp,
            nextTimestamp: oddsData.next_timestamp
          },
          odds: oddsData.data
        });
        
        console.log(`    ✅ Success (${successfulEvents}/${totalEvents} games collected)`);
        
        // Estimate credits used (30 per game = 1 region × 3 markets × 10)
        totalCreditsUsed += 30;
        console.log(`    💰 Est. credits used: ${totalCreditsUsed.toLocaleString()}/${MAX_CREDITS.toLocaleString()}`);
      } else {
        console.log(`    ⚠️  No odds data available`);
      }
      
      await sleep(DELAY_BETWEEN_REQUESTS);
    }
    
    // Save checkpoint every 10 dates
    if ((dateIndex + 1) % 10 === 0) {
      const checkpointPath = path.join(checkpointDir, `checkpoint-${date}.json`);
      fs.writeFileSync(checkpointPath, JSON.stringify(allGamesData, null, 2));
      console.log(`\n💾 Checkpoint saved: ${checkpointPath}`);
    }
  }
  
  // Save final results
  console.log('\n\n📊 Collection Summary');
  console.log('===================');
  console.log(`Total dates processed: ${dates.length}`);
  console.log(`Total events found: ${totalEvents}`);
  console.log(`Successful collections: ${successfulEvents}`);
  console.log(`Success rate: ${((successfulEvents / totalEvents) * 100).toFixed(1)}%`);
  console.log(`Estimated credits used: ${totalCreditsUsed.toLocaleString()}`);
  
  // Save final output
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(allGamesData, null, 2));
  console.log(`\n✅ Saved ${successfulEvents} games to ${outputPath}`);
  
  // Count total player props
  let totalPlayerProps = 0;
  allGamesData.forEach(game => {
    game.odds.bookmakers?.forEach(bookmaker => {
      bookmaker.markets?.forEach(market => {
        // Count unique players (each player has Over + Under)
        const uniquePlayers = new Set(market.outcomes?.map(o => o.description)).size;
        totalPlayerProps += uniquePlayers;
      });
    });
  });
  
  console.log(`\n📈 Data Quality:`);
  console.log(`   Games collected: ${successfulEvents}`);
  console.log(`   Player props: ${totalPlayerProps.toLocaleString()}`);
  console.log(`   Avg props per game: ${(totalPlayerProps / successfulEvents).toFixed(1)}`);
  
  console.log('\n🎉 Collection complete!');
}

// Run the collector
collectHistoricalOdds().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
