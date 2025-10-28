// Quick test of NBA CDN scoreboard API
const NBA_CDN_BASE = 'https://cdn.nba.com/static/json/liveData';

async function testNbaCdnScoreboard() {
  const today = new Date();
  const ymd = today.toISOString().split('T')[0].replace(/-/g, '');
  
  console.log(`Testing NBA CDN scoreboard for ${ymd}...`);
  
  const url = `${NBA_CDN_BASE}/scoreboard/scoreboard_${ymd}.json`;
  console.log(`URL: ${url}`);
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`❌ Failed: ${res.status} ${res.statusText}`);
      return;
    }
    
    const data = await res.json();
    console.log(`✅ Success! Found ${data.scoreboard?.games?.length || 0} games`);
    
    if (data.scoreboard?.games?.length > 0) {
      const game = data.scoreboard.games[0];
      console.log(`\nSample game:`);
      console.log(`  Game ID: ${game.gameId}`);
      console.log(`  Status: ${game.gameStatus} (${game.gameStatusText})`);
      console.log(`  Home: ${game.homeTeam?.teamName} (ID: ${game.homeTeam?.teamId})`);
      console.log(`  Away: ${game.awayTeam?.teamName} (ID: ${game.awayTeam?.teamId})`);
      
      // Test if Celtics (1610612738) are playing
      for (const g of data.scoreboard.games) {
        if (g.homeTeam?.teamId === 1610612738 || g.awayTeam?.teamId === 1610612738) {
          console.log(`\n✅ Found Celtics game!`);
          console.log(`  Game ID: ${g.gameId}`);
          console.log(`  ${g.awayTeam.teamName} @ ${g.homeTeam.teamName}`);
        }
      }
    }
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }
}

testNbaCdnScoreboard();
