#!/usr/bin/env node

/**
 * Test TheOddsAPI endpoints to see what's available for player props
 */

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';
const SPORT = 'americanfootball_nfl';

async function testEndpoint(name, url) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`URL: ${url.replace(ODDS_API_KEY, 'API_KEY')}`);
  console.log('='.repeat(60));
  
  try {
    const response = await fetch(url);
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Error: ${errorText.substring(0, 500)}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`Response type: ${Array.isArray(data) ? 'Array' : typeof data}`);
    console.log(`Length: ${Array.isArray(data) ? data.length : 'N/A'}`);
    
    if (Array.isArray(data) && data.length > 0) {
      console.log(`\nFirst item keys:`, Object.keys(data[0]));
      console.log(`\nFirst item sample:`, JSON.stringify(data[0], null, 2).substring(0, 1000));
    } else if (typeof data === 'object') {
      console.log(`\nResponse keys:`, Object.keys(data));
      console.log(`\nSample:`, JSON.stringify(data, null, 2).substring(0, 1000));
    }
    
    return data;
  } catch (error) {
    console.error(`Exception: ${error.message}`);
    return null;
  }
}

async function main() {
  if (!ODDS_API_KEY) {
    console.error('ERROR: Missing ODDS_API_KEY environment variable');
    process.exit(1);
  }
  
  console.log('TheOddsAPI Props Testing');
  console.log(`API Key: ${ODDS_API_KEY.substring(0, 8)}...`);
  
  // Test 1: Events endpoint (what we've been using)
  const eventsUrl = `${BASE_URL}/sports/${SPORT}/events?apiKey=${ODDS_API_KEY}`;
  const events = await testEndpoint('Events Endpoint', eventsUrl);
  
  // Test 2: Odds endpoint with game markets (h2h, spreads, totals)
  const gameOddsUrl = `${BASE_URL}/sports/${SPORT}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&bookmakers=draftkings,fanduel&oddsFormat=american`;
  const gameOdds = await testEndpoint('Game Odds Endpoint', gameOddsUrl);
  
  // Test 3: Odds endpoint with player prop market
  const propOddsUrl = `${BASE_URL}/sports/${SPORT}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=player_pass_tds&bookmakers=draftkings,fanduel&oddsFormat=american`;
  const propOdds = await testEndpoint('Player Props Odds Endpoint (pass_tds)', propOddsUrl);
  
  // Test 4: Try alternative market names
  const altPropUrl = `${BASE_URL}/sports/${SPORT}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=player_touchdown_anytime&bookmakers=draftkings,fanduel&oddsFormat=american`;
  const altProps = await testEndpoint('Alternative Props (anytime_td)', altPropUrl);
  
  // Test 5: Try without bookmakers filter
  const allBookiesUrl = `${BASE_URL}/sports/${SPORT}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=player_pass_yds&oddsFormat=american`;
  const allBookies = await testEndpoint('Player Props (all bookmakers)', allBookiesUrl);
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Events: ${events ? events.length + ' events' : 'FAILED'}`);
  console.log(`Game Odds: ${gameOdds ? gameOdds.length + ' games' : 'FAILED'}`);
  console.log(`Player Props (pass_tds): ${propOdds ? propOdds.length + ' games' : 'FAILED'}`);
  console.log(`Alt Props (anytime_td): ${altProps ? altProps.length + ' games' : 'FAILED'}`);
  console.log(`All Bookies: ${allBookies ? allBookies.length + ' games' : 'FAILED'}`);
  
  // If we got prop data, show a sample player prop
  const testData = propOdds || altProps || allBookies;
  if (testData && testData.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('SAMPLE PLAYER PROP STRUCTURE');
    console.log('='.repeat(60));
    
    const game = testData[0];
    if (game.bookmakers && game.bookmakers.length > 0) {
      const bookmaker = game.bookmakers[0];
      console.log(`\nGame: ${game.away_team} @ ${game.home_team}`);
      console.log(`Bookmaker: ${bookmaker.title}`);
      
      if (bookmaker.markets && bookmaker.markets.length > 0) {
        const market = bookmaker.markets[0];
        console.log(`Market: ${market.key}`);
        console.log(`\nFirst 3 props:`);
        
        market.outcomes.slice(0, 3).forEach((outcome, i) => {
          console.log(`\n${i + 1}. ${outcome.description || outcome.name}`);
          console.log(`   Line: ${outcome.point}`);
          console.log(`   Price: ${outcome.price}`);
        });
      }
    }
  }
  
  console.log('\n');
}

main();
