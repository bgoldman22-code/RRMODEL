// Quick test of injury data collection
const testTeams = ['WAS', 'ATL'];

const espnTeamMap = {
  'WAS': 28, // Washington Commanders
  'ATL': 1   // Atlanta Falcons
};

async function testInjuryCollection() {
  console.log('🏥 Testing injury collection for WAS and ATL');
  
  const injuries = {};
  
  for (const team of testTeams) {
    const espnId = espnTeamMap[team];
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${espnId}/injuries`;
    
    console.log(`\nFetching ${team} (ESPN ID: ${espnId})`);
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        console.log(`❌ ${team}: HTTP ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      const teamInjuries = (data.injuries || []).map(injury => ({
        name: injury.athlete?.displayName || 'Unknown',
        position: injury.athlete?.position?.abbreviation || 'N/A',
        status: injury.status || 'Unknown',
        description: injury.description || 'No details'
      }));
      
      injuries[team] = teamInjuries;
      console.log(`✅ ${team}: Found ${teamInjuries.length} injured players`);
      
      // Special check for Jayden Daniels
      if (team === 'WAS') {
        const jayden = teamInjuries.find(p => 
          p.name.toLowerCase().includes('daniels') || 
          p.name.toLowerCase().includes('jayden')
        );
        
        if (jayden) {
          console.log('🎯 JAYDEN DANIELS FOUND:', jayden);
        } else {
          console.log('❓ Jayden Daniels not found in current WAS injury report');
          console.log('   All WAS injuries:', teamInjuries.map(p => p.name));
        }
      }
      
    } catch (error) {
      console.log(`❌ ${team}: Error - ${error.message}`);
    }
  }
  
  console.log('\n📊 FINAL INJURY DATA SUMMARY:');
  console.log(JSON.stringify(injuries, null, 2));
  
  return injuries;
}

// Run the test
testInjuryCollection()
  .then(injuries => {
    console.log('\n✅ Test completed successfully');
    const totalInjured = Object.values(injuries).reduce((sum, teamInjuries) => sum + teamInjuries.length, 0);
    console.log(`📈 Total injured players found: ${totalInjured}`);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
  });