// Diagnostic: Why is UNDER 1.5 recommended when projection is 1.6?

function calculateZINBProbability(mu, r, pi, line, direction) {
  const threshold = Math.floor(line);
  
  // Simplified Poisson for testing
  let underProb = 0;
  for (let i = 0; i <= threshold; i++) {
    const lambda = mu;
    const pmf = Math.pow(lambda, i) * Math.exp(-lambda) / factorial(i);
    underProb += pmf;
  }
  
  if (direction === 'UNDER') {
    return underProb;
  } else {
    return 1 - underProb;
  }
}

function factorial(n) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function oddsToImpliedProb(americanOdds) {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

// Morgan Frost case
console.log('='.repeat(80));
console.log('DIAGNOSTIC: Morgan Frost UNDER 1.5 (Projection 1.6)');
console.log('='.repeat(80));

const mu = 1.6;
const r = 2.0;
const pi = 0.05;
const line = 1.5;

// Assume we have BOTH sides available
const underOdds = +100;  // UNDER 1.5 at +100
const overOdds = -130;   // OVER 1.5 at -130 (typical opposite side)

const underWinProb = calculateZINBProbability(mu, r, pi, line, 'UNDER');
const overWinProb = calculateZINBProbability(mu, r, pi, line, 'OVER');

console.log(`\nModel Probabilities:`);
console.log(`  UNDER 1.5: ${(underWinProb * 100).toFixed(1)}%`);
console.log(`  OVER 1.5:  ${(overWinProb * 100).toFixed(1)}%`);
console.log(`  Total: ${((underWinProb + overWinProb) * 100).toFixed(1)}% (should be 100%)`);

// Implied probabilities (with vig)
const underImplied = oddsToImpliedProb(underOdds);
const overImplied = oddsToImpliedProb(overOdds);

console.log(`\nImplied Probabilities (with vig):`);
console.log(`  UNDER +100: ${(underImplied * 100).toFixed(1)}%`);
console.log(`  OVER -130:  ${(overImplied * 100).toFixed(1)}%`);
console.log(`  Total: ${((underImplied + overImplied) * 100).toFixed(1)}% (vig = ${((underImplied + overImplied - 1) * 100).toFixed(1)}%)`);

// Remove vig (proportional method)
const totalImplied = underImplied + overImplied;
const underFair = underImplied / totalImplied;
const overFair = overImplied / totalImplied;

console.log(`\nFair Probabilities (vig removed):`);
console.log(`  UNDER: ${(underFair * 100).toFixed(1)}%`);
console.log(`  OVER:  ${(overFair * 100).toFixed(1)}%`);
console.log(`  Total: ${((underFair + overFair) * 100).toFixed(1)}% (should be 100%)`);

// Calculate edges
const underEdge = (underWinProb - underFair) * 100;
const overEdge = (overWinProb - overFair) * 100;

console.log(`\nEdge Calculations:`);
console.log(`  UNDER: Model ${(underWinProb * 100).toFixed(1)}% - Fair ${(underFair * 100).toFixed(1)}% = ${underEdge > 0 ? '+' : ''}${underEdge.toFixed(1)}%`);
console.log(`  OVER:  Model ${(overWinProb * 100).toFixed(1)}% - Fair ${(overFair * 100).toFixed(1)}% = ${overEdge > 0 ? '+' : ''}${overEdge.toFixed(1)}%`);

console.log(`\n${'='.repeat(80)}`);
console.log(`EXPECTED: OVER should have positive edge (projection 1.6 > line 1.5)`);
console.log(`ACTUAL: ${overEdge > underEdge ? 'OVER' : 'UNDER'} has better edge`);

if (underEdge > 0 && underEdge > overEdge) {
  console.log(`\n🔴 BUG CONFIRMED: System recommends UNDER when projection > line!`);
  console.log(`🔴 This means the vig removal or probability calculation is WRONG`);
}

console.log('='.repeat(80));
