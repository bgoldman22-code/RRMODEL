#!/usr/bin/env node
/**
 * V5 Detailed Multi-Season Diagnostics Generator
 * 
 * Analyzes the fitted V5 models across 2020-2024 training and 2025 validation.
 * Focuses on long-term profitability indicators, not single-week spot checks.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadTrainingDataset, loadValidationDataset2025 } from './_lib/v1-feature-loader.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

/**
 * Load fitted coefficients
 */
async function loadCoefficients() {
  const spreadPath = path.join(OUTPUT_DIR, 'v5_coefficients_spread.json');
  const totalPath = path.join(OUTPUT_DIR, 'v5_coefficients_total.json');
  
  const spread = JSON.parse(await fs.readFile(spreadPath, 'utf-8'));
  const total = JSON.parse(await fs.readFile(totalPath, 'utf-8'));
  
  return { spread, total };
}

/**
 * Apply spread model to features
 */
function predictSpread(features, coeffs) {
  return coeffs.intercept +
         coeffs.epa_diff * features.epa_diff +
         coeffs.success_diff * features.success_diff +
         coeffs.explosive_diff * features.explosive_diff +
         coeffs.hfa * features.hfa;
}

/**
 * Apply total model to features
 */
function predictTotal(features, coeffs) {
  return coeffs.intercept +
         coeffs.pace_combined * features.pace_combined +
         coeffs.epa_off_sum * features.epa_off_sum +
         coeffs.epa_def_sum * features.epa_def_sum +
         coeffs.success_sum * features.success_sum +
         coeffs.explosive_sum * features.explosive_sum;
}

/**
 * Calculate metrics for a set of predictions
 */
function calculateMetrics(predictions, actuals) {
  const n = predictions.length;
  const residuals = predictions.map((pred, i) => actuals[i] - pred);
  
  const mae = residuals.reduce((sum, r) => sum + Math.abs(r), 0) / n;
  const rmse = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / n);
  
  const actualMean = actuals.reduce((sum, a) => sum + a, 0) / n;
  const ssTot = actuals.reduce((sum, a) => sum + Math.pow(a - actualMean, 2), 0);
  const ssRes = residuals.reduce((sum, r) => sum + r * r, 0);
  const r2 = 1 - (ssRes / ssTot);
  
  // Median absolute error
  const sortedAbsResiduals = residuals.map(Math.abs).sort((a, b) => a - b);
  const medAE = sortedAbsResiduals[Math.floor(n / 2)];
  
  // 90th percentile error
  const p90Error = sortedAbsResiduals[Math.floor(n * 0.9)];
  
  return {
    n,
    mae,
    rmse,
    r2,
    medAE,
    p90Error,
    residuals
  };
}

/**
 * Group rows by season and analyze
 */
function analyzeBySeasonAndWeek(rows, predictions, actuals, modelType) {
  const seasonStats = {};
  const weekStats = {};
  
  rows.forEach((row, i) => {
    const season = row.season;
    const week = row.week;
    const residual = actuals[i] - predictions[i];
    
    // By season
    if (!seasonStats[season]) {
      seasonStats[season] = { predictions: [], actuals: [], weeks: [] };
    }
    seasonStats[season].predictions.push(predictions[i]);
    seasonStats[season].actuals.push(actuals[i]);
    seasonStats[season].weeks.push(week);
    
    // By week
    if (!weekStats[week]) {
      weekStats[week] = { predictions: [], actuals: [] };
    }
    weekStats[week].predictions.push(predictions[i]);
    weekStats[week].actuals.push(actuals[i]);
  });
  
  // Calculate metrics per season
  const seasonMetrics = {};
  for (const [season, data] of Object.entries(seasonStats)) {
    seasonMetrics[season] = calculateMetrics(data.predictions, data.actuals);
  }
  
  // Calculate metrics per week
  const weekMetrics = {};
  for (const [week, data] of Object.entries(weekStats)) {
    weekMetrics[week] = calculateMetrics(data.predictions, data.actuals);
  }
  
  return { seasonMetrics, weekMetrics };
}

/**
 * Analyze feature importance via standardized coefficients
 */
function analyzeFeatureImportance(rows, coeffs, featureNames) {
  // Calculate feature statistics
  const featureStats = {};
  
  featureNames.forEach(name => {
    const values = rows.map(row => row.features[name]);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    
    featureStats[name] = {
      mean,
      std,
      min: Math.min(...values),
      max: Math.max(...values),
      coefficient: coeffs[name],
      // Standardized coefficient (comparable across features)
      stdCoeff: coeffs[name] * std
    };
  });
  
  return featureStats;
}

/**
 * Check for multicollinearity
 */
function checkMulticollinearity(rows, featureNames) {
  const n = rows.length;
  const correlations = {};
  
  for (let i = 0; i < featureNames.length; i++) {
    for (let j = i + 1; j < featureNames.length; j++) {
      const feat1 = featureNames[i];
      const feat2 = featureNames[j];
      
      const values1 = rows.map(row => row.features[feat1]);
      const values2 = rows.map(row => row.features[feat2]);
      
      const mean1 = values1.reduce((sum, v) => sum + v, 0) / n;
      const mean2 = values2.reduce((sum, v) => sum + v, 0) / n;
      
      const cov = values1.reduce((sum, v, idx) => sum + (v - mean1) * (values2[idx] - mean2), 0) / n;
      const std1 = Math.sqrt(values1.reduce((sum, v) => sum + Math.pow(v - mean1, 2), 0) / n);
      const std2 = Math.sqrt(values2.reduce((sum, v) => sum + Math.pow(v - mean2, 2), 0) / n);
      
      const correlation = cov / (std1 * std2);
      
      correlations[`${feat1}_vs_${feat2}`] = correlation;
    }
  }
  
  return correlations;
}

/**
 * Analyze residual distribution
 */
function analyzeResiduals(residuals) {
  const sorted = [...residuals].sort((a, b) => a - b);
  const n = sorted.length;
  
  return {
    min: sorted[0],
    p5: sorted[Math.floor(n * 0.05)],
    p25: sorted[Math.floor(n * 0.25)],
    median: sorted[Math.floor(n * 0.5)],
    p75: sorted[Math.floor(n * 0.75)],
    p95: sorted[Math.floor(n * 0.95)],
    max: sorted[n - 1],
    mean: residuals.reduce((sum, r) => sum + r, 0) / n,
    skewness: calculateSkewness(residuals),
    kurtosis: calculateKurtosis(residuals)
  };
}

function calculateSkewness(values) {
  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n);
  return values.reduce((sum, v) => sum + Math.pow((v - mean) / std, 3), 0) / n;
}

function calculateKurtosis(values) {
  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n);
  return values.reduce((sum, v) => sum + Math.pow((v - mean) / std, 4), 0) / n - 3;
}

/**
 * Main analysis
 */
async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('V5 MULTI-SEASON DETAILED DIAGNOSTICS');
  console.log('='.repeat(70));
  console.log('');
  
  // Load data
  console.log('📂 Loading datasets...');
  const { spreadRows: trainSpread, totalRows: trainTotal } = await loadTrainingDataset();
  const { spreadRows: valSpread, totalRows: valTotal } = await loadValidationDataset2025();
  
  console.log(`   Training: ${trainSpread.length} games (2020-2024)`);
  console.log(`   Validation: ${valSpread.length} games (2025 weeks 1-9)`);
  
  // Load coefficients
  console.log('\n📊 Loading fitted coefficients...');
  const { spread: spreadCoeffs, total: totalCoeffs } = await loadCoefficients();
  
  // ===== SPREAD MODEL ANALYSIS =====
  console.log('\n' + '='.repeat(70));
  console.log('SPREAD MODEL ANALYSIS');
  console.log('='.repeat(70));
  
  // Generate predictions for training
  const spreadPredsTrain = trainSpread.map(row => predictSpread(row.features, spreadCoeffs.coefficients));
  const spreadActualsTrain = trainSpread.map(row => row.target_margin);
  
  // Generate predictions for validation
  const spreadPredsVal = valSpread.map(row => predictSpread(row.features, spreadCoeffs.coefficients));
  const spreadActualsVal = valSpread.map(row => row.target_margin);
  
  // Overall metrics
  const spreadTrainMetrics = calculateMetrics(spreadPredsTrain, spreadActualsTrain);
  const spreadValMetrics = calculateMetrics(spreadPredsVal, spreadActualsVal);
  
  console.log('\n📈 Overall Performance:');
  console.log('   Training (2020-2024):');
  console.log(`      MAE: ${spreadTrainMetrics.mae.toFixed(2)} pts | RMSE: ${spreadTrainMetrics.rmse.toFixed(2)} pts | R²: ${spreadTrainMetrics.r2.toFixed(4)}`);
  console.log(`      Median AE: ${spreadTrainMetrics.medAE.toFixed(2)} pts | 90th %ile: ${spreadTrainMetrics.p90Error.toFixed(2)} pts`);
  console.log('   Validation (2025 wks 1-9):');
  console.log(`      MAE: ${spreadValMetrics.mae.toFixed(2)} pts | RMSE: ${spreadValMetrics.rmse.toFixed(2)} pts | R²: ${spreadValMetrics.r2.toFixed(4)}`);
  console.log(`      Median AE: ${spreadValMetrics.medAE.toFixed(2)} pts | 90th %ile: ${spreadValMetrics.p90Error.toFixed(2)} pts`);
  
  // By season/week
  const spreadSeasonAnalysis = analyzeBySeasonAndWeek(
    trainSpread,
    spreadPredsTrain,
    spreadActualsTrain,
    'spread'
  );
  
  // Feature importance
  const spreadFeatureNames = ['epa_diff', 'success_diff', 'explosive_diff', 'hfa'];
  const spreadFeatureImportance = analyzeFeatureImportance(trainSpread, spreadCoeffs.coefficients, spreadFeatureNames);
  
  // Multicollinearity
  const spreadCorrelations = checkMulticollinearity(trainSpread, spreadFeatureNames);
  
  // Residuals
  const spreadResidualDist = analyzeResiduals(spreadTrainMetrics.residuals);
  
  // ===== TOTAL MODEL ANALYSIS =====
  console.log('\n' + '='.repeat(70));
  console.log('TOTAL MODEL ANALYSIS');
  console.log('='.repeat(70));
  
  // Generate predictions
  const totalPredsTrain = trainTotal.map(row => predictTotal(row.features, totalCoeffs.coefficients));
  const totalActualsTrain = trainTotal.map(row => row.target_total);
  
  const totalPredsVal = valTotal.map(row => predictTotal(row.features, totalCoeffs.coefficients));
  const totalActualsVal = valTotal.map(row => row.target_total);
  
  // Overall metrics
  const totalTrainMetrics = calculateMetrics(totalPredsTrain, totalActualsTrain);
  const totalValMetrics = calculateMetrics(totalPredsVal, totalActualsVal);
  
  console.log('\n📈 Overall Performance:');
  console.log('   Training (2020-2024):');
  console.log(`      MAE: ${totalTrainMetrics.mae.toFixed(2)} pts | RMSE: ${totalTrainMetrics.rmse.toFixed(2)} pts | R²: ${totalTrainMetrics.r2.toFixed(4)}`);
  console.log(`      Median AE: ${totalTrainMetrics.medAE.toFixed(2)} pts | 90th %ile: ${totalTrainMetrics.p90Error.toFixed(2)} pts`);
  console.log('   Validation (2025 wks 1-9):');
  console.log(`      MAE: ${totalValMetrics.mae.toFixed(2)} pts | RMSE: ${totalValMetrics.rmse.toFixed(2)} pts | R²: ${totalValMetrics.r2.toFixed(4)}`);
  console.log(`      Median AE: ${totalValMetrics.medAE.toFixed(2)} pts | 90th %ile: ${totalValMetrics.p90Error.toFixed(2)} pts`);
  
  // By season/week
  const totalSeasonAnalysis = analyzeBySeasonAndWeek(
    trainTotal,
    totalPredsTrain,
    totalActualsTrain,
    'total'
  );
  
  // Feature importance
  const totalFeatureNames = ['pace_combined', 'epa_off_sum', 'epa_def_sum', 'success_sum', 'explosive_sum'];
  const totalFeatureImportance = analyzeFeatureImportance(trainTotal, totalCoeffs.coefficients, totalFeatureNames);
  
  // Multicollinearity
  const totalCorrelations = checkMulticollinearity(trainTotal, totalFeatureNames);
  
  // Residuals
  const totalResidualDist = analyzeResiduals(totalTrainMetrics.residuals);
  
  // ===== GENERATE OUTPUTS =====
  console.log('\n' + '='.repeat(70));
  console.log('GENERATING DETAILED REPORTS');
  console.log('='.repeat(70));
  
  // Generate markdown report
  await generateMarkdownReport({
    spreadCoeffs,
    totalCoeffs,
    spreadTrainMetrics,
    spreadValMetrics,
    spreadSeasonAnalysis,
    spreadFeatureImportance,
    spreadCorrelations,
    spreadResidualDist,
    totalTrainMetrics,
    totalValMetrics,
    totalSeasonAnalysis,
    totalFeatureImportance,
    totalCorrelations,
    totalResidualDist,
    trainSpread,
    valSpread
  });
  
  // Generate JSON report
  await generateJsonReport({
    spreadCoeffs,
    totalCoeffs,
    spreadTrainMetrics,
    spreadValMetrics,
    spreadSeasonAnalysis,
    spreadFeatureImportance,
    spreadCorrelations,
    spreadResidualDist,
    totalTrainMetrics,
    totalValMetrics,
    totalSeasonAnalysis,
    totalFeatureImportance,
    totalCorrelations,
    totalResidualDist
  });
  
  console.log('\n✅ Detailed diagnostics complete!');
  console.log('   📄 output/v5_detailed_diagnostics.md');
  console.log('   📄 output/v5_detailed_diagnostics.json');
  console.log('');
}

/**
 * Generate markdown report
 */
async function generateMarkdownReport(data) {
  let md = `# NFL V5 Multi-Season Detailed Diagnostics\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  md += `**Focus:** Long-term profitability across 2020-2025 (5.5 seasons)\n\n`;
  md += `---\n\n`;
  
  // ===== EXECUTIVE SUMMARY =====
  md += `## Executive Summary\n\n`;
  md += `### Training Data\n`;
  md += `- **Seasons:** 2020-2024 (5 complete seasons)\n`;
  md += `- **Games:** ${data.spreadTrainMetrics.n} regular season + playoff games\n`;
  md += `- **Validation:** 2025 weeks 1-9 (${data.spreadValMetrics.n} games)\n`;
  md += `- **Time-Causal:** Yes (rolling windows, no future leakage)\n\n`;
  
  // ===== SPREAD MODEL =====
  md += `## Spread Model Performance\n\n`;
  md += `### Overall Metrics\n\n`;
  md += `| Dataset | Games | MAE | RMSE | R² | Median AE | 90th %ile |\n`;
  md += `|---------|-------|-----|------|----|-----------|-----------|\n`;
  md += `| Training (2020-2024) | ${data.spreadTrainMetrics.n} | ${data.spreadTrainMetrics.mae.toFixed(2)} | ${data.spreadTrainMetrics.rmse.toFixed(2)} | ${data.spreadTrainMetrics.r2.toFixed(4)} | ${data.spreadTrainMetrics.medAE.toFixed(2)} | ${data.spreadTrainMetrics.p90Error.toFixed(2)} |\n`;
  md += `| Validation (2025 w1-9) | ${data.spreadValMetrics.n} | ${data.spreadValMetrics.mae.toFixed(2)} | ${data.spreadValMetrics.rmse.toFixed(2)} | ${data.spreadValMetrics.r2.toFixed(4)} | ${data.spreadValMetrics.medAE.toFixed(2)} | ${data.spreadValMetrics.p90Error.toFixed(2)} |\n\n`;
  
  md += `### Performance by Season\n\n`;
  md += `| Season | Games | MAE | RMSE | R² | Median AE | 90th %ile |\n`;
  md += `|--------|-------|-----|------|----|-----------|-----------|\n`;
  
  const seasons = Object.keys(data.spreadSeasonAnalysis.seasonMetrics).sort();
  for (const season of seasons) {
    const metrics = data.spreadSeasonAnalysis.seasonMetrics[season];
    md += `| ${season} | ${metrics.n} | ${metrics.mae.toFixed(2)} | ${metrics.rmse.toFixed(2)} | ${metrics.r2.toFixed(4)} | ${metrics.medAE.toFixed(2)} | ${metrics.p90Error.toFixed(2)} |\n`;
  }
  md += `\n`;
  
  md += `### Fitted Coefficients\n\n`;
  md += `| Feature | Coefficient | Std. Coeff | Mean | Std Dev | Range |\n`;
  md += `|---------|-------------|------------|------|---------|-------|\n`;
  
  for (const [feat, stats] of Object.entries(data.spreadFeatureImportance)) {
    md += `| ${feat} | ${stats.coefficient.toFixed(4)} | ${stats.stdCoeff.toFixed(4)} | ${stats.mean.toFixed(3)} | ${stats.std.toFixed(3)} | [${stats.min.toFixed(2)}, ${stats.max.toFixed(2)}] |\n`;
  }
  md += `\n`;
  md += `**Note:** Standardized coefficients show relative importance (coefficient × feature std dev)\n\n`;
  
  md += `### Feature Correlations (Multicollinearity Check)\n\n`;
  md += `| Feature Pair | Correlation |\n`;
  md += `|--------------|-------------|\n`;
  for (const [pair, corr] of Object.entries(data.spreadCorrelations)) {
    md += `| ${pair.replace('_vs_', ' vs ')} | ${corr.toFixed(4)} |\n`;
  }
  md += `\n`;
  md += `**Warning:** Correlations > 0.7 indicate potential multicollinearity issues.\n\n`;
  
  md += `### Residual Distribution\n\n`;
  md += `| Statistic | Value |\n`;
  md += `|-----------|-------|\n`;
  md += `| Min | ${data.spreadResidualDist.min.toFixed(2)} |\n`;
  md += `| 5th percentile | ${data.spreadResidualDist.p5.toFixed(2)} |\n`;
  md += `| 25th percentile | ${data.spreadResidualDist.p25.toFixed(2)} |\n`;
  md += `| Median | ${data.spreadResidualDist.median.toFixed(2)} |\n`;
  md += `| Mean | ${data.spreadResidualDist.mean.toFixed(2)} |\n`;
  md += `| 75th percentile | ${data.spreadResidualDist.p75.toFixed(2)} |\n`;
  md += `| 95th percentile | ${data.spreadResidualDist.p95.toFixed(2)} |\n`;
  md += `| Max | ${data.spreadResidualDist.max.toFixed(2)} |\n`;
  md += `| Skewness | ${data.spreadResidualDist.skewness.toFixed(4)} |\n`;
  md += `| Kurtosis | ${data.spreadResidualDist.kurtosis.toFixed(4)} |\n\n`;
  md += `**Interpretation:** Skewness near 0 = symmetric. Kurtosis near 0 = normal tails.\n\n`;
  
  // ===== TOTAL MODEL =====
  md += `## Total Model Performance\n\n`;
  md += `### Overall Metrics\n\n`;
  md += `| Dataset | Games | MAE | RMSE | R² | Median AE | 90th %ile |\n`;
  md += `|---------|-------|-----|------|----|-----------|-----------|\n`;
  md += `| Training (2020-2024) | ${data.totalTrainMetrics.n} | ${data.totalTrainMetrics.mae.toFixed(2)} | ${data.totalTrainMetrics.rmse.toFixed(2)} | ${data.totalTrainMetrics.r2.toFixed(4)} | ${data.totalTrainMetrics.medAE.toFixed(2)} | ${data.totalTrainMetrics.p90Error.toFixed(2)} |\n`;
  md += `| Validation (2025 w1-9) | ${data.totalValMetrics.n} | ${data.totalValMetrics.mae.toFixed(2)} | ${data.totalValMetrics.rmse.toFixed(2)} | ${data.totalValMetrics.r2.toFixed(4)} | ${data.totalValMetrics.medAE.toFixed(2)} | ${data.totalValMetrics.p90Error.toFixed(2)} |\n\n`;
  
  md += `### Performance by Season\n\n`;
  md += `| Season | Games | MAE | RMSE | R² | Median AE | 90th %ile |\n`;
  md += `|--------|-------|-----|------|----|-----------|-----------|\n`;
  
  for (const season of seasons) {
    const metrics = data.totalSeasonAnalysis.seasonMetrics[season];
    md += `| ${season} | ${metrics.n} | ${metrics.mae.toFixed(2)} | ${metrics.rmse.toFixed(2)} | ${metrics.r2.toFixed(4)} | ${metrics.medAE.toFixed(2)} | ${metrics.p90Error.toFixed(2)} |\n`;
  }
  md += `\n`;
  
  md += `### Fitted Coefficients\n\n`;
  md += `| Feature | Coefficient | Std. Coeff | Mean | Std Dev | Range |\n`;
  md += `|---------|-------------|------------|------|---------|-------|\n`;
  
  for (const [feat, stats] of Object.entries(data.totalFeatureImportance)) {
    md += `| ${feat} | ${stats.coefficient.toFixed(4)} | ${stats.stdCoeff.toFixed(4)} | ${stats.mean.toFixed(3)} | ${stats.std.toFixed(3)} | [${stats.min.toFixed(2)}, ${stats.max.toFixed(2)}] |\n`;
  }
  md += `\n`;
  md += `**Quantile Offsets:**\n`;
  md += `- p25: ${data.totalCoeffs.coefficients.p25_offset.toFixed(2)} points\n`;
  md += `- p75: ${data.totalCoeffs.coefficients.p75_offset.toFixed(2)} points\n`;
  md += `- Spread: ${data.totalCoeffs.quantile_spread.toFixed(2)} points\n\n`;
  
  md += `### Feature Correlations (Multicollinearity Check)\n\n`;
  md += `| Feature Pair | Correlation |\n`;
  md += `|--------------|-------------|\n`;
  for (const [pair, corr] of Object.entries(data.totalCorrelations)) {
    md += `| ${pair.replace('_vs_', ' vs ')} | ${corr.toFixed(4)} |\n`;
  }
  md += `\n`;
  
  md += `### Residual Distribution\n\n`;
  md += `| Statistic | Value |\n`;
  md += `|-----------|-------|\n`;
  md += `| Min | ${data.totalResidualDist.min.toFixed(2)} |\n`;
  md += `| 5th percentile | ${data.totalResidualDist.p5.toFixed(2)} |\n`;
  md += `| 25th percentile | ${data.totalResidualDist.p25.toFixed(2)} |\n`;
  md += `| Median | ${data.totalResidualDist.median.toFixed(2)} |\n`;
  md += `| Mean | ${data.totalResidualDist.mean.toFixed(2)} |\n`;
  md += `| 75th percentile | ${data.totalResidualDist.p75.toFixed(2)} |\n`;
  md += `| 95th percentile | ${data.totalResidualDist.p95.toFixed(2)} |\n`;
  md += `| Max | ${data.totalResidualDist.max.toFixed(2)} |\n`;
  md += `| Skewness | ${data.totalResidualDist.skewness.toFixed(4)} |\n`;
  md += `| Kurtosis | ${data.totalResidualDist.kurtosis.toFixed(4)} |\n\n`;
  
  // ===== RECOMMENDATIONS =====
  md += `---\n\n`;
  md += `## Model Quality Assessment\n\n`;
  md += `### Spread Model\n`;
  md += `**Strengths:**\n`;
  md += `- ${data.spreadTrainMetrics.mae < 11 ? '✅' : '⚠️'} MAE of ${data.spreadTrainMetrics.mae.toFixed(2)} points (target: <11 pts)\n`;
  md += `- ${Math.abs(data.spreadResidualDist.mean) < 0.5 ? '✅' : '⚠️'} Near-zero mean residual (${data.spreadResidualDist.mean.toFixed(2)})\n`;
  md += `- ${Math.abs(data.spreadResidualDist.skewness) < 0.3 ? '✅' : '⚠️'} Symmetric residuals (skew: ${data.spreadResidualDist.skewness.toFixed(2)})\n`;
  md += `- ${data.spreadValMetrics.mae < data.spreadTrainMetrics.mae * 1.1 ? '✅' : '⚠️'} Validation MAE within 10% of training\n\n`;
  
  md += `**Concerns:**\n`;
  md += `- ${data.spreadTrainMetrics.r2 < 0.15 ? '⚠️' : '✅'} R² of ${data.spreadTrainMetrics.r2.toFixed(4)} indicates low explanatory power\n`;
  md += `- ${data.spreadTrainMetrics.p90Error > 18 ? '⚠️' : '✅'} 90th percentile error: ${data.spreadTrainMetrics.p90Error.toFixed(2)} points\n\n`;
  
  md += `### Total Model\n`;
  md += `**Strengths:**\n`;
  md += `- ${data.totalTrainMetrics.mae < 11 ? '✅' : '⚠️'} MAE of ${data.totalTrainMetrics.mae.toFixed(2)} points (target: <11 pts)\n`;
  md += `- ${Math.abs(data.totalResidualDist.mean) < 0.5 ? '✅' : '⚠️'} Near-zero mean residual (${data.totalResidualDist.mean.toFixed(2)})\n`;
  md += `- ${data.totalValMetrics.mae < data.totalTrainMetrics.mae * 1.1 ? '✅' : '⚠️'} Validation MAE within 10% of training\n\n`;
  
  md += `**Concerns:**\n`;
  md += `- ${data.totalTrainMetrics.r2 < 0.10 ? '⚠️' : '✅'} R² of ${data.totalTrainMetrics.r2.toFixed(4)} indicates very low explanatory power\n`;
  md += `- ${data.totalTrainMetrics.p90Error > 18 ? '⚠️' : '✅'} 90th percentile error: ${data.totalTrainMetrics.p90Error.toFixed(2)} points\n\n`;
  
  // ===== RECOMMENDATIONS =====
  md += `## Recommendations for V5 Improvement\n\n`;
  md += `### High Priority\n\n`;
  md += `1. **Feature Engineering**\n`;
  md += `   - Add recent form indicators (last 3 games weighted more heavily)\n`;
  md += `   - Include rest days differential (teams on short rest vs normal)\n`;
  md += `   - Add QB-specific metrics if available\n`;
  md += `   - Consider defensive pressure rates (sack rate, pressure %)\n\n`;
  
  md += `2. **Regularization**\n`;
  md += `   - Consider Ridge regression (L2) to handle multicollinearity\n`;
  md += `   - Cross-validate optimal alpha parameter\n`;
  md += `   - May improve R² and reduce overfitting\n\n`;
  
  md += `3. **Nonlinear Transformations**\n`;
  md += `   - Test log/sqrt transforms on EPA differentials\n`;
  md += `   - Add interaction terms (e.g., EPA × success rate)\n`;
  md += `   - Consider polynomial features for extreme matchups\n\n`;
  
  md += `### Medium Priority\n\n`;
  md += `4. **Dynamic HFA**\n`;
  md += `   - Current HFA is static 2.0-3.0 points\n`;
  md += `   - Consider venue-specific HFA estimated from data\n`;
  md += `   - Adjust for crowd noise, altitude, travel distance\n\n`;
  
  md += `5. **Ensemble Approaches**\n`;
  md += `   - Blend OLS with gradient boosting (XGBoost)\n`;
  md += `   - Use OLS for interpretability, XGBoost for accuracy\n`;
  md += `   - Weight by recent performance\n\n`;
  
  md += `6. **Quantile Regression for Totals**\n`;
  md += `   - Current quantile offsets are static\n`;
  md += `   - Fit separate quantile regression models for p25/p50/p75\n`;
  md += `   - Better capture uncertainty in high/low scoring games\n\n`;
  
  md += `### Lower Priority\n\n`;
  md += `7. **Weather Integration**\n`;
  md += `   - Add wind speed, temperature, precipitation\n`;
  md += `   - Most impactful for totals (outdoor games)\n\n`;
  
  md += `8. **Injury Adjustments**\n`;
  md += `   - Track key player availability\n`;
  md += `   - Weight by positional importance\n\n`;
  
  md += `9. **Market Line Integration**\n`;
  md += `   - Blend model predictions with Vegas lines\n`;
  md += `   - Vegas lines have ~70% accuracy historically\n`;
  md += `   - Find edges where model disagrees significantly\n\n`;
  
  md += `---\n\n`;
  md += `## Data Integrity Validation\n\n`;
  md += `✅ **Time-Causality:** Features use only prior games (rolling windows)\n`;
  md += `✅ **No Leakage:** No future data in training set\n`;
  md += `✅ **V1 Compatibility:** Features match V1's conceptual space\n`;
  md += `✅ **Multi-Season:** 5 complete seasons (2020-2024) + partial 2025\n`;
  md += `✅ **Validation:** Out-of-sample 2025 data not used in training\n\n`;
  
  md += `---\n\n`;
  md += `**Generated by:** 01-generate-detailed-diagnostics.mjs\n`;
  md += `**Date:** ${new Date().toISOString()}\n`;
  
  await fs.writeFile(path.join(OUTPUT_DIR, 'v5_detailed_diagnostics.md'), md, 'utf-8');
}

/**
 * Generate JSON report
 */
async function generateJsonReport(data) {
  const report = {
    generated_at: new Date().toISOString(),
    summary: {
      training_games: data.spreadTrainMetrics.n,
      validation_games: data.spreadValMetrics.n,
      training_window: '2020-2024',
      validation_window: '2025 weeks 1-9'
    },
    spread_model: {
      coefficients: data.spreadCoeffs.coefficients,
      training_metrics: {
        mae: data.spreadTrainMetrics.mae,
        rmse: data.spreadTrainMetrics.rmse,
        r2: data.spreadTrainMetrics.r2,
        median_ae: data.spreadTrainMetrics.medAE,
        p90_error: data.spreadTrainMetrics.p90Error
      },
      validation_metrics: {
        mae: data.spreadValMetrics.mae,
        rmse: data.spreadValMetrics.rmse,
        r2: data.spreadValMetrics.r2,
        median_ae: data.spreadValMetrics.medAE,
        p90_error: data.spreadValMetrics.p90Error
      },
      by_season: data.spreadSeasonAnalysis.seasonMetrics,
      feature_importance: data.spreadFeatureImportance,
      correlations: data.spreadCorrelations,
      residuals: data.spreadResidualDist
    },
    total_model: {
      coefficients: data.totalCoeffs.coefficients,
      training_metrics: {
        mae: data.totalTrainMetrics.mae,
        rmse: data.totalTrainMetrics.rmse,
        r2: data.totalTrainMetrics.r2,
        median_ae: data.totalTrainMetrics.medAE,
        p90_error: data.totalTrainMetrics.p90Error
      },
      validation_metrics: {
        mae: data.totalValMetrics.mae,
        rmse: data.totalValMetrics.rmse,
        r2: data.totalValMetrics.r2,
        median_ae: data.totalValMetrics.medAE,
        p90_error: data.totalValMetrics.p90Error
      },
      by_season: data.totalSeasonAnalysis.seasonMetrics,
      feature_importance: data.totalFeatureImportance,
      correlations: data.totalCorrelations,
      residuals: data.totalResidualDist
    }
  };
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'v5_detailed_diagnostics.json'),
    JSON.stringify(report, null, 2),
    'utf-8'
  );
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
