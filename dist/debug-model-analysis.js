/**
 * ELITE MODEL DEBUGGER - Console Commands for Live Site Analysis
 * 
 * Copy and paste these functions into your browser console on the live predictions page
 * to debug weather impacts, injury analysis, and model decision-making
 */

// Main debug function - call this for any game
window.debugGameModel = function(homeTeam, awayTeam) {
  console.log(`🔬 ELITE MODEL ANALYSIS: ${awayTeam} @ ${homeTeam}`);
  console.log("=" .repeat(60));
  
  // Find the game data
  const gameData = window.predictionsData?.find(g => 
    g.home_team === homeTeam && g.away_team === awayTeam
  );
  
  if (!gameData) {
    console.error("❌ Game not found. Available games:");
    window.predictionsData?.forEach(g => 
      console.log(`   ${g.away_team} @ ${g.home_team}`)
    );
    return;
  }
  
  console.log("📊 RAW GAME DATA:");
  console.log(gameData);
  
  // Weather Analysis
  debugWeatherImpact(gameData);
  
  // Injury Analysis  
  debugInjuryImpact(gameData);
  
  // Model Components Breakdown
  debugModelComponents(gameData);
  
  // Edge Calculations
  debugEdgeCalculations(gameData);
  
  // Validation Checks
  debugValidationStatus(gameData);
};

function debugWeatherImpact(game) {
  console.log("\n🌤️ WEATHER IMPACT ANALYSIS:");
  console.log("-".repeat(40));
  
  const weather = game.weather || game.conditions || {};
  const spread = game.predictions?.spread || {};
  const total = game.predictions?.total || {};
  
  if (weather.wind_mph !== undefined) {
    console.log(`💨 Wind: ${weather.wind_mph} mph`);
    console.log(`   ${weather.wind_mph > 15 ? "🚨 HIGH WIND - Impacts totals & kicking" : "✅ Normal wind conditions"}`);
    
    // Check if model adjusted for wind
    if (total.model_total && weather.wind_mph > 15) {
      console.log(`   📉 Model likely reduced total due to wind`);
      console.log(`   🎯 Model Total: ${total.model_total} (Market: ${total.line || 'N/A'})`);
    }
  }
  
  if (weather.temperature !== undefined) {
    console.log(`🌡️ Temperature: ${weather.temperature}°F`);
    if (weather.temperature < 32) {
      console.log(`   🥶 FREEZING - Impacts ball handling & scoring`);
    } else if (weather.temperature > 90) {
      console.log(`   🔥 HOT - May impact player performance`);
    } else {
      console.log(`   ✅ Normal temperature conditions`);
    }
  }
  
  if (weather.precipitation_chance !== undefined) {
    console.log(`☔ Precipitation: ${weather.precipitation_chance}%`);
    if (weather.precipitation_chance > 50) {
      console.log(`   🌧️ HIGH CHANCE - May reduce passing game`);
    }
  }
  
  // Check for dome games
  if (weather.is_dome || game.venue?.is_dome) {
    console.log(`🏟️ DOME GAME - Weather not a factor`);
  }
  
  if (!weather.wind_mph && !weather.temperature) {
    console.log(`⚠️ No weather data available - model using defaults`);
  }
}

function debugInjuryImpact(game) {
  console.log("\n🏥 INJURY IMPACT ANALYSIS:");
  console.log("-".repeat(40));
  
  const homeInjuries = game.injuries?.home || game.home_injuries || [];
  const awayInjuries = game.injuries?.away || game.away_injuries || [];
  const spread = game.predictions?.spread || {};
  
  // Home team injuries
  if (homeInjuries.length > 0) {
    console.log(`🏠 ${game.home_team} INJURIES:`);
    homeInjuries.forEach(injury => {
      const impact = calculateInjuryImpact(injury);
      console.log(`   ${injury.player} (${injury.position}) - ${injury.status}`);
      console.log(`      📊 Impact: ${impact.severity} (${impact.points} pts)`);
      if (injury.position === 'QB' && injury.status !== 'Probable') {
        console.log(`      🚨 CRITICAL: QB injury significantly impacts model`);
      }
    });
  } else {
    console.log(`🏠 ${game.home_team}: No significant injuries reported`);
  }
  
  // Away team injuries  
  if (awayInjuries.length > 0) {
    console.log(`✈️ ${game.away_team} INJURIES:`);
    awayInjuries.forEach(injury => {
      const impact = calculateInjuryImpact(injury);
      console.log(`   ${injury.player} (${injury.position}) - ${injury.status}`);
      console.log(`      📊 Impact: ${impact.severity} (${impact.points} pts)`);
      if (injury.position === 'QB' && injury.status !== 'Probable') {
        console.log(`      🚨 CRITICAL: QB injury significantly impacts model`);
      }
    });
  } else {
    console.log(`✈️ ${game.away_team}: No significant injuries reported`);
  }
  
  // Overall injury impact on spread
  if (spread.model_home_margin !== undefined) {
    const injuryAdjustment = estimateInjuryAdjustment(homeInjuries, awayInjuries);
    console.log(`\n📈 ESTIMATED INJURY IMPACT ON SPREAD:`);
    console.log(`   Net adjustment: ${injuryAdjustment > 0 ? '+' : ''}${injuryAdjustment.toFixed(1)} pts toward home`);
    console.log(`   Model spread: ${spread.model_home_margin}`);
    console.log(`   Market spread: ${spread.line || 'N/A'}`);
  }
}

function debugModelComponents(game) {
  console.log("\n⚙️ MODEL COMPONENTS BREAKDOWN:");
  console.log("-".repeat(40));
  
  const spread = game.predictions?.spread || {};
  const ml = game.predictions?.moneyline || {};
  const total = game.predictions?.total || {};
  
  // Core EPA metrics
  if (game.team_stats?.home && game.team_stats?.away) {
    console.log("📊 CORE EPA METRICS:");
    console.log(`   ${game.home_team} EPA: ${game.team_stats.home.epa || 'N/A'}`);
    console.log(`   ${game.away_team} EPA: ${game.team_stats.away.epa || 'N/A'}`);
  }
  
  // Form/Recent Performance
  if (game.form?.home !== undefined) {
    console.log("\n📈 RECENT FORM:");
    console.log(`   ${game.home_team} Form: ${game.form.home}`);
    console.log(`   ${game.away_team} Form: ${game.form.away}`);
  }
  
  // Special Teams Impact
  if (spread.st_adjustment !== undefined) {
    console.log(`\n🏈 SPECIAL TEAMS ADJUSTMENT: ${spread.st_adjustment > 0 ? '+' : ''}${spread.st_adjustment} pts`);
  }
  
  // Home Field Advantage
  if (spread.hfa_adjustment !== undefined) {
    console.log(`🏠 HOME FIELD ADVANTAGE: ${spread.hfa_adjustment} pts`);
  } else {
    console.log(`🏠 HOME FIELD ADVANTAGE: Standard ~2.5 pts (not explicitly shown)`);
  }
  
  // Confidence factors
  console.log("\n🎯 MODEL CONFIDENCE:");
  console.log(`   Spread: ${spread.confidence || 'N/A'}%`);
  console.log(`   ML: ${ml.confidence || 'N/A'}%`);
  console.log(`   Total: ${total.confidence || 'N/A'}%`);
}

function debugEdgeCalculations(game) {
  console.log("\n💰 EDGE CALCULATION BREAKDOWN:");
  console.log("-".repeat(40));
  
  const spread = game.predictions?.spread || {};
  const ml = game.predictions?.moneyline || {};
  const total = game.predictions?.total || {};
  
  // Spread edge
  if (spread.edge !== undefined) {
    console.log(`📏 SPREAD EDGE: ${spread.edge > 0 ? '+' : ''}${spread.edge} pts`);
    console.log(`   Pick: ${spread.pick || 'N/A'}`);
    console.log(`   Market line: ${spread.line || 'N/A'}`);
    console.log(`   Model requirement: ${spread.model_home_margin || 'N/A'}`);
    console.log(`   Bet status: ${spread.bet ? 'BET' : 'NO BET'}`);
  }
  
  // ML edge (check for devigged)
  if (ml.edge !== undefined) {
    console.log(`\n💵 MONEYLINE EDGE:`);
    console.log(`   Raw edge: ${ml.edge}%`);
    // Check if we have devigged calculation
    if (ml.deriggedEdge !== undefined) {
      console.log(`   🎯 Devigged edge: ${ml.deriggedEdge}% (Elite calc)`);
      console.log(`   Vig removal improved edge by: ${(ml.deriggedEdge - ml.edge).toFixed(1)}%`);
    }
    console.log(`   Pick: ${ml.pick || 'N/A'}`);
    console.log(`   Model prob: ${ml.win_probability || 'N/A'}%`);
    console.log(`   Market prob: ${ml.market_probability || 'N/A'}%`);
  }
  
  // Total edge
  if (total.edge !== undefined) {
    console.log(`\n🎲 TOTAL EDGE: ${total.edge > 0 ? '+' : ''}${total.edge} pts`);
    console.log(`   Pick: ${total.pick || 'N/A'}`);
    console.log(`   Market line: ${total.line || 'N/A'}`);
    console.log(`   Model total: ${total.model_total || 'N/A'}`);
  }
}

function debugValidationStatus(game) {
  console.log("\n✅ MODEL VALIDATION STATUS:");
  console.log("-".repeat(40));
  
  const spread = game.predictions?.spread || {};
  const ml = game.predictions?.moneyline || {};
  
  // Check for validation warnings
  if (spread.skipReason && spread.skipReason.includes('⚠')) {
    console.log(`🚨 SPREAD VALIDATION ISSUE: ${spread.skipReason}`);
  } else {
    console.log(`✅ Spread validation: PASSED`);
  }
  
  // Check model consistency
  const modelHomeFav = spread.model_home_margin < 0;
  const mlHomeFav = ml.pick === game.home_team;
  
  if (Math.abs(spread.model_home_margin) > 3 && modelHomeFav !== mlHomeFav) {
    console.log(`⚠️ MODEL INCONSISTENCY: Spread and ML favor different teams`);
    console.log(`   Spread favors: ${modelHomeFav ? game.home_team : game.away_team}`);
    console.log(`   ML favors: ${ml.pick}`);
  } else {
    console.log(`✅ Model consistency: Spread and ML align`);
  }
  
  // Data freshness
  const timestamp = game.timestamp || game.last_updated;
  if (timestamp) {
    const age = Date.now() - new Date(timestamp).getTime();
    const ageMinutes = Math.floor(age / 60000);
    console.log(`⏰ Data age: ${ageMinutes} minutes old`);
    if (ageMinutes > 15) {
      console.log(`⚠️ Data may be stale (>${ageMinutes} min old)`);
    } else {
      console.log(`✅ Data freshness: Current`);
    }
  }
}

// Helper functions
function calculateInjuryImpact(injury) {
  const positionImpact = {
    'QB': { severe: 7, moderate: 4, mild: 1 },
    'RB': { severe: 2, moderate: 1.5, mild: 0.5 },
    'WR': { severe: 1.5, moderate: 1, mild: 0.3 },
    'TE': { severe: 1, moderate: 0.7, mild: 0.2 },
    'OL': { severe: 1.5, moderate: 1, mild: 0.3 },
    'DE': { severe: 1.2, moderate: 0.8, mild: 0.2 },
    'LB': { severe: 1, moderate: 0.6, mild: 0.2 },
    'DB': { severe: 0.8, moderate: 0.5, mild: 0.1 }
  };
  
  const pos = injury.position || 'UNKNOWN';
  const impacts = positionImpact[pos] || positionImpact['DB'];
  
  let severity, points;
  if (injury.status === 'Out') {
    severity = 'SEVERE';
    points = impacts.severe;
  } else if (injury.status === 'Doubtful') {
    severity = 'MODERATE';  
    points = impacts.moderate;
  } else if (injury.status === 'Questionable') {
    severity = 'MILD';
    points = impacts.mild;
  } else {
    severity = 'MINIMAL';
    points = 0.1;
  }
  
  return { severity, points };
}

function estimateInjuryAdjustment(homeInjuries, awayInjuries) {
  let homeImpact = 0;
  let awayImpact = 0;
  
  homeInjuries.forEach(injury => {
    homeImpact += calculateInjuryImpact(injury).points;
  });
  
  awayInjuries.forEach(injury => {
    awayImpact += calculateInjuryImpact(injury).points;
  });
  
  // Return net impact (positive = helps home team)
  return awayImpact - homeImpact;
}

// Quick access functions
window.debugWeather = (homeTeam, awayTeam) => {
  const game = window.predictionsData?.find(g => g.home_team === homeTeam && g.away_team === awayTeam);
  if (game) debugWeatherImpact(game);
};

window.debugInjuries = (homeTeam, awayTeam) => {
  const game = window.predictionsData?.find(g => g.home_team === homeTeam && g.away_team === awayTeam);
  if (game) debugInjuryImpact(game);
};

// Usage instructions
console.log(`
🔬 ELITE MODEL DEBUGGER LOADED!

📝 USAGE:
debugGameModel('BUF', 'NO')  // Debug NO @ BUF game completely  
debugWeather('BUF', 'NO')    // Just weather analysis
debugInjuries('BUF', 'NO')   // Just injury analysis

🎯 The debugger will analyze:
- Weather impacts (wind, temp, precipitation)
- Injury reports and their point values
- Model component breakdowns (EPA, form, ST, HFA)
- Edge calculations (including devigged ML)
- Validation status and consistency checks

⚡ Try it on a high-value game to see how the R Pipeline
   factors in all variables for elite-level predictions!
`);