# NBA Player Props Phase 3.6 Architecture

_Phase 3.6 upgrades the existing Phase 3.5 hybrid stack with a fully line-aware, multi-output modeling system that yields calibrated projections, full stat distributions, and precise over/under probabilities across Points, Rebounds, and Assists._

---

## 1. Objectives

1. Produce elite-quality projections, distributions, and probabilities per stat category.
2. Encode true line awareness so feature space reflects market context (line deltas, z-scores, opponent percentile, rest/travel effects, role shifts).
3. Apply per-market calibration (Platt + isotonic) so reported hit rates match observed frequencies.
4. Run rolling walk-forward backtests with ROI and line-sensitivity guarantees.
5. Integrate seamlessly with existing registry, generator, Kelly staking, canonical filtering, and frontend tooling without regressing any Phase 3.5 behaviors.

---

## 2. System Overview

```
player_history → feature engineering →
  ├─ projection regressor (LightGBM) → μ (proj)
  ├─ dispersion regressor (LightGBM Tweedie) → α (distribution)
  ├─ probability classifier (LightGBM + line features) → p_over_raw
                     ↓
           calibration layer (isotonic + Platt)
                     ↓
        {proj, dist_params, p_over, p_under, bins}
                     ↓
      inference engine v4 + generator v3.6
                     ↓
 public/data/nba/nba-props-v3-live.json & frontend
```

Key traits:
- **Feature stack:** 110+ engineered inputs with explicit line deltas, opponent percentile ranks, pace/usage adjustments, fatigue splines, rest/travel encoding, matchup rank deltas, and role-change/injury shock detectors. All features are computed with strict walk-forward windows to avoid leakage.
- **Model trio:** each stat market trains three LightGBM boosters (projection, dispersion, probability). Dispersion uses a Tweedie objective to better capture count-style variance; probability booster consumes both base features and distribution statistics (μ, α, simulated quantiles) for maximum line sensitivity.
- **Calibration:** per-market Platt scaling to stabilize mid-probabilities plus isotonic regression to enforce monotonic reliability. Calibrators are persisted as JSON arrays so Node can evaluate them without Python at inference time.
- **Distribution sampling:** outputs Negative Binomial (for points & rebounds) or Skellam-inspired mixture (for assists) derived from projection + dispersion. This enables precise P(X > line) calculations and confidence bins, independent of the classifier.
- **Walk-forward:** monthly sliding windows (Oct–Jan train, Feb validate, Mar–Apr test, then roll forward by 2 weeks) with ROI vs -110 odds. Backtests store threshold sweeps, sensitivity curves, calibration reliabilities, and Kelly unit ladders.
- **Integration:** generator v3.6 writes to `public/data/nba/nba-props-v3-live.json`, adds projection/distribution metadata per pick, and keeps canonical filters/Kelly sizing identical to Phase 3.5. Registry v3.6 coexists with v3.5 so rollbacks remain trivial.

---

## 3. Directory Layout Additions

```
models/
  phase3.6/
    points/
      projection_booster.txt
      projection_metadata.json
      distribution_booster.txt
      distribution_metadata.json
      probability_booster.txt
      probability_metadata.json
      calibration_isotonic.json
      calibration_platt.json
    rebounds/
      ... (same structure)
    assists/
      ... (same structure)
scripts/nba/
  train-phase3.6/
    train_phase36_models.py
    feature_config.py
    calibration_utils.py
  backtest-phase3.6/
    walkforward_backtest.mjs
    distribution_sanity.mjs
public/data/nba/
  nba-props-v3-live.json (generated)
docs/
  NBA_PHASE3.6_ARCHITECTURE.md (this document)
```

Existing Phase 3.5 artifacts remain untouched so the scheduler can continue using v2 outputs during rollout.

---

## 4. Modeling & Feature Plan

### 4.1 Feature Families
- **Line geometry:** `line_minus_proj`, `line_vs_L{5,10,20}`, `line_zscore_vs_player`, `line_z_vs_distribution`, `implied_prob_minus_proj_cdf`.
- **Opponent context:** percentile ranks of opponent allowed stats, matchup rank deltas (league percentile), switching penalties versus switch-heavy teams, rim/paint/assist-specific defense toggles.
- **Recency & usage:** exponential weighted usage rate, role-change indicator (delta minutes vs 10-game baseline), injury-shock booleans (teammate out tags), pace-adjusted expectation, synergy with teammate pace.
- **Location & fatigue:** home/road splits, travel miles in last 5 days, back-to-back penalty, third-in-four flag, rest-day spline basis, timezone delta.
- **Distribution hints:** empirical variance, over/under history vs line, last-line delta slope, realized `z_score` residual history.

Each feature is computed with `feature_config.py`, making it easy to audit and extend.

### 4.2 Models Per Market
| Market | Projection | Distribution | Probability |
| --- | --- | --- | --- |
| Points | LightGBM reg (L1/L2 mix) | LightGBM Tweedie | LightGBM binary + calibrated |
| Rebounds | LightGBM reg | LightGBM Tweedie | LightGBM binary + calibrated |
| Assists | LightGBM reg (poisson-ish) | Gaussian mixture approx (via Tweedie + iso) | LightGBM binary + calibrated |

Probability model inputs include output from projection/dist modules (μ, σ, quantiles) for better sensitivity.

---

## 5. Calibration Layer
1. Split walk-forward predictions into bins.
2. Fit Platt scaler (logistic regression on logits) for global smoothing.
3. Fit isotonic regression on Platt-adjusted probabilities to enforce monotonic calibration.
4. Persist calibrators as JSON (knots array for isotonic, bias/weight for Platt).
5. In inference, apply `platt(p)` then isotonic lookup to obtain `p_calibrated`.

---

## 6. Walk-Forward Backtests & Line Sensitivity
- Rolling windows: Train Oct–Jan, validate Feb, test Mar–Apr, advance 2 weeks, repeat.
- Metrics captured per window:
  - Hit rate, ROI vs -110, ROI vs live odds
  - Brier score, log-loss, calibration MAE
  - Line delta curve (prob vs line offset) for sensitivity verification
  - Threshold sweep (0.52–0.68) with ROI + volume
  - Kelly sizing table (0.25–1.5U) with drawdown simulation
- Summary artifacts stored under `backtest-results/phase3.6/*` and referenced by registry metadata.

---

## 7. Integration & Compatibility
- **Generator:** new script `generate-predictions-phase3.6.mjs` that calls inference engine v4, writes to `nba-props-v3-live.json`, and preserves atomic writes plus canonical filters.
- **Inference engine:** v4 adds multi-output predictions, calibration application, and distribution-based `p_over` calculation for cross-checking the classifier.
- **Registry:** new `phase3_6_model_registry.json` coexists with phase3.5; scheduler flag toggles which generator to run.
- **Frontend:** same schema keys plus additive fields (`proj`, `distribution`, `confidence_bin`, `calibrated_prob`). Existing components fall back gracefully.

---

## 8. Deployment Roadmap
1. Train + save models with `train_phase36_models.py`.
2. Run `walkforward_backtest.mjs` → produce ROI, calibration, thresholds.
3. Update registry & inference engine references.
4. Dry-run generator locally, inspect `nba-props-v3-live.json`.
5. Validate canonical filters + Kelly units via test harness.
6. Flip scheduler to run Phase 3.6 in parallel (shadow mode) for 2 slates.
7. Promote `nba-props-v3-live.json` to frontend once calibration & ROI match expectations.

---

Phase 3.6 now has a codified architecture and directory layout that satisfies every requirement while keeping Phase 3.5 fully operational for fallback.
