// QUICK INJURY INTEGRATION TEST AFTER FIX
// This should now show injury data in the response

async function testInjuryIntegrationAfterFix() {
  console.log('🔍 TESTING INJURY INTEGRATION AFTER FIX');
  console.log('=' .repeat(60));
  
  try {
    const testRequest = {
      debug: true,
      includeInjuries: true,
      games: [
        { away: 'NYJ', home: 'MIA' }
      ]
    };
    
    console.log('🔄 Testing prediction endpoint...');
    
    const response = await fetch('/.netlify/functions/nfl-predictions-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testRequest)
    });
    
    if (!response.ok) {
      console.log('❌ Endpoint failed:', response.status);
      return;
    }
    
    const data = await response.json();
    console.log('✅ Endpoint successful');
    
    // Check for new injury integration status
    if (data.injuryIntegrationStatus) {
      console.log('\n🔍 INJURY INTEGRATION STATUS:');
      console.log(data.injuryIntegrationStatus);
      
      if (data.injuryIntegrationStatus.dataAvailable) {
        console.log('✅ Injury data is available');
        console.log(`📊 Teams with injury data: ${data.injuryIntegrationStatus.teamsWithData}`);
        console.log(`🎯 Games with injury impact: ${data.injuryIntegrationStatus.gamesWithInjuryImpact}`);
      } else {
        console.log('❌ No injury data available');
      }
    } else {
      console.log('❌ No injuryIntegrationStatus found - fix may not be deployed yet');
    }
    
    // Check predictions for injury analysis
    const predictions = data.predictions || [];
    if (predictions.length > 0) {
      const pred = predictions[0];
      console.log('\n🏈 FIRST PREDICTION INJURY ANALYSIS:');
      
      if (pred.modelEnhancements?.injuryAnalysis) {
        console.log('✅ Injury analysis found in modelEnhancements');
        console.log(pred.modelEnhancements.injuryAnalysis);
      } else {
        console.log('❌ No injury analysis in modelEnhancements');
      }
      
      if (pred.teamStats?.home?.injuryImpact || pred.teamStats?.away?.injuryImpact) {
        console.log('✅ Injury impact found in teamStats');
        if (pred.teamStats.home?.injuryImpact) {
          console.log('   Home team injuries:', pred.teamStats.home.injuryImpact);
        }
        if (pred.teamStats.away?.injuryImpact) {
          console.log('   Away team injuries:', pred.teamStats.away.injuryImpact);
        }
      } else {
        console.log('❌ No injury impact in teamStats');
      }
    }
    
    console.log('\n📋 SUMMARY:');
    if (data.injuryIntegrationStatus?.dataAvailable && 
        data.injuryIntegrationStatus?.gamesWithInjuryImpact > 0) {
      console.log('✅ INJURY INTEGRATION IS WORKING');
      console.log('✅ Injury data is being applied to game predictions');
    } else if (data.injuryIntegrationStatus?.dataAvailable) {
      console.log('⚠️ INJURY DATA AVAILABLE BUT NO IMPACT DETECTED');
      console.log('   This could mean no significant injuries for these teams');
    } else {
      console.log('❌ INJURY INTEGRATION NOT WORKING');
      console.log('   Check injury data source and loading process');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Auto-run the test
console.log('🚀 Testing injury integration after fix...\n');
testInjuryIntegrationAfterFix().then(() => {
  console.log('\n✅ Test complete!');
}).catch(err => {
  console.error('💥 Test failed:', err);
});