#!/usr/bin/env node

/**
 * Query TheOddsAPI to find what markets are actually available for NFL
 */

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';

async function checkAvailableMarkets() {
  console.log('Checking available markets for NFL...\n');
  
  if (!ODDS_API_KEY) {
    console.error('ERROR: Missing ODDS_API_KEY environment variable');
    console.error('Run: export ODDS_API_KEY=your_key_here');
    process.exit(1);
  }
  
  // Step 1: Get upcoming events
  console.log('1. Fetching upcoming NFL events...');
  const eventsUrl = `${BASE_URL}/sports/americanfootball_nfl/events?apiKey=${ODDS_API_KEY}`;
  
  try {
    const eventsResp = await fetch(eventsUrl);
    if (!eventsResp.ok) {
      console.error(`Failed: ${eventsResp.status}`);
      const error = await eventsResp.text();
      console.error(error);
      process.exit(1);
    }
    
    const events = await eventsResp.json();
    console.log(`✓ Found ${events.length} upcoming games\n`);
    
    if (events.length === 0) {
      console.log('No upcoming games. Cannot test markets.');
      process.exit(0);
    }
    
    const sampleEvent = events[0];
    console.log(`Sample game: ${sampleEvent.away_team} @ ${sampleEvent.home_team}`);
    console.log(`Event ID: ${sampleEvent.id}`);
    console.log(`Starts: ${sampleEvent.commence_time}\n`);
    
    // Step 2: Try the odds endpoint with various markets
    console.log('2. Testing different market types...\n');
    
    const marketsToTest = [
      // Game markets (should work)
      'h2h',
      'spreads', 
      'totals',
      
      // Player props (various naming conventions)
      'player_pass_tds',
      'player_pass_touchdowns',
      'player_passing_tds',
      'player_passing_touchdowns',
      
      'player_pass_yds',
      'player_passing_yards',
      'player_pass_yards',
      
      'player_rush_yds',
      'player_rushing_yards',
      'player_rush_yards',
      
      'player_receiving_yards',
      'player_rec_yds',
      'player_reception_yds',
      
      'player_receptions',
      'player_reception',
      
      'player_anytime_td',
      'player_anytime_touchdown',
      'player_1st_td',
      'player_first_td',
      'player_first_touchdown'
    ];
    
    const availableMarkets = [];
    const unavailableMarkets = [];
    
    for (const market of marketsToTest) {
      const url = `${BASE_URL}/sports/americanfootball_nfl/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=${market}&bookmakers=draftkings&oddsFormat=american`;
      
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const hasMarket = data.some(game => 
            game.bookmakers?.some(book => 
              book.markets?.some(m => m.key === market)
            )
          );
          
          if (hasMarket) {
            console.log(`✓ ${market.padEnd(30)} - AVAILABLE`);
            availableMarkets.push(market);
            
            // Show sample prop for first available player prop
            if (market.startsWith('player_') && availableMarkets.length === 4) {
              const game = data[0];
              const bookmaker = game.bookmakers[0];
              const marketData = bookmaker.markets.find(m => m.key === market);
              if (marketData && marketData.outcomes && marketData.outcomes.length > 0) {
                const sample = marketData.outcomes[0];
                console.log(`    Sample: ${sample.description || sample.name} ${sample.point ? sample.point : ''} (${sample.price})`);
              }
            }
          } else {
            console.log(`✗ ${market.padEnd(30)} - Returns data but no props yet`);
            unavailableMarkets.push(market);
          }
        } else {
          console.log(`✗ ${market.padEnd(30)} - Empty response`);
          unavailableMarkets.push(market);
        }
      } else {
        const error = await response.json().catch(() => ({}));
        if (response.status === 422 && error.error_code === 'INVALID_MARKET') {
          console.log(`✗ ${market.padEnd(30)} - NOT SUPPORTED (422)`);
        } else {
          console.log(`✗ ${market.padEnd(30)} - Error ${response.status}`);
        }
        unavailableMarkets.push(market);
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Available markets: ${availableMarkets.length}`);
    console.log(`Unavailable markets: ${unavailableMarkets.length}`);
    
    if (availableMarkets.length > 0) {
      console.log('\n✓ Working markets:');
      availableMarkets.forEach(m => console.log(`  - ${m}`));
    }
    
    if (availableMarkets.filter(m => m.startsWith('player_')).length === 0) {
      console.log('\n⚠️  NO PLAYER PROPS AVAILABLE');
      console.log('This could mean:');
      console.log('  1. Props not released yet (usually released Tuesday/Wednesday)');
      console.log('  2. Premium subscription doesn\'t include props');
      console.log('  3. Different endpoint needed for props');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAvailableMarkets();
