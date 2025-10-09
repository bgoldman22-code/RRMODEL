// DETAILED INJURY INTEGRATION DEBUG
// This will test the exact path your injury data takes through the system

async function detailedInjuryIntegrationDebug() {
  console.log('🔍 DETAILED INJURY INTEGRATION DEBUG');
  console.log('=' .repeat(60));
  
  try {
    // Test 1: Check if injury endpoint is working at all
    console.log('\n📊 Test 1: Direct injury data endpoint check...');
    
    try {
      const injuryResponse = await fetch('https://bgroundrobin.com/data/nfl/injuries/latest.json');
      const injuryData = await injuryResponse.json();
      
      console.log('✅ Injury endpoint accessible');
      console.log(`📋 Data timestamp: ${injuryData.asOf}`);
      console.log(`📋 Team count: ${Object.keys(injuryData.teams || {}).length}`);
      
      // Check specific MNF teams
      ['NYJ', 'MIA', 'CIN', 'DEN'].forEach(team => {
        const teamData = injuryData.teams[team];
        if (teamData) {
          console.log(`   ${team}: QB ${teamData.qb_name} (${teamData.qb_status})`);
          const rbCount = teamData.rb_injuries?.length || 0;
          const wrCount = teamData.wr_injuries?.length || 0;
          const teCount = teamData.te_injuries?.length || 0;
          console.log(`   ${team}: ${rbCount} RB, ${wrCount} WR, ${teCount} TE injuries`);
        } else {
          console.log(`   ${team}: No injury data found`);
        }
      });
      
    } catch (e) {
      console.log('❌ Injury endpoint failed:', e.message);
      return;
    }
    
    // Test 2: Test the actual prediction endpoint with debug flags
    console.log('\n🎯 Test 2: Prediction endpoint with maximum debug...');
    
    const testRequest = {
      debug: true,
      verbose: true,
      includeInjuries: true,
      includeInjuryData: true,
      showDiagnostics: true,
      games: [
        { away: 'NYJ', home: 'MIA' },
        { away: 'CIN', home: 'DEN' }
      ]
    };
    
    console.log('🔄 Sending test request:', testRequest);
    
    const predResponse = await fetch('/.netlify/functions/nfl-predictions-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testRequest)
    });
    
    if (!predResponse.ok) {
      console.log('❌ Prediction endpoint failed:', predResponse.status);
      const errorText = await predResponse.text();
      console.log('   Error details:', errorText);
      return;
    }
    
    const predData = await predResponse.json();
    console.log('✅ Prediction endpoint successful');
    console.log('📋 Response structure:', Object.keys(predData));
    
    // Deep dive into the prediction structure
    const predictions = predData.predictions || predData.games || [];
    
    if (predictions.length === 0) {
      console.log('❌ No predictions returned');
      return;
    }
    
    predictions.forEach((pred, idx) => {
      const gameKey = `${pred.away_team} @ ${pred.home_team}`;
      console.log(`\n🏈 Game ${idx + 1}: ${gameKey}`);
      
      // Check if injury analysis is embedded anywhere
      const predStr = JSON.stringify(pred, null, 2);
      
      // Look for injury-related keys at any level
      const injuryKeys = [];
      function findInjuryKeys(obj, path = '') {
        if (typeof obj === 'object' && obj !== null) {
          Object.keys(obj).forEach(key => {
            if (key.toLowerCase().includes('injury') || key.toLowerCase().includes('adjust')) {
              injuryKeys.push(`${path}.${key}`);
            }
            if (typeof obj[key] === 'object') {
              findInjuryKeys(obj[key], `${path}.${key}`);
            }
          });
        }
      }
      findInjuryKeys(pred);
      
      if (injuryKeys.length > 0) {
        console.log(`   🔍 Injury-related keys found: ${injuryKeys.join(', ')}`);
        injuryKeys.forEach(keyPath => {
          const value = keyPath.split('.').reduce((obj, key) => obj && obj[key], pred);
          console.log(`     ${keyPath}: ${JSON.stringify(value)}`);
        });
      } else {
        console.log('   ❌ No injury-related keys found in prediction');
      }
      
      // Check model enhancements for injury mentions
      if (pred.modelEnhancements) {
        const enhancementStr = JSON.stringify(pred.modelEnhancements);
        if (enhancementStr.includes('injur') || enhancementStr.includes('Injur')) {
          console.log('   ✅ Injury mentions found in modelEnhanements');
          console.log('     ', pred.modelEnhancements);
        } else {
          console.log('   ❌ No injury mentions in modelEnhancements');
        }
      }
      
      // Check if spread/total predictions show signs of injury adjustments
      if (pred.predictions) {
        const spread = pred.predictions.spread;
        const total = pred.predictions.total;
        const moneyline = pred.predictions.moneyline;
        
        console.log(`   📊 Predictions:`);
        console.log(`     ML: ${moneyline?.pick} (${moneyline?.confidence}% conf, ${moneyline?.edge}% edge)`);
        console.log(`     Spread: ${spread?.pick} ${spread?.line} (${spread?.confidence}% conf, ${spread?.edge}pts edge)`);
        console.log(`     Total: ${total?.pick} ${total?.line} (${total?.confidence}% conf, ${total?.edge}pts edge)`);
        
        // Look for injury context in prediction reasoning
        if (spread?.skipReason || total?.skipReason || moneyline?.skipReason) {
          console.log(`   📝 Skip reasons found:`);
          if (spread?.skipReason) console.log(`     Spread: ${spread.skipReason}`);
          if (total?.skipReason) console.log(`     Total: ${total.skipReason}`);
          if (moneyline?.skipReason) console.log(`     ML: ${moneyline.skipReason}`);
        }
      }
    });
    
    // Test 3: Check for injury data in the full response
    console.log('\n🔧 Test 3: Global injury analysis in response...');
    
    const responseStr = JSON.stringify(predData);
    if (responseStr.includes('injury') || responseStr.includes('Injury')) {
      console.log('✅ Injury mentions found in full response');
      
      // Count injury mentions
      const injuryMentions = (responseStr.match(/injury/gi) || []).length;
      console.log(`   Total injury mentions: ${injuryMentions}`);
      
      // Try to extract injury-specific context
      const injuryRegex = /"[^"]*injury[^"]*"/gi;
      const injuryContexts = responseStr.match(injuryRegex) || [];
      console.log('   Injury contexts:');
      injuryContexts.slice(0, 10).forEach(context => {
        console.log(`     ${context}`);
      });
      
    } else {
      console.log('❌ NO injury mentions found anywhere in response');
    }
    
    // Test 4: Check if specific injured players are mentioned
    console.log('\n👥 Test 4: Checking for specific injured players...');
    
    const knownInjuredPlayers = [
      'Tyreek Hill', 'Noah Fant', 'Jermaine Johnson', 'Storm Duck', 
      'Jason Marshall Jr.', 'Marvin Mims Jr.', 'Kene Nwangwu'
    ];
    
    knownInjuredPlayers.forEach(player => {
      if (responseStr.includes(player)) {
        console.log(`   ✅ Found reference to ${player}`);
      } else {
        console.log(`   ❌ No reference to ${player}`);
      }
    });
    
    console.log('\n📋 SUMMARY:');
    console.log('=' .repeat(40));
    console.log('• Injury data endpoint: ✅ Working');
    console.log('• Prediction endpoint: ✅ Working');
    console.log('• Injury integration: ❓ Check results above');
    console.log('• If NO injury mentions found, the integration is broken');
    console.log('• If injury mentions found, check if they affect actual predictions');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Auto-run the detailed debug
console.log('🚀 Starting detailed injury integration debug...\n');
detailedInjuryIntegrationDebug().then(() => {
  console.log('\n✅ Detailed debug complete!');
}).catch(err => {
  console.error('💥 Debug failed:', err);
});