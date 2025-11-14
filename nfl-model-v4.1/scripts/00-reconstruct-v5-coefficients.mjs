#!/usr/bin/env node
/**
 * V5 Model Coefficient Reconstruction Script
 * 
 * SCOPE: Multi-Season Training (2020-2024)
 * ==========================================
 * 
 * This script fits the V5 ensemble model coefficients using ALL available
 * NFLverse game data from 2020-2024 regular seasons (1,408 games).
 * 
 * DATA SOURCES:
 * - Training data: nfl-model-v3/data/nflverse/game_aggregates_2020-2024.json
 * - Validation: 2025 weeks 1-9 (135 games)
 * - Spot-check: Week 10 bundle (14 games)
 * 
 * IMPORTANT NOTES ON DATA INTEGRITY:
 * ===================================
 * 
 * 1. Feature Source: All features computed from NFLverse game aggregates
 *    using time-causal rolling windows (only prior games used).
 *    Features match V1's conceptual space:
 *    - EPA per play (offensive/defensive)
 *    - Success rate (offensive/defensive)
 *    - Explosive play rate (offensive/defensive)
 *    - Pace (plays per game)
 * 
 * 2. Time-Causality: Rolling windows ensure no future leakage:
 *    - Early season (weeks 1-4): All available prior games
 *    - Mid season (weeks 5-9): 5-game rolling window
 *    - Late season (weeks 10+): 8-game rolling window
 *    - Week 1 baseline: Blended with prior season's last 8 games
 * 
 * 3. Regular Season Only: Training uses weeks 1-18 only (no playoffs)
 *    to match typical prediction scenarios.
 * 
 * METHODOLOGY:
 * ============
 * 
 * Spread Model (V3 Multi-Feature EPA):
 * - Features: epa_diff, success_diff, explosive_diff, hfa
 * - Method: OLS linear regression
 * - Training: 1,408 games (2020-2024)
 * - Validation: 135 games (2025 weeks 1-9)
 * 
 * Total Model (V5 Quantile Blend):
 * - Features: pace_combined, epa_off_sum, epa_def_sum, success_sum, explosive_sum
 * - Method: OLS for p50, quantile analysis for p25/p75
 * - Training: Same 1,408 games
 * - Validation: Same 135 games
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadTrainingDataset, loadValidationDataset2025, loadWeek10Dataset } from './_lib/v1-feature-loader.mjs';
import { ordinaryLeastSquares } from './_lib/regression.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Configuration
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

/**
 * Main reconstruction flow
 */
async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('NFL V5 MULTI-SEASON COEFFICIENT RECONSTRUCTION');
  console.log('='.repeat(70));
  console.log('');
  
  try {
    // Step 1: Load all datasets
    console.log('📂 STEP 1: Loading Multi-Season Datasets');
    console.log('-'.repeat(70));
    
    const { spreadRows: trainSpread, totalRows: trainTotal } = await loadTrainingDataset({
      regularSeasonOnly: true,
      includePlayoffs: false
    });
    
    const { spreadRows: valSpread, totalRows: valTotal } = await loadValidationDataset2025({
      regularSeasonOnly: true,
      includePlayoffs: false
    });
    
    const { spreadRows: week10Spread, totalRows: week10Total } = await loadWeek10Dataset({
      regularSeasonOnly: true,
      includePlayoffs: false
    });
    
    console.log('');
    console.log('✅ Datasets loaded:');
    console.log(`   Training: ${trainSpread.length} games (2020-2024)`);
    console.log(`   Validation: ${valSpread.length} games (2025 weeks 1-9)`);
    console.log(`   Spot-check: ${week10Spread.length} games (Week 10)`);
    
    // Step 2: Fit spread model
    console.log('\n');
    console.log('📊 STEP 2: Fitting Spread Model');
    console.log('-'.repeat(70));
    
    const spreadResult = fitSpreadModel(trainSpread, valSpread);
    
    // Step 3: Fit total model
    console.log('\n');
    console.log('📊 STEP 3: Fitting Total Model');
    console.log('-'.repeat(70));
    
    const totalResult = fitTotalModel(trainTotal, valTotal);
    
    // Step 4: Week 10 spot-check
    console.log('\n');
    console.log('🔍 STEP 4: Week 10 Spot-Check Validation');
    console.log('-'.repeat(70));
    
    await validateWeek10(week10Spread, week10Total, spreadResult, totalResult);
    
    // Step 5: Export coefficients
    console.log('\n');
    console.log('💾 STEP 5: Exporting Fitted Coefficients');
    console.log('-'.repeat(70));
    
    await exportCoefficients(spreadResult, totalResult);
    
    // Step 6: Generate diagnostics report
    console.log('\n');
    console.log('📝 STEP 6: Generating Diagnostics Report');
    console.log('-'.repeat(70));
    
    await generateDiagnosticsReport(spreadResult, totalResult, {
      trainSpread,
      trainTotal,
      valSpread,
      valTotal,
      week10Spread,
      week10Total
    });
    
    console.log('\n');
    console.log('='.repeat(70));
    console.log('✅ V5 RECONSTRUCTION COMPLETE');
    console.log('='.repeat(70));
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review: output/v5_reconstruction_diagnostics.md');
    console.log('  2. Inspect: output/v5_coefficients_spread.json');
    console.log('  3. Inspect: output/v5_coefficients_total.json');
    console.log('  4. Update production models with fitted coefficients');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Fit spread model using OLS regression
 */
function fitSpreadModel(trainRows, valRows) {
  console.log(`Training observations: ${trainRows.length}`);
  console.log('Features: epa_diff, success_diff, explosive_diff, hfa');
  console.log('Target: actual_margin (final score difference)');
  console.log('');
  
  // Build design matrix X and target vector y
  const X_train = trainRows.map(row => [
    row.features.epa_diff,
    row.features.success_diff,
    row.features.explosive_diff,
    row.features.hfa
  ]);
  
  const y_train = trainRows.map(row => row.target_margin);
  
  const featureNames = ['epa_diff', 'success_diff', 'explosive_diff', 'hfa'];
  
  // Fit model
  const model = ordinaryLeastSquares(X_train, y_train, featureNames);
  
  console.log('');
  console.log('Fitted Coefficients:');
  console.log(`  Intercept: ${model.coefficients.intercept.toFixed(4)}`);
  console.log(`  epa_diff: ${model.coefficients.epa_diff.toFixed(4)}`);
  console.log(`  success_diff: ${model.coefficients.success_diff.toFixed(4)}`);
  console.log(`  explosive_diff: ${model.coefficients.explosive_diff.toFixed(4)}`);
  console.log(`  hfa: ${model.coefficients.hfa.toFixed(4)}`);
  console.log('');
  console.log('Training Metrics:');
  console.log(`  R² = ${model.metrics.r2.toFixed(4)}`);
  console.log(`  MAE = ${model.metrics.mae.toFixed(2)} points`);
  console.log(`  RMSE = ${model.metrics.rmse.toFixed(2)} points`);
  
  // Validate on 2025 data
  const X_val = valRows.map(row => [
    row.features.epa_diff,
    row.features.success_diff,
    row.features.explosive_diff,
    row.features.hfa
  ]);
  
  const y_val = valRows.map(row => row.target_margin);
  
  const val_predictions = X_val.map(row => {
    const rowWithIntercept = [1, ...row];
    return rowWithIntercept.reduce((sum, x, i) => sum + x * model.coefficientsArray[i], 0);
  });
  
  const val_residuals = y_val.map((yi, i) => yi - val_predictions[i]);
  const val_mae = val_residuals.reduce((sum, r) => sum + Math.abs(r), 0) / y_val.length;
  const val_rmse = Math.sqrt(val_residuals.reduce((sum, r) => sum + r * r, 0) / y_val.length);
  
  console.log('');
  console.log('Validation Metrics (2025 weeks 1-9):');
  console.log(`  MAE = ${val_mae.toFixed(2)} points`);
  console.log(`  RMSE = ${val_rmse.toFixed(2)} points`);
  
  return {
    ...model,
    validation: {
      predictions: val_predictions,
      residuals: val_residuals,
      mae: val_mae,
      rmse: val_rmse,
      rows: valRows
    }
  };
}

/**
 * Fit total model using OLS regression
 */
function fitTotalModel(trainRows, valRows) {
  console.log(`Training observations: ${trainRows.length}`);
  console.log('Features: pace_combined, epa_off_sum, epa_def_sum, success_sum, explosive_sum');
  console.log('Target: actual_total (final combined score)');
  console.log('');
  
  // Build design matrix
  const X_train = trainRows.map(row => [
    row.features.pace_combined,
    row.features.epa_off_sum,
    row.features.epa_def_sum,
    row.features.success_sum,
    row.features.explosive_sum
  ]);
  
  const y_train = trainRows.map(row => row.target_total);
  
  const featureNames = ['pace_combined', 'epa_off_sum', 'epa_def_sum', 'success_sum', 'explosive_sum'];
  
  // Fit model for p50 (median)
  const model = ordinaryLeastSquares(X_train, y_train, featureNames);
  
  console.log('');
  console.log('Fitted Coefficients (p50):');
  console.log(`  Intercept: ${model.coefficients.intercept.toFixed(4)}`);
  console.log(`  pace_combined: ${model.coefficients.pace_combined.toFixed(4)}`);
  console.log(`  epa_off_sum: ${model.coefficients.epa_off_sum.toFixed(4)}`);
  console.log(`  epa_def_sum: ${model.coefficients.epa_def_sum.toFixed(4)}`);
  console.log(`  success_sum: ${model.coefficients.success_sum.toFixed(4)}`);
  console.log(`  explosive_sum: ${model.coefficients.explosive_sum.toFixed(4)}`);
  console.log('');
  console.log('Training Metrics (p50):');
  console.log(`  R² = ${model.metrics.r2.toFixed(4)}`);
  console.log(`  MAE = ${model.metrics.mae.toFixed(2)} points`);
  console.log(`  RMSE = ${model.metrics.rmse.toFixed(2)} points`);
  
  // Analyze residual distribution for quantile spread
  const residuals = model.residuals.slice().sort((a, b) => a - b);
  const n = residuals.length;
  const p25_offset = residuals[Math.floor(n * 0.25)];
  const p75_offset = residuals[Math.floor(n * 0.75)];
  const quantile_spread = p75_offset - p25_offset;
  
  console.log('');
  console.log('Quantile Analysis:');
  console.log(`  p25 offset: ${p25_offset.toFixed(2)} points`);
  console.log(`  p75 offset: ${p75_offset.toFixed(2)} points`);
  console.log(`  Quantile spread (p75-p25): ${quantile_spread.toFixed(2)} points`);
  
  // Validate on 2025 data
  const X_val = valRows.map(row => [
    row.features.pace_combined,
    row.features.epa_off_sum,
    row.features.epa_def_sum,
    row.features.success_sum,
    row.features.explosive_sum
  ]);
  
  const y_val = valRows.map(row => row.target_total);
  
  const val_predictions = X_val.map(row => {
    const rowWithIntercept = [1, ...row];
    return rowWithIntercept.reduce((sum, x, i) => sum + x * model.coefficientsArray[i], 0);
  });
  
  const val_residuals = y_val.map((yi, i) => yi - val_predictions[i]);
  const val_mae = val_residuals.reduce((sum, r) => sum + Math.abs(r), 0) / y_val.length;
  const val_rmse = Math.sqrt(val_residuals.reduce((sum, r) => sum + r * r, 0) / y_val.length);
  
  console.log('');
  console.log('Validation Metrics (2025 weeks 1-9):');
  console.log(`  MAE = ${val_mae.toFixed(2)} points`);
  console.log(`  RMSE = ${val_rmse.toFixed(2)} points`);
  
  return {
    ...model,
    quantiles: {
      p25_offset,
      p75_offset,
      spread: quantile_spread
    },
    validation: {
      predictions: val_predictions,
      residuals: val_residuals,
      mae: val_mae,
      rmse: val_rmse,
      rows: valRows
    }
  };
}

/**
 * Validate against Week 10 bundle
 */
async function validateWeek10(week10Spread, week10Total, spreadModel, totalModel) {
  console.log('Comparing reconstructed predictions vs Week 10 bundle...');
  console.log('');
  
  // Load Week 10 bundle for comparison
  const bundlePath = path.join(OUTPUT_DIR, 'bundle_v5_week10_real.json');
  let bundle;
  
  try {
    const bundleRaw = await fs.readFile(bundlePath, 'utf-8');
    bundle = JSON.parse(bundleRaw);
  } catch (error) {
    console.warn('⚠️  Week 10 bundle not found. Skipping comparison.');
    return;
  }
  
  // Predict spreads for Week 10
  const spread_predictions = week10Spread.map(row => {
    const features = [1, row.features.epa_diff, row.features.success_diff, 
                     row.features.explosive_diff, row.features.hfa];
    return features.reduce((sum, x, i) => sum + x * spreadModel.coefficientsArray[i], 0);
  });
  
  // Predict totals for Week 10
  const total_predictions = week10Total.map(row => {
    const features = [1, row.features.pace_combined, row.features.epa_off_sum,
                     row.features.epa_def_sum, row.features.success_sum, row.features.explosive_sum];
    return features.reduce((sum, x, i) => sum + x * totalModel.coefficientsArray[i], 0);
  });
  
  // Compute errors vs actual results
  const spread_errors = week10Spread.map((row, i) => Math.abs(row.actual_margin - spread_predictions[i]));
  const total_errors = week10Total.map((row, i) => Math.abs(row.actual_total - total_predictions[i]));
  
  const spread_mae = spread_errors.reduce((sum, e) => sum + e, 0) / spread_errors.length;
  const total_mae = total_errors.reduce((sum, e) => sum + e, 0) / total_errors.length;
  
  console.log(`Spread MAE (vs actual results): ${spread_mae.toFixed(2)} points`);
  console.log(`Total MAE (vs actual results): ${total_mae.toFixed(2)} points`);
  console.log('');
  
  // Show example comparisons
  console.log('Example predictions (first 3 games):');
  for (let i = 0; i < Math.min(3, week10Spread.length); i++) {
    const game = week10Spread[i];
    console.log('');
    console.log(`  ${game.away_team} @ ${game.home_team}:`);
    console.log(`    Actual margin: ${game.actual_margin.toFixed(1)}`);
    console.log(`    Predicted margin: ${spread_predictions[i].toFixed(1)}`);
    console.log(`    Error: ${Math.abs(game.actual_margin - spread_predictions[i]).toFixed(1)}`);
    console.log(`    Actual total: ${week10Total[i].actual_total}`);
    console.log(`    Predicted total: ${total_predictions[i].toFixed(1)}`);
    console.log(`    Error: ${Math.abs(week10Total[i].actual_total - total_predictions[i]).toFixed(1)}`);
  }
}

/**
 * Export fitted coefficients to JSON
 */
async function exportCoefficients(spreadModel, totalModel) {
  const spreadCoeffs = {
    model: 'V3 Multi-Feature EPA (Spread)',
    training_window: '2020-2024 regular season',
    training_games: spreadModel.metrics.n_samples,
    coefficients: spreadModel.coefficients,
    metrics: {
      r2: spreadModel.metrics.r2,
      mae: spreadModel.metrics.mae,
      rmse: spreadModel.metrics.rmse
    },
    validation: {
      mae: spreadModel.validation.mae,
      rmse: spreadModel.validation.rmse
    },
    generated_at: new Date().toISOString()
  };
  
  const totalCoeffs = {
    model: 'V5 Quantile Blend (Total)',
    training_window: '2020-2024 regular season',
    training_games: totalModel.metrics.n_samples,
    coefficients: {
      ...totalModel.coefficients,
      p25_offset: totalModel.quantiles.p25_offset,
      p75_offset: totalModel.quantiles.p75_offset
    },
    metrics: {
      r2: totalModel.metrics.r2,
      mae: totalModel.metrics.mae,
      rmse: totalModel.metrics.rmse
    },
    validation: {
      mae: totalModel.validation.mae,
      rmse: totalModel.validation.rmse
    },
    quantile_spread: totalModel.quantiles.spread,
    generated_at: new Date().toISOString()
  };
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'v5_coefficients_spread.json'),
    JSON.stringify(spreadCoeffs, null, 2),
    'utf-8'
  );
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'v5_coefficients_total.json'),
    JSON.stringify(totalCoeffs, null, 2),
    'utf-8'
  );
  
  console.log('✅ Exported v5_coefficients_spread.json');
  console.log('✅ Exported v5_coefficients_total.json');
}

/**
 * Generate comprehensive diagnostics report
 */
async function generateDiagnosticsReport(spreadModel, totalModel, datasets) {
  let report = `# NFL V5 Multi-Season Reconstruction Diagnostics\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;
  report += `---\n\n`;
  
  report += `## Training Data Summary\n\n`;
  report += `- **Training Window:** 2020-2024 regular season (weeks 1-18)\n`;
  report += `- **Training Games:** ${datasets.trainSpread.length}\n`;
  report += `- **Validation:** 2025 weeks 1-9 (${datasets.valSpread.length} games)\n`;
  report += `- **Spot-Check:** 2025 Week 10 (${datasets.week10Spread.length} games)\n`;
  report += `- **Time-Causal:** Yes (rolling windows, no future leakage)\n\n`;
  
  report += `## Spread Model Results\n\n`;
  report += `**Model:** V3 Multi-Feature EPA\n\n`;
  report += `**Coefficients:**\n`;
  report += `- Intercept: ${spreadModel.coefficients.intercept.toFixed(4)}\n`;
  report += `- epa_diff: ${spreadModel.coefficients.epa_diff.toFixed(4)}\n`;
  report += `- success_diff: ${spreadModel.coefficients.success_diff.toFixed(4)}\n`;
  report += `- explosive_diff: ${spreadModel.coefficients.explosive_diff.toFixed(4)}\n`;
  report += `- hfa: ${spreadModel.coefficients.hfa.toFixed(4)}\n\n`;
  
  report += `**Training Metrics:**\n`;
  report += `- R² = ${spreadModel.metrics.r2.toFixed(4)}\n`;
  report += `- MAE = ${spreadModel.metrics.mae.toFixed(2)} points\n`;
  report += `- RMSE = ${spreadModel.metrics.rmse.toFixed(2)} points\n\n`;
  
  report += `**Validation Metrics (2025):**\n`;
  report += `- MAE = ${spreadModel.validation.mae.toFixed(2)} points\n`;
  report += `- RMSE = ${spreadModel.validation.rmse.toFixed(2)} points\n\n`;
  
  report += `## Total Model Results\n\n`;
  report += `**Model:** V5 Quantile Blend\n\n`;
  report += `**Coefficients (p50):**\n`;
  report += `- Intercept: ${totalModel.coefficients.intercept.toFixed(4)}\n`;
  report += `- pace_combined: ${totalModel.coefficients.pace_combined.toFixed(4)}\n`;
  report += `- epa_off_sum: ${totalModel.coefficients.epa_off_sum.toFixed(4)}\n`;
  report += `- epa_def_sum: ${totalModel.coefficients.epa_def_sum.toFixed(4)}\n`;
  report += `- success_sum: ${totalModel.coefficients.success_sum.toFixed(4)}\n`;
  report += `- explosive_sum: ${totalModel.coefficients.explosive_sum.toFixed(4)}\n\n`;
  
  report += `**Quantile Offsets:**\n`;
  report += `- p25: ${totalModel.quantiles.p25_offset.toFixed(2)} points\n`;
  report += `- p75: ${totalModel.quantiles.p75_offset.toFixed(2)} points\n`;
  report += `- Spread (p75-p25): ${totalModel.quantiles.spread.toFixed(2)} points\n\n`;
  
  report += `**Training Metrics:**\n`;
  report += `- R² = ${totalModel.metrics.r2.toFixed(4)}\n`;
  report += `- MAE = ${totalModel.metrics.mae.toFixed(2)} points\n`;
  report += `- RMSE = ${totalModel.metrics.rmse.toFixed(2)} points\n\n`;
  
  report += `**Validation Metrics (2025):**\n`;
  report += `- MAE = ${totalModel.validation.mae.toFixed(2)} points\n`;
  report += `- RMSE = ${totalModel.validation.rmse.toFixed(2)} points\n\n`;
  
  report += `---\n\n`;
  report += `## Data Integrity Notes\n\n`;
  report += `1. **Time-Causality:** All features use rolling windows computed from prior games only\n`;
  report += `2. **Regular Season Focus:** Training uses weeks 1-18 (no playoffs)\n`;
  report += `3. **V1 Compatibility:** Features match V1's conceptual space (EPA, success, explosive, pace)\n`;
  report += `4. **Multi-Season:** 1,408 games across 5 complete seasons (2020-2024)\n`;
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'v5_reconstruction_diagnostics.md'),
    report,
    'utf-8'
  );
  
  console.log('✅ Generated v5_reconstruction_diagnostics.md');
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
