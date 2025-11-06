/**
 * Debug tool to check ESPN NBA scoreboard API for today
 */

const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`;

console.log('🏀 ESPN NBA Scoreboard Debug');
console.log('Date:', today);
console.log('URL:', espnUrl);
console.log('');

try {
  const response = await fetch(espnUrl);
  const data = await response.json();
  
  console.log('✅ Response received');
  console.log('Events count:', data.events?.length || 0);
  console.log('');
  
  if (data.events && data.events.length > 0) {
    console.log('📋 Games found:');
    data.events.forEach((event, idx) => {
      const comp = event.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');
      const status = event.status?.type?.name || 'unknown';
      const state = event.status?.type?.state || 'unknown';
      
      console.log(`\n  Game ${idx + 1}:`);
      console.log(`    Matchup: ${away.team.abbreviation} @ ${home.team.abbreviation}`);
      console.log(`    Status: ${status} (state: ${state})`);
      console.log(`    Date: ${event.date}`);
      console.log(`    Season Type: ${event.season?.type} (1=preseason, 2=regular, 3=playoffs)`);
    });
  } else {
    console.log('⚠️  No games found');
    console.log('');
    console.log('API Response structure:');
    console.log(JSON.stringify(data, null, 2));
  }
  
} catch (err) {
  console.error('❌ Error:', err.message);
}
