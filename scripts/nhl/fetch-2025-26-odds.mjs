#!/usr/bin/env node

/**
 * NHL 2025-26 SEASON ODDS FETCHER
 * 
 * Fetches historical odds data for the 2025-26 NHL season using TheOddsAPI historical endpoints.
 * Based on fetch-historical-odds-v2.mjs but configured for Oct 15 - Nov 13, 2025.
 * 
 * Proper API usage:
 * 1. GET /v4/historical/sports/icehockey_nhl/events?date={ISO} (get event IDs) - 1 credit
 * 2. GET /v4/historical/sports/icehockey_nhl/events/{eventId}/odds?date={ISO} (get player props) - 10 credits
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// API Configuration
const API_KEY = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';

// 2025-26 NHL season date range
const START_DATE = '2025-10-15';
const END_DATE = '2025-11-13';

/**
 * Make HTTP GET request and return parsed JSON
 */
function apiRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Extract usage headers
        const remaining = res.headers['x-requests-remaining'];
        const used = res.headers['x-requests-used'];
        const lastCost = res.headers['x-requests-last'];
        
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            resolve({
              data: parsed,
              credits: { remaining, used, lastCost }
            });
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
 * Fetch historical event IDs for a specific date
 * Cost: 1 credit
 */
async function fetchHistoricalEvents(dateISO) {
  const url = `${BASE_URL}/historical/sports/icehockey_nhl/events?` +
    `apiKey=${API_KEY}&` +
    `date=${dateISO}`;
  
  const response = await apiRequest(url);
  return {
    timestamp: response.data.timestamp,
    events: response.data.data || [],
    credits: response.credits
  };
}

/**
 * Fetch historical odds for a specific event
 * Cost: 10 credits per event per market per region (1 market × 1 region = 10)
 */
async function fetchHistoricalEventOdds(eventId, dateISO) {
  const url = `${BASE_URL}/historical/sports/icehockey_nhl/events/${eventId}/odds?` +
    `apiKey=${API_KEY}&` +
    `regions=us&` +
    `markets=player_shots_on_goal&` +
    `date=${dateISO}`;
  
  const response = await apiRequest(url);
  return {
    timestamp: response.data.timestamp,
    event: response.data.data || null,
    credits: response.credits
  };
}

/**
 * Generate array of dates between start and end
 */
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

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                    ║');
  console.log('║       📊 NHL 2025-26 SEASON ODDS FETCHER                          ║');
  console.log('║       Oct 15 - Nov 13, 2025                                        ║');
  console.log('║                                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Check API key
  if (!API_KEY) {
    console.error('❌ API key not found. Set THEODDS_API_KEY environment variable.');
    process.exit(1);
  }
  
  console.log(`🔐 API Key: ${API_KEY.substring(0, 8)}...`);
  console.log('');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
  
  // Generate date range
  const dates = generateDateRange(START_DATE, END_DATE);
  const datesToFetch = limit ? dates.slice(0, limit) : dates;
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 FETCH PLAN');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Date range:          ${START_DATE} to ${END_DATE}`);
  console.log(`Total dates:         ${dates.length}`);
  console.log(`Dates to fetch:      ${datesToFetch.length}${limit ? ' (limited)' : ''}`);
  console.log('');
  console.log('Cost structure:');
  console.log('  • 1 credit per date (fetch event IDs)');
  console.log('  • 10 credits per game (fetch player props)');
  console.log('');
  console.log(`Estimated minimum:   ${datesToFetch.length} credits (events only)`);
  console.log(`Estimated if ~12 games/day: ${datesToFetch.length + (datesToFetch.length * 12 * 10)} credits`);
  console.log('');
  
  if (!execute) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('🚀 TO PROCEED:');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Full fetch (all dates):');
    console.log('  THEODDS_API_KEY=your_key node scripts/nhl/fetch-2025-26-odds.mjs --execute');
    console.log('');
    console.log('Test with 2 dates only:');
    console.log('  THEODDS_API_KEY=your_key node scripts/nhl/fetch-2025-26-odds.mjs --limit=2 --execute');
    console.log('');
    return;
  }
  
  // EXECUTE
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚀 FETCHING HISTORICAL ODDS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  const results = [];
  let totalCreditsUsed = 0;
  let totalGamesFound = 0;
  let errors = 0;
  
  for (let i = 0; i < datesToFetch.length; i++) {
    const date = datesToFetch[i];
    const dateISO = `${date}T12:00:00Z`; // Use noon on the date
    
    console.log(`[${i + 1}/${datesToFetch.length}] ${date}`);
    
    try {
      // Step 1: Fetch event IDs for this date (1 credit)
      const eventsResponse = await fetchHistoricalEvents(dateISO);
      
      const eventCount = eventsResponse.events.length;
      const eventCost = parseInt(eventsResponse.credits.lastCost || 1);
      totalCreditsUsed += eventCost;
      
      if (eventCount === 0) {
        console.log(`   → No events (${eventCost} credit)`);
      } else {
        console.log(`   → ${eventCount} events found (${eventCost} credit)`);
        totalGamesFound += eventCount;
        
        // Step 2: Fetch odds for each event (10 credits each)
        for (const event of eventsResponse.events) {
          try {
            const oddsResponse = await fetchHistoricalEventOdds(event.id, dateISO);
            
            const oddsCost = parseInt(oddsResponse.credits.lastCost || 10);
            totalCreditsUsed += oddsCost;
            
            // Store the result
            results.push({
              date: date,
              eventId: event.id,
              homeTeam: event.home_team,
              awayTeam: event.away_team,
              commenceTime: event.commence_time,
              bookmakers: oddsResponse.event?.bookmakers || [],
              oddsAvailable: (oddsResponse.event?.bookmakers || []).length > 0,
              timestamp: oddsResponse.timestamp
            });
            
            const bookCount = (oddsResponse.event?.bookmakers || []).length;
            console.log(`      ✓ ${event.away_team} @ ${event.home_team}: ${bookCount} books (${oddsCost} credits)`);
            
            // Rate limiting: 100ms between event requests
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (err) {
            errors++;
            console.log(`      ⚠️  Failed: ${event.away_team} @ ${event.home_team} - ${err.message}`);
          }
        }
      }
      
      console.log(`   ✓ Completed (${eventsResponse.credits.remaining} credits remaining, ${totalCreditsUsed} used so far)`);
      
      // Rate limiting: 1 second between date requests
      if (i < datesToFetch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (err) {
      errors++;
      console.error(`   ❌ Error: ${err.message}`);
    }
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('✅ FETCH COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Dates processed:     ${datesToFetch.length}`);
  console.log(`Games found:         ${totalGamesFound}`);
  console.log(`Games with odds:     ${results.filter(r => r.oddsAvailable).length}`);
  console.log(`Games without odds:  ${results.filter(r => !r.oddsAvailable).length}`);
  console.log(`Errors:              ${errors}`);
  console.log(`Credits used:        ${totalCreditsUsed.toLocaleString()}`);
  console.log('');
  
  // Save results
  const outputPath = path.join(REPO_ROOT, 'data/nhl/odds_2025-26_oct-nov.json');
  const output = {
    fetchedAt: new Date().toISOString(),
    season: '2025-26',
    dateRange: {
      start: START_DATE,
      end: END_DATE
    },
    totalDates: datesToFetch.length,
    totalGames: results.length,
    gamesWithOdds: results.filter(r => r.oddsAvailable).length,
    creditsUsed: totalCreditsUsed,
    errors: errors,
    data: results
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`💾 Saved to: ${outputPath}`);
  console.log('');
  
  // Create summary
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📋 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  if (results.length > 0) {
    console.log('Sample games:');
    results.slice(0, 3).forEach(r => {
      console.log(`  ${r.date}: ${r.awayTeam} @ ${r.homeTeam}`);
      console.log(`    Books: ${r.bookmakers.length}`);
    });
    console.log('');
  }
  
  console.log('Next steps:');
  console.log('  1. Load odds from: data/nhl/odds_2025-26_oct-nov.json');
  console.log('  2. Match with historical_game_data.json for actual results');
  console.log('  3. Run model comparison test');
  console.log('');
}

// Run
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
