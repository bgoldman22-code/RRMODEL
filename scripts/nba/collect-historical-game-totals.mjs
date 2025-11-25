#!/usr/bin/env node
/**
 * Collect Historical NBA Game Totals & Spreads
 * 
 * Uses the same proven pattern as player props collection:
 * 1. For each target date, get list of NBA events
 * 2. For each event, fetch game markets (spreads, totals, h2h)
 * 3. Save all odds for that date
 * 
 * This uses the per-event historical endpoint which is required.
 * 
 * Usage:
 *   export ODDS_API_KEY=your_key_here
 *   node scripts/nba/collect-historical-game-totals.mjs [--dates 15]
 * 
 * Options:
 *   --dates N     Number of dates to collect (default: 15)
 *   --test        Test mode: only collect 2 dates
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

const HISTORICAL_ODDS_DIR = join(REPO_ROOT, 'data/nba/historical_odds/game_totals');
const MANIFEST_FILE = join(HISTORICAL_ODDS_DIR, 'game_totals_manifest_v1.json');

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';

// Game markets (not player props)
const MARKETS = [
  'spreads',
  'totals',
  'h2h'
];

const BOOKMAKERS = 'fanduel,draftkings,betmgm';

console.log('[collect-historical-game-totals] NBA Historical Game Totals Collector');

// Parse args
const args = process.argv.slice(2);
const testMode = args.includes('--test');
const datesArg = args.find(a => a.startsWith('--dates='));
const targetDates = testMode ? 2 : (datesArg ? parseInt(datesArg.split('=')[1]) : null); // null = all dates

/**
 * Generate all dates between start and end (inclusive)
 */
function generateDates(count, startDate = '2024-10-20', endDate = '2025-11-23') {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    dates.push(dateStr);
    current.setDate(current.getDate() + 1);
  }
  
  console.log(`📅 Generated ${dates.length} dates from ${startDate} to ${endDate}`);
  
  // If count specified, return subset
  if (count && count < dates.length) {
    return dates.slice(0, count);
  }
  
  return dates;
}

/**
 * Check API status
 */
async function checkApi() {
  if (!ODDS_API_KEY) {
    console.error('\n❌ ODDS_API_KEY not set');
    process.exit(1);
  }
  
  try {
    const response = await fetch(`${ODDS_API_BASE}/sports/?apiKey=${ODDS_API_KEY}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const remaining = response.headers.get('x-requests-remaining');
    console.log(`\n✅ API key valid (${remaining} requests remaining)`);
    
    const costEstimate = targetDates * 12 * 3; // dates × avg_games × markets
    console.log(`📊 Estimated requests: ~${costEstimate} (${targetDates} dates × ~12 games × 3 markets)`);
    console.log(`📊 Estimated time: ~${Math.round(targetDates * 0.5)} minutes with rate limiting`);
    
    if (parseInt(remaining) < costEstimate) {
      console.warn(`⚠️  Warning: Might exceed quota (have ${remaining}, need ~${costEstimate})`);
    }
  } catch (err) {
    console.error(`\n❌ API check failed: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Fetch events for a date
 */
async function fetchEvents(date) {
  const url = `${ODDS_API_BASE}/historical/sports/${SPORT}/events`;
  const params = new URLSearchParams({
    apiKey: ODDS_API_KEY,
    date: `${date}T12:00:00Z`
  });
  
  try {
    const response = await fetch(`${url}?${params}`);
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    return data.data || [];
  } catch (err) {
    console.log(`    ⚠️  Error fetching events: ${err.message}`);
    return [];
  }
}

/**
 * Fetch game odds for an event
 */
async function fetchEventOdds(eventId, date, market) {
  const url = `${ODDS_API_BASE}/historical/sports/${SPORT}/events/${eventId}/odds`;
  const params = new URLSearchParams({
    apiKey: ODDS_API_KEY,
    date: `${date}T12:00:00Z`,
    regions: 'us',
    markets: market,
    oddsFormat: 'american',
    bookmakers: BOOKMAKERS
  });
  
  try {
    const response = await fetch(`${url}?${params}`);
    if (response.status === 404) return null;
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.data;
  } catch (err) {
    return null;
  }
}

/**
 * Parse bookmaker odds into structured format
 */
function parseBookmakerOdds(eventData, market) {
  const bookmakerData = {};
  
  if (!eventData || !eventData.bookmakers) return bookmakerData;
  
  for (const bookmaker of eventData.bookmakers) {
    const bookKey = bookmaker.key;
    
    for (const marketData of bookmaker.markets || []) {
      if (marketData.key !== market) continue;
      
      if (market === 'spreads') {
        // Parse spread
        const homeOutcome = marketData.outcomes.find(o => o.name === eventData.home_team);
        const awayOutcome = marketData.outcomes.find(o => o.name === eventData.away_team);
        
        if (homeOutcome && awayOutcome) {
          bookmakerData[bookKey] = {
            home_line: homeOutcome.point,
            home_price: homeOutcome.price,
            away_line: awayOutcome.point,
            away_price: awayOutcome.price
          };
        }
      } else if (market === 'totals') {
        // Parse total
        const overOutcome = marketData.outcomes.find(o => o.name === 'Over');
        const underOutcome = marketData.outcomes.find(o => o.name === 'Under');
        
        if (overOutcome && underOutcome) {
          bookmakerData[bookKey] = {
            line: overOutcome.point,
            over_price: overOutcome.price,
            under_price: underOutcome.price
          };
        }
      } else if (market === 'h2h') {
        // Parse moneyline
        const homeOutcome = marketData.outcomes.find(o => o.name === eventData.home_team);
        const awayOutcome = marketData.outcomes.find(o => o.name === eventData.away_team);
        
        if (homeOutcome && awayOutcome) {
          bookmakerData[bookKey] = {
            home_price: homeOutcome.price,
            away_price: awayOutcome.price
          };
        }
      }
    }
  }
  
  return bookmakerData;
}

/**
 * Calculate consensus from bookmaker data
 */
function calculateConsensus(bookmakerData, market) {
  const books = Object.values(bookmakerData);
  if (books.length === 0) return null;
  
  if (market === 'spreads') {
    const homeLines = books.map(b => b.home_line).filter(x => x != null);
    const awayLines = books.map(b => b.away_line).filter(x => x != null);
    
    if (homeLines.length === 0) return null;
    
    return {
      home_line: homeLines.reduce((a, b) => a + b, 0) / homeLines.length,
      away_line: awayLines.reduce((a, b) => a + b, 0) / awayLines.length
    };
  } else if (market === 'totals') {
    const lines = books.map(b => b.line).filter(x => x != null);
    
    if (lines.length === 0) return null;
    
    return {
      line: lines.reduce((a, b) => a + b, 0) / lines.length
    };
  } else if (market === 'h2h') {
    // For moneyline, we don't average prices (they're odds, not lines)
    return { available: true };
  }
  
  return null;
}

/**
 * Process a single date
 */
async function processDate(date) {
  const dateSlug = date.replace(/-/g, '');
  const filename = `game_totals_${dateSlug}_v1.json`;
  const filepath = join(HISTORICAL_ODDS_DIR, filename);
  
  // Skip if already exists
  if (existsSync(filepath)) {
    console.log(`  ℹ️  ${date}: Already exists (skipping)`);
    const existing = JSON.parse(readFileSync(filepath, 'utf-8'));
    return { date, skipped: true, games: existing.games?.length || 0 };
  }
  
  console.log(`\n📅 Processing ${date}...`);
  
  // Get events
  console.log(`  1/2 Fetching events...`);
  const events = await fetchEvents(date);
  
  if (events.length === 0) {
    console.log(`  ⚠️  No events found for ${date}`);
    // Save empty file
    const emptyData = {
      date,
      fetched_at: new Date().toISOString(),
      source: 'the-odds-api',
      games: []
    };
    const tmpFile = filepath + '.tmp';
    writeFileSync(tmpFile, JSON.stringify(emptyData, null, 2));
    renameSync(tmpFile, filepath);
    return { date, skipped: false, games: 0, events: 0 };
  }
  
  console.log(`  ✅ Found ${events.length} events`);
  
  // Fetch odds for each event × market
  console.log(`  2/2 Fetching odds (${events.length} events × ${MARKETS.length} markets)...`);
  
  const allGames = [];
  let requestCount = 0;
  
  for (const event of events) {
    const gameData = {
      event_id: event.id,
      home_team: event.home_team,
      away_team: event.away_team,
      commence_time: event.commence_time,
      bookmakers: {},
      consensus: {}
    };
    
    for (const market of MARKETS) {
      const eventData = await fetchEventOdds(event.id, date, market);
      requestCount++;
      
      if (eventData) {
        const bookmakerOdds = parseBookmakerOdds(eventData, market);
        gameData.bookmakers[market] = bookmakerOdds;
        
        // Calculate consensus
        const consensus = calculateConsensus(bookmakerOdds, market);
        if (consensus) {
          gameData.consensus[market] = consensus;
        }
      }
      
      // Rate limit (300ms between requests)
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    allGames.push(gameData);
  }
  
  // Save
  const data = {
    date,
    fetched_at: new Date().toISOString(),
    source: 'the-odds-api',
    bookmakers: BOOKMAKERS.split(','),
    markets: MARKETS,
    games: allGames
  };
  
  const tmpFile = filepath + '.tmp';
  writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  renameSync(tmpFile, filepath);
  
  console.log(`  ✅ Saved ${allGames.length} games (${requestCount} API requests)`);
  
  return { date, skipped: false, games: allGames.length, events: events.length };
}

/**
 * Update manifest
 */
function updateManifest(results) {
  const manifest = {
    version: 'v1',
    created: new Date().toISOString(),
    total_dates: results.length,
    total_games: results.reduce((sum, r) => sum + r.games, 0),
    total_events: results.reduce((sum, r) => sum + (r.events || 0), 0),
    files: results.map(r => ({
      date: r.date,
      games: r.games,
      events: r.events || 0,
      skipped: r.skipped
    }))
  };
  
  const tmpFile = MANIFEST_FILE + '.tmp';
  writeFileSync(tmpFile, JSON.stringify(manifest, null, 2));
  renameSync(tmpFile, MANIFEST_FILE);
  
  console.log(`\n✅ Manifest updated: ${MANIFEST_FILE}`);
}

/**
 * Main
 */
async function main() {
  mkdirSync(HISTORICAL_ODDS_DIR, { recursive: true });
  
  await checkApi();
  
  const dates = generateDates(targetDates);
  console.log(`\n📋 Target dates: ${dates.length}`);
  if (testMode) console.log('🧪 TEST MODE: Only collecting first 2 dates\n');
  
  const results = [];
  
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    console.log(`\n[${i + 1}/${dates.length}] ${date}`);
    
    const result = await processDate(date);
    results.push(result);
    
    // Rate limit between dates
    if (i < dates.length - 1) {
      console.log('  ⏳ Waiting 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  updateManifest(results);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ COMPLETE');
  console.log('='.repeat(60));
  console.log(`Dates processed: ${results.length}`);
  console.log(`Total games: ${results.reduce((s, r) => s + r.games, 0)}`);
  console.log(`Skipped: ${results.filter(r => r.skipped).length}`);
  console.log(`\n📁 Output: ${HISTORICAL_ODDS_DIR}`);
  console.log(`📄 Manifest: ${MANIFEST_FILE}`);
  console.log('\n🎯 Next step: Merge with model predictions for walk-forward backtest');
}

main().catch(err => {
  console.error('\n❌ FATAL:', err);
  process.exit(1);
});
