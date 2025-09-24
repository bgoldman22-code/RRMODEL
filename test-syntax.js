// Quick syntax test for the updated soccer BTTS function
const fs = require('fs');

try {
  const functionCode = fs.readFileSync('./netlify/functions/soccer-btts-predictions.js', 'utf8');
  
  // Try to parse it as JS to check for syntax errors
  new Function(functionCode);
  
  console.log('✅ Soccer BTTS function syntax is valid');
  
  // Check if all key components are present
  const hasLiveTeamStats = functionCode.includes('fetchLiveTeamStats');
  const hasSeasonalData = functionCode.includes('combineSeasonalData');  
  const hasLiveDataHandling = functionCode.includes('data_source');
  const has2025Season = functionCode.includes('2025-26');
  
  console.log('\n🔍 Feature check:');
  console.log(`  Live team stats fetching: ${hasLiveTeamStats ? '✅' : '❌'}`);
  console.log(`  Seasonal data blending: ${hasSeasonalData ? '✅' : '❌'}`);
  console.log(`  Live data tracking: ${hasLiveDataHandling ? '✅' : '❌'}`);
  console.log(`  2025-26 season support: ${has2025Season ? '✅' : '❌'}`);
  
  // Extract team count
  const teamStatsMatch = functionCode.match(/const PREMIER_LEAGUE_2025_26_TEAMS = {([\s\S]*?)};/);
  if (teamStatsMatch) {
    const teamLines = teamStatsMatch[1].split('\n').filter(line => 
      line.trim().startsWith("'") && line.includes('name:')
    );
    console.log(`\n📊 Found ${teamLines.length} teams in static database`);
  }
  
  console.log('\n🎉 Enhanced soccer BTTS system looks good!');
  
} catch (error) {
  console.log('❌ Syntax error in soccer BTTS function:');
  console.log(error.message);
  
  // Try to identify the line number if possible
  const lines = error.stack?.split('\n') || [];
  const errorLine = lines.find(line => line.includes('<anonymous>'));
  if (errorLine) {
    console.log('Error location:', errorLine);
  }
}