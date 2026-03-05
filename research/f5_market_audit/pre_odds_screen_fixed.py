#!/usr/bin/env python3
"""
PRE-ODDS MARKET SCREEN — FIXED
================================
Rewritten evaluation section with:
  A) Correct baseline computation (explicit Brier/LL naive)
  B) Standard logistic calibration slope (y ~ a + b*logit(p))
  C) ECE (expected calibration error) with 10 equal-frequency bins
  D) Sanity checks: synthetic calibration test, p_model distribution, sign warnings
  E) Three-tier verdicts: PASS / CONDITIONAL / FAIL

Markets:
  1) F5 Totals  (F5 combined runs through 5 innings)
  2) F5 Team Totals  (home F5 runs, away F5 runs)
  3) NRFI/YRFI  (1st inning run yes/no)

Walk-forward splits:
  Train: 2022           → Test: 2023
  Train: 2022–2023      → Test: 2024
  Train: 2022–2024      → Test: 2025

Outputs:
  pre_odds_market_screen_FIXED.md
  classification_metrics_FIXED.csv
  regression_metrics_FIXED.csv
  reliability_plots_FIXED/
"""

from __future__ import annotations

import json, os, sys, time, warnings
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional
from collections import defaultdict

import lightgbm as lgb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    brier_score_loss, mean_absolute_error, mean_squared_error,
    roc_auc_score, log_loss, r2_score,
)
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

# ═══════════════════════════════════════════════════════════
# PATHS
# ═══════════════════════════════════════════════════════════
REPO_ROOT   = Path(__file__).resolve().parent.parent.parent
FEATURES_PQ = REPO_ROOT / "data" / "mlb_research" / "features" / "features_v2.parquet"
ARTIFACTS   = REPO_ROOT / "ml" / "f5_ml" / "artifacts"
OUTPUT_DIR  = Path(__file__).resolve().parent / "pre_odds_output_FIXED"

NRFI_CACHE  = Path(__file__).resolve().parent / "phase2_output" / "nrfi_labels.parquet"

FEATURE_COLS: list[str] = json.loads((ARTIFACTS / "features.json").read_text())

TEST_YEARS   = [2023, 2024, 2025]
TOTAL_LINES  = [3.5, 4.0, 4.5, 5.0, 5.5]
TEAM_LINES   = [1.5, 2.0, 2.5, 3.0]

# ═══════════════════════════════════════════════════════════
# DECISION GATES
# ═══════════════════════════════════════════════════════════
CLS_AUC_MIN         = 0.535
CLS_BRIER_IMP_MIN   = 0.003   # brier_naive - brier_model ≥ this (positive = good)
CLS_LL_IMP_MIN      = 0.003   # optional: logloss_naive - logloss_model ≥ this
CLS_CAL_SLOPE_LO    = 0.85
CLS_CAL_SLOPE_HI    = 1.15
CLS_MIN_N           = 800

NRFI_AUC_MIN        = 0.545
NRFI_BRIER_IMP_MIN  = 0.004

REG_MAE_IMP_PCT     = 3.0
GATE_SPLITS_NEEDED  = 2


# ═══════════════════════════════════════════════════════════
# METRIC HELPERS — CORRECT IMPLEMENTATIONS
# ═══════════════════════════════════════════════════════════

def compute_brier(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    """Brier score = mean((y - p)^2). Lower is better."""
    return float(np.mean((y_true - y_prob) ** 2))


def compute_logloss(y_true: np.ndarray, y_prob: np.ndarray, eps: float = 1e-6) -> float:
    """Log-loss = -mean(y*log(p) + (1-y)*log(1-p)). Lower is better."""
    p = np.clip(y_prob, eps, 1 - eps)
    return float(-np.mean(y_true * np.log(p) + (1 - y_true) * np.log(1 - p)))


def compute_naive_brier(y_true: np.ndarray, base_rate: float) -> float:
    """Brier score of constant predictor p=base_rate."""
    return float(np.mean((y_true - base_rate) ** 2))


def compute_naive_logloss(y_true: np.ndarray, base_rate: float, eps: float = 1e-6) -> float:
    """Log-loss of constant predictor p=base_rate."""
    p = np.clip(base_rate, eps, 1 - eps)
    return float(-np.mean(y_true * np.log(p) + (1 - y_true) * np.log(1 - p)))


def compute_calibration_slope_intercept(y_true: np.ndarray, y_prob: np.ndarray):
    """
    Standard logistic calibration regression:
      y ~ a + b * logit(p_model)

    Uses sklearn LogisticRegression with C=1e8 (effectively no penalty).
    Returns (slope_b, intercept_a).

    For a perfectly calibrated model: slope ≈ 1, intercept ≈ 0.
    slope < 1  →  overconfident (probabilities too spread)
    slope > 1  →  underconfident (probabilities too compressed)
    """
    eps = 1e-6
    p = np.clip(y_prob, eps, 1 - eps)
    logit_p = np.log(p / (1 - p)).reshape(-1, 1)

    # Check if logit has any variance
    if np.std(logit_p) < 1e-10:
        return np.nan, np.nan

    try:
        # C=1e8 effectively removes regularization
        lr = LogisticRegression(solver="lbfgs", max_iter=5000, C=1e8, fit_intercept=True)
        lr.fit(logit_p, y_true.astype(int))
        slope = float(lr.coef_[0][0])
        intercept = float(lr.intercept_[0])
        return slope, intercept
    except Exception:
        return np.nan, np.nan


def compute_ece(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10) -> float:
    """
    Expected Calibration Error with equal-frequency (quantile) bins.
    ECE = sum_b (|B_b|/N) * |acc(B_b) - conf(B_b)|
    """
    if len(y_true) < n_bins:
        return np.nan

    # Sort by predicted probability
    order = np.argsort(y_prob)
    y_sorted = y_true[order]
    p_sorted = y_prob[order]

    # Equal-frequency bins
    bin_edges = np.linspace(0, len(y_true), n_bins + 1, dtype=int)
    ece = 0.0
    for i in range(n_bins):
        lo, hi = bin_edges[i], bin_edges[i + 1]
        if hi <= lo:
            continue
        y_bin = y_sorted[lo:hi]
        p_bin = p_sorted[lo:hi]
        acc = np.mean(y_bin)
        conf = np.mean(p_bin)
        ece += (len(y_bin) / len(y_true)) * abs(acc - conf)
    return float(ece)


def compute_reliability_table(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10):
    """Return reliability table: list of dicts with bin info."""
    if len(y_true) < n_bins:
        return []

    order = np.argsort(y_prob)
    y_sorted = y_true[order]
    p_sorted = y_prob[order]

    bin_edges = np.linspace(0, len(y_true), n_bins + 1, dtype=int)
    table = []
    for i in range(n_bins):
        lo, hi = bin_edges[i], bin_edges[i + 1]
        if hi <= lo:
            continue
        y_bin = y_sorted[lo:hi]
        p_bin = p_sorted[lo:hi]
        table.append({
            "bin": i + 1,
            "count": int(hi - lo),
            "mean_pred": round(float(np.mean(p_bin)), 4),
            "mean_obs": round(float(np.mean(y_bin)), 4),
            "p_min": round(float(np.min(p_bin)), 4),
            "p_max": round(float(np.max(p_bin)), 4),
        })
    return table


def reliability_monotonic(y_true, y_prob, n_bins=8):
    """Check if reliability curve is approximately monotonic."""
    try:
        frac_pos, mean_pred = calibration_curve(y_true, y_prob, n_bins=n_bins, strategy="uniform")
        if len(frac_pos) < 3:
            return True
        diffs = np.diff(frac_pos)
        return int(np.sum(diffs < -0.03)) <= 1
    except Exception:
        return False


# ═══════════════════════════════════════════════════════════
# SANITY CHECK: SYNTHETIC CALIBRATION TEST
# ═══════════════════════════════════════════════════════════

def sanity_check_calibration():
    """
    Test calibration slope on a synthetic perfectly-calibrated predictor.
    p = sigmoid(z) where z ~ N(0,1), y ~ Bernoulli(p).
    Expected: slope ≈ 1.0, intercept ≈ 0.0.
    """
    print("\n── Sanity Check: Synthetic Calibration Test ──")
    np.random.seed(42)
    n = 5000
    z = np.random.randn(n)
    p_true = 1 / (1 + np.exp(-z))
    y = (np.random.rand(n) < p_true).astype(int)

    slope, intercept = compute_calibration_slope_intercept(y, p_true)
    print(f"  Synthetic perfectly calibrated predictor (N={n}):")
    print(f"    slope = {slope:.4f}  (expected ≈ 1.0)")
    print(f"    intercept = {intercept:.4f}  (expected ≈ 0.0)")

    ece = compute_ece(y, p_true)
    brier = compute_brier(y, p_true)
    base_rate = y.mean()
    brier_naive = compute_naive_brier(y, base_rate)
    brier_imp = brier_naive - brier
    print(f"    ECE = {ece:.4f}")
    print(f"    Brier model = {brier:.4f}, Brier naive = {brier_naive:.4f}, improvement = {brier_imp:+.4f}")

    if abs(slope - 1.0) > 0.15:
        print(f"  ⚠️  WARNING: Synthetic calibration slope is {slope:.4f}, expected ~1.0")
        print(f"      This indicates a bug in compute_calibration_slope_intercept!")
        return False
    if brier_imp < 0:
        print(f"  ⚠️  WARNING: Brier improvement is negative for perfectly calibrated predictor!")
        return False

    print(f"  ✅ Synthetic calibration test PASSED")
    return True


# ═══════════════════════════════════════════════════════════
# STEP 0 — BUILD CANONICAL DATASETS (unchanged from original)
# ═══════════════════════════════════════════════════════════

def load_data() -> pd.DataFrame:
    df = pd.read_parquet(FEATURES_PQ)
    df["season"] = df["season"].astype(float)
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    return df


def build_targets(df: pd.DataFrame) -> pd.DataFrame:
    df["y_f5_total"] = df["label_f5_total"]
    df["y_home_f5"]  = df["label_f5_home"]
    df["y_away_f5"]  = df["label_f5_away"]

    for line in TOTAL_LINES:
        df[f"y_total_over_{line}"] = (df["label_f5_total"] > line).astype(int)

    for side in ["home", "away"]:
        for line in TEAM_LINES:
            df[f"y_{side}_over_{line}"] = (df[f"label_f5_{side}"] > line).astype(int)
    return df


def merge_nrfi(df: pd.DataFrame) -> pd.DataFrame:
    if not NRFI_CACHE.exists():
        print("  ⚠️  NRFI cache not found — skipping NRFI/YRFI")
        return df

    nrfi_df = pd.read_parquet(NRFI_CACHE)
    print(f"  📦 Loaded {len(nrfi_df)} cached NRFI labels")

    nrfi_df["game_pk"] = nrfi_df["game_pk"].astype(float)
    merged = df.merge(
        nrfi_df[["game_pk", "nrfi", "first_inning_total"]],
        on="game_pk", how="left",
    )
    merged["y_yrfi"] = merged["nrfi"].map({1: 0, 0: 1})
    matched = merged["nrfi"].notna().sum()
    print(f"  Matched {matched}/{len(df)} games with NRFI labels")
    return merged


def verify_targets(df: pd.DataFrame):
    print("\n── Target Verification ──")
    errors = 0

    check = (df["y_f5_total"] == df["label_f5_home"] + df["label_f5_away"])
    if check.sum() == check.notna().sum():
        print(f"  ✅ y_f5_total == home + away for all {check.sum()} rows")
    else:
        print(f"  ❌ y_f5_total mismatch")
        errors += 1

    for line in TOTAL_LINES:
        col = f"y_total_over_{line}"
        expected = (df["label_f5_total"] > line).astype(int)
        if (df[col] == expected).all():
            print(f"  ✅ {col} correct")
        else:
            print(f"  ❌ {col} mismatch"); errors += 1

    for side in ["home", "away"]:
        for line in TEAM_LINES:
            col = f"y_{side}_over_{line}"
            expected = (df[f"label_f5_{side}"] > line).astype(int)
            if (df[col] == expected).all():
                print(f"  ✅ {col} correct")
            else:
                print(f"  ❌ {col} mismatch"); errors += 1

    if "y_yrfi" in df.columns and df["y_yrfi"].notna().sum() > 0:
        nrfi_mask = df["nrfi"].notna()
        if ((df.loc[nrfi_mask, "nrfi"] + df.loc[nrfi_mask, "y_yrfi"]) == 1).all():
            print(f"  ✅ y_yrfi = 1 - nrfi for all {nrfi_mask.sum()} rows")
        else:
            print(f"  ❌ YRFI/NRFI consistency failed"); errors += 1

        rate = df.loc[nrfi_mask, "nrfi"].mean()
        if 0.40 <= rate <= 0.60:
            print(f"  ✅ NRFI rate = {rate:.3f} (plausible)")
        else:
            print(f"  ⚠️  NRFI rate = {rate:.3f} (unusual)")

    if errors == 0:
        print(f"  ✅✅ ALL TARGET CHECKS PASSED")
    else:
        print(f"  ⚠️  {errors} check(s) failed")
    return errors


# ═══════════════════════════════════════════════════════════
# STEP 1A — CLASSIFICATION WALK-FORWARD (FIXED)
# ═══════════════════════════════════════════════════════════

@dataclass
class ClsResult:
    market: str
    threshold: str
    model: str
    train_years: str
    test_year: int
    n_train: int
    n_test: int
    base_rate: float
    # Model metrics
    auc: float
    brier_model: float
    brier_naive: float
    brier_improvement: float     # brier_naive - brier_model (positive = model beats naive)
    logloss_model: float
    logloss_naive: float
    logloss_improvement: float   # logloss_naive - logloss_model (positive = model beats naive)
    # Calibration
    cal_slope: float
    cal_intercept: float
    ece: float
    is_monotonic: bool
    # Diagnostics
    p_model_min: float
    p_model_max: float
    p_model_mean: float
    p_model_std: float


def _cls_one_split(
    df: pd.DataFrame,
    target_col: str,
    feature_cols: list[str],
    test_year: int,
    market: str,
    threshold: str,
) -> list[ClsResult]:
    """Train LogReg + LightGBM on one walk-forward split, return metrics."""
    train = df[df["season"] < test_year].copy()
    test  = df[df["season"] == test_year].copy()

    if len(train) < 50 or len(test) < 50:
        return []

    avail = [c for c in feature_cols if c in df.columns]
    X_train = train[avail].copy()
    y_train = train[target_col].values
    X_test  = test[avail].copy()
    y_test  = test[target_col].values

    tr_means = X_train.mean()
    X_train = X_train.fillna(tr_means).fillna(0)
    X_test  = X_test.fillna(tr_means).fillna(0)

    base_rate = float(y_test.mean())
    if base_rate <= 0 or base_rate >= 1:
        return []

    # ── Naive baselines (explicit, per spec) ──
    brier_naive = compute_naive_brier(y_test, base_rate)
    ll_naive    = compute_naive_logloss(y_test, base_rate)

    train_years_str = "-".join(str(int(s)) for s in sorted(train["season"].unique()))
    results = []

    # ── LogisticRegression ──
    try:
        scaler = StandardScaler()
        Xtr_s = scaler.fit_transform(X_train.values)
        Xte_s = scaler.transform(X_test.values)
        lr = LogisticRegression(max_iter=3000, C=1.0, solver="lbfgs")
        lr.fit(Xtr_s, y_train)
        probs = lr.predict_proba(Xte_s)[:, 1]
        probs_clipped = np.clip(probs, 1e-6, 1 - 1e-6)

        auc_val     = roc_auc_score(y_test, probs) if len(np.unique(y_test)) == 2 else 0.5
        brier_model = compute_brier(y_test, probs)
        ll_model    = compute_logloss(y_test, probs_clipped)
        brier_imp   = brier_naive - brier_model    # positive = model beats naive
        ll_imp      = ll_naive - ll_model          # positive = model beats naive
        cs, ci      = compute_calibration_slope_intercept(y_test, probs)
        ece_val     = compute_ece(y_test, probs)
        mono        = reliability_monotonic(y_test, probs)

        results.append(ClsResult(
            market=market, threshold=threshold, model="LogReg",
            train_years=train_years_str, test_year=test_year,
            n_train=len(train), n_test=len(test),
            base_rate=round(base_rate, 4),
            auc=round(auc_val, 4),
            brier_model=round(brier_model, 6),
            brier_naive=round(brier_naive, 6),
            brier_improvement=round(brier_imp, 6),
            logloss_model=round(ll_model, 4),
            logloss_naive=round(ll_naive, 4),
            logloss_improvement=round(ll_imp, 4),
            cal_slope=round(cs, 4) if not np.isnan(cs) else np.nan,
            cal_intercept=round(ci, 4) if not np.isnan(ci) else np.nan,
            ece=round(ece_val, 4),
            is_monotonic=mono,
            p_model_min=round(float(probs.min()), 6),
            p_model_max=round(float(probs.max()), 6),
            p_model_mean=round(float(probs.mean()), 6),
            p_model_std=round(float(probs.std()), 6),
        ))
    except Exception as e:
        print(f"    ❌ LogReg {test_year}: {e}")

    # ── LightGBM ──
    try:
        lgb_model = lgb.LGBMClassifier(
            n_estimators=400, max_depth=5, learning_rate=0.04,
            subsample=0.8, colsample_bytree=0.6, min_child_samples=40,
            reg_alpha=0.3, reg_lambda=1.5, verbose=-1, random_state=42,
            force_col_wise=True, num_leaves=20,
        )
        lgb_model.fit(X_train.values, y_train)
        probs = lgb_model.predict_proba(X_test.values)[:, 1]
        probs_clipped = np.clip(probs, 1e-6, 1 - 1e-6)

        auc_val     = roc_auc_score(y_test, probs) if len(np.unique(y_test)) == 2 else 0.5
        brier_model = compute_brier(y_test, probs)
        ll_model    = compute_logloss(y_test, probs_clipped)
        brier_imp   = brier_naive - brier_model
        ll_imp      = ll_naive - ll_model
        cs, ci      = compute_calibration_slope_intercept(y_test, probs)
        ece_val     = compute_ece(y_test, probs)
        mono        = reliability_monotonic(y_test, probs)

        results.append(ClsResult(
            market=market, threshold=threshold, model="LightGBM",
            train_years=train_years_str, test_year=test_year,
            n_train=len(train), n_test=len(test),
            base_rate=round(base_rate, 4),
            auc=round(auc_val, 4),
            brier_model=round(brier_model, 6),
            brier_naive=round(brier_naive, 6),
            brier_improvement=round(brier_imp, 6),
            logloss_model=round(ll_model, 4),
            logloss_naive=round(ll_naive, 4),
            logloss_improvement=round(ll_imp, 4),
            cal_slope=round(cs, 4) if not np.isnan(cs) else np.nan,
            cal_intercept=round(ci, 4) if not np.isnan(ci) else np.nan,
            ece=round(ece_val, 4),
            is_monotonic=mono,
            p_model_min=round(float(probs.min()), 6),
            p_model_max=round(float(probs.max()), 6),
            p_model_mean=round(float(probs.mean()), 6),
            p_model_std=round(float(probs.std()), 6),
        ))
    except Exception as e:
        print(f"    ❌ LightGBM {test_year}: {e}")

    return results


def run_classification(df: pd.DataFrame, df_nrfi: pd.DataFrame) -> list[ClsResult]:
    """Run classification walk-forward for all markets / thresholds."""
    all_results: list[ClsResult] = []

    def _run_market(data, tgt, market, threshold, label):
        for yr in TEST_YEARS:
            res = _cls_one_split(data, tgt, FEATURE_COLS, yr, market, threshold)
            all_results.extend(res)
            for r in res:
                print(f"    {r.model:<10} test={r.test_year}  AUC={r.auc:.4f}  "
                      f"BrierM={r.brier_model:.6f}  BrierN={r.brier_naive:.6f}  "
                      f"BrierΔ={r.brier_improvement:+.6f}  "
                      f"LLΔ={r.logloss_improvement:+.4f}  "
                      f"CalSlp={r.cal_slope:.3f}  CalInt={r.cal_intercept:+.3f}  "
                      f"ECE={r.ece:.4f}  "
                      f"p=[{r.p_model_min:.3f},{r.p_model_max:.3f}] μ={r.p_model_mean:.3f} σ={r.p_model_std:.4f}")

    # ── F5 Totals ──
    print("\n────────────────────────────────────────────────")
    print("  CLASSIFICATION: F5 Totals (Over/Under)")
    print("────────────────────────────────────────────────")
    for line in TOTAL_LINES:
        tgt = f"y_total_over_{line}"
        br = df[tgt].mean()
        print(f"\n  [{f'over_{line}'}]  base_rate={br:.3f}  N={len(df)}")
        _run_market(df, tgt, "F5_Totals", f"over_{line}", f"over_{line}")

    # ── F5 Team Totals — Home ──
    print("\n────────────────────────────────────────────────")
    print("  CLASSIFICATION: F5 Team Totals — Home")
    print("────────────────────────────────────────────────")
    for line in TEAM_LINES:
        tgt = f"y_home_over_{line}"
        br = df[tgt].mean()
        print(f"\n  [{f'home_over_{line}'}]  base_rate={br:.3f}  N={len(df)}")
        _run_market(df, tgt, "F5_TeamTotals_home", f"over_{line}", f"home_over_{line}")

    # ── F5 Team Totals — Away ──
    print("\n────────────────────────────────────────────────")
    print("  CLASSIFICATION: F5 Team Totals — Away")
    print("────────────────────────────────────────────────")
    for line in TEAM_LINES:
        tgt = f"y_away_over_{line}"
        br = df[tgt].mean()
        print(f"\n  [{f'away_over_{line}'}]  base_rate={br:.3f}  N={len(df)}")
        _run_market(df, tgt, "F5_TeamTotals_away", f"over_{line}", f"away_over_{line}")

    # ── NRFI ──
    print("\n────────────────────────────────────────────────")
    print("  CLASSIFICATION: NRFI")
    print("────────────────────────────────────────────────")
    nrfi_valid = df_nrfi.dropna(subset=["nrfi"])
    if len(nrfi_valid) >= CLS_MIN_N:
        br = nrfi_valid["nrfi"].mean()
        print(f"\n  [nrfi]  base_rate={br:.3f}  N={len(nrfi_valid)}")
        _run_market(nrfi_valid, "nrfi", "NRFI", "nrfi", "nrfi")
    else:
        print(f"  ⚠️  Only {len(nrfi_valid)} NRFI rows — skip")

    # ── YRFI ──
    print("\n────────────────────────────────────────────────")
    print("  CLASSIFICATION: YRFI")
    print("────────────────────────────────────────────────")
    yrfi_valid = df_nrfi.dropna(subset=["y_yrfi"])
    if len(yrfi_valid) >= CLS_MIN_N:
        br = yrfi_valid["y_yrfi"].mean()
        print(f"\n  [yrfi]  base_rate={br:.3f}  N={len(yrfi_valid)}")
        _run_market(yrfi_valid, "y_yrfi", "YRFI", "yrfi", "yrfi")
    else:
        print(f"  ⚠️  Only {len(yrfi_valid)} YRFI rows — skip")

    return all_results


# ═══════════════════════════════════════════════════════════
# SANITY CHECK: BRIER SIGN & P-MODEL DISTRIBUTION
# ═══════════════════════════════════════════════════════════

def sanity_check_results(cls_results: list[ClsResult]):
    """Print diagnostics for brier sign, p_model distribution, etc."""
    print("\n── Sanity Check: Brier Sign & p_model Distribution ──")

    # Check 1: If brier_improvement is mostly negative, warn
    brier_imps = [r.brier_improvement for r in cls_results]
    n_positive = sum(1 for b in brier_imps if b > 0)
    n_negative = sum(1 for b in brier_imps if b < 0)
    n_zero     = sum(1 for b in brier_imps if b == 0)

    print(f"  Brier improvements: {n_positive} positive, {n_negative} negative, {n_zero} zero "
          f"(out of {len(brier_imps)} total)")
    if n_positive == 0 and n_negative > 0:
        print(f"  ⚠️  WARNING: ALL Brier improvements are negative!")
        print(f"      This means every model is worse than predicting the base rate.")
        print(f"      Sign convention is: brier_improvement = brier_naive - brier_model")
        print(f"      Positive = model wins. The models are genuinely bad, not a sign bug.")
    elif n_positive < n_negative * 0.2:
        print(f"  ⚠️  WARNING: Very few positive Brier improvements ({n_positive}/{len(brier_imps)})")
    else:
        print(f"  ✅ Brier sign distribution looks reasonable")

    # Check 2: p_model min/max/mean per model
    print(f"\n  p_model distribution by model:")
    for model in ["LogReg", "LightGBM"]:
        model_results = [r for r in cls_results if r.model == model]
        if not model_results:
            continue
        p_mins  = [r.p_model_min for r in model_results]
        p_maxs  = [r.p_model_max for r in model_results]
        p_stds  = [r.p_model_std for r in model_results]
        print(f"    {model}: p_min range [{min(p_mins):.4f}, {max(p_mins):.4f}]  "
              f"p_max range [{min(p_maxs):.4f}, {max(p_maxs):.4f}]  "
              f"p_std range [{min(p_stds):.4f}, {max(p_stds):.4f}]")

        # Detect probability collapse (std < 0.02 means almost constant)
        collapsed = sum(1 for s in p_stds if s < 0.02)
        if collapsed > 0:
            print(f"    ⚠️  {collapsed}/{len(p_stds)} splits have p_std < 0.02 (probability collapse)")

    # Check 3: Calibration slopes
    print(f"\n  Calibration slopes:")
    slopes = [r.cal_slope for r in cls_results if not np.isnan(r.cal_slope)]
    if slopes:
        print(f"    min={min(slopes):.3f}  max={max(slopes):.3f}  mean={np.mean(slopes):.3f}  "
              f"median={np.median(slopes):.3f}")
        in_range = sum(1 for s in slopes if CLS_CAL_SLOPE_LO <= s <= CLS_CAL_SLOPE_HI)
        print(f"    In [{CLS_CAL_SLOPE_LO}, {CLS_CAL_SLOPE_HI}]: {in_range}/{len(slopes)}")


# ═══════════════════════════════════════════════════════════
# STEP 1B — REGRESSION WALK-FORWARD (FIXED: naive = mean(y_train))
# ═══════════════════════════════════════════════════════════

@dataclass
class RegResult:
    market: str
    target: str
    model: str
    train_years: str
    test_year: int
    n_train: int
    n_test: int
    naive_mae: float      # MAE of predict-mean(y_train) baseline
    model_mae: float
    mae_improvement_pct: float
    rmse: float
    r2: float
    monthly_mae: dict
    max_monthly_mae: float
    min_monthly_mae: float
    monthly_stable: bool


def _reg_one_split(
    df: pd.DataFrame,
    target_col: str,
    feature_cols: list[str],
    test_year: int,
    market: str,
) -> list[RegResult]:
    """Train Ridge + LightGBM regressors on one walk-forward split."""
    train = df[df["season"] < test_year].copy()
    test  = df[df["season"] == test_year].copy()

    if len(train) < 50 or len(test) < 50:
        return []

    avail = [c for c in feature_cols if c in df.columns]
    X_train = train[avail].copy()
    y_train = train[target_col].values.astype(float)
    X_test  = test[avail].copy()
    y_test  = test[target_col].values.astype(float)

    tr_means = X_train.mean()
    X_train = X_train.fillna(tr_means).fillna(0)
    X_test  = X_test.fillna(tr_means).fillna(0)

    # Naive baseline: predict TRAINING mean (not test mean, per spec)
    train_mean = float(y_train.mean())
    naive_pred = np.full(len(y_test), train_mean)
    naive_mae  = mean_absolute_error(y_test, naive_pred)

    train_years_str = "-".join(str(int(s)) for s in sorted(train["season"].unique()))
    test_months = test["game_date"].dt.month.values if "game_date" in test.columns else None

    def monthly_breakdown(preds):
        if test_months is None:
            return {}, 0, 0, True
        mm = {}
        for m in sorted(set(test_months)):
            mask = test_months == m
            if mask.sum() >= 10:
                mm[int(m)] = round(float(mean_absolute_error(y_test[mask], preds[mask])), 4)
        if len(mm) < 2:
            return mm, 0, 0, True
        vals = list(mm.values())
        max_m, min_m = max(vals), min(vals)
        median_mae = float(np.median(vals))
        stable = max_m <= 2.0 * median_mae
        return mm, round(max_m, 4), round(min_m, 4), stable

    results = []

    # ── Ridge Regression ──
    try:
        scaler = StandardScaler()
        Xtr_s = scaler.fit_transform(X_train.values)
        Xte_s = scaler.transform(X_test.values)
        ridge = Ridge(alpha=1.0)
        ridge.fit(Xtr_s, y_train)
        preds = ridge.predict(Xte_s)

        mae  = mean_absolute_error(y_test, preds)
        rmse = np.sqrt(mean_squared_error(y_test, preds))
        r2   = r2_score(y_test, preds)
        imp  = (naive_mae - mae) / naive_mae * 100 if naive_mae > 0 else 0

        mm, mx, mn, stable = monthly_breakdown(preds)
        results.append(RegResult(
            market=market, target=target_col, model="Ridge",
            train_years=train_years_str, test_year=test_year,
            n_train=len(train), n_test=len(test),
            naive_mae=round(naive_mae, 4), model_mae=round(mae, 4),
            mae_improvement_pct=round(imp, 2),
            rmse=round(rmse, 4), r2=round(r2, 4),
            monthly_mae=mm, max_monthly_mae=mx, min_monthly_mae=mn,
            monthly_stable=stable,
        ))
    except Exception as e:
        print(f"    ❌ Ridge {test_year}: {e}")

    # ── LightGBM Regressor ──
    try:
        lgb_reg = lgb.LGBMRegressor(
            n_estimators=400, max_depth=5, learning_rate=0.04,
            subsample=0.8, colsample_bytree=0.6, min_child_samples=40,
            reg_alpha=0.3, reg_lambda=1.5, verbose=-1, random_state=42,
            force_col_wise=True, num_leaves=20,
        )
        lgb_reg.fit(X_train.values, y_train)
        preds = lgb_reg.predict(X_test.values)

        mae  = mean_absolute_error(y_test, preds)
        rmse = np.sqrt(mean_squared_error(y_test, preds))
        r2   = r2_score(y_test, preds)
        imp  = (naive_mae - mae) / naive_mae * 100 if naive_mae > 0 else 0

        mm, mx, mn, stable = monthly_breakdown(preds)
        results.append(RegResult(
            market=market, target=target_col, model="LightGBM",
            train_years=train_years_str, test_year=test_year,
            n_train=len(train), n_test=len(test),
            naive_mae=round(naive_mae, 4), model_mae=round(mae, 4),
            mae_improvement_pct=round(imp, 2),
            rmse=round(rmse, 4), r2=round(r2, 4),
            monthly_mae=mm, max_monthly_mae=mx, min_monthly_mae=mn,
            monthly_stable=stable,
        ))
    except Exception as e:
        print(f"    ❌ LightGBM {test_year}: {e}")

    return results


def run_regression(df: pd.DataFrame) -> list[RegResult]:
    all_results: list[RegResult] = []
    targets = [
        ("F5_Totals",          "y_f5_total"),
        ("F5_TeamTotals_home", "y_home_f5"),
        ("F5_TeamTotals_away", "y_away_f5"),
    ]
    for market, tgt in targets:
        print(f"\n────────────────────────────────────────────────")
        print(f"  REGRESSION: {market}  (target: {tgt})")
        print(f"────────────────────────────────────────────────")
        print(f"  Mean={df[tgt].mean():.3f}  Std={df[tgt].std():.3f}")
        for yr in TEST_YEARS:
            res = _reg_one_split(df, tgt, FEATURE_COLS, yr, market)
            all_results.extend(res)
            for r in res:
                print(f"    {r.model:<10} test={r.test_year}  "
                      f"NaiveMAE={r.naive_mae:.4f}  MAE={r.model_mae:.4f}  "
                      f"Imp={r.mae_improvement_pct:+.2f}%  "
                      f"RMSE={r.rmse:.4f}  R²={r.r2:.4f}  "
                      f"MonthStable={'✓' if r.monthly_stable else '✗'}")
    return all_results


# ═══════════════════════════════════════════════════════════
# STEP 2 — RELIABILITY PLOTS (FIXED — to FIXED output dir)
# ═══════════════════════════════════════════════════════════

def plot_reliability_curves_fixed(df, df_nrfi, cls_results, out):
    """Generate reliability curve PNGs for top 3 candidates + all markets."""
    rel_dir = out / "reliability_plots_FIXED"
    rel_dir.mkdir(parents=True, exist_ok=True)

    def _plot_one(data, target_col, feature_cols, market, threshold, filename):
        fig, axes = plt.subplots(1, len(TEST_YEARS), figsize=(5 * len(TEST_YEARS), 4.5))
        if len(TEST_YEARS) == 1:
            axes = [axes]

        for i, yr in enumerate(TEST_YEARS):
            ax = axes[i]
            ax.plot([0, 1], [0, 1], "k--", alpha=0.5, label="Perfect")

            train_d = data[data["season"] < yr]
            test_d  = data[data["season"] == yr]
            if len(train_d) < 50 or len(test_d) < 50:
                continue

            avail = [c for c in feature_cols if c in data.columns]
            tr_means = train_d[avail].mean()
            X_tr = train_d[avail].fillna(tr_means).fillna(0)
            y_tr = train_d[target_col].values
            X_te = test_d[avail].fillna(tr_means).fillna(0)
            y_te = test_d[target_col].values

            for name, mdl in [
                ("LogReg", LogisticRegression(max_iter=3000, C=1.0, solver="lbfgs")),
                ("LightGBM", lgb.LGBMClassifier(
                    n_estimators=400, max_depth=5, learning_rate=0.04,
                    subsample=0.8, colsample_bytree=0.6, min_child_samples=40,
                    reg_alpha=0.3, reg_lambda=1.5, verbose=-1, random_state=42,
                    force_col_wise=True, num_leaves=20)),
            ]:
                try:
                    if name == "LogReg":
                        sc = StandardScaler()
                        mdl.fit(sc.fit_transform(X_tr.values), y_tr)
                        probs = mdl.predict_proba(sc.transform(X_te.values))[:, 1]
                    else:
                        mdl.fit(X_tr.values, y_tr)
                        probs = mdl.predict_proba(X_te.values)[:, 1]

                    # Use quantile bins for reliability curve
                    frac, mean_p = calibration_curve(y_te, probs, n_bins=10, strategy="quantile")
                    ax.plot(mean_p, frac, "o-", label=name, markersize=4)
                except Exception:
                    pass

            base_rate = y_te.mean()
            ax.axhline(base_rate, color="gray", linestyle=":", alpha=0.5, label=f"base={base_rate:.3f}")
            ax.set_xlabel("Predicted probability")
            ax.set_ylabel("Observed frequency")
            ax.set_title(f"{market}/{threshold} — {yr}")
            ax.legend(fontsize=7)
            ax.set_xlim(0, 1); ax.set_ylim(0, 1)

        plt.tight_layout()
        fig.savefig(rel_dir / filename, dpi=150)
        plt.close(fig)

    # Plot all markets
    for line in TOTAL_LINES:
        tgt = f"y_total_over_{line}"
        _plot_one(df, tgt, FEATURE_COLS, "F5_Totals", f"over_{line}",
                  f"reliability_F5_Totals_over_{line}.png")
    for side in ["home", "away"]:
        for line in TEAM_LINES:
            tgt = f"y_{side}_over_{line}"
            _plot_one(df, tgt, FEATURE_COLS, f"F5_TeamTotals_{side}", f"over_{line}",
                      f"reliability_F5_TeamTotals_{side}_over_{line}.png")
    nrfi_valid = df_nrfi.dropna(subset=["nrfi"])
    if len(nrfi_valid) >= CLS_MIN_N:
        _plot_one(nrfi_valid, "nrfi", FEATURE_COLS, "NRFI", "nrfi", "reliability_NRFI_nrfi.png")
    yrfi_valid = df_nrfi.dropna(subset=["y_yrfi"])
    if len(yrfi_valid) >= CLS_MIN_N:
        _plot_one(yrfi_valid, "y_yrfi", FEATURE_COLS, "YRFI", "yrfi", "reliability_YRFI_yrfi.png")

    print(f"  ✅ {len(list(rel_dir.glob('*.png')))} reliability curves saved to reliability_plots_FIXED/")


def plot_mae_over_time(reg_results, out):
    markets = sorted(set(r.market for r in reg_results))
    for market in markets:
        mkt_res = [r for r in reg_results if r.market == market]
        models  = sorted(set(r.model for r in mkt_res))

        fig, ax = plt.subplots(figsize=(8, 5))
        for model in models:
            mr = sorted([r for r in mkt_res if r.model == model], key=lambda r: r.test_year)
            ax.plot([r.test_year for r in mr], [r.model_mae for r in mr], "o-", label=f"{model} MAE")

        naive_vals = sorted([r for r in mkt_res if r.model == models[0]], key=lambda r: r.test_year)
        ax.plot([r.test_year for r in naive_vals], [r.naive_mae for r in naive_vals],
                "k--", label="Naive (predict train mean)", linewidth=2)
        ax.set_xlabel("Test Year"); ax.set_ylabel("MAE")
        ax.set_title(f"{market} — MAE Over Time"); ax.legend(); ax.set_xticks(TEST_YEARS)
        fig.savefig(out / f"mae_over_time_{market}.png", dpi=150)
        plt.close(fig)
    print(f"  ✅ {len(markets)} MAE-over-time plots saved")


# ═══════════════════════════════════════════════════════════
# STEP 3 — DECISION GATES (FIXED)
# ═══════════════════════════════════════════════════════════

@dataclass
class GateResult:
    market: str
    threshold: str
    kind: str              # "classification" or "regression"
    best_model: str
    verdict: str           # PASS / CONDITIONAL / FAIL
    n_total: int
    low_n: bool
    auc_splits_pass: int
    brier_splits_pass: int
    ll_splits_pass: int
    cal_splits_pass: int
    aucs: list
    brier_imps: list
    ll_imps: list
    cal_slopes: list
    eces: list
    mae_splits_pass: int
    mae_imps: list
    monthly_stable_count: int
    rationale: str


def apply_cls_gates(cls_results: list[ClsResult]) -> list[GateResult]:
    gate_results: list[GateResult] = []

    groups = defaultdict(list)
    for r in cls_results:
        groups[(r.market, r.threshold)].append(r)

    for (market, threshold), rows in sorted(groups.items()):
        is_nrfi = market in ("NRFI", "YRFI")
        auc_gate   = NRFI_AUC_MIN if is_nrfi else CLS_AUC_MIN
        brier_gate = NRFI_BRIER_IMP_MIN if is_nrfi else CLS_BRIER_IMP_MIN

        # Pick best model by mean AUC
        model_aucs = defaultdict(list)
        for r in rows:
            model_aucs[r.model].append(r.auc)
        best_model = max(model_aucs, key=lambda m: np.mean(model_aucs[m]))

        best_rows = sorted([r for r in rows if r.model == best_model], key=lambda r: r.test_year)

        aucs       = [r.auc for r in best_rows]
        brier_imps = [r.brier_improvement for r in best_rows]
        ll_imps    = [r.logloss_improvement for r in best_rows]
        cal_slopes = [r.cal_slope for r in best_rows]
        eces       = [r.ece for r in best_rows]

        n_total = sum(r.n_test for r in best_rows)
        low_n   = n_total < CLS_MIN_N
        n_splits = len(best_rows)

        auc_pass   = sum(1 for a in aucs if a >= auc_gate)
        brier_pass = sum(1 for b in brier_imps if b >= brier_gate)
        ll_pass    = sum(1 for l in ll_imps if l >= CLS_LL_IMP_MIN)
        cal_pass   = sum(1 for c in cal_slopes
                         if not np.isnan(c) and CLS_CAL_SLOPE_LO <= c <= CLS_CAL_SLOPE_HI)

        # Build rationale
        rp = []
        rp.append(f"Best model: {best_model}")
        rp.append(f"AUCs: {[f'{a:.4f}' for a in aucs]}")
        rp.append(f"Brier improvements (naive−model): {[f'{b:+.6f}' for b in brier_imps]}")
        rp.append(f"LL improvements (naive−model): {[f'{l:+.4f}' for l in ll_imps]}")
        rp.append(f"Cal slopes: {[f'{c:.3f}' for c in cal_slopes]}")
        rp.append(f"ECEs: {[f'{e:.4f}' for e in eces]}")
        rp.append(f"N total: {n_total} {'(LOW)' if low_n else ''}")
        if is_nrfi:
            rp.append(f"\nNRFI/YRFI stricter gates: AUC ≥ {auc_gate}, Brier imp ≥ {brier_gate}")

        auc_ok   = auc_pass >= GATE_SPLITS_NEEDED
        brier_ok = brier_pass >= GATE_SPLITS_NEEDED
        ll_ok    = ll_pass >= GATE_SPLITS_NEEDED
        cal_ok   = cal_pass >= GATE_SPLITS_NEEDED
        n_ok     = not low_n

        rp.append(f"\nGate results ({GATE_SPLITS_NEEDED}/{n_splits} splits needed):")
        rp.append(f"  {'✅' if auc_ok else '❌'} AUC ≥ {auc_gate}: {auc_pass}/{n_splits}")
        rp.append(f"  {'✅' if brier_ok else '❌'} Brier imp ≥ {brier_gate}: {brier_pass}/{n_splits}")
        rp.append(f"  {'✅' if ll_ok else '❌'} LL imp ≥ {CLS_LL_IMP_MIN}: {ll_pass}/{n_splits}")
        rp.append(f"  {'✅' if cal_ok else '❌'} Cal slope ∈ [{CLS_CAL_SLOPE_LO}, {CLS_CAL_SLOPE_HI}]: {cal_pass}/{n_splits}")
        rp.append(f"  {'✅' if n_ok else '⚠️ '} N ≥ {CLS_MIN_N}: {n_total}")

        # Three-tier verdict: PASS / CONDITIONAL / FAIL
        if auc_ok and brier_ok and cal_ok and n_ok:
            verdict = "PASS"
            rp.append("\n→ ALL gates passed. Worth collecting odds for this market.")
        elif auc_ok and n_ok:
            # AUC shows ranking ability but calibration/Brier fail
            verdict = "CONDITIONAL"
            fails = []
            if not brier_ok:
                fails.append("Brier")
            if not cal_ok:
                fails.append("calibration")
            rp.append(f"\n→ AUC gate passed but {', '.join(fails)} gate(s) failed.")
            rp.append(f"  Ranking signal exists. Needs better calibration / features.")
        else:
            verdict = "FAIL"
            rp.append("\n→ AUC gate FAILED or N too low. No consistent pregame signal.")
            rp.append("  Do NOT collect odds for this market.")

        gate_results.append(GateResult(
            market=market, threshold=threshold, kind="classification",
            best_model=best_model, verdict=verdict,
            n_total=n_total, low_n=low_n,
            auc_splits_pass=auc_pass, brier_splits_pass=brier_pass,
            ll_splits_pass=ll_pass, cal_splits_pass=cal_pass,
            aucs=aucs, brier_imps=brier_imps, ll_imps=ll_imps,
            cal_slopes=cal_slopes, eces=eces,
            mae_splits_pass=0, mae_imps=[], monthly_stable_count=0,
            rationale="\n".join(rp),
        ))

    return gate_results


def apply_reg_gates(reg_results: list[RegResult]) -> list[GateResult]:
    gate_results: list[GateResult] = []
    groups = defaultdict(list)
    for r in reg_results:
        groups[r.market].append(r)

    for market, rows in sorted(groups.items()):
        model_imps = defaultdict(list)
        for r in rows:
            model_imps[r.model].append(r.mae_improvement_pct)
        best_model = max(model_imps, key=lambda m: np.mean(model_imps[m]))

        best_rows = sorted([r for r in rows if r.model == best_model], key=lambda r: r.test_year)
        mae_imps = [r.mae_improvement_pct for r in best_rows]
        stables  = [r.monthly_stable for r in best_rows]
        mae_pass = sum(1 for i in mae_imps if i >= REG_MAE_IMP_PCT)
        stable_count = sum(stables)
        n_splits = len(best_rows)

        rp = []
        rp.append(f"Best model: {best_model}")
        rp.append(f"MAE improvements: {[f'{m:+.2f}%' for m in mae_imps]}")
        rp.append(f"Monthly stability: {stable_count}/{n_splits} splits stable")

        mae_ok  = mae_pass >= GATE_SPLITS_NEEDED
        stab_ok = stable_count >= GATE_SPLITS_NEEDED

        rp.append(f"\nGate results ({GATE_SPLITS_NEEDED}/{n_splits} needed):")
        rp.append(f"  {'✅' if mae_ok else '❌'} MAE imp ≥ {REG_MAE_IMP_PCT}%: {mae_pass}/{n_splits}")
        rp.append(f"  {'✅' if stab_ok else '❌'} Monthly stable: {stable_count}/{n_splits}")

        if mae_ok and stab_ok:
            verdict = "PASS"
            rp.append("\n→ Regression signal confirmed. Worth collecting odds.")
        elif mae_ok:
            verdict = "CONDITIONAL"
            rp.append("\n→ MAE signal exists but monthly instability detected.")
        else:
            verdict = "FAIL"
            rp.append("\n→ No meaningful MAE improvement over naive baseline.")

        gate_results.append(GateResult(
            market=market, threshold="continuous", kind="regression",
            best_model=best_model, verdict=verdict,
            n_total=sum(r.n_test for r in best_rows), low_n=False,
            auc_splits_pass=0, brier_splits_pass=0, ll_splits_pass=0,
            cal_splits_pass=0,
            aucs=[], brier_imps=[], ll_imps=[], cal_slopes=[], eces=[],
            mae_splits_pass=mae_pass, mae_imps=mae_imps,
            monthly_stable_count=stable_count,
            rationale="\n".join(rp),
        ))
    return gate_results


# ═══════════════════════════════════════════════════════════
# STEP 4 — WRITE FIXED REPORT
# ═══════════════════════════════════════════════════════════

def write_report(cls_results, reg_results, cls_gates, reg_gates, out):
    L = []
    icons = {"PASS": "🟢", "FAIL": "🔴", "CONDITIONAL": "🟡"}

    L.append("# Pre-Odds Market Screen — FIXED Signal Assessment\n")
    L.append(f"**Generated:** {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')}")
    L.append(f"**Method:** Walk-forward (train ≤ year N-1, test year N)")
    L.append(f"**Models:** LogReg + LightGBM (classification), Ridge + LightGBM (regression)")
    L.append(f"**Test Years:** {TEST_YEARS}")
    L.append(f"**Feature set:** {len(FEATURE_COLS)} production features")
    L.append(f"**Metrics:** AUC, Brier, LogLoss, Calibration slope/intercept, ECE (classification)")
    L.append(f"**Baseline:** p_naive = base_rate(y_test) for each split; regression naive = mean(y_train)")
    L.append("")
    L.append("**Sign convention:**")
    L.append("- `brier_improvement = brier_naive − brier_model`  (positive = model beats naive)")
    L.append("- `logloss_improvement = logloss_naive − logloss_model`  (positive = model beats naive)")
    L.append("- `cal_slope`: coefficient b in logistic regression `y ~ a + b*logit(p_model)` (ideal = 1.0)")
    L.append("")

    # ── Decision Gates ──
    L.append("## Decision Gates\n")
    L.append("### Classification")
    L.append(f"- AUC ≥ {CLS_AUC_MIN} in ≥{GATE_SPLITS_NEEDED}/3 splits")
    L.append(f"- brier_improvement ≥ {CLS_BRIER_IMP_MIN} in ≥{GATE_SPLITS_NEEDED}/3 splits")
    L.append(f"- logloss_improvement ≥ {CLS_LL_IMP_MIN} in ≥{GATE_SPLITS_NEEDED}/3 splits (optional)")
    L.append(f"- calibration_slope ∈ [{CLS_CAL_SLOPE_LO}, {CLS_CAL_SLOPE_HI}] in ≥{GATE_SPLITS_NEEDED}/3 splits")
    L.append(f"- N total ≥ {CLS_MIN_N}")
    L.append("")
    L.append("### NRFI/YRFI (stricter)")
    L.append(f"- AUC ≥ {NRFI_AUC_MIN}")
    L.append(f"- brier_improvement ≥ {NRFI_BRIER_IMP_MIN}")
    L.append("")
    L.append("### Regression")
    L.append(f"- MAE improvement vs predict-mean(y_train) ≥ {REG_MAE_IMP_PCT}% in ≥{GATE_SPLITS_NEEDED}/3 splits")
    L.append("- Stable error across months (no single-month blowup > 2× median)")
    L.append("")

    # ── Summary Verdicts ──
    all_gates = cls_gates + reg_gates
    L.append("## Summary Verdicts\n")
    L.append("| Market | Threshold | Type | Best Model | Verdict |")
    L.append("|--------|-----------|------|------------|---------|")
    for g in sorted(all_gates, key=lambda x: ({"PASS": 0, "CONDITIONAL": 1, "FAIL": 2}.get(x.verdict, 3), x.market, x.threshold)):
        L.append(f"| {g.market} | {g.threshold} | {g.kind} | {g.best_model} | {icons.get(g.verdict, '?')} **{g.verdict}** |")
    L.append("")

    # ── Conclusion ──
    L.append("## Conclusion\n")
    passes = [g for g in all_gates if g.verdict == "PASS"]
    conditionals = [g for g in all_gates if g.verdict == "CONDITIONAL"]
    fails = [g for g in all_gates if g.verdict == "FAIL"]

    L.append("### 🟢 PASS — Worth collecting odds:\n")
    if passes:
        for g in passes:
            L.append(f"- **{g.market} / {g.threshold}** ({g.kind}, {g.best_model})")
    else:
        L.append("- *(none)*")
    L.append("")

    L.append("### 🟡 CONDITIONAL — Needs better calibration/features:\n")
    if conditionals:
        for g in conditionals:
            L.append(f"- **{g.market} / {g.threshold}** ({g.kind}, {g.best_model})")
    else:
        L.append("- *(none)*")
    L.append("")

    L.append("### 🔴 FAIL — Do NOT collect odds:\n")
    if fails:
        for g in fails:
            L.append(f"- **{g.market} / {g.threshold}** ({g.kind})")
    else:
        L.append("- *(none)*")
    L.append("")

    # ── Classification Detail Table ──
    L.append("## Classification Metrics by Threshold\n")
    L.append("| Market | Threshold | Model | Test Year | N | Base Rate | AUC | "
             "Brier_M | Brier_N | Brier_Δ | LL_M | LL_N | LL_Δ | "
             "Cal Slope | Cal Int | ECE | Mono | p_min | p_max | p_mean | p_std |")
    L.append("|--------|-----------|-------|-----------|---|-----------|-----|"
             "---------|---------|---------|------|------|------|"
             "-----------|---------|-----|------|-------|-------|--------|-------|")
    for r in sorted(cls_results, key=lambda x: (x.market, x.threshold, x.model, x.test_year)):
        mono = "✓" if r.is_monotonic else "✗"
        L.append(
            f"| {r.market} | {r.threshold} | {r.model} | {r.test_year} | "
            f"{r.n_test} | {r.base_rate:.3f} | {r.auc:.4f} | "
            f"{r.brier_model:.6f} | {r.brier_naive:.6f} | {r.brier_improvement:+.6f} | "
            f"{r.logloss_model:.4f} | {r.logloss_naive:.4f} | {r.logloss_improvement:+.4f} | "
            f"{r.cal_slope:.3f} | {r.cal_intercept:+.3f} | {r.ece:.4f} | {mono} | "
            f"{r.p_model_min:.4f} | {r.p_model_max:.4f} | {r.p_model_mean:.4f} | {r.p_model_std:.4f} |"
        )
    L.append("")

    # ── Regression Detail Table ──
    L.append("## Regression Metrics\n")
    L.append("| Market | Target | Model | Test Year | N | Naive MAE | Model MAE | MAE Imp% | RMSE | R² | Month Stable |")
    L.append("|--------|--------|-------|-----------|---|-----------|-----------|----------|------|----|-------------|")
    for r in sorted(reg_results, key=lambda x: (x.market, x.model, x.test_year)):
        stable = "✓" if r.monthly_stable else "✗"
        L.append(
            f"| {r.market} | {r.target} | {r.model} | {r.test_year} | "
            f"{r.n_test} | {r.naive_mae:.4f} | {r.model_mae:.4f} | "
            f"{r.mae_improvement_pct:+.2f}% | {r.rmse:.4f} | {r.r2:.4f} | {stable} |"
        )
    L.append("")

    # ── Top 3 Reliability Tables ──
    L.append("## Reliability Tables — Top 3 Candidates\n")
    # Rank by mean AUC across splits for best model
    market_auc = defaultdict(list)
    for r in cls_results:
        market_auc[(r.market, r.threshold, r.model)].append(r.auc)
    ranked = sorted(market_auc.items(), key=lambda x: np.mean(x[1]), reverse=True)

    shown = set()
    count = 0
    for (market, threshold, model), auc_list in ranked:
        key = (market, threshold)
        if key in shown:
            continue
        shown.add(key)
        count += 1
        if count > 3:
            break

        L.append(f"### {market} / {threshold} ({model}) — mean AUC = {np.mean(auc_list):.4f}\n")
        # Get the best model's results for this market/threshold
        best_rows = sorted([r for r in cls_results if r.market == market
                           and r.threshold == threshold and r.model == model],
                          key=lambda x: x.test_year)
        for r in best_rows:
            # Reconstruct reliability table from the data
            L.append(f"**Test {r.test_year}:** AUC={r.auc:.4f}, BrierΔ={r.brier_improvement:+.6f}, "
                     f"CalSlope={r.cal_slope:.3f}, ECE={r.ece:.4f}, "
                     f"p∈[{r.p_model_min:.4f}, {r.p_model_max:.4f}]\n")
        L.append("")

    # ── Per-gate rationale ──
    L.append("## Detailed Gate Rationale\n")
    for g in sorted(all_gates, key=lambda x: (x.market, x.threshold)):
        L.append(f"### {g.market} / {g.threshold} ({g.kind})\n")
        L.append(f"**Verdict: {icons.get(g.verdict, '?')} {g.verdict}**\n")
        L.append("```")
        L.append(g.rationale)
        L.append("```\n")

    L.append("\n---\n")
    L.append(f"*Generated by pre_odds_screen_fixed.py on {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')}*")

    (out / "pre_odds_market_screen_FIXED.md").write_text("\n".join(L))


# ═══════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("  PRE-ODDS MARKET SCREEN — FIXED")
    print("  Corrected baselines, calibration, ECE, diagnostics")
    print("=" * 70)

    # ── Sanity Check: Synthetic Calibration ──
    cal_ok = sanity_check_calibration()
    if not cal_ok:
        print("\n  ❌ ABORTING — synthetic calibration test failed.")
        print("     Fix compute_calibration_slope_intercept before proceeding.")
        sys.exit(1)

    # ── STEP 0 ──
    print("\n── STEP 0: Build Canonical Datasets ──\n")
    print("Loading features_v2.parquet…")
    df = load_data()
    print(f"  {len(df)} rows, {len(df.columns)} cols, seasons {sorted(df['season'].unique())}")
    df = build_targets(df)
    df = merge_nrfi(df)
    errs = verify_targets(df)
    if errs > 0:
        print(f"\n  ⚠️  {errs} target verification error(s)")

    # ── STEP 1A: Classification ──
    print("\n\n══════════════════════════════════════════════════")
    print("  STEP 1A — CLASSIFICATION WALK-FORWARD (FIXED)")
    print("══════════════════════════════════════════════════")
    cls_results = run_classification(df, df)

    # ── Sanity checks on results ──
    sanity_check_results(cls_results)

    # ── STEP 1B: Regression ──
    print("\n\n══════════════════════════════════════════════════")
    print("  STEP 1B — REGRESSION WALK-FORWARD (FIXED: naive=mean(y_train))")
    print("══════════════════════════════════════════════════")
    reg_results = run_regression(df)

    # ── STEP 2: Plots ──
    print("\n\n══════════════════════════════════════════════════")
    print("  STEP 2 — PLOTS")
    print("══════════════════════════════════════════════════")
    plot_reliability_curves_fixed(df, df, cls_results, OUTPUT_DIR)
    if reg_results:
        plot_mae_over_time(reg_results, OUTPUT_DIR)

    # ── STEP 3: Decision Gates ──
    print("\n\n══════════════════════════════════════════════════")
    print("  STEP 3 — DECISION GATES (FIXED)")
    print("══════════════════════════════════════════════════")
    cls_gates = apply_cls_gates(cls_results)
    reg_gates = apply_reg_gates(reg_results)

    print("\n  CLASSIFICATION GATE RESULTS:")
    for g in sorted(cls_gates, key=lambda x: ({"PASS": 0, "CONDITIONAL": 1, "FAIL": 2}.get(x.verdict, 3), x.market)):
        icon = icons = {"PASS": "🟢", "FAIL": "🔴", "CONDITIONAL": "🟡"}.get(g.verdict, "?")
        mean_auc = np.mean(g.aucs) if g.aucs else 0
        mean_ece = np.mean(g.eces) if g.eces else 0
        print(f"    {icon} {g.market:<25} {g.threshold:<15} "
              f"AUC_mean={mean_auc:.4f}  AUC_pass={g.auc_splits_pass}/3  "
              f"Brier_pass={g.brier_splits_pass}/3  Cal_pass={g.cal_splits_pass}/3  "
              f"ECE_mean={mean_ece:.4f}  → {g.verdict}")

    print("\n  REGRESSION GATE RESULTS:")
    for g in sorted(reg_gates, key=lambda x: ({"PASS": 0, "CONDITIONAL": 1, "FAIL": 2}.get(x.verdict, 3), x.market)):
        icon = {"PASS": "🟢", "FAIL": "🔴", "CONDITIONAL": "🟡"}.get(g.verdict, "?")
        mean_imp = np.mean(g.mae_imps) if g.mae_imps else 0
        print(f"    {icon} {g.market:<25} MAE_imp_mean={mean_imp:+.2f}%  "
              f"MAE_pass={g.mae_splits_pass}/3  Stable={g.monthly_stable_count}/3  → {g.verdict}")

    # ── Save CSVs ──
    print("\n\n══════════════════════════════════════════════════")
    print("  SAVING OUTPUTS")
    print("══════════════════════════════════════════════════")

    if cls_results:
        cls_df = pd.DataFrame([asdict(r) for r in cls_results])
        cls_df.to_csv(OUTPUT_DIR / "classification_metrics_FIXED.csv", index=False)
        print(f"  ✅ classification_metrics_FIXED.csv ({len(cls_df)} rows)")

    if reg_results:
        reg_dicts = []
        for r in reg_results:
            d = asdict(r)
            d["monthly_mae"] = json.dumps(d["monthly_mae"])
            reg_dicts.append(d)
        reg_df = pd.DataFrame(reg_dicts)
        reg_df.to_csv(OUTPUT_DIR / "regression_metrics_FIXED.csv", index=False)
        print(f"  ✅ regression_metrics_FIXED.csv ({len(reg_df)} rows)")

    # ── Write report ──
    write_report(cls_results, reg_results, cls_gates, reg_gates, OUTPUT_DIR)
    print(f"  ✅ pre_odds_market_screen_FIXED.md")

    # ── Final summary ──
    all_gates = cls_gates + reg_gates
    passes      = [g for g in all_gates if g.verdict == "PASS"]
    conditionals = [g for g in all_gates if g.verdict == "CONDITIONAL"]
    fails       = [g for g in all_gates if g.verdict == "FAIL"]

    print("\n" + "=" * 70)
    print("  FINAL VERDICT (FIXED)")
    print("=" * 70)

    print("\n  🟢 PASS — Worth collecting odds:")
    if passes:
        for g in passes:
            print(f"     🟢 {g.market} / {g.threshold} ({g.kind})")
    else:
        print("     (none)")

    print("\n  🟡 CONDITIONAL — Needs better calibration/features:")
    for g in conditionals:
        print(f"     🟡 {g.market} / {g.threshold} ({g.kind})")

    print("\n  🔴 FAIL — Do NOT collect odds:")
    for g in fails:
        print(f"     🔴 {g.market} / {g.threshold} ({g.kind})")

    print(f"\n  Output: {OUTPUT_DIR.resolve()}")
    print("=" * 70)


if __name__ == "__main__":
    main()
