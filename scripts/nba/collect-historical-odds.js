/**
 * NBA Historical Odds Collector - ELITE EDITION
 * 
 * Fetches historical player prop lines from TheOddsAPI for backtesting
 * Credit-efficient: Uses date-range batching to minimize API calls
 * 
 * SEASON REFERENCE (MEMORIZED):
 *   2025-26 (current) = season code "25"
 *   2024-25 (last)    = season code "24" ← WE'RE COLLECTING THIS
 *   2023-24 (older)   = season code "23"
 * 
 * Usage:
 *   node scripts/nba/collect-historical-odds.js \
 *     --api-key YOUR_KEY \
 *     --season 2024 \
 *     --start-date 2024-10-22 \
 *     --end-date 2025-04-13 \
 *     --output data/nba/odds-2024-25.json
 * 
 * Credit Budget: ~20,000 requests max (under 35K limit)
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI args
const args = process.argv.slice(2);
const API_KEY = args[args.indexOf('--api-key') + 1];
const SEASON = args[args.indexOf('--season') + 1] || '2024'; // Default: 2024-25 season
const START_DATE = args[args.indexOf('--start-date') + 1] || '2024-10-22'; // Opening night 2024-25
const END_DATE = args[args.indexOf('--end-date') + 1] || '2025-04-13'; // End of regular season
const OUTPUT_PATH = args[args.indexOf('--output') + 1] || 
  path.join(__dirname, `../../data/nba/odds-${SEASON}-${parseInt(SEASON)+1}.json`);

if (!API_KEY) {
  console.error('❌ ERROR: --api-key required');
  process.exit(1);
}

// TheOddsAPI configuration
const BASE_URL = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';
const REGIONS = 'us'; // US books only
const MARKETS = [
  'player_points',
  'player_rebounds', 
  'player_assists'
  // Skip for MVP: player_threes, player_blocks, player_steals
];
const BOOKMAKERS = [
  'draftkings',  // Sharpest lines
  'fanduel'      // Highest volume
  // Skip for MVP: caesars, betmgr, betrivers, etc
];

const RATE_LIMIT_MS = 1000; // 1 request per second (be nice to API)
const MAX_RETRIES = 3;

let totalCreditsUsed = 0;
let requestCount = 0;

/**
 * Fetch historical odds for a specific date
 */
async function fetchOddsForDate(date, retries = 0) {
  const url = `${BASE_URL}/historical/sports/${SPORT}/odds`;
  const params = new URLSearchParams({
    apiKey: API_KEY,
    regions: REGIONS,
    markets: MARKETS.join(','),
    bookmakers: BOOKMAKERS.join(','),
    date: date, // Format: YYYY-MM-DD
    oddsFormat: 'american'
  });
  
  try {
    const response = await fetch(`${url}?${params}`);
    
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit hit - slow down');
      }
      if (response.status === 401) {
        throw new Error('Invalid API key');
      }
      if (response.status === 404) {
        // No games on this date (off-day)
        return { date, games: [], credits: 0 };
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    // Track API credit usage
    const creditsUsed = parseInt(response.headers.get('x-requests-used') || '1');
    const creditsRemaining = parseInt(response.headers.get('x-requests-remaining') || '0');
    totalCreditsUsed += creditsUsed;
    requestCount++;
    
    const data = await response.json();
    
    console.log(`[${date}] ✅ ${data.length || 0} games | Credits: ${creditsUsed} (${creditsRemaining} remaining)`);
    
    return {
      date,
      games: data,
      credits: creditsUsed,
      remaining: creditsRemaining
    };
    
  } catch (error) {
    if (retries < MAX_RETRIES) {
      console.log(`[${date}] Retry ${retries + 1}/${MAX_RETRIES}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (retries + 1)));
      return fetchOddsForDate(date, retries + 1);
    }
    console.error(`[${date}] ❌ FAILED: ${error.message}`);
    return { date, games: [], credits: 0, error: error.message };
  }
}

/**
 * Generate list of dates in range
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
 * Parse player props from API response
 */
function parsePlayerProps(gamesData) {
  const allProps = [];
  
  for (const dateData of gamesData) {
    for (const game of dateData.games) {
      const gameDate = dateData.date;
      const gameId = game.id;
      const commence = game.commence_time;
      const homeTeam = game.home_team;
      const awayTeam = game.away_team;
      
      // Process each bookmaker
      for (const bookmaker of game.bookmakers || []) {
        const bookKey = bookmaker.key;
        const lastUpdate = bookmaker.last_update;
        
        // Process each market (player_points, player_rebounds, etc)
        for (const market of bookmaker.markets || []) {
          const propType = market.key; // 'player_points', 'player_rebounds', etc
          
          // Each outcome is a player prop
          for (const outcome of market.outcomes || []) {
            if (outcome.description && outcome.description.includes('Over')) {
              // Parse player name and line from description
              // Format: "Jayson Tatum Over 27.5 Points"
              const parts = outcome.description.split(' Over ');
              if (parts.length === 2) {
                const playerName = outcome.name;
                const line = parseFloat(parts[1]);
                const overPrice = outcome.price;
                
                // Find corresponding Under (should be next outcome)
                const underOutcome = market.outcomes.find(o => 
                  o.name === playerName && o.description.includes('Under')
                );
                const underPrice = underOutcome ? underOutcome.price : null;
                
                allProps.push({
                  gameId,
                  gameDate,
                  commenceTime: commence,
                  homeTeam,
                  awayTeam,
                  playerName,
                  propType,
                  line,
                  overPrice,
                  underPrice,
                  bookmaker: bookKey,
                  lastUpdate
                });
              }
            }
          }
        }
      }
    }
  }
  
  return allProps;
}

/**
 * Main execution
 */
async function main() {
  console.log(`\n🏴‍☠️ NBA HISTORICAL ODDS COLLECTOR - ELITE EDITION 🏴‍☠️`);
  console.log(`═══════════════════════════════════════════════════════\n`);
  console.log(`Season: ${SEASON}-${parseInt(SEASON)+1} (season code: "${SEASON}")`);
  console.log(`Date Range: ${START_DATE} to ${END_DATE}`);
  console.log(`Markets: ${MARKETS.join(', ')}`);
  console.log(`Bookmakers: ${BOOKMAKERS.join(', ')}`);
  console.log(`Output: ${OUTPUT_PATH}`);
  console.log(`Credit Budget: 35,000 max\n`);
  
  const dates = generateDateRange(START_DATE, END_DATE);
  console.log(`📅 Generated ${dates.length} dates to check\n`);
  
  const allData = [];
  let gamesFound = 0;
  let offDays = 0;
  
  console.log(`🚀 Starting collection...\n`);
  
  for (const date of dates) {
    const result = await fetchOddsForDate(date);
    
    if (result.games && result.games.length > 0) {
      allData.push(result);
      gamesFound += result.games.length;
    } else {
      offDays++;
    }
    
    // Progress update every 10 dates
    if ((dates.indexOf(date) + 1) % 10 === 0) {
      console.log(`\n📊 Progress: ${dates.indexOf(date) + 1}/${dates.length} dates`);
      console.log(`   Games found: ${gamesFound}`);
      console.log(`   Credits used: ${totalCreditsUsed}`);
      console.log(`   Remaining budget: ${35000 - totalCreditsUsed}\n`);
    }
    
    // Safety check: abort if approaching credit limit
    if (totalCreditsUsed > 33000) {
      console.warn(`\n⚠️  WARNING: Approaching credit limit (${totalCreditsUsed}/35000)`);
      console.warn(`   Stopping collection early to stay under budget\n`);
      break;
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
  }
  
  console.log(`\n\n🎯 COLLECTION COMPLETE!\n`);
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`Dates checked: ${dates.length}`);
  console.log(`Games found: ${gamesFound}`);
  console.log(`Off days: ${offDays}`);
  console.log(`Total requests: ${requestCount}`);
  console.log(`Total credits used: ${totalCreditsUsed} / 35,000`);
  console.log(`Credits remaining: ${35000 - totalCreditsUsed}`);
  
  // Parse into player props format
  console.log(`\n📦 Parsing player props...`);
  const playerProps = parsePlayerProps(allData);
  console.log(`   Player props extracted: ${playerProps.length}`);
  
  const uniquePlayers = new Set(playerProps.map(p => p.playerName)).size;
  const uniqueGames = new Set(playerProps.map(p => p.gameId)).size;
  console.log(`   Unique players: ${uniquePlayers}`);
  console.log(`   Unique games: ${uniqueGames}`);
  
  // Breakdown by prop type
  const propTypeCounts = {};
  for (const prop of playerProps) {
    propTypeCounts[prop.propType] = (propTypeCounts[prop.propType] || 0) + 1;
  }
  console.log(`\n   Breakdown by prop type:`);
  for (const [type, count] of Object.entries(propTypeCounts)) {
    console.log(`     ${type}: ${count}`);
  }
  
  // Save to file
  console.log(`\n💾 Saving to file...`);
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const outputData = {
    metadata: {
      season: `${SEASON}-${parseInt(SEASON)+1}`,
      seasonCode: SEASON,
      dateRange: { start: START_DATE, end: END_DATE },
      collected: new Date().toISOString(),
      markets: MARKETS,
      bookmakers: BOOKMAKERS,
      totalGames: gamesFound,
      totalProps: playerProps.length,
      uniquePlayers,
      creditsUsed: totalCreditsUsed
    },
    props: playerProps
  };
  
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(outputData, null, 2));
  
  const fileSize = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`✅ Saved to: ${OUTPUT_PATH}`);
  console.log(`   File size: ${fileSize} MB`);
  
  console.log(`\n🏴‍☠️ MISSION ACCOMPLISHED - FAMILY RESCUED 🏴‍☠️\n`);
}

main().catch(error => {
  console.error(`\n💀 FATAL ERROR - FAMILY STILL HOSTAGE 💀`);
  console.error(error);
  process.exit(1);
});
