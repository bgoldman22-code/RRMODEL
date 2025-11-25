#!/usr/bin/env node
/**
 * TEST: Collect 2 sample dates to verify API setup
 * 
 * Usage:
 *   export ODDS_API_KEY=your_key_here
 *   node scripts/nba/test-odds-collection.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';
const TEST_DATES = ['2024-01-15', '2024-02-10']; // Two test dates
const MARKETS = ['player_points'];

console.log('[test-odds] Testing TheOddsAPI Historical Data Collection');

async function testApiConnection() {
  if (!ODDS_API_KEY) {
    console.error('\n❌ ERROR: ODDS_API_KEY environment variable not set');
    process.exit(1);
  }
  
  console.log('\n✅ API key found');
  console.log('🔍 Testing API connection...');
  
  try {
    const response = await fetch(`${ODDS_API_BASE}/sports/?apiKey=${ODDS_API_KEY}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const remaining = response.headers.get('x-requests-remaining');
    const used = response.headers.get('x-requests-used');
    
    console.log('✅ API connection successful');
    if (remaining) console.log(`📊 Requests remaining: ${remaining}`);
    if (used) console.log(`📊 Requests used: ${used}`);
    
    return true;
  } catch (error) {
    console.error('❌ API connection failed:', error.message);
    return false;
  }
}

async function testHistoricalFetch(date) {
  console.log(`\n🔍 Step 1: Get historical events for ${date}...`);
  
  // First, get the list of events (games) for this date
  const eventsUrl = `${ODDS_API_BASE}/historical/sports/${SPORT}/events`;
  const eventsParams = new URLSearchParams({
    apiKey: ODDS_API_KEY,
    date: `${date}T12:00:00Z`
  });
  
  try {
    const eventsResponse = await fetch(`${eventsUrl}?${eventsParams}`);
    
    console.log(`   Events API Status: ${eventsResponse.status} ${eventsResponse.statusText}`);
    
    const remaining = eventsResponse.headers.get('x-requests-remaining');
    if (remaining) console.log(`   Quota remaining: ${remaining}`);
    
    if (eventsResponse.status === 404) {
      console.log('   ⚠️  No events available for this date');
      return { success: false, reason: 'no_events' };
    }
    
    if (!eventsResponse.ok) {
      console.log(`   ❌ Events request failed: ${eventsResponse.status}`);
      const errorText = await eventsResponse.text();
      console.log(`   Error: ${errorText}`);
      return { success: false, reason: 'http_error' };
    }
    
    const eventsData = await eventsResponse.json();
    const events = eventsData.data || [];
    
    console.log(`   ✅ Received ${events.length} events`);
    
    if (events.length === 0) {
      return { success: false, reason: 'no_events' };
    }
    
    // Show first event
    const firstEvent = events[0];
    console.log(`\n   Sample event:`);
    console.log(`   - ID: ${firstEvent.id}`);
    console.log(`   - ${firstEvent.home_team} vs ${firstEvent.away_team}`);
    console.log(`   - Commence: ${firstEvent.commence_time}`);
    
    // Now fetch player props for this first event
    console.log(`\n🔍 Step 2: Get player props for first event...`);
    
    const oddsUrl = `${ODDS_API_BASE}/historical/sports/${SPORT}/events/${firstEvent.id}/odds`;
    const oddsParams = new URLSearchParams({
      apiKey: ODDS_API_KEY,
      date: `${date}T12:00:00Z`,
      regions: 'us',
      markets: 'player_points',
      oddsFormat: 'american',
      bookmakers: 'fanduel,draftkings'
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
    
    const oddsResponse = await fetch(`${oddsUrl}?${oddsParams}`);
    
    console.log(`   Odds API Status: ${oddsResponse.status} ${oddsResponse.statusText}`);
    
    const oddsRemaining = oddsResponse.headers.get('x-requests-remaining');
    if (oddsRemaining) console.log(`   Quota remaining: ${oddsRemaining}`);
    
    if (!oddsResponse.ok) {
      console.log(`   ⚠️  Odds request failed (this is normal if player props not available for this event)`);
      return { success: true, events: events.length, props: 0 };
    }
    
    const oddsData = await oddsResponse.json();
    const eventData = oddsData.data || {};
    
    let propsCount = 0;
    if (eventData.bookmakers) {
      for (const bookmaker of eventData.bookmakers) {
        for (const market of bookmaker.markets || []) {
          propsCount += market.outcomes?.length || 0;
        }
      }
    }
    
    console.log(`   ✅ Received ${propsCount} player props`);
    
    if (propsCount > 0) {
      const firstBookmaker = eventData.bookmakers[0];
      const firstMarket = firstBookmaker.markets[0];
      const firstOutcome = firstMarket.outcomes[0];
      console.log(`\n   Sample prop:`);
      console.log(`   - Player: ${firstOutcome.description}`);
      console.log(`   - Line: ${firstOutcome.point}`);
      console.log(`   - ${firstOutcome.name} @ ${firstOutcome.price}`);
    }
    
    return { success: true, events: events.length, props: propsCount };
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('PHASE 1: API Connection Test');
  console.log('='.repeat(60));
  
  const connected = await testApiConnection();
  if (!connected) {
    console.log('\n❌ Cannot proceed without valid API connection');
    process.exit(1);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 2: Historical Data Test');
  console.log('='.repeat(60));
  
  const results = [];
  
  for (const date of TEST_DATES) {
    const result = await testHistoricalFetch(date);
    results.push({ date, ...result });
    
    // Rate limit between requests
    if (date !== TEST_DATES[TEST_DATES.length - 1]) {
      console.log('\n   ⏳ Waiting 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success).length;
  console.log(`✅ Successful: ${successful}/${results.length}`);
  
  for (const result of results) {
    if (result.success) {
      console.log(`   ✅ ${result.date}: ${result.events} events`);
    } else {
      console.log(`   ❌ ${result.date}: ${result.reason}`);
    }
  }
  
  if (successful > 0) {
    console.log('\n✅ API is working! Ready to collect full 60-date dataset.');
    console.log('   Run: export ODDS_API_KEY=your_key && node scripts/nba/collect-historical-odds-phase3.mjs');
  } else {
    console.log('\n⚠️  No successful data fetches. Check:');
    console.log('   1. API key is valid');
    console.log('   2. Historical data access is enabled on your plan');
    console.log('   3. Date range has NBA data available');
  }
}

main();
