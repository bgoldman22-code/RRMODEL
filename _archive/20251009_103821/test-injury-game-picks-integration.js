// Test if injuries are actually being applied to game picks (not just props)
// Run this in your web console to verify injury integration

async function testInjuryGamePicksIntegration() {
  console.log('🔍 TESTING INJURY INTEGRATION IN GAME PICKS SYSTEM');
  console.log('=' .repeat(60));
  
  try {
    // Test 1: Check if game picks endpoint considers injuries
    console.log('\n📊 Test 1: Checking game picks with injury data...');
    
    const gamePicksResponse = await fetch('/.netlify/functions/nfl-game-picks-generator', {
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
    
    if (gamePicksResponse.ok) {
      const gamePicksData = await gamePicksResponse.json();
      console.log('✅ Game picks endpoint accessible');
      
      // Check if injury data is present in response
      if (gamePicksData.injuryData || gamePicksData.injuries || gamePicksData.debug?.injuries) {
        console.log('✅ Injury data found in game picks response');
        console.log('📋 Injury integration details:', gamePicksData.injuryData || gamePicksData.injuries || gamePicksData.debug?.injuries);
      } else {
        console.log('❌ NO injury data found in game picks response');
        console.log('📋 Available data keys:', Object.keys(gamePicksData));
      }
      
      // Check for injury adjustments in predictions
      const picks = gamePicksData.picks || gamePicksData.predictions || gamePicksData;
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
      console.log('❌ Game picks endpoint not accessible:', gamePicksResponse.status);
    }
    
    // Test 2: Check your current injury system integration
    console.log('\n🏥 Test 2: Checking injury system integration...');
    
    const injurySystemResponse = await fetch('/.netlify/functions/test-injury-integration-final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teams: ['NYJ', 'MIA', 'CIN', 'DEN'],
        checkGameImpact: true
      })
    });
    
    if (injurySystemResponse.ok) {
      const injuryData = await injurySystemResponse.json();
      console.log('✅ Injury system accessible');
      
      // Check if it returns game-level adjustments
      Object.keys(injuryData).forEach(team => {
        const teamData = injuryData[team];
        if (teamData.gameAdjustment || teamData.spreadAdjustment || teamData.totalAdjustment) {
          console.log(`✅ ${team}: Game-level injury adjustments found`);
          console.log(`   📊 Spread adjustment: ${teamData.spreadAdjustment || 'None'}`);
          console.log(`   📊 Total adjustment: ${teamData.totalAdjustment || 'None'}`);
        } else {
          console.log(`❌ ${team}: No game-level adjustments found`);
          console.log(`   📋 Available data:`, Object.keys(teamData));
        }
      });
    } else {
      console.log('❌ Injury system not accessible:', injurySystemResponse.status);
    }
    
    // Test 3: Check specific MNF game predictions
    console.log('\n🏈 Test 3: Checking MNF game predictions specifically...');
    
    const mnfGames = [
      { away: 'NYJ', home: 'MIA', name: 'Jets @ Dolphins' },
      { away: 'CIN', home: 'DEN', name: 'Bengals @ Broncos' }
    ];
    
    for (const game of mnfGames) {
      console.log(`\n🎯 ${game.name}:`);
      
      // Try to get baseline prediction without injuries
      const baselineResponse = await fetch('/.netlify/functions/nfl-game-picks-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game: { away: game.away, home: game.home },
          ignoreInjuries: true
        })
      }).catch(() => null);
      
      // Try to get prediction with injuries
      const withInjuriesResponse = await fetch('/.netlify/functions/nfl-game-picks-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game: { away: game.away, home: game.home },
          includeInjuries: true
        })
      }).catch(() => null);
      
      if (baselineResponse?.ok && withInjuriesResponse?.ok) {
        const baseline = await baselineResponse.json();
        const withInjuries = await withInjuriesResponse.json();
        
        // Compare predictions
        const baseSpread = baseline.spread || baseline.prediction?.spread;
        const injurySpread = withInjuries.spread || withInjuries.prediction?.spread;
        
        const baseTotal = baseline.total || baseline.prediction?.total;
        const injuryTotal = withInjuries.total || withInjuries.prediction?.total;
        
        if (baseSpread !== injurySpread || baseTotal !== injuryTotal) {
          console.log('✅ Injury impact detected in predictions!');
          console.log(`   📊 Spread: ${baseSpread} → ${injurySpread} (${injurySpread - baseSpread} adjustment)`);
          console.log(`   📊 Total: ${baseTotal} → ${injuryTotal} (${injuryTotal - baseTotal} adjustment)`);
        } else {
          console.log('❌ No difference between baseline and injury predictions');
          console.log(`   📊 Spread: ${baseSpread} (unchanged)`);
          console.log(`   📊 Total: ${baseTotal} (unchanged)`);
        }
      } else {
        console.log('⚠️ Could not test baseline vs injury comparison');
      }
    }
    
    // Test 4: Check the enhanced injury system
    console.log('\n🔧 Test 4: Checking enhanced injury system...');
    
    const enhancedResponse = await fetch('/.netlify/functions/enhanced-injury-replacement-system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teams: ['NYJ', 'MIA', 'CIN', 'DEN'],
        gameContext: true
      })
    });
    
    if (enhancedResponse.ok) {
      const enhancedData = await enhancedResponse.json();
      console.log('✅ Enhanced injury system accessible');
      
      // Check for game-level impacts
      Object.keys(enhancedData).forEach(team => {
        const teamData = enhancedData[team];
        if (teamData.gameImpact || teamData.spreadImpact || teamData.totalImpact) {
          console.log(`✅ ${team}: Enhanced injury impacts found`);
        } else {
          console.log(`❌ ${team}: No enhanced injury impacts`);
        }
      });
    } else {
      console.log('❌ Enhanced injury system not accessible');
    }
    
    // Test 5: Final Integration Check
    console.log('\n🎯 Test 5: Final integration verification...');
    
    const finalTestResponse = await fetch('/.netlify/functions/debug-model-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'checkInjuryIntegration',
        games: mnfGames
      })
    });
    
    if (finalTestResponse.ok) {
      const finalData = await finalTestResponse.json();
      console.log('✅ Model analysis endpoint accessible');
      
      if (finalData.injuryIntegration) {
        console.log('✅ Injury integration confirmed in model');
        console.log('📊 Integration details:', finalData.injuryIntegration);
      } else {
        console.log('❌ No injury integration confirmed in model');
      }
    } else {
      console.log('⚠️ Model analysis endpoint not accessible');
    }
    
    console.log('\n📋 SUMMARY:');
    console.log('=' .repeat(40));
    console.log('• Check each ✅/❌ above to see where injury data is/isn\'t integrated');
    console.log('• Look for spread/total adjustments between baseline and injury predictions');
    console.log('• If all tests show ❌, injuries may only affect props, not game picks');
    console.log('• If you see ✅ with actual number adjustments, injuries ARE affecting game picks');
    
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