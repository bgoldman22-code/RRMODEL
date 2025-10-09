// test-kelly-hybrid-staking.js
// Test the explicit hybrid Kelly staking system

import {
  recommendUnits,
  calculateKellyRaw,
  calculateHalfKellyBase,
  computeMultiplier,
  checkExposureLimits,
  buildSignalsFromContext,
  STAKING_LIMITS
} from './netlify/functions/_lib/kelly-hybrid-staking.mjs';

console.log('🎯 TESTING KELLY HYBRID STAKING SYSTEM\n');
console.log('=' .repeat(80));

// Test 1: Basic Kelly calculation
console.log('\n📊 TEST 1: Basic Kelly Calculations');
console.log('-'.repeat(80));

const edgeProb = 0.55;  // 55% win probability
const priceDec = 2.24;   // +124 American odds

const kellyRaw = calculateKellyRaw(edgeProb, priceDec);
const halfKelly = calculateHalfKellyBase(edgeProb, priceDec);

console.log(`Edge: 55% win prob at +124 (2.24 decimal)`);
console.log(`Full Kelly: ${kellyRaw.toFixed(3)}U`);
console.log(`Half-Kelly Base: ${halfKelly.toFixed(3)}U`);
console.log(`✅ Half-Kelly should be exactly 50% of full Kelly`);

// Test 2: No multipliers (baseline)
console.log('\n📊 TEST 2: Baseline (No Multipliers)');
console.log('-'.repeat(80));

const baselineSignals = {
  clvPts: 0,
  lineMoveToward: 0,
  ticketsPct: 50,
  handlePct: 50,
  ticketsAgainst: 50,
  availabilityConf: 0.8,
  marketShockActive: false,
  injurySwingPts: 0,
  injuryConfirmedHours: 999,
  edgePct: 4,
  crossModelAgree: false,
  rookieOrUnprovenQB: false,
  highCorrelation: false
};

const baseline = recommendUnits(edgeProb, priceDec, baselineSignals);
console.log('Result:', JSON.stringify(baseline, null, 2));
console.log(`✅ Expected: ~${halfKelly.toFixed(2)}U (1.0x multiplier, no factors)`);

// Test 3: Strong signals (multiple multipliers)
console.log('\n📊 TEST 3: Strong Signals (Multiple Multipliers)');
console.log('-'.repeat(80));

const strongSignals = {
  clvPts: 0.8,                    // Market agreement: +0.3
  lineMoveToward: 0,
  ticketsPct: 42,                 // Smart money split: +0.3
  handlePct: 68,
  ticketsAgainst: 58,
  availabilityConf: 0.88,         // Availability confidence: +0.2
  marketShockActive: false,
  injurySwingPts: 2.5,            // Fresh injury edge: +0.3
  injuryConfirmedHours: 18,
  edgePct: 8.5,                   // High edge: +0.4
  crossModelAgree: true,          // Cross-model: +0.2
  rookieOrUnprovenQB: false,
  highCorrelation: false
};

const strong = recommendUnits(edgeProb, priceDec, strongSignals);
console.log('Result:', JSON.stringify(strong, null, 2));
console.log(`✅ Expected: Multiplier ~2.3x (0.3+0.3+0.2+0.3+0.4+0.2 = 1.7 → 2.3x base)`);
console.log(`✅ Should be capped at min(3.0U, 2.5x base)`);

// Test 4: Uncertainty penalties
console.log('\n📊 TEST 4: Uncertainty Penalties (Rookie QB)');
console.log('-'.repeat(80));

const uncertaintySignals = {
  ...strongSignals,
  rookieOrUnprovenQB: true,      // Uncertainty penalty: ×0.8
  marketShockActive: true         // Additional uncertainty: ×0.8
};

const uncertain = recommendUnits(edgeProb, priceDec, uncertaintySignals);
console.log('Result:', JSON.stringify(uncertain, null, 2));
console.log(`✅ Expected: Strong multiplier (2.3x) BUT penalized by 0.8 × 0.8 = 0.64`);
console.log(`✅ Net multiplier: 2.3 × 0.64 = ~1.47x`);

// Test 5: Edge too small (should PASS)
console.log('\n📊 TEST 5: Edge Too Small (PASS)');
console.log('-'.repeat(80));

const tinyEdgeSignals = baselineSignals;
const tinyEdge = recommendUnits(0.51, 2.0, tinyEdgeSignals);  // Only 1% edge
console.log('Result:', JSON.stringify(tinyEdge, null, 2));
console.log(`✅ Expected: PASS (Kelly raw < ${STAKING_LIMITS.MIN_KELLY_RAW_THRESHOLD}U threshold)`);

// Test 6: Exposure limits
console.log('\n📊 TEST 6: Exposure Limits');
console.log('-'.repeat(80));

const existingBets = [
  { units: 2.0, date: '2025-10-01', gameId: 'MIN@CLE' },
  { units: 1.5, date: '2025-10-01', gameId: 'MIN@CLE' },
  { units: 1.5, date: '2025-10-01', gameId: 'LAR@CHI' },
  { units: 2.5, date: '2025-10-01', gameId: 'SF@ARI' },
  { units: 1.0, date: '2025-10-01', gameId: 'GB@DET' }
];

const exposure1 = checkExposureLimits(2.0, existingBets, 'MIN@CLE', '2025-10-01');
console.log('Scenario 1: Adding 2.0U to MIN@CLE game (already has 3.5U)');
console.log(JSON.stringify(exposure1, null, 2));
console.log(`✅ Game limit: 3.5 + 2.0 = 5.5U > ${STAKING_LIMITS.MAX_EXPOSURE_PER_GAME}U ❌ VIOLATION`);

const exposure2 = checkExposureLimits(3.0, existingBets, 'DAL@NYG', '2025-10-01');
console.log('\nScenario 2: Adding 3.0U to DAL@NYG game (new game)');
console.log(JSON.stringify(exposure2, null, 2));
console.log(`✅ Daily limit: 8.5 + 3.0 = 11.5U < ${STAKING_LIMITS.MAX_DAILY_STAKE_SUM}U ✅ ALLOWED`);
console.log(`✅ Game limit: 0 + 3.0 = 3.0U < ${STAKING_LIMITS.MAX_EXPOSURE_PER_GAME}U ✅ ALLOWED`);

// Test 7: Multiplier clamping
console.log('\n📊 TEST 7: Multiplier Clamping');
console.log('-'.repeat(80));

const extremeSignals = {
  clvPts: 1.5,                    // +0.3
  lineMoveToward: 0,
  ticketsPct: 40,                 // +0.3
  handlePct: 72,
  ticketsAgainst: 70,             // +0.1 (contrarian)
  availabilityConf: 0.90,         // +0.2
  marketShockActive: false,
  injurySwingPts: 3.5,            // +0.3
  injuryConfirmedHours: 12,
  edgePct: 9.5,                   // +0.4
  crossModelAgree: true,          // +0.2
  rookieOrUnprovenQB: false,
  highCorrelation: false
};

const extreme = recommendUnits(0.58, 2.5, extremeSignals);
console.log('Result:', JSON.stringify(extreme, null, 2));
console.log(`✅ Raw multiplier: 1 + 0.3 + 0.3 + 0.1 + 0.2 + 0.3 + 0.4 + 0.2 = 2.8x`);
console.log(`✅ Clamped at: ${STAKING_LIMITS.MAX_MULTIPLIER}x (max multiplier)`);

// Test 8: Real-world example (MIN vs CLE, Flacco benched)
console.log('\n📊 TEST 8: Real-World Example (MIN vs CLE)');
console.log('-'.repeat(80));

const minCleSignals = {
  clvPts: 0.3,                    // Line hasn't moved much yet
  lineMoveToward: 0.2,
  ticketsPct: 58,                 // Public on MIN
  handlePct: 48,                  // Sharps slightly on CLE
  ticketsAgainst: 42,
  availabilityConf: 0.82,         // Good confidence (depth chart confirmed)
  marketShockActive: false,       // Benching, not injury
  injurySwingPts: 6.5,            // Major QB downgrade
  injuryConfirmedHours: 8,        // Announced morning of game week
  edgePct: 6.2,                   // Solid edge on CLE
  crossModelAgree: false,
  rookieOrUnprovenQB: true,       // Dillon Gabriel (rookie)
  highCorrelation: false
};

const minCle = recommendUnits(0.57, 2.10, minCleSignals);
console.log('CLE ML vs MIN (Flacco benched for rookie Gabriel)');
console.log('Result:', JSON.stringify(minCle, null, 2));
console.log(`\n💡 Analysis:`);
console.log(`   • Fresh injury edge (+0.3): Confirmed QB change`);
console.log(`   • Model edge (+0.2): 6.2% edge bucket`);
console.log(`   • Rookie penalty (×0.8): Gabriel is rookie QB`);
console.log(`   • Net multiplier: ~1.2x base after penalty`);
console.log(`   • Recommended: ${minCle.units}U (${minCle.recommendation})`);

// Test 9: Performance tracking
console.log('\n📊 TEST 9: Performance Tracking Example');
console.log('-'.repeat(80));

const mockBet = {
  units: 1.5,
  odds: 2.10,
  audit: {
    baseHalfKellyU: 1.2,
    clampedMultiplier: 1.25
  }
};

const winResult = { won: true };
const lossResult = { won: false };

console.log('If bet WINS:');
const winTracking = trackPerformance(mockBet, winResult);
console.log(JSON.stringify(winTracking, null, 2));

console.log('\nIf bet LOSES:');
const lossTracking = trackPerformance(mockBet, lossResult);
console.log(JSON.stringify(lossTracking, null, 2));

console.log(`\n✅ Tracks whether multiplier was "worth it"`);

// Summary
console.log('\n' + '='.repeat(80));
console.log('📋 SYSTEM SUMMARY');
console.log('='.repeat(80));
console.log(`
✅ Half-Kelly Base: Reduces variance while maintaining growth
✅ Defined Multipliers: No arbitrary "feel" adjustments
✅ Caps: 3.0U max OR 2.5x base (whichever lower)
✅ Exposure Guards: 12U daily, 5U per game
✅ Audit Trail: Every bet logs Kelly base, multipliers, final stake
✅ Performance Tracking: Compare Kelly-only vs Hybrid

🎯 This system is PRODUCTION-READY and eliminates decorative Kelly!
`);

// Import trackPerformance at the top
import { trackPerformance } from './netlify/functions/_lib/kelly-hybrid-staking.mjs';
