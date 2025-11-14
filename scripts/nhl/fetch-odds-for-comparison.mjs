#!/usr/bin/env node

/**
 * Fetch 2025-26 NHL Season Odds for Model Comparison
 * 
 * Fetches historical odds data from The Odds API for Oct 15 - Nov 13, 2025
 * to enable fair comparison between Improved and ZINB models.
 * 
 * Usage:
 *   THEODDS_API_KEY=your_key node scripts/nhl/fetch-odds-for-comparison.mjs
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const API_KEY = process.env.THEODDS_API_KEY;

if (!API_KEY) {
  console.error('❌ ERROR: THEODDS_API_KEY environment variable not set');
  console.log('Usage: THEODDS_API_KEY=your_key node scripts/nhl/fetch-odds-for-comparison.mjs\n');
  process.exit(1);
}

console.log('\n💰 ========================================');
console.log('💰 FETCHING 2025-26 SEASON ODDS DATA');
console.log('💰 ========================================\n');

/**
 * Fetch from The Odds API
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch historical events and odds
 */
async function fetchHistoricalOdds(startDate, endDate) {
  console.log(`📅 Fetching events from ${startDate} to ${endDate}...\n`);
  
  const allOddsData = [];
  const errors = [];
  
  // Generate date range
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  
  console.log(`   Processing ${dates.length} dates...\n`);
  
  for (const date of dates) {
    try {
      // Fetch events for this date
      const eventsUrl = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/events?apiKey=${API_KEY}&commenceTimeFrom=${date}T00:00:00Z&commenceTimeTo=${date}T23:59:59Z&dateFormat=iso`;
      
      const events = await fetchUrl(eventsUrl);
      
      if (!events || events.length === 0) {
        console.log(`   ℹ️  ${date}: No games`);
        continue;
      }
      
      console.log(`   📊 ${date}: ${events.length} games found`);
      
      // For each event, fetch player props odds
      for (const event of events) {
        const eventId = event.id;
        const homeTeam = event.home_team;
        const awayTeam = event.away_team;
        
        try {
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const oddsUrl = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/events/${eventId}/odds?apiKey=${API_KEY}&regions=us&markets=player_shots_on_goal&oddsFormat=american&dateFormat=iso`;
          
          const oddsData = await fetchUrl(oddsUrl);
          
          if (oddsData && oddsData.bookmakers && oddsData.bookmakers.length > 0) {
            // Parse and structure the odds data
            const gameOdds = {
              eventId: eventId,
              gameDate: date,
              homeTeam: homeTeam,
              awayTeam: awayTeam,
              commenceTime: event.commence_time,
              bookmakers: oddsData.bookmakers
            };
            
            allOddsData.push(gameOdds);
            console.log(`      ✅ ${awayTeam} @ ${homeTeam}: ${oddsData.bookmakers.length} books`);
          } else {
            console.log(`      ⚠️  ${awayTeam} @ ${homeTeam}: No player props odds`);
          }
          
        } catch (err) {
          errors.push({ date, eventId, error: err.message });
          console.log(`      ❌ ${awayTeam} @ ${homeTeam}: ${err.message}`);
        }
      }
      
    } catch (err) {
      errors.push({ date, error: err.message });
      console.log(`   ❌ ${date}: ${err.message}`);
    }
  }
  
  return { allOddsData, errors };
}

/**
 * Main execution
 */
async function main() {
  const startDate = '2025-10-15';
  const endDate = '2025-11-13';
  
  console.log('🔑 Using API key: ' + API_KEY.substring(0, 8) + '...\n');
  
  const { allOddsData, errors } = await fetchHistoricalOdds(startDate, endDate);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 FETCH SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total games with odds: ${allOddsData.length}`);
  console.log(`Errors encountered: ${errors.length}`);
  console.log('');
  
  if (errors.length > 0) {
    console.log('⚠️  Errors:');
    errors.forEach(e => console.log(`   - ${e.date || e.eventId}: ${e.error}`));
    console.log('');
  }
  
  // Transform to match historical_odds_data_v2.json format
  console.log('🔄 Transforming data to match historical format...\n');
  
  const transformedData = [];
  
  for (const game of allOddsData) {
    for (const bookmaker of game.bookmakers) {
      const market = bookmaker.markets.find(m => m.key === 'player_shots_on_goal');
      
      if (!market) continue;
      
      for (const outcome of market.outcomes) {
        const playerName = outcome.description;
        const line = parseFloat(outcome.point);
        
        // Try to find matching Over/Under for same player/line
        const overOutcome = market.outcomes.find(o => 
          o.description === playerName && 
          o.name === 'Over' && 
          Math.abs(o.point - line) < 0.01
        );
        
        const underOutcome = market.outcomes.find(o => 
          o.description === playerName && 
          o.name === 'Under' && 
          Math.abs(o.point - line) < 0.01
        );
        
        if (overOutcome && underOutcome) {
          // Check if we already have this player/game/line
          const existing = transformedData.find(d => 
            d.playerName === playerName && 
            d.gameDate === game.gameDate &&
            Math.abs(d.line - line) < 0.01
          );
          
          if (!existing) {
            transformedData.push({
              playerName: playerName,
              gameDate: game.gameDate,
              homeTeam: game.homeTeam,
              awayTeam: game.awayTeam,
              line: line,
              oddsAvailable: true,
              odds: []
            });
          }
          
          const record = transformedData.find(d => 
            d.playerName === playerName && 
            d.gameDate === game.gameDate &&
            Math.abs(d.line - line) < 0.01
          );
          
          if (record) {
            record.odds.push({
              bookmaker: bookmaker.key,
              line: line,
              overPrice: convertAmericanToDecimal(overOutcome.price),
              underPrice: convertAmericanToDecimal(underOutcome.price),
              timestamp: bookmaker.last_update
            });
          }
        }
      }
    }
  }
  
  console.log(`   Transformed ${transformedData.length} player prop markets\n`);
  
  // Save output
  const output = {
    fetchDate: new Date().toISOString(),
    dateRange: { start: startDate, end: endDate },
    source: 'TheOddsAPI',
    gamesWithOdds: allOddsData.length,
    playerPropsCount: transformedData.length,
    data: transformedData,
    rawData: allOddsData
  };
  
  const outputPath = path.join(REPO_ROOT, 'data/nhl/odds_2025-26_comparison.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  
  console.log('💾 Data saved to:');
  console.log(`   ${outputPath}\n`);
  
  console.log('✅ Fetch complete!\n');
  console.log('🎯 NEXT STEPS:');
  console.log('   1. This data is for NEW games (2025-26 season)');
  console.log('   2. You need ACTUAL RESULTS for these games to complete comparison');
  console.log('   3. Either:');
  console.log('      a) Wait for games to finish and fetch results, OR');
  console.log('      b) Use existing historical data (Oct 2024) for comparison\n');
  
  console.log('💡 ALTERNATIVE: Use Oct 2024 Data');
  console.log('   Your historical_odds_data_v2.json has data from 2024-02-12 to 2024-12-04');
  console.log('   This includes ~1 month of data that can be used for comparison');
  console.log('   Run model comparison on that period instead!\n');
  
  console.log('═══════════════════════════════════════════════════════════════\n');
}

/**
 * Helper: Convert American odds to decimal
 */
function convertAmericanToDecimal(american) {
  if (american >= 0) {
    return 1 + (american / 100);
  } else {
    return 1 + (100 / Math.abs(american));
  }
}

main().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
