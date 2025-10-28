/**
 * Test stats.nba.com API access with proper headers
 */

const NBA_STATS_BASE = 'https://stats.nba.com/stats';

const NBA_STATS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'Connection': 'keep-alive',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true'
};

async function testLeagueDashTeamStats() {
  try {
    const params = new URLSearchParams({
      Season: '2025-26',
      SeasonType: 'Regular Season',
      MeasureType: 'Advanced',
      PerMode: 'PerGame',
      LastNGames: '10',
      PaceAdjust: 'N',
      Rank: 'N',
      LeagueID: '00'
    });
    
    const url = `${NBA_STATS_BASE}/leaguedashteamstats?${params}`;
    
    console.log('🔍 Testing:', url);
    console.log('📋 Headers:', JSON.stringify(NBA_STATS_HEADERS, null, 2));
    console.log('');
    
    const response = await fetch(url, { headers: NBA_STATS_HEADERS });
    
    console.log('📊 Response Status:', response.status, response.statusText);
    console.log('📊 Response Headers:', Object.fromEntries(response.headers.entries()));
    console.log('');
    
    if (!response.ok) {
      const text = await response.text();
      console.error('❌ Error Response:', text.substring(0, 500));
      return;
    }
    
    const data = await response.json();
    
    const headers = data.resultSets[0].headers;
    const rows = data.resultSets[0].rowSet;
    
    console.log('✅ SUCCESS!');
    console.log(`   Teams returned: ${rows.length}`);
    console.log(`   Headers: ${headers.join(', ')}`);
    console.log('');
    
    // Show first team
    if (rows.length > 0) {
      const team = {};
      headers.forEach((header, i) => {
        team[header] = rows[0][i];
      });
      
      console.log('📊 Sample Team (First in response):');
      console.log(`   TEAM_ID: ${team.TEAM_ID}`);
      console.log(`   TEAM_NAME: ${team.TEAM_NAME}`);
      console.log(`   GP: ${team.GP}`);
      console.log(`   W: ${team.W}`);
      console.log(`   L: ${team.L}`);
      console.log(`   OFF_RATING: ${team.OFF_RATING}`);
      console.log(`   DEF_RATING: ${team.DEF_RATING}`);
      console.log(`   NET_RATING: ${team.NET_RATING}`);
      console.log(`   PACE: ${team.PACE}`);
      console.log('');
    }
    
    // Test Four Factors too
    console.log('🔍 Testing Four Factors...');
    const params2 = new URLSearchParams({
      Season: '2025-26',
      SeasonType: 'Regular Season',
      MeasureType: 'Four Factors',
      PerMode: 'PerGame',
      LastNGames: '10',
      PaceAdjust: 'N',
      Rank: 'N',
      LeagueID: '00'
    });
    
    const url2 = `${NBA_STATS_BASE}/leaguedashteamstats?${params2}`;
    const response2 = await fetch(url2, { headers: NBA_STATS_HEADERS });
    
    if (response2.ok) {
      const data2 = await response2.json();
      const headers2 = data2.resultSets[0].headers;
      const rows2 = data2.resultSets[0].rowSet;
      
      console.log('✅ Four Factors SUCCESS!');
      console.log(`   Teams returned: ${rows2.length}`);
      console.log(`   Headers: ${headers2.join(', ')}`);
      
      if (rows2.length > 0) {
        const team2 = {};
        headers2.forEach((header, i) => {
          team2[header] = rows2[0][i];
        });
        
        console.log('📊 Sample Team Four Factors:');
        console.log(`   TEAM_NAME: ${team2.TEAM_NAME}`);
        console.log(`   EFG_PCT: ${team2.EFG_PCT}`);
        console.log(`   FTA_RATE: ${team2.FTA_RATE}`);
        console.log(`   TM_TOV_PCT: ${team2.TM_TOV_PCT}`);
        console.log(`   OREB_PCT: ${team2.OREB_PCT}`);
      }
    } else {
      console.error('❌ Four Factors failed:', response2.status);
    }
    
  } catch (error) {
    console.error('❌ Exception:', error.message);
    console.error(error.stack);
  }
}

// Run test
testLeagueDashTeamStats();
