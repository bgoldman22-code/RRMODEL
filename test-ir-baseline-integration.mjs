// Test IR + Baseline Integration
// This tests the complete flow: ESPN IR detection → Baseline check → Skip logic

import { fetchESPN_IR_Players, isPlayerOnIR } from './netlify/functions/_lib/espn-ir-tracker.mjs';

console.log('🧪 TESTING IR + BASELINE INTEGRATION\n');
console.log('=' .repeat(60));

// Step 1: Fetch ESPN IR data
console.log('\n📡 Step 1: Fetching ESPN IR Data...');
const irData = await fetchESPN_IR_Players();
console.log(`✅ Found ${irData.totalIR} IR players from ${irData.source}`);

// Step 2: Test specific players
console.log('\n🔍 Step 2: Testing Key Players...');
const testPlayers = [
  { name: 'Malik Nabers', team: 'NYG', position: 'WR', inBaseline: false },
  { name: 'James Conner', team: 'ARI', position: 'RB', inBaseline: true },
  { name: 'Brock Purdy', team: 'SF', position: 'QB', inBaseline: true },
  { name: 'Christian McCaffrey', team: 'SF', position: 'RB', inBaseline: true }
];

const BASELINE_CONTRIBUTORS = {
  'ARI': {
    'RB': ['James Conner'],
    'WR': ['Marvin Harrison Jr.', 'Michael Wilson'],
    'TE': ['Trey McBride']
  },
  'NYG': {
    'QB': ['Daniel Jones'],
    'RB': ['Devin Singletary', 'Tyrone Tracy Jr.'],
    'WR': [], // Malik Nabers NOT in baseline (injured before/early season)
    'TE': ['Theo Johnson', 'Daniel Bellinger']
  },
  'SF': {
    'QB': ['Brock Purdy'],
    'RB': ['Christian McCaffrey', 'Jordan Mason'],
    'WR': ['Deebo Samuel', 'Brandon Aiyuk'],
    'TE': ['George Kittle']
  }
};

function checkPlayerBaselineContribution(playerName, position, teamCode) {
  const teamBaseline = BASELINE_CONTRIBUTORS[teamCode];
  if (!teamBaseline) return true; // Conservative: assume player contributed
  
  const positionBaseline = teamBaseline[position];
  if (!positionBaseline) return true;
  
  return positionBaseline.some(name => 
    name.toLowerCase() === playerName.toLowerCase() ||
    playerName.toLowerCase().includes(name.toLowerCase()) ||
    name.toLowerCase().includes(playerName.toLowerCase())
  );
}

console.log('\nPlayer Analysis:');
console.log('-'.repeat(60));

for (const player of testPlayers) {
  const isOnIRStatus = isPlayerOnIR(player.name, player.team, irData);
  const wasInBaseline = checkPlayerBaselineContribution(player.name, player.position, player.team);
  
  // DECISION LOGIC (matches production code)
  let decision;
  let reason;
  
  if (isOnIRStatus && !wasInBaseline) {
    decision = '⏭️ SKIP';
    reason = 'On IR, not in baseline (already absent)';
  } else if (isOnIRStatus && wasInBaseline) {
    decision = '⚠️ APPLY IMPACT';
    reason = 'On IR but WAS in baseline (new absence)';
  } else if (!isOnIRStatus && wasInBaseline) {
    decision = '✅ PROCESS NORMALLY';
    reason = 'Active/Questionable, in baseline';
  } else {
    decision = '🤔 EVALUATE';
    reason = 'Not on IR, not in baseline (check status)';
  }
  
  console.log(`\n${player.name} (${player.team} ${player.position}):`);
  console.log(`  IR Status: ${isOnIRStatus ? '✅ ON IR' : '❌ Not on IR'}`);
  console.log(`  Baseline: ${wasInBaseline ? '✅ In baseline' : '❌ Not in baseline'}`);
  console.log(`  Decision: ${decision}`);
  console.log(`  Reason: ${reason}`);
  
  // Validate against expected behavior
  const expectedSkip = player.name === 'Malik Nabers'; // Only Nabers should skip
  const willSkip = (decision === '⏭️ SKIP');
  
  if (expectedSkip === willSkip) {
    console.log(`  ✅ CORRECT (Expected: ${expectedSkip ? 'skip' : 'process'})`);
  } else {
    console.log(`  ❌ ERROR (Expected: ${expectedSkip ? 'skip' : 'process'}, Got: ${willSkip ? 'skip' : 'process'})`);
  }
}

// Step 3: Summary
console.log('\n' + '='.repeat(60));
console.log('📊 INTEGRATION TEST SUMMARY\n');

const nabersTest = isPlayerOnIR('Malik Nabers', 'NYG', irData);
const nabersBaseline = checkPlayerBaselineContribution('Malik Nabers', 'WR', 'NYG');
const nabersShouldSkip = nabersTest && !nabersBaseline;

console.log('Critical Test Cases:');
console.log(`  1. Malik Nabers IR detection: ${nabersTest ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  2. Nabers NOT in NYG baseline: ${!nabersBaseline ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  3. Nabers should be skipped: ${nabersShouldSkip ? '✅ PASS' : '❌ FAIL'}`);

const connerTest = isPlayerOnIR('James Conner', 'ARI', irData);
const connerBaseline = checkPlayerBaselineContribution('James Conner', 'RB', 'ARI');
const connerShouldApply = connerTest && connerBaseline;

console.log(`  4. James Conner IR detection: ${connerTest ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  5. Conner IS in ARI baseline: ${connerBaseline ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  6. Conner should get impact: ${connerShouldApply ? '✅ PASS' : '❌ FAIL'}`);

const purdyTest = !isPlayerOnIR('Brock Purdy', 'SF', irData); // Should NOT be on IR
console.log(`  7. Brock Purdy NOT on IR: ${purdyTest ? '✅ PASS' : '❌ FAIL'}`);

const allPassed = nabersTest && !nabersBaseline && nabersShouldSkip && 
                  connerTest && connerBaseline && connerShouldApply && purdyTest;

console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('✅ ALL TESTS PASSED - Integration working correctly!');
  console.log('\n🎯 Next Steps:');
  console.log('   1. Populate BASELINE_CONTRIBUTORS for all 32 teams');
  console.log('   2. Commit and push changes');
  console.log('   3. Deploy to production');
} else {
  console.log('❌ SOME TESTS FAILED - Review logic above');
}
console.log('='.repeat(60));
