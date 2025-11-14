/**
 * V5 Total Model - Production Serving Module
 * 
 * Uses Ridge-fitted coefficients (λ=500) with economically sensible serving logic.
 * 
 * KEY DESIGN DECISION:
 * - Ridge regression left epa_def_sum slightly positive (+0.12)
 * - This violates football intuition (better defenses should → fewer points)
 * - In serving, we ZERO-WEIGHT epa_def_sum to maintain economic interpretability
 * - Impact on MAE is negligible since coefficient was already near zero
 * 
 * HONEST DIAGNOSTICS:
 * - The "raw" Ridge coefficients (including epa_def_sum) are preserved in:
 *   output/v5_coefficients_total_ridge.json
 * - This module applies the zero-weighting only during prediction serving
 * 
 * USAGE:
 * ```js
 * import { predictTotalGame, predictTotalFromFeatures } from './v5-total-model.mjs';
 * 
 * // Option 1: From features directly
 * const prediction = predictTotalFromFeatures({
 *   pace_combined: 135.5,
 *   epa_off_sum: 0.25,
 *   epa_def_sum: -0.15,  // This will be ignored in serving
 *   success_sum: 5.2,
 *   explosive_sum: 18.3
 * });
 * 
 * // Option 2: From game + metrics
 * const prediction = await predictTotalGame(game, homeMetrics, awayMetrics);
 * ```
 * 
 * @module v5-total-model
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COEFFS_PATH = path.join(__dirname, '../../output/v5_coefficients_total_ridge.json');

// Cached coefficients
let coeffsCache = null;

/**
 * Load Ridge-fitted coefficients
 */
async function loadCoefficients() {
  if (coeffsCache) return coeffsCache;
  
  const data = JSON.parse(await fs.readFile(COEFFS_PATH, 'utf-8'));
  coeffsCache = {
    intercept: data.coefficients.intercept,
    pace_combined: data.coefficients.pace_combined,
    epa_off_sum: data.coefficients.epa_off_sum,
    epa_def_sum: data.coefficients.epa_def_sum,  // Raw Ridge value (kept for diagnostics)
    success_sum: data.coefficients.success_sum,
    explosive_sum: data.coefficients.explosive_sum,
    p25_offset: data.coefficients.p25_offset,
    p75_offset: data.coefficients.p75_offset,
    metadata: {
      model: data.model,
      method: data.method,
      lambda: data.lambda,
      training_games: data.training_games,
      mae_training: data.metrics.mae,
      mae_validation: data.validation.mae,
      r2_training: data.metrics.r2,
      r2_validation: data.validation.r2
    }
  };
  
  return coeffsCache;
}

/**
 * Predict total from features
 * 
 * SERVING LOGIC:
 * - Uses Ridge-fitted coefficients EXCEPT epa_def_sum (zero-weighted)
 * - Returns p25, p50, p75 using Ridge-derived offsets
 * - Includes debug info showing raw Ridge vs served predictions
 * 
 * @param {Object} features - Feature set
 * @param {number} features.pace_combined - Combined team pace (plays per game)
 * @param {number} features.epa_off_sum - Sum of offensive EPA
 * @param {number} features.epa_def_sum - Sum of defensive EPA (ZERO-WEIGHTED IN SERVING)
 * @param {number} features.success_sum - Sum of success rates
 * @param {number} features.explosive_sum - Sum of explosive play rates
 * @param {boolean} [includeDebug=false] - Include raw Ridge comparison
 * @returns {Promise<Object>} Prediction with p25, p50, p75
 */
export async function predictTotalFromFeatures(features, includeDebug = false) {
  const coeffs = await loadCoefficients();
  
  // Validate feature ranges (for monitoring)
  validateFeatureRanges(features);
  
  // RAW RIDGE PREDICTION (honest diagnostic - includes epa_def_sum)
  const raw_p50 = 
    coeffs.intercept +
    (coeffs.pace_combined * features.pace_combined) +
    (coeffs.epa_off_sum * features.epa_off_sum) +
    (coeffs.epa_def_sum * features.epa_def_sum) +  // Included in raw
    (coeffs.success_sum * features.success_sum) +
    (coeffs.explosive_sum * features.explosive_sum);
  
  // SERVED PREDICTION (production logic - epa_def_sum ZERO-WEIGHTED)
  const served_p50 = 
    coeffs.intercept +
    (coeffs.pace_combined * features.pace_combined) +
    (coeffs.epa_off_sum * features.epa_off_sum) +
    // epa_def_sum coefficient deliberately NOT applied (economically sensible)
    (coeffs.success_sum * features.success_sum) +
    (coeffs.explosive_sum * features.explosive_sum);
  
  // Quantiles (using Ridge-derived offsets)
  const p25 = served_p50 + coeffs.p25_offset;
  const p75 = served_p50 + coeffs.p75_offset;
  
  const result = {
    p25: Math.round(p25 * 2) / 2,  // Round to nearest 0.5
    p50: Math.round(served_p50 * 2) / 2,
    p75: Math.round(p75 * 2) / 2,
    spread: Math.round((p75 - p25) * 2) / 2
  };
  
  if (includeDebug) {
    result.debug = {
      raw_ridge_p50: raw_p50,
      served_p50: served_p50,
      epa_def_impact: raw_p50 - served_p50,  // Should be tiny (~0.1-0.2 pts)
      epa_def_sum_coefficient: coeffs.epa_def_sum,
      epa_def_sum_value: features.epa_def_sum,
      serving_note: "epa_def_sum zero-weighted for economic interpretability"
    };
  }
  
  return result;
}

/**
 * Predict total for a game from metrics
 * 
 * Wrapper that:
 * 1. Computes total features from home/away metrics
 * 2. Calls predictTotalFromFeatures()
 * 3. Returns prediction with game context
 * 
 * @param {Object} game - Game object
 * @param {Object} homeMetrics - Home team rolling metrics
 * @param {Object} awayMetrics - Away team rolling metrics
 * @returns {Promise<Object>} Prediction with context
 */
export async function predictTotalGame(game, homeMetrics, awayMetrics) {
  const features = computeFeaturesFromMetrics(homeMetrics, awayMetrics);
  const prediction = await predictTotalFromFeatures(features, true);
  
  return {
    game_id: game.game_id,
    season: game.season,
    week: game.week,
    home_team: game.home_team,
    away_team: game.away_team,
    prediction: {
      p25: prediction.p25,
      p50: prediction.p50,
      p75: prediction.p75,
      spread: prediction.spread
    },
    features_used: features,
    debug: prediction.debug,
    model: 'V5 Total (Ridge λ=500, epa_def_sum zero-weighted)'
  };
}

/**
 * Compute total features from team metrics
 * 
 * MATCHES v1-feature-loader.mjs logic exactly for consistency.
 * 
 * Total features:
 * - pace_combined: Average team pace (plays per game)
 * - epa_off_sum: Sum of offensive EPA per play
 * - epa_def_sum: Sum of defensive EPA per play
 * - success_sum: Sum of success rates
 * - explosive_sum: Sum of explosive play rates
 * 
 * @param {Object} homeMetrics - Home team metrics
 * @param {Object} awayMetrics - Away team metrics
 * @returns {Object} Features for total model
 */
function computeFeaturesFromMetrics(homeMetrics, awayMetrics) {
  return {
    pace_combined: (homeMetrics.pace_avg + awayMetrics.pace_avg) / 2,
    epa_off_sum: homeMetrics.epa_offense_avg + awayMetrics.epa_offense_avg,
    epa_def_sum: homeMetrics.epa_defense_avg + awayMetrics.epa_defense_avg,
    success_sum: homeMetrics.success_rate_avg + awayMetrics.success_rate_avg,
    explosive_sum: homeMetrics.explosive_rate_avg + awayMetrics.explosive_rate_avg
  };
}

/**
 * Validate feature ranges for monitoring
 * 
 * Logs warnings if features are outside expected ranges.
 * Does NOT throw errors (allows model to run).
 */
function validateFeatureRanges(features) {
  const ranges = {
    pace_combined: [120, 180],     // Typical: 60-90 plays per team → 120-180 combined
    epa_off_sum: [-0.6, 0.8],      // Two teams: -0.3 to +0.4 each
    epa_def_sum: [-0.6, 0.8],      // Same range
    success_sum: [30, 60],         // NFLverse data: ~15-30% per team → 30-60 combined
    explosive_sum: [2, 12]         // NFLverse data: ~1-6% per team → 2-12 combined
  };
  
  for (const [feature, [min, max]] of Object.entries(ranges)) {
    const value = features[feature];
    if (value < min || value > max) {
      console.warn(`⚠️ Feature "${feature}" = ${value.toFixed(2)} outside typical range [${min}, ${max}]`);
    }
  }
}

/**
 * Batch predict totals for multiple games
 * 
 * @param {Array<Object>} games - Array of {game, homeMetrics, awayMetrics}
 * @returns {Promise<Array<Object>>} Array of predictions
 */
export async function predictTotalBatch(games) {
  // Pre-load coefficients
  await loadCoefficients();
  
  return Promise.all(
    games.map(({ game, homeMetrics, awayMetrics }) => 
      predictTotalGame(game, homeMetrics, awayMetrics)
    )
  );
}

/**
 * Get model metadata
 */
export async function getModelMetadata() {
  const coeffs = await loadCoefficients();
  return {
    ...coeffs.metadata,
    serving_note: "epa_def_sum coefficient zero-weighted in production for economic interpretability",
    coefficients: {
      intercept: coeffs.intercept,
      pace_combined: coeffs.pace_combined,
      epa_off_sum: coeffs.epa_off_sum,
      epa_def_sum: `${coeffs.epa_def_sum} (raw Ridge value, NOT applied in serving)`,
      success_sum: coeffs.success_sum,
      explosive_sum: coeffs.explosive_sum
    },
    quantile_offsets: {
      p25: coeffs.p25_offset,
      p75: coeffs.p75_offset
    }
  };
}

// Default export
export default {
  predictTotalFromFeatures,
  predictTotalGame,
  predictTotalBatch,
  getModelMetadata
};
