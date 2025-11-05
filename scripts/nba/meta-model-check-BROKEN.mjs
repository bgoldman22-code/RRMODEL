#!/usr/bin/env node
/**
 * META-MODEL SIGNAL CHECK - Phase 2
 * 
 * CRITICAL DECISION POINT: Does z_model add information beyond market no-vig probability?
 * 
 * Builds dataset from scratch:
 * - Loads boxscores + historical odds
 * - Time-causal projections (μ, σ)
 * - Primary line at consensus only
 * - Fits ridge logistic: Logit(OverHit) ~ q_mkt + z_model + spread_big + pace_top25 + sdmins_top25
 * 
 * Outputs:
 * - data/nba/meta-model-results.json (coefficients, z-scores, AUC, partial AUC)
 * - data/nba/figs/meta-model-lift.png (hit rate by z_model decile)
 * - data/nba/figs/reliability.png (calibration plot)
 * 
 * Usage:
 *   node scripts/nba/meta-model-check.mjs --snapshot=closing
 */

import fs from 'fs';
import { execSync } from 'child_process';
import {
  normalCDF,
  americanToProb,
  evFrom,
  spearmanMonotonicity,
  brierScore,
  logLoss,
  percentile,
  logistic,
  logit
} from './_lib/math_utils.mjs';
import {
  normalizeName,
  normalizeDateVariants,
  teamsMatch,
  buildOddsIndex,
  novigProbs,
  getPrimaryLine,
  hasConsensus
} from './_lib/market_utils.mjs';

// ===========================================================================
// CONFIGURATION
// ===========================================================================

const BOXSCORES_PATH = '/tmp/player-boxscores-2024.json';
const ODDS_PATH = 'data/nba/historical-odds-extended.json';
const OUTPUT_PATH = 'data/nba/meta-model-results.json';
const FIGS_DIR = 'data/nba/figs';

const PREFERRED_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'pointsbet'];
const MARKETS = ['points', 'rebounds', 'assists'];

const HOLDOUT_START = new Date('2025-02-01');
const HOLDOUT_END = new Date('2025-02-28');

// Best config from hyperparam search
const BEST_CONFIG = {
  l10: 0.6,
  per36: 0.4,
  starter_floor: 32,
  bench_floor: 24,
  sigma_reb: 1.8,
  sigma_ast: 1.6,
  z_temp: 0.9
};

// ===========================================================================
// RIDGE LOGISTIC REGRESSION
// ===========================================================================

/**
 * Fit ridge logistic regression via iteratively reweighted least squares (IRLS)
 * 
 * @param {number[][]} X - Design matrix (n × p)
 * @param {number[]} y - Binary outcomes (n)
 * @param {number} lambda - L2 penalty (default 0.01)
 * @param {number} maxIter - Max iterations (default 100)
 * @returns {{beta: number[], logLik: number, converged: boolean}}
 */
function ridgeLogistic(X, y, lambda = 0.01, maxIter = 100) {
  const n = X.length;
  const p = X[0].length;
  let beta = Array(p).fill(0);
  
  let prevLogLik = -Infinity;
  let converged = false;
  
  for (let iter = 0; iter < maxIter; iter++) {
    // Compute η = X * β
    const eta = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0));
    
    // Compute π = logistic(η)
    const pi = eta.map(e => logistic(e));
    
    // Compute W = π(1-π)
    const W = pi.map(p => Math.max(1e-8, p * (1 - p)));
    
    // Compute z = η + (y - π) / W
    const z = eta.map((e, i) => e + (y[i] - pi[i]) / W[i]);
    
    // Weighted least squares with ridge: β = (X'WX + λI)^-1 X'Wz
    // Build X'WX + λI
    const XWX = Array(p).fill(0).map(() => Array(p).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        for (let k = 0; k < p; k++) {
          XWX[j][k] += X[i][j] * W[i] * X[i][k];
        }
      }
    }
    
    // Add ridge penalty (don't penalize intercept)
    for (let j = 1; j < p; j++) {
      XWX[j][j] += lambda;
    }
    
    // Build X'Wz
    const XWz = Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        XWz[j] += X[i][j] * W[i] * z[i];
      }
    }
    
    // Solve (X'WX + λI) * β = X'Wz
    const betaNew = solveLinearSystem(XWX, XWz);
    if (!betaNew) {
      console.warn('⚠️  Failed to solve linear system');
      break;
    }
    
    // Compute log-likelihood
    let logLik = 0;
    for (let i = 0; i < n; i++) {
      const p = Math.max(1e-15, Math.min(1 - 1e-15, pi[i]));
      logLik += y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p);
    }
    
    // Add penalty term to log-likelihood
    for (let j = 1; j < p; j++) {
      logLik -= 0.5 * lambda * betaNew[j] * betaNew[j];
    }
    
    // Check convergence
    if (Math.abs(logLik - prevLogLik) < 1e-6) {
      converged = true;
      beta = betaNew;
      prevLogLik = logLik;
      break;
    }
    
    beta = betaNew;
    prevLogLik = logLik;
  }
  
  return { beta, logLik: prevLogLik, converged };
}

/**
 * Solve Ax = b using Gaussian elimination with partial pivoting
 */
function solveLinearSystem(A, b) {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);
  
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
    
    // Eliminate
    for (let k = i + 1; k < n; k++) {
      const factor = aug[k][i] / aug[i][i];
      for (let j = i; j <= n; j++) {
        aug[k][j] -= factor * aug[i][j];
      }
    }
  }
  
  // Back substitution
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }
  
  return x;
}

/**
 * Compute standard errors via observed Fisher information
 */
function computeStandardErrors(X, y, beta) {
  const n = X.length;
  const p = X[0].length;
  
  // Compute predicted probabilities
  const pi = X.map(row => {
    const eta = row.reduce((s, x, j) => s + x * beta[j], 0);
    return logistic(eta);
  });
  
  // Compute W = π(1-π)
  const W = pi.map(p => Math.max(1e-8, p * (1 - p)));
  
  // Compute Fisher information: I = X'WX
  const I = Array(p).fill(0).map(() => Array(p).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) {
        I[j][k] += X[i][j] * W[i] * X[i][k];
      }
    }
  }
  
  // Invert to get covariance matrix
  const invI = invertMatrix(I);
  if (!invI) {
    return Array(p).fill(NaN);
  }
  
  // SE = sqrt(diag(I^-1))
  return invI.map((row, i) => Math.sqrt(Math.max(0, row[i])));
}

/**
 * Matrix inversion via Gauss-Jordan
 */
function invertMatrix(A) {
  const n = A.length;
  const aug = A.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);
  
  for (let i = 0; i < n; i++) {
    // Pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
        maxRow = k;
      }
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
    
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
  
  return aug.map(row => row.slice(n));
}

/**
 * Compute AUC (ROC area under curve)
 */
function computeAUC(probs, outcomes) {
  const pairs = probs.map((p, i) => ({ p, y: outcomes[i] }));
  pairs.sort((a, b) => b.p - a.p);
  
  let auc = 0;
  let posCount = 0;
  let negCount = 0;
  
  for (const pair of pairs) {
    if (pair.y === 1) {
      auc += negCount;
      posCount++;
    } else {
      negCount++;
    }
  }
  
  return posCount > 0 && negCount > 0 ? auc / (posCount * negCount) : 0.5;
}

/**
 * Compute partial AUC in probability range [pMin, pMax]
 */
function computePartialAUC(probs, outcomes, pMin, pMax) {
  const filtered = probs
    .map((p, i) => ({ p, y: outcomes[i] }))
    .filter(x => x.p >= pMin && x.p <= pMax);
  
  if (filtered.length < 10) return null;
  
  return computeAUC(
    filtered.map(x => x.p),
    filtered.map(x => x.y)
  );
}

// ===========================================================================
// PROJECTION ENGINE (TIME-CAUSAL)
// ===========================================================================

function loadData() {
  console.log('\n📦 Loading data...');
  
  const boxscores = JSON.parse(fs.readFileSync(BOXSCORES_PATH, 'utf8'));
  const historicalGames = JSON.parse(fs.readFileSync(ODDS_PATH, 'utf8'));
  
  console.log(`   ✓ Loaded ${Object.keys(boxscores).length.toLocaleString()} players`);
  console.log(`   ✓ Loaded ${historicalGames.length.toLocaleString()} games with odds`);
  
  return { boxscores, historicalGames };
}

function calculateProjections(boxscores, config, gameDate) {
  const projections = [];
  
  for (const name in boxscores) {
    const games = boxscores[name];
    
    // TIME-CAUSAL: only use games BEFORE target date
    const prior = games.filter(g => new Date(g.date) < new Date(gameDate));
    if (prior.length < 5) continue;
    
    // Get L10 stats
    const l10 = prior.slice(-10);
    const avgMins = l10.reduce((s, g) => s + (g.minutes || 0), 0) / l10.length;
    if (avgMins < 15) continue;
    
    // Calculate minutes SD
    const recentGames = prior.slice(-20);
    const minsList = recentGames.map(g => g.minutes || 0);
    const meanMins = minsList.reduce((s, m) => s + m, 0) / minsList.length;
    const varMins = minsList.reduce((s, m) => s + (m - meanMins) ** 2, 0) / minsList.length;
    const sdMins = Math.sqrt(varMins);
    
    for (const market of MARKETS) {
      // L10 stats
      const l10Stats = l10.map(g => g[market] || 0);
      const mu_l10 = l10Stats.reduce((s, v) => s + v, 0) / l10Stats.length;
      
      // Per36 stats
      const per36Stats = l10.map(g => {
        const mins = g.minutes || 1;
        return ((g[market] || 0) / mins) * 36;
      });
      const mu_per36 = per36Stats.reduce((s, v) => s + v, 0) / per36Stats.length;
      
      // Combine
      const mu = config.l10 * mu_l10 + config.per36 * mu_per36;
      
      // Sigma
      let sigma = 0;
      if (market === 'points') {
        const floor = avgMins >= 28 ? config.starter_floor : config.bench_floor;
        sigma = Math.max(floor, mu) / config.z_temp;
      } else if (market === 'rebounds') {
        sigma = config.sigma_reb / config.z_temp;
      } else {
        sigma = config.sigma_ast / config.z_temp;
      }
      
      projections.push({
        name,
        market,
        date: gameDate,
        mu,
        sigma,
        sdMins,
        avgMins
      });
    }
  }
  
  return projections;
}

// ===========================================================================
// BUILD META-MODEL DATASET
// ===========================================================================

function buildDataset(boxscores, historicalGames, snapshot = 'closing') {
  console.log('\n🔨 Building meta-model dataset...');
  console.log(`   Snapshot: ${snapshot}`);
  console.log(`   Holdout: ${HOLDOUT_START.toISOString().split('T')[0]} to ${HOLDOUT_END.toISOString().split('T')[0]}`);
  
  // Build odds index
  const { index: oddsIndex, stats } = buildOddsIndex(historicalGames, snapshot, PREFERRED_BOOKS);
  console.log(`   ✓ Indexed ${stats.totalIndexed.toLocaleString()} odds entries`);
  console.log(`   ✓ Books: DK=${stats.byBook.draftkings || 0}, FD=${stats.byBook.fanduel || 0}, MGM=${stats.byBook.betmgm || 0}`);
  
  // Get all holdout dates
  const holdoutDates = new Set();
  for (const name in boxscores) {
    for (const game of boxscores[name]) {
      const gDate = new Date(game.date);
      if (gDate >= HOLDOUT_START && gDate <= HOLDOUT_END) {
        holdoutDates.add(game.date);
      }
    }
  }
  const sortedDates = Array.from(holdoutDates).sort();
  console.log(`   ✓ Found ${sortedDates.length} holdout dates`);
  
  // Compute percentile thresholds for contextual features
  const allSpreads = [];
  const allPaces = [];
  
  for (const game of historicalGames) {
    const gDate = new Date(game.date);
    if (gDate >= HOLDOUT_START && gDate <= HOLDOUT_END) {
      if (game.spread !== undefined) allSpreads.push(Math.abs(game.spread));
      if (game.pace !== undefined) allPaces.push(game.pace);
    }
  }
  
  const paceP75 = allPaces.length > 0 ? percentile(allPaces, 75) : 100;
  console.log(`   ✓ Pace 75th percentile: ${paceP75.toFixed(1)}`);
  
  // Build dataset
  const dataset = [];
  let skipped = { noOdds: 0, noConsensus: 0, noActual: 0 };
  
  for (const date of sortedDates) {
    const projections = calculateProjections(boxscores, BEST_CONFIG, date);
    
    for (const proj of projections) {
      const normName = normalizeName(proj.name);
      const { main, prev, next } = normalizeDateVariants(proj.date);
      
      // Find odds
      let bestMatch = null;
      for (const dStr of [main, prev, next]) {
        const key = `${normName}|${dStr}|${proj.market}`;
        if (oddsIndex[key]) {
          bestMatch = oddsIndex[key];
          break;
        }
      }
      
      if (!bestMatch) {
        skipped.noOdds++;
        continue;
      }
      
      // Get primary line
      const primaryLine = getPrimaryLine(bestMatch);
      if (primaryLine === null) {
        skipped.noOdds++;
        continue;
      }
      
      // Check consensus
      const optionsAtPrimary = bestMatch.filter(opt => Math.abs(opt.line - primaryLine) < 0.01);
      const consensus = hasConsensus(optionsAtPrimary, 0.5, 0.03);
      
      if (!consensus) {
        skipped.noConsensus++;
        continue;
      }
      
      // Get actual outcome
      const actualGames = boxscores[proj.name].filter(g => g.date === proj.date);
      if (actualGames.length === 0) {
        skipped.noActual++;
        continue;
      }
      const actual = actualGames[0][proj.market] || 0;
      
      // Compute market features
      const overOpts = optionsAtPrimary.filter(o => o.side === 'over');
      const underOpts = optionsAtPrimary.filter(o => o.side === 'under');
      
      if (overOpts.length === 0 || underOpts.length === 0) {
        skipped.noOdds++;
        continue;
      }
      
      const avgOverOdds = overOpts.reduce((s, o) => s + o.odds, 0) / overOpts.length;
      const avgUnderOdds = underOpts.reduce((s, o) => s + o.odds, 0) / underOpts.length;
      const { pO_hat } = novigProbs(avgOverOdds, avgUnderOdds);
      
      // Model features
      const z_model = (proj.mu - primaryLine) / proj.sigma;
      
      // Contextual features
      const gameInfo = historicalGames.find(g => {
        const sameDate = g.date.startsWith(proj.date.split('T')[0]);
        if (!sameDate) return false;
        return teamsMatch(actualGames[0].team, g.home_team, g.away_team);
      });
      
      const spread = gameInfo?.spread !== undefined ? Math.abs(gameInfo.spread) : 0;
      const pace = gameInfo?.pace || 0;
      
      dataset.push({
        name: proj.name,
        market: proj.market,
        date: proj.date,
        line: primaryLine,
        mu: proj.mu,
        sigma: proj.sigma,
        actual,
        overHit: actual > primaryLine ? 1 : 0,
        q_mkt: pO_hat,
        z_model,
        spread_big: spread >= 8 ? 1 : 0,
        pace_top25: pace >= paceP75 ? 1 : 0,
        sdmins_top25: proj.sdMins >= 5 ? 1 : 0,
        sdMins: proj.sdMins,
        spread,
        pace
      });
    }
  }
  
  console.log(`\n   ✓ Built dataset: ${dataset.length.toLocaleString()} samples`);
  console.log(`   ✓ Over hit rate: ${(dataset.filter(d => d.overHit === 1).length / dataset.length * 100).toFixed(1)}%`);
  console.log(`   ✗ Skipped: ${skipped.noOdds} (no odds), ${skipped.noConsensus} (no consensus), ${skipped.noActual} (no actual)`);
  
  return dataset;
}

// ===========================================================================
// FIT META-MODEL
// ===========================================================================

function standardize(values) {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  return {
    values: values.map(v => (v - mean) / (std || 1)),
    mean,
    std
  };
}

function fitMetaModel(dataset) {
  console.log('\n🔬 Fitting ridge logistic regression...');
  console.log('   Model: Logit(OverHit) ~ q_mkt + z_model + spread_big + pace_top25 + sdmins_top25');
  
  // Standardize continuous features
  const q_mkt_std = standardize(dataset.map(d => d.q_mkt));
  const z_model_std = standardize(dataset.map(d => d.z_model));
  
  // Build design matrix: [intercept, q_mkt, z_model, spread_big, pace_top25, sdmins_top25]
  const X = dataset.map((d, i) => [
    1,
    q_mkt_std.values[i],
    z_model_std.values[i],
    d.spread_big,
    d.pace_top25,
    d.sdmins_top25
  ]);
  const y = dataset.map(d => d.overHit);
  
  // Fit ridge logistic (λ = 0.01)
  const fit = ridgeLogistic(X, y, 0.01, 150);
  console.log(`   ✓ Converged: ${fit.converged}, LogLik: ${fit.logLik.toFixed(2)}`);
  
  // Compute standard errors
  const se = computeStandardErrors(X, y, fit.beta);
  const zScores = fit.beta.map((b, i) => b / (se[i] || 1));
  
  // Compute predictions
  const probs = X.map(row => {
    const eta = row.reduce((s, x, j) => s + x * fit.beta[j], 0);
    return logistic(eta);
  });
  
  // Compute metrics
  const auc = computeAUC(probs, y);
  const partialAUC = computePartialAUC(probs, y, 0.55, 0.65);
  const brier = brierScore(probs, y);
  const logloss = logLoss(probs, y);
  
  const featureNames = ['intercept', 'q_mkt', 'z_model', 'spread_big', 'pace_top25', 'sdmins_top25'];
  
  console.log('\n   📊 Coefficients:');
  featureNames.forEach((name, i) => {
    const sig = Math.abs(zScores[i]) > 2 ? '***' : Math.abs(zScores[i]) > 1.5 ? '**' : '';
    console.log(`      ${name.padEnd(15)}: β=${fit.beta[i].toFixed(4)}, z=${zScores[i].toFixed(2)} ${sig}`);
  });
  
  console.log('\n   📊 Metrics:');
  console.log(`      AUC: ${auc.toFixed(4)}`);
  console.log(`      Partial AUC (0.55-0.65): ${partialAUC !== null ? partialAUC.toFixed(4) : 'N/A'}`);
  console.log(`      Brier Score: ${brier.toFixed(4)}`);
  console.log(`      Log Loss: ${logloss.toFixed(4)}`);
  
  return {
    beta: fit.beta,
    se,
    zScores,
    probs,
    auc,
    partialAUC,
    brier,
    logloss,
    featureNames,
    standardization: {
      q_mkt: { mean: q_mkt_std.mean, std: q_mkt_std.std },
      z_model: { mean: z_model_std.mean, std: z_model_std.std }
    }
  };
}

// ===========================================================================
// CRITICAL DECISION POINT
// ===========================================================================

function evaluateSignal(results) {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    CRITICAL DECISION POINT                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  
  const z_model_idx = 2;
  const beta_z = results.beta[z_model_idx];
  const z_score = results.zScores[z_model_idx];
  
  console.log(`   β(z_model) = ${beta_z.toFixed(4)}`);
  console.log(`   z-score    = ${z_score.toFixed(2)}\n`);
  
  if (beta_z > 0 && Math.abs(z_score) > 1.5) {
    console.log('   ✅ MODEL HAS SIGNAL BEYOND MARKET PRICE\n');
    console.log('   📌 Diagnosis:');
    console.log('      • Projections (μ, σ) are informative');
    console.log('      • Problem is bet SELECTION, not projection quality');
    console.log('      • Selection process picks biased samples\n');
    console.log('   💡 Next Steps:');
    console.log('      1. Rewrite picker with consensus filters (≥2 books)');
    console.log('      2. Add volatility shrink: edge *= 1/(1 + sdMins/4)');
    console.log('      3. Add blowout tweaks: |spread|≥10 → Over×0.90, Under×1.05');
    console.log('      4. Add σ triangulation from alt lines');
    console.log('      5. Integrate archetype policies');
    console.log('      6. Expect shuffle test → 49-51% after fix\n');
    return true;
  } else if (beta_z > 0) {
    console.log('   ⚠️  MODEL HAS WEAK SIGNAL\n');
    console.log('   📌 Diagnosis:');
    console.log('      • z_model coefficient positive but not significant');
    console.log('      • Marginal information beyond market\n');
    console.log('   💡 Next Steps:');
    console.log('      1. Fix selection bias (as above)');
    console.log('      2. Consider adding features (injuries, rest, matchups)\n');
    return true;
  } else {
    console.log('   ❌ MODEL HAS NO SIGNAL BEYOND MARKET PRICE\n');
    console.log('   📌 Diagnosis:');
    console.log('      • Market price already incorporates available information');
    console.log('      • Our μ/σ projections not better than consensus\n');
    console.log('   💡 Next Steps:');
    console.log('      1. Add contextual features:');
    console.log('         - Opponent defensive stats (DRTG, pace)');
    console.log('         - Rest days (B2B flag)');
    console.log('         - Home/away splits');
    console.log('         - Recent injury history');
    console.log('      2. Try ML approach (XGBoost, neural net)');
    console.log("      3. Or abandon if features don't help\n");
    return false;
  }
}

// ===========================================================================
// LIFT CURVES
// ===========================================================================

function generateLiftCurve(dataset, probs) {
  console.log('\n📈 Lift Analysis (by z_model decile):');
  
  const sorted = dataset.map((d, i) => ({ ...d, prob: probs[i] }))
    .sort((a, b) => a.z_model - b.z_model);
  
  const decileSize = Math.floor(sorted.length / 10);
  const deciles = [];
  
  for (let i = 0; i < 10; i++) {
    const start = i * decileSize;
    const end = i === 9 ? sorted.length : (i + 1) * decileSize;
    const slice = sorted.slice(start, end);
    
    const hitRate = slice.filter(d => d.overHit === 1).length / slice.length;
    const avgZ = slice.reduce((s, d) => s + d.z_model, 0) / slice.length;
    const avgQMkt = slice.reduce((s, d) => s + d.q_mkt, 0) / slice.length;
    
    deciles.push({
      decile: i + 1,
      avgZ: parseFloat(avgZ.toFixed(3)),
      avgQMkt: parseFloat((avgQMkt * 100).toFixed(1)),
      hitRate: parseFloat((hitRate * 100).toFixed(1)),
      n: slice.length
    });
  }
  
  console.table(deciles);
  
  const hitRates = deciles.map(d => d.hitRate);
  const mono = spearmanMonotonicity(hitRates);
  console.log(`   Spearman monotonicity: ${mono.toFixed(3)}`);
  
  if (mono > 0.7) {
    console.log('   ✅ Lift curve is monotonic → z_model has predictive power');
  } else {
    console.log('   ❌ Lift curve not monotonic → z_model lacks signal');
  }
  
  return { deciles, monotonic: mono > 0.7 };
}

// ===========================================================================
// RELIABILITY PLOT
// ===========================================================================

function generateReliabilityPlot(probs, outcomes) {
  console.log('\n📊 Reliability Analysis (calibration):');
  
  const sorted = probs.map((p, i) => ({ p, y: outcomes[i] }))
    .sort((a, b) => a.p - b.p);
  
  const binSize = Math.floor(sorted.length / 10);
  const bins = [];
  
  for (let i = 0; i < 10; i++) {
    const start = i * binSize;
    const end = i === 9 ? sorted.length : (i + 1) * binSize;
    const slice = sorted.slice(start, end);
    
    const avgProb = slice.reduce((s, d) => s + d.p, 0) / slice.length;
    const empiricalRate = slice.filter(d => d.y === 1).length / slice.length;
    
    bins.push({
      bin: i + 1,
      predicted: parseFloat((avgProb * 100).toFixed(1)),
      empirical: parseFloat((empiricalRate * 100).toFixed(1)),
      n: slice.length
    });
  }
  
  console.table(bins);
  
  const calError = bins.reduce((s, b) => s + Math.abs(b.predicted - b.empirical), 0) / bins.length;
  console.log(`   Mean absolute calibration error: ${calError.toFixed(2)} percentage points`);
  
  if (calError < 3) {
    console.log('   ✅ Model is well-calibrated');
  } else if (calError < 5) {
    console.log('   ⚠️  Model has moderate calibration drift');
  } else {
    console.log('   ❌ Model is poorly calibrated');
  }
  
  return bins;
}

// ===========================================================================
// SAVE RESULTS
// ===========================================================================

function saveResults(dataset, results, liftCurve, reliabilityBins, hasSignal) {
  const output = {
    timestamp: new Date().toISOString(),
    n_samples: dataset.length,
    coefficients: {},
    std_errors: {},
    z_scores: {},
    standardization: results.standardization,
    metrics: {
      auc: results.auc,
      partial_auc_55_65: results.partialAUC,
      brier_score: results.brier,
      log_loss: results.logloss
    },
    decision: {
      has_signal: hasSignal,
      z_model_coefficient: results.beta[2],
      z_model_z_score: results.zScores[2],
      interpretation: hasSignal
        ? 'Model has signal beyond market - fix selection bias'
        : 'Model has no signal - add features or abandon'
    },
    lift_curve: liftCurve.deciles,
    lift_monotonic: liftCurve.monotonic,
    reliability: reliabilityBins
  };
  
  results.featureNames.forEach((name, i) => {
    output.coefficients[name] = results.beta[i];
    output.std_errors[name] = results.se[i];
    output.z_scores[name] = results.zScores[i];
  });
  
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n💾 Saved results to: ${OUTPUT_PATH}`);
}

// ===========================================================================
// GENERATE PLOTS (R)
// ===========================================================================

function generatePlots() {
  console.log('\n📊 Generating plots...');
  
  if (!fs.existsSync(FIGS_DIR)) {
    fs.mkdirSync(FIGS_DIR, { recursive: true });
  }
  
  const rScript = `library(ggplot2)
library(jsonlite)

results <- fromJSON('${OUTPUT_PATH}')

# Lift curve
lift <- data.frame(results$lift_curve)
lift$decile <- as.numeric(lift$decile)
lift$avgZ <- as.numeric(lift$avgZ)
lift$hitRate <- as.numeric(lift$hitRate)

png('${FIGS_DIR}/meta-model-lift.png', width=800, height=600)
ggplot(lift, aes(x=decile, y=hitRate)) +
  geom_line(size=1.5, color='steelblue') +
  geom_point(size=3, color='steelblue') +
  geom_hline(yintercept=50, linetype='dashed', color='red', size=1) +
  labs(
    title='Meta-Model Lift Curve',
    subtitle='Over Hit Rate by z_model Decile',
    x='z_model Decile (1=lowest, 10=highest)',
    y='Over Hit Rate (%)'
  ) +
  ylim(0, 100) +
  theme_minimal() +
  theme(text=element_text(size=14))
dev.off()

# Reliability plot
rel <- data.frame(results$reliability)
rel$bin <- as.numeric(rel$bin)
rel$predicted <- as.numeric(rel$predicted)
rel$empirical <- as.numeric(rel$empirical)

png('${FIGS_DIR}/reliability.png', width=800, height=600)
ggplot(rel, aes(x=predicted, y=empirical)) +
  geom_point(size=3, color='steelblue') +
  geom_abline(slope=1, intercept=0, linetype='dashed', color='red', size=1) +
  geom_smooth(method='loess', se=FALSE, color='darkblue', size=1) +
  labs(
    title='Reliability Plot',
    subtitle='Predicted vs Empirical Over Probability',
    x='Predicted Probability (%)',
    y='Empirical Hit Rate (%)'
  ) +
  xlim(0, 100) +
  ylim(0, 100) +
  coord_fixed() +
  theme_minimal() +
  theme(text=element_text(size=14))
dev.off()

cat('Plots saved\\n')
`;
  
  fs.writeFileSync('/tmp/meta-model-plots.R', rScript);
  
  try {
    execSync('Rscript /tmp/meta-model-plots.R', { stdio: 'inherit' });
    console.log('   ✓ Plots generated successfully');
  } catch (err) {
    console.log('   ⚠️  Could not generate plots (R not available)');
    console.log('   Results are still saved in JSON format');
  }
}

// ===========================================================================
// MAIN
// ===========================================================================

async function main() {
  const args = process.argv.slice(2);
  const snapshot = args.find(a => a.startsWith('--snapshot='))?.split('=')[1] || 'closing';
  
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           META-MODEL SIGNAL CHECK - PHASE 2                   ║');
  console.log('║    Does μ add information beyond market no-vig probability?   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  // Load data
  const { boxscores, historicalGames } = loadData();
  
  // Build dataset
  const dataset = buildDataset(boxscores, historicalGames, snapshot);
  
  if (dataset.length < 100) {
    console.error('\n❌ ERROR: Insufficient data for meta-model');
    console.error(`   Need at least 100 samples, got ${dataset.length}`);
    process.exit(1);
  }
  
  // Fit meta-model
  const results = fitMetaModel(dataset);
  
  // Critical decision point
  const hasSignal = evaluateSignal(results);
  
  // Generate diagnostics
  const liftCurve = generateLiftCurve(dataset, results.probs);
  const reliabilityBins = generateReliabilityPlot(results.probs, dataset.map(d => d.overHit));
  
  // Save results
  saveResults(dataset, results, liftCurve, reliabilityBins, hasSignal);
  
  // Generate plots
  generatePlots();
  
  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                          SUMMARY                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log(`   Samples: ${dataset.length.toLocaleString()}`);
  console.log(`   AUC: ${results.auc.toFixed(4)}`);
  console.log(`   β(z_model): ${results.beta[2].toFixed(4)} (z=${results.zScores[2].toFixed(2)})`);
  console.log(`   Has Signal: ${hasSignal ? 'YES ✅' : 'NO ❌'}`);
  console.log(`   Lift Monotonic: ${liftCurve.monotonic ? 'YES ✅' : 'NO ❌'}\n');
  
  if (hasSignal) {
    console.log('   🚀 NEXT STEP: Rewrite picker with market-aware selection');
    console.log('      Expected: Shuffle test → 49-51% after fix\n');
  } else {
    console.log('   🛑 NEXT STEP: Add contextual features or abandon approach\n');
  }
  
  console.log('✅ Meta-model check complete\n');
}

main().catch(err => {
  console.error('\n❌ FATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
