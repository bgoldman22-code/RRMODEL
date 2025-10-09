// Test the updated ESPN injury API for Washington Commanders
const ESPN_TEAM_MAP = {
  'WAS': 28, // Washington Commanders
  'ATL': 1   // Atlanta Falcons  
};

function mapInjuryStatus(status) {
  const statusMap = {
    'Out': 'OUT',
    'Doubtful': 'DOUBTFUL', 
    'Questionable': 'QUESTIONABLE',
    'Probable': 'PROBABLE',
    'Day to Day': 'DAY_TO_DAY',
    'Active': 'ACTIVE'
  };
  return statusMap[status] || status?.toUpperCase() || 'UNKNOWN';
}

async function testWashingtonInjuries() {
  console.log('🏥 Testing updated ESPN API for Washington Commanders');
  
  const teamCode = 'WAS';
  const teamId = ESPN_TEAM_MAP[teamCode];
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
  
  try {
    console.log(`Fetching from: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API returned ${response.status}`);
    }
    
    const data = await response.json();
    const injuryRefs = data.items || [];
    
    console.log(`Found ${injuryRefs.length} injury references for WAS`);
    
    let jaydenFound = false;
    const injuries = [];
    
    // Process first 10 injury references
    for (const ref of injuryRefs.slice(0, 10)) {
      try {
        console.log(`Fetching injury details from: ${ref.$ref}`);
        
        const injuryResponse = await fetch(ref.$ref);
        if (!injuryResponse.ok) {
          console.log(`  Injury response failed: ${injuryResponse.status}`);
          continue;
        }
        
        const injuryData = await injuryResponse.json();
        console.log(`  Injury data:`, JSON.stringify(injuryData, null, 2));
        
        // Get athlete data
        let athleteName = 'Unknown Player';
        let position = 'UNK';
        
        if (injuryData.athlete && injuryData.athlete.$ref) {
          console.log(`  Fetching athlete from: ${injuryData.athlete.$ref}`);
          
          try {
            const athleteResponse = await fetch(injuryData.athlete.$ref);
            if (athleteResponse.ok) {
              const athleteData = await athleteResponse.json();
              athleteName = athleteData.displayName || athleteData.name || 'Unknown';
              position = athleteData.position?.abbreviation || 'UNK';
              
              console.log(`  Athlete: ${athleteName} (${position})`);
              
              // Check for Jayden Daniels specifically  
              if (athleteName.toLowerCase().includes('daniels') || 
                  athleteName.toLowerCase().includes('jayden')) {
                jaydenFound = true;
                console.log('🎯 JAYDEN DANIELS FOUND!');
              }
            }
          } catch (e) {
            console.log(`  Could not fetch athlete: ${e.message}`);
          }
        }
        
        const injury = {
          name: athleteName,
          position: position,
          status: mapInjuryStatus(injuryData.status),
          description: injuryData.description || injuryData.detail || 'No details'
        };
        
        injuries.push(injury);
        console.log(`  Final injury:`, injury);
        
      } catch (error) {
        console.log(`  Error processing injury: ${error.message}`);
      }
    }
    
    console.log('\n📊 FINAL RESULTS:');
    console.log(`Total injuries processed: ${injuries.length}`);
    console.log(`Jayden Daniels found: ${jaydenFound ? 'YES' : 'NO'}`);
    
    injuries.forEach((injury, i) => {
      console.log(`${i+1}. ${injury.name} (${injury.position}) - ${injury.status}`);
    });
    
    return { injuries, jaydenFound };
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { injuries: [], jaydenFound: false };
  }
}

// Run the test
testWashingtonInjuries()
  .then(result => {
    if (result.jaydenFound) {
      console.log('\n✅ SUCCESS: Jayden Daniels injury data is accessible!');
    } else {
      console.log('\n❌ Jayden Daniels not found in current injury report');
      console.log('   This could mean:');
      console.log('   1. He is not currently on the injury report (healthy)');
      console.log('   2. The injury status has been cleared');
      console.log('   3. ESPN has not updated the injury report yet');
    }
  })
  .catch(console.error);