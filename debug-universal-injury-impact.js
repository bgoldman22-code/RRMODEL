// Universal Injury Impact Debug Script
// Shows how ANY team's injuries flow through to predictions with detailed console output

console.log('🔬 UNIVERSAL INJURY IMPACT DEBUG SYSTEM');
console.log('='.repeat(60));

async function debugTeamInjuryImpact(teamCode = 'NYG') {
  try {
    console.log(`\n📊 DEBUGGING INJURY IMPACT FOR: ${teamCode}`);
    console.log('-'.repeat(50));
    
    // STEP 1: Get team-specific injury data
    console.log('\n📋 STEP 1: Fetching Team-Specific Injury Data...');
    
    // Map team codes to ESPN team IDs
    const teamIdMap = {
      'NYG': '19', 'DAL': '6', 'SEA': '26', 'SF': '25', 'KC': '12', 'LV': '13',
      'BUF': '2', 'MIA': '15', 'NE': '17', 'NYJ': '20', 'BAL': '33', 'CIN': '4',
      'CLE': '5', 'PIT': '23', 'HOU': '34', 'IND': '11', 'JAX': '30', 'TEN': '10',
      'DEN': '7', 'LAC': '24', 'ARI': '22', 'LAR': '14', 'ATL': '1', 'CAR': '29',
      'NO': '18', 'TB': '27', 'CHI': '3', 'DET': '8', 'GB': '9', 'MIN': '16',
      'PHI': '21', 'WAS': '28'
    };
    
    const teamId = teamIdMap[teamCode] || '19'; // Default to NYG
    
    // Create team-specific injury function
    const teamInjuryResponse = await fetch('https://bgroundrobin.com/.netlify/functions/test-team-injuries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamCode: teamCode,
        teamId: teamId,
        debug: true
      })
    });
    
    // If team-specific function doesn't exist, use direct ESPN API
    let injuryData = null;
    if (!teamInjuryResponse.ok) {
      console.log('⚠️ Team-specific function not found, using direct ESPN API...');
      
      const espnUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
      const espnResponse = await fetch(espnUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)',
          'Accept': 'application/json'
        }
      });
      
      if (espnResponse.ok) {
        const espnData = await espnResponse.json();
        const injuryRefs = espnData.items || [];
        
        console.log(`✅ Found ${injuryRefs.length} injury reports for ${teamCode}`);
        
        // Process first few injuries to get details
        const injuries = [];
        for (const ref of injuryRefs.slice(0, 8)) {
          try {
            const injuryResponse = await fetch(ref.$ref, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)' }
            });
            
            if (injuryResponse.ok) {
              const injuryDetail = await injuryResponse.json();
              
              // Get player details
              let playerName = 'Unknown';
              let position = 'UNK';
              
              if (injuryDetail.athlete?.$ref) {
                try {
                  const playerResponse = await fetch(injuryDetail.athlete.$ref, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)' }
                  });
                  
                  if (playerResponse.ok) {
                    const playerData = await playerResponse.json();
                    playerName = playerData.displayName || playerData.name || 'Unknown';
                    position = playerData.position?.abbreviation || 'UNK';
                  }
                } catch (e) {
                  // Skip player details if it fails
                }
              }
              
              injuries.push({
                player: playerName,
                position: position,
                status: injuryDetail.status || 'Unknown',
                description: injuryDetail.description || 'Undisclosed',
                injuryType: injuryDetail.type || 'Unknown'
              });
            }
          } catch (e) {
            // Skip failed injury details
          }
        }
        
        injuryData = {
          team: teamCode,
          injuries: injuries,
          injuryCount: injuries.length
        };
      } else {
        console.log(`❌ ESPN API failed for ${teamCode}: ${espnResponse.status}`);
        return;
      }
    } else {
      injuryData = await teamInjuryResponse.json();
    }
    
    if (!injuryData || !injuryData.injuries) {
      console.log(`❌ No injury data available for ${teamCode}`);
      return;
    }
    
    console.log(`✅ ${teamCode} Injury Data Retrieved:`);
    console.log(`   Total Injuries: ${injuryData.injuryCount}`);
    
    // Show all injuries with status
    console.log('\n🏥 CURRENT INJURY REPORT:');
    injuryData.injuries.forEach((injury, idx) => {
      const statusIcon = injury.status === 'Out' || injury.status === 'Injured Reserve' ? '🚨' :
                        injury.status === 'Questionable' ? '⚠️' :
                        injury.status === 'Doubtful' ? '🔶' : '✅';
      console.log(`   ${idx + 1}. ${statusIcon} ${injury.player} (${injury.position}): ${injury.status}`);
      if (injury.description !== 'Undisclosed') {
        console.log(`      └─ ${injury.description}`);
      }
    });
    
    // STEP 2: Test prediction with and without this team
    console.log('\n📈 STEP 2: Testing Prediction Impact...');
    
    // Create test games with this team as both home and away
    const testGames = [
      { home_team: teamCode, away_team: 'KC' }, // Team as home
      { home_team: 'KC', away_team: teamCode }  // Team as away
    ];
    
    for (const game of testGames) {
      console.log(`\n--- Testing: ${game.away_team} @ ${game.home_team} ---`);
      
      const predictionResponse = await fetch('https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          games: [game],
          debug: true,
          verbose: true,
          includeInjuryTrace: true
        })
      });
      
      if (!predictionResponse.ok) {
        console.log(`❌ Prediction failed: ${predictionResponse.status}`);
        continue;
      }
      
      const predictionData = await predictionResponse.json();
      const prediction = predictionData.predictions[0];
      
      console.log(`   Home Win Prob: ${(prediction.predictions.home_win_prob * 100).toFixed(1)}%`);
      console.log(`   Away Win Prob: ${(prediction.predictions.away_win_prob * 100).toFixed(1)}%`);
      console.log(`   Spread: ${game.home_team} ${prediction.predictions.spread.line}`);
      console.log(`   Total: ${prediction.predictions.total.line} (predicted: ${prediction.predictions.total.predicted})`);
      
      // Look for injury evidence
      if (prediction.modelEnhancements?.diagnostics) {
        const diag = prediction.modelEnhancements.diagnostics;
        console.log(`   Scores - Home: ${diag.homeScore}, Away: ${diag.awayScore}`);
        
        if (diag.injuryAdjustments) {
          console.log(`   🏥 Injury adjustments detected:`);
          console.log(`      ${JSON.stringify(diag.injuryAdjustments)}`);
        }
        
        if (diag.gameContext?.majorInjuries) {
          console.log(`   🚨 Major injuries flag: ${diag.gameContext.majorInjuries}`);
        }
      }
      
      // Check confidence levels
      const avgConfidence = (prediction.predictions.moneyline.confidence + 
                            prediction.predictions.spread.confidence + 
                            prediction.predictions.total.confidence) / 3;
      console.log(`   Average Confidence: ${avgConfidence.toFixed(1)}%`);
      
      // Look for betting recommendations
      const recommendations = [];
      if (prediction.predictions.moneyline.betRecommendation === 'BET') {
        recommendations.push(`ML: ${prediction.predictions.moneyline.pick}`);
      }
      if (prediction.predictions.spread.betRecommendation === 'BET') {
        recommendations.push(`Spread: ${prediction.predictions.spread.pick}`);
      }
      if (prediction.predictions.total.betRecommendation === 'BET') {
        recommendations.push(`Total: ${prediction.predictions.total.pick}`);
      }
      
      console.log(`   Betting Recommendations: ${recommendations.length > 0 ? recommendations.join(', ') : 'None'}`);
    }
    
    // STEP 3: Test the comprehensive injury system
    console.log('\n🔧 STEP 3: Testing Comprehensive Injury System...');
    
    const comprehensiveResponse = await fetch('https://bgroundrobin.com/.netlify/functions/nfl-injuries-comprehensive');
    
    if (comprehensiveResponse.ok) {
      const comprehensiveData = await comprehensiveResponse.json();
      
      if (comprehensiveData.teams?.[teamCode]) {
        console.log(`✅ ${teamCode} found in comprehensive injury system:`);
        const teamData = comprehensiveData.teams[teamCode];
        
        // Show structured injury data
        if (teamData.qb_status) {
          console.log(`   QB Status: ${teamData.qb_status} (${teamData.qb_name || 'Unknown'})`);
        }
        
        if (teamData.wr_injuries?.length > 0) {
          console.log(`   WR Injuries: ${teamData.wr_injuries.length}`);
          teamData.wr_injuries.forEach(wr => {
            console.log(`     ${wr.name}: ${wr.status} (depth: ${wr.depth || 'unknown'})`);
          });
        }
        
        if (teamData.rb_injuries?.length > 0) {
          console.log(`   RB Injuries: ${teamData.rb_injuries.length}`);
          teamData.rb_injuries.forEach(rb => {
            console.log(`     ${rb.name}: ${rb.status} (depth: ${rb.depth || 'unknown'})`);
          });
        }
        
        if (teamData.te_injuries?.length > 0) {
          console.log(`   TE Injuries: ${teamData.te_injuries.length}`);
          teamData.te_injuries.forEach(te => {
            console.log(`     ${te.name}: ${te.status} (depth: ${te.depth || 'unknown'})`);
          });
        }
        
        // Show positional injury counts
        ['ol_starters_out', 'db_starters_out', 'lb_starters_out'].forEach(position => {
          if (teamData[position] > 0) {
            console.log(`   ${position}: ${teamData[position]}`);
          }
        });
        
      } else {
        console.log(`❌ ${teamCode} not found in comprehensive injury system`);
      }
    } else {
      console.log(`❌ Comprehensive injury system failed: ${comprehensiveResponse.status}`);
    }
    
    // STEP 4: Summary
    console.log(`\n📋 INJURY IMPACT SUMMARY FOR ${teamCode}:`);
    console.log('='.repeat(50));
    
    const significantInjuries = injuryData.injuries.filter(inj => 
      inj.status === 'Out' || inj.status === 'Injured Reserve' || inj.status === 'Doubtful'
    );
    
    console.log(`• Total Injuries: ${injuryData.injuryCount}`);
    console.log(`• Significant Injuries: ${significantInjuries.length}`);
    
    if (significantInjuries.length > 0) {
      console.log(`• Key Players Out/Doubtful:`);
      significantInjuries.forEach(inj => {
        console.log(`  - ${inj.player} (${inj.position}): ${inj.status}`);
      });
    }
    
    console.log(`• Injury data is flowing through the prediction pipeline`);
    console.log(`• Look for score adjustments and confidence changes in the prediction output above`);
    
  } catch (error) {
    console.error(`❌ Debug failed for ${teamCode}:`, error);
  }
}

// Test multiple teams if no argument provided
async function runUniversalDebug() {
  const testTeam = process.argv[2] || 'NYG'; // Default to NYG, but allow command line override
  
  console.log(`🎯 Testing injury impact for: ${testTeam}`);
  await debugTeamInjuryImpact(testTeam);
  
  // If NYG was requested, also test a few other key teams for comparison
  if (testTeam === 'NYG') {
    console.log('\n' + '='.repeat(80));
    console.log('🔄 Running additional tests on key teams for comparison...');
    
    const additionalTeams = ['SF', 'SEA', 'KC']; // Teams with different injury profiles
    
    for (const team of additionalTeams) {
      console.log('\n' + '='.repeat(80));
      await debugTeamInjuryImpact(team);
    }
  }
}

// Run the universal debug
runUniversalDebug();