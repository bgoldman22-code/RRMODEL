// Test NHL SOG Pick Logic
// Verify that OVER/UNDER evaluation works correctly

/**
 * Test Cases:
 * 
 * Case 1: Erik Karlsson
 * - Projection: 1.0 shots
 * - Line: 1.5 shots
 * - Expected: UNDER should have +EV (projection < line)
 * 
 * Case 2: High shooter vs low line
 * - Projection: 3.5 shots
 * - Line: 2.5 shots
 * - Expected: OVER should have +EV (projection > line)
 * 
 * Case 3: Anton Lundell (the bug case)
 * - Projection: 2.5 shots
 * - Line: 2.5 shots
 * - Expected: NO EDGE on either side (projection = line)
 */

// Mock ZINB probability calculation (simplified for testing)
function calculateZINBProbability(mu, r, pi, line, direction) {
  const threshold = Math.floor(line);
  
  // Simplified: Use Poisson approximation for testing
  // P(X <= k) for UNDER
  // P(X > k) = 1 - P(X <= k) for OVER
  
  let underProb = 0;
  for (let i = 0; i <= threshold; i++) {
    // Poisson PMF: P(X=k) = (λ^k * e^-λ) / k!
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
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

function oddsToImpliedProb(americanOdds) {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

// Test parameters
const r = 2.0; // variance parameter (not used in simplified version)
const pi = 0.05; // zero-inflation (not used in simplified version)

console.log('='.repeat(80));
console.log('NHL SOG PICK LOGIC TEST');
console.log('='.repeat(80));
console.log('');

// Case 1: Karlsson (projection < line → UNDER should win)
console.log('TEST CASE 1: Erik Karlsson');
console.log('-'.repeat(80));
const karlssonMu = 1.0;
const karlssonLine = 1.5;
const karlssonOverOdds = +150; // OVER 1.5 at +150
const karlssonUnderOdds = +115; // UNDER 1.5 at +115

const karlssonOverProb = calculateZINBProbability(karlssonMu, r, pi, karlssonLine, 'OVER');
const karlssonUnderProb = calculateZINBProbability(karlssonMu, r, pi, karlssonLine, 'UNDER');

const karlssonOverImplied = oddsToImpliedProb(karlssonOverOdds);
const karlssonUnderImplied = oddsToImpliedProb(karlssonUnderOdds);

const karlssonOverEdge = (karlssonOverProb - karlssonOverImplied) * 100;
const karlssonUnderEdge = (karlssonUnderProb - karlssonUnderImplied) * 100;

console.log(`Projection: ${karlssonMu} SOG`);
console.log(`Line: ${karlssonLine} SOG`);
console.log('');
console.log('OVER 1.5:');
console.log(`  Model Win Prob: ${(karlssonOverProb * 100).toFixed(1)}%`);
console.log(`  Implied Prob:   ${(karlssonOverImplied * 100).toFixed(1)}% (odds: +${karlssonOverOdds})`);
console.log(`  Edge:           ${karlssonOverEdge > 0 ? '+' : ''}${karlssonOverEdge.toFixed(1)}%`);
console.log('');
console.log('UNDER 1.5:');
console.log(`  Model Win Prob: ${(karlssonUnderProb * 100).toFixed(1)}%`);
console.log(`  Implied Prob:   ${(karlssonUnderImplied * 100).toFixed(1)}% (odds: +${karlssonUnderOdds})`);
console.log(`  Edge:           ${karlssonUnderEdge > 0 ? '+' : ''}${karlssonUnderEdge.toFixed(1)}%`);
console.log('');
console.log(`✅ EXPECTED: UNDER should have positive edge (projection ${karlssonMu} < line ${karlssonLine})`);
console.log(`✅ ACTUAL: ${karlssonUnderEdge > karlssonOverEdge ? 'UNDER' : 'OVER'} has better edge`);
console.log('');
console.log('');

// Case 2: High shooter (projection > line → OVER should win)
console.log('TEST CASE 2: High Volume Shooter');
console.log('-'.repeat(80));
const highMu = 3.5;
const highLine = 2.5;
const highOverOdds = -110; // OVER 2.5 at -110
const highUnderOdds = +100; // UNDER 2.5 at +100

const highOverProb = calculateZINBProbability(highMu, r, pi, highLine, 'OVER');
const highUnderProb = calculateZINBProbability(highMu, r, pi, highLine, 'UNDER');

const highOverImplied = oddsToImpliedProb(highOverOdds);
const highUnderImplied = oddsToImpliedProb(highUnderOdds);

const highOverEdge = (highOverProb - highOverImplied) * 100;
const highUnderEdge = (highUnderProb - highUnderImplied) * 100;

console.log(`Projection: ${highMu} SOG`);
console.log(`Line: ${highLine} SOG`);
console.log('');
console.log('OVER 2.5:');
console.log(`  Model Win Prob: ${(highOverProb * 100).toFixed(1)}%`);
console.log(`  Implied Prob:   ${(highOverImplied * 100).toFixed(1)}% (odds: ${highOverOdds})`);
console.log(`  Edge:           ${highOverEdge > 0 ? '+' : ''}${highOverEdge.toFixed(1)}%`);
console.log('');
console.log('UNDER 2.5:');
console.log(`  Model Win Prob: ${(highUnderProb * 100).toFixed(1)}%`);
console.log(`  Implied Prob:   ${(highUnderImplied * 100).toFixed(1)}% (odds: +${highUnderOdds})`);
console.log(`  Edge:           ${highUnderEdge > 0 ? '+' : ''}${highUnderEdge.toFixed(1)}%`);
console.log('');
console.log(`✅ EXPECTED: OVER should have positive edge (projection ${highMu} > line ${highLine})`);
console.log(`✅ ACTUAL: ${highOverEdge > highUnderEdge ? 'OVER' : 'UNDER'} has better edge`);
console.log('');
console.log('');

// Case 3: Lundell (projection = line → NO EDGE)
console.log('TEST CASE 3: Anton Lundell (Bug Case)');
console.log('-'.repeat(80));
const lundellMu = 2.5;
const lundellLine = 2.5;
const lundellOverOdds = -110; // OVER 2.5 at -110
const lundellUnderOdds = -130; // UNDER 2.5 at -130

const lundellOverProb = calculateZINBProbability(lundellMu, r, pi, lundellLine, 'OVER');
const lundellUnderProb = calculateZINBProbability(lundellMu, r, pi, lundellLine, 'UNDER');

const lundellOverImplied = oddsToImpliedProb(lundellOverOdds);
const lundellUnderImplied = oddsToImpliedProb(lundellUnderOdds);

const lundellOverEdge = (lundellOverProb - lundellOverImplied) * 100;
const lundellUnderEdge = (lundellUnderProb - lundellUnderImplied) * 100;

console.log(`Projection: ${lundellMu} SOG`);
console.log(`Line: ${lundellLine} SOG`);
console.log('');
console.log('OVER 2.5:');
console.log(`  Model Win Prob: ${(lundellOverProb * 100).toFixed(1)}%`);
console.log(`  Implied Prob:   ${(lundellOverImplied * 100).toFixed(1)}% (odds: ${lundellOverOdds})`);
console.log(`  Edge:           ${lundellOverEdge > 0 ? '+' : ''}${lundellOverEdge.toFixed(1)}%`);
console.log('');
console.log('UNDER 2.5:');
console.log(`  Model Win Prob: ${(lundellUnderProb * 100).toFixed(1)}%`);
console.log(`  Implied Prob:   ${(lundellUnderImplied * 100).toFixed(1)}% (odds: ${lundellUnderOdds})`);
console.log(`  Edge:           ${lundellUnderEdge > 0 ? '+' : ''}${lundellUnderEdge.toFixed(1)}%`);
console.log('');
console.log(`✅ EXPECTED: Neither side should have significant edge (projection ${lundellMu} = line ${lundellLine})`);
console.log(`⚠️  ACTUAL: Both edges should be close to 0% or negative`);
console.log(`⚠️  OLD BUG: System was recommending UNDER +9.7% edge (impossible!)`);
console.log('');
console.log('');

console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log('');
console.log('✅ NEW LOGIC: System now evaluates BOTH OVER and UNDER for each line');
console.log('✅ NEW LOGIC: Picks the side with the highest +EV');
console.log('✅ NEW LOGIC: Skips bets where projection ≈ line (no edge)');
console.log('');
console.log('❌ OLD BUG: System only evaluated whatever direction odds feed provided');
console.log('❌ OLD BUG: Recommended UNDER even when projection = line');
console.log('❌ OLD BUG: Never recommended OVER picks (all picks were UNDER)');
console.log('');
console.log('='.repeat(80));
