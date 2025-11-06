import { probFromAmerican, noVig } from '../src/odds/normalize.mjs';

/**
 * Test odds math (American odds to probability, no-vig)
 */

console.log('Testing odds math...\n');

// Test 1: Positive odds (underdog)
const prob1 = probFromAmerican(+120);
console.log('Test 1: +120 odds');
console.log(`  Probability: ${(prob1 * 100).toFixed(1)}% (expected: ~45.5%)`);
console.log(`  ✓ ${Math.abs(prob1 - 0.4545) < 0.01 ? 'PASS' : 'FAIL'}\n`);

// Test 2: Negative odds (favorite)
const prob2 = probFromAmerican(-145);
console.log('Test 2: -145 odds');
console.log(`  Probability: ${(prob2 * 100).toFixed(1)}% (expected: ~59.2%)`);
console.log(`  ✓ ${Math.abs(prob2 - 0.5918) < 0.01 ? 'PASS' : 'FAIL'}\n`);

// Test 3: Even odds
const prob3 = probFromAmerican(+100);
console.log('Test 3: +100 odds (even)');
console.log(`  Probability: ${(prob3 * 100).toFixed(1)}% (expected: 50.0%)`);
console.log(`  ✓ ${Math.abs(prob3 - 0.50) < 0.01 ? 'PASS' : 'FAIL'}\n`);

// Test 4: No-vig calculation
const overProb = probFromAmerican(-110);
const underProb = probFromAmerican(-110);
const noVigResult = noVig(overProb, underProb);

console.log('Test 4: No-vig calculation');
console.log(`  Over -110: ${(overProb * 100).toFixed(1)}% (expected: ~52.4%)`);
console.log(`  Under -110: ${(underProb * 100).toFixed(1)}% (expected: ~52.4%)`);
console.log(`  After no-vig: Over ${(noVigResult.over * 100).toFixed(1)}%, Under ${(noVigResult.under * 100).toFixed(1)}%`);
console.log(`  Sum: ${((noVigResult.over + noVigResult.under) * 100).toFixed(1)}% (expected: 100.0%)`);
console.log(`  ✓ ${Math.abs((noVigResult.over + noVigResult.under) - 1.0) < 0.01 ? 'PASS' : 'FAIL'}\n`);

console.log('All odds math tests complete!');
