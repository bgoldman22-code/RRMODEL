/**
 * NHL NO-VIG ODDS CONSOLIDATOR
 * 
 * ELITE PRODUCTION FEATURE:
 * - Removes vig from each sportsbook
 * - Blends market probabilities across best books
 * - Calculates true edge vs. no-vig market consensus
 * 
 * WHY THIS MATTERS:
 * - Raw odds include ~5-10% bookmaker margin
 * - Comparing model to raw odds overstates edge
 * - No-vig market represents "true" efficient price
 */

/**
 * CONVERT AMERICAN ODDS TO PROBABILITY
 */
export function oddsToProb(americanOdds) {
  if (americanOdds >= 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

/**
 * CONVERT PROBABILITY TO AMERICAN ODDS
 */
export function probToOdds(probability) {
  if (probability >= 0.5) {
    return Math.round(-probability / (1 - probability) * 100);
  } else {
    return Math.round((1 - probability) / probability * 100);
  }
}

/**
 * REMOVE VIG FROM TWO-WAY MARKET
 * 
 * Takes over/under odds and removes bookmaker margin
 * Returns fair probabilities that sum to 1.0
 */
export function removeVig(overOdds, underOdds) {
  const overImplied = oddsToProb(overOdds);
  const underImplied = oddsToProb(underOdds);
  
  // Total implied probability (includes vig)
  const total = overImplied + underImplied;
  
  // Normalize to remove vig
  const overNoVig = overImplied / total;
  const underNoVig = underImplied / total;
  
  // Calculate vig percentage
  const vigPct = ((total - 1.0) * 100).toFixed(2);
  
  return {
    overProb: overNoVig,
    underProb: underNoVig,
    vigPct: parseFloat(vigPct),
    originalTotal: total
  };
}

/**
 * BLEND NO-VIG PROBABILITIES ACROSS MULTIPLE BOOKS
 * 
 * Takes array of book odds, removes vig from each, then averages
 * Optionally weights by book quality/limits
 */
export function blendMarketProbabilities(bookOdds, weights = null) {
  if (!bookOdds || bookOdds.length === 0) {
    throw new Error('No book odds provided');
  }
  
  const noVigProbs = [];
  
  // Remove vig from each book
  for (const book of bookOdds) {
    const noVig = removeVig(book.overOdds, book.underOdds);
    noVigProbs.push({
      book: book.name,
      overProb: noVig.overProb,
      underProb: noVig.underProb,
      vigPct: noVig.vigPct
    });
  }
  
  // Calculate weighted average
  const totalWeight = weights 
    ? weights.reduce((a, b) => a + b, 0)
    : bookOdds.length;
  
  let blendedOverProb = 0;
  let blendedUnderProb = 0;
  let avgVig = 0;
  
  for (let i = 0; i < noVigProbs.length; i++) {
    const weight = weights ? weights[i] : 1;
    blendedOverProb += noVigProbs[i].overProb * (weight / totalWeight);
    blendedUnderProb += noVigProbs[i].underProb * (weight / totalWeight);
    avgVig += noVigProbs[i].vigPct * (weight / totalWeight);
  }
  
  return {
    overProb: blendedOverProb,
    underProb: blendedUnderProb,
    avgVig: avgVig,
    booksUsed: bookOdds.length,
    bookBreakdown: noVigProbs
  };
}

/**
 * CALCULATE TRUE EDGE VS NO-VIG MARKET
 * 
 * Elite edge calculation:
 * 1. Get market consensus (blended no-vig)
 * 2. Compare model probability to no-vig market
 * 3. Calculate Kelly stake on TRUE edge (not inflated by vig)
 */
export function calculateTrueEdge(modelProb, bookOdds, direction = 'over') {
  // Blend market to get no-vig consensus
  const market = blendMarketProbabilities(bookOdds);
  
  const marketProb = direction === 'over' ? market.overProb : market.underProb;
  const edge = modelProb - marketProb;
  const edgePct = (edge * 100).toFixed(2);
  
  // Find best book odds for this direction
  const bestBook = findBestOdds(bookOdds, direction);
  
  return {
    modelProb: modelProb,
    marketNoVigProb: marketProb,
    edge: parseFloat(edgePct),
    edgeDecimal: edge,
    
    bestBook: bestBook.name,
    bestOdds: bestBook.odds,
    
    marketConsensus: market,
    
    // Sanity check
    isPositiveEV: edge > 0,
    recommendBet: edge > 0.03 // Minimum 3% true edge threshold
  };
}

/**
 * FIND BEST ODDS ACROSS BOOKS
 */
function findBestOdds(bookOdds, direction) {
  let bestBook = null;
  let bestOdds = direction === 'over' ? -10000 : -10000;
  
  for (const book of bookOdds) {
    const odds = direction === 'over' ? book.overOdds : book.underOdds;
    
    // Higher odds = better for player
    if (odds > bestOdds) {
      bestOdds = odds;
      bestBook = book.name;
    }
  }
  
  return {
    name: bestBook,
    odds: bestOdds
  };
}

/**
 * BATCH PROCESS MULTIPLE LINES
 * 
 * For alt lines (1.5, 2.5, 3.5, etc.), remove vig from each
 */
export function processAltLines(altLinesData) {
  const processed = {};
  
  for (const [line, bookOdds] of Object.entries(altLinesData)) {
    const market = blendMarketProbabilities(bookOdds);
    
    processed[line] = {
      line: parseFloat(line),
      marketOverProb: market.overProb,
      marketUnderProb: market.underProb,
      avgVig: market.avgVig,
      booksUsed: market.booksUsed
    };
  }
  
  return processed;
}

/**
 * SANITY CHECK: Validate odds are reasonable
 */
export function validateOdds(overOdds, underOdds) {
  const checks = {
    valid: true,
    warnings: []
  };
  
  // Check 1: Both odds should be negative or one positive
  if (overOdds > 0 && underOdds > 0) {
    checks.warnings.push('Both sides have positive odds - suspicious');
  }
  
  // Check 2: Implied probabilities should sum to >1.0 (bookmaker margin)
  const total = oddsToProb(overOdds) + oddsToProb(underOdds);
  if (total < 1.0) {
    checks.valid = false;
    checks.warnings.push(`Implied probabilities sum to ${total.toFixed(3)} - should be >1.0`);
  }
  
  // Check 3: Vig should be reasonable (2-15%)
  const vig = (total - 1.0) * 100;
  if (vig < 2 || vig > 15) {
    checks.warnings.push(`Vig is ${vig.toFixed(1)}% - outside typical 2-15% range`);
  }
  
  // Check 4: Neither side should be extreme
  if (overOdds < -1000 || underOdds < -1000) {
    checks.warnings.push('Extreme odds detected - verify data quality');
  }
  
  return checks;
}

/**
 * EXAMPLE USAGE
 */
export function exampleUsage() {
  // Mock odds from 3 sportsbooks for Connor McDavid O2.5 SOG
  const bookOdds = [
    { name: 'DraftKings', overOdds: -145, underOdds: +120 },
    { name: 'FanDuel', overOdds: -140, underOdds: +115 },
    { name: 'BetMGM', overOdds: -150, underOdds: +125 }
  ];
  
  // Model predicts 62% chance of over
  const modelProb = 0.62;
  
  // Calculate true edge
  const analysis = calculateTrueEdge(modelProb, bookOdds, 'over');
  
  console.log('\n📊 NO-VIG EDGE ANALYSIS');
  console.log('='.repeat(50));
  console.log(`Model Probability: ${(modelProb * 100).toFixed(1)}%`);
  console.log(`Market No-Vig Prob: ${(analysis.marketNoVigProb * 100).toFixed(1)}%`);
  console.log(`TRUE Edge: ${analysis.edge}%`);
  console.log(`Best Book: ${analysis.bestBook} (${analysis.bestOdds})`);
  console.log(`Avg Market Vig: ${analysis.marketConsensus.avgVig.toFixed(2)}%`);
  console.log(`Recommendation: ${analysis.recommendBet ? 'BET ✅' : 'PASS ❌'}`);
  console.log('='.repeat(50) + '\n');
  
  return analysis;
}

// Run example if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleUsage();
}
