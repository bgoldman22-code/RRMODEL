#!/usr/bin/env node
/**
 * Meta-Model Signal Check
 * 
 * CRITICAL DECISION POINT: Does our model (μ, σ) add information beyond market price?
 * 
 * Fits logistic regression: Logit(OverHit) ~ q_mkt + z_model + contextual_flags
 * 
 * If β(z_model) > 0 and significant:
 *   → Model has signal, problem is bet SELECTION
 *   → Fix: Remove selection bias, retune σ/z_temp
 * 
 * If β(z_model) ≈ 0 or not significant:
 *   → Model has NO edge over market
 *   → Fix: Add features (injuries, matchups) or abandon
 * 
 * Usage:
 *   node scripts/nba/meta-model-check.mjs [--results=path/to/results.json]
 * 
 * Outputs:
 *   - data/nba/meta-model-results.json (coefficients, p-values, AIC/BIC)
 *   - Lift curves by z_model decile
 *   - Reliability plot
 */

import fs from 'fs';
import path from 'path';
import { linearRegression, logistic, logit } from './_lib/math_utils.mjs';

const RESULTS_PATH = process.argv.find(arg => arg.startsWith('--results='))
  ?.split('=')[1] || 'data/nba/holdout-validation-enhanced-results.json';

const OUTPUT_PATH = 'data/nba/meta-model-results.json';

// ============================================================================
// UTILITIES
// ============================================================================

function percentile(arr, p) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Fit logistic regression using Newton-Raphson (max 100 iterations)
 * 
 * Model: P(y=1) = logistic(β₀ + β₁x₁ + β₂x₂ + ...)
 * 
 * Returns:
 *   - coefficients: [β₀, β₁, β₂, ...]
 *   - std_errors: [SE₀, SE₁, SE₂, ...]
 *   - z_scores: βᵢ / SEᵢ
 *   - p_values: 2 * (1 - normalCDF(|z|))
 *   - aic, bic
 */
function fitLogisticRegression(X, y) {
  const n = X.length;
  const p = X[0].length;
  
  // Initialize coefficients to zero
  let beta = Array(p).fill(0);
  
  // Newton-Raphson iterations
  for (let iter = 0; iter < 100; iter++) {
    // Compute predicted probabilities
    const pi = X.map(row => {
      const z = row.reduce((sum, x, i) => sum + x * beta[i], 0);
      return logistic(z);
    });
    
    // Gradient: X^T (y - pi)
    const gradient = Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      const residual = y[i] - pi[i];
      for (let j = 0; j < p; j++) {
        gradient[j] += X[i][j] * residual;
      }
    }
    
    // Hessian: -X^T W X, where W = diag(pi * (1 - pi))
    const W = pi.map(p => p * (1 - p));
    const H = Array(p).fill(null).map(() => Array(p).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        for (let k = 0; k < p; k++) {
          H[j][k] -= X[i][j] * W[i] * X[i][k];
        }
      }
    }
    
    // Invert Hessian (simple matrix inversion for small p)
    const Hinv = invertMatrix(H);
    if (!Hinv) {
      console.warn('⚠️  Hessian not invertible, stopping early');
      break;
    }
    
    // Update: beta_new = beta_old - H^-1 * gradient
    const delta = Array(p).fill(0);
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) {
        delta[j] -= Hinv[j][k] * gradient[k];
      }
    }
    
    // Check convergence
    const maxDelta = Math.max(...delta.map(Math.abs));
    beta = beta.map((b, i) => b + delta[i]);
    
    if (maxDelta < 1e-6) {
      break;
    }
  }
  
  // Compute standard errors from Hessian
  const pi = X.map(row => {
    const z = row.reduce((sum, x, i) => sum + x * beta[i], 0);
    return logistic(z);
  });
  const W = pi.map(p => p * (1 - p));
  const H = Array(p).fill(null).map(() => Array(p).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) {
        H[j][k] -= X[i][j] * W[i] * X[i][k];
      }
    }
  }
  const Hinv = invertMatrix(H);
  const std_errors = Hinv ? Array(p).fill(0).map((_, i) => Math.sqrt(-Hinv[i][i])) : Array(p).fill(NaN);
  
  // Z-scores and p-values (approximate with normal distribution)
  const z_scores = beta.map((b, i) => b / std_errors[i]);
  const p_values = z_scores.map(z => {
    // Two-tailed p-value: 2 * (1 - Φ(|z|))
    const absZ = Math.abs(z);
    const p = normalCDF(absZ);
    return 2 * (1 - p);
  });
  
  // Log-likelihood
  const logLik = y.reduce((sum, yi, i) => {
    const p = pi[i];
    return sum + (yi === 1 ? Math.log(p + 1e-15) : Math.log(1 - p + 1e-15));
  }, 0);
  
  // AIC = -2 * logLik + 2 * p
  // BIC = -2 * logLik + p * log(n)
  const aic = -2 * logLik + 2 * p;
  const bic = -2 * logLik + p * Math.log(n);
  
  return {
    coefficients: beta,
    std_errors,
    z_scores,
    p_values,
    logLik,
    aic,
    bic,
    n_samples: n
  };
}

/**
 * Simple matrix inversion using Gauss-Jordan elimination
 * Only for small matrices (p < 20)
 */
function invertMatrix(A) {
  const n = A.length;
  const aug = A.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);
  
  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
        maxRow = k;
      }
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
    
    // Check for singularity
    if (Math.abs(aug[i][i]) < 1e-10) {
      return null;
    }
    
    // Scale pivot row
    const pivot = aug[i][i];
    for (let j = 0; j < 2 * n; j++) {
      aug[i][j] /= pivot;
    }
    
    // Eliminate column
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = aug[k][i];
        for (let j = 0; j < 2 * n; j++) {
          aug[k][j] -= factor * aug[i][j];
        }
      }
    }
  }
  
  // Extract inverse from augmented matrix
  return aug.map(row => row.slice(n));
}

/**
 * Normal CDF (Hart 1968)
 */
function normalCDF(z) {
  if (z < -6) return 0;
  if (z > 6) return 1;
  
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;
  
  if (z >= 0) {
    const t = 1 / (1 + p * z);
    return 1 - c * Math.exp(-z * z / 2) * t *
      (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  } else {
    const t = 1 / (1 - p * z);
    return c * Math.exp(-z * z / 2) * t *
      (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  }
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

console.log('🔬 Meta-Model Signal Check');
console.log('='.repeat(80));

// Load validation results
if (!fs.existsSync(RESULTS_PATH)) {
  console.error(`❌ Results file not found: ${RESULTS_PATH}`);
  console.error('   Run validate-holdout-enhanced.mjs first');
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
const predictions = results.predictions;

if (!predictions || predictions.length === 0) {
  console.error('❌ No predictions found in results file');
  process.exit(1);
}

console.log(`📊 Loaded ${predictions.length.toLocaleString()} predictions`);
console.log();

// ============================================================================
// FEATURE ENGINEERING
// ============================================================================

console.log('🔧 Engineering features...');

const samples = predictions.map(pred => {
  const hit = pred.side === 'Over' ? (pred.actual > pred.line ? 1 : 0) : (pred.actual < pred.line ? 1 : 0);
  const z = (pred.mu - pred.line) / pred.sigma;
  
  // q_mkt = no-vig market probability for the side we're evaluating
  // If Over: q_mkt = pOverImplied / (pOverImplied + pUnderImplied)
  // If Under: q_mkt = pUnderImplied / (pOverImplied + pUnderImplied)
  const pOver = 1 / (1 + Math.exp(pred.overOdds / 100));
  const pUnder = 1 / (1 + Math.exp(pred.underOdds / 100));
  const total = pOver + pUnder;
  const q_mkt_over = pOver / total;
  const q_mkt_under = pUnder / total;
  const q_mkt = pred.side === 'Over' ? q_mkt_over : q_mkt_under;
  
  // z_model = normalized distance from line
  const z_model = pred.side === 'Over' ? z : -z;
  
  // Contextual flags
  const spread = pred.spread || 0;
  const spread_big = Math.abs(spread) >= 8 ? 1 : 0;
  
  // pace_top25: we don't have pace in predictions, so skip for now
  // sdmins_top25: we don't have sdMins in predictions, so skip for now
  // Can add these later if available
  
  return {
    player: pred.player,
    date: pred.date,
    market: pred.market,
    line: pred.line,
    side: pred.side,
    actual: pred.actual,
    hit,
    q_mkt,
    z_model,
    spread_big,
    mu: pred.mu,
    sigma: pred.sigma,
    overOdds: pred.overOdds,
    underOdds: pred.underOdds
  };
});

console.log(`✅ Engineered ${samples.length.toLocaleString()} samples`);
console.log();

// ============================================================================
// FIT LOGISTIC REGRESSION
// ============================================================================

console.log('📈 Fitting logistic regression...');
console.log('   Model: Logit(OverHit) ~ q_mkt + z_model + spread_big');
console.log();

// Prepare design matrix X and response vector y
const X = samples.map(s => [
  1,           // Intercept
  s.q_mkt,     // Market probability
  s.z_model,   // Model signal
  s.spread_big // Blowout flag
]);
const y = samples.map(s => s.hit);

const featureNames = ['Intercept', 'q_mkt', 'z_model', 'spread_big'];

// Fit model
const fit = fitLogisticRegression(X, y);

console.log('📊 Regression Results:');
console.log('-'.repeat(80));
console.log('Feature         Coefficient   Std Error   Z-score   P-value   Significant');
console.log('-'.repeat(80));

featureNames.forEach((name, i) => {
  const coef = fit.coefficients[i];
  const se = fit.std_errors[i];
  const z = fit.z_scores[i];
  const p = fit.p_values[i];
  const sig = p < 0.05 ? '***' : (p < 0.10 ? '**' : (p < 0.20 ? '*' : ''));
  
  console.log(
    `${name.padEnd(15)} ${coef.toFixed(4).padStart(12)} ` +
    `${se.toFixed(4).padStart(11)} ${z.toFixed(2).padStart(9)} ` +
    `${p.toFixed(4).padStart(9)}   ${sig.padEnd(12)}`
  );
});

console.log('-'.repeat(80));
console.log(`Log-Likelihood: ${fit.logLik.toFixed(2)}`);
console.log(`AIC: ${fit.aic.toFixed(2)}`);
console.log(`BIC: ${fit.bic.toFixed(2)}`);
console.log(`N: ${fit.n_samples.toLocaleString()}`);
console.log();

// ============================================================================
// CRITICAL DECISION POINT
// ============================================================================

const z_model_coef = fit.coefficients[2];
const z_model_pval = fit.p_values[2];
const has_signal = z_model_coef > 0 && z_model_pval < 0.10;

console.log('🎯 DECISION POINT:');
console.log('='.repeat(80));

if (has_signal) {
  console.log('✅ MODEL HAS SIGNAL BEYOND MARKET PRICE');
  console.log(`   β(z_model) = ${z_model_coef.toFixed(4)} (p = ${z_model_pval.toFixed(4)})`);
  console.log();
  console.log('📌 Diagnosis: Problem is bet SELECTION, not projection');
  console.log('   - Projections (μ, σ) are informative');
  console.log('   - But selection process picks biased samples');
  console.log();
  console.log('💡 Next Steps:');
  console.log('   1. Rewrite picker with consensus filters');
  console.log('   2. Add volatility shrink (1/(1 + sdMins/4))');
  console.log('   3. Add σ triangulation from alt lines');
  console.log('   4. Test shuffle within (player, market, line) buckets');
  console.log('   5. Expect shuffle test → 49-51%');
} else {
  console.log('❌ MODEL HAS NO SIGNAL BEYOND MARKET PRICE');
  console.log(`   β(z_model) = ${z_model_coef.toFixed(4)} (p = ${z_model_pval.toFixed(4)})`);
  console.log();
  console.log('📌 Diagnosis: Model does not add information to market');
  console.log('   - Market price already incorporates all available information');
  console.log('   - Our μ/σ projections are not better than market consensus');
  console.log();
  console.log('💡 Next Steps:');
  console.log('   1. Add contextual features:');
  console.log('      - Opponent defensive stats (DRTG, pace)');
  console.log('      - Rest days (B2B flag)');
  console.log('      - Home/away splits');
  console.log('      - Recent injury history');
  console.log('   2. Try ML approach (XGBoost, neural net)');
  console.log('   3. Or document findings and recommend abandoning');
}

console.log('='.repeat(80));
console.log();

// ============================================================================
// LIFT CURVES (by z_model decile)
// ============================================================================

console.log('📊 Lift Analysis by z_model Decile:');
console.log('-'.repeat(80));

// Sort samples by z_model
const sorted = samples.slice().sort((a, b) => a.z_model - b.z_model);

// Split into 10 deciles
const decileSize = Math.floor(sorted.length / 10);
const deciles = [];

for (let i = 0; i < 10; i++) {
  const start = i * decileSize;
  const end = i === 9 ? sorted.length : (i + 1) * decileSize;
  const decileSamples = sorted.slice(start, end);
  
  const hits = decileSamples.filter(s => s.hit === 1).length;
  const total = decileSamples.length;
  const hitRate = hits / total;
  
  const avgZ = decileSamples.reduce((sum, s) => sum + s.z_model, 0) / total;
  const avgQMkt = decileSamples.reduce((sum, s) => sum + s.q_mkt, 0) / total;
  
  deciles.push({
    decile: i + 1,
    n: total,
    hits,
    hitRate,
    avgZ,
    avgQMkt
  });
}

console.log('Decile   N      Hits   Hit%    Avg z_model   Avg q_mkt');
console.log('-'.repeat(80));

deciles.forEach(d => {
  console.log(
    `${d.decile.toString().padStart(6)} ` +
    `${d.n.toLocaleString().padStart(6)} ` +
    `${d.hits.toString().padStart(6)} ` +
    `${(d.hitRate * 100).toFixed(1).padStart(6)}% ` +
    `${d.avgZ.toFixed(3).padStart(13)} ` +
    `${(d.avgQMkt * 100).toFixed(1).padStart(11)}%`
  );
});

console.log('-'.repeat(80));
console.log();

// Check monotonicity
const hitRates = deciles.map(d => d.hitRate);
let monotonic = true;
for (let i = 1; i < hitRates.length; i++) {
  if (hitRates[i] < hitRates[i - 1]) {
    monotonic = false;
    break;
  }
}

if (monotonic) {
  console.log('✅ Lift curve is monotonic increasing (signal present)');
} else {
  console.log('❌ Lift curve is NOT monotonic (weak/no signal)');
}

console.log();

// ============================================================================
// RELIABILITY PLOT
// ============================================================================

console.log('📊 Reliability Analysis (Model Calibration):');
console.log('-'.repeat(80));

// For each sample, compute model probability P(hit=1)
const modelProbs = samples.map((s, i) => {
  const z = X[i].reduce((sum, x, j) => sum + x * fit.coefficients[j], 0);
  return logistic(z);
});

// Sort by model probability and split into 10 bins
const probSorted = samples.map((s, i) => ({ ...s, modelProb: modelProbs[i] }))
  .sort((a, b) => a.modelProb - b.modelProb);

const binSize = Math.floor(probSorted.length / 10);
const bins = [];

for (let i = 0; i < 10; i++) {
  const start = i * binSize;
  const end = i === 9 ? probSorted.length : (i + 1) * binSize;
  const binSamples = probSorted.slice(start, end);
  
  const hits = binSamples.filter(s => s.hit === 1).length;
  const total = binSamples.length;
  const empiricalRate = hits / total;
  
  const avgProb = binSamples.reduce((sum, s) => sum + s.modelProb, 0) / total;
  
  bins.push({
    bin: i + 1,
    n: total,
    avgModelProb: avgProb,
    empiricalRate,
    diff: empiricalRate - avgProb
  });
}

console.log('Bin   N      Avg Model Prob   Empirical Rate   Difference');
console.log('-'.repeat(80));

bins.forEach(b => {
  const sign = b.diff >= 0 ? '+' : '';
  console.log(
    `${b.bin.toString().padStart(3)} ` +
    `${b.n.toLocaleString().padStart(6)} ` +
    `${(b.avgModelProb * 100).toFixed(1).padStart(16)}% ` +
    `${(b.empiricalRate * 100).toFixed(1).padStart(16)}% ` +
    `${sign}${(b.diff * 100).toFixed(1).padStart(11)}%`
  );
});

console.log('-'.repeat(80));

// Calculate mean absolute difference
const mad = bins.reduce((sum, b) => sum + Math.abs(b.diff), 0) / bins.length;
console.log(`Mean Absolute Calibration Error: ${(mad * 100).toFixed(2)}%`);

if (mad < 0.02) {
  console.log('✅ Model is well-calibrated');
} else if (mad < 0.05) {
  console.log('⚠️  Model has moderate calibration error');
} else {
  console.log('❌ Model is poorly calibrated');
}

console.log();

// ============================================================================
// SAVE RESULTS
// ============================================================================

const output = {
  meta: {
    date: new Date().toISOString(),
    source: RESULTS_PATH,
    n_samples: samples.length
  },
  model: {
    formula: 'Logit(OverHit) ~ q_mkt + z_model + spread_big',
    features: featureNames
  },
  fit: {
    coefficients: Object.fromEntries(featureNames.map((name, i) => [name, fit.coefficients[i]])),
    std_errors: Object.fromEntries(featureNames.map((name, i) => [name, fit.std_errors[i]])),
    z_scores: Object.fromEntries(featureNames.map((name, i) => [name, fit.z_scores[i]])),
    p_values: Object.fromEntries(featureNames.map((name, i) => [name, fit.p_values[i]])),
    logLik: fit.logLik,
    aic: fit.aic,
    bic: fit.bic
  },
  decision: {
    has_signal,
    z_model_coefficient: z_model_coef,
    z_model_pvalue: z_model_pval,
    interpretation: has_signal
      ? 'Model has signal beyond market price - problem is bet SELECTION'
      : 'Model has NO signal beyond market price - need more features or abandon'
  },
  lift_curves: {
    deciles,
    monotonic
  },
  calibration: {
    bins,
    mean_absolute_error: mad
  }
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
console.log(`💾 Saved results to: ${OUTPUT_PATH}`);
console.log();

// ============================================================================
// SUMMARY
// ============================================================================

console.log('📋 Summary:');
console.log('='.repeat(80));
console.log(`Samples: ${samples.length.toLocaleString()}`);
console.log(`β(z_model): ${z_model_coef.toFixed(4)} (p = ${z_model_pval.toFixed(4)})`);
console.log(`Has Signal: ${has_signal ? 'YES ✅' : 'NO ❌'}`);
console.log(`Lift Monotonic: ${monotonic ? 'YES ✅' : 'NO ❌'}`);
console.log(`Calibration MAE: ${(mad * 100).toFixed(2)}%`);
console.log('='.repeat(80));
console.log();

if (has_signal) {
  console.log('🚀 Next: Rewrite picker with market-aware selection');
  console.log('   Expected: Shuffle test → 49-51% after fix');
} else {
  console.log('🛑 Next: Add contextual features or abandon approach');
}

console.log();
console.log('✅ Meta-model check complete');
