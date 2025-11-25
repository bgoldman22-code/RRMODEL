#!/usr/bin/env node
/**
 * Collect Historical NBA Player Props Odds - SIMPLIFIED VERSION
 * 
 * Strategy:
 * 1. For each target date, get list of NBA events
 * 2. For each event, fetch player props for all markets
 * 3. Save all props for that date
 * 
 * This uses the per-event historical endpoint which is required for player props.
 * 
 * Usage:
 *   export ODDS_API_KEY=your_key_here
 *   node scripts/nba/collect-historical-odds-phase3.mjs [--dates 10]
 * 
 * Options:
 *   --dates N     Number of dates to collect (default: 60)
 *   --test        Test mode: only collect 2 dates
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

const HISTORICAL_ODDS_DIR = join(REPO_ROOT, 'data/nba/historical_odds');
const MANIFEST_FILE = join(HISTORICAL_ODDS_DIR, 'phase3_odds_manifest_v1.json');
const CHECKPOINT_FILE = join(REPO_ROOT, 'data/nba/phase3_checkpoints.json');

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';

const MARKETS = [
  'player_points',
  'player_rebounds',
  'player_assists'
];

console.log('[collect-historical-odds] NBA Historical Odds Collector (Phase 3)');

// Parse args
const args = process.argv.slice(2);
const testMode = args.includes('--test');
const datesArg = args.find(a => a.startsWith('--dates='));
const targetDates = testMode ? 2 : (datesArg ? parseInt(datesArg.split('=')[1]) : 120);

/**
 * Generate sample dates
 * NOTE: Player props historical data available from May 3, 2023 onwards
 */
function generateDates(count) {
  // Densely distributed across 2023-24, 2024-25 seasons for maximum training data
  const dates = [
    // Late 2022-23 season playoffs (10 dates)
    '2023-05-01', '2023-05-05', '2023-05-10', '2023-05-15', '2023-05-20', 
    '2023-05-25', '2023-06-01', '2023-06-05', '2023-06-10', '2023-06-15',
    
    // 2023-24 season (60 dates - comprehensive coverage)
    '2023-10-24', '2023-10-27', '2023-10-31', '2023-11-03', '2023-11-07', '2023-11-10', 
    '2023-11-14', '2023-11-17', '2023-11-21', '2023-11-24', '2023-11-28', '2023-12-01',
    '2023-12-05', '2023-12-08', '2023-12-12', '2023-12-15', '2023-12-19', '2023-12-22',
    '2023-12-26', '2023-12-29', '2024-01-02', '2024-01-05', '2024-01-09', '2024-01-12',
    '2024-01-16', '2024-01-19', '2024-01-23', '2024-01-26', '2024-01-30', '2024-02-02',
    '2024-02-06', '2024-02-09', '2024-02-23', '2024-02-27', '2024-03-01', '2024-03-05',
    '2024-03-08', '2024-03-12', '2024-03-15', '2024-03-19', '2024-03-22', '2024-03-26',
    '2024-03-29', '2024-04-02', '2024-04-05', '2024-04-09', '2024-04-12', '2024-04-16',
    '2024-04-19', '2024-04-23', '2024-04-26', '2024-04-30', '2024-05-03', '2024-05-07',
    '2024-05-10', '2024-05-14', '2024-05-17', '2024-05-21', '2024-05-24', '2024-05-28',
    
    // 2024-25 season (50 dates - current season)
    '2024-10-22', '2024-10-25', '2024-10-29', '2024-11-01', '2024-11-05', '2024-11-08',
    '2024-11-12', '2024-11-15', '2024-11-19', '2024-11-22', '2024-11-26', '2024-11-29',
    '2024-12-03', '2024-12-06', '2024-12-10', '2024-12-13', '2024-12-17', '2024-12-20',
    '2024-12-24', '2024-12-27', '2024-12-31', '2025-01-03', '2025-01-07', '2025-01-10',
    '2025-01-14', '2025-01-17', '2025-01-21', '2025-01-24', '2025-01-28', '2025-01-31',
    '2025-02-04', '2025-02-07', '2025-02-21', '2025-02-25', '2025-02-28', '2025-03-04',
    '2025-03-07', '2025-03-11', '2025-03-14', '2025-03-18', '2025-03-21', '2025-03-25',
    '2025-03-28', '2025-04-01', '2025-04-04', '2025-04-08', '2025-04-11', '2025-04-15',
    '2025-04-18', '2025-04-22'
  ];
  
  return dates.slice(0, count);
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
    
    const costEstimate = targetDates * 11 * 3; // dates × avg_games × markets
    console.log(`📊 Estimated requests: ~${costEstimate} (${targetDates} dates × ~11 games × 3 markets)`);
    console.log(`📊 Estimated time: ~${Math.round(targetDates * 0.5)} minutes with rate limiting`);
    
    if (parseInt(remaining) < costEstimate) {
      console.warn(`⚠️  Warning: Might exceed quota`);
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
 * Fetch player props for an event
 */
async function fetchEventProps(eventId, date, market) {
  const url = `${ODDS_API_BASE}/historical/sports/${SPORT}/events/${eventId}/odds`;
  const params = new URLSearchParams({
    apiKey: ODDS_API_KEY,
    date: `${date}T12:00:00Z`,
    regions: 'us',
    markets: market,
    oddsFormat: 'american',
    bookmakers: 'fanduel,draftkings'
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
 * Process a single date
 */
async function processDate(date) {
  const dateSlug = date.replace(/-/g, '');
  const filename = `nba_props_${dateSlug}_v1.json`;
  const filepath = join(HISTORICAL_ODDS_DIR, filename);
  
  // Skip if already exists
  if (existsSync(filepath)) {
    console.log(`  ℹ️  ${date}: Already exists (skipping)`);
    const existing = JSON.parse(readFileSync(filepath, 'utf-8'));
    return { date, skipped: true, props: existing.total_props || 0 };
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
      total_props: 0,
      events: [],
      props: []
    };
    const tmpFile = filepath + '.tmp';
    writeFileSync(tmpFile, JSON.stringify(emptyData, null, 2));
    renameSync(tmpFile, filepath);
    return { date, skipped: false, props: 0, events: 0 };
  }
  
  console.log(`  ✅ Found ${events.length} events`);
  
  // Fetch props for each event × market
  console.log(`  2/2 Fetching props (${events.length} events × ${MARKETS.length} markets)...`);
  
  const allProps = [];
  let requestCount = 0;
  
  for (const event of events) {
    const eventProps = {
      event_id: event.id,
      home_team: event.home_team,
      away_team: event.away_team,
      commence_time: event.commence_time,
      markets: {}
    };
    
    for (const market of MARKETS) {
      const eventData = await fetchEventProps(event.id, date, market);
      requestCount++;
      
      if (eventData && eventData.bookmakers) {
        const props = [];
        
        for (const bookmaker of eventData.bookmakers) {
          for (const marketData of bookmaker.markets || []) {
            for (const outcome of marketData.outcomes || []) {
              props.push({
                player: outcome.description,
                side: outcome.name, // "Over" or "Under"
                line: outcome.point,
                odds: outcome.price,
                bookmaker: bookmaker.key
              });
            }
          }
        }
        
        eventProps.markets[market] = props;
      }
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    allProps.push(eventProps);
  }
  
  // Count total props
  let totalProps = 0;
  for (const eventProps of allProps) {
    for (const market in eventProps.markets) {
      totalProps += eventProps.markets[market].length;
    }
  }
  
  // Save
  const data = {
    date,
    fetched_at: new Date().toISOString(),
    source: 'the-odds-api',
    total_props: totalProps,
    events: allProps
  };
  
  const tmpFile = filepath + '.tmp';
  writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  renameSync(tmpFile, filepath);
  
  console.log(`  ✅ Saved ${totalProps} props (${requestCount} API requests)`);
  
  return { date, skipped: false, props: totalProps, events: events.length };
}

/**
 * Update manifest
 */
function updateManifest(results) {
  const manifest = {
    version: 'v1',
    created: new Date().toISOString(),
    total_dates: results.length,
    total_props: results.reduce((sum, r) => sum + r.props, 0),
    total_events: results.reduce((sum, r) => sum + (r.events || 0), 0),
    files: results.map(r => ({
      date: r.date,
      props: r.props,
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
 * Update checkpoint
 */
function updateCheckpoint(results) {
  try {
    let checkpointData = { checkpoints: [] };
    if (existsSync(CHECKPOINT_FILE)) {
      checkpointData = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
    }
    
    checkpointData.checkpoints.push({
      timestamp: new Date().toISOString(),
      step: 'collect_historical_odds_phase3',
      artifacts: [MANIFEST_FILE, ...results.map(r => join(HISTORICAL_ODDS_DIR, `nba_props_${r.date.replace(/-/g, '')}_v1.json`))],
      notes: `Collected ${results.length} dates with ${results.reduce((s, r) => s + r.props, 0)} total props`
    });
    
    const tmpFile = CHECKPOINT_FILE + '.tmp';
    writeFileSync(tmpFile, JSON.stringify(checkpointData, null, 2));
    renameSync(tmpFile, CHECKPOINT_FILE);
    
    console.log('✅ Checkpoint updated');
  } catch (err) {
    console.log(`⚠️  Checkpoint update failed: ${err.message}`);
  }
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
  updateCheckpoint(results);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ COMPLETE');
  console.log('='.repeat(60));
  console.log(`Dates processed: ${results.length}`);
  console.log(`Total props: ${results.reduce((s, r) => s + r.props, 0)}`);
  console.log(`Skipped: ${results.filter(r => r.skipped).length}`);
  console.log(`\n📁 Output: ${HISTORICAL_ODDS_DIR}`);
  console.log(`📄 Manifest: ${MANIFEST_FILE}`);
  console.log('\n🎯 Next step: Build Phase 3 training dataset (Phase C)');
}

main().catch(err => {
  console.error('\n❌ FATAL:', err);
  process.exit(1);
});
