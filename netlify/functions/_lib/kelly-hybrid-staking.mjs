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
  MAX_UNITS_PER_BET: 8.0,              // Absolute maximum for ML/Spread
  MAX_UNITS_TOTALS: 7.5,               // Max for elite totals (7U for standard)
  MAX_MULTIPLIER_VS_BASE: 3.0,         // Can't bet more than 3.0x Half-Kelly base (updated with cap)
  MIN_KELLY_RAW_THRESHOLD: 0.10,       // Don't bet if full Kelly < 0.10U
  MIN_UNITS_FLOOR: 0.25,               // Minimum bet size (if kelly base >= 0.15U)
  MIN_BASE_FOR_FLOOR: 0.15,            // Only apply floor if base >= this
  
  // Multiplier clamps
  MIN_MULTIPLIER: 0.7,                 // Can't reduce below 70% of base
  MAX_MULTIPLIER: 2.5,                 // Can't exceed 2.5x base
  
  // Exposure guards (450U bankroll)
  MAX_DAILY_STAKE_SUM: 112.5,          // 25% of 450U bankroll
  MAX_EXPOSURE_PER_GAME: 15.0,         // 10U ML/spread + 5U total
  MAX_EXPOSURE_SIDES: 10.0,            // ML + Spread combined max 10U
  
  // High-stakes gate (CLV proxy required for bets >6U)
  HIGH_STAKES_THRESHOLD: 6.0,          // Require CLV proxy above this
  CLV_PROXY_LINE_MOVE_MIN: 0.5,        // Need line moved 0.5+ pts in our favor
  CLV_PROXY_SMART_MONEY_MIN: 60        // Need 60%+ smart money (handle) on our side
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
 * Check CLV proxy gate for high-stakes bets (>6U)
 * Since we don't have true CLV tracking, we use market signals as proxy:
 * - Line moved in our favor (we're getting better number than open)
 * - Smart money (high handle %, low ticket %) agrees with our side
 * - No reverse steam (recent line movement against us)
 */
export function checkHighStakesCLVGate(proposedUnits, signals) {
  // Only check if bet is above high-stakes threshold
  if (proposedUnits <= STAKING_LIMITS.HIGH_STAKES_THRESHOLD) {
    return { allowed: true, reason: 'Below high-stakes threshold' };
  }
  
  const violations = [];
  
  // Check 1: Line moved in our favor
  const hasLineMoveInFavor = (signals.lineMoveToward || 0) >= STAKING_LIMITS.CLV_PROXY_LINE_MOVE_MIN;
  if (!hasLineMoveInFavor) {
    violations.push({
      type: 'LINE_MOVEMENT',
      required: `>=${STAKING_LIMITS.CLV_PROXY_LINE_MOVE_MIN} pts in our favor`,
      actual: signals.lineMoveToward || 0,
      message: 'Line has not moved in our favor (no CLV proxy)'
    });
  }
  
  // Check 2: Smart money agrees (high handle %, indicating sharp action)
  const hasSmartMoneySupport = (signals.handlePct || 0) >= STAKING_LIMITS.CLV_PROXY_SMART_MONEY_MIN;
  if (!hasSmartMoneySupport) {
    violations.push({
      type: 'SMART_MONEY',
      required: `>=${STAKING_LIMITS.CLV_PROXY_SMART_MONEY_MIN}% handle on our side`,
      actual: signals.handlePct || 0,
      message: 'Smart money not backing this side (no sharp support)'
    });
  }
  
  // Check 3: No reverse steam (line hasn't moved against us recently)
  const hasReverseSteam = (signals.recentLineMoveAgainst || 0) > 0.3;
  if (hasReverseSteam) {
    violations.push({
      type: 'REVERSE_STEAM',
      threshold: '0.3 pts against us',
      actual: signals.recentLineMoveAgainst || 0,
      message: 'Line moving against us recently (reverse steam detected)'
    });
  }
  
  const allowed = violations.length === 0;
  
  return {
    allowed,
    violations,
    reason: allowed 
      ? `CLV proxy passed: line moved ${signals.lineMoveToward || 0} pts in favor, ${signals.handlePct || 0}% smart money`
      : `High-stakes bet (${proposedUnits.toFixed(1)}U) blocked by CLV gate: ${violations.map(v => v.message).join('; ')}`
  };
}

/**
 * Recommend units with full audit trail
 * This is the main function to call for bet sizing
 */
export function recommendUnits(edgeProb, priceDec, signals, bankrollUnits = 10, betType = 'spread') {
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
  
  // Apply market-specific caps
  // Total bets: 7.5U max for elite (raw >8U), 7U for standard
  // ML/Spread: 8U max individual
  let capAbsolute;
  if (betType === 'total') {
    // Elite totals can go to 7.5U if raw Kelly suggests >8U
    capAbsolute = rawStake >= 8.0 ? STAKING_LIMITS.MAX_UNITS_TOTALS : 7.0;
  } else {
    // ML and Spread use standard 8U max
    capAbsolute = STAKING_LIMITS.MAX_UNITS_PER_BET;
  }
  
  const capVsBase = STAKING_LIMITS.MAX_MULTIPLIER_VS_BASE * baseHalfKellyU;
  const cap = Math.min(capVsBase, capAbsolute);
  
  let finalUnits = Math.min(cap, rawStake);
  
  // Apply floor (only if base is substantial enough)
  if (baseHalfKellyU >= STAKING_LIMITS.MIN_BASE_FOR_FLOOR && 
      finalUnits > 0 && 
      finalUnits < STAKING_LIMITS.MIN_UNITS_FLOOR) {
    finalUnits = STAKING_LIMITS.MIN_UNITS_FLOOR;
  }
  
  // Round to 0.1U for clean UX
  finalUnits = Math.round(finalUnits * 10) / 10;
  
  // Check CLV proxy gate for high-stakes bets (>6U)
  const clvGateCheck = checkHighStakesCLVGate(finalUnits, signals);
  if (!clvGateCheck.allowed) {
    return {
      units: 0,
      recommendation: 'PASS',
      reason: clvGateCheck.reason,
      violations: clvGateCheck.violations,
      audit: {
        kellyRawU: +kellyRawU.toFixed(3),
        baseHalfKellyU: +baseHalfKellyU.toFixed(3),
        rawMultiplier: +multiplierResult.rawMultiplier.toFixed(3),
        clampedMultiplier: +multiplier.toFixed(3),
        rawStake: +rawStake.toFixed(3),
        proposedUnits: +finalUnits.toFixed(1),
        betType,
        clvGateFailed: true,
        signals
      }
    };
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
  if (clvGateCheck.reason && finalUnits > STAKING_LIMITS.HIGH_STAKES_THRESHOLD) {
    reasons.push(`CLV proxy: ${clvGateCheck.reason}`);
  }
  
  return {
    units: +finalUnits.toFixed(1),  // Round to 0.1U
    recommendation,
    reason: reasons.join(' | '),
    betType,
    audit: {
      kellyRawU: +kellyRawU.toFixed(3),
      baseHalfKellyU: +baseHalfKellyU.toFixed(3),
      rawMultiplier: +multiplierResult.rawMultiplier.toFixed(3),
      clampedMultiplier: +multiplier.toFixed(3),
      rawStake: +rawStake.toFixed(3),
      cap: +cap.toFixed(1),
      finalUnits: +finalUnits.toFixed(1),
      betType,
      marketSpecificCap: capAbsolute,
      clvGatePassed: clvGateCheck.allowed,
      appliedFactors: multiplierResult.appliedFactors,
      appliedPenalties: multiplierResult.appliedPenalties,
      signals
    }
  };
}

/**
 * Check exposure guards (daily and per-game limits)
 * Structure: 10U ML/spread combined, +5U total (15U max per game), 112.5U daily
 * Call this before finalizing a bet to ensure you're not over-exposed
 */
export function checkExposureLimits(proposedUnits, proposedBetType, existingBets, gameId, date) {
  // Calculate daily total
  const dailyBets = existingBets.filter(bet => bet.date === date);
  const dailyTotal = dailyBets.reduce((sum, bet) => sum + bet.units, 0);
  const newDailyTotal = dailyTotal + proposedUnits;
  
  // Calculate per-game totals by market type
  const gameBets = existingBets.filter(bet => bet.gameId === gameId);
  const gameTotal = gameBets.reduce((sum, bet) => sum + bet.units, 0);
  const newGameTotal = gameTotal + proposedUnits;
  
  // Separate ML/spread from totals
  const sidesTotal = gameBets
    .filter(bet => bet.betType === 'moneyline' || bet.betType === 'spread')
    .reduce((sum, bet) => sum + bet.units, 0);
  const totalsTotal = gameBets
    .filter(bet => bet.betType === 'total')
    .reduce((sum, bet) => sum + bet.units, 0);
  
  const newSidesTotal = proposedBetType === 'total' ? sidesTotal : sidesTotal + proposedUnits;
  const newTotalsTotal = proposedBetType === 'total' ? totalsTotal + proposedUnits : totalsTotal;
  
  const violations = [];
  
  // Check daily limit (112.5U = 25% of 450U bankroll)
  if (newDailyTotal > STAKING_LIMITS.MAX_DAILY_STAKE_SUM) {
    violations.push({
      type: 'DAILY_LIMIT',
      current: +dailyTotal.toFixed(1),
      proposed: +proposedUnits.toFixed(1),
      newTotal: +newDailyTotal.toFixed(1),
      limit: STAKING_LIMITS.MAX_DAILY_STAKE_SUM,
      excess: +(newDailyTotal - STAKING_LIMITS.MAX_DAILY_STAKE_SUM).toFixed(1)
    });
  }
  
  // Check per-game total limit (15U = 10U sides + 5U totals)
  if (newGameTotal > STAKING_LIMITS.MAX_EXPOSURE_PER_GAME) {
    violations.push({
      type: 'GAME_LIMIT',
      current: +gameTotal.toFixed(1),
      proposed: +proposedUnits.toFixed(1),
      newTotal: +newGameTotal.toFixed(1),
      limit: STAKING_LIMITS.MAX_EXPOSURE_PER_GAME,
      excess: +(newGameTotal - STAKING_LIMITS.MAX_EXPOSURE_PER_GAME).toFixed(1)
    });
  }
  
  // Check ML/Spread combined limit (10U max)
  if (newSidesTotal > STAKING_LIMITS.MAX_EXPOSURE_SIDES) {
    violations.push({
      type: 'SIDES_LIMIT',
      current: +sidesTotal.toFixed(1),
      proposed: proposedBetType === 'total' ? 0 : +proposedUnits.toFixed(1),
      newTotal: +newSidesTotal.toFixed(1),
      limit: STAKING_LIMITS.MAX_EXPOSURE_SIDES,
      excess: +(newSidesTotal - STAKING_LIMITS.MAX_EXPOSURE_SIDES).toFixed(1),
      message: 'ML + Spread combined cannot exceed 10U per game'
    });
  }
  
  return {
    allowed: violations.length === 0,
    violations,
    dailyUsage: {
      current: +dailyTotal.toFixed(1),
      proposed: +newDailyTotal.toFixed(1),
      limit: STAKING_LIMITS.MAX_DAILY_STAKE_SUM,
      remaining: +Math.max(0, STAKING_LIMITS.MAX_DAILY_STAKE_SUM - newDailyTotal).toFixed(1)
    },
    gameUsage: {
      current: +gameTotal.toFixed(1),
      proposed: +newGameTotal.toFixed(1),
      limit: STAKING_LIMITS.MAX_EXPOSURE_PER_GAME,
      remaining: +Math.max(0, STAKING_LIMITS.MAX_EXPOSURE_PER_GAME - newGameTotal).toFixed(1)
    },
    sidesUsage: {
      current: +sidesTotal.toFixed(1),
      proposed: +newSidesTotal.toFixed(1),
      limit: STAKING_LIMITS.MAX_EXPOSURE_SIDES,
      remaining: +Math.max(0, STAKING_LIMITS.MAX_EXPOSURE_SIDES - newSidesTotal).toFixed(1)
    },
    totalsUsage: {
      current: +totalsTotal.toFixed(1),
      proposed: +newTotalsTotal.toFixed(1),
      limit: 5.0,  // Totals get +5U on top of sides
      remaining: +Math.max(0, 5.0 - newTotalsTotal).toFixed(1)
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
  checkHighStakesCLVGate,
  buildSignalsFromContext,
  trackPerformance,
  MULTIPLIER_FACTORS,
  PENALTY_FACTORS,
  STAKING_LIMITS
};
