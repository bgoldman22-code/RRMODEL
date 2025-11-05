/**
 * NFL Model V4 - Variance (σ) Model
 * 
 * Estimates game-specific standard deviation for spread-to-ML conversion.
 * Higher variance games need wider probability distributions.
 * 
 * Key drivers of variance:
 * - High explosive play differential (big play volatility)
 * - High pressure differential (QB instability)
 * - QB EPA volatility under pressure
 * - Pace of play (more possessions = more variance)
 */

/**
 * Estimate game-specific sigma (standard deviation in points)
 * 
 * @param {Object} features - Game feature vector with differentials
 * @returns {number} - Sigma value clamped between floor and cap
 */
export function estimateSigma(features, config) {
  // Base sigma (NFL typical game variance)
  let sigma = 10.0;
  
  // Explosive play differential (15+ yd plays create swing potential)
  // High absolute differential = more big play variance
  const explosiveDiff = Math.abs(features.explosive_rate_diff || 0);
  if (explosiveDiff > 0.02) {
    sigma += 6.0 * (explosiveDiff - 0.02);
  }
  
  // Pressure differential (QB under pressure = higher variance)
  // Positive pressure_diff means more home QB pressure relative to away
  const pressureDiff = Math.abs(features.pressure_diff || 0);
  sigma += 3.0 * pressureDiff;
  
  // QB EPA volatility under pressure (if available)
  // High volatility = inconsistent QB performance = wider outcomes
  const qbVolatility = features.qb_epa_under_pressure_volatility || 0;
  sigma += 2.0 * qbVolatility;
  
  // Success rate differential (offensive consistency)
  // Low success rates = more 3-and-outs = lower scoring variance
  const successDiff = Math.abs(features.success_rate_diff || 0);
  if (successDiff < 0.05) {
    // Evenly matched teams with low success = defensive slugfest
    sigma -= 1.5;
  }
  
  // EPA defense differential (defensive quality affects variance)
  // Two good defenses = lower scoring variance
  const homeEpaDef = features.home_epa_defense || 0;
  const awayEpaDef = features.away_epa_defense || 0;
  if (homeEpaDef < -0.05 && awayEpaDef < -0.05) {
    // Both teams have strong defenses (negative EPA allowed)
    sigma -= 2.0;
  }
  
  // Apply floor and cap from config
  const floor = config?.variance_model?.sigma_floor || 5.0;
  const cap = config?.variance_model?.sigma_cap || 16.0;
  
  return Math.max(floor, Math.min(cap, sigma));
}

/**
 * Calculate variance adjustment for totals market
 * Total variance is typically higher than spread variance
 * 
 * @param {Object} features - Game feature vector
 * @returns {number} - Sigma for totals prediction
 */
export function estimateTotalSigma(features, config) {
  const baseSigma = estimateSigma(features, config);
  
  // Totals have ~15% higher variance than spreads
  // More ways for total to deviate (both teams can over/underperform)
  return baseSigma * 1.15;
}

/**
 * Get volatility diagnostics for debugging
 * 
 * @param {Object} features - Game feature vector
 * @returns {Object} - Breakdown of variance components
 */
export function getVarianceDiagnostics(features, config) {
  const baseSigma = 10.0;
  const explosiveDiff = Math.abs(features.explosive_rate_diff || 0);
  const pressureDiff = Math.abs(features.pressure_diff || 0);
  const qbVolatility = features.qb_epa_under_pressure_volatility || 0;
  
  return {
    base_sigma: baseSigma,
    explosive_adjustment: explosiveDiff > 0.02 ? 6.0 * (explosiveDiff - 0.02) : 0,
    pressure_adjustment: 3.0 * pressureDiff,
    qb_volatility_adjustment: 2.0 * qbVolatility,
    final_sigma: estimateSigma(features, config)
  };
}
