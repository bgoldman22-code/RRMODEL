// Audit: Check all IR players against baseline contributors
import { BASELINE_CONTRIBUTORS_2025 } from './netlify/functions/_lib/baseline-contributors-2025.mjs';
import { fetchESPN_IR_Players } from './netlify/functions/_lib/espn-ir-tracker.mjs';

console.log('🔍 AUDITING BASELINE CONTRIBUTORS vs IR PLAYERS\n');
console.log('=' .repeat(70));

const irData = await fetchESPN_IR_Players();
console.log(`\n📊 Total IR Players: ${irData.totalIR} across ${Object.keys(irData.irPlayers).length} teams\n`);

const issues = [];
const correct = [];

// Check each IR player
for (const [teamCode, irPlayers] of Object.entries(irData.irPlayers)) {
  const teamBaseline = BASELINE_CONTRIBUTORS_2025[teamCode];
  
  if (!teamBaseline) {
    console.log(`⚠️ ${teamCode}: No baseline data (should have generic baseline)`);
    continue;
  }
  
  for (const player of irPlayers) {
    const pos = player.position;
    const name = player.name;
    
    // Check if position exists in baseline
    const positionBaseline = teamBaseline[pos];
    
    if (!positionBaseline) {
      // Position not tracked (likely defensive player)
      if (['QB', 'RB', 'WR', 'TE'].includes(pos)) {
        issues.push({
          team: teamCode,
          player: name,
          position: pos,
          issue: 'MISSING_POSITION_IN_BASELINE',
          action: `Add ${pos}: [] to ${teamCode} baseline`
        });
      }
      continue;
    }
    
    // Check if player is in baseline
    const normalizedName = name.toLowerCase().replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '');
    const inBaseline = positionBaseline.some(baselineName => {
      const normalizedBaseline = baselineName.toLowerCase().replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '');
      return normalizedBaseline === normalizedName || 
             normalizedBaseline.includes(normalizedName) ||
             normalizedName.includes(normalizedBaseline);
    });
    
    if (['QB', 'RB', 'WR', 'TE'].includes(pos)) {
      if (inBaseline) {
        correct.push({
          team: teamCode,
          player: name,
          position: pos,
          status: '✅ IN BASELINE (will apply impact)'
        });
      } else {
        issues.push({
          team: teamCode,
          player: name,
          position: pos,
          issue: 'NOT_IN_BASELINE',
          action: `Verify: Did ${name} play Weeks 1-3? If yes, add to baseline`
        });
      }
    }
  }
}

// Report
console.log('🟢 IR PLAYERS CORRECTLY IN BASELINE:');
console.log('-'.repeat(70));
correct.forEach(item => {
  console.log(`  ${item.team} ${item.position}: ${item.player} ${item.status}`);
});

console.log(`\n🔴 POTENTIAL ISSUES (${issues.length}):`);
console.log('-'.repeat(70));
issues.forEach(item => {
  console.log(`\n  ${item.team} ${item.position}: ${item.player}`);
  console.log(`     Issue: ${item.issue}`);
  console.log(`     Action: ${item.action}`);
});

console.log('\n' + '='.repeat(70));
console.log(`\n📈 SUMMARY:`);
console.log(`  ✅ Correct: ${correct.length} skill position IR players in baseline`);
console.log(`  ⚠️ Issues: ${issues.length} skill position IR players to review`);
console.log(`  📋 Total IR: ${irData.totalIR} players (includes defense/special teams)`);

console.log('\n🎯 RECOMMENDED APPROACH:');
console.log('  1. For each issue above, check if player was active Weeks 1-3 2025');
console.log('  2. If active early season → ADD to baseline (will apply impact)');
console.log('  3. If never active (pre-season IR) → Leave out (skip impact)');
console.log('  4. Use NFLverse play-by-play data to verify participation');
