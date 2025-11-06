import { expectedFantasyPoints, applyMultiTDBonus } from '../src/props/expected.mjs';
import { CONFIG } from '../src/config.mjs';

/**
 * Test props to EFP calculation
 */

console.log('Testing props to EFP calculation...\n');

const scoringRules = {
  passYardPoint: 0.04,
  passTDPts: 4,
  intPts: -2,
  rushYardPoint: 0.1,
  recYardPoint: 0.1,
  receptionPoint: 0.5, // Half-PPR
  tdPts: 6
};

// Test 1: QB with full props
const qbProps = {
  pass_yds: 275,
  pass_tds: 2.0,
  interceptions: 0.8
};

const qbResult = expectedFantasyPoints(qbProps, scoringRules, 'QB', {});
console.log('Test 1: QB (275 yds, 2 TDs, 0.8 INTs)');
console.log(`  Expected: 11 + 8 - 1.6 = 17.4`);
console.log(`  Actual: ${qbResult.efp}`);
console.log(`  ✓ ${Math.abs(qbResult.efp - 17.4) < 0.1 ? 'PASS' : 'FAIL'}\n`);

// Test 2: RB with rush + TD
const rbProps = {
  rush_yds: 85,
  anytime_td_prob: 0.55
};

const rbResult = expectedFantasyPoints(rbProps, scoringRules, 'RB', {});
console.log('Test 2: RB (85 rush yds, 0.55 TD prob)');
console.log(`  Expected: 8.5 + 3.3 = 11.8`);
console.log(`  Actual: ${rbResult.efp}`);
console.log(`  ✓ ${Math.abs(rbResult.efp - 11.8) < 0.5 ? 'PASS' : 'FAIL'}\n`);

// Test 3: WR with rec + yards
const wrProps = {
  reception_yds: 76,
  receptions: 5.5,
  anytime_td_prob: 0.42
};

const wrResult = expectedFantasyPoints(wrProps, scoringRules, 'WR', {});
console.log('Test 3: WR (76 rec yds, 5.5 recs, 0.42 TD prob)');
console.log(`  Expected: 7.6 + 2.75 + 2.52 = 12.87`);
console.log(`  Actual: ${wrResult.efp}`);
console.log(`  ✓ ${Math.abs(wrResult.efp - 12.9) < 0.5 ? 'PASS' : 'FAIL'}\n`);

// Test 4: 2+ TD ceiling bonus (RB)
const rbWithBonus = applyMultiTDBonus(11.8, 0.55, scoringRules, 'RB');
console.log('Test 4: 2+ TD ceiling bonus (RB, 0.55 TD prob)');
console.log(`  Base EFP: 11.8`);
console.log(`  With bonus: ${rbWithBonus}`);
console.log(`  Bonus weight: ${CONFIG.ceilingWeights.RB} (RB)`);
console.log(`  ✓ ${rbWithBonus > 11.8 ? 'PASS' : 'FAIL'}\n`);

// Test 5: Fallback (missing props)
const missingPropsResult = expectedFantasyPoints({}, scoringRules, 'QB', {
  impliedTotal: 27.3,
  isFavorite: true,
  favoriteBy: 7.5
});

console.log('Test 5: Fallback EFP (QB, no props, IT 27.3, -7.5 favorite)');
console.log(`  Actual: ${missingPropsResult.efp}`);
console.log(`  Should use fallback (baseline + IT bonus + favorite bonus)`);
console.log(`  ✓ ${missingPropsResult.efp > 15 ? 'PASS' : 'FAIL'}\n`);

console.log('All props to EFP tests complete!');
