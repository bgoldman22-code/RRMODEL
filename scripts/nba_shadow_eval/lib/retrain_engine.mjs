/**
 * Shadow Eval – Retrain Engine
 * 
 * Walk-forward retrain benefit test.
 * For each candidate window W (e.g. 2, 4, 6, 10 weeks):
 *   1. Collect training data from the trailing W-week period
 *   2. Compute feature vectors + actual outcomes for each historical game
 *   3. Refit the linear model (OLS) on that data
 *   4. Evaluate the candidate model on a held-out forward period
 * 
 * Compares candidate MAE / RMSE / correct-side% against the frozen baseline.
 * 
 * SAFETY: Pure computation module. Never modifies production artifacts.
 *         All outputs go to ./shadow_eval/
 */

import { fetchGamesForDate, delay } from './espn_fetcher.mjs';

// ═══════════════════════════════════════════════════════════════════════════
// DATE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA + 'T12:00:00Z');
  const b = new Date(dateB + 'T12:00:00Z');
  return Math.round((b - a) / 86400000);
}

function generateDateRange(start, end) {
  const dates = [];
  let current = new Date(start + 'T12:00:00Z');
  const endDate = new Date(end + 'T12:00:00Z');
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// ═══════════════════════════════════════════════════════════════════════════
// OLS LINEAR REGRESSION (pure JS, no deps)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fit a standardized linear model via OLS (Ordinary Least Squares).
 * 
 * 1. Compute per-feature mean & std from training data
 * 2. Standardize features (z-score)
 * 3. Solve weights via normal equations: w = (X'X)^-1 X'y
 *    Uses pseudo-inverse with ridge regularization for stability.
 * 
 * Returns a model object with the same shape as SPREAD_MODEL / TOTAL_MODEL:
 * { weights, bias, means, stds, type, performance }
 * 
 * @param {Array<Object>} samples - [{ features: {key: value}, target: number }]
 * @param {string[]} featureKeys - ordered list of feature names
 * @param {number} lambda - ridge regularization strength (default 0.01)
 * @returns {Object} fitted model { weights, bias, means, stds, type, performance }
 */
export function fitLinearModel(samples, featureKeys, lambda = 0.01) {
  const n = samples.length;
  const p = featureKeys.length;

  if (n < p + 5) {
    throw new Error(`Not enough samples to fit: ${n} samples for ${p} features (need at least ${p + 5})`);
  }

  // ── Step 1: Compute means and stds ──────────────────────────────────────
  const means = {};
  const stds = {};

  for (const key of featureKeys) {
    const vals = samples.map(s => s.features[key] ?? 0);
    const mu = vals.reduce((a, b) => a + b, 0) / n;
    means[key] = mu;
    const variance = vals.reduce((a, v) => a + (v - mu) ** 2, 0) / n;
    stds[key] = Math.sqrt(variance) || 1; // Avoid div-by-zero
  }

  // ── Step 2: Build standardized design matrix X and target vector y ──────
  // X is n × (p+1) with intercept column of 1s
  const X = []; // n rows of (p+1) values
  const y = []; // n targets

  for (const sample of samples) {
    const row = [1]; // intercept
    for (const key of featureKeys) {
      const raw = sample.features[key] ?? 0;
      const z = (raw - means[key]) / stds[key];
      row.push(z);
    }
    X.push(row);
    y.push(sample.target);
  }

  // ── Step 3: Normal equations with ridge: w = (X'X + λI)^-1 X'y ─────────
  const dim = p + 1; // includes intercept

  // X'X (dim × dim)
  const XtX = Array.from({ length: dim }, () => new Float64Array(dim));
  for (let i = 0; i < dim; i++) {
    for (let j = i; j < dim; j++) {
      let dot = 0;
      for (let k = 0; k < n; k++) {
        dot += X[k][i] * X[k][j];
      }
      XtX[i][j] = dot;
      XtX[j][i] = dot; // symmetric
    }
  }

  // Add ridge regularization (but not to intercept)
  for (let i = 1; i < dim; i++) {
    XtX[i][i] += lambda * n;
  }

  // X'y (dim × 1)
  const Xty = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    let dot = 0;
    for (let k = 0; k < n; k++) {
      dot += X[k][i] * y[k];
    }
    Xty[i] = dot;
  }

  // Solve via Cholesky decomposition (X'X is positive definite with ridge)
  const w = solveCholesky(XtX, Xty, dim);

  // ── Step 4: Extract bias (intercept) and feature weights ────────────────
  const bias = w[0];
  const weights = {};
  for (let i = 0; i < featureKeys.length; i++) {
    weights[featureKeys[i]] = w[i + 1];
  }

  // ── Step 5: Compute training MAE ───────────────────────────────────────
  let absErrorSum = 0;
  for (let k = 0; k < n; k++) {
    let pred = bias;
    for (let i = 0; i < p; i++) {
      const raw = samples[k].features[featureKeys[i]] ?? 0;
      const z = (raw - means[featureKeys[i]]) / stds[featureKeys[i]];
      pred += weights[featureKeys[i]] * z;
    }
    absErrorSum += Math.abs(pred - y[k]);
  }
  const trainMAE = absErrorSum / n;

  return {
    weights,
    bias,
    means,
    stds,
    type: 'ols_retrain',
    performance: {
      mae: trainMAE,
      trainSamples: n,
    },
  };
}

/**
 * Cholesky decomposition solver for Ax = b where A is symmetric positive definite.
 * Returns x as Float64Array.
 */
function solveCholesky(A, b, dim) {
  // Decompose A = L * L'
  const L = Array.from({ length: dim }, () => new Float64Array(dim));

  for (let i = 0; i < dim; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        const diag = A[i][i] - sum;
        if (diag <= 0) {
          // Fallback: add more regularization
          L[i][j] = Math.sqrt(Math.max(diag + 1e-6, 1e-10));
        } else {
          L[i][j] = Math.sqrt(diag);
        }
      } else {
        L[i][j] = (A[i][j] - sum) / L[j][j];
      }
    }
  }

  // Forward substitution: L * z = b → z
  const z = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    let sum = 0;
    for (let k = 0; k < i; k++) {
      sum += L[i][k] * z[k];
    }
    z[i] = (b[i] - sum) / L[i][i];
  }

  // Back substitution: L' * x = z → x
  const x = new Float64Array(dim);
  for (let i = dim - 1; i >= 0; i--) {
    let sum = 0;
    for (let k = i + 1; k < dim; k++) {
      sum += L[k][i] * x[k];
    }
    x[i] = (z[i] - sum) / L[i][i];
  }

  return x;
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE BUILDERS (exact copies from frozen_predictor.mjs)
// ═══════════════════════════════════════════════════════════════════════════

function buildEliteFeatures(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20) {
  const calcPPG = (stats) => stats.offRtg;
  return {
    h3_netRtg: homeL3.netRtg, h3_ppg: calcPPG(homeL3), h3_pace: homeL3.pace,
    h3_winPct: homeL3.winPct, h3_efg: homeL3.efg * 100,
    a3_netRtg: awayL3.netRtg, a3_ppg: calcPPG(awayL3), a3_pace: awayL3.pace,
    a3_winPct: awayL3.winPct, a3_efg: awayL3.efg * 100,
    h10_netRtg: homeL10.netRtg, h10_ppg: calcPPG(homeL10), h10_pace: homeL10.pace,
    h10_winPct: homeL10.winPct, h10_ts: homeL10.ts * 100,
    a10_netRtg: awayL10.netRtg, a10_ppg: calcPPG(awayL10), a10_pace: awayL10.pace,
    a10_winPct: awayL10.winPct, a10_ts: awayL10.ts * 100,
    h20_netRtg: homeL20.netRtg, h20_offRtg: homeL20.offRtg, h20_defRtg: homeL20.defRtg,
    h20_ppg: calcPPG(homeL20), h20_pace: homeL20.pace,
    a20_netRtg: awayL20.netRtg, a20_offRtg: awayL20.offRtg, a20_defRtg: awayL20.defRtg,
    a20_ppg: calcPPG(awayL20), a20_pace: awayL20.pace,
    netRtg_diff: homeL10.netRtg - awayL10.netRtg,
    netRtg_product: homeL10.netRtg * awayL10.netRtg,
    offense_vs_defense: homeL10.offRtg * awayL10.defRtg / 10000,
    defensive_matchup: awayL10.offRtg * homeL10.defRtg / 10000,
    pace_avg: (homeL10.pace + awayL10.pace) / 2,
    pace_diff: homeL10.pace - awayL10.pace,
    pace_product: homeL10.pace * awayL10.pace / 10000,
    h_momentum: homeL10.netRtg * homeL10.winPct,
    a_momentum: awayL10.netRtg * awayL10.winPct,
    h_streak: homeL10.winPct > 0.6 ? 1 : (homeL10.winPct < 0.4 ? -1 : 0),
    a_streak: awayL10.winPct > 0.6 ? 1 : (awayL10.winPct < 0.4 ? -1 : 0),
    momentum_diff: (homeL10.netRtg * homeL10.winPct) - (awayL10.netRtg * awayL10.winPct),
    ppg_sum: homeL10.offRtg + awayL10.offRtg,
    ppg_diff: homeL10.offRtg - awayL10.offRtg,
    expected_total: (homeL10.offRtg + awayL10.offRtg) * (homeL10.pace + awayL10.pace) / 200,
    shooting_advantage: (homeL10.efg - awayL10.efg) * 100,
    h_efficiency: homeL10.offRtg / homeL10.pace,
    a_efficiency: awayL10.offRtg / awayL10.pace,
    offRtg_diff: homeL10.offRtg - awayL10.offRtg,
    defRtg_diff: homeL10.defRtg - awayL10.defRtg,
    winPct_diff: homeL10.winPct - awayL10.winPct,
    quality_matchup: (homeL10.netRtg + awayL10.netRtg) / 2,
    upset_factor: Math.abs(homeL10.winPct - awayL10.winPct) * (homeL10.winPct < awayL10.winPct ? 1 : -1),
    rating_pace_interaction: (homeL10.netRtg - awayL10.netRtg) * (homeL10.pace - awayL10.pace),
    form_rating_interaction: homeL10.winPct * homeL10.netRtg - awayL10.winPct * awayL10.netRtg,
    consistency: Math.abs(homeL10.netRtg / (homeL10.games + 1)) + Math.abs(awayL10.netRtg / (awayL10.games + 1)),
    home_advantage: 1,
  };
}

function buildSimpleFeatures(homeStats, awayStats) {
  return {
    home_l10_fgPct: homeStats.fgPct || homeStats.efg || 0.47,
    home_l10_fg3Pct: homeStats.fg3Pct || (homeStats.ts - homeStats.efg) || 0.36,
    home_l10_ftPct: homeStats.ftPct || 0.77,
    home_l10_rebounds: homeStats.rebounds || 43,
    home_l10_assists: homeStats.assists || 25,
    home_l10_turnovers: homeStats.turnovers || (homeStats.tovPct * 100) || 13.5,
    away_l10_fgPct: awayStats.fgPct || awayStats.efg || 0.47,
    away_l10_fg3Pct: awayStats.fg3Pct || (awayStats.ts - awayStats.efg) || 0.36,
    away_l10_ftPct: awayStats.ftPct || 0.77,
    away_l10_rebounds: awayStats.rebounds || 43,
    away_l10_assists: awayStats.assists || 25,
    away_l10_turnovers: awayStats.turnovers || (awayStats.tovPct * 100) || 13.5,
    fgPct_diff: (homeStats.fgPct || homeStats.efg || 0.47) - (awayStats.fgPct || awayStats.efg || 0.47),
    fg3Pct_diff: (homeStats.fg3Pct || 0.36) - (awayStats.fg3Pct || 0.36),
    rebounds_diff: (homeStats.rebounds || 43) - (awayStats.rebounds || 43),
    assists_diff: (homeStats.assists || 25) - (awayStats.assists || 25),
    turnovers_diff: (awayStats.turnovers || awayStats.tovPct * 100 || 13.5) - (homeStats.turnovers || homeStats.tovPct * 100 || 13.5),
    home_court: 1,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PREDICT WITH A CANDIDATE MODEL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run prediction using a model object (same shape as SPREAD_MODEL/TOTAL_MODEL).
 * Exact copy of production predict() logic.
 */
export function predictWithModel(model, features) {
  const { weights, bias, means, stds } = model;
  let pred = bias;
  for (const [key, weight] of Object.entries(weights)) {
    if (!(key in features)) continue;
    const value = features[key];
    if (!Number.isFinite(value)) continue;
    const mean = means[key] ?? 0;
    const std = stds[key] ?? 1;
    const normalized = std > 0 ? (value - mean) / std : 0;
    pred += weight * normalized;
  }
  return pred;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRAINING DATA COLLECTOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Collect training data (feature vectors + actual outcomes) from a date range
 * by fetching ESPN game results and building features from the predictor's stats.
 * 
 * IMPORTANT LIMITATION: We use the CURRENT rolling stats from ESPN/NBA APIs,
 * not as-of-date stats. This means training data is anachronistic — the features
 * reflect the team's current rolling window, not what their stats were on game day.
 * This is a known limitation that must be flagged in output metadata.
 * 
 * For the retrain comparison to be valid, BOTH baseline and candidates use the
 * same feature values — the comparison tests weight/bias sensitivity, not features.
 * 
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {Function} fetchTeamStatsFn - async (abbr) => { l5, l10, l20 }
 * @param {Object} rciModule - optional RCI adjustment module
 * @returns {Promise<Object>} { spreadSamples, totalSamples, gameCount, dateCount }
 */
export async function collectTrainingData(startDate, endDate, fetchTeamStatsFn, rciModule = null) {
  const dates = generateDateRange(startDate, endDate);
  const spreadSamples = [];
  const totalSamples = [];
  let gameCount = 0;

  // Cache team stats (they're current-snapshot, not date-specific)
  const statsCache = {};
  async function getTeamStats(abbr) {
    if (!statsCache[abbr]) {
      statsCache[abbr] = await fetchTeamStatsFn(abbr);
    }
    return statsCache[abbr];
  }

  console.log(`  [TrainingData] Collecting from ${startDate} → ${endDate} (${dates.length} dates)...`);

  for (let i = 0; i < dates.length; i++) {
    const dateStr = dates[i];

    try {
      const games = await fetchGamesForDate(dateStr);
      const completed = games.filter(g => g.completed);

      for (const game of completed) {
        const homeStats = await getTeamStats(game.home);
        const awayStats = await getTeamStats(game.away);

        const homeL5 = homeStats?.l5 || getDefaultStats();
        const homeL10 = homeStats?.l10 || getDefaultStats();
        const homeL20 = homeStats?.l20 || getDefaultStats();
        const awayL5 = awayStats?.l5 || getDefaultStats();
        const awayL10 = awayStats?.l10 || getDefaultStats();
        const awayL20 = awayStats?.l20 || getDefaultStats();

        // Apply RCI if available
        let adjHL5 = homeL5, adjHL10 = homeL10, adjHL20 = homeL20;
        let adjAL5 = awayL5, adjAL10 = awayL10, adjAL20 = awayL20;
        if (rciModule?.applyRCIAdjustment) {
          const homeGP = homeL10.games || 0;
          const awayGP = awayL10.games || 0;
          adjHL5 = rciModule.applyRCIAdjustment(homeL5, game.home, homeGP);
          adjHL10 = rciModule.applyRCIAdjustment(homeL10, game.home, homeGP);
          adjHL20 = rciModule.applyRCIAdjustment(homeL20, game.home, homeGP);
          adjAL5 = rciModule.applyRCIAdjustment(awayL5, game.away, awayGP);
          adjAL10 = rciModule.applyRCIAdjustment(awayL10, game.away, awayGP);
          adjAL20 = rciModule.applyRCIAdjustment(awayL20, game.away, awayGP);
        }

        // Build features
        const spreadFeats = buildEliteFeatures(adjHL5, adjHL10, adjHL20, adjAL5, adjAL10, adjAL20);
        const totalFeats = buildSimpleFeatures(adjHL10, adjAL10);

        spreadSamples.push({ features: spreadFeats, target: game.actual_margin });
        totalSamples.push({ features: totalFeats, target: game.total });
        gameCount++;
      }
    } catch (err) {
      // Skip dates with errors (e.g., no games)
    }

    // Rate limiting
    if (i < dates.length - 1 && i % 5 === 4) await delay(300);
  }

  console.log(`  [TrainingData] Collected ${gameCount} games across ${dates.length} dates`);

  return { spreadSamples, totalSamples, gameCount, dateCount: dates.length };
}

function getDefaultStats() {
  return {
    pace: 100, offRtg: 114.5, defRtg: 114.5, netRtg: 0,
    efg: 0.535, ts: 0.575, tovPct: 0.138, orbPct: 0.25,
    ftFga: 0.22, winPct: 0.50, games: 0, wins: 0, losses: 0,
    fgPct: 0.47, fg3Pct: 0.36, ftPct: 0.78,
    rebounds: 43, assists: 25, turnovers: 13.5,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WALK-FORWARD RETRAIN EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the walk-forward retrain comparison.
 * 
 * For each window W in windowWeeks:
 *   1. Training period: [holdoutStart - W*7 days, holdoutStart - 1 day]
 *   2. Holdout period: [holdoutStart, holdoutStart + holdoutDays - 1]
 *   3. Collect training data for the training period
 *   4. Fit candidate spread + total models via OLS
 *   5. Evaluate candidate on holdout games using same features
 *   6. Compare candidate MAE/RMSE/correct_side vs frozen baseline
 * 
 * @param {Object} opts
 * @param {number[]} opts.windowWeeks - e.g. [2, 4, 6, 10]
 * @param {string} opts.holdoutStart - YYYY-MM-DD
 * @param {number} opts.holdoutDays - number of days in holdout window
 * @param {Object} opts.frozenSpreadModel - baseline SPREAD_MODEL
 * @param {Object} opts.frozenTotalModel - baseline TOTAL_MODEL
 * @param {Function} opts.fetchTeamStatsFn - async (abbr) => { l5, l10, l20 }
 * @param {Object} opts.rciModule - optional RCI module
 * @param {number} opts.lambda - ridge regularization (default 0.01)
 * @returns {Promise<Object>} comparison results
 */
export async function runRetrainComparison(opts) {
  const {
    windowWeeks,
    holdoutStart,
    holdoutDays,
    frozenSpreadModel,
    frozenTotalModel,
    fetchTeamStatsFn,
    rciModule = null,
    lambda = 0.01,
  } = opts;

  const holdoutEnd = addDays(holdoutStart, holdoutDays - 1);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  🔄 Walk-Forward Retrain Comparison');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Holdout:  ${holdoutStart} → ${holdoutEnd} (${holdoutDays} days)`);
  console.log(`  Windows:  ${windowWeeks.map(w => `${w}wk`).join(', ')}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // ── Step 1: Collect holdout data ────────────────────────────────────────
  console.log('\n[R1] Collecting holdout data...');
  const holdoutData = await collectTrainingData(holdoutStart, holdoutEnd, fetchTeamStatsFn, rciModule);

  if (holdoutData.gameCount === 0) {
    console.error('❌ No holdout games found. Check date range.');
    return { error: 'No holdout games', holdoutStart, holdoutEnd, holdoutDays };
  }

  console.log(`  Holdout: ${holdoutData.gameCount} games`);

  // ── Step 2: Evaluate frozen baseline on holdout ─────────────────────────
  console.log('\n[R2] Evaluating frozen baseline on holdout...');

  const spreadFeatureKeys = Object.keys(frozenSpreadModel.weights);
  const totalFeatureKeys = Object.keys(frozenTotalModel.weights);

  const baselineResults = evaluateModel(
    frozenSpreadModel, frozenTotalModel,
    holdoutData.spreadSamples, holdoutData.totalSamples
  );

  console.log(`  Baseline spread MAE:  ${baselineResults.spread.mae.toFixed(3)}`);
  console.log(`  Baseline total MAE:   ${baselineResults.total.mae.toFixed(3)}`);
  console.log(`  Baseline correct side: ${(baselineResults.spread.correctSidePct * 100).toFixed(1)}%`);

  // ── Step 3: For each window, train + evaluate ───────────────────────────
  const candidates = [];

  for (const W of windowWeeks) {
    console.log(`\n[R3] Window: ${W} weeks...`);

    const trainEnd = addDays(holdoutStart, -1);
    const trainStart = addDays(holdoutStart, -(W * 7));

    console.log(`  Training period: ${trainStart} → ${trainEnd}`);

    // Collect training data
    const trainData = await collectTrainingData(trainStart, trainEnd, fetchTeamStatsFn, rciModule);

    if (trainData.gameCount < spreadFeatureKeys.length + 10) {
      console.log(`  ⚠️  Insufficient training data: ${trainData.gameCount} games (need ${spreadFeatureKeys.length + 10}+)`);
      candidates.push({
        windowWeeks: W,
        trainStart,
        trainEnd,
        trainGames: trainData.gameCount,
        error: `Insufficient data: ${trainData.gameCount} games`,
        spread: null,
        total: null,
      });
      continue;
    }

    try {
      // Fit candidate spread model
      const candidateSpread = fitLinearModel(trainData.spreadSamples, spreadFeatureKeys, lambda);
      console.log(`  Candidate spread: trainMAE=${candidateSpread.performance.mae.toFixed(3)}, samples=${candidateSpread.performance.trainSamples}`);

      // Fit candidate total model
      const candidateTotal = fitLinearModel(trainData.totalSamples, totalFeatureKeys, lambda);
      console.log(`  Candidate total:  trainMAE=${candidateTotal.performance.mae.toFixed(3)}, samples=${candidateTotal.performance.trainSamples}`);

      // Evaluate candidate on holdout
      const candidateResults = evaluateModel(
        candidateSpread, candidateTotal,
        holdoutData.spreadSamples, holdoutData.totalSamples
      );

      console.log(`  Holdout spread MAE:  ${candidateResults.spread.mae.toFixed(3)} (baseline: ${baselineResults.spread.mae.toFixed(3)}, Δ=${(candidateResults.spread.mae - baselineResults.spread.mae).toFixed(3)})`);
      console.log(`  Holdout total MAE:   ${candidateResults.total.mae.toFixed(3)} (baseline: ${baselineResults.total.mae.toFixed(3)}, Δ=${(candidateResults.total.mae - baselineResults.total.mae).toFixed(3)})`);
      console.log(`  Holdout correct side: ${(candidateResults.spread.correctSidePct * 100).toFixed(1)}% (baseline: ${(baselineResults.spread.correctSidePct * 100).toFixed(1)}%)`);

      candidates.push({
        windowWeeks: W,
        trainStart,
        trainEnd,
        trainGames: trainData.gameCount,
        spreadTrainMAE: candidateSpread.performance.mae,
        totalTrainMAE: candidateTotal.performance.mae,
        spread: candidateResults.spread,
        total: candidateResults.total,
        candidateSpreadModel: candidateSpread,
        candidateTotalModel: candidateTotal,
      });
    } catch (err) {
      console.log(`  ❌ Training failed: ${err.message}`);
      candidates.push({
        windowWeeks: W,
        trainStart,
        trainEnd,
        trainGames: trainData.gameCount,
        error: err.message,
        spread: null,
        total: null,
      });
    }
  }

  // ── Step 4: Determine recommendation ────────────────────────────────────
  const recommendation = computeRecommendation(baselineResults, candidates);

  return {
    holdout: {
      start: holdoutStart,
      end: holdoutEnd,
      days: holdoutDays,
      games: holdoutData.gameCount,
    },
    baseline: {
      spread: baselineResults.spread,
      total: baselineResults.total,
    },
    candidates,
    recommendation,
    featureLeakageWarning: true,
    note: 'Features use CURRENT rolling stats (not as-of-date). Comparison is valid for weight sensitivity only.',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL EVALUATION ON HOLDOUT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate a spread + total model on holdout samples.
 * Returns per-model metrics.
 */
function evaluateModel(spreadModel, totalModel, spreadSamples, totalSamples) {
  // Spread evaluation
  const spreadErrors = [];
  let correctSide = 0;
  for (const sample of spreadSamples) {
    const pred = predictWithModel(spreadModel, sample.features);
    const error = pred - sample.target;
    spreadErrors.push(error);
    // Correct side: pred > 0 and actual > 0, or pred < 0 and actual < 0
    if ((pred > 0 && sample.target > 0) || (pred < 0 && sample.target < 0) || (pred === 0 && sample.target === 0)) {
      correctSide++;
    }
  }

  const spreadAbsErrors = spreadErrors.map(e => Math.abs(e));
  const spreadSqErrors = spreadErrors.map(e => e * e);
  const spreadN = spreadSamples.length;

  // Total evaluation
  const totalErrors = [];
  for (const sample of totalSamples) {
    const pred = predictWithModel(totalModel, sample.features);
    totalErrors.push(pred - sample.target);
  }

  const totalAbsErrors = totalErrors.map(e => Math.abs(e));
  const totalSqErrors = totalErrors.map(e => e * e);
  const totalN = totalSamples.length;

  return {
    spread: {
      mae: spreadN > 0 ? spreadAbsErrors.reduce((a, b) => a + b, 0) / spreadN : null,
      rmse: spreadN > 0 ? Math.sqrt(spreadSqErrors.reduce((a, b) => a + b, 0) / spreadN) : null,
      meanError: spreadN > 0 ? spreadErrors.reduce((a, b) => a + b, 0) / spreadN : null,
      correctSidePct: spreadN > 0 ? correctSide / spreadN : null,
      n: spreadN,
    },
    total: {
      mae: totalN > 0 ? totalAbsErrors.reduce((a, b) => a + b, 0) / totalN : null,
      rmse: totalN > 0 ? Math.sqrt(totalSqErrors.reduce((a, b) => a + b, 0) / totalN) : null,
      meanError: totalN > 0 ? totalErrors.reduce((a, b) => a + b, 0) / totalN : null,
      n: totalN,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RECOMMENDATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine if retraining is recommended based on candidate vs baseline comparison.
 * 
 * Decision rules:
 * - YES if any candidate improves spread MAE by ≥ 0.5 AND correct_side by ≥ 2%
 * - YES if any candidate improves spread MAE by ≥ 1.0 (regardless of correct_side)
 * - UNCLEAR if any candidate improves spread MAE by ≥ 0.3 but not both thresholds
 * - NO if no candidate improves or all improvements are < 0.3 MAE
 */
function computeRecommendation(baseline, candidates) {
  const validCandidates = candidates.filter(c => c.spread != null);

  if (validCandidates.length === 0) {
    return {
      verdict: 'UNCLEAR',
      reason: 'No candidate models could be trained (insufficient data).',
      bestWindow: null,
    };
  }

  let bestCandidate = null;
  let bestImprovement = -Infinity;

  for (const c of validCandidates) {
    const maeImprove = baseline.spread.mae - c.spread.mae; // positive = candidate is better
    const csImprove = c.spread.correctSidePct - baseline.spread.correctSidePct; // positive = candidate is better

    if (maeImprove > bestImprovement) {
      bestImprovement = maeImprove;
      bestCandidate = {
        window: c.windowWeeks,
        maeImprove,
        csImprove,
        candidateMAE: c.spread.mae,
        candidateCS: c.spread.correctSidePct,
        baselineMAE: baseline.spread.mae,
        baselineCS: baseline.spread.correctSidePct,
      };
    }
  }

  if (!bestCandidate) {
    return { verdict: 'NO', reason: 'No valid candidates.', bestWindow: null };
  }

  const { maeImprove, csImprove, window } = bestCandidate;

  // Decision logic
  if (maeImprove >= 1.0) {
    return {
      verdict: 'YES',
      reason: `${window}-week retrain improves spread MAE by ${maeImprove.toFixed(2)} (≥1.0 threshold). Strong signal.`,
      bestWindow: window,
      details: bestCandidate,
    };
  }

  if (maeImprove >= 0.5 && csImprove >= 0.02) {
    return {
      verdict: 'YES',
      reason: `${window}-week retrain improves spread MAE by ${maeImprove.toFixed(2)} AND correct-side by ${(csImprove * 100).toFixed(1)}%. Dual improvement.`,
      bestWindow: window,
      details: bestCandidate,
    };
  }

  if (maeImprove >= 0.3) {
    return {
      verdict: 'UNCLEAR',
      reason: `${window}-week retrain shows marginal MAE improvement (${maeImprove.toFixed(2)}), but not strong enough for confident recommendation.`,
      bestWindow: window,
      details: bestCandidate,
    };
  }

  if (maeImprove < 0) {
    return {
      verdict: 'NO',
      reason: `All candidates WORSE than baseline. Best candidate (${window}wk) degrades MAE by ${(-maeImprove).toFixed(2)}. Current model is fine.`,
      bestWindow: null,
      details: bestCandidate,
    };
  }

  return {
    verdict: 'NO',
    reason: `Best improvement (${window}wk) is only ${maeImprove.toFixed(2)} MAE — below 0.3 threshold. Current model is adequate.`,
    bestWindow: null,
    details: bestCandidate,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { buildEliteFeatures, buildSimpleFeatures, addDays, daysBetween, generateDateRange };
