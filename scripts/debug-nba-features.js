const fs = require('fs');

// Load sample data
const data = JSON.parse(fs.readFileSync('data/nba/games/games_2024_25.json', 'utf8'));

// Find games with complete stats
const validGames = data.filter(g => g.homeScore != null && g.homeStats && g.awayStats);

console.log('Total games:', data.length);
console.log('Games with stats:', validGames.length);

// Check first 10 games for NaN issues
for (let i = 0; i < Math.min(10, validGames.length); i++) {
  const g = validGames[i];
  
  const fga = g.homeStats.fga || 0;
  const fta = g.homeStats.fta || 0;
  const fgm = g.homeStats.fgm || 0;
  const orb = g.homeStats.offRebounds || 0;
  const drb = g.homeStats.defRebounds || 0;
  const tov = g.homeStats.turnovers || 0;
  const oppDrb = g.awayStats.defRebounds || 0;
  
  const orbPct = (orb + oppDrb) > 0 ? orb / (orb + oppDrb) : 0;
  const poss = fga + 0.4 * fta - 1.07 * orbPct * (fga - fgm) + tov;
  
  console.log(`\nGame ${i}: ${g.homeTeam} vs ${g.awayTeam}`);
  console.log(`  Possessions: ${poss.toFixed(1)} (${isNaN(poss) ? 'NaN!' : 'OK'})`);
  console.log(`  FGA: ${fga}, FTA: ${fta}, TOV: ${tov}`);
  console.log(`  ORB: ${orb}, oppDRB: ${oppDrb}, ORB%: ${orbPct.toFixed(3)}`);
  
  // Check if any stat is causing NaN
  if (isNaN(poss) || isNaN(orbPct)) {
    console.log('  ⚠️  NaN DETECTED!');
    console.log('  Raw stats:', g.homeStats);
  }
}

// Calculate sample features
console.log('\n' + '='.repeat(60));
console.log('Feature Extraction Test:');

const testGame = validGames[5];
const home = {
  ppg: 110, pace: 100, offRtg: 115, defRtg: 110, netRtg: 5,
  efg: 0.53, tovPct: 0.12, orbPct: 0.25, ftFga: 0.20,
  ts: 0.57, winPct: 0.6, oppPpg: 108
};

const away = {
  ppg: 105, pace: 98, offRtg: 112, defRtg: 113, netRtg: -1,
  efg: 0.51, tovPct: 0.14, orbPct: 0.23, ftFga: 0.18,
  ts: 0.55, winPct: 0.4, oppPpg: 106
};

const features = [];

// Core stats (24 features)
['pace', 'offRtg', 'defRtg', 'netRtg', 'efg', 'tovPct', 'orbPct', 'ftFga', 'ts', 'ppg', 'oppPpg', 'winPct'].forEach(stat => {
  features.push(home[stat] || 0);
});

['pace', 'offRtg', 'defRtg', 'netRtg', 'efg', 'tovPct', 'orbPct', 'ftFga', 'ts', 'ppg', 'oppPpg', 'winPct'].forEach(stat => {
  features.push(away[stat] || 0);
});

// Differentials (12 features)
features.push(home.netRtg - away.netRtg);
features.push(home.offRtg - away.defRtg);
features.push(away.offRtg - home.defRtg);
features.push(home.pace - away.pace);
features.push(home.efg - away.efg);
features.push(home.tovPct - away.tovPct);
features.push(home.orbPct - away.orbPct);
features.push(home.ftFga - away.ftFga);
features.push(home.ts - away.ts);
features.push(home.winPct - away.winPct);
features.push(home.ppg - away.ppg);
features.push(home.oppPpg - away.oppPpg);

console.log(`Total features: ${features.length}`);
console.log(`Any NaN? ${features.some(f => isNaN(f))}`);
console.log(`Sample values: [${features.slice(0, 5).map(f => f.toFixed(2)).join(', ')}...]`);
