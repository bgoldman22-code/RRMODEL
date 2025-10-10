// netlify/functions/_lib/sizing-gates.mjs
// Pre-bet gates and sizing modifiers based on line movement

import { getMovementMetrics, getRollingCLV, getMedianVolatility } from './line-movement.mjs';

/**
 * Apply all pre-bet gates to a pick
 * Returns { pass: boolean, reason: string, metadata: {} }
 */
export async function applyPreBetGates(pick, gameId) {
  const { market, pick: side } = pick;
  
  // Get movement metrics
  const metrics = await getMovementMetrics(gameId, market, side);
  
  if (!metrics) {
    // No line movement data yet - allow bet with note
    return {
      pass: true,
      reason: 'no_movement_data',
      metadata: {}
    };
  }
  
  // Gate 1: Steam filter
  const steamGate = applySteamGate(metrics, side);
  if (!steamGate.pass) {
    return steamGate;
  }
  
  // Gate 2: Volatility throttle
  const volatilityGate = await applyVolatilityGate(metrics, market);
  if (!volatilityGate.pass) {
    return volatilityGate;
  }
  
  // Gate 3: Key number protection (spreads/totals)
  if (market === 'spread' || market === 'total') {
    const keyNumberGate = applyKeyNumberGate(metrics);
    if (!keyNumberGate.pass) {
      return keyNumberGate;
    }
  }
  
  // All gates passed
  return {
    pass: true,
    reason: 'gates_passed',
    metadata: {
      drift_bps: metrics.drift_bps,
      velocity_30m: metrics.velocity_30m,
      breadth: metrics.breadth,
      volatility_6h: metrics.volatility_6h,
      steam_detected: metrics.steam_detected
    }
  };
}

/**
 * Gate 1: Steam filter
 * Block if broad, fast move against us
 * Boost if broad, fast move with us
 */
function applySteamGate(metrics, ourSide) {
  if (!metrics.steam_detected) {
    return { pass: true, reason: 'no_steam' };
  }
  
  const steamWithUs = metrics.steam_direction === ourSide;
  
  if (!steamWithUs) {
    // Steam against us - BLOCK
    return {
      pass: false,
      reason: 'steam_against',
      metadata: {
        steam_direction: metrics.steam_direction,
        velocity_30m: metrics.velocity_30m,
        breadth: metrics.breadth
      }
    };
  }
  
  // Steam with us - ALLOW (will boost sizing later)
  return {
    pass: true,
    reason: 'steam_with_us',
    metadata: {
      steam_direction: metrics.steam_direction,
      velocity_30m: metrics.velocity_30m,
      breadth: metrics.breadth
    }
  };
}

/**
 * Gate 2: Volatility throttle
 * Block if recent volatility > 2x median
 */
async function applyVolatilityGate(metrics, market) {
  const medianVol = await getMedianVolatility(market);
  const currentVol = metrics.volatility_6h;
  
  if (currentVol > 2.0 * medianVol) {
    return {
      pass: false,
      reason: 'high_volatility',
      metadata: {
        current_volatility: currentVol,
        median_volatility: medianVol,
        ratio: currentVol / medianVol
      }
    };
  }
  
  return { pass: true, reason: 'volatility_ok' };
}

/**
 * Gate 3: Key number protection
 * Block if current line straddles key number
 */
function applyKeyNumberGate(metrics) {
  // Placeholder - needs actual line tracking, not just implied prob
  // Would check if current spread/total is within 0.5 of key number
  
  return { pass: true, reason: 'key_number_ok' };
}

/**
 * Apply sizing modifiers based on line movement and CLV history
 * Returns multiplier (0.5 to 1.5)
 */
export async function applyLineMovementSizingModifiers(pick, gameId, baseUnits) {
  const { market, pick: side } = pick;
  
  // Get movement metrics
  const metrics = await getMovementMetrics(gameId, market, side);
  
  if (!metrics) {
    // No data - return base with uncertainty haircut
    return {
      multiplier: 0.85,
      final_units: baseUnits * 0.85,
      reasons: ['no_movement_data_haircut']
    };
  }
  
  let multiplier = 1.0;
  const reasons = [];
  
  // Modifier 1: CLV history (±10%)
  const clvModifier = await getCLVModifier(market);
  multiplier *= clvModifier.multiplier;
  if (clvModifier.reason) reasons.push(clvModifier.reason);
  
  // Modifier 2: Steam confirmation (+15%)
  if (metrics.steam_detected && metrics.steam_direction === side) {
    multiplier *= 1.15;
    reasons.push(`steam_boost:+15%`);
  }
  
  // Modifier 3: Drift alignment (±5%)
  const driftModifier = getDriftModifier(metrics, side);
  multiplier *= driftModifier.multiplier;
  if (driftModifier.reason) reasons.push(driftModifier.reason);
  
  // Modifier 4: Volatility haircut (-10% if vol > median)
  const medianVol = await getMedianVolatility(market);
  if (metrics.volatility_6h > medianVol) {
    multiplier *= 0.90;
    reasons.push('volatility_haircut:-10%');
  }
  
  // Modifier 5: Breadth discount (low agreement = less confidence)
  if (metrics.breadth < 3) {
    multiplier *= 0.95;
    reasons.push('low_breadth_haircut:-5%');
  }
  
  // Cap multiplier at [0.5, 1.5]
  multiplier = Math.max(0.5, Math.min(1.5, multiplier));
  
  return {
    multiplier,
    final_units: Math.round(baseUnits * multiplier * 10) / 10,
    reasons,
    metrics: {
      drift_bps: metrics.drift_bps,
      velocity_30m: metrics.velocity_30m,
      breadth: metrics.breadth,
      volatility_6h: metrics.volatility_6h
    }
  };
}

/**
 * CLV-based modifier
 */
async function getCLVModifier(market) {
  const clvStats = await getRollingCLV(market, weeks = 6);
  
  if (clvStats.count < 10) {
    // Not enough history - slight haircut
    return { multiplier: 0.95, reason: 'insufficient_clv_history:-5%' };
  }
  
  if (clvStats.avg_clv_bps > 50) {
    // Strong positive CLV - boost
    return { multiplier: 1.10, reason: 'strong_clv:+10%' };
  } else if (clvStats.avg_clv_bps < -50) {
    // Negative CLV - haircut
    return { multiplier: 0.90, reason: 'negative_clv:-10%' };
  }
  
  return { multiplier: 1.0, reason: null };
}

/**
 * Drift-based modifier
 */
function getDriftModifier(metrics, ourSide) {
  // If drift is with us (price moving in our favor), slight haircut
  // If drift is against us (price moving away), slight boost
  
  const driftBps = metrics.drift_bps;
  
  // For "home" side, positive drift means home getting more expensive (moving away from us)
  // For "away" side, negative drift means away getting more expensive (moving away from us)
  
  if (Math.abs(driftBps) < 25) {
    return { multiplier: 1.0, reason: null }; // Minimal drift
  }
  
  // Simplified logic: if significant drift, assume line is moving towards fair value
  // So we haircut slightly
  return { multiplier: 0.95, reason: 'drift_adjustment:-5%' };
}
