/**
 * WEB CONSOLE INJURY DEBUG SCRIPT - UPDATED
 * Paste this into browser console on your live site to test injury integration
 * This version includes detailed logging for the new injury data structure
 */

(async function debugInjuryIntegration() {
  console.log('🏥 INJURY INTEGRATION DEBUG v2 - Starting...');
  console.log('==========================================');
  
  try {
    // Test 1: Check if injury data is loaded in the prediction model
    console.log('\n📡 Testing Live Prediction API with Injury Data...');
    
    const apiResponse = await fetch('/api/nfl-td-predictions?type=raw&limit=5');
    const apiData = await apiResponse.json();
    
    console.log('API Status:', apiResponse.status);
    console.log('Games found:', apiData.games?.length || 0);
    
    if (apiData.games && apiData.games.length > 0) {
      const firstGame = apiData.games[0];
      
      console.log('\n🔍 FIRST GAME INJURY DATA CHECK:');
      console.log('Game:', firstGame.home_team, 'vs', firstGame.away_team);
      
      // Check all injury-related fields
      const injuryFields = [
        'injuries', 'home_injuries', 'away_injuries', 
        'qb_status', 'starting_qbs', 'playerNews', 
        'inactives', 'injuryReport', 'playerStatus'
      ];
      
      injuryFields.forEach(field => {
        const value = firstGame[field];
        const hasData = value !== undefined && value !== null;
        console.log(`${hasData ? '✅' : '❌'} ${field}:`, hasData ? (Array.isArray(value) ? `Array[${value.length}]` : typeof value) : 'undefined');
        
        // Show sample data for arrays
        if (hasData && Array.isArray(value) && value.length > 0) {
          console.log(`    Sample: ${value[0].name || value[0]} (${value[0].status || 'N/A'})`);
        }
      });
      
      // Look for ATL vs WAS game specifically
      const atlWasGame = apiData.games.find(g => 
        (g.home_team === 'ATL' && g.away_team === 'WAS') ||
        (g.home_team === 'WAS' && g.away_team === 'ATL')
      );
      
      if (atlWasGame) {
        console.log('\n🎯 ATL vs WAS INJURY ANALYSIS:');
        console.log('Home:', atlWasGame.home_team, 'Away:', atlWasGame.away_team);
        console.log('Total injuries:', atlWasGame.injuries?.length || 0);
        console.log('Home injuries:', atlWasGame.home_injuries?.length || 0);
        console.log('Away injuries:', atlWasGame.away_injuries?.length || 0);
        console.log('QB Status:', atlWasGame.qb_status);
        console.log('Starting QBs:', atlWasGame.starting_qbs);
        
        if (atlWasGame.injuries && atlWasGame.injuries.length > 0) {
          console.log('\n📋 ALL INJURIES BY TEAM:');
          
          const homeTeam = atlWasGame.home_team;
          const awayTeam = atlWasGame.away_team;
          
          console.log(`\n${homeTeam} (HOME) INJURIES:`);
          atlWasGame.injuries.filter(i => i.team === homeTeam).forEach(injury => {
            console.log(`   ${injury.name} (${injury.position}): ${injury.status} - ${injury.injury?.substring(0, 50)}...`);
          });
          
          console.log(`\n${awayTeam} (AWAY) INJURIES:`);
          atlWasGame.injuries.filter(i => i.team === awayTeam).forEach(injury => {
            console.log(`   ${injury.name} (${injury.position}): ${injury.status} - ${injury.injury?.substring(0, 50)}...`);
          });
          
          // Highlight Washington key injuries
          const wasInjuries = atlWasGame.injuries.filter(i => i.team === 'WAS');
          console.log(`\n🚨 WASHINGTON KEY INJURIES (${wasInjuries.length} total):`);
          wasInjuries.forEach(injury => {
            const isKey = ['QB', 'WR'].includes(injury.position) && ['OUT', 'QUESTIONABLE'].includes(injury.status);
            console.log(`   ${isKey ? '🔥' : '📍'} ${injury.name} (${injury.position}): ${injury.status}`);
          });
        }
        
        // Test the debug function with this game
        console.log('\n🧪 Testing debugInjuries() function...');
        if (typeof window.debugInjuries === 'function') {
          window.debugInjuries(atlWasGame.home_team, atlWasGame.away_team);
        } else {
          console.log('⚠️ debugInjuries() function not found - may need to load debug-model-analysis.js');
        }
      } else {
        console.log('\n⚠️ ATL vs WAS game not found in API response');
        console.log('Available games:');
        apiData.games.forEach(g => {
          console.log(`   ${g.home_team} vs ${g.away_team}`);
        });
      }
    }
    
    // Test 2: Check if we can load injury data directly
    console.log('\n📊 Testing Direct Injury Data Access...');
    
    try {
      const injuryResponse = await fetch('/data/nfl/injuries/latest.json');
      if (injuryResponse.ok) {
        const injuryData = await injuryResponse.json();
        console.log('✅ Direct injury data loaded successfully');
        console.log('Teams with injuries:', Object.keys(injuryData.teams || {}));
        console.log('Total teams:', Object.keys(injuryData.teams || {}).length);
        
        // Check Washington injuries specifically
        const wasTeamData = injuryData.teams?.WAS;
        if (wasTeamData) {
          console.log('\n🔍 WASHINGTON RAW DATA:');
          console.log('QB Status:', wasTeamData.qb_status);
          console.log('QB Name:', wasTeamData.qb_name);
          console.log('WR Injuries:', wasTeamData.wr_injuries?.length || 0);
          console.log('RB Injuries:', wasTeamData.rb_injuries?.length || 0);
          console.log('TE Injuries:', wasTeamData.te_injuries?.length || 0);
          
          if (wasTeamData.wr_injuries) {
            console.log('\n🏈 WAS WR INJURIES:');
            wasTeamData.wr_injuries.forEach(wr => {
              console.log(`   ${wr.name}: ${wr.status} (${wr.injury?.substring(0, 30)}...)`);
            });
          }
        } else {
          console.log('❌ Washington team data not found');
        }
      } else {
        console.log('❌ Could not load injury data directly (status:', injuryResponse.status, ')');
      }
    } catch (err) {
      console.log('❌ Direct injury data access failed:', err.message);
    }
    
    // Test 3: Check if predictions data has injury context
    console.log('\n🎯 Testing Predictions Data Injury Context...');
    
    if (window.predictionsData && window.predictionsData.length > 0) {
      console.log('✅ window.predictionsData found:', window.predictionsData.length, 'games');
      
      const gameWithInjuries = window.predictionsData.find(g => 
        g.injuries && g.injuries.length > 0
      );
      
      if (gameWithInjuries) {
        console.log('✅ Found game with injury data:', gameWithInjuries.home_team, 'vs', gameWithInjuries.away_team);
        console.log('Injury count:', gameWithInjuries.injuries.length);
        
        // Show injury breakdown
        const outInjuries = gameWithInjuries.injuries.filter(i => i.status === 'OUT');
        console.log('Players OUT:', outInjuries.length);
        outInjuries.forEach(i => console.log(`   ${i.name} (${i.position}) - ${i.team}`));
      } else {
        console.log('❌ No games found with injury data in window.predictionsData');
        
        // Show structure of first game
        const firstPredGame = window.predictionsData[0];
        console.log('First game structure:', Object.keys(firstPredGame));
        console.log('Has injuries field:', 'injuries' in firstPredGame);
      }
    } else {
      console.log('❌ window.predictionsData not found or empty');
    }
    
    console.log('\n==========================================');
    console.log('🏁 INJURY INTEGRATION DEBUG v2 - Complete');
    
  } catch (error) {
    console.error('❌ Debug script error:', error);
    console.log('Stack:', error.stack);
  }
})();

// Also provide quick access functions
console.log('\n🛠️ QUICK ACCESS FUNCTIONS:');
console.log('- Run: debugInjuries("ATL", "WAS") to test Washington injuries');
console.log('- Run: debugAnalyzeGame("ATL", "WAS") to see full analysis');
console.log('- Check: window.predictionsData for loaded game data');
console.log('- Manual injury check: fetch("/data/nfl/injuries/latest.json").then(r=>r.json()).then(d=>console.log(d.teams.WAS))');