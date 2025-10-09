// Focused test for Washington Commanders 2025 injury data - specifically looking for Jayden Daniels

import fetch from 'node-fetch';

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

async function fetchWashingtonInjuries() {
  const teamId = getESPNTeamId('WAS');
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
  
  console.log(`🏈 WASHINGTON COMMANDERS INJURY REPORT - Week 4 2025`);
  console.log(`🔗 API URL: ${url}`);
  console.log('='.repeat(60));
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`ESPN API returned ${response.status} for WAS`);
    }
    
    const data = await response.json();
    const injuryRefs = data.items || [];
    
    console.log(`📊 Found ${injuryRefs.length} injury references for Washington`);
    console.log('-'.repeat(60));
    
    if (injuryRefs.length === 0) {
      console.log('✅ NO INJURIES REPORTED for Washington Commanders');
      return;
    }
    
    const allInjuries = [];
    let jaydenFound = false;
    
    // Process all injury references
    for (let i = 0; i < injuryRefs.length; i++) {
      const ref = injuryRefs[i];
      console.log(`\n📋 Processing injury ${i+1}/${injuryRefs.length}`);
      console.log(`🔗 URL: ${ref.$ref}`);
      
      try {
        const injuryResponse = await fetch(ref.$ref);
        if (!injuryResponse.ok) {
          console.log(`❌ Failed to fetch: ${injuryResponse.status}`);
          continue;
        }
        
        const injuryData = await injuryResponse.json();
        
        // Get athlete data
        let athleteName = 'Unknown Player';
        let position = 'UNK';
        
        if (injuryData.athlete && injuryData.athlete.$ref) {
          try {
            const athleteResponse = await fetch(injuryData.athlete.$ref);
            if (athleteResponse.ok) {
              const athleteData = await athleteResponse.json();
              athleteName = athleteData.displayName || athleteData.name || 'Unknown';
              position = athleteData.position?.abbreviation || 'UNK';
            }
          } catch (e) {
            console.log(`⚠️ Could not fetch athlete: ${e.message}`);
          }
        }
        
        const processedInjury = {
          name: athleteName,
          position: position,
          status: mapInjuryStatus(injuryData.status),
          description: injuryData.description || injuryData.detail || injuryData.longComment || injuryData.shortComment || 'No details',
          rawStatus: injuryData.status,
          espnId: injuryData.athlete?.id || 'unknown'
        };
        
        allInjuries.push(processedInjury);
        
        // Display this injury
        const statusIcon = position === 'QB' ? '🏈' : 
                          processedInjury.status === 'out' ? '🚨' : 
                          processedInjury.status === 'doubtful' ? '⚠️' : '📝';
        
        console.log(`${statusIcon} ${athleteName} (${position}) - ${processedInjury.status.toUpperCase()}`);
        console.log(`   Description: ${processedInjury.description}`);
        console.log(`   Raw ESPN Status: ${injuryData.status || 'N/A'}`);
        
        // Check for Jayden Daniels
        if (athleteName.toLowerCase().includes('daniels') || 
            (position === 'QB' && athleteName.toLowerCase().includes('jayden'))) {
          console.log(`\n🚨🚨🚨 FOUND JAYDEN DANIELS! 🚨🚨🚨`);
          console.log(`📊 Full Details:`);
          console.log(`   Name: ${athleteName}`);
          console.log(`   Position: ${position}`);
          console.log(`   Status: ${processedInjury.status}`);
          console.log(`   Description: ${processedInjury.description}`);
          console.log(`   ESPN Raw Status: ${injuryData.status}`);
          console.log(`   ESPN ID: ${processedInjury.espnId}`);
          jaydenFound = true;
        }
        
      } catch (error) {
        console.log(`❌ Error processing injury: ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`📈 WASHINGTON COMMANDERS INJURY SUMMARY`);
    console.log('='.repeat(60));
    
    if (allInjuries.length === 0) {
      console.log('✅ No injuries processed successfully');
      return;
    }
    
    // Group by position
    const byPosition = {};
    allInjuries.forEach(inj => {
      if (!byPosition[inj.position]) byPosition[inj.position] = [];
      byPosition[inj.position].push(inj);
    });
    
    Object.keys(byPosition).sort().forEach(pos => {
      console.log(`\n${pos}:`);
      byPosition[pos].forEach(inj => {
        const statusColor = inj.status === 'out' ? '🔴' : 
                           inj.status === 'doubtful' ? '🟠' : 
                           inj.status === 'questionable' ? '🟡' : '🟢';
        console.log(`  ${statusColor} ${inj.name} - ${inj.status}`);
      });
    });
    
    // QB specific analysis
    const qbs = allInjuries.filter(inj => inj.position === 'QB');
    if (qbs.length > 0) {
      console.log(`\n🏈 QUARTERBACK STATUS:`);
      qbs.forEach(qb => {
        console.log(`  🎯 ${qb.name}: ${qb.status.toUpperCase()}`);
        console.log(`     ${qb.description}`);
      });
    } else {
      console.log(`\n🏈 QUARTERBACK STATUS: ✅ NO QB INJURIES LISTED`);
    }
    
    if (!jaydenFound) {
      console.log(`\n❓ JAYDEN DANIELS NOT FOUND IN INJURY REPORT`);
      console.log(`   This likely means he is HEALTHY and not on the injury report`);
    }
    
    return allInjuries;
    
  } catch (error) {
    console.error(`❌ ESPN API error for Washington:`, error);
    throw error;
  }
}

// Run the test
fetchWashingtonInjuries()
  .then(injuries => {
    console.log(`\n🎯 FINAL RESULT: ${injuries?.length || 0} injuries found for Washington`);
  })
  .catch(console.error);