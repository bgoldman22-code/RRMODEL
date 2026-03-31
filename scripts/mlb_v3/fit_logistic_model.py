#!/usr/bin/env python3
"""
Stage 2 — Fit Logistic Regression & Extract Coefficients
=========================================================
Reads the feature matrix from Stage 1, fits a logistic regression on
2022–2024 training data, then:

  1. Reports fitted coefficients (= empirical multiplier weights for V3)
  2. Validates on 2025 holdout:
       - Brier score
       - Hit rate by probability bucket (calibration table)
       - ROI by EV threshold (using market_prob as the book line)
  3. Writes coefficients to data/mlb_v3/lr_coefficients.json
     (consumed by statcastLoader.mjs to replace hardcoded z-scale values)

Features used
-------------
  hr_rate_std      season-to-date HR rate (Bayesian smoothed)
  barrel_pct       batter barrel%
  hard_hit_pct     batter hard-hit%
  pitcher_barrel   pitcher barrel% allowed
  pitcher_rv100    pitcher arsenal weighted run value / 100
  pitcher_hrfb     pitcher HR/FB rate
  park_hr_factor   park HR index / 100
  temp_adj         temp_f centered at 72°F (0 for domes)
  wind_out_mph     wind blowing out to CF (0 for domes / unknown)

All features are standardized (mean=0, sd=1) before fitting.
Coefficients are saved as z-scale multipliers.

Run
---
  python scripts/mlb_v3/fit_logistic_model.py [--matrix PATH] [--out-coef PATH]
"""

import argparse
import json
import math
import pathlib
import warnings

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegressionCV
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.calibration import calibration_curve

warnings.filterwarnings("ignore")

ROOT = pathlib.Path(__file__).parent.parent.parent

parser = argparse.ArgumentParser(description="Fit logistic regression on HR feature matrix")
parser.add_argument("--matrix", type=str,
                    default=str(ROOT / "data/mlb_v3/feature_matrix.parquet"))
parser.add_argument("--out-coef", type=str,
                    default=str(ROOT / "data/mlb_v3/lr_coefficients.json"))
args = parser.parse_args()

MAT_PATH  = pathlib.Path(args.matrix)
COEF_PATH = pathlib.Path(args.out_coef)
COEF_PATH.parent.mkdir(parents=True, exist_ok=True)

# ── Load matrix ───────────────────────────────────────────────────────────────
print(f"Loading {MAT_PATH} ...")
df = pd.read_parquet(MAT_PATH)
print(f"  {len(df):,} rows, {df['did_hr'].mean():.4f} HR rate")
print(f"  Seasons: {sorted(df['season'].unique())}")

# ── Feature engineering ───────────────────────────────────────────────────────
# Bayesian-smooth the rolling HR rate: blend with league prior (4% / 60 PA)
PRIOR_RATE = 0.04
PRIOR_PA   = 60

df["hr_rate_bayes"] = (
    (df["hr_rate_std"] * df["pa_std"] + PRIOR_RATE * PRIOR_PA) /
    (df["pa_std"] + PRIOR_PA)
)

# Temperature: centered at 72°F, 0 for domes
df["temp_adj"] = df["temp_f"].fillna(72) - 72
df.loc[df["is_dome"], "temp_adj"] = 0.0

# Wind: 0 for domes / unknown
df["wind_adj"] = df["wind_out_mph"].fillna(0.0)
df.loc[df["is_dome"], "wind_adj"] = 0.0

FEATURE_COLS = [
    "hr_rate_bayes",    # batter season-to-date rate (Bayesian)
    "barrel_pct",       # batter barrel% (percentile rank 0–100 from statcast_batter_percentile_ranks)
    "hard_hit_pct",     # batter hard-hit% (percentile rank 0–100)
    "pitcher_barrel",   # pitcher barrel% allowed (percentile rank 0–100 from statcast_pitcher_percentile_ranks)
    "pitcher_rv100",    # pitcher arsenal weighted RV / 100
    "pitcher_hrfb",     # pitcher HR/FB rate (raw ratio 0–1, from FanGraphs via pybaseball)
    "park_hr_factor",   # park factor (1.0 = neutral)
    "temp_adj",         # temperature above 72°F
    "wind_adj",         # wind out to CF mph
]

# Explicit scale documentation for each feature (written to lr_coefficients.json)
FEATURE_NOTES = {
    "hr_rate_bayes":  "Bayesian-smoothed season-to-date HR/PA rate for batter (raw ratio ~0–0.15, blended with prior 0.04/60 PA). NOT a percentile.",
    "barrel_pct":     "Percentile rank 0–100 from pybaseball.statcast_batter_percentile_ranks(). Higher = better barrel contact. NOT a raw rate (raw barrel% would be ~3–20%).",
    "hard_hit_pct":   "Percentile rank 0–100 from pybaseball.statcast_batter_percentile_ranks(). Higher = more hard contact. NOT a raw rate.",
    "pitcher_barrel": "Percentile rank 0–100 from pybaseball.statcast_pitcher_percentile_ranks(). Higher = pitcher allows more barrels. NOT a raw rate.",
    "pitcher_rv100":  "Weighted average pitch run value per 100 pitches (RV/100) across all pitch types, weighted by usage%. Negative = harder to hit. Raw units ~-2 to +2.",
    "pitcher_hrfb":   "FanGraphs HR/FB rate for starting pitcher. Raw ratio 0–1 (e.g. 0.10 = 10%). Retrieved via pybaseball.pitching_stats(), column 'HR/FB'.",
    "park_hr_factor": "Park HR factor divided by 100 (so 1.0 = neutral). Source: static lookup table by team abbreviation. COL=1.19, SF=0.92, etc.",
    "temp_adj":       "Game temperature in °F minus 72 (so 0 = neutral). Set to 0.0 for domed stadiums. Source: MLB StatsAPI weather field.",
    "wind_adj":       "Wind speed in mph blowing OUT to CF (negative = in from CF, 0 = cross or dome). Source: MLB StatsAPI weather.wind string parsed.",
}

TARGET = "did_hr"

# ── Train / holdout split ─────────────────────────────────────────────────────
train = df[df["season"] <= 2024].copy()
test  = df[df["season"] == 2025].copy()

print(f"\nTrain (2022–2024): {len(train):,} rows, {train[TARGET].mean():.4f} HR rate")
print(f"Test  (2025):      {len(test):,} rows,  {test[TARGET].mean():.4f} HR rate")

# ── Impute missing feature values with training-set medians ──────────────────
# Many Statcast features are missing for bench players / unknown pitchers.
# Impute with the median so no rows are dropped.
print("\nFeature NA rates (train):")
for col in FEATURE_COLS:
    na_pct = train[col].isna().mean()
    print(f"  {col:<22}  {na_pct:.1%} NA")

train_medians = {col: float(train[col].median()) for col in FEATURE_COLS}
for col in FEATURE_COLS:
    train[col] = train[col].fillna(train_medians[col])
    test[col]  = test[col].fillna(train_medians[col])   # use train median on test too

train_clean = train.dropna(subset=[TARGET]).copy()
test_clean  = test.dropna(subset=[TARGET]).copy()

print(f"\nAfter imputation (no rows dropped for features):")
print(f"  Train: {len(train_clean):,} rows")
print(f"  Test:  {len(test_clean):,} rows")

X_train = train_clean[FEATURE_COLS].values
y_train = train_clean[TARGET].values
X_test  = test_clean[FEATURE_COLS].values
y_test  = test_clean[TARGET].values

# ── Fit model ─────────────────────────────────────────────────────────────────
# LogisticRegressionCV selects the best C (regularization) via 5-fold CV.
# class_weight='balanced' handles the heavy class imbalance (~4% HR rate).
print("\nFitting LogisticRegressionCV (5-fold CV, class_weight=balanced)...")

scaler = StandardScaler()
imputer = SimpleImputer(strategy="median")
clf = LogisticRegressionCV(
    Cs=10,
    cv=5,
    scoring="neg_brier_score",
    class_weight=None,      # let the natural 10.7% HR rate calibrate probabilities
    max_iter=1000,
    random_state=42,
    n_jobs=-1,
)
pipe = Pipeline([("imputer", imputer), ("scaler", scaler), ("clf", clf)])
pipe.fit(X_train, y_train)

print(f"  Best C: {clf.C_[0]:.4f}")
print(f"  Train AUC: {roc_auc_score(y_train, pipe.predict_proba(X_train)[:,1]):.4f}")

# ── Coefficients ──────────────────────────────────────────────────────────────
# Coefficients are in standardized space. We report them as-is so the
# JS model can use them to compute log-odds contributions per z-score unit.
coefs = dict(zip(FEATURE_COLS, clf.coef_[0]))
intercept = float(clf.intercept_[0])
feature_means = dict(zip(FEATURE_COLS, pipe.named_steps["scaler"].mean_))
feature_stds  = dict(zip(FEATURE_COLS, pipe.named_steps["scaler"].scale_))

print("\n  Fitted coefficients (standardized):")
for feat, coef in sorted(coefs.items(), key=lambda x: abs(x[1]), reverse=True):
    print(f"    {feat:<22}  {coef:+.4f}")
print(f"    {'intercept':<22}  {intercept:+.4f}")

# ── Test set evaluation ───────────────────────────────────────────────────────
y_prob = pipe.predict_proba(X_test)[:, 1]
brier  = brier_score_loss(y_test, y_prob)
auc    = roc_auc_score(y_test, y_prob)

print(f"\n{'═'*55}")
print(f"  HOLDOUT VALIDATION (2025)")
print(f"{'═'*55}")
print(f"  Brier score: {brier:.5f}   (lower is better; baseline={y_test.mean()*(1-y_test.mean()):.5f})")
print(f"  ROC-AUC:     {auc:.4f}   (0.5 = random)")

# ── Calibration table (hit rate by probability bucket) ───────────────────────
BUCKETS = [0.00, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.20, 0.30, 1.01]
print(f"\n  Calibration — hit rate by probability bucket (2025):")
print(f"  {'Bucket':<18}  {'N':>6}  {'Pred%':>7}  {'Actual%':>8}  {'Ratio':>6}")
for lo, hi in zip(BUCKETS[:-1], BUCKETS[1:]):
    mask = (y_prob >= lo) & (y_prob < hi)
    n = mask.sum()
    if n == 0: continue
    pred_mean  = y_prob[mask].mean()
    actual_mean = y_test[mask].mean()
    ratio = actual_mean / pred_mean if pred_mean > 0 else float("nan")
    print(f"  [{lo:.2f} – {hi:.2f})       {n:>6,}  {pred_mean:>6.1%}   {actual_mean:>7.1%}   {ratio:>6.2f}")

# ── ROI backtest by EV threshold ─────────────────────────────────────────────
# Only rows with a market line available
test_with_odds = test_clean[test_clean["market_prob"].notna()].copy()
test_with_odds["model_prob"] = pipe.predict_proba(test_with_odds[FEATURE_COLS].values)[:, 1]
test_with_odds["book_prob"]  = test_with_odds["market_prob"]

# Implied decimal odds from book prob
test_with_odds["decimal_odds"] = 1.0 / test_with_odds["book_prob"]
test_with_odds["ev"] = test_with_odds["model_prob"] * test_with_odds["decimal_odds"] - 1.0

print(f"\n  ROI Backtest by EV threshold (2025, n={len(test_with_odds):,} rows with market line):")
print(f"  {'EV≥':<8}  {'Bets':>6}  {'Wins':>6}  {'Win%':>7}  {'Avg Odds':>9}  {'ROI':>8}")

for ev_thresh in [0.00, 0.05, 0.10, 0.15, 0.20, 0.25]:
    picks = test_with_odds[test_with_odds["ev"] >= ev_thresh]
    if len(picks) == 0: continue
    n_bets = len(picks)
    n_wins = picks["did_hr"].sum()
    win_pct = n_wins / n_bets
    avg_odds = picks["decimal_odds"].mean()
    roi = picks.apply(
        lambda r: r["decimal_odds"] - 1 if r["did_hr"] else -1.0, axis=1
    ).mean()
    print(f"  {ev_thresh:.2f}      {n_bets:>6,}  {n_wins:>6,}  {win_pct:>6.1%}  {avg_odds:>9.2f}  {roi:>8.1%}")

# ── Market baseline (bet every available line) ────────────────────────────────
n_all = len(test_with_odds)
if n_all > 0:
    roi_all = test_with_odds.apply(
        lambda r: r["decimal_odds"] - 1 if r["did_hr"] else -1.0, axis=1
    ).mean()
    print(f"\n  Market baseline (bet everything): ROI = {roi_all:.1%}  (expected ≈ -5% to -10%)")

# ── Bootstrap CI on EV≥0.25 ROI (1,000 iterations) ──────────────────────────
N_BOOT = 1000
EV_BOOT = 0.25
rng = np.random.default_rng(seed=42)

picks_25 = test_with_odds[test_with_odds["ev"] >= EV_BOOT].copy()
per_bet_pnl = picks_25.apply(
    lambda r: r["decimal_odds"] - 1 if r["did_hr"] else -1.0, axis=1
).values

n_picks = len(picks_25)
boot_rois = []
for _ in range(N_BOOT):
    sample = rng.choice(per_bet_pnl, size=n_picks, replace=True)
    boot_rois.append(sample.mean())

boot_rois = np.array(boot_rois)
p5  = float(np.percentile(boot_rois, 5))
p50 = float(np.percentile(boot_rois, 50))
p95 = float(np.percentile(boot_rois, 95))
point_est = float(per_bet_pnl.mean())

print(f"\n{'═'*55}")
print(f"  BOOTSTRAP CI — EV≥{EV_BOOT:.0%} ROI  (n={n_picks} bets, {N_BOOT} iterations)")
print(f"{'═'*55}")
print(f"  Point estimate:    {point_est:+.1%}")
print(f"  5th  percentile:   {p5:+.1%}   ← lower bound")
print(f"  50th percentile:   {p50:+.1%}   (median)")
print(f"  95th percentile:   {p95:+.1%}   ← upper bound")
deploy_flag = "✅ SAFE TO DEPLOY (lower bound ≥ -5%)" if p5 >= -0.05 else "⚠️  DISCUSS BEFORE DEPLOY (lower bound < -5%)"
print(f"\n  {deploy_flag}")

# ── Save coefficients ─────────────────────────────────────────────────────────
output = {
    "model_version": "lr_v1",
    "trained_on":    "2022-2024",
    "holdout":       "2025",
    "n_train":       int(len(train_clean)),
    "n_test":        int(len(test_clean)),
    "hr_rate_train": float(y_train.mean()),
    "hr_rate_test":  float(y_test.mean()),
    "brier_score":   float(brier),
    "roc_auc":       float(auc),
    "best_C":        float(clf.C_[0]),
    "intercept":     intercept,
    "feature_notes": FEATURE_NOTES,
    "feature_means": feature_means,
    "feature_stds":  feature_stds,
    "impute_medians": {k: float(v) for k, v in train_medians.items()},
    "coefficients":  {k: float(v) for k, v in coefs.items()},
    "z_scale_weights": {
        feat: float(coef)
        for feat, coef in coefs.items()
    },
    "bootstrap_ci": {
        "ev_threshold": EV_BOOT,
        "n_bets":       n_picks,
        "n_iterations": N_BOOT,
        "point_est":    point_est,
        "p5":           p5,
        "p50":          p50,
        "p95":          p95,
        "deploy_safe":  bool(p5 >= -0.05),
    },
}

COEF_PATH.write_text(json.dumps(output, indent=2))
print(f"\n✅ Coefficients saved → {COEF_PATH}")

# ── Human-readable interpretation ─────────────────────────────────────────────
print(f"\n  INTERPRETATION (use these in statcastLoader.mjs):")
print(f"  One standard deviation of each feature changes log-odds by:")
for feat in FEATURE_COLS:
    coef = coefs[feat]
    mean = feature_means[feat]
    std  = feature_stds[feat]
    mult_per_sd = math.exp(coef)
    print(f"    {feat:<22}  coef={coef:+.3f}  mean={mean:.3f}  std={std:.3f}  "
          f"→ ×{mult_per_sd:.3f} per 1-SD swing")
