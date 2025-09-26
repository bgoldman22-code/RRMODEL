# 🔬 Elite Model Debugger - Live Site Analysis Guide

## Quick Start (Copy-Paste Method)

### Step 1: Load Quick Debug Functions
On your live predictions page, open browser console (F12) and paste:

```javascript
// Quick game analysis
window.quickDebug = function(homeTeam, awayTeam) {
  const game = window.predictionsData?.find(g => 
    g.home_team === homeTeam && g.away_team === awayTeam
  );
  
  if (!game) {
    console.error(`❌ Game ${awayTeam} @ ${homeTeam} not found`);
    window.predictionsData?.forEach(g => console.log(`  ${g.away_team} @ ${g.home_team}`));
    return;
  }
  
  console.log(`🔬 ${awayTeam} @ ${homeTeam} ANALYSIS`);
  console.log('='.repeat(40));
  
  // Weather impact
  const w = game.weather || {};
  if (w.wind_mph > 15 || w.temperature < 32 || w.precipitation_chance > 50) {
    console.log('🌤️ WEATHER IMPACTS:');
    if (w.wind_mph > 15) console.log(`  💨 High wind: ${w.wind_mph}mph (affects totals)`);
    if (w.temperature < 32) console.log(`  🥶 Freezing: ${w.temperature}°F (ball handling issues)`);
    if (w.precipitation_chance > 50) console.log(`  ☔ Rain: ${w.precipitation_chance}% (passing game)`);
  } else {
    console.log('🌤️ Weather: Normal (no significant impacts)');
  }
  
  // Key injuries
  const homeInj = game.injuries?.home || [];
  const awayInj = game.injuries?.away || [];
  const keyInj = [...homeInj, ...awayInj].filter(i => i.status !== 'Probable');
  
  if (keyInj.length > 0) {
    console.log('🏥 KEY INJURIES:');
    keyInj.forEach(inj => {
      const team = homeInj.includes(inj) ? homeTeam : awayTeam;
      const impact = inj.position === 'QB' ? '🚨 CRITICAL' : 
                    ['RB','WR','TE'].includes(inj.position) ? '⚠️ MODERATE' : '💛 MINOR';
      console.log(`  ${team}: ${inj.player} (${inj.position}) - ${inj.status} ${impact}`);
    });
  } else {
    console.log('🏥 Injuries: No key players impacted');
  }
  
  // Model decisions
  const sp = game.predictions?.spread;
  const ml = game.predictions?.moneyline;
  
  if (sp?.bet) {
    console.log(`📏 SPREAD BET: ${sp.pick} ${sp.line > 0 ? '+' : ''}${sp.line}`);
    console.log(`   📊 Model edge: ${sp.edge} pts (${sp.confidence}% confident)`);
    console.log(`   🎯 Model says ${homeTeam} wins by ${Math.abs(sp.model_home_margin)}`);
  }
  
  if (ml?.bet) {
    console.log(`💰 ML BET: ${ml.pick} (${ml.confidence}% win probability)`);
    console.log(`   📊 Edge vs market: ${ml.edge}%`);
  }
  
  // Data quality checks
  if (sp?.skipReason?.includes('⚠')) {
    console.log(`⚠️ MODEL WARNING: ${sp.skipReason}`);
  } else {
    console.log(`✅ Data validation: PASSED`);
  }
  
  console.log(`\n📋 Full data:`, game);
}
```

### Step 2: Analyze Any Game
```javascript
// Example: Analyze Bills vs Saints
quickDebug('BUF', 'NO');

// Example: Check Packers vs Lions  
quickDebug('DET', 'GB');

// List all available games
window.predictionsData?.forEach(g => console.log(`${g.away_team} @ ${g.home_team}`));
```

## What You'll See

### Weather Analysis Example:
```
🌤️ WEATHER IMPACTS:
  💨 High wind: 18mph (affects totals)
  🥶 Freezing: 28°F (ball handling issues)
```

### Injury Impact Example:
```
🏥 KEY INJURIES:
  BUF: Josh Allen (QB) - Questionable 🚨 CRITICAL
  NO: Alvin Kamara (RB) - Doubtful ⚠️ MODERATE
```

### Model Decision Example:
```
📏 SPREAD BET: BUF -3.5
   📊 Model edge: 2.1 pts (73% confident)
   🎯 Model says BUF wins by 5.6

💰 ML BET: BUF (-165 odds)
   📊 Edge vs market: 8.3%
```

### Validation Warning Example:
```
⚠️ MODEL WARNING: EXTREME_SPREAD detected (21+ point margin)
```

## Key Insights to Look For

1. **Weather Impact**: Wind >15mph reduces totals, freezing temps affect ball security
2. **QB Injuries**: Any QB status other than "Probable" drastically affects spread
3. **Model Edges**: >5% ML edge or >2pt spread edge indicates strong value
4. **Validation Flags**: Model skips bets when data integrity is questionable
5. **Devigged Edges**: Elite calculations remove sportsbook vig for true value

## Deployment Check

Once your site deploys, test with:
```javascript
quickDebug('KC', 'LAC');  // Replace with actual Week 4 matchup
```

This will reveal exactly how weather, injuries, and R Pipeline EPA calculations are factoring into each prediction!