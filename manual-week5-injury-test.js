// MANUAL WEEK 5 INJURY TEST
// Forces system to use Week 5 and tests injury collection with Joe Burrow override

async function testWeek5InjuryOverride() {
  console.log('🔧 === MANUAL WEEK 5 INJURY TEST ===');
  
  try {
    // 1. Force trigger injury collection to get latest data with Joe Burrow override
    console.log('🏥 Triggering fresh injury collection...');
    const collectResponse = await fetch('https://rrmodel.netlify.app/.netlify/functions/nfl-injuries-collect', {
      method: 'POST'
    });
    
    if (collectResponse.ok) {
      const collectData = await collectResponse.json();
      console.log('✅ Injury collection triggered:', collectData.success ? 'SUCCESS' : 'FAILED');
      console.log('Teams collected:', collectData.teams || 'unknown');
    } else {
      console.log('⚠️ Injury collection request failed:', collectResponse.status);
    }
    
    // Wait a moment for collection to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 2. Test the updated injury data
    console.log('\n📋 Testing updated injury data...');
    const injuryResponse = await fetch('https://rrmodel.netlify.app/.netlify/functions/nfl-injuries-collect');
    
    if (injuryResponse.ok) {
      const injuryData = await injuryResponse.json();
      
      console.log('Updated injury data:', {
        hasTeams: !!(injuryData && injuryData.teams),
        teamCount: injuryData && injuryData.teams ? Object.keys(injuryData.teams).length : 0,
        cinData: injuryData.teams?.CIN ? {
          qb_status: injuryData.teams.CIN.qb_status,
          qb_name: injuryData.teams.CIN.qb_name
        } : 'No CIN data'
      });
      
      // 3. Test specific CIN @ DEN prediction with fresh data
      if (injuryData.teams?.CIN?.qb_status === 'out') {
        console.log('✅ Joe Burrow confirmed OUT - testing prediction impact...');
        
        const predResponse = await fetch('https://rrmodel.netlify.app/.netlify/functions/nfl-predictions-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            debug: true,
            games: [{
              game_id: 'CIN_DEN',
              away_team: 'CIN',
              home_team: 'DEN',
              start: new Date().toISOString()
            }]
          })
        });
        
        if (predResponse.ok) {
          const predData = await predResponse.json();
          const game = predData.predictions?.[0];
          
          console.log('🎯 CIN @ DEN Prediction Impact:', {
            injuryIntegrationStatus: predData.injuryIntegrationStatus,
            cinInjuryImpact: game?.teamStats?.away?.injuryImpact,
            hasInjuryImpact: !!(
              game?.modelEnhancements?.injuryAnalysis?.hasInjuryImpact ||
              game?.teamStats?.away?.injuryImpact?.adjustments?.length
            )
          });
          
          if (game?.teamStats?.away?.injuryImpact?.adjustments?.length > 0) {
            console.log('✅ SUCCESS: Joe Burrow injury is affecting CIN predictions!');
          } else {
            console.log('❌ FAILURE: Joe Burrow OUT but no prediction impact detected');
          }
        }
      } else {
        console.log('❌ Joe Burrow override not applied - still shows active QB');
      }
    }
    
  } catch (error) {
    console.error('❌ Week 5 injury test failed:', error);
  }
}

// Run the test
testWeek5InjuryOverride();