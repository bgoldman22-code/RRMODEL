// netlify/functions/_lib/elite-injury-penalty-calculator.mjs
// ELITE INJURY PENALTY SYSTEM
// Battle-tested practices from sharp models:
// 1. Scenario-based availability (not binary OUT/IN)
// 2. Diminishing returns within units
// 3. Unit-level caps (prevent runaway totals)
// 4. Interaction terms (nonlinear combos)
// 5. Offense/Defense split (proper surface mapping)
// 6. Market sanity guardrails

/**
 * AVAILABILITY MAP
 * Convert injury status to expected availability (0-1 scale)
 * Factors in both probability of playing AND expected snap share
 */
export const AVAILABILITY = {
  OUT: 0.0,
  DOUBTFUL: 0.15,        // 15-25% chance, limited snaps if active
  QUESTIONABLE: 0.50,    // 40-60% expected contribution
  LIMITED_PRACTICE: 0.75, // 70-85% expected contribution
  FULL_PRACTICE: 0.95,   // 95%+ expected contribution
  ACTIVE: 1.0
};

/**
 * POSITIONAL PRIORS (Points Above Replacement per game)
 * Based on historical EPA → spread calibration
 * These represent FULL GAME healthy contribution vs replacement
 */
export const POSITIONAL_PAR = {
  // Offense
  QB: 5.5,      // Elite QB above replacement (cap: 7-8 pts)
  WR1: 1.8,     // WR1 contribution
  WR2: 1.2,     // WR2 contribution  
  WR3: 0.8,     // WR3 contribution
  TE1: 1.2,     // TE1 contribution
  TE2: 0.6,     // TE2 contribution
  RB1: 1.5,     // RB1 (elite backs)
  RB2: 0.8,     // RB2 contribution
  LT: 1.5,      // Left Tackle (blindside protection)
  RT: 1.0,      // Right Tackle
  LG: 0.8,      // Left Guard
  C: 0.9,       // Center (calls protection)
  RG: 0.7,      // Right Guard
  
  // Defense
  EDGE1: 1.5,   // Elite pass rusher
  EDGE2: 1.0,   // Secondary edge
  DT1: 1.2,     // Elite interior DL
  DT2: 0.7,     // Rotational DT
  LB1: 1.0,     // Elite LB (coverage/run)
  LB2: 0.6,     // Secondary LB
  CB1: 1.4,     // Elite corner
  CB2: 1.0,     // CB2
  CB3: 0.6,     // Slot/CB3
  S1: 1.0,      // Elite safety
  S2: 0.7       // Secondary safety
};

/**
 * DIMINISHING RETURNS WEIGHTS
 * Multiple injuries in same unit don't stack linearly
 * 1st injury = 100%, 2nd = 70%, 3rd = 50%, 4th+ = 35%
 */
export const DIMINISHING_WEIGHTS = [1.0, 0.7, 0.5, 0.35];

/**
 * UNIT CAPS (prevent runaway totals)
 * Based on historical line movements vs injury news
 */
export const UNIT_CAPS = {
  QB: 7.5,              // Rarely more unless elite → backup + scheme break
  WR_ROOM: 3.5,         // Combined WR impact
  TE_ROOM: 2.0,         // Combined TE impact
  PASS_CATCHERS: 4.5,   // WR + TE combined cap
  RB_ROOM: 2.5,         // RB depth impact
  OL_ROOM: 4.0,         // OL cluster injuries
  EDGE_ROOM: 3.5,       // Pass rush impact
  DL_ROOM: 4.0,         // Defensive line total
  LB_ROOM: 2.5,         // LB corps
  SECONDARY: 4.0,       // CB + S combined
  
  // Global caps
  OFFENSE_NON_QB: 10.0, // Non-QB offensive penalty cap
  DEFENSE_TOTAL: 10.0,  // Total defensive penalty cap
  TEAM_TOTAL: 14.0      // Absolute team cap (extreme cases: 15-16)
};

/**
 * INTERACTION MULTIPLIERS
 * Certain combos hit harder than sum
 */
export const INTERACTIONS = {
  QB_AND_LT: 1.2,           // QB + LT blindside protection
  WR1_AND_TE1: 1.15,        // Both top pass catchers in 12-personnel
  TWO_CBS_VS_ELITE_QB: 1.2, // Secondary decimated vs elite passer
  OL_CLUSTER_3PLUS: 1.25    // 3+ OL injuries compounds
};

/**
 * Calculate unit penalty with diminishing returns
 */
function calculateUnitPenalty(penaltyValues, unitCap) {
  if (!penaltyValues || penaltyValues.length === 0) return 0;
  
  // Sort penalties highest to lowest
  const sorted = [...penaltyValues].sort((a, b) => b - a);
  
  let total = 0;
  for (let i = 0; i < sorted.length && i < DIMINISHING_WEIGHTS.length; i++) {
    total += sorted[i] * DIMINISHING_WEIGHTS[i];
  }
  
  // Apply unit cap
  return Math.min(total, unitCap);
}

/**
 * Map injury status string to availability value
 */
function getAvailability(status) {
  if (!status) return AVAILABILITY.ACTIVE;
  
  const upper = status.toUpperCase();
  if (upper.includes('OUT')) return AVAILABILITY.OUT;
  if (upper.includes('DOUBTFUL')) return AVAILABILITY.DOUBTFUL;
  if (upper.includes('QUESTIONABLE')) return AVAILABILITY.QUESTIONABLE;
  if (upper.includes('LIMITED')) return AVAILABILITY.LIMITED_PRACTICE;
  
  return AVAILABILITY.ACTIVE;
}

/**
 * Calculate offensive penalty with scenario-based availability
 */
export function calculateOffensivePenalty(injuries) {
  const wrPenalties = [];
  const tePenalties = [];
  const rbPenalties = [];
  const olPenalties = [];
  
  let qbPenalty = 0;
  let ltPenalty = 0;
  
  // Process each injury
  for (const injury of injuries) {
    const pos = injury.position?.toUpperCase();
    const availability = getAvailability(injury.status);
    const penaltyFactor = 1 - availability; // How much we lose (0-1)
    
    // QB (special handling with cap)
    if (pos === 'QB') {
      const qbPAR = POSITIONAL_PAR.QB;
      qbPenalty = Math.min(penaltyFactor * qbPAR, UNIT_CAPS.QB);
      continue;
    }
    
    // WRs
    if (pos === 'WR') {
      const parKey = injury.isWR1 ? 'WR1' : injury.isWR2 ? 'WR2' : 'WR3';
      wrPenalties.push(penaltyFactor * POSITIONAL_PAR[parKey]);
      continue;
    }
    
    // TEs
    if (pos === 'TE') {
      const parKey = injury.isTE1 ? 'TE1' : 'TE2';
      tePenalties.push(penaltyFactor * POSITIONAL_PAR[parKey]);
      continue;
    }
    
    // RBs
    if (pos === 'RB') {
      const parKey = injury.isRB1 ? 'RB1' : 'RB2';
      rbPenalties.push(penaltyFactor * POSITIONAL_PAR[parKey]);
      continue;
    }
    
    // OL
    if (['LT', 'RT', 'LG', 'RG', 'C'].includes(pos)) {
      const penalty = penaltyFactor * POSITIONAL_PAR[pos];
      olPenalties.push(penalty);
      if (pos === 'LT') ltPenalty = penalty;
      continue;
    }
  }
  
  // Apply unit-level diminishing returns and caps
  const wrPenalty = calculateUnitPenalty(wrPenalties, UNIT_CAPS.WR_ROOM);
  const tePenalty = calculateUnitPenalty(tePenalties, UNIT_CAPS.TE_ROOM);
  const rbPenalty = calculateUnitPenalty(rbPenalties, UNIT_CAPS.RB_ROOM);
  const olPenalty = calculateUnitPenalty(olPenalties, UNIT_CAPS.OL_ROOM);
  
  // Combine WR + TE with pass catchers cap
  const passCatchersPenalty = Math.min(
    wrPenalty + tePenalty, 
    UNIT_CAPS.PASS_CATCHERS
  );
  
  // Calculate interactions
  let interactionBonus = 0;
  
  // QB + LT interaction
  if (qbPenalty > 0 && ltPenalty > 0) {
    interactionBonus += (INTERACTIONS.QB_AND_LT - 1.0) * Math.min(qbPenalty + ltPenalty, 3.0);
  }
  
  // WR1 + TE1 interaction (if both have penalties)
  if (wrPenalties.length > 0 && tePenalties.length > 0) {
    const wr1Pen = wrPenalties[0] || 0;
    const te1Pen = tePenalties[0] || 0;
    if (wr1Pen > 0.5 && te1Pen > 0.5) {
      interactionBonus += (INTERACTIONS.WR1_AND_TE1 - 1.0) * Math.min(wr1Pen + te1Pen, 2.0);
    }
  }
  
  // OL cluster interaction (3+ injuries)
  if (olPenalties.length >= 3) {
    interactionBonus += (INTERACTIONS.OL_CLUSTER_3PLUS - 1.0) * olPenalty;
  }
  
  // Sum non-QB penalties
  const nonQBPenalty = passCatchersPenalty + rbPenalty + olPenalty + interactionBonus;
  const cappedNonQB = Math.min(nonQBPenalty, UNIT_CAPS.OFFENSE_NON_QB);
  
  // Total offensive penalty with global cap
  const totalPenalty = Math.min(
    qbPenalty + cappedNonQB,
    UNIT_CAPS.TEAM_TOTAL
  );
  
  return {
    total: +totalPenalty.toFixed(2),
    breakdown: {
      qb: +qbPenalty.toFixed(2),
      passCatchers: +passCatchersPenalty.toFixed(2),
      wr: +wrPenalty.toFixed(2),
      te: +tePenalty.toFixed(2),
      rb: +rbPenalty.toFixed(2),
      ol: +olPenalty.toFixed(2),
      interactions: +interactionBonus.toFixed(2),
      cappedAt: totalPenalty >= UNIT_CAPS.TEAM_TOTAL - 0.1 ? 'TEAM_TOTAL' : null
    }
  };
}

/**
 * Calculate defensive penalty with scenario-based availability
 */
export function calculateDefensivePenalty(injuries) {
  const edgePenalties = [];
  const dlPenalties = [];
  const lbPenalties = [];
  const cbPenalties = [];
  const sPenalties = [];
  
  // Process each injury
  for (const injury of injuries) {
    const pos = injury.position?.toUpperCase();
    const availability = getAvailability(injury.status);
    const penaltyFactor = 1 - availability;
    
    // Edge rushers
    if (pos === 'EDGE' || pos === 'DE') {
      const parKey = injury.isEDGE1 ? 'EDGE1' : 'EDGE2';
      edgePenalties.push(penaltyFactor * POSITIONAL_PAR[parKey]);
      continue;
    }
    
    // DL interior
    if (pos === 'DT' || pos === 'DL') {
      const parKey = injury.isDT1 ? 'DT1' : 'DT2';
      dlPenalties.push(penaltyFactor * POSITIONAL_PAR[parKey]);
      continue;
    }
    
    // Linebackers
    if (pos === 'LB') {
      const parKey = injury.isLB1 ? 'LB1' : 'LB2';
      lbPenalties.push(penaltyFactor * POSITIONAL_PAR[parKey]);
      continue;
    }
    
    // Cornerbacks
    if (pos === 'CB') {
      const parKey = injury.isCB1 ? 'CB1' : injury.isCB2 ? 'CB2' : 'CB3';
      cbPenalties.push(penaltyFactor * POSITIONAL_PAR[parKey]);
      continue;
    }
    
    // Safeties
    if (pos === 'S' || pos === 'FS' || pos === 'SS') {
      const parKey = injury.isS1 ? 'S1' : 'S2';
      sPenalties.push(penaltyFactor * POSITIONAL_PAR[parKey]);
      continue;
    }
  }
  
  // Apply unit-level diminishing returns and caps
  const edgePenalty = calculateUnitPenalty(edgePenalties, UNIT_CAPS.EDGE_ROOM);
  const dlPenalty = calculateUnitPenalty(dlPenalties, UNIT_CAPS.DL_ROOM);
  const lbPenalty = calculateUnitPenalty(lbPenalties, UNIT_CAPS.LB_ROOM);
  const cbPenalty = calculateUnitPenalty(cbPenalties, UNIT_CAPS.SECONDARY);
  const sPenalty = calculateUnitPenalty(sPenalties, UNIT_CAPS.SECONDARY);
  
  // Secondary combined with cap
  const secondaryPenalty = Math.min(cbPenalty + sPenalty, UNIT_CAPS.SECONDARY);
  
  // Calculate interactions
  let interactionBonus = 0;
  
  // Two CBs vs elite QB (would need opponent context)
  if (cbPenalties.length >= 2) {
    // This would be enhanced with opponent QB rating
    interactionBonus += (INTERACTIONS.TWO_CBS_VS_ELITE_QB - 1.0) * Math.min(cbPenalty, 2.5);
  }
  
  // Total defensive penalty with cap
  const totalPenalty = Math.min(
    edgePenalty + dlPenalty + lbPenalty + secondaryPenalty + interactionBonus,
    UNIT_CAPS.DEFENSE_TOTAL
  );
  
  return {
    total: +totalPenalty.toFixed(2),
    breakdown: {
      edge: +edgePenalty.toFixed(2),
      dl: +dlPenalty.toFixed(2),
      lb: +lbPenalty.toFixed(2),
      secondary: +secondaryPenalty.toFixed(2),
      cb: +cbPenalty.toFixed(2),
      s: +sPenalty.toFixed(2),
      interactions: +interactionBonus.toFixed(2),
      cappedAt: totalPenalty >= UNIT_CAPS.DEFENSE_TOTAL - 0.1 ? 'DEFENSE_TOTAL' : null
    }
  };
}

/**
 * Calculate uncertainty factor for Kelly reduction
 * Based on number and severity of questionable tags
 */
export function calculateUncertaintyFactor(injuries) {
  let questionableCount = 0;
  let doubtfulCount = 0;
  let totalImpact = 0;
  
  for (const injury of injuries) {
    const status = injury.status?.toUpperCase() || '';
    const availability = getAvailability(status);
    
    if (status.includes('QUESTIONABLE')) {
      questionableCount++;
      totalImpact += (1 - availability);
    } else if (status.includes('DOUBTFUL')) {
      doubtfulCount++;
      totalImpact += (1 - availability) * 1.5; // Weight doubtful more
    }
  }
  
  // Uncertainty increases with Q/D tags and total impact
  const baseUncertainty = 1.0 - (questionableCount * 0.08 + doubtfulCount * 0.12);
  const impactUncertainty = 1.0 - Math.min(totalImpact * 0.1, 0.3);
  
  // Combined uncertainty (max reduction to 50%)
  return Math.max(0.5, Math.min(baseUncertainty, impactUncertainty));
}

/**
 * Market sanity check
 * Trigger warning if model spread differs >7-8 pts from market
 */
export function checkMarketSanity(modelSpread, marketSpread, injuries) {
  const diff = Math.abs(modelSpread - marketSpread);
  const threshold = 7.5;
  
  if (diff > threshold) {
    return {
      alert: true,
      diff: +diff.toFixed(1),
      message: `Model spread differs ${diff.toFixed(1)} pts from market (threshold: ${threshold})`,
      possibleIssues: [
        'Stale injury status?',
        'Double-counting penalties?',
        'Position value mis-scaled?',
        'Market has info model lacks?'
      ],
      recommendation: 'MANUAL_REVIEW_REQUIRED',
      injuryCount: injuries.length
    };
  }
  
  return { alert: false, diff: +diff.toFixed(1) };
}

/**
 * MAIN FUNCTION: Calculate elite injury adjustment
 */
export function calculateEliteInjuryAdjustment(homeInjuries, awayInjuries, marketSpread = null) {
  // Separate offensive and defensive injuries
  const homeOffInjuries = homeInjuries.filter(inj => 
    ['QB', 'WR', 'TE', 'RB', 'LT', 'RT', 'LG', 'RG', 'C'].includes(inj.position?.toUpperCase())
  );
  const homeDefInjuries = homeInjuries.filter(inj => 
    ['EDGE', 'DE', 'DT', 'DL', 'LB', 'CB', 'S', 'FS', 'SS'].includes(inj.position?.toUpperCase())
  );
  
  const awayOffInjuries = awayInjuries.filter(inj => 
    ['QB', 'WR', 'TE', 'RB', 'LT', 'RT', 'LG', 'RG', 'C'].includes(inj.position?.toUpperCase())
  );
  const awayDefInjuries = awayInjuries.filter(inj => 
    ['EDGE', 'DE', 'DT', 'DL', 'LB', 'CB', 'S', 'FS', 'SS'].includes(inj.position?.toUpperCase())
  );
  
  // Calculate penalties
  const homeOffPenalty = calculateOffensivePenalty(homeOffInjuries);
  const homeDefPenalty = calculateDefensivePenalty(homeDefInjuries);
  const awayOffPenalty = calculateOffensivePenalty(awayOffInjuries);
  const awayDefPenalty = calculateDefensivePenalty(awayDefInjuries);
  
  // Net spread impact (positive = helps home, negative = hurts home)
  // Home loses offense → hurts spread
  // Home loses defense → hurts spread (opponent scores more)
  // Away loses offense → helps spread
  // Away loses defense → helps spread (home scores more)
  const netSpreadImpact = 
    -homeOffPenalty.total     // Home off injuries hurt home
    -homeDefPenalty.total     // Home def injuries hurt home
    +awayOffPenalty.total     // Away off injuries help home
    +awayDefPenalty.total;    // Away def injuries help home
  
  // Calculate uncertainty factors
  const homeUncertainty = calculateUncertaintyFactor(homeInjuries);
  const awayUncertainty = calculateUncertaintyFactor(awayInjuries);
  const combinedUncertainty = Math.min(homeUncertainty, awayUncertainty);
  
  // Market sanity check (if market spread provided)
  let sanityCheck = { alert: false };
  if (marketSpread !== null) {
    const modelSpreadWithInjuries = marketSpread + netSpreadImpact;
    sanityCheck = checkMarketSanity(modelSpreadWithInjuries, marketSpread, [...homeInjuries, ...awayInjuries]);
  }
  
  return {
    netSpreadImpact: +netSpreadImpact.toFixed(2),
    home: {
      offensive: homeOffPenalty,
      defensive: homeDefPenalty,
      total: +(homeOffPenalty.total + homeDefPenalty.total).toFixed(2),
      uncertainty: +homeUncertainty.toFixed(3)
    },
    away: {
      offensive: awayOffPenalty,
      defensive: awayDefPenalty,
      total: +(awayOffPenalty.total + awayDefPenalty.total).toFixed(2),
      uncertainty: +awayUncertainty.toFixed(3)
    },
    stakingReduction: {
      factor: +combinedUncertainty.toFixed(3),
      recommendation: combinedUncertainty < 0.7 ? 'REDUCED_KELLY' : 'NORMAL_KELLY',
      explanation: `Reduce Kelly by ${((1 - combinedUncertainty) * 100).toFixed(0)}% due to injury uncertainty`
    },
    sanityCheck,
    metadata: {
      homeInjuryCount: homeInjuries.length,
      awayInjuryCount: awayInjuries.length,
      questionableTotal: [...homeInjuries, ...awayInjuries].filter(i => 
        i.status?.toUpperCase().includes('QUESTIONABLE')
      ).length
    }
  };
}

export default {
  calculateEliteInjuryAdjustment,
  calculateOffensivePenalty,
  calculateDefensivePenalty,
  calculateUncertaintyFactor,
  checkMarketSanity,
  AVAILABILITY,
  POSITIONAL_PAR,
  UNIT_CAPS,
  INTERACTIONS
};
