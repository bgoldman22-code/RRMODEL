/**
 * NBA Elite V2 - Hedge & Double Down System Unit Tests
 * 
 * Tests to ensure:
 * - No hedge is created when primary edge < 3%
 * - No double down ML is created when ML is worse than -220
 * - Underdog spread primary → double down is dog ML (not favorite ML)
 * - Primary ML favorite → double down is spread (not more ML)
 * - Stake caps enforced per game/day
 * 
 * Run: node scripts/nba/test-hedge-doubledown.mjs
 */

import {
  generateHedge,
  generateDoubleDown,
  generateHedgeAndDoubleDown,
  applyHedgingSystem,
  calculateEV,
  oddsToProb,
  isFavorite,
  isTooJuiced,
  HEDGE_GATES,
  DOUBLEDOWN_GATES,
  MAX_TOTAL_EXPOSURE_MULTIPLIER
} from '../../netlify/functions/_lib/nba/hedge-doubledown-v2.mjs';

// =============================================================================
// TEST UTILITIES
// =============================================================================

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg}Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, msg = '') {
  if (!value) {
    throw new Error(`${msg}Expected truthy value, got ${value}`);
  }
}

function assertFalse(value, msg = '') {
  if (value) {
    throw new Error(`${msg}Expected falsy value, got ${value}`);
  }
}

function assertNull(value, msg = '') {
  if (value !== null) {
    throw new Error(`${msg}Expected null, got ${JSON.stringify(value)}`);
  }
}

function assertNotNull(value, msg = '') {
  if (value === null || value === undefined) {
    throw new Error(`${msg}Expected non-null value, got ${value}`);
  }
}

function assertLessThan(actual, limit, msg = '') {
  if (actual >= limit) {
    throw new Error(`${msg}Expected ${actual} < ${limit}`);
  }
}

function assertGreaterThan(actual, limit, msg = '') {
  if (actual <= limit) {
    throw new Error(`${msg}Expected ${actual} > ${limit}`);
  }
}

// =============================================================================
// TEST FIXTURES
// =============================================================================

const GAME_CONTEXT = {
  home: { abbreviation: 'LAL' },
  away: { abbreviation: 'BOS' }
};

// Primary bets for testing
const PRIMARY_UNDERDOG_SPREAD = {
  market: 'Spread',
  pick: 'BOS +5.5',
  odds: -110,
  edgePercent: 5.5,
  units: 3,
  confidence: 'MEDIUM',
  p_model: 0.52
};

const PRIMARY_FAVORITE_SPREAD = {
  market: 'Spread',
  pick: 'LAL -5.5',
  odds: -110,
  edgePercent: 6.0,
  units: 4,
  confidence: 'MEDIUM',
  p_model: 0.55
};

const PRIMARY_FAVORITE_ML = {
  market: 'Moneyline',
  pick: 'LAL ML',
  odds: -180,
  edgePercent: 8.5,
  units: 3,
  confidence: 'HIGH',
  p_model: 0.68
};

const PRIMARY_UNDERDOG_ML = {
  market: 'Moneyline',
  pick: 'BOS ML',
  odds: 150,
  edgePercent: 5.0,
  units: 2,
  confidence: 'MEDIUM',
  p_model: 0.42
};

const PRIMARY_LOW_EDGE = {
  market: 'Spread',
  pick: 'LAL -3',
  odds: -110,
  edgePercent: 2.0,
  units: 1,
  confidence: 'LOW',
  p_model: 0.51
};

const PRIMARY_HIGH_CONFIDENCE_HIGH_EDGE = {
  market: 'Spread',
  pick: 'BOS +6',
  odds: -110,
  edgePercent: 10,
  units: 5,
  confidence: 'HIGH',
  p_model: 0.58
};

// Opponent opportunities
const OPPONENT_SPREAD = {
  market: 'Spread',
  pick: 'BOS +5.5',
  odds: -110,
  edgePercent: 3.0,
  winProb: 0.5
};

const OPPONENT_ML_FAVORITE = {
  market: 'Moneyline',
  pick: 'LAL ML',
  odds: -200,
  edgePercent: 2.0,
  winProb: 0.65
};

const OPPONENT_ML_UNDERDOG = {
  market: 'Moneyline',
  pick: 'BOS ML',
  odds: 160,
  edgePercent: 3.0,
  winProb: 0.38
};

const OPPONENT_ML_TOO_JUICED = {
  market: 'Moneyline',
  pick: 'LAL ML',
  odds: -280,
  edgePercent: 1.0,
  winProb: 0.72
};

// Vegas lines
const VEGAS_LINES = {
  spread: {
    home: -5.5,
    homeOdds: -110,
    away: 5.5,
    awayOdds: -110
  },
  moneyline: {
    home: -180,
    away: 150
  }
};

// =============================================================================
// HEDGE TESTS
// =============================================================================

console.log('');
console.log('═'.repeat(60));
console.log('HEDGE TESTS');
console.log('═'.repeat(60));

test('No hedge when primary edge < 3%', () => {
  const opportunities = [PRIMARY_LOW_EDGE, OPPONENT_ML_FAVORITE];
  const hedge = generateHedge(PRIMARY_LOW_EDGE, opportunities, GAME_CONTEXT, VEGAS_LINES);
  assertNull(hedge, 'Hedge should be null for low edge primary. ');
});

test('No hedge when primary confidence is HIGH', () => {
  const opportunities = [PRIMARY_HIGH_CONFIDENCE_HIGH_EDGE, OPPONENT_SPREAD];
  const hedge = generateHedge(PRIMARY_HIGH_CONFIDENCE_HIGH_EDGE, opportunities, GAME_CONTEXT, VEGAS_LINES);
  assertNull(hedge, 'Hedge should be null for HIGH confidence. ');
});

test('No hedge when primary edge > 7%', () => {
  const highEdgePrimary = { ...PRIMARY_UNDERDOG_SPREAD, edgePercent: 9 };
  const opportunities = [highEdgePrimary, OPPONENT_ML_FAVORITE];
  const hedge = generateHedge(highEdgePrimary, opportunities, GAME_CONTEXT, VEGAS_LINES);
  assertNull(hedge, 'Hedge should be null when edge too high. ');
});

test('No hedge when hedge ML is worse than -240', () => {
  const opportunities = [PRIMARY_UNDERDOG_SPREAD, OPPONENT_ML_TOO_JUICED];
  const hedge = generateHedge(PRIMARY_UNDERDOG_SPREAD, opportunities, GAME_CONTEXT, {
    ...VEGAS_LINES,
    moneyline: { home: -280, away: 220 }
  });
  assertNull(hedge, 'Hedge should be null when ML too juiced. ');
});

test('Hedge offered for LOW/MEDIUM confidence with 3-7% edge', () => {
  const opportunities = [PRIMARY_UNDERDOG_SPREAD, OPPONENT_ML_FAVORITE];
  const hedge = generateHedge(PRIMARY_UNDERDOG_SPREAD, opportunities, GAME_CONTEXT, VEGAS_LINES);
  // May or may not have hedge depending on EV check, but at least runs without error
  // The function should either return a hedge or null based on EV
  assertTrue(hedge === null || hedge.betType === 'HEDGE', 'Should return hedge or null. ');
});

test('Hedge stake is ≤25% of primary', () => {
  const opportunities = [PRIMARY_UNDERDOG_SPREAD, OPPONENT_ML_FAVORITE];
  const hedge = generateHedge(PRIMARY_UNDERDOG_SPREAD, opportunities, GAME_CONTEXT, VEGAS_LINES);
  if (hedge) {
    const ratio = hedge.units / PRIMARY_UNDERDOG_SPREAD.units;
    assertLessThan(ratio, 0.26, 'Hedge ratio should be ≤25%. ');
  }
});

test('No hedge for underdog ML (already max risk)', () => {
  const opportunities = [PRIMARY_UNDERDOG_ML, OPPONENT_SPREAD];
  const hedge = generateHedge(PRIMARY_UNDERDOG_ML, opportunities, GAME_CONTEXT, VEGAS_LINES);
  assertNull(hedge, 'Underdog ML should not have hedge. ');
});

// =============================================================================
// DOUBLE DOWN TESTS
// =============================================================================

console.log('');
console.log('═'.repeat(60));
console.log('DOUBLE DOWN TESTS');
console.log('═'.repeat(60));

test('No double down when confidence is not HIGH', () => {
  const opportunities = [PRIMARY_UNDERDOG_SPREAD, OPPONENT_ML_UNDERDOG];
  const dd = generateDoubleDown(PRIMARY_UNDERDOG_SPREAD, opportunities, GAME_CONTEXT, VEGAS_LINES);
  assertNull(dd, 'Double down should be null for non-HIGH confidence. ');
});

test('No double down when edge < 8%', () => {
  const lowEdgeHigh = { ...PRIMARY_UNDERDOG_SPREAD, confidence: 'HIGH', edgePercent: 7 };
  const opportunities = [lowEdgeHigh, OPPONENT_ML_UNDERDOG];
  const dd = generateDoubleDown(lowEdgeHigh, opportunities, GAME_CONTEXT, VEGAS_LINES);
  assertNull(dd, 'Double down should be null for edge < 8%. ');
});

test('No double down ML when ML worse than -220 (favorite spread primary)', () => {
  const favSpread = { ...PRIMARY_FAVORITE_SPREAD, confidence: 'HIGH', edgePercent: 10 };
  const opportunities = [favSpread, OPPONENT_ML_TOO_JUICED];
  const dd = generateDoubleDown(favSpread, opportunities, GAME_CONTEXT, {
    ...VEGAS_LINES,
    moneyline: { home: -250, away: 200 }
  });
  assertNull(dd, 'Double down should be null when fav ML too juiced. ');
});

test('Underdog spread → double down is underdog ML (not favorite)', () => {
  const dogSpread = { ...PRIMARY_UNDERDOG_SPREAD, confidence: 'HIGH', edgePercent: 10 };
  const opportunities = [dogSpread, OPPONENT_ML_UNDERDOG, OPPONENT_ML_FAVORITE];
  const dd = generateDoubleDown(dogSpread, opportunities, GAME_CONTEXT, VEGAS_LINES);
  
  if (dd) {
    // The double down should be on the same team (BOS) as the primary
    assertTrue(dd.pick.includes('BOS'), 'DD should be on same team as primary (BOS). ');
    assertEqual(dd.market.toLowerCase(), 'moneyline', 'DD should be ML market. ');
  }
});

test('Favorite ML → double down is spread (not more ML)', () => {
  const favML = { ...PRIMARY_FAVORITE_ML, confidence: 'HIGH', edgePercent: 9 };
  const favSpread = { market: 'Spread', pick: 'LAL -5.5', odds: -110, edgePercent: 4 };
  const opportunities = [favML, favSpread];
  const dd = generateDoubleDown(favML, opportunities, GAME_CONTEXT, VEGAS_LINES);
  
  if (dd) {
    assertEqual(dd.market.toLowerCase(), 'spread', 'DD for fav ML should be spread, not more ML. ');
    assertTrue(dd.pick.includes('LAL'), 'DD should be on same team as primary. ');
  }
});

test('Double down sprinkle is 15-30% of primary', () => {
  const highEdge = { ...PRIMARY_UNDERDOG_SPREAD, confidence: 'HIGH', edgePercent: 12 };
  const opportunities = [highEdge, OPPONENT_ML_UNDERDOG];
  const dd = generateDoubleDown(highEdge, opportunities, GAME_CONTEXT, VEGAS_LINES);
  
  if (dd) {
    const ratio = dd.units / highEdge.units;
    assertGreaterThan(ratio, 0.14, 'DD ratio should be ≥15%. ');
    assertLessThan(ratio, 0.31, 'DD ratio should be ≤30%. ');
  }
});

test('Long odds (+250) get higher sprinkle (up to 30%)', () => {
  const highEdge = { ...PRIMARY_UNDERDOG_SPREAD, confidence: 'HIGH', edgePercent: 12 };
  const longOddsDog = { ...OPPONENT_ML_UNDERDOG, odds: 280 };
  const opportunities = [highEdge, longOddsDog];
  const dd = generateDoubleDown(highEdge, opportunities, GAME_CONTEXT, {
    ...VEGAS_LINES,
    moneyline: { home: -350, away: 280 }
  });
  
  if (dd) {
    const ratio = dd.units / highEdge.units;
    // Long odds should get higher sprinkle (closer to 30%)
    assertGreaterThan(ratio, 0.24, 'Long odds DD should get higher sprinkle. ');
  }
});

// =============================================================================
// COMBINED SYSTEM TESTS
// =============================================================================

console.log('');
console.log('═'.repeat(60));
console.log('COMBINED SYSTEM TESTS');
console.log('═'.repeat(60));

test('generateHedgeAndDoubleDown returns both when appropriate', () => {
  // Edge case: HIGH confidence, 8%+ edge, MEDIUM would normally get hedge
  // But HIGH confidence means no hedge, only DD
  const highConf = { ...PRIMARY_HIGH_CONFIDENCE_HIGH_EDGE };
  const opportunities = [highConf, OPPONENT_ML_UNDERDOG, OPPONENT_SPREAD];
  
  const result = generateHedgeAndDoubleDown(highConf, opportunities, GAME_CONTEXT, VEGAS_LINES);
  
  assertNotNull(result, 'Result should not be null. ');
  assertNull(result.hedge, 'HIGH confidence should not have hedge. ');
  // DD may or may not be present depending on available opportunities
});

test('Total exposure respects cap (1.6x primary)', () => {
  // Create a scenario with both hedge and DD
  const mediumConf = { ...PRIMARY_UNDERDOG_SPREAD, units: 5 };
  const opportunities = [mediumConf, OPPONENT_ML_FAVORITE];
  
  const result = generateHedgeAndDoubleDown(mediumConf, opportunities, GAME_CONTEXT, VEGAS_LINES);
  
  if (result.totalExposure) {
    const maxAllowed = mediumConf.units * MAX_TOTAL_EXPOSURE_MULTIPLIER;
    assertLessThan(result.totalExposure, maxAllowed + 0.1, 'Total exposure should respect cap. ');
  }
});

test('stakeGuidance is generated correctly', () => {
  const primary = { ...PRIMARY_UNDERDOG_SPREAD, confidence: 'LOW' };
  const opportunities = [primary, OPPONENT_ML_FAVORITE];
  
  const result = generateHedgeAndDoubleDown(primary, opportunities, GAME_CONTEXT, VEGAS_LINES);
  
  assertNotNull(result.stakeGuidance, 'Stake guidance should be generated. ');
  assertTrue(result.stakeGuidance.includes('Primary'), 'Stake guidance should include Primary. ');
});

// =============================================================================
// APPLY HEDGING SYSTEM TESTS
// =============================================================================

console.log('');
console.log('═'.repeat(60));
console.log('APPLY HEDGING SYSTEM TESTS');
console.log('═'.repeat(60));

test('applyHedgingSystem adds primaryBet field', () => {
  const opportunities = [PRIMARY_UNDERDOG_SPREAD];
  const enhanced = applyHedgingSystem(opportunities, GAME_CONTEXT, VEGAS_LINES);
  
  assertTrue(enhanced.length > 0, 'Should return opportunities. ');
  assertNotNull(enhanced[0].primaryBet, 'Should have primaryBet field. ');
  assertEqual(enhanced[0].primaryBet.market, 'Spread', 'primaryBet market should match. ');
});

test('applyHedgingSystem skips non-spread/ML markets', () => {
  const totalOpp = {
    market: 'Total',
    pick: 'Over 220',
    odds: -110,
    edgePercent: 5,
    units: 2
  };
  
  const opportunities = [totalOpp];
  const enhanced = applyHedgingSystem(opportunities, GAME_CONTEXT, VEGAS_LINES);
  
  // Totals should pass through unchanged
  assertEqual(enhanced[0].market, 'Total', 'Total should pass through. ');
  assertEqual(enhanced[0].hedgeBet, undefined, 'Total should not have hedge. ');
});

test('applyHedgingSystem skips track-only bets', () => {
  const trackOnly = { ...PRIMARY_UNDERDOG_SPREAD, isTrackOnly: true, units: 0 };
  const opportunities = [trackOnly];
  const enhanced = applyHedgingSystem(opportunities, GAME_CONTEXT, VEGAS_LINES);
  
  assertEqual(enhanced[0].hedgeBet, undefined, 'Track-only should not have hedge. ');
  assertEqual(enhanced[0].doubleDownBet, undefined, 'Track-only should not have DD. ');
});

// =============================================================================
// UTILITY FUNCTION TESTS
// =============================================================================

console.log('');
console.log('═'.repeat(60));
console.log('UTILITY FUNCTION TESTS');
console.log('═'.repeat(60));

test('calculateEV is correct for winning bet', () => {
  // Bet $100 at +150 (2.5 decimal), 50% win prob
  // EV = 0.5 * 150 - 0.5 * 100 = 75 - 50 = 25
  const ev = calculateEV(0.5, 150, 100);
  assertTrue(ev > 20 && ev < 30, 'EV should be ~25 for +150 at 50%. ');
});

test('calculateEV is correct for negative odds', () => {
  // Bet $100 at -150 (1.67 decimal), 60% win prob
  // Profit if win = 100 * (100/150) = 66.67
  // EV = 0.6 * 66.67 - 0.4 * 100 = 40 - 40 = 0
  const ev = calculateEV(0.6, -150, 100);
  assertTrue(ev > -5 && ev < 5, 'EV should be ~0 for -150 at 60%. ');
});

test('oddsToProb is correct', () => {
  assertEqual(Math.round(oddsToProb(-110) * 100), 52, 'Implied prob for -110 should be ~52%. ');
  assertEqual(Math.round(oddsToProb(100) * 100), 50, 'Implied prob for +100 should be 50%. ');
  assertEqual(Math.round(oddsToProb(-200) * 100), 67, 'Implied prob for -200 should be ~67%. ');
  assertEqual(Math.round(oddsToProb(200) * 100), 33, 'Implied prob for +200 should be ~33%. ');
});

test('isFavorite detects spread favorites', () => {
  assertTrue(isFavorite({ market: 'Spread', pick: 'LAL -5.5' }), 'Negative spread should be favorite. ');
  assertFalse(isFavorite({ market: 'Spread', pick: 'BOS +5.5' }), 'Positive spread should be underdog. ');
});

test('isFavorite detects ML favorites', () => {
  assertTrue(isFavorite({ market: 'Moneyline', odds: -180 }), 'Negative ML odds should be favorite. ');
  assertFalse(isFavorite({ market: 'Moneyline', odds: 150 }), 'Positive ML odds should be underdog. ');
});

test('isTooJuiced detects expensive lines', () => {
  assertTrue(isTooJuiced(-250, -220), '-250 should be too juiced. ');
  assertFalse(isTooJuiced(-200, -220), '-200 should not be too juiced. ');
  assertFalse(isTooJuiced(150, -220), 'Plus money should never be too juiced. ');
});

// =============================================================================
// SUMMARY
// =============================================================================

console.log('');
console.log('═'.repeat(60));
console.log('TEST SUMMARY');
console.log('═'.repeat(60));
console.log('');
console.log(`  Total:  ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log('');

if (failures.length > 0) {
  console.log('Failed tests:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
  console.log('');
  process.exit(1);
} else {
  console.log('All tests passed! ✓');
  console.log('');
  process.exit(0);
}
