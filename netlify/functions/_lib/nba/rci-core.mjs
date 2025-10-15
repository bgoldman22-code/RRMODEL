/**
 * NBA RCI Core Calculation
 * 
 * Single source of truth for RCI adjustments.
 * Used by:
 * - Production predictions (netlify functions)
 * - Backtesting scripts
 * - Grid search optimization
 * 
 * Version: 1.0 (Optimized Oct 14, 2025)
 */

// OPTIMIZED CONSTANTS (Grid search on 3,965 games)
export const RCI_CONSTANTS = {
  ALPHA_OFF: 20.0,        // Pts/100 per 1.0 RCI delta (offense)
  ALPHA_DEF: 5.0,         // Pts/100 per 1.0 RCI delta (defense)
  HALF_LIFE: 28,          // Games until chemistry penalty halves
  RCI_CENTER: 0.75,       // League median RCI
  ASYMMETRY_LOSS: 1.2,    // Losses hurt 20% more
  ASYMMETRY_GAIN: 0.8,    // Gains help 20% less
  NET_CAP: 12.0,          // Max |ΔNet| pts/100 (prevent runaway)
};

/**
 * Calculate RCI adjustment deltas
 * 
 * This is the CANONICAL implementation - all other code should call this.
 * 
 * @param {number} rci - Team's RCI value (0-1, e.g., 0.321 for PHI)
 * @param {number} gamesPlayed - Games played this season (0-82)
 * @returns {Object} - { deltaOff, deltaDef, deltaNet, metadata }
 */
export function calculateRCIDeltas(rci, gamesPlayed) {
  const {
    ALPHA_OFF,
    ALPHA_DEF,
    HALF_LIFE,
    RCI_CENTER,
    ASYMMETRY_LOSS,
    ASYMMETRY_GAIN,
    NET_CAP
  } = RCI_CONSTANTS;
  
  // If no RCI data, return zeros
  if (rci == null || isNaN(rci)) {
    return {
      deltaOff: 0,
      deltaDef: 0,
      deltaNet: 0,
      metadata: { rci: null, skipped: true }
    };
  }
  
  // Calculate RCI delta from league median
  const rciDelta = rci - RCI_CENTER;
  
  // Asymmetry: losses hurt more than gains help
  const asymmetry = rciDelta < 0 ? ASYMMETRY_LOSS : ASYMMETRY_GAIN;
  
  // Chemistry decay (exponential with half-life)
  // Game 0: 100% impact, Game HALF_LIFE: 50% impact
  const decay = Math.pow(2, -gamesPlayed / HALF_LIFE);
  
  // Calculate raw deltas (points per 100 possessions)
  // Positive deltaOff = better offense
  // Positive deltaDef = WORSE defense (we'll negate when applying)
  let deltaOff = ALPHA_OFF * rciDelta * asymmetry * decay;
  let deltaDef = ALPHA_DEF * rciDelta * asymmetry * decay;
  
  // Calculate net effect
  // Net = Off improvement - Def worsening
  // Example: low RCI team
  //   deltaOff = -5 (worse offense)
  //   deltaDef = -1 (worse defense, will be negated to +1 DefRtg)
  //   deltaNet = -5 - (-1) = -6 (team is -6 NetRtg worse)
  const deltaNet = deltaOff - deltaDef;
  
  // Apply NET_CAP to prevent runaway adjustments
  const capHit = Math.abs(deltaNet) > NET_CAP;
  if (capHit) {
    const scale = NET_CAP / Math.abs(deltaNet);
    deltaOff *= scale;
    deltaDef *= scale;
  }
  
  return {
    deltaOff,           // Add to OffRtg
    deltaDef,           // NEGATE then add to DefRtg (deltaDef is positive when RCI high)
    deltaNet: deltaOff - deltaDef,  // Net impact on team
    metadata: {
      rci,
      rciDelta,
      asymmetry,
      decay,
      gamesPlayed,
      capHit,
      rawNet: deltaNet,
    }
  };
}

/**
 * Apply RCI adjustments to team stats
 * 
 * @param {Object} stats - { offRtg, defRtg, netRtg, pace, games }
 * @param {number} rci - Team's RCI value (or null if not available)
 * @param {number} gamesPlayed - Games played this season
 * @returns {Object} - Adjusted stats with same structure
 */
export function applyRCIToStats(stats, rci, gamesPlayed) {
  const { deltaOff, deltaDef, metadata } = calculateRCIDeltas(rci, gamesPlayed);
  
  // Apply adjustments
  // OffRtg: Add deltaOff (positive = better)
  // DefRtg: Subtract deltaDef (deltaDef positive means team is better, so lower DefRtg)
  const offRtg = stats.offRtg + deltaOff;
  const defRtg = stats.defRtg - deltaDef;
  const netRtg = offRtg - defRtg;
  
  return {
    offRtg,
    defRtg,
    netRtg,
    pace: stats.pace,
    games: stats.games,
    // Include RCI metadata for debugging
    _rciDeltaOff: deltaOff,
    _rciDeltaDef: deltaDef,
    _rciMetadata: metadata,
  };
}

/**
 * Format RCI adjustment for logging
 */
export function formatRCILog(teamAbbr, rci, gamesPlayed) {
  const { deltaOff, deltaDef, deltaNet, metadata } = calculateRCIDeltas(rci, gamesPlayed);
  
  return {
    team: teamAbbr,
    rci: rci?.toFixed(3) || 'N/A',
    rciDelta: metadata.rciDelta?.toFixed(3) || '0.000',
    gamesPlayed,
    deltaOff: deltaOff.toFixed(2),
    deltaDef: deltaDef.toFixed(2),
    deltaNet: deltaNet.toFixed(2),
    decay: (metadata.decay * 100).toFixed(1) + '%',
    capHit: metadata.capHit || false,
  };
}

/**
 * Unit tests - run these to validate consistency
 */
export function runRCITests() {
  const tests = [];
  
  // Test 1: BOS example (RCI = 0.670, game 0)
  const bos0 = calculateRCIDeltas(0.670, 0);
  tests.push({
    name: 'BOS @ game 0',
    expected: { deltaOff: -1.92, deltaDef: -0.48, deltaNet: -1.44 },
    actual: { 
      deltaOff: bos0.deltaOff.toFixed(2), 
      deltaDef: bos0.deltaDef.toFixed(2),
      deltaNet: bos0.deltaNet.toFixed(2)
    },
    pass: Math.abs(bos0.deltaOff - (-1.92)) < 0.01
  });
  
  // Test 2: BOS @ game 14 (HALF_LIFE=28, so 14 games = ~71% remaining)
  const bos14 = calculateRCIDeltas(0.670, 14);
  tests.push({
    name: 'BOS @ game 14 (~71% remaining)',
    expected: { decay: 0.71 },
    actual: { decay: bos14.metadata.decay.toFixed(2) },
    pass: Math.abs(bos14.metadata.decay - 0.707) < 0.01  // 2^(-14/28) = 0.707
  });
  
  // Test 3: BOS @ game 28 (HALF_LIFE=28, so 28 games = 50% remaining)
  const bos28 = calculateRCIDeltas(0.670, 28);
  tests.push({
    name: 'BOS @ game 28 (50% remaining)',
    expected: { decay: 0.50 },
    actual: { decay: bos28.metadata.decay.toFixed(2) },
    pass: Math.abs(bos28.metadata.decay - 0.50) < 0.01
  });
  
  // Test 4: PHI (low RCI=0.321, big penalty, but capped)
  const phi0 = calculateRCIDeltas(0.321, 0);
  tests.push({
    name: 'PHI @ game 0 (low RCI, capped)',
    expected: { deltaNet: '-7 to -8' },
    actual: { deltaNet: phi0.deltaNet.toFixed(2) },
    pass: phi0.deltaNet < -7 && phi0.deltaNet > -9  // Should be strongly negative
  });
  
  // Test 5: OKC (high RCI, bonus)
  const okc0 = calculateRCIDeltas(0.961, 0);
  tests.push({
    name: 'OKC @ game 0 (high RCI)',
    expected: { deltaNet: 'positive' },
    actual: { deltaNet: okc0.deltaNet.toFixed(2) },
    pass: okc0.deltaNet > 0  // Should be positive
  });
  
  // Test 6: Asymmetry check
  const low = calculateRCIDeltas(0.50, 0);  // -0.25 from center
  const high = calculateRCIDeltas(1.00, 0); // +0.25 from center
  tests.push({
    name: 'Asymmetry (losses > gains)',
    expected: { ratio: '1.2/0.8 = 1.5' },
    actual: { ratio: (Math.abs(low.deltaNet) / Math.abs(high.deltaNet)).toFixed(2) },
    pass: Math.abs(low.deltaNet) > Math.abs(high.deltaNet)
  });
  
  // Test 7: Net cap check
  const extreme = calculateRCIDeltas(0.0, 0);  // Extreme low RCI
  tests.push({
    name: 'Net cap @ ±12',
    expected: { capHit: true, net: '±12' },
    actual: { 
      capHit: extreme.metadata.capHit,
      net: Math.abs(extreme.deltaNet).toFixed(1)
    },
    pass: extreme.metadata.capHit && Math.abs(extreme.deltaNet) <= 12.01
  });
  
  return tests;
}

/**
 * Run tests and print results
 */
export function validateRCIImplementation() {
  console.log('\n🧪 RCI Implementation Tests\n');
  console.log('='.repeat(70));
  
  const tests = runRCITests();
  let passed = 0;
  
  for (const test of tests) {
    const status = test.pass ? '✅' : '❌';
    console.log(`\n${status} ${test.name}`);
    console.log(`   Expected: ${JSON.stringify(test.expected)}`);
    console.log(`   Actual:   ${JSON.stringify(test.actual)}`);
    if (test.pass) passed++;
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ${passed}/${tests.length} tests passed\n`);
  
  return { passed, total: tests.length, allPassed: passed === tests.length };
}
