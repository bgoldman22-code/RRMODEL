// BROWSER-COMPATIBLE MNF INJURY DEBUG SCRIPT
// Copy and paste this entire script into your browser console

async function debugMNFInjuryImpact() {
  console.log('🔥 === MNF INJURY IMPACT DEBUG (Browser Compatible) ===');
  
  // Detect environment and use appropriate base URL
  const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'https://bgroundrobin.com' 
    : '';
  
  console.log(`🌐 Using base URL: ${baseUrl || 'current domain'}`);
  
  // Target games for tonight's MNF
  const games = [
    { away: "NYJ", home: "MIA", description: "Jets @ Dolphins" },
    { away: "CIN", home: "DEN", description: "Bengals @ Broncos" }
  ];
  
  for (const game of games) {
    console.log(`\n🏈 === ${game.description} (${game.away} @ ${game.home}) ===`);
    
    try {
      // 1. Test raw injury data
      console.log('📊 Testing raw injury data...');
      const injuryUrl = `${baseUrl}/.netlify/functions/nfl-injuries-get`;
      console.log(`Fetching from: ${injuryUrl}`);
      
      const injuryResponse = await fetch(injuryUrl);
      console.log('Injury response status:', injuryResponse.status);
      
      if (!injuryResponse.ok) {
        throw new Error(`HTTP ${injuryResponse.status}: ${injuryResponse.statusText}`);
      }
      
      const injuryText = await injuryResponse.text();
      console.log('Raw response preview:', injuryText.substring(0, 200));
      
      let injuryData;
      try {
        injuryData = JSON.parse(injuryText);
      } catch (parseError) {
        console.error('❌ Failed to parse injury data as JSON:', parseError);
        console.log('Response was:', injuryText.substring(0, 500));
        continue;
      }
      
      console.log('Raw injury data structure:', {
        hasTeams: !!(injuryData && injuryData.teams),
        teamCount: injuryData && injuryData.teams ? Object.keys(injuryData.teams).length : 0,
        awayTeamData: injuryData.teams && injuryData.teams[game.away] ? 'Found' : 'Missing',
        homeTeamData: injuryData.teams && injuryData.teams[game.home] ? 'Found' : 'Missing'
      });
      
      // Check specific team injury data
      if (injuryData.teams) {
        [game.away, game.home].forEach(team => {
          const teamData = injuryData.teams[team];
          if (teamData) {
            console.log(`${team} injury data:`, {
              qb_status: teamData.qb_status || 'none',
              qb_name: teamData.qb_name || 'none',
              players: teamData.players ? teamData.players.length : 0,
              keyPlayers: teamData.players ? teamData.players.filter(p => 
                ['out', 'doubtful'].includes(p.status?.toLowerCase())
              ).map(p => `${p.name} (${p.status})`) : []
            });
          } else {
            console.log(`${team}: No injury data found`);
          }
        });
      }
      
      // 2. Test live prediction with debug
      console.log('\n🎯 Testing live prediction with injury integration...');
      const predictionUrl = `${baseUrl}/.netlify/functions/nfl-predictions-generate`;
      console.log(`Fetching from: ${predictionUrl}`);
      
      const predictionResponse = await fetch(predictionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          debug: true,
          games: [{
            game_id: `${game.away}_${game.home}`,
            away_team: game.away,
            home_team: game.home,
            start: new Date().toISOString()
          }]
        })
      });
      
      console.log('Prediction response status:', predictionResponse.status);
      
      if (!predictionResponse.ok) {
        throw new Error(`HTTP ${predictionResponse.status}: ${predictionResponse.statusText}`);
      }
      
      const predictionText = await predictionResponse.text();
      let predictionData;
      try {
        predictionData = JSON.parse(predictionText);
      } catch (parseError) {
        console.error('❌ Failed to parse prediction data as JSON:', parseError);
        console.log('Response was:', predictionText.substring(0, 500));
        continue;
      }
      
      // Extract prediction for this game
      const gamePrediction = predictionData.predictions ? predictionData.predictions[0] : null;
      
      if (gamePrediction) {
        console.log('🔍 Prediction result analysis:');
        console.log('Injury integration status:', predictionData.injuryIntegrationStatus);
        console.log('Team injury impacts:', {
          home: gamePrediction.teamStats?.home?.injuryImpact,
          away: gamePrediction.teamStats?.away?.injuryImpact
        });
        console.log('Model enhancements injury analysis:', gamePrediction.modelEnhancements?.injuryAnalysis);
        
        // Check if injuries actually affected the predictions
        const hasInjuryImpact = !!(
          gamePrediction.modelEnhancements?.injuryAnalysis?.hasInjuryImpact ||
          gamePrediction.teamStats?.home?.injuryImpact?.adjustments?.length ||
          gamePrediction.teamStats?.away?.injuryImpact?.adjustments?.length
        );
        
        console.log(`🎯 INJURY IMPACT DETECTED: ${hasInjuryImpact ? 'YES' : 'NO'}`);
        
        if (!hasInjuryImpact) {
          console.log('❌ PROBLEM: Injury data loaded but no impact calculated');
          console.log('Raw injury available:', predictionData.injuryIntegrationStatus?.dataAvailable);
          console.log('Teams with data:', predictionData.injuryIntegrationStatus?.teamsWithData);
        }
        
      } else {
        console.log('❌ No prediction data returned');
        console.log('Full response keys:', Object.keys(predictionData));
      }
      
      // 3. Test specific injury lookup
      console.log('\n🔍 Testing specific player lookups...');
      
      // Test Joe Burrow specifically
      if (game.away === 'CIN' || game.home === 'CIN') {
        console.log('Testing Joe Burrow injury status...');
        if (injuryData.teams && injuryData.teams.CIN) {
          const cinData = injuryData.teams.CIN;
          console.log('CIN QB Status:', cinData.qb_status);
          console.log('CIN QB Name:', cinData.qb_name);
          
          if (cinData.qb_status === 'out' && cinData.qb_name?.toLowerCase().includes('burrow')) {
            console.log('✅ Joe Burrow confirmed OUT - should trigger injury impact');
          } else {
            console.log('⚠️ Joe Burrow status unclear:', { status: cinData.qb_status, name: cinData.qb_name });
          }
        }
      }
      
      // 4. Test alternative injury endpoint
      console.log('\n🔄 Testing alternative injury data sources...');
      try {
        const altInjuryUrl = `${baseUrl}/.netlify/functions/odds-nfl-negcorr`;
        const altResponse = await fetch(altInjuryUrl);
        if (altResponse.ok) {
          const altText = await altResponse.text();
          if (altText.includes('injury') || altText.includes('out') || altText.includes('questionable')) {
            console.log('✅ Alternative injury source has data');
          } else {
            console.log('⚠️ Alternative source may not have injury data');
          }
        }
      } catch (error) {
        console.log('Alternative source not available:', error.message);
      }
      
    } catch (error) {
      console.error(`❌ Error debugging ${game.description}:`, error);
      console.log('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack ? error.stack.split('\n')[0] : 'No stack'
      });
    }
  }
  
  console.log('\n📋 === DEBUG SUMMARY ===');
  console.log('If you see "Injury data loaded but no impact calculated", the issue is in the injury adjustment logic');
  console.log('Check: 1) Team code matching, 2) Injury status parsing, 3) Adjustment calculation');
  console.log('💡 Try this script on the live site (bgroundrobin.com) if running locally');
}
// Run the debug
debugMNFInjuryImpact();