#!/usr/bin/env node
/*
 * NFL Model V3 - Prediction Engine with Enhanced Features
 * 
 * V3 FORMULA:
 * spread = 12*epa_diff + 10*epa_def_diff + 8*third_down_diff + 
 *          6*explosive_diff + 5*tds_rz_diff + 4*pressure_diff + 1.5*HFA
 * 
 * ML conversion: p_home = logistic(spread * 0.23)
 * Total: 45 + 14*(EPA_off_sum) - 10*(EPA_def_sum) + 6*explosive_diff
 * 
 * Run: node nfl-model-v3/scripts/04-predict-games.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = JSON.parse(
  await fs.readFile(path.join(__dirname, '../config.json'), 'utf-8')
);

const FEATURES_DIR = path.join(__dirname, '../data/processed-features');
const OUTPUT_DIR = path.join(__dirname, '../data/processed-features');

/**
 * Logistic function for spread-to-probability conversion
 */
function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * V3 SPREAD PREDICTION with Enhanced Features
 * Formula: 12*EPA_off + 10*EPA_def + 8*3rd_down + 6*explosive + 5*RZ_TD + 4*pressure + 1.5*HFA
 */
function predictSpread(features) {
  const spread = (
    12 * features.epa_offense_diff +
    10 * features.epa_defense_diff +
     8 * features.third_down_diff +
     6 * features.explosive_diff +
     5 * features.tds_rz_diff +
     4 * features.pressure_diff +
   1.5 * features.home_field_advantage
  );
  
  return {
    predicted_spread: spread,
    home_favored: spread > 0,
    confidence: calculateConfidence(features, 'spread')
  };
}

/**
 * V3 TOTAL PREDICTION with Enhanced Features
 * Formula: 45 + 14*EPA_off_sum - 10*EPA_def_sum + 6*explosive_diff
 */
function predictTotal(features) {
  const base = 45;
  
  const total = base + (
    14 * (features.home_epa_offense + features.away_epa_offense) -
    10 * (features.home_epa_defense + features.away_epa_defense) +
     6 * features.explosive_diff
  );
  
  return {
    predicted_total: Math.max(30, Math.min(70, total)),
    confidence: calculateConfidence(features, 'total')
  };
}

/**
 * V3 MONEYLINE PREDICTION with Logistic Conversion
 * p_home = logistic(spread * 0.23)
 */
function predictMoneyline(features) {
  const spread = predictSpread(features).predicted_spread;
  
  // Logistic conversion: spread * 0.23
  const homeWinProb = logistic(spread * 0.23);
  
  // Bound between 8% and 92%
  const boundedProb = Math.max(0.08, Math.min(0.92, homeWinProb));
  
  return {
    home_win_probability: boundedProb,
    away_win_probability: 1 - boundedProb,
    predicted_winner: boundedProb > 0.5 ? features.home_team : features.away_team,
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
  const moneyline = predictMoneyline(features);
  
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
        pick: moneyline.predicted_winner,
        home_win_prob: moneyline.home_win_probability,
        away_win_prob: moneyline.away_win_probability,
        confidence: moneyline.confidence
      }
    },
    
    metadata: {
      predicted_at: new Date().toISOString(),
      model_version: 'v2-backtest',
      time_causal: true
    }
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('🏈 NFL Model V2 - Prediction Engine');
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
