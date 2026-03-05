/**
 * Shadow Eval – Metrics Calculator
 * 
 * Computes PRE vs POST deadline error metrics:
 * - MAE, RMSE for margin predictions
 * - Brier score, Log loss for win probability
 * - Calibration by bins with slope/intercept
 * - Favorite/underdog split errors
 * 
 * Pure computation module – no side effects.
 */

/**
 * Compute all metrics for a set of prediction rows.
 * @param {Array} rows - prediction rows with pred_margin, actual_margin, pred_win_prob_home, actual_home_win
 * @param {string} mode - 'margin', 'prob', or 'both'
 * @returns {Object} metrics
 */
export function computeMetrics(rows, mode = 'both') {
  const validMargin = rows.filter(r => r.pred_margin != null && r.actual_margin != null && r.completed);
  const validProb = rows.filter(r => r.pred_win_prob_home != null && r.actual_home_win != null && r.completed);

  const metrics = { n: rows.length, n_completed: validMargin.length };

  // ── Margin metrics ──────────────────────────────────────────────────────
  if (mode === 'margin' || mode === 'both') {
    if (validMargin.length > 0) {
      const errors = validMargin.map(r => r.pred_margin - r.actual_margin);
      const absErrors = errors.map(e => Math.abs(e));
      const sqErrors = errors.map(e => e * e);

      metrics.mae = mean(absErrors);
      metrics.rmse = Math.sqrt(mean(sqErrors));
      metrics.mean_error = mean(errors); // bias direction
      metrics.median_abs_error = median(absErrors);

      // Correct side % (did we predict the right winner?)
      const correctSide = validMargin.filter(r => {
        if (r.pred_margin > 0 && r.actual_margin > 0) return true;
        if (r.pred_margin < 0 && r.actual_margin < 0) return true;
        return false;
      });
      metrics.correct_side_pct = correctSide.length / validMargin.length;
    } else {
      metrics.mae = null;
      metrics.rmse = null;
      metrics.mean_error = null;
      metrics.median_abs_error = null;
      metrics.correct_side_pct = null;
    }
  }

  // ── Total prediction metrics ────────────────────────────────────────────
  if (mode === 'margin' || mode === 'both') {
    const validTotal = rows.filter(r => r.pred_total != null && r.actual_total != null && r.completed);
    if (validTotal.length > 0) {
      const totalErrors = validTotal.map(r => r.pred_total - r.actual_total);
      const totalAbsErrors = totalErrors.map(e => Math.abs(e));
      const totalSqErrors = totalErrors.map(e => e * e);
      metrics.total_mae = mean(totalAbsErrors);
      metrics.total_rmse = Math.sqrt(mean(totalSqErrors));
      metrics.total_mean_error = mean(totalErrors);
      metrics.n_total = validTotal.length;
    }
  }

  // ── Probability metrics ─────────────────────────────────────────────────
  if (mode === 'prob' || mode === 'both') {
    if (validProb.length > 0) {
      // Brier score
      const brierTerms = validProb.map(r => {
        const p = r.pred_win_prob_home;
        const y = r.actual_home_win;
        return (p - y) ** 2;
      });
      metrics.brier = mean(brierTerms);

      // Log loss (with clamping to avoid log(0))
      const EPS = 1e-7;
      const logLossTerms = validProb.map(r => {
        const p = Math.max(EPS, Math.min(1 - EPS, r.pred_win_prob_home));
        const y = r.actual_home_win;
        return -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
      });
      metrics.log_loss = mean(logLossTerms);

      // Calibration bins (0.10 width)
      metrics.calibration = computeCalibration(validProb, 0.10);
      metrics.calibration_fine = computeCalibration(validProb, 0.05);
    } else {
      metrics.brier = null;
      metrics.log_loss = null;
      metrics.calibration = null;
      metrics.calibration_fine = null;
    }
  }

  // ── Favorite/Underdog split (requires closing line) ─────────────────────
  const withLine = validMargin.filter(r => r.closing_spread != null);
  if (withLine.length > 0) {
    // Favorites: closing_spread < 0 for home (home is favored)
    const favGames = withLine.filter(r => r.closing_spread < 0);
    const dogGames = withLine.filter(r => r.closing_spread > 0);

    if (favGames.length > 0) {
      metrics.fav_mae = mean(favGames.map(r => Math.abs(r.pred_margin - r.actual_margin)));
      metrics.fav_n = favGames.length;
    }
    if (dogGames.length > 0) {
      metrics.dog_mae = mean(dogGames.map(r => Math.abs(r.pred_margin - r.actual_margin)));
      metrics.dog_n = dogGames.length;
    }
  }

  return metrics;
}

/**
 * Compute calibration bins.
 * Groups predictions by probability bin, computes avg predicted prob vs actual win rate.
 */
function computeCalibration(rows, binWidth = 0.10) {
  const bins = [];
  for (let lo = 0; lo < 1.0; lo += binWidth) {
    const hi = lo + binWidth;
    const inBin = rows.filter(r => r.pred_win_prob_home >= lo && r.pred_win_prob_home < hi);
    if (inBin.length === 0) continue;
    const avgPred = mean(inBin.map(r => r.pred_win_prob_home));
    const actualWinRate = mean(inBin.map(r => r.actual_home_win));
    bins.push({
      bin: `${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}%`,
      lo: parseFloat(lo.toFixed(2)),
      hi: parseFloat(hi.toFixed(2)),
      count: inBin.length,
      avg_pred: parseFloat(avgPred.toFixed(4)),
      actual_win_rate: parseFloat(actualWinRate.toFixed(4)),
      error: parseFloat((avgPred - actualWinRate).toFixed(4)),
    });
  }

  // Linear fit on bin midpoints (simple least-squares)
  if (bins.length >= 2) {
    const xs = bins.map(b => b.avg_pred);
    const ys = bins.map(b => b.actual_win_rate);
    const fit = linearFit(xs, ys);
    return { bins, slope: parseFloat(fit.slope.toFixed(4)), intercept: parseFloat(fit.intercept.toFixed(4)), r_squared: parseFloat(fit.rSquared.toFixed(4)) };
  }

  return { bins, slope: null, intercept: null, r_squared: null };
}

// ── Utility functions ───────────────────────────────────────────────────────

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function linearFit(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0, den = 0, ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  const intercept = my - slope * mx;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, rSquared };
}

/**
 * Split rows into PRE and POST based on deadline date.
 */
export function splitByDeadline(rows, deadline) {
  const pre = rows.filter(r => r.date < deadline);
  const post = rows.filter(r => r.date >= deadline);
  return { pre, post };
}
