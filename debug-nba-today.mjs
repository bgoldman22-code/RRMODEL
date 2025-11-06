import fetch from 'node-fetch';

const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
console.log('Today date string:', today);

// Test ESPN API
const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`;
console.log('\nFetching ESPN:', espnUrl);

const espnResponse = await fetch(espnUrl);
const espnData = await espnResponse.json();

console.log('\nESPN Events:', espnData.events?.length || 0);
if (espnData.events?.length > 0) {
  espnData.events.forEach(event => {
    const away = event.competitions[0].competitors.find(t => t.homeAway === 'away');
    const home = event.competitions[0].competitors.find(t => t.homeAway === 'home');
    console.log(`  ${away.team.abbreviation} @ ${home.team.abbreviation}`);
    console.log(`  Status: ${event.status.type.name} (${event.status.type.state})`);
    console.log(`  Date: ${event.date}`);
  });
}

// Test Odds API
const oddsApiKey = process.env.THEODDS_API_KEY;
if (!oddsApiKey) {
  console.log('\n❌ THEODDS_API_KEY not found in environment');
} else {
  console.log('\n✅ THEODDS_API_KEY found');
  
  const oddsUrl = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${oddsApiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
  console.log('\nFetching Odds API...');
  
  try {
    const oddsResponse = await fetch(oddsUrl);
    const oddsData = await oddsResponse.json();
    
    console.log('\nOdds API Games:', oddsData.length || 0);
    if (Array.isArray(oddsData) && oddsData.length > 0) {
      oddsData.forEach(game => {
        console.log(`  ${game.away_team} @ ${game.home_team}`);
        console.log(`  ID: ${game.id}`);
        console.log(`  Commence: ${game.commence_time}`);
      });
    }
  } catch (error) {
    console.error('Odds API error:', error.message);
  }
}
