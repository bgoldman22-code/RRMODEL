/**
 * Test injury data integration in live prediction model
 */

async function testInjuryIntegration() {
  console.log('🧪 Testing Injury Data Integration...');
  
  try {
    // Call the live prediction API to get game data with injuries
    const response = await fetch('/api/nfl-td-predictions?type=raw&limit=1', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log('📡 API Response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ API Error:', data);
      return;
    }
    
    // Check if game data includes injury information
    const games = data.games || [];
    console.log(`🎯 Found ${games.length} games in response`);
    
    if (games.length > 0) {
      const firstGame = games[0];
      console.log('🔍 First game structure:', Object.keys(firstGame));
      
      // Check for injury data fields
      const injuryFields = [
        'injuries', 'home_injuries', 'away_injuries', 
        'qb_status', 'starting_qbs', 'playerNews', 
        'inactives', 'injuryReport', 'playerStatus'
      ];
      
      console.log('\n📋 INJURY DATA FIELDS CHECK:');
      injuryFields.forEach(field => {
        const hasField = field in firstGame;
        const value = firstGame[field];
        console.log(`   ${hasField ? '✅' : '❌'} ${field}: ${hasField ? typeof value : 'missing'}`);
        if (hasField && value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            console.log(`      └── Array with ${value.length} items`);
          } else if (typeof value === 'object') {
            console.log(`      └── Object with keys: [${Object.keys(value).join(', ')}]`);
          }
        }
      });
      
      // Check for ATL vs WAS game specifically
      const atlWasGame = games.find(g => 
        (g.home_team === 'ATL' && g.away_team === 'WAS') ||
        (g.home_team === 'WAS' && g.away_team === 'ATL')
      );
      
      if (atlWasGame) {
        console.log('\n🎯 ATL vs WAS Game Found:');
        console.log('   Home team:', atlWasGame.home_team);
        console.log('   Away team:', atlWasGame.away_team);
        console.log('   Total injuries:', atlWasGame.injuries?.length || 0);
        console.log('   Home injuries:', atlWasGame.home_injuries?.length || 0);
        console.log('   Away injuries:', atlWasGame.away_injuries?.length || 0);
        console.log('   QB Status:', atlWasGame.qb_status);
        console.log('   Starting QBs:', atlWasGame.starting_qbs);
        console.log('   Inactives count:', atlWasGame.inactives?.length || 0);
        
        // Look for Washington injuries specifically
        const wasInjuries = atlWasGame.injuries?.filter(i => i.team === 'WAS') || [];
        console.log('\n🔍 Washington Injuries:');
        wasInjuries.forEach(injury => {
          console.log(`   ${injury.name} (${injury.position}): ${injury.status} - ${injury.injury}`);
        });
      } else {
        console.log('\n⚠️ ATL vs WAS game not found in test games');
      }
    }
    
  } catch (error) {
    console.error('❌ Test Error:', error);
  }
}

// Run the test
testInjuryIntegration();