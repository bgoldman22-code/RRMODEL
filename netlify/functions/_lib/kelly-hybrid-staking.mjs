// netlify/functions/_lib/kelly-hybrid-staking.mjs
// Explicit Hybrid Kelly Staking System
// Half-Kelly base with capped multipliers and full audit trail

/**
 * STAKING PHILOSOPHY: Explicit Hybrid
 * - Base: Half-Kelly (50% of full Kelly for variance reduction)
 * - Multipliers: Pre-defined signals only (no arbitrary overrides)
 * - Caps: 3.0U max or 2.5x base, whichever is lower
 * - Audit: Every bet logs Kelly base, multipliers, and final stake
 */

/**
 * MULTIPLIER SIGNAL CRITERIA
 * Each factor has specific conditions and multiplier value
 */
export const MULTIPLIER_FACTORS = {
  // Market agreement (line moved toward you or you have CLV)
  MARKET_AGREEMENT: {
    condition: 'CLV >= 0.5 pts OR line moved toward you >= 0.5 pts',
    multiplier: 0.3,
    check: (signals) => (signals.clvPts >= 0.5 || signals.lineMoveToward >= 0.5)
  },
  
  // Smart money split (low ticket %, high handle %)
  SMART_MONEY_SPLIT: {
    condition: 'Tickets < 45% AND Handle >= 60% on your side',
    multiplier: 0.3,
    check: (signals) => (signals.ticketsPct <= 45 && signals.handlePct >= 60)
  },
  
  // High availability confidence (canonical system)
  AVAILABILITY_CONFIDENCE: {
    condition: 'Canonical availability confidence >= 0.85 AND no active market shock',
    multiplier: 0.2,
    check: (signals) => (signals.availabilityConf >= 0.85 && !signals.marketShockActive)
  },
  
  // Fresh injury edge (confirmed within 24 hours)
  FRESH_INJURY_EDGE: {
    condition: 'Depth/injury change confirmed within 24h AND calc > 2 pt swing',
    multiplier: 0.3,
    check: (signals) => (signals.injurySwingPts >= 2 && signals.injuryConfirmedHours <= 24)
  },
  
  // Model edge bucket (higher edge = higher multiplier)
  MODEL_EDGE_HIGH: {
    condition: 'Edge >= 8%',
    multiplier: 0.4,
    check: (signals) => (signals.edgePct >= 8)
  },
  
  MODEL_EDGE_MEDIUM: {
    condition: 'Edge >= 6% (and < 8%)',
    multiplier: 0.2,
    check: (signals) => (signals.edgePct >= 6 && signals.edgePct < 8)
  },
  
  // Cross-model consensus (multiple models agree)
  CROSS_MODEL_CONSENSUS: {
    condition: 'Your R/EPA + another vetted model both same side with >= 55% win each',
    multiplier: 0.2,
    check: (signals) => signals.crossModelAgree
  },
  
  // Contrarian tax (public heavily against you)
  CONTRARIAN_TAX: {
    condition: 'Tickets >= 65% against you',
    multiplier: 0.1,
    check: (signals) => (signals.ticketsAgainst >= 65)
  }
};

/**
 * PENALTY MULTIPLIERS (multiplicative, not additive)
 * Applied AFTER computing additive multipliers
 */
export const PENALTY_FACTORS = {
  // Uncertainty penalty (rookie/unproven QB or market shock)
  UNCERTAINTY_PENALTY: {
    condition: 'Rookie/unproven QB starting OR MARKET_SHOCK active',
    multiplier: 0.8,
    check: (signals) => (signals.rookieOrUnprovenQB || signals.marketShockActive)
  },
  
  // Correlated risk (multiple bets on same game)
  CORRELATED_RISK: {
    condition: '>= 3 bets correlated (same team/total)',
    multiplier: 0.85,
    check: (signals) => (signals.highCorrelation)
  }
};

/**
 * HARD RAILS (non-negotiable limits)
 */
export const STAKING_LIMITS = {
  // Per-bet limits
  MAX_UNITS_PER_BET: 8.0,              // Absolute maximum (boosted from 5U for strongest bets)
  MAX_MULTIPLIER_VS_BASE: 3.0,         // Can't bet more than 3.0x Half-Kelly base (updated with cap)
  MIN_KELLY_RAW_THRESHOLD: 0.10,       // Don't bet if full Kelly < 0.10U
  MIN_UNITS_FLOOR: 0.25,               // Minimum bet size (if kelly base >= 0.15U)
  MIN_BASE_FOR_FLOOR: 0.15,            // Only apply floor if base >= this
  
  // Multiplier clamps
  MIN_MULTIPLIER: 0.7,                 // Can't reduce below 70% of base
  MAX_MULTIPLIER: 2.5,                 // Can't exceed 2.5x base
  
  // Exposure guards
  MAX_DAILY_STAKE_SUM: 12.0,           // Total units per day
  MAX_EXPOSURE_PER_GAME: 5.0           // All markets on same game
};

/**
 * Calculate full Kelly fraction and convert to units
 * Standard Kelly: f = (bp - q) / b
 * where b = decimal odds - 1, p = win probability, q = 1 - p
 */
export function calculateKellyRaw(edgeProb, priceDec, bankrollUnits = 10) {
  const b = priceDec - 1;
  const p = edgeProb;
  const q = 1 - p;
  
  // Kelly fraction (as percentage of bankroll)
  const f = Math.max(0, (b * p - q) / b);
  
  // Convert to units (example: 10U total bankroll)
  const unitsKelly = f * bankrollUnits;
  
  return unitsKelly;
}

/**
 * Calculate Half-Kelly base (variance reduction)
 * Half-Kelly reduces drawdowns by ~50% while maintaining ~75% of full Kelly growth
 */
export function calculateHalfKellyBase(edgeProb, priceDec, bankrollUnits = 10) {
  const kellyRaw = calculateKellyRaw(edgeProb, priceDec, bankrollUnits);
  return 0.5 * kellyRaw;
}

/**
 * Compute multiplier from signals
 * Additive factors summed, then penalties applied multiplicatively, then clamped
 */
export function computeMultiplier(signals) {
  let multiplier = 1.0;
  const appliedFactors = [];
  
  // Add positive factors
  for (const [key, factor] of Object.entries(MULTIPLIER_FACTORS)) {
    if (factor.check(signals)) {
      multiplier += factor.multiplier;
      appliedFactors.push({
        factor: key,
        value: factor.multiplier,
        condition: factor.condition
      });
    }
  }
  
  // Apply penalties (multiplicative)
  const appliedPenalties = [];
  for (const [key, factor] of Object.entries(PENALTY_FACTORS)) {
    if (factor.check(signals)) {
      multiplier *= factor.multiplier;
      appliedPenalties.push({
        factor: key,
        value: factor.multiplier,
        condition: factor.condition
      });
    }
  }
  
  // Clamp to allowed range
  const clampedMultiplier = Math.min(
    STAKING_LIMITS.MAX_MULTIPLIER,
    Math.max(STAKING_LIMITS.MIN_MULTIPLIER, multiplier)
  );
  
  return {
    rawMultiplier: multiplier,
    clampedMultiplier,
    appliedFactors,
    appliedPenalties,
    wasClampedLow: clampedMultiplier === STAKING_LIMITS.MIN_MULTIPLIER && multiplier < STAKING_LIMITS.MIN_MULTIPLIER,
    wasClampedHigh: clampedMultiplier === STAKING_LIMITS.MAX_MULTIPLIER && multiplier > STAKING_LIMITS.MAX_MULTIPLIER
  };
}

/**
 * Recommend units with full audit trail
 * This is the main function to call for bet sizing
 */
export function recommendUnits(edgeProb, priceDec, signals, bankrollUnits = 10) {
  // Calculate Kelly raw (full Kelly before 0.5x)
  const kellyRawU = calculateKellyRaw(edgeProb, priceDec, bankrollUnits);
  
  // Hard floor: Don't bet if Kelly too small
  if (kellyRawU < STAKING_LIMITS.MIN_KELLY_RAW_THRESHOLD) {
    return {
      units: 0,
      recommendation: 'PASS',
      reason: 'kelly_too_small',
      audit: {
        kellyRawU: +kellyRawU.toFixed(3),
        threshold: STAKING_LIMITS.MIN_KELLY_RAW_THRESHOLD,
        edgeProb,
        priceDec
      }
    };
  }
  
  // Calculate Half-Kelly base
  const baseHalfKellyU = calculateHalfKellyBase(edgeProb, priceDec, bankrollUnits);
  
  // Compute multiplier from signals
  const multiplierResult = computeMultiplier(signals);
  const multiplier = multiplierResult.clampedMultiplier;
  
  // Calculate raw stake (before caps)
  const rawStake = baseHalfKellyU * multiplier;
  
  // Apply per-bet caps
  const capVsBase = STAKING_LIMITS.MAX_MULTIPLIER_VS_BASE * baseHalfKellyU;
  const capAbsolute = STAKING_LIMITS.MAX_UNITS_PER_BET;
  const cap = Math.min(capVsBase, capAbsolute);
  
  let finalUnits = Math.min(cap, rawStake);
  
  // Apply floor (only if base is substantial enough)
  if (baseHalfKellyU >= STAKING_LIMITS.MIN_BASE_FOR_FLOOR && 
      finalUnits > 0 && 
      finalUnits < STAKING_LIMITS.MIN_UNITS_FLOOR) {
    finalUnits = STAKING_LIMITS.MIN_UNITS_FLOOR;
  }
  
  // Determine recommendation tier
  let recommendation;
  if (finalUnits >= 2.0) {
    recommendation = 'STRONG_BET';
  } else if (finalUnits >= 1.0) {
    recommendation = 'BET';
  } else if (finalUnits >= 0.5) {
    recommendation = 'VALUE';
  } else if (finalUnits >= 0.25) {
    recommendation = 'LEAN';
  } else {
    recommendation = 'PASS';
  }
  
  // Build reason string
  const reasons = [];
  if (multiplierResult.appliedFactors.length > 0) {
    reasons.push(`Multipliers: ${multiplierResult.appliedFactors.map(f => f.factor).join(', ')}`);
  }
  if (multiplierResult.appliedPenalties.length > 0) {
    reasons.push(`Penalties: ${multiplierResult.appliedPenalties.map(p => p.factor).join(', ')}`);
  }
  if (finalUnits === cap && cap < rawStake) {
    reasons.push(`Capped at ${cap.toFixed(2)}U`);
  }
  if (multiplierResult.wasClampedHigh) {
    reasons.push(`Multiplier clamped at ${STAKING_LIMITS.MAX_MULTIPLIER}x`);
  }
  if (multiplierResult.wasClampedLow) {
    reasons.push(`Multiplier floored at ${STAKING_LIMITS.MIN_MULTIPLIER}x`);
  }
  
  return {
    units: +finalUnits.toFixed(2),
    recommendation,
    reason: reasons.join(' | '),
    audit: {
      kellyRawU: +kellyRawU.toFixed(3),
      baseHalfKellyU: +baseHalfKellyU.toFixed(3),
      rawMultiplier: +multiplierResult.rawMultiplier.toFixed(3),
      clampedMultiplier: +multiplier.toFixed(3),
      rawStake: +rawStake.toFixed(3),
      cap: +cap.toFixed(2),
      finalUnits: +finalUnits.toFixed(2),
      appliedFactors: multiplierResult.appliedFactors,
      appliedPenalties: multiplierResult.appliedPenalties,
      signals
    }
  };
}

/**
 * Check exposure guards (daily and per-game limits)
 * Call this before finalizing a bet to ensure you're not over-exposed
 */
export function checkExposureLimits(proposedUnits, existingBets, gameId, date) {
  // Calculate daily total
  const dailyBets = existingBets.filter(bet => bet.date === date);
  const dailyTotal = dailyBets.reduce((sum, bet) => sum + bet.units, 0);
  const newDailyTotal = dailyTotal + proposedUnits;
  
  // Calculate per-game total
  const gameBets = existingBets.filter(bet => bet.gameId === gameId);
  const gameTotal = gameBets.reduce((sum, bet) => sum + bet.units, 0);
  const newGameTotal = gameTotal + proposedUnits;
  
  const violations = [];
  
  if (newDailyTotal > STAKING_LIMITS.MAX_DAILY_STAKE_SUM) {
    violations.push({
      type: 'DAILY_LIMIT',
      current: dailyTotal,
      proposed: proposedUnits,
      newTotal: newDailyTotal,
      limit: STAKING_LIMITS.MAX_DAILY_STAKE_SUM,
      excess: newDailyTotal - STAKING_LIMITS.MAX_DAILY_STAKE_SUM
    });
  }
  
  if (newGameTotal > STAKING_LIMITS.MAX_EXPOSURE_PER_GAME) {
    violations.push({
      type: 'GAME_LIMIT',
      current: gameTotal,
      proposed: proposedUnits,
      newTotal: newGameTotal,
      limit: STAKING_LIMITS.MAX_EXPOSURE_PER_GAME,
      excess: newGameTotal - STAKING_LIMITS.MAX_EXPOSURE_PER_GAME
    });
  }
  
  return {
    allowed: violations.length === 0,
    violations,
    dailyUsage: {
      current: dailyTotal,
      proposed: newDailyTotal,
      limit: STAKING_LIMITS.MAX_DAILY_STAKE_SUM,
      remaining: Math.max(0, STAKING_LIMITS.MAX_DAILY_STAKE_SUM - newDailyTotal)
    },
    gameUsage: {
      current: gameTotal,
      proposed: newGameTotal,
      limit: STAKING_LIMITS.MAX_EXPOSURE_PER_GAME,
      remaining: Math.max(0, STAKING_LIMITS.MAX_EXPOSURE_PER_GAME - newGameTotal)
    }
  };
}

/**
 * Build signals object from game context and canonical availability
 * This connects the Kelly system to your existing data pipeline
 */
export function buildSignalsFromContext(gameContext, prediction, availabilityData, marketData) {
  const signals = {
    // Market agreement
    clvPts: marketData?.clvPts ?? 0,
    lineMoveToward: marketData?.lineMoveToward ?? 0,
    
    // Smart money split
    ticketsPct: marketData?.ticketsPct ?? 50,
    handlePct: marketData?.handlePct ?? 50,
    ticketsAgainst: 100 - (marketData?.ticketsPct ?? 50),
    
    // Availability confidence (from canonical system)
    availabilityConf: availabilityData?.confidence ?? 0.8,
    marketShockActive: availabilityData?.hasMarketShock ?? false,
    
    // Injury edge
    injurySwingPts: Math.abs(availabilityData?.spreadImpact ?? 0),
    injuryConfirmedHours: availabilityData?.hoursAgo ?? 999,
    
    // Model edge
    edgePct: prediction?.edge ?? 0,
    
    // Cross-model consensus
    crossModelAgree: prediction?.crossModelAgree ?? false,
    
    // Rookie/unproven QB
    rookieOrUnprovenQB: availabilityData?.isRookieOrUnproven ?? false,
    
    // Correlation risk
    highCorrelation: gameContext?.correlatedBetsCount >= 3
  };
  
  return signals;
}

/**
 * Performance tracking: Compare Kelly-only vs Hybrid
 * Call this after each bet resolves to track which approach works better
 */
export function trackPerformance(bet, result) {
  const kellyOnlyUnits = bet.audit.baseHalfKellyU;
  const hybridUnits = bet.units;
  
  const kellyOnlyProfit = result.won ? 
    kellyOnlyUnits * (bet.odds - 1) : 
    -kellyOnlyUnits;
  
  const hybridProfit = result.won ?
    hybridUnits * (bet.odds - 1) :
    -hybridUnits;
  
  return {
    kellyOnly: {
      units: kellyOnlyUnits,
      profit: kellyOnlyProfit,
      roi: kellyOnlyProfit / kellyOnlyUnits
    },
    hybrid: {
      units: hybridUnits,
      profit: hybridProfit,
      roi: hybridProfit / hybridUnits
    },
    delta: {
      profitDiff: hybridProfit - kellyOnlyProfit,
      multiplierApplied: bet.audit.clampedMultiplier,
      wasWorthIt: (hybridProfit > kellyOnlyProfit) === (hybridUnits > kellyOnlyUnits)
    }
  };
}

export default {
  recommendUnits,
  calculateKellyRaw,
  calculateHalfKellyBase,
  computeMultiplier,
  checkExposureLimits,
  buildSignalsFromContext,
  trackPerformance,
  MULTIPLIER_FACTORS,
  PENALTY_FACTORS,
  STAKING_LIMITS
};
