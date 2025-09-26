// Quick Debug Commands for Live Site Console
// Copy-paste this into browser console on your predictions page

// Quick game analysis
window.quickDebug = function(homeTeam, awayTeam) {
  const game = window.predictionsData?.find(g => 
    g.home_team === homeTeam && g.away_team === awayTeam
  );
  
  if (!game) {
    console.error(`❌ Game ${awayTeam} @ ${homeTeam} not found`);
    console.log('Available games:');
    window.predictionsData?.forEach(g => console.log(`  ${g.away_team} @ ${g.home_team}`));
    return;
  }
  
  console.log(`🔬 QUICK DEBUG: ${awayTeam} @ ${homeTeam}`);
  console.log('='.repeat(50));
  
  // Weather check
  const weather = game.weather || {};
  if (weather.wind_mph > 15 || weather.temperature < 32 || weather.precipitation_chance > 50) {
    console.log('🌤️ WEATHER FACTORS:');
    if (weather.wind_mph > 15) console.log(`  💨 High wind: ${weather.wind_mph}mph`);
    if (weather.temperature < 32) console.log(`  🥶 Freezing: ${weather.temperature}°F`);
    if (weather.precipitation_chance > 50) console.log(`  ☔ Rain likely: ${weather.precipitation_chance}%`);
  } else {
    console.log('🌤️ Weather: Normal conditions');
  }
  
  // Injury check
  const homeInj = game.injuries?.home || [];
  const awayInj = game.injuries?.away || [];
  if (homeInj.length + awayInj.length > 0) {
    console.log('🏥 KEY INJURIES:');
    homeInj.forEach(inj => {
      if (inj.status !== 'Probable') {
        console.log(`  ${homeTeam}: ${inj.player} (${inj.position}) - ${inj.status}`);
      }
    });
    awayInj.forEach(inj => {
      if (inj.status !== 'Probable') {
        console.log(`  ${awayTeam}: ${inj.player} (${inj.position}) - ${inj.status}`);
      }
    });
  } else {
    console.log('🏥 Injuries: No significant reports');
  }
  
  // Model picks
  const spread = game.predictions?.spread;
  const ml = game.predictions?.moneyline;
  
  if (spread) {
    console.log(`📏 SPREAD: ${spread.pick} ${spread.line > 0 ? '+' : ''}${spread.line}`);
    console.log(`   Model margin: ${spread.model_home_margin}`);
    console.log(`   Edge: ${spread.edge} pts | Confidence: ${spread.confidence}%`);
  }
  
  if (ml) {
    console.log(`💰 MONEYLINE: ${ml.pick} (${ml.confidence}%)`);
    console.log(`   Edge: ${ml.edge}% | Win prob: ${ml.win_probability}%`);
  }
  
  // Validation warnings
  if (spread?.skipReason?.includes('⚠')) {
    console.log(`⚠️ MODEL WARNING: ${spread.skipReason}`);
  }
  
  console.log(`📊 Full game object:`, game);
}

console.log(`
🚀 QUICK DEBUG LOADED!
Usage: quickDebug('BUF', 'NO') for NO @ BUF
This gives you instant weather/injury/model analysis
`);