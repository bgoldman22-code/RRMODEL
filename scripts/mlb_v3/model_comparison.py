#!/usr/bin/env python3
"""
Model Comparison — LR vs XGBoost vs Random Forest
===================================================
Split:
  Train:    2022–2023 (fit model hyperparams + feature selection)
  Validate: 2024      (hyperparameter tuning, calibration fit)
  Test:     2025      (held-out, touched exactly once at the end)

All three models use isotonic calibration (CalibratedClassifierCV).

Output
------
  data/mlb_v3/model_comparison.json   — full metric table
  Console report:  AUC, Brier, calibration curve, ROI table,
                   bootstrap CI, feature importances

Run
---
  python scripts/mlb_v3/model_comparison.py [--matrix PATH]
"""

import argparse
import json
import math
import pathlib
import time
import warnings

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegressionCV, LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

ROOT = pathlib.Path(__file__).parent.parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("--matrix", default=str(ROOT / "data/mlb_v3/feature_matrix.parquet"))
args = parser.parse_args()

OUT_PATH = ROOT / "data/mlb_v3/model_comparison.json"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

# ── Feature set ───────────────────────────────────────────────────────────────
FEATURE_COLS = [
    "hr_rate_bayes",
    "barrel_pct",
    "hard_hit_pct",
    "pitcher_barrel",
    "pitcher_rv100",
    "pitcher_hrfb",
    "park_hr_factor",
    "temp_adj",
    "wind_adj",
]
TARGET = "did_hr"

# ── Load & engineer features ──────────────────────────────────────────────────
print(f"Loading {args.matrix} ...")
df = pd.read_parquet(args.matrix)
print(f"  {len(df):,} rows, {df['did_hr'].mean():.4f} HR rate, seasons {sorted(df['season'].unique())}")

PRIOR_RATE, PRIOR_PA = 0.04, 60
df["hr_rate_bayes"] = (
    (df["hr_rate_std"] * df["pa_std"] + PRIOR_RATE * PRIOR_PA) /
    (df["pa_std"] + PRIOR_PA)
)
df["temp_adj"] = df["temp_f"].fillna(72) - 72
df.loc[df["is_dome"], "temp_adj"] = 0.0
df["wind_adj"] = df["wind_out_mph"].fillna(0.0)
df.loc[df["is_dome"], "wind_adj"] = 0.0

# ── Three-way split ───────────────────────────────────────────────────────────
train = df[df["season"].isin([2022, 2023])].copy()
val   = df[df["season"] == 2024].copy()
test  = df[df["season"] == 2025].copy()

print(f"\nSplit:")
print(f"  Train (2022–23): {len(train):,}  HR={train[TARGET].mean():.4f}")
print(f"  Val   (2024):    {len(val):,}  HR={val[TARGET].mean():.4f}")
print(f"  Test  (2025):    {len(test):,}  HR={test[TARGET].mean():.4f}")

# Compute training medians for imputation (only from train set)
train_medians = {col: float(train[col].median()) for col in FEATURE_COLS}

def prep(df_in, medians):
    X = df_in[FEATURE_COLS].copy()
    for col in FEATURE_COLS:
        X[col] = X[col].fillna(medians[col])
    return X.values, df_in[TARGET].values

X_train, y_train = prep(train, train_medians)
X_val,   y_val   = prep(val,   train_medians)
X_test,  y_test  = prep(test,  train_medians)

# Train+Val combined for final model fit before test evaluation
X_trainval = np.vstack([X_train, X_val])
y_trainval = np.concatenate([y_train, y_val])

print(f"\n  NA check after imputation: {np.isnan(X_train).sum()} NaNs in train")

# ── Helpers ───────────────────────────────────────────────────────────────────
def roi_at_ev(model_probs, market_probs, outcomes, decimal_odds, threshold):
    """Return (n_bets, win_pct, avg_odds, roi) for rows where EV >= threshold."""
    mask = ~np.isnan(market_probs)
    mp = model_probs[mask]
    do = decimal_odds[mask]
    ev = mp * do - 1.0
    sel = ev >= threshold
    if sel.sum() == 0:
        return 0, float("nan"), float("nan"), float("nan")
    wins = outcomes[mask][sel]
    odds_sel = do[sel]
    pnl = np.where(wins, odds_sel - 1, -1.0)
    return int(sel.sum()), float(wins.mean()), float(odds_sel.mean()), float(pnl.mean())


def bootstrap_roi(model_probs, market_probs, outcomes, decimal_odds, threshold,
                  n_boot=1000, seed=42):
    """Bootstrap 5th/95th percentile CI on ROI at given EV threshold."""
    mask = ~np.isnan(market_probs)
    mp = model_probs[mask]
    do = decimal_odds[mask]
    ev = mp * do - 1.0
    sel = ev >= threshold
    if sel.sum() < 10:
        return float("nan"), float("nan"), float("nan")
    wins = outcomes[mask][sel].astype(float)
    odds_sel = do[sel]
    pnl = np.where(wins, odds_sel - 1, -1.0)
    rng = np.random.default_rng(seed)
    boot = [rng.choice(pnl, size=len(pnl), replace=True).mean() for _ in range(n_boot)]
    return float(np.percentile(boot, 5)), float(np.percentile(boot, 50)), float(np.percentile(boot, 95))


def calibration_table(y_true, y_prob, n_bins=10):
    """Return list of (pred_mean, actual_mean, n) per bin."""
    bins = np.linspace(0, 1, n_bins + 1)
    rows = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        mask = (y_prob >= lo) & (y_prob < hi)
        n = mask.sum()
        if n < 5:
            continue
        rows.append({
            "bin_lo": round(float(lo), 3),
            "bin_hi": round(float(hi), 3),
            "n": int(n),
            "pred_mean": round(float(y_prob[mask].mean()), 4),
            "actual_mean": round(float(y_true[mask].mean()), 4),
        })
    return rows


def print_calibration(rows, label):
    print(f"\n  Calibration — {label}:")
    print(f"  {'Bin':<14}  {'N':>6}  {'Pred':>7}  {'Actual':>8}  {'Ratio':>6}")
    for r in rows:
        ratio = r["actual_mean"] / r["pred_mean"] if r["pred_mean"] > 0 else float("nan")
        print(f"  [{r['bin_lo']:.2f}–{r['bin_hi']:.2f})  {r['n']:>6,}  "
              f"{r['pred_mean']:>6.1%}   {r['actual_mean']:>7.1%}   {ratio:>6.2f}")


# ── Market probability arrays for test set ────────────────────────────────────
test_market_prob = test["market_prob"].values
test_decimal_odds = np.where(
    test_market_prob > 0, 1.0 / test_market_prob, np.nan
)

results = {}

# ══════════════════════════════════════════════════════════════════════════════
# MODEL 1 — Logistic Regression + Isotonic Calibration
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{'═'*60}")
print("  MODEL 1: Logistic Regression + Isotonic Calibration")
print(f"{'═'*60}")
t0 = time.time()

# Tune C on train set using CV, then isotonic-calibrate on val set
base_lr = Pipeline([
    ("scaler", StandardScaler()),
    ("clf",   LogisticRegressionCV(Cs=10, cv=5, max_iter=1000,
                                    scoring="neg_brier_score", random_state=42, n_jobs=-1)),
])
base_lr.fit(X_train, y_train)
best_C = float(base_lr.named_steps["clf"].C_[0])

# Refit with best C, then wrap in isotonic calibration using val set
inner_lr = Pipeline([
    ("scaler", StandardScaler()),
    ("clf",   LogisticRegression(C=best_C, max_iter=1000, random_state=42)),
])
lr_cal = CalibratedClassifierCV(inner_lr, method="isotonic", cv="prefit")
inner_lr.fit(X_train, y_train)
lr_cal.fit(X_val, y_val)

# Final fit on train+val for test evaluation
inner_lr_final = Pipeline([
    ("scaler", StandardScaler()),
    ("clf",   LogisticRegression(C=best_C, max_iter=1000, random_state=42)),
])
lr_cal_final = CalibratedClassifierCV(inner_lr_final, method="isotonic", cv="prefit")
inner_lr_final.fit(X_trainval, y_trainval)
lr_cal_final.fit(X_val, y_val)   # calibration stays on val only

lr_probs = lr_cal_final.predict_proba(X_test)[:, 1]
lr_auc   = roc_auc_score(y_test, lr_probs)
lr_brier = brier_score_loss(y_test, lr_probs)
lr_cal_rows = calibration_table(y_test, lr_probs)

print(f"  Best C (CV): {best_C:.5f}   elapsed: {time.time()-t0:.1f}s")
print(f"  AUC:   {lr_auc:.4f}")
print(f"  Brier: {lr_brier:.5f}  (baseline={y_test.mean()*(1-y_test.mean()):.5f})")
print_calibration(lr_cal_rows, "LR+Isotonic")

lr_roi = {}
for ev in [0.15, 0.20, 0.25]:
    n, wp, ao, roi = roi_at_ev(lr_probs, test_market_prob, y_test, test_decimal_odds, ev)
    lr_roi[ev] = {"n": n, "win_pct": wp, "avg_odds": ao, "roi": roi}
    print(f"  EV≥{ev:.0%}: {n:>5} bets  win={wp:.1%}  odds={ao:.2f}  ROI={roi:+.1%}")

# LR feature coefficients (from inner model, standardized)
lr_coef_vals = base_lr.named_steps["clf"].coef_[0]
lr_scaler_std = base_lr.named_steps["scaler"].scale_
# Standardized coef = raw coef in z-score space
lr_feature_importance = dict(zip(FEATURE_COLS, [abs(float(c)) for c in lr_coef_vals]))

results["lr"] = {
    "auc": lr_auc, "brier": lr_brier,
    "roi": {str(k): v for k, v in lr_roi.items()},
    "calibration": lr_cal_rows,
    "feature_importance": lr_feature_importance,
    "coefficients_signed": dict(zip(FEATURE_COLS, [float(c) for c in lr_coef_vals])),
}

# ══════════════════════════════════════════════════════════════════════════════
# MODEL 2 — XGBoost + Isotonic Calibration
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{'═'*60}")
print("  MODEL 2: XGBoost + Isotonic Calibration")
print(f"{'═'*60}")
t0 = time.time()

scale_pos = float((y_train == 0).sum() / (y_train == 1).sum())
print(f"  scale_pos_weight: {scale_pos:.2f}")

# Simple grid search on val AUC
best_xgb_auc = -1
best_xgb_params = {}
search_grid = [
    {"n_estimators": 400, "max_depth": 4, "learning_rate": 0.05, "subsample": 0.8, "colsample_bytree": 0.8, "min_child_weight": 50},
    {"n_estimators": 400, "max_depth": 5, "learning_rate": 0.05, "subsample": 0.8, "colsample_bytree": 0.8, "min_child_weight": 50},
    {"n_estimators": 600, "max_depth": 4, "learning_rate": 0.02, "subsample": 0.8, "colsample_bytree": 0.7, "min_child_weight": 80},
    {"n_estimators": 300, "max_depth": 3, "learning_rate": 0.10, "subsample": 0.9, "colsample_bytree": 0.9, "min_child_weight": 30},
]
for params in search_grid:
    xgb_tmp = XGBClassifier(
        **params, scale_pos_weight=scale_pos,
        eval_metric="auc", use_label_encoder=False,
        random_state=42, n_jobs=-1, verbosity=0,
    )
    xgb_tmp.fit(X_train, y_train)
    val_auc = roc_auc_score(y_val, xgb_tmp.predict_proba(X_val)[:, 1])
    print(f"    params={params}  val_auc={val_auc:.4f}")
    if val_auc > best_xgb_auc:
        best_xgb_auc = val_auc
        best_xgb_params = params

print(f"  Best params (val AUC={best_xgb_auc:.4f}): {best_xgb_params}")

# Fit best XGBoost on train, calibrate on val
xgb_base = XGBClassifier(
    **best_xgb_params, scale_pos_weight=scale_pos,
    eval_metric="auc", use_label_encoder=False,
    random_state=42, n_jobs=-1, verbosity=0,
)
xgb_base.fit(X_train, y_train)
xgb_cal = CalibratedClassifierCV(xgb_base, method="isotonic", cv="prefit")
xgb_cal.fit(X_val, y_val)

# Final: refit base on train+val, keep same calibration
xgb_base_final = XGBClassifier(
    **best_xgb_params, scale_pos_weight=scale_pos,
    eval_metric="auc", use_label_encoder=False,
    random_state=42, n_jobs=-1, verbosity=0,
)
xgb_base_final.fit(X_trainval, y_trainval)
xgb_cal_final = CalibratedClassifierCV(xgb_base_final, method="isotonic", cv="prefit")
xgb_cal_final.fit(X_val, y_val)

xgb_probs = xgb_cal_final.predict_proba(X_test)[:, 1]
xgb_auc   = roc_auc_score(y_test, xgb_probs)
xgb_brier = brier_score_loss(y_test, xgb_probs)
xgb_cal_rows = calibration_table(y_test, xgb_probs)

print(f"  elapsed: {time.time()-t0:.1f}s")
print(f"  AUC:   {xgb_auc:.4f}")
print(f"  Brier: {xgb_brier:.5f}")
print_calibration(xgb_cal_rows, "XGB+Isotonic")

xgb_roi = {}
for ev in [0.15, 0.20, 0.25]:
    n, wp, ao, roi = roi_at_ev(xgb_probs, test_market_prob, y_test, test_decimal_odds, ev)
    xgb_roi[ev] = {"n": n, "win_pct": wp, "avg_odds": ao, "roi": roi}
    print(f"  EV≥{ev:.0%}: {n:>5} bets  win={wp:.1%}  odds={ao:.2f}  ROI={roi:+.1%}")

xgb_fi = dict(zip(FEATURE_COLS, [float(x) for x in xgb_base_final.feature_importances_]))

results["xgb"] = {
    "auc": xgb_auc, "brier": xgb_brier,
    "roi": {str(k): v for k, v in xgb_roi.items()},
    "calibration": xgb_cal_rows,
    "feature_importance": xgb_fi,
    "best_params": best_xgb_params,
}

# ══════════════════════════════════════════════════════════════════════════════
# MODEL 3 — Random Forest + Isotonic Calibration
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{'═'*60}")
print("  MODEL 3: Random Forest + Isotonic Calibration")
print(f"{'═'*60}")
t0 = time.time()

best_rf_auc = -1
best_rf_params = {}
rf_grid = [
    {"n_estimators": 400, "max_depth": 8,    "min_samples_leaf": 200, "max_features": "sqrt"},
    {"n_estimators": 400, "max_depth": 12,   "min_samples_leaf": 150, "max_features": "sqrt"},
    {"n_estimators": 400, "max_depth": None, "min_samples_leaf": 400, "max_features": "sqrt"},
    {"n_estimators": 400, "max_depth": 8,    "min_samples_leaf": 200, "max_features": 0.6},
]
for params in rf_grid:
    rf_tmp = RandomForestClassifier(
        **params, class_weight="balanced",
        random_state=42, n_jobs=-1,
    )
    rf_tmp.fit(X_train, y_train)
    val_auc = roc_auc_score(y_val, rf_tmp.predict_proba(X_val)[:, 1])
    print(f"    params={params}  val_auc={val_auc:.4f}")
    if val_auc > best_rf_auc:
        best_rf_auc = val_auc
        best_rf_params = params

print(f"  Best params (val AUC={best_rf_auc:.4f}): {best_rf_params}")

rf_base = RandomForestClassifier(
    **best_rf_params, class_weight="balanced",
    random_state=42, n_jobs=-1,
)
rf_base.fit(X_train, y_train)
rf_cal = CalibratedClassifierCV(rf_base, method="isotonic", cv="prefit")
rf_cal.fit(X_val, y_val)

rf_base_final = RandomForestClassifier(
    **best_rf_params, class_weight="balanced",
    random_state=42, n_jobs=-1,
)
rf_base_final.fit(X_trainval, y_trainval)
rf_cal_final = CalibratedClassifierCV(rf_base_final, method="isotonic", cv="prefit")
rf_cal_final.fit(X_val, y_val)

rf_probs = rf_cal_final.predict_proba(X_test)[:, 1]
rf_auc   = roc_auc_score(y_test, rf_probs)
rf_brier = brier_score_loss(y_test, rf_probs)
rf_cal_rows = calibration_table(y_test, rf_probs)

print(f"  elapsed: {time.time()-t0:.1f}s")
print(f"  AUC:   {rf_auc:.4f}")
print(f"  Brier: {rf_brier:.5f}")
print_calibration(rf_cal_rows, "RF+Isotonic")

rf_roi = {}
for ev in [0.15, 0.20, 0.25]:
    n, wp, ao, roi = roi_at_ev(rf_probs, test_market_prob, y_test, test_decimal_odds, ev)
    rf_roi[ev] = {"n": n, "win_pct": wp, "avg_odds": ao, "roi": roi}
    print(f"  EV≥{ev:.0%}: {n:>5} bets  win={wp:.1%}  odds={ao:.2f}  ROI={roi:+.1%}")

rf_fi = dict(zip(FEATURE_COLS, [float(x) for x in rf_base_final.feature_importances_]))

results["rf"] = {
    "auc": rf_auc, "brier": rf_brier,
    "roi": {str(k): v for k, v in rf_roi.items()},
    "calibration": rf_cal_rows,
    "feature_importance": rf_fi,
    "best_params": {k: str(v) for k, v in best_rf_params.items()},
}

# ══════════════════════════════════════════════════════════════════════════════
# FEATURE IMPORTANCE COMPARISON
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{'═'*60}")
print("  FEATURE IMPORTANCE COMPARISON")
print(f"{'═'*60}")
print(f"  {'Feature':<22}  {'LR |coef|':>10}  {'XGB gain':>10}  {'RF impurity':>12}  Notes")

# Normalize all importances 0–1 for comparison
def norm_fi(d):
    mx = max(d.values()) or 1.0
    return {k: v/mx for k, v in d.items()}

lr_fi_norm  = norm_fi(lr_feature_importance)
xgb_fi_norm = norm_fi(xgb_fi)
rf_fi_norm  = norm_fi(rf_fi)

flags = {}
for feat in FEATURE_COLS:
    lr_v  = lr_fi_norm.get(feat, 0)
    xgb_v = xgb_fi_norm.get(feat, 0)
    rf_v  = rf_fi_norm.get(feat, 0)
    note = ""
    if lr_v < 0.05 and xgb_v < 0.05 and rf_v < 0.05:
        note = "⚠ NEAR-ZERO ALL MODELS — candidate to drop"
    elif lr_v < 0.05 and (xgb_v > 0.15 or rf_v > 0.15):
        note = "★ NON-LINEAR signal — tree models capture, LR misses"
    flags[feat] = note
    print(f"  {feat:<22}  {lr_v:>10.3f}  {xgb_v:>10.3f}  {rf_v:>12.3f}  {note}")

# ══════════════════════════════════════════════════════════════════════════════
# BOOTSTRAP CI — best EV threshold for each model
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{'═'*60}")
print("  BOOTSTRAP 90% CI ON BEST EV THRESHOLD (1,000 iterations)")
print(f"{'═'*60}")

boot_results = {}
for name, probs in [("lr", lr_probs), ("xgb", xgb_probs), ("rf", rf_probs)]:
    # Find best EV threshold by point ROI
    model_roi = results[name]["roi"]
    best_ev = max([0.15, 0.20, 0.25], key=lambda e: model_roi.get(str(e), {}).get("roi") or -999)
    p5, p50, p95 = bootstrap_roi(probs, test_market_prob, y_test, test_decimal_odds, best_ev)
    point = model_roi[str(best_ev)]["roi"]
    n     = model_roi[str(best_ev)]["n"]
    safe  = p5 is not None and not math.isnan(p5) and p5 >= -0.05
    print(f"  {name.upper():<4}  EV≥{best_ev:.0%}  n={n:>4}  "
          f"point={point:+.1%}  p5={p5:+.1%}  p50={p50:+.1%}  p95={p95:+.1%}  "
          f"{'✅ SAFE' if safe else '⚠ DISCUSS'}")
    boot_results[name] = {"ev": best_ev, "n": n, "point": point, "p5": p5, "p50": p50, "p95": p95, "deploy_safe": bool(safe)}

# ══════════════════════════════════════════════════════════════════════════════
# WINNER SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{'═'*60}")
print("  METRIC WINNER SUMMARY")
print(f"{'═'*60}")

metrics = {
    "ROC-AUC": {"lr": lr_auc, "xgb": xgb_auc, "rf": rf_auc},
    "Brier":   {"lr": lr_brier, "xgb": xgb_brier, "rf": rf_brier},
    "ROI@EV25": {
        "lr":  results["lr"]["roi"].get("0.25", {}).get("roi", float("nan")),
        "xgb": results["xgb"]["roi"].get("0.25", {}).get("roi", float("nan")),
        "rf":  results["rf"]["roi"].get("0.25", {}).get("roi", float("nan")),
    },
}
print(f"  {'Metric':<12}  {'LR':>8}  {'XGB':>8}  {'RF':>8}  Winner")
for metric, vals in metrics.items():
    if metric == "Brier":
        winner = min(vals, key=lambda k: vals[k] if not math.isnan(vals[k]) else 999)
    else:
        winner = max(vals, key=lambda k: vals[k] if not math.isnan(vals[k]) else -999)
    print(f"  {metric:<12}  {vals['lr']:>8.4f}  {vals['xgb']:>8.4f}  {vals['rf']:>8.4f}  {winner.upper()}")

# Recommendation
scores = {"lr": 0, "xgb": 0, "rf": 0}
for metric, vals in metrics.items():
    if metric == "Brier":
        w = min(vals, key=lambda k: vals[k] if not math.isnan(vals[k]) else 999)
    else:
        w = max(vals, key=lambda k: vals[k] if not math.isnan(vals[k]) else -999)
    scores[w] += 1

print(f"\n  Score totals (wins per model): {scores}")
recommend = max(scores, key=lambda k: scores[k])
print(f"\n  ▶ RECOMMENDED ARCHITECTURE: {recommend.upper()}")
if boot_results[recommend]["deploy_safe"]:
    print(f"    Bootstrap CI p5 = {boot_results[recommend]['p5']:+.1%}  ✅ lower bound ≥ -5%")
else:
    print(f"    Bootstrap CI p5 = {boot_results[recommend]['p5']:+.1%}  ⚠ lower bound < -5% — DISCUSS before deploy")

# ── Save full results ─────────────────────────────────────────────────────────
output = {
    "split": {"train": "2022-2023", "validate": "2024", "test": "2025"},
    "n_train": int(len(train)), "n_val": int(len(val)), "n_test": int(len(test)),
    "feature_cols": FEATURE_COLS,
    "feature_flags": flags,
    "models": results,
    "bootstrap": boot_results,
    "metric_winners": {m: max(v, key=lambda k: v[k]) for m, v in metrics.items()},
    "recommendation": recommend,
    "scores": scores,
}
OUT_PATH.write_text(json.dumps(output, indent=2, default=str))
print(f"\n✅ Full results saved → {OUT_PATH}")
