// Test current 2025 injury data collection using ESPN API
// This should give us Jayden Daniels and other 2025 Week 4 injury data

import fetch from 'node-fetch';

// ESPN Team ID mapping
function getESPNTeamId(nflCode) {
  const teamMap = {
    'ARI': '22', 'ATL': '1', 'BAL': '33', 'BUF': '2', 'CAR': '29',
    'CHI': '3', 'CIN': '4', 'CLE': '5', 'DAL': '6', 'DEN': '7',
    'DET': '8', 'GB': '9', 'HOU': '34', 'IND': '11', 'JAX': '30',
    'KC': '12', 'LV': '13', 'LAC': '24', 'LAR': '14', 'MIA': '15',
    'MIN': '16', 'NE': '17', 'NO': '18', 'NYG': '19', 'NYJ': '20',
    'PHI': '21', 'PIT': '23', 'SF': '25', 'SEA': '26', 'TB': '27',
    'TEN': '10', 'WAS': '28'
  };
  
  return teamMap[nflCode] || '1';
}

function mapInjuryStatus(espnStatus) {
  const statusMap = {
    'out': 'out',
    'doubtful': 'doubtful', 
    'questionable': 'questionable',
    'probable': 'active',
    'active': 'active',
    'day-to-day': 'questionable'
  };
  
  return statusMap[espnStatus?.toLowerCase()] || 'questionable';
}

async function fetchESPNInjuries(teamCode) {
  const teamId = getESPNTeamId(teamCode);
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
  
  console.log(`🏥 Fetching ${teamCode} injuries from: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`ESPN API returned ${response.status} for ${teamCode}`);
    }
    
    const data = await response.json();
    const injuryRefs = data.items || [];
    const injuries = [];
    
    console.log(`${teamCode}: Processing ${injuryRefs.length} injury references`);
    
    // Process each injury reference (limit to 10 for testing)
    for (const ref of injuryRefs.slice(0, 10)) {
      try {
        console.log(`  Fetching: ${ref.$ref}`);
        const injuryResponse = await fetch(ref.$ref);
        if (!injuryResponse.ok) {
          console.log(`  ❌ Failed to fetch injury details: ${injuryResponse.status}`);
          continue;
        }
        
        const injuryData = await injuryResponse.json();
        console.log(`  📋 Injury data:`, JSON.stringify(injuryData, null, 2));
        
        // Get athlete data
        let athleteName = 'Unknown Player';
        let position = 'UNK';
        
        if (injuryData.athlete && injuryData.athlete.$ref) {
          try {
            console.log(`    👤 Fetching athlete: ${injuryData.athlete.$ref}`);
            const athleteResponse = await fetch(injuryData.athlete.$ref);
            if (athleteResponse.ok) {
              const athleteData = await athleteResponse.json();
              athleteName = athleteData.displayName || athleteData.name || 'Unknown';
              position = athleteData.position?.abbreviation || 'UNK';
              console.log(`    ✅ Player: ${athleteName} (${position})`);
            }
          } catch (e) {
            console.log(`    ⚠️ Could not fetch athlete: ${e.message}`);
          }
        }
        
        const processedInjury = {
          name: athleteName,
          position: position,
          status: mapInjuryStatus(injuryData.status),
          description: injuryData.description || injuryData.detail || 'No details',
          espnId: injuryData.athlete?.id || 'unknown',
          rawStatus: injuryData.status
        };
        
        injuries.push(processedInjury);
        console.log(`  ✅ Processed: ${athleteName} (${position}) - ${processedInjury.status}`);
        
        // Check if this is Jayden Daniels
        if (athleteName.toLowerCase().includes('daniels') && position === 'QB') {
          console.log(`🚨 FOUND JAYDEN DANIELS! Status: ${processedInjury.status} - ${processedInjury.description}`);
        }
        
      } catch (error) {
        console.log(`  ❌ Error processing injury: ${error.message}`);
      }
    }
    
    return injuries;
    
  } catch (error) {
    console.error(`❌ ESPN API error for ${teamCode}:`, error);
    return [];
  }
}

async function testCurrentInjuries() {
  console.log('🏥 TESTING CURRENT 2025 NFL INJURY DATA');
  console.log('='.repeat(50));
  
  // Test key teams with known injury concerns
  const testTeams = ['WAS', 'ATL', 'BUF', 'KC', 'SF'];
  
  for (const team of testTeams) {
    console.log(`\n🏈 TESTING ${team}:`);
    console.log('-'.repeat(30));
    
    try {
      const injuries = await fetchESPNInjuries(team);
      
      if (injuries.length === 0) {
        console.log(`✅ ${team}: No injuries reported`);
      } else {
        console.log(`📊 ${team}: ${injuries.length} injuries found:`);
        injuries.forEach(inj => {
          const icon = inj.position === 'QB' ? '🏈' : inj.status === 'out' ? '🚨' : '⚠️';
          console.log(`  ${icon} ${inj.name} (${inj.position}) - ${inj.status}`);
          if (inj.description !== 'No details') {
            console.log(`      ${inj.description}`);
          }
        });
        
        // QB-specific analysis
        const qbInjuries = injuries.filter(inj => inj.position === 'QB');
        if (qbInjuries.length > 0) {
          console.log(`\n  🏈 QB STATUS FOR ${team}:`);
          qbInjuries.forEach(qb => {
            console.log(`    ${qb.name}: ${qb.status} - ${qb.description}`);
          });
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`❌ Failed to test ${team}:`, error.message);
    }
  }
}

// Run the test
testCurrentInjuries().catch(console.error);