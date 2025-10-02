// Test harness for SGP scanner
// Generates sample predictions for DraftKings pricing validation

import { scanSlate, classifyArchetype } from '../netlify/functions/_lib/nfl-sgp-negcorr.mjs';
import fs from 'fs';

console.log('🎯 NFL SGP Negative Correlation Test Harness\n');

// Load mock data for testing
const mockPlayerStats = [
  {
    player_id: '1',
    player_name: "De'Von Achane",
    team: 'MIA',
    position: 'RB',
    games_played: 4,
    total_targets: 20,
    total_receptions: 16,
    total_yards: 180,
    proj_catch_rate: 0.80,
    proj_ypr: 11.25,
    proj_adot: 1.5,
    proj_yac_per_rec: 9.75,
    proj_explosive_rate: 0.30
  },
  {
    player_id: '2',
    player_name: 'Khalil Shakir',
    team: 'BUF',
    position: 'WR',
    games_played: 4,
    total_targets: 32,
    total_receptions: 24,
    total_yards: 180,
    proj_catch_rate: 0.75,
    proj_ypr: 7.5,
    proj_adot: 5.8,
    proj_yac_per_rec: 3.2,
    proj_explosive_rate: 0.10
  },
  {
    player_id: '3',
    player_name: 'Xavier Worthy',
    team: 'KC',
    position: 'WR',
    games_played: 4,
    total_targets: 16,
    total_receptions: 10,
    total_yards: 160,
    proj_catch_rate: 0.62,
    proj_ypr: 16.0,
    proj_adot: 12.5,
    proj_yac_per_rec: 3.5,
    proj_explosive_rate: 0.35
  },
  {
    player_id: '4',
    player_name: 'Travis Kelce',
    team: 'KC',
    position: 'TE',
    games_played: 4,
    total_targets: 28,
    total_receptions: 22,
    total_yards: 200,
    proj_catch_rate: 0.78,
    proj_ypr: 9.1,
    proj_adot: 6.2,
    proj_yac_per_rec: 2.9,
    proj_explosive_rate: 0.08
  }
];

const mockGameContexts = [
  {
    team: 'MIA',
    opponent: 'NE',
    projPassAttempts: 38,
    script: 'positive',
    availabilityConf: 0.85
  },
  {
    team: 'BUF',
    opponent: 'BAL',
    projPassAttempts: 36,
    script: 'neutral',
    availabilityConf: 0.88
  },
  {
    team: 'KC',
    opponent: 'NO',
    projPassAttempts: 34,
    script: 'positive',
    availabilityConf: 0.92
  }
];

const mockDefenseStats = [
  {
    team: 'NE',
    position: 'RB',
    proj_catch_rate_allowed: 0.72,
    proj_ypr_allowed: 8.5,
    proj_adot_allowed: 2.0,
    proj_yac_per_rec_allowed: 6.5,
    proj_explosive_rate_allowed: 0.22
  },
  {
    team: 'BAL',
    position: 'WR',
    proj_catch_rate_allowed: 0.64,
    proj_ypr_allowed: 11.2,
    proj_adot_allowed: 7.8,
    proj_yac_per_rec_allowed: 3.4,
    proj_explosive_rate_allowed: 0.14
  },
  {
    team: 'NO',
    position: 'WR',
    proj_catch_rate_allowed: 0.68,
    proj_ypr_allowed: 12.5,
    proj_adot_allowed: 9.2,
    proj_yac_per_rec_allowed: 3.3,
    proj_explosive_rate_allowed: 0.18
  },
  {
    team: 'NO',
    position: 'TE',
    proj_catch_rate_allowed: 0.70,
    proj_ypr_allowed: 10.0,
    proj_adot_allowed: 6.5,
    proj_yac_per_rec_allowed: 3.5,
    proj_explosive_rate_allowed: 0.10
  }
];

// Run scanner
console.log('Running scanner...\n');
const candidates = scanSlate(mockPlayerStats, mockGameContexts, mockDefenseStats);

// Display results
console.log('=' .repeat(80));
console.log('TEST PREDICTIONS FOR DRAFTKINGS PRICING');
console.log('=' .repeat(80));
console.log();

const explosiveCandidates = candidates.filter(c => c.archetype === 'Explosive Playmaker');
const steadyCandidates = candidates.filter(c => c.archetype === 'Steady Playmaker');

console.log(`📈 EXPLOSIVE PLAYMAKERS (${explosiveCandidates.length} candidates)\n`);
console.log('Under Receptions + Over Yards\n');

explosiveCandidates.slice(0, 5).forEach((c, i) => {
  console.log(`${i + 1}. ${c.player} (${c.team} ${c.position})`);
  console.log(`   Combo: Under ${c.combo.rec.line} rec + Over ${c.combo.yards.line} yds`);
  console.log(`   True Probability: ${(c.trueProbability * 100).toFixed(1)}%`);
  console.log(`   Reasoning: ${c.reasoning}`);
  console.log(`   Inputs: ${c.inputs.projTargets.toFixed(1)} targets, ${(c.inputs.projCatchRate * 100).toFixed(0)}% catch, ${c.inputs.aDOT.toFixed(1)} aDOT, ${c.inputs.yacPerReception.toFixed(1)} YAC/rec`);
  console.log();
});

console.log('-'.repeat(80));
console.log();
console.log(`📊 STEADY PLAYMAKERS (${steadyCandidates.length} candidates)\n`);
console.log('Over Receptions + Under Yards\n');

steadyCandidates.slice(0, 5).forEach((c, i) => {
  console.log(`${i + 1}. ${c.player} (${c.team} ${c.position})`);
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
