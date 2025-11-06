import { impliedFromSpreadTotal } from '../src/odds/convert.mjs';

/**
 * Test implied totals calculation
 */

console.log('Testing implied totals from spread + total...\n');

// Test 1: Home favorite
const test1 = impliedFromSpreadTotal({
  total: 49,
  spread: -7,  // Home favored by 7
  homeTeam: 'KC',
  awayTeam: 'DEN'
});

console.log('Test 1: KC -7, Total 49');
console.log(`  Home IT: ${test1.homeIT} (expected: 28.0)`);
console.log(`  Away IT: ${test1.awayIT} (expected: 21.0)`);
console.log(`  Favorite: ${test1.favorite} (expected: KC)`);
console.log(`  ✓ ${test1.homeIT === 28.0 && test1.awayIT === 21.0 && test1.favorite === 'KC' ? 'PASS' : 'FAIL'}\n`);

// Test 2: Away favorite
const test2 = impliedFromSpreadTotal({
  total: 44,
  spread: 3.5,  // Away favored by 3.5
  homeTeam: 'MIA',
  awayTeam: 'BUF'
});

console.log('Test 2: BUF -3.5 @ MIA, Total 44');
console.log(`  Home IT: ${test2.homeIT} (expected: 23.8)`);
console.log(`  Away IT: ${test2.awayIT} (expected: 20.2)`);
console.log(`  Favorite: ${test2.favorite} (expected: BUF)`);
console.log(`  ✓ ${Math.abs(test2.homeIT - 23.8) < 0.1 && Math.abs(test2.awayIT - 20.2) < 0.1 && test2.favorite === 'BUF' ? 'PASS' : 'FAIL'}\n`);

// Test 3: Even/Pick'em
const test3 = impliedFromSpreadTotal({
  total: 42,
  spread: 0,  // Even
  homeTeam: 'SF',
  awayTeam: 'SEA'
});

console.log('Test 3: SF PK, Total 42');
console.log(`  Home IT: ${test3.homeIT} (expected: 21.0)`);
console.log(`  Away IT: ${test3.awayIT} (expected: 21.0)`);
console.log(`  ✓ ${test3.homeIT === 21.0 && test3.awayIT === 21.0 ? 'PASS' : 'FAIL'}\n`);

console.log('All implied totals tests complete!');
