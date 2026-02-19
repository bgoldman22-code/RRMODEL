#!/usr/bin/env node
/**
 * Sanity test: verify spreadOpp.modelLine / vegasLine convention consistency
 * after the fix (both in home-line convention).
 *
 * Simulates the exact logic from nba-predictions-elite-v2-1/index.mjs
 */

function test(label, { spreadPred, fairLine, homeAbbr, awayAbbr, expectedDelta }) {
  // --- replicate the production logic ---
  const modelSpreadVegasConvention = -spreadPred;

  // This is the FIXED line:
  const modelLine = modelSpreadVegasConvention.toFixed(1);
  const vegasLine = fairLine;

  // Display string (Option B field)
  const modelLineSign = modelSpreadVegasConvention >= 0 ? '+' : '';
  const modelLineDisplay = `${homeAbbr} ${modelLineSign}${modelSpreadVegasConvention.toFixed(1)}`;

  // Delta calc (replicates Rule A logic)
  const spreadModelLine = Number(modelLine);
  const spreadVegasLine = Number(vegasLine);
  const spreadEdgePts = Math.abs(spreadModelLine - spreadVegasLine);

  // Determine bet side
  const betHome = modelSpreadVegasConvention < fairLine;
  const pickTeam = betHome ? homeAbbr : awayAbbr;

  // Note string (replicates Rule A note)
  const vegasSign = Number(vegasLine) >= 0 ? '+' : '';
  const note = `Large spread mispricing: model ${modelLineDisplay} vs Vegas ${homeAbbr} ${vegasSign}${vegasLine} (Δ ${spreadEdgePts.toFixed(1)} pts)`;

  const pass = Math.abs(spreadEdgePts - expectedDelta) < 0.05;

  console.log(`\n${pass ? '✅' : '❌'} ${label}`);
  console.log(`   spreadPred=${spreadPred}  fairLine=${fairLine}`);
  console.log(`   modelLine (home conv)=${modelLine}  vegasLine=${vegasLine}`);
  console.log(`   modelLineDisplay="${modelLineDisplay}"`);
  console.log(`   delta=${spreadEdgePts.toFixed(1)}  expected=${expectedDelta}  bet=${pickTeam}`);
  console.log(`   note: ${note}`);

  if (!pass) {
    console.error(`   *** FAILED: expected delta ${expectedDelta}, got ${spreadEdgePts.toFixed(1)}`);
    process.exitCode = 1;
  }
}

console.log('='.repeat(70));
console.log('Spread Convention Sanity Tests (post-fix)');
console.log('='.repeat(70));

// 1. Away favorite, home underdog (BOS@GS)
//    spreadPred = -11.1 (model convention: negative → away BOS favored)
//    Vegas homeLine = +5.5 (GS is +5.5 underdog)
//    Model homeLine = +11.1 (GS is +11.1 underdog per model)
//    Correct delta = |11.1 - 5.5| = 5.6
test('Away favorite / home underdog (BOS @ GS)', {
  spreadPred: -11.1,
  fairLine: 5.5,
  homeAbbr: 'GS',
  awayAbbr: 'BOS',
  expectedDelta: 5.6,
});

// 2. Home favorite
//    Vegas: home -4.5, model predicts home -7.0
//    spreadPred = +7.0 (positive → home favored in model convention)
//    modelSpreadVegasConvention = -7.0
//    fairLine = -4.5
//    delta = |-7.0 - (-4.5)| = 2.5
test('Home favorite (LAL home -4.5, model -7.0)', {
  spreadPred: 7.0,
  fairLine: -4.5,
  homeAbbr: 'LAL',
  awayAbbr: 'DEN',
  expectedDelta: 2.5,
});

// 3. Crossing zero (pick'em-ish)
//    Vegas: home +1.0, model says home should be -1.0
//    spreadPred = +1.0 (model convention: positive → home favored)
//    modelSpreadVegasConvention = -1.0
//    fairLine = +1.0
//    delta = |-1.0 - 1.0| = 2.0
test('Crossing zero (Vegas +1.0, model -1.0)', {
  spreadPred: 1.0,
  fairLine: 1.0,
  homeAbbr: 'MIA',
  awayAbbr: 'ATL',
  expectedDelta: 2.0,
});

// 4. Exactly equal (no edge)
//    Vegas: home -3.5, model -3.5
//    spreadPred = +3.5, modelSpreadVegasConvention = -3.5
//    delta = |-3.5 - (-3.5)| = 0.0
test('Exactly equal (both -3.5)', {
  spreadPred: 3.5,
  fairLine: -3.5,
  homeAbbr: 'PHI',
  awayAbbr: 'NYK',
  expectedDelta: 0.0,
});

// 5. Edge case: large away favorite
//    Vegas: home +12.5, model: away favored by 20 → spreadPred = -20
//    modelSpreadVegasConvention = +20.0
//    delta = |20.0 - 12.5| = 7.5
test('Large away favorite (home +12.5, model away -20)', {
  spreadPred: -20.0,
  fairLine: 12.5,
  homeAbbr: 'CHA',
  awayAbbr: 'BOS',
  expectedDelta: 7.5,
});

console.log('\n' + '='.repeat(70));
console.log('All tests complete.');
console.log('='.repeat(70));
