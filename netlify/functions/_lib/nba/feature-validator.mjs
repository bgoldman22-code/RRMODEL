/**
 * NBA Feature Validator
 * 
 * Prevents NaN, Infinity, and out-of-bounds values in features
 * Critical for model stability and production reliability
 * 
 * Features:
 * - Schema validation with bounds
 * - NaN/Infinity detection
 * - Automatic clamping/imputation
 * - Logging of violations
 */

/**
 * Feature schema with expected bounds and defaults
 * Based on NBA historical data distributions
 */
export const FEATURE_SCHEMA = {
  // Form features (L5, L10, L20)
  'L5_winPct': { min: 0, max: 1, default: 0.5 },
  'L5_netRating': { min: -20, max: 20, default: 0 },
  'L5_offRating': { min: 95, max: 125, default: 110 },
  'L5_defRating': { min: 95, max: 125, default: 110 },
  'L5_pace': { min: 88, max: 110, default: 100 },
  
  'L10_winPct': { min: 0, max: 1, default: 0.5 },
  'L10_netRating': { min: -20, max: 20, default: 0 },
  'L10_offRating': { min: 95, max: 125, default: 110 },
  'L10_defRating': { min: 95, max: 125, default: 110 },
  'L10_pace': { min: 88, max: 110, default: 100 },
  
  'L20_winPct': { min: 0, max: 1, default: 0.5 },
  'L20_netRating': { min: -20, max: 20, default: 0 },
  'L20_offRating': { min: 95, max: 125, default: 110 },
  'L20_defRating': { min: 95, max: 125, default: 110 },
  'L20_pace': { min: 88, max: 110, default: 100 },
  
  // Trend indicators
  'form_trend': { min: -15, max: 15, default: 0 },
  'offense_trend': { min: -15, max: 15, default: 0 },
  'defense_trend': { min: -15, max: 15, default: 0 },
  'pace_trend': { min: -10, max: 10, default: 0 },
  'momentum': { min: -0.5, max: 0.5, default: 0 },
  
  // Pace features
  'pace': { min: 88, max: 110, default: 100 },
  'poss_per_game': { min: 92, max: 108, default: 100 },
  'pace_vs_league': { min: -10, max: 10, default: 0 },
  
  // Four Factors
  'off_efg_pct': { min: 0.40, max: 0.65, default: 0.53 },
  'off_tov_pct': { min: 0.08, max: 0.20, default: 0.14 },
  'off_oreb_pct': { min: 0.15, max: 0.35, default: 0.25 },
  'off_ftfga': { min: 0.10, max: 0.35, default: 0.22 },
  
  'def_efg_pct': { min: 0.40, max: 0.65, default: 0.53 },
  'def_tov_pct': { min: 0.08, max: 0.20, default: 0.14 },
  'def_dreb_pct': { min: 0.65, max: 0.85, default: 0.75 },
  'def_ftfga': { min: 0.10, max: 0.35, default: 0.22 },
  
  // Ratings
  'off_rating': { min: 95, max: 125, default: 110 },
  'def_rating': { min: 95, max: 125, default: 110 },
  'net_rating': { min: -20, max: 20, default: 0 },
  
  // Shooting percentages
  'fg_pct': { min: 0.35, max: 0.55, default: 0.45 },
  'fg3_pct': { min: 0.25, max: 0.45, default: 0.35 },
  'ft_pct': { min: 0.65, max: 0.85, default: 0.75 },
  
  // Per-game stats
  'ppg': { min: 90, max: 130, default: 110 },
  'opp_ppg': { min: 90, max: 130, default: 110 },
  'rebounds_pg': { min: 35, max: 55, default: 45 },
  'assists_pg': { min: 18, max: 32, default: 25 },
  'turnovers_pg': { min: 10, max: 18, default: 14 },
  'steals_pg': { min: 5, max: 12, default: 8 },
  'blocks_pg': { min: 3, max: 8, default: 5 },
  
  // Context features
  'rest_days': { min: 0, max: 7, default: 1 },
  'is_home': { min: 0, max: 1, default: 0.5 },
  'is_back_to_back': { min: 0, max: 1, default: 0 },
  'altitude_diff': { min: -5000, max: 5000, default: 0 },
  
  // Opponent adjustments
  'offRating_adjusted': { min: 95, max: 125, default: 110 },
  'defRating_adjusted': { min: 95, max: 125, default: 110 },
  'netRating_adjusted': { min: -20, max: 20, default: 0 },
  'sosAdjustment': { min: -5, max: 5, default: 0 }
};

/**
 * Validate and clean a feature object
 * 
 * @param {object} features - Raw feature object
 * @param {object} options - Validation options
 * @returns {object} Cleaned features with validation report
 */
export function validateFeatures(features, options = {}) {
  const {
    clamp = true,           // Clamp to bounds instead of rejecting
    impute = true,          // Impute missing values with defaults
    logViolations = true,   // Log violations to console
    throwOnError = false    // Throw error on validation failure
  } = options;

  const cleaned = {};
  const violations = [];
  
  for (const [key, value] of Object.entries(features)) {
    const schema = FEATURE_SCHEMA[key];
    
    // Unknown feature (not in schema)
    if (!schema) {
      cleaned[key] = value;
      continue;
    }
    
    // Check for NaN or Infinity
    if (!isFinite(value) || value === null || value === undefined) {
      violations.push({
        feature: key,
        value,
        issue: 'NaN/Infinity/null',
        action: impute ? 'imputed' : 'rejected'
      });
      
      if (impute) {
        cleaned[key] = schema.default;
      } else if (throwOnError) {
        throw new Error(`Feature ${key} has invalid value: ${value}`);
      }
      continue;
    }
    
    // Check bounds
    if (value < schema.min || value > schema.max) {
      violations.push({
        feature: key,
        value,
        bounds: [schema.min, schema.max],
        issue: 'out_of_bounds',
        action: clamp ? 'clamped' : 'rejected'
      });
      
      if (clamp) {
        cleaned[key] = Math.max(schema.min, Math.min(schema.max, value));
      } else if (throwOnError) {
        throw new Error(`Feature ${key} out of bounds: ${value} not in [${schema.min}, ${schema.max}]`);
      } else {
        cleaned[key] = schema.default;
      }
    } else {
      cleaned[key] = value;
    }
  }
  
  // Add missing features with defaults
  if (impute) {
    for (const [key, schema] of Object.entries(FEATURE_SCHEMA)) {
      if (!(key in cleaned)) {
        cleaned[key] = schema.default;
        violations.push({
          feature: key,
          value: undefined,
          issue: 'missing',
          action: 'imputed'
        });
      }
    }
  }
  
  // Log violations
  if (logViolations && violations.length > 0) {
    console.warn(`[FeatureValidator] ${violations.length} violations detected:`);
    
    const byType = {};
    for (const v of violations) {
      byType[v.issue] = (byType[v.issue] || 0) + 1;
    }
    
    console.warn(`  Summary: ${JSON.stringify(byType)}`);
    
    // Log first few violations
    violations.slice(0, 5).forEach(v => {
      console.warn(`  - ${v.feature}: ${v.issue} (${v.action})`);
    });
    
    if (violations.length > 5) {
      console.warn(`  ... and ${violations.length - 5} more`);
    }
  }
  
  return {
    features: cleaned,
    violations,
    isValid: violations.length === 0,
    violationCount: violations.length,
    violationsByType: violations.reduce((acc, v) => {
      acc[v.issue] = (acc[v.issue] || 0) + 1;
      return acc;
    }, {})
  };
}

/**
 * Validate a batch of feature objects
 * 
 * @param {Array<object>} featureBatch - Array of feature objects
 * @param {object} options - Validation options
 * @returns {object} Cleaned batch with aggregated violations
 */
export function validateFeatureBatch(featureBatch, options = {}) {
  const cleanedBatch = [];
  const allViolations = [];
  
  for (let i = 0; i < featureBatch.length; i++) {
    const result = validateFeatures(featureBatch[i], {
      ...options,
      logViolations: false // Don't log each one
    });
    
    cleanedBatch.push(result.features);
    
    // Add sample index to violations
    result.violations.forEach(v => {
      allViolations.push({ ...v, sampleIndex: i });
    });
  }
  
  // Summary logging
  if (options.logViolations !== false && allViolations.length > 0) {
    console.warn(`[FeatureValidator] Batch validation: ${allViolations.length} violations across ${featureBatch.length} samples`);
    
    const byType = {};
    const byFeature = {};
    
    for (const v of allViolations) {
      byType[v.issue] = (byType[v.issue] || 0) + 1;
      byFeature[v.feature] = (byFeature[v.feature] || 0) + 1;
    }
    
    console.warn(`  By type: ${JSON.stringify(byType)}`);
    console.warn(`  Top violators:`, Object.entries(byFeature)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}(${v})`)
      .join(', ')
    );
  }
  
  return {
    features: cleanedBatch,
    violations: allViolations,
    isValid: allViolations.length === 0,
    violationCount: allViolations.length,
    violationRate: allViolations.length / featureBatch.length
  };
}

/**
 * Create a feature validator middleware for data pipeline
 * 
 * @param {object} options - Validation options
 * @returns {Function} Validator function
 */
export function createFeatureValidator(options = {}) {
  return function validator(features) {
    const result = validateFeatures(features, options);
    
    if (!result.isValid && options.throwOnError) {
      throw new Error(`Feature validation failed: ${result.violationCount} violations`);
    }
    
    return result.features;
  };
}

/**
 * Update schema bounds based on observed data
 * Useful for adapting to new seasons or rule changes
 * 
 * @param {Array<object>} samples - Historical feature samples
 * @param {number} percentile - Percentile for bounds (e.g., 0.01 = 1st to 99th)
 */
export function updateSchemaBounds(samples, percentile = 0.01) {
  const featureValues = {};
  
  // Collect all values per feature
  for (const sample of samples) {
    for (const [key, value] of Object.entries(sample)) {
      if (isFinite(value)) {
        if (!featureValues[key]) featureValues[key] = [];
        featureValues[key].push(value);
      }
    }
  }
  
  // Calculate bounds
  const updatedSchema = {};
  
  for (const [key, values] of Object.entries(featureValues)) {
    values.sort((a, b) => a - b);
    
    const lowerIdx = Math.floor(values.length * percentile);
    const upperIdx = Math.ceil(values.length * (1 - percentile)) - 1;
    
    updatedSchema[key] = {
      min: values[lowerIdx],
      max: values[upperIdx],
      default: values[Math.floor(values.length / 2)], // median
      observed: {
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        std: Math.sqrt(
          values.reduce((acc, v) => acc + Math.pow(v - updatedSchema[key].observed.mean, 2), 0) / values.length
        ),
        count: values.length
      }
    };
  }
  
  return updatedSchema;
}

/**
 * USAGE EXAMPLES:
 * 
 * // 1. Validate single feature set
 * const result = validateFeatures(rawFeatures, { clamp: true, impute: true });
 * const cleanFeatures = result.features;
 * 
 * // 2. Validate batch for training
 * const batchResult = validateFeatureBatch(trainingBatch);
 * const cleanBatch = batchResult.features;
 * 
 * // 3. Create middleware validator
 * const validator = createFeatureValidator({ throwOnError: true });
 * const cleaned = validator(features);
 * 
 * // 4. Update schema from historical data
 * const newSchema = updateSchemaBounds(historicalSamples, 0.01);
 */
