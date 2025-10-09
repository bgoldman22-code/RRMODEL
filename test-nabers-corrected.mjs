// Test Corrected Nabers Baseline Logic
import { BASELINE_CONTRIBUTORS_2025 } from './netlify/functions/_lib/baseline-contributors-2025.mjs';
import { fetchESPN_IR_Players, isPlayerOnIR } from './netlify/functions/_lib/espn-ir-tracker.mjs';

const irData = await fetchESPN_IR_Players();

console.log('🔍 CORRECTED: Malik Nabers Baseline Check\n');

const nabersInBaseline = BASELINE_CONTRIBUTORS_2025['NYG']['WR'].includes('Malik Nabers');
console.log('NYG WR Baseline:', BASELINE_CONTRIBUTORS_2025['NYG']['WR']);
console.log('✅ Malik Nabers in NYG baseline:', nabersInBaseline);

const nabersOnIR = isPlayerOnIR('Malik Nabers', 'NYG', irData);
console.log('✅ Malik Nabers on IR:', nabersOnIR);

console.log('\n📊 INJURY ADJUSTMENT DECISION:');
if (nabersOnIR && nabersInBaseline) {
  console.log('⚠️ APPLY IMPACT - Nabers on IR but WAS in baseline (Weeks 1-3)');
  console.log('   → His absence is a NEW loss to the team');
  console.log('   → System SHOULD apply injury adjustment');
} else if (nabersOnIR && !nabersInBaseline) {
  console.log('⏭️ SKIP - Nabers on IR, not in baseline');
  console.log('   → His absence already baked into baseline');
} else {
  console.log('✅ PROCESS NORMALLY - Not on IR');
}

console.log('\n🎯 CORRECT BEHAVIOR:');
console.log('Nabers played Weeks 1-3 → Contributed to baseline EPA');
console.log('Now on IR (Week 4+) → His absence is a NEW impact');
console.log('System should calculate: -3.5 to -5 points for NYG');

console.log('\n📅 TIMELINE:');
console.log('Week 1-3: Nabers active, contributing to NYG offense');
console.log('Week 4: Placed on IR (concussion)');
console.log('Baseline EPA: Calculated WITH Nabers in Weeks 1-3');
console.log('Current State: Baseline expects Nabers, so IR = negative impact');
