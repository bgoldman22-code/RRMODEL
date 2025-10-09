// Test injury system timeout issues
import fetch from 'node-fetch';

const ESPN_TEAM_MAP = {
  NYG:'19', CIN:'4'  // Just test 2 teams
};

async function testFetchTeam(teamCode) {
  const teamId = ESPN_TEAM_MAP[teamCode];
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
  
  console.log(`🏥 Testing ${teamCode} (${teamId})...`);
  const start = Date.now();
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)',
        'Accept': 'application/json'
      }
    });
    
    if (!res.ok) {
      console.log(`❌ ${teamCode}: HTTP ${res.status}`);
      return;
    }
    
    const data = await res.json();
    const elapsed = Date.now() - start;
    console.log(`✅ ${teamCode}: ${data.items?.length || 0} injuries in ${elapsed}ms`);
    
    // Test first injury detail fetch
    if (data.items && data.items.length > 0) {
      const detailStart = Date.now();
      const detailRes = await fetch(data.items[0].$ref, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)' }
      });
      const detailElapsed = Date.now() - detailStart;
      console.log(`📋 ${teamCode}: Detail fetch ${detailElapsed}ms`);
    }
    
  } catch (err) {
    const elapsed = Date.now() - start;
    console.log(`❌ ${teamCode}: ${err.message} after ${elapsed}ms`);
  }
}

async function main() {
  console.log('🚀 Testing ESPN API performance...');
  
  for (const team of Object.keys(ESPN_TEAM_MAP)) {
    await testFetchTeam(team);
    await new Promise(r => setTimeout(r, 100)); // Brief pause
  }
  
  console.log('✅ Test complete');
}

main().catch(console.error);