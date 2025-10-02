// Test harness for SGP scanner
// Generates sample predictions for DraftKings pricing validation

import { scanSlate, classifyArchetype } from '../netlify/functions/_lib/nfl-sgp-negcorr.mjs';
import fs from 'fs';

console.log('🎯 NFL SGP Negative Correlation Test Harness\n');

// Load mock data for testing
// Mock player stats for testing - ACTUAL Week 5 2025 games (HEALTHY PLAYERS ONLY)
const mockPlayerStats = [
  // EXPLOSIVE candidates (U rec + O yards)
  // Xavier Worthy - KC @ JAX (Monday)
  {
    player_id: 'worthy_x',
    player_name: 'Xavier Worthy',
    team: 'KC',
    position: 'WR',
    total_targets: 19,
    total_receptions: 12,
    total_rec_yards: 209,
    proj_adot: 13.1,
    proj_yac_per_rec: 5.8,
    proj_catch_rate: 0.60,
    proj_explosive_rate: 0.35,
    games_played: 4
  },
  // DeAndre Hopkins - TEN @ ARI (Sunday)
  {
    player_id: 'hopkins_d',
    player_name: 'DeAndre Hopkins',
    team: 'TEN',
    position: 'WR',
    total_targets: 26,
    total_receptions: 15,
    total_rec_yards: 198,
    proj_adot: 11.2,
    proj_yac_per_rec: 3.8,
    proj_catch_rate: 0.58,
    proj_explosive_rate: 0.28,
    games_played: 4
  },
  // Marvin Harrison Jr - ARI vs TEN (Sunday)
  {
    player_id: 'harrison_m',
    player_name: 'Marvin Harrison Jr.',
    team: 'ARI',
    position: 'WR',
    total_targets: 28,
    total_receptions: 16,
    total_rec_yards: 251,
    proj_adot: 12.5,
    proj_yac_per_rec: 4.2,
    proj_catch_rate: 0.57,
    proj_explosive_rate: 0.33,
    games_played: 4
  },
  // STEADY candidates (O rec + U yards)
  // Drake London - ATL (not playing Week 5, use available player)
  // Khalil Shakir - BUF vs NE (Sunday Night)
  {
    player_id: 'shakir_k',
    player_name: 'Khalil Shakir',
    team: 'BUF',
    position: 'WR',
    total_targets: 33,
    total_receptions: 26,
    total_rec_yards: 211,
    proj_adot: 5.8,
    proj_yac_per_rec: 3.2,
    proj_catch_rate: 0.79,
    proj_explosive_rate: 0.08,
    games_played: 4
  },
  // Amon-Ra St. Brown - DET @ CIN (Sunday)
  {
    player_id: 'stbrown_a',
    player_name: 'Amon-Ra St. Brown',
    team: 'DET',
    position: 'WR',
    total_targets: 48,
    total_receptions: 38,
    total_rec_yards: 285,
    proj_adot: 6.2,
    proj_yac_per_rec: 3.2,
    proj_catch_rate: 0.79,
    proj_explosive_rate: 0.08,
    games_played: 4
  },
  // Garrett Wilson - NYJ vs DAL (Sunday)
  {
    player_id: 'wilson_g',
    player_name: 'Garrett Wilson',
    team: 'NYJ',
    position: 'WR',
    total_targets: 40,
    total_receptions: 30,
    total_rec_yards: 252,
    proj_adot: 7.5,
    proj_yac_per_rec: 3.8,
    proj_catch_rate: 0.75,
    proj_explosive_rate: 0.11,
    games_played: 4
  }
];

// Mock game contexts - ACTUAL Week 5 2025 schedule
const mockGameContexts = {
  'KC': {
    team: 'KC',
    opponent: 'JAX',
    home_away: 'away',
    spread: -9.5,
    total: 46.5,
    implied_points: 28.0,
    day: 'Monday',
    time: '20:15'
  },
  'TEN': {
    team: 'TEN',
    opponent: 'ARI',
    home_away: 'away',
    spread: 3.5,
    total: 43.5,
    implied_points: 20.0,
    day: 'Sunday',
    time: '16:05'
  },
  'ARI': {
    team: 'ARI',
    opponent: 'TEN',
    home_away: 'home',
    spread: -3.5,
    total: 43.5,
    implied_points: 23.5,
    day: 'Sunday',
    time: '16:05'
  },
  'BUF': {
    team: 'BUF',
    opponent: 'NE',
    home_away: 'home',
    spread: -7.5,
    total: 42.5,
    implied_points: 25.0,
    day: 'Sunday',
    time: '20:20'
  },
  'DET': {
    team: 'DET',
    opponent: 'CIN',
    home_away: 'away',
    spread: -3.0,
    total: 50.5,
    implied_points: 26.8,
    day: 'Sunday',
    time: '16:25'
  },
  'NYJ': {
    team: 'NYJ',
    opponent: 'DAL',
    home_away: 'home',
    spread: 1.5,
    total: 41.5,
    implied_points: 20.0,
    day: 'Sunday',
    time: '13:00'
  }
};

// Mock defensive stats - ACTUAL Week 5 opponents (array format)
const mockDefenseStats = [
  {
    team: 'JAX',
    position: 'WR',
    proj_catch_rate_allowed: 0.70,
    proj_ypr_allowed: 13.5,
    proj_adot_allowed: 11.2,
    proj_yac_per_rec_allowed: 5.1,
    proj_explosive_rate_allowed: 0.25
  },
  {
    team: 'ARI',
    position: 'WR',
    proj_catch_rate_allowed: 0.68,
    proj_ypr_allowed: 12.1,
    proj_adot_allowed: 10.3,
    proj_yac_per_rec_allowed: 4.4,
    proj_explosive_rate_allowed: 0.21
  },
  {
    team: 'TEN',
    position: 'WR',
    proj_catch_rate_allowed: 0.68,
    proj_ypr_allowed: 13.1,
    proj_adot_allowed: 11.8,
    proj_yac_per_rec_allowed: 4.5,
    proj_explosive_rate_allowed: 0.23
  },
  {
    team: 'NE',
    position: 'WR',
    proj_catch_rate_allowed: 0.69,
    proj_ypr_allowed: 11.2,
    proj_adot_allowed: 9.1,
    proj_yac_per_rec_allowed: 4.2,
    proj_explosive_rate_allowed: 0.18
  },
  {
    team: 'CIN',
    position: 'WR',
    proj_catch_rate_allowed: 0.71,
    proj_ypr_allowed: 12.3,
    proj_adot_allowed: 9.8,
    proj_yac_per_rec_allowed: 4.5,
    proj_explosive_rate_allowed: 0.20
  },
  {
    team: 'DAL',
    position: 'WR',
    proj_catch_rate_allowed: 0.66,
    proj_ypr_allowed: 11.0,
    proj_adot_allowed: 8.5,
    proj_yac_per_rec_allowed: 4.0,
    proj_explosive_rate_allowed: 0.17
  }
];

// Run scanner - convert gameContexts object to array
console.log('Running scanner...\n');
const gameContextsArray = Object.values(mockGameContexts);
const candidates = scanSlate(mockPlayerStats, gameContextsArray, mockDefenseStats);

// Display results
console.log('=' .repeat(80));
console.log('TEST PREDICTIONS FOR DRAFTKINGS PRICING');
console.log('=' .repeat(80));
console.log();

const explosiveCandidates = candidates.filter(c => c.archetype === 'Explosive Playmaker');
const steadyCandidates = candidates.filter(c => c.archetype === 'Steady Playmaker');

// Get top 3 unique players for each archetype
const uniqueExplosive = [];
const seenExplosive = new Set();
for (const c of explosiveCandidates) {
  if (!seenExplosive.has(c.player) && uniqueExplosive.length < 3) {
    uniqueExplosive.push(c);
    seenExplosive.add(c.player);
  }
}

const uniqueSteady = [];
const seenSteady = new Set();
for (const c of steadyCandidates) {
  if (!seenSteady.has(c.player) && uniqueSteady.length < 3) {
    uniqueSteady.push(c);
    seenSteady.add(c.player);
  }
}

console.log(`📈 EXPLOSIVE PLAYMAKERS (${uniqueExplosive.length} candidates)\n`);
console.log('Under Receptions + Over Yards\n');

uniqueExplosive.forEach((c, i) => {
  const gameCtx = gameContextsArray.find(g => g.team === c.team);
  console.log(`${i + 1}. ${c.player} (${c.team} ${c.position})`);
  console.log(`   Game: ${gameCtx?.team || c.team} vs ${gameCtx?.opponent || 'TBD'} (${gameCtx?.day || 'TBD'})`);
  console.log(`   Combo: Under ${c.combo.rec.line} rec + Over ${c.combo.yards.line} yds`);
  console.log(`   True Probability: ${(c.trueProbability * 100).toFixed(1)}%`);
  console.log(`   Reasoning: ${c.reasoning}`);
  console.log(`   Inputs: ${c.inputs.projTargets.toFixed(1)} targets, ${(c.inputs.projCatchRate * 100).toFixed(0)}% catch, ${c.inputs.aDOT.toFixed(1)} aDOT, ${c.inputs.yacPerReception.toFixed(1)} YAC/rec`);
  console.log();
});

console.log('-'.repeat(80));
console.log();
console.log(`📊 STEADY PLAYMAKERS (${uniqueSteady.length} candidates)\n`);
console.log('Over Receptions + Under Yards\n');

uniqueSteady.forEach((c, i) => {
  const gameCtx = gameContextsArray.find(g => g.team === c.team);
  console.log(`${i + 1}. ${c.player} (${c.team} ${c.position})`);
  console.log(`   Game: ${gameCtx?.team || c.team} vs ${gameCtx?.opponent || 'TBD'} (${gameCtx?.day || 'TBD'})`);
  console.log(`   Combo: Over ${c.combo.rec.line} rec + Under ${c.combo.yards.line} yds`);
  console.log(`   True Probability: ${(c.trueProbability * 100).toFixed(1)}%`);
  console.log(`   Reasoning: ${c.reasoning}`);
  console.log(`   Inputs: ${c.inputs.projTargets.toFixed(1)} targets, ${(c.inputs.projCatchRate * 100).toFixed(0)}% catch, ${c.inputs.aDOT.toFixed(1)} aDOT, ${c.inputs.yacPerReception.toFixed(1)} YAC/rec`);
  console.log();
});

console.log('=' .repeat(80));
console.log('\n📝 NEXT STEPS:');
console.log('1. Run these picks on DraftKings SGP builder');
console.log('2. Record the actual SGP odds for each combo');
console.log('3. Compare DK implied prob vs model true prob');
console.log('4. Calibrate model and identify best edge opportunities\n');

// Export for easy reference
const testOutput = {
  explosive: explosiveCandidates.slice(0, 5).map(c => ({
    player: c.player,
    team: c.team,
    position: c.position,
    combo: `U${c.combo.rec.line} rec + O${c.combo.yards.line} yds`,
    trueProbability: `${(c.trueProbability * 100).toFixed(1)}%`,
    reasoning: c.reasoning
  })),
  steady: steadyCandidates.slice(0, 5).map(c => ({
    player: c.player,
    team: c.team,
    position: c.position,
    combo: `O${c.combo.rec.line} rec + U${c.combo.yards.line} yds`,
    trueProbability: `${(c.trueProbability * 100).toFixed(1)}%`,
    reasoning: c.reasoning
  }))
};

fs.writeFileSync('test-sgp-output.json', JSON.stringify(testOutput, null, 2));
console.log('✅ Test output saved to: test-sgp-output.json\n');
