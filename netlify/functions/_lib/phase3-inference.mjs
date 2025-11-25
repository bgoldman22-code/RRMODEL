/**
 * Phase 3 Inference Engine
 * 
 * JavaScript implementation of Phase 3 PRA logistic regression models
 * for real-time probability predictions in production.
 * 
 * This mirrors the Python training logic but runs in Node.js/Netlify Functions.
 * 
 * Usage:
 *   import { predictPRAOver, predictPRAUnder } from './phase3-inference.mjs';
 *   const probability = predictPRAOver(features, model);
 */

/**
 * Sigmoid activation function
 */
export function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Scale a single feature value
 */
export function scaleFeature(value, mean, scale) {
  return (value - mean) / scale;
}

/**
 * Scale an array of features
 */
export function scaleFeatures(features, scalerMean, scalerScale) {
  if (!Array.isArray(features) || !Array.isArray(scalerMean) || !Array.isArray(scalerScale)) {
    throw new Error('Features and scaler params must be arrays');
  }
  
  if (features.length !== scalerMean.length || features.length !== scalerScale.length) {
    throw new Error(`Feature length mismatch: ${features.length} vs ${scalerMean.length}`);
  }
  
  return features.map((val, i) => scaleFeature(val, scalerMean[i], scalerScale[i]));
}

/**
 * Calculate logit (z = w^T * x + b)
 */
export function calculateLogit(scaledFeatures, coefficients, intercept, featureColumns) {
  let z = intercept;
  
  for (let i = 0; i < scaledFeatures.length; i++) {
    const featureName = featureColumns[i];
    const coefficient = coefficients[featureName];
    
    if (coefficient === undefined) {
      throw new Error(`Missing coefficient for feature: ${featureName}`);
    }
    
    z += coefficient * scaledFeatures[i];
  }
  
  return z;
}

/**
 * Predict probability using Phase 3 logistic model
 * 
 * @param {Object} featureObject - Object with feature values (e.g., { L5_ppg: 25.3, L10_ppg: 24.1, ... })
 * @param {Object} model - Phase 3 model object with coefficients, scaler, etc.
 * @returns {number} Probability between 0 and 1
 */
export function predictProbability(featureObject, model) {
  const { feature_columns, coefficients, intercept, scaler_mean, scaler_scale } = model;
  
  // Extract features in correct order
  const features = feature_columns.map(col => {
    const val = featureObject[col];
    return val !== undefined && val !== null ? val : 0;
  });
  
  // Scale features
  const scaledFeatures = scaleFeatures(features, scaler_mean, scaler_scale);
  
  // Calculate logit
  const z = calculateLogit(scaledFeatures, coefficients, intercept, feature_columns);
  
  // Apply sigmoid
  const probability = sigmoid(z);
  
  return probability;
}

/**
 * Predict PRA OVER probability
 * 
 * @param {Object} featureObject - Feature values
 * @param {Object} overModel - PRA OVER model
 * @returns {number} Probability that bet wins
 */
export function predictPRAOver(featureObject, overModel) {
  return predictProbability(featureObject, overModel);
}

/**
 * Predict PRA UNDER probability
 * 
 * @param {Object} featureObject - Feature values
 * @param {Object} underModel - PRA UNDER model
 * @returns {number} Probability that bet wins
 */
export function predictPRAUnder(featureObject, underModel) {
  return predictProbability(featureObject, underModel);
}

/**
 * Calculate expected value (EV) of a bet
 * 
 * @param {number} probability - Win probability (0-1)
 * @param {number} americanOdds - American odds (e.g., -110, +150)
 * @param {number} stake - Bet amount (default 1.0)
 * @returns {number} Expected value in dollars
 */
export function calculateEV(probability, americanOdds, stake = 1.0) {
  // Convert American odds to decimal odds
  const decimalOdds = americanOdds > 0 
    ? 1 + (americanOdds / 100) 
    : 1 + (100 / Math.abs(americanOdds));
  
  // EV = (probability * payout) - (1 - probability) * stake
  const payout = stake * decimalOdds;
  const ev = (probability * payout) - ((1 - probability) * stake);
  
  return ev;
}

/**
 * Determine if bet has positive EV
 * 
 * @param {number} probability - Win probability
 * @param {number} americanOdds - American odds
 * @returns {boolean} True if bet has positive expected value
 */
export function hasPositiveEV(probability, americanOdds) {
  return calculateEV(probability, americanOdds) > 0;
}

/**
 * Suggest bet size using Kelly Criterion
 * 
 * @param {number} probability - Win probability
 * @param {number} americanOdds - American odds
 * @param {number} bankroll - Total bankroll
 * @param {number} kellyFraction - Fraction of Kelly to use (default 0.25 for quarter Kelly)
 * @returns {number} Suggested bet size
 */
export function kellyCriterion(probability, americanOdds, bankroll, kellyFraction = 0.25) {
  const decimalOdds = americanOdds > 0 
    ? 1 + (americanOdds / 100) 
    : 1 + (100 / Math.abs(americanOdds));
  
  // Kelly formula: f = (p * (b + 1) - 1) / b
  // where p = probability, b = decimal odds - 1
  const b = decimalOdds - 1;
  const kellyPct = (probability * (b + 1) - 1) / b;
  
  if (kellyPct <= 0) return 0; // Don't bet if Kelly is negative or zero
  
  // Apply Kelly fraction for safety
  const betSize = bankroll * kellyPct * kellyFraction;
  
  return Math.max(0, betSize);
}

/**
 * Load Phase 3 models from JSON files
 * 
 * @param {string} overModelPath - Path to PRA OVER model JSON
 * @param {string} underModelPath - Path to PRA UNDER model JSON
 * @returns {Object} { overModel, underModel }
 */
export async function loadPhase3Models(overModelPath, underModelPath) {
  const fs = await import('fs');
  
  const overModel = JSON.parse(fs.readFileSync(overModelPath, 'utf-8'));
  const underModel = JSON.parse(fs.readFileSync(underModelPath, 'utf-8'));
  
  // Validate models
  const requiredFields = ['feature_columns', 'coefficients', 'intercept', 'scaler_mean', 'scaler_scale'];
  
  for (const field of requiredFields) {
    if (!overModel[field] || !underModel[field]) {
      throw new Error(`Invalid model format: missing ${field}`);
    }
  }
  
  return { overModel, underModel };
}

/**
 * Make bet recommendation
 * 
 * @param {Object} featureObject - Feature values
 * @param {string} side - 'Over' or 'Under'
 * @param {number} line - Bet line value
 * @param {number} americanOdds - American odds
 * @param {Object} models - { overModel, underModel }
 * @param {Object} options - { confidenceThreshold, minEV }
 * @returns {Object} Recommendation with probability, EV, and decision
 */
export function makeBetRecommendation(
  featureObject, 
  side, 
  line, 
  americanOdds, 
  models,
  options = {}
) {
  const { confidenceThreshold = 0.55, minEV = 0.02 } = options;
  const { overModel, underModel } = models;
  
  // Get probability
  let probability;
  if (side === 'Over') {
    probability = predictPRAOver(featureObject, overModel);
  } else if (side === 'Under') {
    probability = predictPRAUnder(featureObject, underModel);
  } else {
    throw new Error(`Invalid side: ${side}. Must be 'Over' or 'Under'`);
  }
  
  // Calculate EV
  const ev = calculateEV(probability, americanOdds);
  
  // Make decision
  const meetsConfidence = probability >= confidenceThreshold;
  const meetsEV = ev >= minEV;
  const shouldBet = meetsConfidence && meetsEV;
  
  return {
    probability,
    expectedValue: ev,
    meetsConfidence,
    meetsEV,
    shouldBet,
    confidence: probability,
    side,
    line,
    odds: americanOdds
  };
}

/**
 * Batch predict for multiple bets
 * 
 * @param {Array} bets - Array of bet objects with featureObject, side, line, odds
 * @param {Object} models - { overModel, underModel }
 * @param {Object} options - Recommendation options
 * @returns {Array} Array of recommendations
 */
export function batchPredict(bets, models, options = {}) {
  return bets.map(bet => {
    try {
      return makeBetRecommendation(
        bet.featureObject,
        bet.side,
        bet.line,
        bet.odds,
        models,
        options
      );
    } catch (err) {
      return {
        error: err.message,
        bet
      };
    }
  });
}

export default {
  sigmoid,
  scaleFeature,
  scaleFeatures,
  calculateLogit,
  predictProbability,
  predictPRAOver,
  predictPRAUnder,
  calculateEV,
  hasPositiveEV,
  kellyCriterion,
  loadPhase3Models,
  makeBetRecommendation,
  batchPredict
};
