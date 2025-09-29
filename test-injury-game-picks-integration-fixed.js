// Test if injuries are actually being applied to game picks (not just props)
// Updated to use the correct function endpoint
// Run this in your web console to verify injury integration

async function testInjuryGamePicksIntegration() {
  console.log('🔍 TESTING INJURY INTEGRATION IN GAME PICKS SYSTEM');
  console.log('='.repeat(60));
  
  try {
    // Test 1: Check if predictions endpoint considers injuries
    console.log('\n📊 Test 1: Checking predictions with injury data...');
    
    const predictionsResponse = await fetch('/.netlify/functions/nfl-predictions-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        debug: true,
        includeInjuryData: true,
        games: [
          { away: 'NYJ', home: 'MIA' },
          { away: 'CIN', home: 'DEN' }
        ]
      })
    });
    
    if (predictionsResponse.ok) {
      const predictionsData = await predictionsResponse.json();
      console.log('✅ Predictions endpoint accessible');
      
      // Check if injury data is present in response
      if (predictionsData.injuryData || predictionsData.injuries || predictionsData.debug?.injuries) {
        console.log('✅ Injury data found in predictions response');
        console.log('📋 Injury integration details:', predictionsData.injuryData || predictionsData.injuries || predictionsData.debug?.injuries);
      } else {
        console.log('❌ NO injury data found in predictions response');
        console.log('📋 Available data keys:', Object.keys(predictionsData));
      }
      
      // Check for injury adjustments in predictions
      const picks = predictionsData.picks || predictionsData.predictions || predictionsData.games || predictionsData;
      if (Array.isArray(picks)) {
        picks.forEach(pick => {
          if (pick.injuryAdjustment || pick.injury_impact || pick.adjustments?.injury) {
            console.log(`✅ ${pick.game || pick.matchup}: Injury adjustment found`);
            console.log('   📊 Adjustment:', pick.injuryAdjustment || pick.injury_impact || pick.adjustments?.injury);
          } else {
            console.log(`❌ ${pick.game || pick.matchup}: No injury adjustment visible`);
          }
        });
      }
      
    } else {
      console.log('❌ Predictions endpoint not accessible:', predictionsResponse.status);
      const errorText = await predictionsResponse.text();
      console.log('   Error details:', errorText);
    }
    
    // Test 2: Check MNF-specific predictions with/without injuries
    console.log('\n🏈 Test 2: Checking MNF predictions with injury comparison...');
    
    const mnfGames = [
      { away: 'NYJ', home: 'MIA', name: 'Jets @ Dolphins' },
      { away: 'CIN', home: 'DEN', name: 'Bengals @ Broncos' }
    ];
    
    for (const game of mnfGames) {
      console.log(`\n🎯 ${game.name}:`);
      
      // Try to get prediction with explicit injury data
      try {
        const withInjuriesResponse = await fetch('/.netlify/functions/nfl-predictions-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            games: [{ away: game.away, home: game.home }],
            includeInjuries: true,
            debug: true
          })
        });
        
        if (withInjuriesResponse.ok) {
          const withInjuries = await withInjuriesResponse.json();
          console.log('✅ Prediction with injuries successful');
          
          // Look for injury-specific data
          const prediction = withInjuries.predictions?.[0] || withInjuries.games?.[0] || withInjuries;
          
          if (prediction) {
            console.log(`   📊 Spread: ${prediction.spread || prediction.line || 'Not found'}`);
            console.log(`   📊 Total: ${prediction.total || prediction.overUnder || 'Not found'}`);
            console.log(`   📊 Confidence: ${prediction.confidence || 'Not found'}`);
            
            // Check for injury-specific adjustments
            if (prediction.injuryImpact || prediction.injury_adjustments) {
              console.log('   ✅ INJURY IMPACT FOUND:');
              console.log('     ', prediction.injuryImpact || prediction.injury_adjustments);
            } else {
              console.log('   ❌ No injury impact visible in prediction');
            }
            
            // Check for any mention of key injured players
            const predictionStr = JSON.stringify(prediction);
            const keyPlayers = ['Tyreek Hill', 'Noah Fant', 'Jermaine Johnson', 'Storm Duck'];
            keyPlayers.forEach(player => {
              if (predictionStr.includes(player)) {
                console.log(`   🔍 Found reference to ${player} in prediction`);
              }
            });
          }
        } else {
          console.log('❌ Prediction request failed:', withInjuriesResponse.status);
        }
      } catch (e) {
        console.log('❌ Prediction test failed:', e.message);
      }
    }
    
    // Test 3: Direct injury impact calculation
    console.log('\n🏥 Test 3: Testing direct injury calculations...');
    
    try {
      const injuryTestResponse = await fetch('/.netlify/functions/nfl-predictions-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'calculateInjuryImpact',
          teams: ['NYJ', 'MIA', 'CIN', 'DEN'],
          injuries: {
            NYJ: [
              { name: 'Jermaine Johnson II', position: 'DE', status: 'Out' },
              { name: 'Kene Nwangwu', position: 'RB', status: 'Out' }
            ],
            MIA: [
              { name: 'Tyreek Hill', position: 'WR', status: 'Unknown' },
              { name: 'Storm Duck', position: 'CB', status: 'Out' },
              { name: 'Jason Marshall Jr.', position: 'CB', status: 'Out' }
            ],
            CIN: [
              { name: 'Noah Fant', position: 'TE', status: 'Out' }
            ],
            DEN: [
              { name: 'Marvin Mims Jr.', position: 'WR', status: 'Questionable' }
            ]
          }
        })
      });
      
      if (injuryTestResponse.ok) {
        const injuryResults = await injuryTestResponse.json();
        console.log('✅ Direct injury calculation accessible');
        
        Object.keys(injuryResults).forEach(team => {
          const teamResult = injuryResults[team];
          if (teamResult.impact || teamResult.spreadAdjustment || teamResult.totalAdjustment) {
            console.log(`✅ ${team}: Impact calculated`);
            console.log(`   📊 Spread adjustment: ${teamResult.spreadAdjustment || teamResult.impact || 'None'}`);
            console.log(`   📊 Total adjustment: ${teamResult.totalAdjustment || 'None'}`);
          } else {
            console.log(`❌ ${team}: No injury impact calculated`);
          }
        });
      } else {
        console.log('⚠️ Direct injury calculation not supported');
      }
    } catch (e) {
      console.log('⚠️ Direct injury test failed:', e.message);
    }
    
    // Test 4: Check if the CJS file is actually being used
    console.log('\n🔧 Test 4: Checking game picks generator usage...');
    
    try {
      // Look for the actual game picks function that might be running
      const gamePicksResponse = await fetch('/.netlify/functions/nfl-predictions-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week: 4,
          year: 2025,
          teams: ['NYJ', 'MIA', 'CIN', 'DEN'],
          includeDetails: true
        })
      });
      
      if (gamePicksResponse.ok) {
        const gamePicksData = await gamePicksResponse.json();
        console.log('✅ Game picks generator accessible');
        
        // Check for any injury-related processing
        const dataStr = JSON.stringify(gamePicksData);
        if (dataStr.includes('injury') || dataStr.includes('Injury')) {
          console.log('✅ Injury processing detected in game picks');
          
          // Extract injury-related content
          const injuryMatches = dataStr.match(/[^"]*injury[^"]*/gi);
          if (injuryMatches) {
            console.log('   🔍 Injury references found:');
            injuryMatches.slice(0, 5).forEach(match => {
              console.log(`     "${match}"`);
            });
          }
        } else {
          console.log('❌ No injury processing detected in game picks');
        }
        
        // Look for the specific functions mentioned in the CJS file
        if (dataStr.includes('calculateInjuryImpact') || dataStr.includes('loadInjuryData')) {
          console.log('✅ Injury functions are being called');
        } else {
          console.log('❌ Injury functions not detected');
        }
        
      } else {
        console.log('❌ Game picks generator not accessible:', gamePicksResponse.status);
      }
    } catch (e) {
      console.log('❌ Game picks test failed:', e.message);
    }
    
    console.log('\n📋 SUMMARY:');
    console.log('='.repeat(40));
    console.log('• ✅ = Injuries ARE being integrated into game picks');
    console.log('• ❌ = Injuries are NOT affecting game predictions');
    console.log('• Look for actual spread/total adjustments in Test 2');
    console.log('• If no injury impact found, your system may only handle props');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Auto-run the test
console.log('🚀 Starting injury-game picks integration test...\n');
testInjuryGamePicksIntegration().then(() => {
  console.log('\n✅ Integration test complete!');
}).catch(err => {
  console.error('💥 Test failed:', err);
});