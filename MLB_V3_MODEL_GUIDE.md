# MLB V3 Model Guide
> Last updated: 2026-03-31 | Schema: v2 | Branch: main42

---

## 1. Overview

MLB V3 is an 11-feature XGBoost + isotonic calibration model for predicting batter HR probability on a given game day. It powers the `/mlb-hr` Netlify function and the RR (Risk/Reward) pick generator.

**Production pipeline:**
```
GitHub Actions (daily, ~9am ET)
  → fetch_statcast.py        — fetches 6 Statcast/FanGraphs blobs → Netlify Blobs
  → build_daily_features.py  — assembles 11-feature vectors → statcast/features-YYYY-MM-DD.json
  → mlb-slate-v3.mjs         — reads features blob, runs inference, scores EV
  → mlb-rr-generate.mjs      — applies RR filter, outputs picks
```

---

## 2. Feature Schema v2

Strict index order — any change requires retraining and redeployment of all four files:
`feature_schema.json`, `train_medians.json`, `xgb_base.joblib`, `xgb_calibrator.joblib`

| Index | Name | Source | Median (train) | Notes |
|---|---|---|---|---|
| 0 | `hr_rate_bayes` | MLB StatsAPI rolling | 0.07494 | Bayesian-shrunk HR rate, 200 PA prior |
| 1 | `barrel_pct` | Statcast EV leaderboard | 50.0 | Batter barrel% (percentile rank 0–100) |
| 2 | `hard_hit_pct` | Statcast EV leaderboard | 50.0 | Batter hard-hit% (percentile rank 0–100) |
| 3 | `pitcher_barrel` | Statcast EV leaderboard | 43.0 | Pitcher barrel% allowed (percentile rank) |
| 4 | `pitcher_rv100` | Statcast arsenal blob | 0.0382 | Weighted RV/100 across pitch types |
| 5 | `pitcher_hrfb` | FanGraphs pitching_stats() | 0.123 | Pitcher HR/FB rate |
| 6 | `park_hr_factor` | FanGraphs park factors (3yr) | 0.99 | HR index / 100; 1.0 = neutral |
| 7 | `temp_adj` | MLB StatsAPI weather | 0.0 | (temp_f − 70) × 0.003; 0 for domes |
| 8 | `wind_adj` | MLB StatsAPI weather | 0.0 | wind_out_mph × 0.002; 0 for dome |
| 9 | `pull_park_score` | Savant spray (daily fetch) | 0.2178 | pull_rate_fly × directional park factor |
| 10 | `pitcher_zone_pct` | FanGraphs pitching_stats() | 0.42 | Fraction of pitches thrown in zone |

**Dropped features:**
- `batter_oswing_pct` — FanGraphs `batting_stats()` returns HTTP 403 for all seasons; 0% coverage; 0.0% feature gain. See `TICKET_BATTER_OSWING_PCT.md`.

---

## 3. Model Parameters

```python
BEST_PARAMS = {
    "n_estimators": 400, "max_depth": 3, "learning_rate": 0.05,
    "subsample": 0.8, "colsample_bytree": 0.8, "min_child_weight": 10,
    "gamma": 1.0, "reg_alpha": 0.1, "reg_lambda": 1.0,
    "eval_metric": "logloss", "random_state": 42, "n_jobs": -1,
}
# Calibrator: IsotonicRegression(out_of_bounds="clip") fitted on 2024 val split
# Train: 2022–2023 | Val: 2024 | Test: 2025
# scale_pos_weight NOT used — sprint validation showed it degrades RR ROI
```

**Performance on 2025 holdout:**
| Metric | Baseline v1 (9 feat) | v2 (11 feat) | Delta |
|---|---|---|---|
| AUC | 0.6480 | 0.6508 | +0.0028 |
| Mean qualifying odds | +704 | +681 | −23 |
| RR ROI (point est.) | +24.1% | +50.5%† | +26.4pp |
| Bootstrap 90% CI lower | −22.6% | +10.4%† ✅ | +32.9pp |

†**See bias warning in Section 5.**

---

## 4. Artifacts

All serialized to `data/mlb_v3/artifacts/`:

| File | Description |
|---|---|
| `xgb_base.joblib` | Trained XGBClassifier (11 features, 400 trees) |
| `xgb_calibrator.joblib` | IsotonicRegression calibrator |
| `train_medians.json` | Imputation medians for all 11 features (from 2022–2023 train split) |
| `feature_schema.json` | Canonical schema: feature names, indices, BEST_PARAMS, inference steps |

**Artifacts must be kept in sync.** If any one is updated, all four must be updated together and redeployed.

---

## 5. ⚠️ Backtest Bias Warning

> **The sprint D1 RR ROI figures (+50.5% point estimate, +10.4% CI lower bound) are OPTIMISTIC UPPER BOUNDS.**

**Root cause:** In `scripts/mlb_v3/feature_sprint_d1.py` Phase B, spray data is loaded as a full-season aggregate per season and applied to all game rows without per-row date gating. A game row from April 2025 receives `pull_rate_fly` computed from fly balls through the script's run date, not just through that game's date. This is lookahead bias.

**Why it's likely small:** `pull_rate_fly` is a highly stable within-season trait (within-season r ≈ 0.9+). The early-season value converges quickly to the full-season value for most batters. The bias inflates signal for early-season rows, but most rows are mid-to-late season where it makes no difference.

**Production is clean.** `build_daily_features.py` fetches `spray-{SEASON}.json` with `game_date_lt=TODAY` each morning. Live inference only uses fly balls accumulated through the current date.

**Remediation:** A rolling spray recompute (per-row date-gated) is scheduled as a background task after the first full week of live data. Live results logger calibration data is prioritized over a recomputed backtest. Do not use the +50.5% figure for capital allocation above $10/unit until the clean estimate is available.

---

## 6. Inference Pipeline

```python
# 1. Bayesian HR rate
GLOBAL_HR = train_mean_did_hr           # ~0.044
ALPHA = 200 * GLOBAL_HR
BETA  = 200 * (1 - GLOBAL_HR)
hr_rate_bayes = (hr_ytd + ALPHA) / (pa_ytd + ALPHA + BETA)

# 2. Weather adjustments (0 for dome venues)
temp_adj = (temp_f - 70) * 0.003
wind_adj = wind_out_mph * 0.002         # positive = out to CF

# 3. Pull park score
# RHH pulls to LF → use directional L factor; LHH to RF → R factor
pull_park_score = pull_rate_fly × _DIRECTIONAL_PARKS[home_abbrev][side]
# Leave None if no spray data — do NOT impute with 0

# 4. Impute nulls with train_medians.json
# 5. Stack in strict index order [0..10]
# 6. raw = xgb_base.predict_proba(X)[:, 1]
# 7. prob = xgb_calibrator.transform(raw)
# 8. EV = prob * (decimal_odds - 1) - (1 - prob)
```

---

## 7. Validation Gates (logged by build_daily_features.py)

On each daily run, the following are printed and should be monitored:

| Gate | Threshold | Action if failing |
|---|---|---|
| Players built | > 100 | Check schedule fetch / roster API |
| Barrel pct coverage | > 80% | Check Statcast EV blob freshness |
| Pitcher HR/FB coverage | > 70% | Check FanGraphs blob freshness |
| Pull park score coverage | > 85% | Check spray blob; spray pagination working? |
| Pitcher zone% coverage | > 90% | Check FanGraphs blob zone_pct field |
| Probs in [0.05, 0.45] | > 95% | Model calibration check |

---

## 8. Pending Backlog

| Item | Priority | Blocked on |
|---|---|---|
| Rolling spray recompute (clean D1 backtest) | Medium | After 1 week live data |
| `batter_oswing_pct` endpoint investigation | Low | See `TICKET_BATTER_OSWING_PCT.md` |
| Decision 3: archetype clustering | Medium | Post-deployment |
| Decision 4: tiered EV thresholds | Medium | Post-deployment |
| Spray pagination coverage check (target 95%+) | Low | Next scheduled fetch |

---

## 9. File Map

| File | Role |
|---|---|
| `scripts/mlb_v3/fetch_statcast.py` | Daily data fetch → Netlify Blobs |
| `scripts/mlb_v3/build_daily_features.py` | Feature vector assembly + inference |
| `scripts/mlb_v3/build_feature_matrix.py` | Training matrix builder |
| `scripts/mlb_v3/feature_sprint_d1.py` | Sprint D1: pull_park_score + pitcher_zone_pct |
| `netlify/functions/mlb-slate-v3.mjs` | Slate scoring endpoint (SCHEMA_ORDER) |
| `netlify/functions/mlb-score-v3.py` | XGBoost inference endpoint (_COLS) |
| `netlify/functions/mlb-rr-generate.mjs` | RR pick generator |
| `data/mlb_v3/artifacts/` | Serialized model + schema |
| `.github/workflows/mlb-statcast-daily.yml` | Daily automation |
