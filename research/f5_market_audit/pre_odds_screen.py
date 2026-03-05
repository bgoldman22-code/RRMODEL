#!/usr/bin/env python3
"""
PRE-ODDS MARKET SCREEN
======================
Before collecting historical odds/lines, run a rigorous signal-screening pass
using metrics that do NOT require pricing (AUC, Brier, LogLoss, calibration).
Also run MAE/RMSE/R² for continuous targets (F5 runs / team F5 runs).

Markets:
  1) F5 Totals  (F5 combined runs through 5 innings)
  2) F5 Team Totals  (home F5 runs, away F5 runs)
  3) NRFI/YRFI  (1st inning run yes/no)

Walk-forward splits:
  Train: 2022           → Test: 2023
  Train: 2022–2023      → Test: 2024
  Train: 2022–2024      → Test: 2025

Decision gates (Step 3 of spec):
  Classification:
    AUC ≥ 0.535 in ≥2/3 splits AND
    Brier improvement vs naive ≥ 0.003 in ≥2/3 splits AND
    Cal slope ∈ [0.85, 1.15] in ≥2/3 splits AND
    Min N per threshold ≥ 800 rows

  Regression:
    MAE improvement vs naive (predict mean) ≥ 3 % in ≥2/3 splits AND
    Stable error across months (no single-month blowup)

  NRFI/YRFI (stricter):
    AUC ≥ 0.545 AND Brier improvement ≥ 0.004

Outputs:
  pre_odds_market_screen.md
  classification_metrics_by_threshold.csv
  regression_metrics.csv
  reliability_curves_{market}_{threshold}.png
  mae_over_time_{market}.png
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
from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge
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
OUTPUT_DIR  = Path(__file__).resolve().parent / "pre_odds_output"

# NRFI labels cached from Phase 2 (avoid re-fetching 9 700 games)
NRFI_CACHE  = Path(__file__).resolve().parent / "phase2_output" / "nrfi_labels.parquet"

FEATURE_COLS: list[str] = json.loads((ARTIFACTS / "features.json").read_text())

TEST_YEARS   = [2023, 2024, 2025]
TOTAL_LINES  = [3.5, 4.0, 4.5, 5.0, 5.5]
TEAM_LINES   = [1.5, 2.0, 2.5, 3.0]

# ═══════════════════════════════════════════════════════════
# DECISION GATES  (from spec, Step 3)
# ═══════════════════════════════════════════════════════════
CLS_AUC_MIN         = 0.535   # ≥ in 2/3 splits
CLS_BRIER_IMP_MIN   = 0.003   # improvement vs naive, 2/3 splits
CLS_CAL_SLOPE_LO    = 0.85    # calibration slope range
CLS_CAL_SLOPE_HI    = 1.15
CLS_MIN_N           = 800     # minimum rows across all years

NRFI_AUC_MIN        = 0.545
NRFI_BRIER_IMP_MIN  = 0.004

REG_MAE_IMP_PCT     = 3.0     # ≥ 3 % MAE improvement vs predict-mean

GATE_SPLITS_NEEDED  = 2       # out of 3


# ═══════════════════════════════════════════════════════════
# STEP 0 — BUILD CANONICAL DATASETS
# ═══════════════════════════════════════════════════════════

def load_data() -> pd.DataFrame:
    """Load features_v2.parquet, enforce types."""
    df = pd.read_parquet(FEATURES_PQ)
    df["season"] = df["season"].astype(float)
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    return df


def build_targets(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add target columns:
      y_f5_total, y_home_f5, y_away_f5  (continuous)
      y_yrfi  (binary, requires NRFI labels merge)
      binary thresholds for classification
    """
    # Continuous targets (already exist as labels)
    df["y_f5_total"] = df["label_f5_total"]
    df["y_home_f5"]  = df["label_f5_home"]
    df["y_away_f5"]  = df["label_f5_away"]

    # Classification thresholds — F5 Totals
    for line in TOTAL_LINES:
        col = f"y_total_over_{line}"
        df[col] = (df["label_f5_total"] > line).astype(int)

    # Classification thresholds — F5 Team Totals
    for side in ["home", "away"]:
        label_col = f"label_f5_{side}"
        for line in TEAM_LINES:
            col = f"y_{side}_over_{line}"
            df[col] = (df[label_col] > line).astype(int)

    return df


def merge_nrfi(df: pd.DataFrame) -> pd.DataFrame:
    """Merge NRFI labels from cached parquet or fetch if needed."""
    if not NRFI_CACHE.exists():
        print("  ⚠️  NRFI cache not found — fetching from MLB Stats API…")
        nrfi_df = _fetch_nrfi_all(df)
        if nrfi_df.empty:
            return df
    else:
        nrfi_df = pd.read_parquet(NRFI_CACHE)
        print(f"  📦 Loaded {len(nrfi_df)} cached NRFI labels")

    nrfi_df["game_pk"] = nrfi_df["game_pk"].astype(float)
    merged = df.merge(
        nrfi_df[["game_pk", "nrfi", "first_inning_total"]],
        on="game_pk", how="left",
    )
    merged["y_yrfi"] = merged["nrfi"].map({1: 0, 0: 1})  # YRFI = NOT NRFI
    matched = merged["nrfi"].notna().sum()
    print(f"  Matched {matched}/{len(df)} games with NRFI labels")
    return merged


def _fetch_nrfi_all(df: pd.DataFrame) -> pd.DataFrame:
    """Concurrent fetch of first-inning linescores from MLB Stats API."""
    import ssl, urllib.request
    from concurrent.futures import ThreadPoolExecutor, as_completed

    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    game_pks = sorted(df["game_pk"].dropna().unique().astype(int))
    print(f"  Fetching {len(game_pks)} linescores (20 threads)…")

    def fetch_one(gpk):
        url = f"https://statsapi.mlb.com/api/v1/game/{gpk}/linescore"
        try:
            req = urllib.request.Request(url)
            req.add_header("User-Agent", "F5-Market-Audit/2.0")
            with urllib.request.urlopen(req, timeout=10, context=ssl_ctx) as resp:
                data = json.loads(resp.read().decode())
            inn = data.get("innings", [])
            if inn:
                f = inn[0]
                hr = f.get("home", {}).get("runs", 0) or 0
                ar = f.get("away", {}).get("runs", 0) or 0
                return {"game_pk": gpk, "first_inning_home": hr, "first_inning_away": ar,
                        "first_inning_total": hr + ar, "nrfi": int(hr == 0 and ar == 0)}
        except Exception:
            pass
        return None

    results = []
    done = 0
    with ThreadPoolExecutor(max_workers=20) as pool:
        futs = {pool.submit(fetch_one, g): g for g in game_pks}
        for f in as_completed(futs):
            done += 1
            r = f.result()
            if r:
                results.append(r)
            if done % 1000 == 0:
                print(f"    {done}/{len(game_pks)}", flush=True)

    if not results:
        return pd.DataFrame()
    nrfi_df = pd.DataFrame(results)
    NRFI_CACHE.parent.mkdir(parents=True, exist_ok=True)
    nrfi_df.to_parquet(NRFI_CACHE, index=False)
    print(f"  ✅ Saved {len(nrfi_df)} NRFI labels to cache")
    return nrfi_df


def verify_targets(df: pd.DataFrame):
    """Unit-test style checks on target construction."""
    print("\n── Target Verification ──")
    errors = 0

    # 1) y_f5_total == label_f5_home + label_f5_away
    check = (df["y_f5_total"] == df["label_f5_home"] + df["label_f5_away"])
    n_match = check.sum()
    n_total = check.notna().sum()
    if n_match == n_total:
        print(f"  ✅ y_f5_total == home + away for all {n_total} rows")
    else:
        pct = (n_total - n_match) / n_total * 100
        print(f"  ❌ y_f5_total mismatch: {n_total - n_match} rows ({pct:.2f}%)")
        errors += 1

    # 2) Binary thresholds are correct
    for line in TOTAL_LINES:
        col = f"y_total_over_{line}"
        expected = (df["label_f5_total"] > line).astype(int)
        if (df[col] == expected).all():
            print(f"  ✅ {col} correct")
        else:
            print(f"  ❌ {col} mismatch")
            errors += 1

    for side in ["home", "away"]:
        for line in TEAM_LINES:
            col = f"y_{side}_over_{line}"
            expected = (df[f"label_f5_{side}"] > line).astype(int)
            if (df[col] == expected).all():
                print(f"  ✅ {col} correct")
            else:
                print(f"  ❌ {col} mismatch")
                errors += 1

    # 3) NRFI / YRFI consistency
    if "y_yrfi" in df.columns and df["y_yrfi"].notna().sum() > 0:
        nrfi_mask = df["nrfi"].notna()
        nrfi_check = df.loc[nrfi_mask, "nrfi"] + df.loc[nrfi_mask, "y_yrfi"]
        if (nrfi_check == 1).all():
            print(f"  ✅ y_yrfi = 1 - nrfi for all {nrfi_mask.sum()} rows")
        else:
            print(f"  ❌ YRFI/NRFI consistency check failed")
            errors += 1

        # Check NRFI rate is plausible (0.40-0.60)
        rate = df.loc[nrfi_mask, "nrfi"].mean()
        if 0.40 <= rate <= 0.60:
            print(f"  ✅ NRFI rate = {rate:.3f} (plausible)")
        else:
            print(f"  ⚠️  NRFI rate = {rate:.3f} (unusual)")

    # 4) Quick sample verification (spot-check first 5 rows)
    sample = df.head(5)
    for _, row in sample.iterrows():
        if row["y_f5_total"] > 4.5:
            assert row["y_total_over_4.5"] == 1, "Spot check failed: total > 4.5 but flag is 0"
        else:
            assert row["y_total_over_4.5"] == 0, "Spot check failed: total ≤ 4.5 but flag is 1"
    print(f"  ✅ Spot-check passed on 5 sample rows")

    if errors == 0:
        print(f"  ✅✅ ALL TARGET CHECKS PASSED")
    else:
        print(f"  ⚠️  {errors} check(s) failed — review above")

    return errors


# ═══════════════════════════════════════════════════════════
# HELPERS — Calibration & Metrics
# ═══════════════════════════════════════════════════════════

def calibration_slope(y_true, y_prob):
    """Platt-style calibration slope via LR on logit(p)."""
    eps = 1e-6
    p = np.clip(y_prob, eps, 1 - eps)
    logit = np.log(p / (1 - p)).reshape(-1, 1)
    try:
        m = LogisticRegression(solver="lbfgs", max_iter=2000, penalty=None)
        m.fit(logit, y_true)
        return float(m.coef_[0][0]), float(m.intercept_[0])
    except Exception:
        return np.nan, np.nan


def reliability_monotonic(y_true, y_prob, n_bins=8):
    """Check if reliability curve is approximately monotonic."""
    try:
        frac_pos, mean_pred = calibration_curve(y_true, y_prob, n_bins=n_bins, strategy="uniform")
        if len(frac_pos) < 3:
            return True
        diffs = np.diff(frac_pos)
        return int(np.sum(diffs < -0.03)) <= 1   # allow ≤1 minor dip
    except Exception:
        return False


# ═══════════════════════════════════════════════════════════
# STEP 1A — CLASSIFICATION WALK-FORWARD
# ═══════════════════════════════════════════════════════════

@dataclass
class ClsResult:
    market: str           # F5_Totals / F5_TeamTotals_home / F5_TeamTotals_away / NRFI / YRFI
    threshold: str        # e.g. "over_4.5" or "nrfi"
    model: str            # LogReg / LightGBM
    train_years: str      # "2022" / "2022-2023" / "2022-2024"
    test_year: int
    n_train: int
    n_test: int
    base_rate: float
    auc: float
    brier: float
    brier_naive: float    # naive = predict base_rate
    brier_improvement: float
    logloss: float
    logloss_naive: float
    cal_slope: float
    cal_intercept: float
    is_monotonic: bool


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

    # Naive Brier & LogLoss (always predict base rate)
    naive_probs = np.full(len(y_test), base_rate)
    brier_naive = brier_score_loss(y_test, naive_probs)
    ll_naive    = log_loss(y_test, np.clip(naive_probs, 1e-6, 1 - 1e-6))

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

        auc   = roc_auc_score(y_test, probs) if len(np.unique(y_test)) == 2 else 0.5
        brier = brier_score_loss(y_test, probs)
        ll    = log_loss(y_test, np.clip(probs, 1e-6, 1 - 1e-6))
        cs, ci = calibration_slope(y_test, probs)
        mono  = reliability_monotonic(y_test, probs)

        results.append(ClsResult(
            market=market, threshold=threshold, model="LogReg",
            train_years=train_years_str, test_year=test_year,
            n_train=len(train), n_test=len(test), base_rate=round(base_rate, 4),
            auc=round(auc, 4), brier=round(brier, 6), brier_naive=round(brier_naive, 6),
            brier_improvement=round(brier_naive - brier, 6),
            logloss=round(ll, 4), logloss_naive=round(ll_naive, 4),
            cal_slope=round(cs, 4), cal_intercept=round(ci, 4),
            is_monotonic=mono,
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

        auc   = roc_auc_score(y_test, probs) if len(np.unique(y_test)) == 2 else 0.5
        brier = brier_score_loss(y_test, probs)
        ll    = log_loss(y_test, np.clip(probs, 1e-6, 1 - 1e-6))
        cs, ci = calibration_slope(y_test, probs)
        mono  = reliability_monotonic(y_test, probs)

        results.append(ClsResult(
            market=market, threshold=threshold, model="LightGBM",
            train_years=train_years_str, test_year=test_year,
            n_train=len(train), n_test=len(test), base_rate=round(base_rate, 4),
            auc=round(auc, 4), brier=round(brier, 6), brier_naive=round(brier_naive, 6),
            brier_improvement=round(brier_naive - brier, 6),
            logloss=round(ll, 4), logloss_naive=round(ll_naive, 4),
            cal_slope=round(cs, 4), cal_intercept=round(ci, 4),
            is_monotonic=mono,
        ))
    except Exception as e:
        print(f"    ❌ LightGBM {test_year}: {e}")

    return results


def run_classification(df: pd.DataFrame, df_nrfi: pd.DataFrame) -> list[ClsResult]:
    """Run classification walk-forward for all markets / thresholds."""
    all_results: list[ClsResult] = []

    # ── F5 Totals ──
    print("\n────────────────────────────────────────────────")
    print("  CLASSIFICATION: F5 Totals (Over/Under)")
    print("────────────────────────────────────────────────")
    for line in TOTAL_LINES:
        tgt = f"y_total_over_{line}"
        br = df[tgt].mean()
        print(f"\n  [{f'over_{line}'}]  base_rate={br:.3f}  N={len(df)}")
        for yr in TEST_YEARS:
            res = _cls_one_split(df, tgt, FEATURE_COLS, yr, "F5_Totals", f"over_{line}")
            all_results.extend(res)
            for r in res:
                print(f"    {r.model:<10} test={r.test_year}  AUC={r.auc:.4f}  Brier={r.brier:.6f}  "
                      f"BrierΔ={r.brier_improvement:+.6f}  LL={r.logloss:.4f}  "
                      f"CalSlp={r.cal_slope:.3f}  Mono={'✓' if r.is_monotonic else '✗'}")

    # ── F5 Team Totals — Home ──
    print("\n────────────────────────────────────────────────")
    print("  CLASSIFICATION: F5 Team Totals — Home")
    print("────────────────────────────────────────────────")
    for line in TEAM_LINES:
        tgt = f"y_home_over_{line}"
        br = df[tgt].mean()
        print(f"\n  [{f'home_over_{line}'}]  base_rate={br:.3f}  N={len(df)}")
        for yr in TEST_YEARS:
            res = _cls_one_split(df, tgt, FEATURE_COLS, yr, "F5_TeamTotals_home", f"over_{line}")
            all_results.extend(res)
            for r in res:
                print(f"    {r.model:<10} test={r.test_year}  AUC={r.auc:.4f}  BrierΔ={r.brier_improvement:+.6f}  "
                      f"CalSlp={r.cal_slope:.3f}  Mono={'✓' if r.is_monotonic else '✗'}")

    # ── F5 Team Totals — Away ──
    print("\n────────────────────────────────────────────────")
    print("  CLASSIFICATION: F5 Team Totals — Away")
    print("────────────────────────────────────────────────")
    for line in TEAM_LINES:
        tgt = f"y_away_over_{line}"
        br = df[tgt].mean()
        print(f"\n  [{f'away_over_{line}'}]  base_rate={br:.3f}  N={len(df)}")
        for yr in TEST_YEARS:
            res = _cls_one_split(df, tgt, FEATURE_COLS, yr, "F5_TeamTotals_away", f"over_{line}")
            all_results.extend(res)
            for r in res:
                print(f"    {r.model:<10} test={r.test_year}  AUC={r.auc:.4f}  BrierΔ={r.brier_improvement:+.6f}  "
                      f"CalSlp={r.cal_slope:.3f}  Mono={'✓' if r.is_monotonic else '✗'}")

    # ── NRFI ──
    print("\n────────────────────────────────────────────────")
    print("  CLASSIFICATION: NRFI")
    print("────────────────────────────────────────────────")
    nrfi_valid = df_nrfi.dropna(subset=["nrfi"])
    if len(nrfi_valid) >= CLS_MIN_N:
        br = nrfi_valid["nrfi"].mean()
        print(f"\n  [nrfi]  base_rate={br:.3f}  N={len(nrfi_valid)}")
        for yr in TEST_YEARS:
            res = _cls_one_split(nrfi_valid, "nrfi", FEATURE_COLS, yr, "NRFI", "nrfi")
            all_results.extend(res)
            for r in res:
                print(f"    {r.model:<10} test={r.test_year}  AUC={r.auc:.4f}  BrierΔ={r.brier_improvement:+.6f}  "
                      f"CalSlp={r.cal_slope:.3f}")
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
        for yr in TEST_YEARS:
            res = _cls_one_split(yrfi_valid, "y_yrfi", FEATURE_COLS, yr, "YRFI", "yrfi")
            all_results.extend(res)
            for r in res:
                print(f"    {r.model:<10} test={r.test_year}  AUC={r.auc:.4f}  BrierΔ={r.brier_improvement:+.6f}  "
                      f"CalSlp={r.cal_slope:.3f}")
    else:
        print(f"  ⚠️  Only {len(yrfi_valid)} YRFI rows — skip")

    return all_results


# ═══════════════════════════════════════════════════════════
# STEP 1B — REGRESSION WALK-FORWARD
# ═══════════════════════════════════════════════════════════

@dataclass
class RegResult:
    market: str           # F5_Totals / F5_TeamTotals_home / F5_TeamTotals_away
    target: str           # y_f5_total / y_home_f5 / y_away_f5
    model: str            # Ridge / LightGBM
    train_years: str
    test_year: int
    n_train: int
    n_test: int
    naive_mae: float      # MAE of predict-mean baseline
    model_mae: float
    mae_improvement_pct: float
    rmse: float
    r2: float
    # Monthly stability
    monthly_mae: dict     # { month → MAE }
    max_monthly_mae: float
    min_monthly_mae: float
    monthly_stable: bool  # no single-month blowup


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

    # Naive baseline: predict training mean
    naive_pred = np.full(len(y_test), y_train.mean())
    naive_mae  = mean_absolute_error(y_test, naive_pred)

    train_years_str = "-".join(str(int(s)) for s in sorted(train["season"].unique()))

    # Monthly breakdown helper
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
        # "blowup" = any month > 2× the median MAE
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
    """Run regression walk-forward for continuous targets."""
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
        mean_val = df[tgt].mean()
        std_val  = df[tgt].std()
        print(f"  Mean={mean_val:.3f}  Std={std_val:.3f}")

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
# STEP 2 — RELIABILITY CURVES & MAE-OVER-TIME PLOTS
# ═══════════════════════════════════════════════════════════

def plot_reliability_curves(df: pd.DataFrame, df_nrfi: pd.DataFrame, out: Path):
    """Generate reliability curve PNGs for each market/threshold."""
    rel_dir = out / "reliability_curves"
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
            X_tr = train_d[avail].fillna(train_d[avail].mean()).fillna(0)
            y_tr = train_d[target_col].values
            X_te = test_d[avail].fillna(train_d[avail].mean()).fillna(0)
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

                    frac, mean_p = calibration_curve(y_te, probs, n_bins=10, strategy="uniform")
                    ax.plot(mean_p, frac, "o-", label=name, markersize=4)
                except Exception:
                    pass

            ax.set_xlabel("Predicted probability")
            ax.set_ylabel("Observed frequency")
            ax.set_title(f"{market}/{threshold} — {yr}")
            ax.legend(fontsize=7)
            ax.set_xlim(0, 1); ax.set_ylim(0, 1)

        plt.tight_layout()
        fig.savefig(rel_dir / filename, dpi=150)
        plt.close(fig)

    # F5 Totals
    for line in TOTAL_LINES:
        tgt = f"y_total_over_{line}"
        _plot_one(df, tgt, FEATURE_COLS, "F5_Totals", f"over_{line}",
                  f"reliability_F5_Totals_over_{line}.png")
    # F5 Team Totals
    for side in ["home", "away"]:
        for line in TEAM_LINES:
            tgt = f"y_{side}_over_{line}"
            _plot_one(df, tgt, FEATURE_COLS, f"F5_TeamTotals_{side}", f"over_{line}",
                      f"reliability_F5_TeamTotals_{side}_over_{line}.png")
    # NRFI
    nrfi_valid = df_nrfi.dropna(subset=["nrfi"])
    if len(nrfi_valid) >= CLS_MIN_N:
        _plot_one(nrfi_valid, "nrfi", FEATURE_COLS, "NRFI", "nrfi",
                  "reliability_NRFI_nrfi.png")
    # YRFI
    yrfi_valid = df_nrfi.dropna(subset=["y_yrfi"])
    if len(yrfi_valid) >= CLS_MIN_N:
        _plot_one(yrfi_valid, "y_yrfi", FEATURE_COLS, "YRFI", "yrfi",
                  "reliability_YRFI_yrfi.png")

    print(f"  ✅ {len(list(rel_dir.glob('*.png')))} reliability curves saved")


def plot_mae_over_time(reg_results: list[RegResult], out: Path):
    """Plot MAE (model vs naive) across splits for each regression target."""
    mae_dir = out
    markets = sorted(set(r.market for r in reg_results))

    for market in markets:
        mkt_res = [r for r in reg_results if r.market == market]
        models  = sorted(set(r.model for r in mkt_res))

        fig, ax = plt.subplots(figsize=(8, 5))

        for model in models:
            mr = sorted([r for r in mkt_res if r.model == model], key=lambda r: r.test_year)
            years = [r.test_year for r in mr]
            maes  = [r.model_mae for r in mr]
            ax.plot(years, maes, "o-", label=f"{model} MAE")

        # Naive baseline
        naive_vals = sorted([r for r in mkt_res if r.model == models[0]], key=lambda r: r.test_year)
        ax.plot([r.test_year for r in naive_vals], [r.naive_mae for r in naive_vals],
                "k--", label="Naive (predict mean)", linewidth=2)

        ax.set_xlabel("Test Year")
        ax.set_ylabel("MAE")
        ax.set_title(f"{market} — MAE Over Time")
        ax.legend()
        ax.set_xticks(TEST_YEARS)

        fig.savefig(mae_dir / f"mae_over_time_{market}.png", dpi=150)
        plt.close(fig)

    print(f"  ✅ {len(markets)} MAE-over-time plots saved")


# ═══════════════════════════════════════════════════════════
# STEP 3 — DECISION GATES
# ═══════════════════════════════════════════════════════════

@dataclass
class GateResult:
    market: str
    threshold: str
    kind: str             # "classification" or "regression"
    best_model: str
    verdict: str          # COLLECT / DO_NOT_COLLECT / COLLECT_IF_FEATURES_CHANGE
    n_total: int
    low_n: bool
    # Classification gate details
    auc_splits_pass: int
    brier_splits_pass: int
    cal_splits_pass: int
    aucs: list
    brier_imps: list
    cal_slopes: list
    # Regression gate details  (only for regression)
    mae_splits_pass: int
    mae_imps: list
    monthly_stable_count: int
    rationale: str


def apply_cls_gates(cls_results: list[ClsResult]) -> list[GateResult]:
    """Apply classification decision gates per market/threshold."""
    gate_results: list[GateResult] = []

    # Group by (market, threshold)
    groups = defaultdict(list)
    for r in cls_results:
        groups[(r.market, r.threshold)].append(r)

    for (market, threshold), rows in sorted(groups.items()):
        is_nrfi = market in ("NRFI", "YRFI")
        auc_gate  = NRFI_AUC_MIN if is_nrfi else CLS_AUC_MIN
        brier_gate = NRFI_BRIER_IMP_MIN if is_nrfi else CLS_BRIER_IMP_MIN

        # Pick best model by mean AUC
        model_aucs = defaultdict(list)
        for r in rows:
            model_aucs[r.model].append(r.auc)
        best_model = max(model_aucs, key=lambda m: np.mean(model_aucs[m]))

        best_rows = [r for r in rows if r.model == best_model]
        best_rows_sorted = sorted(best_rows, key=lambda r: r.test_year)

        aucs = [r.auc for r in best_rows_sorted]
        brier_imps = [r.brier_improvement for r in best_rows_sorted]
        cal_slopes = [r.cal_slope for r in best_rows_sorted]

        n_total = sum(r.n_test for r in best_rows_sorted)
        low_n = n_total < CLS_MIN_N

        auc_pass  = sum(1 for a in aucs if a >= auc_gate)
        brier_pass = sum(1 for b in brier_imps if b >= brier_gate)
        cal_pass  = sum(1 for c in cal_slopes if CLS_CAL_SLOPE_LO <= c <= CLS_CAL_SLOPE_HI)

        n_splits = len(best_rows_sorted)

        # Verdict
        rationale_parts = []
        rationale_parts.append(f"Best model: {best_model}")
        rationale_parts.append(f"AUCs: {[f'{a:.4f}' for a in aucs]}")
        rationale_parts.append(f"Brier improvements: {[f'{b:+.6f}' for b in brier_imps]}")
        rationale_parts.append(f"Cal slopes: {[f'{c:.3f}' for c in cal_slopes]}")
        rationale_parts.append(f"N total: {n_total} {'(LOW)' if low_n else ''}")

        if is_nrfi:
            rationale_parts.append(f"\nNRFI/YRFI stricter gates: AUC ≥ {auc_gate}, Brier imp ≥ {brier_gate}")

        auc_ok   = auc_pass >= GATE_SPLITS_NEEDED
        brier_ok = brier_pass >= GATE_SPLITS_NEEDED
        cal_ok   = cal_pass >= GATE_SPLITS_NEEDED
        n_ok     = not low_n

        rationale_parts.append(f"\nGate results ({GATE_SPLITS_NEEDED}/{n_splits} splits needed):")
        rationale_parts.append(f"  {'✅' if auc_ok else '❌'} AUC ≥ {auc_gate}: {auc_pass}/{n_splits}")
        rationale_parts.append(f"  {'✅' if brier_ok else '❌'} Brier Δ ≥ {brier_gate}: {brier_pass}/{n_splits}")
        rationale_parts.append(f"  {'✅' if cal_ok else '❌'} Cal slope ∈ [{CLS_CAL_SLOPE_LO}, {CLS_CAL_SLOPE_HI}]: {cal_pass}/{n_splits}")
        rationale_parts.append(f"  {'✅' if n_ok else '⚠️ '} N ≥ {CLS_MIN_N}: {n_total}")

        if auc_ok and brier_ok and cal_ok and n_ok:
            verdict = "COLLECT"
            rationale_parts.append("\n→ ALL gates passed. Collect odds for this market.")
        elif auc_ok and (brier_ok or cal_ok):
            verdict = "COLLECT_IF_FEATURES_CHANGE"
            rationale_parts.append("\n→ AUC gate passed, but calibration or Brier gate failed.")
            rationale_parts.append("  Signal exists but model is poorly calibrated.")
            rationale_parts.append("  Collect odds ONLY if isotonic calibration or feature changes improve cal/Brier.")
        elif auc_ok:
            verdict = "COLLECT_IF_FEATURES_CHANGE"
            rationale_parts.append("\n→ AUC gate passed alone. Weak signal.")
            rationale_parts.append("  Only pursue if model architecture or features significantly change.")
        else:
            verdict = "DO_NOT_COLLECT"
            rationale_parts.append("\n→ AUC gate FAILED. No consistent pregame signal.")
            rationale_parts.append("  Do NOT collect odds for this market.")

        gate_results.append(GateResult(
            market=market, threshold=threshold, kind="classification",
            best_model=best_model, verdict=verdict,
            n_total=n_total, low_n=low_n,
            auc_splits_pass=auc_pass, brier_splits_pass=brier_pass,
            cal_splits_pass=cal_pass,
            aucs=aucs, brier_imps=brier_imps, cal_slopes=cal_slopes,
            mae_splits_pass=0, mae_imps=[], monthly_stable_count=0,
            rationale="\n".join(rationale_parts),
        ))

    return gate_results


def apply_reg_gates(reg_results: list[RegResult]) -> list[GateResult]:
    """Apply regression decision gates per market."""
    gate_results: list[GateResult] = []

    groups = defaultdict(list)
    for r in reg_results:
        groups[r.market].append(r)

    for market, rows in sorted(groups.items()):
        # Pick best model by mean MAE improvement
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

        rationale_parts = []
        rationale_parts.append(f"Best model: {best_model}")
        rationale_parts.append(f"MAE improvements: {[f'{m:+.2f}%' for m in mae_imps]}")
        rationale_parts.append(f"Monthly stability: {stable_count}/{n_splits} splits stable")

        mae_ok = mae_pass >= GATE_SPLITS_NEEDED
        stab_ok = stable_count >= GATE_SPLITS_NEEDED

        rationale_parts.append(f"\nGate results ({GATE_SPLITS_NEEDED}/{n_splits} needed):")
        rationale_parts.append(f"  {'✅' if mae_ok else '❌'} MAE imp ≥ {REG_MAE_IMP_PCT}%: {mae_pass}/{n_splits}")
        rationale_parts.append(f"  {'✅' if stab_ok else '❌'} Monthly stable: {stable_count}/{n_splits}")

        if mae_ok and stab_ok:
            verdict = "COLLECT"
            rationale_parts.append("\n→ Regression signal confirmed. Collect odds.")
        elif mae_ok:
            verdict = "COLLECT_IF_FEATURES_CHANGE"
            rationale_parts.append("\n→ MAE signal exists but monthly instability detected.")
        else:
            verdict = "DO_NOT_COLLECT"
            rationale_parts.append("\n→ No meaningful MAE improvement over naive baseline.")

        gate_results.append(GateResult(
            market=market, threshold="continuous", kind="regression",
            best_model=best_model, verdict=verdict,
            n_total=sum(r.n_test for r in best_rows), low_n=False,
            auc_splits_pass=0, brier_splits_pass=0, cal_splits_pass=0,
            aucs=[], brier_imps=[], cal_slopes=[],
            mae_splits_pass=mae_pass, mae_imps=mae_imps,
            monthly_stable_count=stable_count,
            rationale="\n".join(rationale_parts),
        ))

    return gate_results


# ═══════════════════════════════════════════════════════════
# STEP 4 — WRITE FINAL REPORT
# ═══════════════════════════════════════════════════════════

def write_report(
    cls_results: list[ClsResult],
    reg_results: list[RegResult],
    cls_gates: list[GateResult],
    reg_gates: list[GateResult],
    out: Path,
):
    """Write pre_odds_market_screen.md."""
    L = []  # lines

    L.append("# Pre-Odds Market Screen — Signal Assessment\n")
    L.append(f"**Generated:** {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')}")
    L.append(f"**Method:** Walk-forward (train ≤ year N-1, test year N)")
    L.append(f"**Models:** LogReg + LightGBM (classification), Ridge + LightGBM (regression)")
    L.append(f"**Test Years:** {TEST_YEARS}")
    L.append(f"**Feature set:** {len(FEATURE_COLS)} production features")
    L.append(f"**Metrics:** AUC, Brier, LogLoss, Calibration (classification); MAE, RMSE, R² (regression)")
    L.append("")

    # ── Decision Gates ──
    L.append("## Decision Gates\n")
    L.append("### Classification")
    L.append(f"- AUC ≥ {CLS_AUC_MIN} in ≥{GATE_SPLITS_NEEDED}/3 splits")
    L.append(f"- Brier improvement vs naive ≥ {CLS_BRIER_IMP_MIN} in ≥{GATE_SPLITS_NEEDED}/3 splits")
    L.append(f"- Calibration slope ∈ [{CLS_CAL_SLOPE_LO}, {CLS_CAL_SLOPE_HI}] in ≥{GATE_SPLITS_NEEDED}/3 splits")
    L.append(f"- Minimum N ≥ {CLS_MIN_N} across all years")
    L.append("")
    L.append("### NRFI/YRFI (stricter)")
    L.append(f"- AUC ≥ {NRFI_AUC_MIN}")
    L.append(f"- Brier improvement ≥ {NRFI_BRIER_IMP_MIN}")
    L.append("")
    L.append("### Regression")
    L.append(f"- MAE improvement vs predict-mean ≥ {REG_MAE_IMP_PCT}% in ≥{GATE_SPLITS_NEEDED}/3 splits")
    L.append("- Stable error across months (no single-month blowup)")
    L.append("")

    # ── Summary Verdicts ──
    all_gates = cls_gates + reg_gates
    collect      = [g for g in all_gates if g.verdict == "COLLECT"]
    do_not       = [g for g in all_gates if g.verdict == "DO_NOT_COLLECT"]
    conditional  = [g for g in all_gates if g.verdict == "COLLECT_IF_FEATURES_CHANGE"]

    L.append("## Summary Verdicts\n")
    icons = {"COLLECT": "🟢", "DO_NOT_COLLECT": "🔴", "COLLECT_IF_FEATURES_CHANGE": "🟡"}

    L.append("| Market | Threshold | Type | Best Model | Verdict |")
    L.append("|--------|-----------|------|------------|---------|")
    for g in sorted(all_gates, key=lambda x: (x.verdict, x.market, x.threshold)):
        icon = icons.get(g.verdict, "?")
        L.append(f"| {g.market} | {g.threshold} | {g.kind} | {g.best_model} | {icon} **{g.verdict}** |")
    L.append("")

    # ── Conclusion ──
    L.append("## Conclusion\n")

    L.append("### ✅ Collect odds for:\n")
    if collect:
        for g in collect:
            L.append(f"- **{g.market} / {g.threshold}** ({g.kind}, {g.best_model})")
    else:
        L.append("- *(none)*")
    L.append("")

    L.append("### 🔴 Do NOT collect odds for:\n")
    if do_not:
        for g in do_not:
            L.append(f"- **{g.market} / {g.threshold}** ({g.kind})")
    else:
        L.append("- *(none)*")
    L.append("")

    L.append("### 🟡 Only collect odds if we change features/model:\n")
    if conditional:
        for g in conditional:
            L.append(f"- **{g.market} / {g.threshold}** ({g.kind}, {g.best_model})")
    else:
        L.append("- *(none)*")
    L.append("")

    # ── Classification Detail Table ──
    L.append("## Classification Metrics by Threshold\n")
    L.append("| Market | Threshold | Model | Test Year | N | Base Rate | AUC | Brier | Brier Δ | LogLoss | LL Naive | Cal Slope | Mono |")
    L.append("|--------|-----------|-------|-----------|---|-----------|-----|-------|---------|---------|----------|-----------|------|")
    for r in sorted(cls_results, key=lambda x: (x.market, x.threshold, x.model, x.test_year)):
        mono = "✓" if r.is_monotonic else "✗"
        L.append(
            f"| {r.market} | {r.threshold} | {r.model} | {r.test_year} | "
            f"{r.n_test} | {r.base_rate:.3f} | {r.auc:.4f} | {r.brier:.6f} | "
            f"{r.brier_improvement:+.6f} | {r.logloss:.4f} | {r.logloss_naive:.4f} | "
            f"{r.cal_slope:.3f} | {mono} |"
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

    # ── Per-gate rationale ──
    L.append("## Detailed Gate Rationale\n")
    for g in sorted(all_gates, key=lambda x: (x.market, x.threshold)):
        L.append(f"### {g.market} / {g.threshold} ({g.kind})\n")
        L.append(f"**Verdict: {icons.get(g.verdict, '?')} {g.verdict}**\n")
        L.append("```")
        L.append(g.rationale)
        L.append("```\n")

    L.append("\n---\n")
    L.append(f"*Generated by pre_odds_screen.py on {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')}*")

    (out / "pre_odds_market_screen.md").write_text("\n".join(L))


# ═══════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("  PRE-ODDS MARKET SCREEN")
    print("  F5 Totals | F5 Team Totals | NRFI/YRFI")
    print("  Walk-forward | No leakage | No odds required")
    print("=" * 70)

    # ── STEP 0: Build canonical datasets ──
    print("\n── STEP 0: Build Canonical Datasets ──\n")
    print("Loading features_v2.parquet…")
    df = load_data()
    print(f"  {len(df)} rows, {len(df.columns)} cols, seasons {sorted(df['season'].unique())}")

    df = build_targets(df)
    df = merge_nrfi(df)
    errs = verify_targets(df)
    if errs > 0:
        print(f"\n  ⚠️  {errs} target verification error(s) — review above before trusting results")

    # ── STEP 1A: Classification ──
    print("\n\n══════════════════════════════════════════════════")
    print("  STEP 1A — CLASSIFICATION WALK-FORWARD")
    print("══════════════════════════════════════════════════")
    cls_results = run_classification(df, df)

    # ── STEP 1B: Regression ──
    print("\n\n══════════════════════════════════════════════════")
    print("  STEP 1B — REGRESSION WALK-FORWARD")
    print("══════════════════════════════════════════════════")
    reg_results = run_regression(df)

    # ── STEP 2: Plots ──
    print("\n\n══════════════════════════════════════════════════")
    print("  STEP 2 — PLOTS")
    print("══════════════════════════════════════════════════")
    plot_reliability_curves(df, df, OUTPUT_DIR)
    if reg_results:
        plot_mae_over_time(reg_results, OUTPUT_DIR)

    # ── STEP 3: Decision Gates ──
    print("\n\n══════════════════════════════════════════════════")
    print("  STEP 3 — DECISION GATES")
    print("══════════════════════════════════════════════════")

    cls_gates = apply_cls_gates(cls_results)
    reg_gates = apply_reg_gates(reg_results)

    print("\n  CLASSIFICATION GATE RESULTS:")
    for g in sorted(cls_gates, key=lambda x: (x.verdict, x.market)):
        icon = {"COLLECT": "🟢", "DO_NOT_COLLECT": "🔴", "COLLECT_IF_FEATURES_CHANGE": "🟡"}.get(g.verdict, "?")
        mean_auc = np.mean(g.aucs) if g.aucs else 0
        print(f"    {icon} {g.market:<25} {g.threshold:<15} AUC_mean={mean_auc:.4f}  "
              f"AUC_pass={g.auc_splits_pass}/3  Brier_pass={g.brier_splits_pass}/3  "
              f"Cal_pass={g.cal_splits_pass}/3  → {g.verdict}")

    print("\n  REGRESSION GATE RESULTS:")
    for g in sorted(reg_gates, key=lambda x: (x.verdict, x.market)):
        icon = {"COLLECT": "🟢", "DO_NOT_COLLECT": "🔴", "COLLECT_IF_FEATURES_CHANGE": "🟡"}.get(g.verdict, "?")
        mean_imp = np.mean(g.mae_imps) if g.mae_imps else 0
        print(f"    {icon} {g.market:<25} MAE_imp_mean={mean_imp:+.2f}%  "
              f"MAE_pass={g.mae_splits_pass}/3  Stable={g.monthly_stable_count}/3  → {g.verdict}")

    # ── Save CSVs ──
    print("\n\n══════════════════════════════════════════════════")
    print("  SAVING OUTPUTS")
    print("══════════════════════════════════════════════════")

    if cls_results:
        cls_df = pd.DataFrame([asdict(r) for r in cls_results])
        cls_df.to_csv(OUTPUT_DIR / "classification_metrics_by_threshold.csv", index=False)
        print(f"  ✅ classification_metrics_by_threshold.csv ({len(cls_df)} rows)")

    if reg_results:
        # Convert monthly_mae dict to string for CSV
        reg_dicts = []
        for r in reg_results:
            d = asdict(r)
            d["monthly_mae"] = json.dumps(d["monthly_mae"])
            reg_dicts.append(d)
        reg_df = pd.DataFrame(reg_dicts)
        reg_df.to_csv(OUTPUT_DIR / "regression_metrics.csv", index=False)
        print(f"  ✅ regression_metrics.csv ({len(reg_df)} rows)")

    # ── Write final report ──
    write_report(cls_results, reg_results, cls_gates, reg_gates, OUTPUT_DIR)
    print(f"  ✅ pre_odds_market_screen.md")

    # ── Final summary ──
    all_gates = cls_gates + reg_gates
    collect     = [g for g in all_gates if g.verdict == "COLLECT"]
    do_not      = [g for g in all_gates if g.verdict == "DO_NOT_COLLECT"]
    conditional = [g for g in all_gates if g.verdict == "COLLECT_IF_FEATURES_CHANGE"]

    print("\n" + "=" * 70)
    print("  FINAL VERDICT")
    print("=" * 70)

    print("\n  ✅ Collect odds for:")
    if collect:
        for g in collect:
            print(f"     🟢 {g.market} / {g.threshold} ({g.kind})")
    else:
        print("     (none)")

    print("\n  🔴 Do NOT collect odds for:")
    for g in do_not:
        print(f"     🔴 {g.market} / {g.threshold} ({g.kind})")

    print("\n  🟡 Only collect if features/model change:")
    for g in conditional:
        print(f"     🟡 {g.market} / {g.threshold} ({g.kind})")

    print(f"\n  Output: {OUTPUT_DIR.resolve()}")
    print("=" * 70)


if __name__ == "__main__":
    main()
