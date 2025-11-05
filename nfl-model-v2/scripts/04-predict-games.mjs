#!/usr/bin/env node
/**
 * NFL Model V4.1 - Prediction Engine (Hotfix)
 * 
 * Generates predictions for all games using time-causal features.
 * Uses simplified linear models for spread, total, and moneyline predictions.
 * V4.1: Reverted ML conversion to V2 stable formula (removed variance/calibration)
 * 
 * Run: node nfl-model-v2/scripts/04-predict-games.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// V4.1: Removed variance and calibration imports (caused ML accuracy drop)
// import { estimateSigma } from './_lib/variance.mjs';
// import { spreadToWinProbability } from '../shared/math.js';
// import { loadCalibration, applyIsotonic, isCalibrationLoaded } from './_lib/calibration.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = JSON.parse(
  await fs.readFile(path.join(__dirname, '../config.json'), 'utf-8')
);

const FEATURES_DIR = path.join(__dirname, '../data/processed-features');
const OUTPUT_DIR = path.join(__dirname, '../data/processed-features');

// V4.1: Calibration disabled (isotonic regression made performance worse)
// const CALIBRATION_PATH = path.join(__dirname, '../data/calibration/ml_isotonic.json');
// if (config.calibration?.enable_isotonic) {
//   await loadCalibration(CALIBRATION_PATH);
//   if (isCalibrationLoaded()) {
//     console.log('✅ Isotonic calibration loaded');
//   } else {
//     console.log('⚠️  Calibration enabled but map not found (will run uncalibrated)');
//   }
// }

/**
 * Simple linear regression prediction
 * In a real backtest, you'd train on historical data
 * For now, using heuristic weights based on NFL analytics research
 */
function predictSpread(features) {
  // Spread = expected home margin
  // Positive = home favored, Negative = away favored
  
  const spread = (
    features.home_field_advantage +
    (features.home_epa_offense - features.away_epa_offense) * 15 +
    (features.away_epa_defense - features.home_epa_defense) * 15 +
    (features.home_success_rate_offense - features.away_success_rate_offense) * 10 +
    (features.home_explosive_rate - features.away_explosive_rate) * 8
  );
  
  return {
    predicted_spread: spread,
    home_favored: spread > 0,
    confidence: calculateConfidence(features, 'spread')
  };
}

/**
 * Predict total points
 */
function predictTotal(features) {
  // Base NFL average is ~45 points
  const base = 45;
  
  const total = base + (
    (features.home_epa_offense + features.away_epa_offense) * 20 +
    (features.home_epa_defense + features.away_epa_defense) * -15 +
    (features.home_explosive_rate + features.away_explosive_rate) * 12
  );
  
  return {
    predicted_total: Math.max(35, Math.min(65, total)), // Bound between 35-65
    confidence: calculateConfidence(features, 'total')
  };
}

/**
 * Predict moneyline (win probability)
 * V4.1 HOTFIX: Reverted to V2 stable linear conversion
 * V4's Normal CDF with variance model caused ML accuracy to drop from 40% to 34%
 */
function predictMoneyline(features, spreadValue) {
  // V4.1: Simple linear conversion (V2 formula - proven stable)
  // Each point of spread ≈ 2.5% win probability
  // At 0 spread, home team has ~53% win prob due to HFA
  const homeWinProb = 0.53 + (spreadValue * 0.025);
  
  // V4 REMOVED (caused performance degradation):
  // const sigma = estimateSigma(features, config);
  // let homeWinProb = spreadToWinProbability(spreadValue, sigma);
  // if (config.calibration?.enable_isotonic && isCalibrationLoaded()) {
  //   homeWinProb = applyIsotonic(homeWinProb);
  // }
  
  // Clamp to reasonable bounds (avoid extreme probabilities)
  const clampedProb = Math.max(0.05, Math.min(0.95, homeWinProb));
  
  return {
    home_win_probability: clampedProb,
    away_win_probability: 1 - clampedProb,
    confidence: calculateConfidence(features, 'moneyline')
  };
}

/**
 * Calculate prediction confidence based on feature quality
 */
function calculateConfidence(features, predictionType) {
  // Base confidence on number of games played
  const minGames = Math.min(features.home_games_played, features.away_games_played);
  const gamesFactor = Math.min(minGames / 10, 1.0); // Max out at 10 games
  
  // Matchup clarity (bigger differentials = higher confidence)
  const epaDiff = Math.abs(features.epa_offense_diff);
  const clarityFactor = Math.min(epaDiff / 0.15, 1.0); // Max out at 0.15 EPA diff
  
  // Combined confidence (50-90% range)
  const confidence = 0.50 + (gamesFactor * 0.2) + (clarityFactor * 0.2);
  
  return Math.round(confidence * 100) / 100; // Round to 2 decimals
}

/**
 * Generate predictions for a single game
 */
function generateGamePrediction(features) {
  const spread = predictSpread(features);
  const total = predictTotal(features);
  const moneyline = predictMoneyline(features, spread.predicted_spread);
  
  return {
    game_id: features.game_id,
    season: features.season,
    week: features.week,
    home_team: features.home_team,
    away_team: features.away_team,
    
    predictions: {
      spread: {
        line: spread.predicted_spread,
        pick: spread.home_favored ? features.home_team : features.away_team,
        confidence: spread.confidence
      },
      total: {
        line: total.predicted_total,
        confidence: total.confidence
      },
      moneyline: {
        pick: moneyline.home_win_probability > 0.5 ? features.home_team : features.away_team,
        home_win_prob: moneyline.home_win_probability,
        away_win_prob: moneyline.away_win_probability,
        sigma: moneyline.sigma, // V4: store variance estimate
        confidence: moneyline.confidence
      }
    },
    
    metadata: {
      predicted_at: new Date().toISOString(),
      model_version: 'v4.1-hotfix-stable',
      time_causal: true
    }
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('🏈 NFL Model V4.1 - Prediction Engine (Hotfix)');
  console.log('='.repeat(60));
  console.log(`Seasons: ${config.seasons.join(', ')}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  let totalPredictions = 0;
  
  for (const season of config.seasons) {
    console.log(`\n📅 Generating predictions for ${season}...`);
    
    // Load features
    const featuresFile = path.join(FEATURES_DIR, `features_${season}.json`);
    const featuresData = await fs.readFile(featuresFile, 'utf-8');
    const features = JSON.parse(featuresData);
    
    console.log(`   Loaded ${features.length} games with features`);
    
    // Generate predictions
    const predictions = features.map(f => generateGamePrediction(f));
    totalPredictions += predictions.length;
    
    // Save predictions
    const outputFile = path.join(OUTPUT_DIR, `predictions_${season}.json`);
    await fs.writeFile(outputFile, JSON.stringify(predictions, null, 2));
    
    console.log(`   ✅ Generated ${predictions.length} predictions`);
    console.log(`   ✅ Saved to ${outputFile}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Prediction Generation Complete!');
  console.log(`   Total Predictions: ${totalPredictions}`);
  console.log(`   Saved to: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  // Save summary
  const summary = {
    completed_at: new Date().toISOString(),
    seasons: config.seasons,
    total_predictions: totalPredictions,
    model_version: 'v2-backtest',
    time_causal: true
  };
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'predictions_summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log('\n📝 Next Step: node nfl-model-v2/scripts/05-calculate-edges.mjs\n');
}

// Run main function
main().catch(error => {
  console.error('\n❌ Fatal Error:', error);
  process.exit(1);
});
