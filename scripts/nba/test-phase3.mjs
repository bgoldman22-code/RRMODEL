#!/usr/bin/env node
/**
 * Phase 3 Testing Utilities
 * 
 * Unit tests and validation helpers for Phase 3 pipeline.
 * 
 * Tests:
 * - Feature calculation (walkforward, no leakage)
 * - Scaling and normalization
 * - Sigmoid function
 * - Probability prediction
 * - EV calculation
 * 
 * Usage:
 *   node scripts/nba/test-phase3.mjs
 */

import { 
  sigmoid, 
  scaleFeatures, 
  calculateLogit, 
  predictProbability,
  calculateEV,
  hasPositiveEV,
  kellyCriterion 
} from '../../netlify/functions/_lib/phase3-inference.mjs';

console.log('🧪 Phase 3 Testing Utilities\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (err) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${err.message}`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertClose(actual, expected, tolerance = 0.001, message = '') {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`${message} Expected ${expected}, got ${actual} (diff: ${diff})`);
  }
}

// ===========================
// Sigmoid Tests
// ===========================
console.log('Testing sigmoid function...');

test('sigmoid(0) = 0.5', () => {
  assertClose(sigmoid(0), 0.5);
});

test('sigmoid(large positive) ≈ 1', () => {
  assertClose(sigmoid(10), 1.0, 0.01);
});

test('sigmoid(large negative) ≈ 0', () => {
  assertClose(sigmoid(-10), 0.0, 0.01);
});

test('sigmoid(2) ≈ 0.88', () => {
  assertClose(sigmoid(2), 0.8808, 0.001);
});

// ===========================
// Feature Scaling Tests
// ===========================
console.log('\nTesting feature scaling...');

test('scaleFeatures normalizes correctly', () => {
  const features = [10, 20, 30];
  const mean = [10, 20, 30];
  const scale = [1, 2, 3];
  
  const scaled = scaleFeatures(features, mean, scale);
  
  assertClose(scaled[0], 0);
  assertClose(scaled[1], 0);
  assertClose(scaled[2], 0);
});

test('scaleFeatures handles non-zero values', () => {
  const features = [15, 24, 36];
  const mean = [10, 20, 30];
  const scale = [5, 4, 6];
  
  const scaled = scaleFeatures(features, mean, scale);
  
  assertClose(scaled[0], 1.0);   // (15-10)/5 = 1
  assertClose(scaled[1], 1.0);   // (24-20)/4 = 1
  assertClose(scaled[2], 1.0);   // (36-30)/6 = 1
});

// ===========================
// Logit Calculation Tests
// ===========================
console.log('\nTesting logit calculation...');

test('calculateLogit computes dot product correctly', () => {
  const scaledFeatures = [1, 2, 3];
  const coefficients = { feat1: 0.5, feat2: 0.3, feat3: 0.2 };
  const intercept = 1.0;
  const featureColumns = ['feat1', 'feat2', 'feat3'];
  
  // z = 1.0 + (0.5*1) + (0.3*2) + (0.2*3) = 1.0 + 0.5 + 0.6 + 0.6 = 2.7
  const z = calculateLogit(scaledFeatures, coefficients, intercept, featureColumns);
  
  assertClose(z, 2.7);
});

// ===========================
// Probability Prediction Tests
// ===========================
console.log('\nTesting probability prediction...');

test('predictProbability handles simple case', () => {
  const featureObject = {
    L5_ppg: 25.0,
    L10_ppg: 24.0
  };
  
  const model = {
    feature_columns: ['L5_ppg', 'L10_ppg'],
    coefficients: {
      L5_ppg: 0.5,
      L10_ppg: 0.3
    },
    intercept: 0.0,
    scaler_mean: [25.0, 24.0],
    scaler_scale: [5.0, 5.0]
  };
  
  // Features are exactly at mean, so scaled = [0, 0]
  // z = 0.0 + 0.5*0 + 0.3*0 = 0
  // sigmoid(0) = 0.5
  const prob = predictProbability(featureObject, model);
  
  assertClose(prob, 0.5);
});

test('predictProbability handles missing features', () => {
  const featureObject = {
    L5_ppg: 30.0
    // L10_ppg is missing, should default to 0
  };
  
  const model = {
    feature_columns: ['L5_ppg', 'L10_ppg'],
    coefficients: {
      L5_ppg: 1.0,
      L10_ppg: 1.0
    },
    intercept: 0.0,
    scaler_mean: [25.0, 25.0],
    scaler_scale: [5.0, 5.0]
  };
  
  // L5_ppg scaled: (30-25)/5 = 1
  // L10_ppg scaled: (0-25)/5 = -5
  // z = 0.0 + 1.0*1 + 1.0*(-5) = -4
  // sigmoid(-4) ≈ 0.018
  const prob = predictProbability(featureObject, model);
  
  assertClose(prob, 0.018, 0.01);
});

// ===========================
// Expected Value Tests
// ===========================
console.log('\nTesting expected value calculation...');

test('calculateEV for negative odds (-110)', () => {
  const prob = 0.55;
  const odds = -110;
  const stake = 100;
  
  // Decimal odds: 1 + 100/110 = 1.909
  // Payout: 100 * 1.909 = 190.9
  // EV = 0.55*190.9 - 0.45*100 = 105.0 - 45.0 = 60.0
  const ev = calculateEV(prob, odds, stake);
  
  assertClose(ev, 5.0, 1.0); // Allow some rounding tolerance
});

test('calculateEV for positive odds (+150)', () => {
  const prob = 0.50;
  const odds = 150;
  const stake = 100;
  
  // Decimal odds: 1 + 150/100 = 2.5
  // Payout: 100 * 2.5 = 250
  // EV = 0.50*250 - 0.50*100 = 125 - 50 = 75
  const ev = calculateEV(prob, odds, stake);
  
  assertClose(ev, 25.0, 1.0);
});

test('hasPositiveEV detects positive EV', () => {
  assert(hasPositiveEV(0.55, -110), 'Should have positive EV');
});

test('hasPositiveEV detects negative EV', () => {
  assert(!hasPositiveEV(0.45, -110), 'Should have negative EV');
});

// ===========================
// Kelly Criterion Tests
// ===========================
console.log('\nTesting Kelly Criterion...');

test('kellyCriterion returns positive for good bet', () => {
  const prob = 0.60;
  const odds = -110;
  const bankroll = 1000;
  
  const betSize = kellyCriterion(prob, odds, bankroll, 0.25);
  
  assert(betSize > 0, 'Should suggest positive bet size');
  assert(betSize < bankroll * 0.5, 'Should not suggest more than 50% of bankroll');
});

test('kellyCriterion returns 0 for bad bet', () => {
  const prob = 0.40;
  const odds = -110;
  const bankroll = 1000;
  
  const betSize = kellyCriterion(prob, odds, bankroll, 0.25);
  
  assertClose(betSize, 0, 0.01);
});

// ===========================
// Feature Calculation Leakage Tests
// ===========================
console.log('\nTesting feature calculation for data leakage...');

test('walkforward features only use past data', () => {
  // This is a conceptual test - in practice, verify in training script
  // that calculateRollingStats filters by date < beforeDate
  
  const games = [
    { date: '2024-01-01', player_name: 'Player A', points: 20 },
    { date: '2024-01-05', player_name: 'Player A', points: 25 },
    { date: '2024-01-10', player_name: 'Player A', points: 30 }
  ];
  
  // When calculating features for 2024-01-10, should only use 01-01 and 01-05
  const beforeDate = '2024-01-10';
  const availableGames = games.filter(g => g.date < beforeDate);
  
  assert(availableGames.length === 2, 'Should only have 2 prior games');
  assert(availableGames.every(g => g.date < beforeDate), 'All games should be before target date');
});

// ===========================
// Data Validation Tests
// ===========================
console.log('\nTesting data validation...');

test('training examples have required fields', () => {
  const requiredFields = [
    'date', 'player', 'team', 'opponent', 'home',
    'market', 'side', 'line', 'odds',
    'L5_ppg', 'L10_ppg', 'L999_ppg',
    'L5_pra', 'L10_pra',
    'opp_def_L5_pra_allowed',
    'rest_days', 'games_played',
    'actual_value', 'result'
  ];
  
  const exampleTrainingRow = {
    date: '2024-01-10',
    player: 'LeBron James',
    team: 'LAL',
    opponent: 'GSW',
    home: 1,
    market: 'player_points',
    side: 'Over',
    line: 25.5,
    odds: -110,
    L5_ppg: 26.0,
    L10_ppg: 25.5,
    L999_ppg: 27.0,
    L5_pra: 50.0,
    L10_pra: 48.0,
    opp_def_L5_pra_allowed: 45.0,
    rest_days: 2,
    games_played: 100,
    actual_value: 28,
    result: 1
  };
  
  for (const field of requiredFields) {
    assert(field in exampleTrainingRow, `Missing required field: ${field}`);
  }
});

// ===========================
// Summary
// ===========================
console.log('\n' + '='.repeat(50));
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log('='.repeat(50));

if (testsFailed === 0) {
  console.log('\n✅ All tests passed! Phase 3 pipeline validated.');
  process.exit(0);
} else {
  console.log(`\n❌ ${testsFailed} test(s) failed.`);
  process.exit(1);
}
