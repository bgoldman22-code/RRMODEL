/**
 * Phase 2.5 Inference Engine
 * 
 * Loads Phase 2.5 correlation-weighted regression models and provides
 * prediction functions for points, rebounds, and assists.
 * 
 * Model Formula: prediction = baseline + Σ(feature_value × weight)
 * 
 * Input: Feature object with L5/L10/season stats
 * Output: Predicted stat value + metadata
 * 
 * Files Used:
 * - data/nba/models/points_Window_3_-_Test_Apr_2025.json
 * - data/nba/models/rebounds_Window_3_-_Test_Apr_2025.json
 * - data/nba/models/assists_Window_3_-_Test_Apr_2025.json
 * 
 * Data Safety: READ-ONLY operations, no file writes
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Lazy-load models on first use
let MODELS = null;

/**
 * Load all Phase 2.5 models from disk
 * @returns {Object} - { points, rebounds, assists }
 */
export function loadPhase2Models() {
  if (MODELS) return MODELS;

  console.log('[Phase2-Inference] Loading Phase 2.5 models...');

  try {
    const modelsPath = join(__dirname, '../../../data/nba/models');

    MODELS = {
      points: JSON.parse(
        readFileSync(join(modelsPath, 'points_Window_3_-_Test_Apr_2025.json'), 'utf-8')
      ),
      rebounds: JSON.parse(
        readFileSync(join(modelsPath, 'rebounds_Window_3_-_Test_Apr_2025.json'), 'utf-8')
      ),
      assists: JSON.parse(
        readFileSync(join(modelsPath, 'assists_Window_3_-_Test_Apr_2025.json'), 'utf-8')
      ),
    };

    console.log('[Phase2-Inference] ✅ Loaded 3 models:', {
      points_features: MODELS.points.featureNames.length,
      rebounds_features: MODELS.rebounds.featureNames.length,
      assists_features: MODELS.assists.featureNames.length,
    });

    return MODELS;
  } catch (error) {
    console.error('[Phase2-Inference] ❌ Failed to load models:', error.message);
    throw new Error(`Failed to load Phase 2.5 models: ${error.message}`);
  }
}

/**
 * Predict a single stat (points, rebounds, or assists) using Phase 2.5 model
 * 
 * @param {string} stat - 'points', 'rebounds', or 'assists'
 * @param {Object} features - Feature object with L5/L10/season stats
 * @returns {Object} - { prediction, confidence, usedFeatures, missingFeatures, modelMeta }
 * 
 * @example
 * const features = {
 *   season_ppg: 20.5,
 *   L10_ppg: 22.1,
 *   L5_ppg: 23.5,
 *   L10_fga: 15.2,
 *   L5_fga: 16.0,
 *   // ... etc
 * };
 * const result = predictStat('points', features);
 * // => { prediction: 24.3, confidence: 0.8, usedFeatures: [...], ... }
 */
export function predictStat(stat, features) {
  const models = loadPhase2Models();
  const model = models[stat];

  if (!model) {
    throw new Error(`Unknown stat: ${stat}. Valid stats: points, rebounds, assists`);
  }

  // Start with baseline
  let prediction = model.baseline;

  // Track which features we used vs missed
  const usedFeatures = [];
  const missingFeatures = [];

  // Add weighted feature contributions
  for (const featureName of model.featureNames) {
    if (features[featureName] !== undefined && features[featureName] !== null) {
      const featureValue = features[featureName];
      const weight = model.weights[featureName];
      prediction += featureValue * weight;
      usedFeatures.push(featureName);
    } else {
      missingFeatures.push(featureName);
    }
  }

  // Calculate confidence based on feature completeness
  const confidence = usedFeatures.length / model.featureNames.length;

  return {
    prediction: parseFloat(prediction.toFixed(2)),
    confidence: parseFloat(confidence.toFixed(3)),
    usedFeatures,
    missingFeatures,
    modelMeta: {
      type: model.type,
      baseline: model.baseline,
      totalFeatures: model.featureNames.length,
      trainingSize: model.trainingSize,
    },
  };
}

/**
 * Predict all three stats (points, rebounds, assists) at once
 * 
 * @param {Object} features - Feature object with L5/L10/season stats
 * @returns {Object} - { points: {...}, rebounds: {...}, assists: {...} }
 */
export function predictAll(features) {
  return {
    points: predictStat('points', features),
    rebounds: predictStat('rebounds', features),
    assists: predictStat('assists', features),
  };
}

/**
 * Calculate PRA (Points + Rebounds + Assists) prediction
 * 
 * @param {Object} features - Feature object with L5/L10/season stats
 * @returns {Object} - { pra, points, rebounds, assists, confidence }
 */
export function predictPRA(features) {
  const predictions = predictAll(features);
  
  const pra = predictions.points.prediction + 
              predictions.rebounds.prediction + 
              predictions.assists.prediction;

  // Overall confidence is the average of individual confidences
  const avgConfidence = (
    predictions.points.confidence +
    predictions.rebounds.confidence +
    predictions.assists.confidence
  ) / 3;

  return {
    pra: parseFloat(pra.toFixed(2)),
    points: predictions.points.prediction,
    rebounds: predictions.rebounds.prediction,
    assists: predictions.assists.prediction,
    confidence: parseFloat(avgConfidence.toFixed(3)),
    breakdown: predictions,
  };
}

/**
 * Example usage and testing (run this file directly)
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('\n=== Phase 2.5 Inference Engine Test ===\n');

  // Sample features for a typical player
  const sampleFeatures = {
    // Season averages
    season_ppg: 20.5,
    season_rpg: 4.2,
    season_apg: 5.8,
    
    // Last 10 games
    L10_ppg: 22.1,
    L10_rpg: 4.5,
    L10_apg: 6.1,
    L10_fga: 15.2,
    L10_fta: 4.3,
    L10_minutes: 34.5,
    
    // Last 5 games
    L5_ppg: 23.5,
    L5_rpg: 4.8,
    L5_apg: 6.5,
    L5_fga: 16.0,
    L5_fta: 4.8,
    L5_minutes: 35.2,
  };

  console.log('Sample Features:', JSON.stringify(sampleFeatures, null, 2));
  console.log('\n--- Individual Predictions ---\n');

  const pointsPred = predictStat('points', sampleFeatures);
  console.log('Points:', JSON.stringify(pointsPred, null, 2));

  const reboundsPred = predictStat('rebounds', sampleFeatures);
  console.log('\nRebounds:', JSON.stringify(reboundsPred, null, 2));

  const assistsPred = predictStat('assists', sampleFeatures);
  console.log('\nAssists:', JSON.stringify(assistsPred, null, 2));

  console.log('\n--- Combined PRA Prediction ---\n');

  const praPred = predictPRA(sampleFeatures);
  console.log('PRA:', JSON.stringify(praPred, null, 2));

  console.log('\n=== Test Complete ===\n');
}
