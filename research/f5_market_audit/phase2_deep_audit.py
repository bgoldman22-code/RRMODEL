#!/usr/bin/env python3
"""
Phase 2 — Deep Market Audit: F5 Totals, F5 Team Totals, NRFI/YRFI
====================================================================

Follows Phase 1 learnability scan (run_learnability_audit.py).

Sub-phases:
  2A  Data schema report + column-level leakage audit
  2B  Baseline metrics (market implied prob where available)
  2C  Enhanced walk-forward modeling (LogReg + LightGBM + tuned LGB)
  2D  Segmentation / bucket diagnostics
  2E  GO / NO-GO decision with written rationale
  2F  ROI backtest plan stub (if greenlighted)

Key constraints:
  • F5 Totals / Team Totals — labels derived from label_f5_total / label_f5_home / label_f5_away
  • NO market odds exist for these (TheOddsAPI never fetched totals_1st_5_innings)
  • NRFI/YRFI — NO first-inning labels in features_v2; must fetch from MLB Stats API
  • All evaluation is TRUE WALK-FORWARD: train ≤ year N-1, test year N

Outputs → research/f5_market_audit/phase2_output/
"""

from __future__ import annotations

import json
import os
import sys
import time
import warnings
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
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    brier_score_loss, mean_absolute_error, roc_auc_score,
    log_loss, precision_recall_curve, average_precision_score,
)
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

# ─────────────────────────────────────────────────────────────
# PATHS & CONFIG
# ─────────────────────────────────────────────────────────────
REPO_ROOT   = Path(__file__).parent.parent.parent
FEATURES_PQ = REPO_ROOT / "data" / "mlb_research" / "features" / "features_v2.parquet"
ODDS_DIR    = REPO_ROOT / "data" / "mlb_research" / "derived" / "f5_ml"
ARTIFACTS   = REPO_ROOT / "ml" / "f5_ml" / "artifacts"
OUTPUT_DIR  = Path(__file__).parent / "phase2_output"

FEATURE_COLS = json.loads((ARTIFACTS / "features.json").read_text())

TEST_YEARS = [2023, 2024, 2025]

# Lines to evaluate
TOTAL_LINES      = [3.5, 4.0, 4.5, 5.0, 5.5]
TEAM_TOTAL_LINES = [1.5, 2.0, 2.5, 3.0]

# GO/NO-GO thresholds (Phase 2 — slightly relaxed vs Phase 1 for exploration)
AUC_MEAN_MIN   = 0.54      # Phase 1 was 0.55; relax to 0.54 for deep-dive
AUC_SINGLE_MIN = 0.56      # Phase 1 was 0.57
CAL_SLOPE_LO   = 0.40      # Much lower than Phase 1's 0.85 — we know raw LGB under-disperses
CAL_SLOPE_HI   = 1.60
BRIER_SKILL_MIN = 0.0      # Must beat naive base-rate

# Feature engineering groups
PITCHER_FEAT_PREFIXES = ["away_sp_", "home_sp_"]
LINEUP_FEAT_PREFIXES  = ["away_lineup_", "home_lineup_"]
PARK_FEATS            = ["park_run_factor"]
INTERACTION_PREFIXES  = ["interaction_", "combined_"]


# ─────────────────────────────────────────────────────────────
# DATA LOADING
# ─────────────────────────────────────────────────────────────

def load_features() -> pd.DataFrame:
    df = pd.read_parquet(FEATURES_PQ)
    df["season"] = df["season"].astype(float)
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    return df


# ─────────────────────────────────────────────────────────────
# 2A — DATA SCHEMA & LEAKAGE AUDIT
# ─────────────────────────────────────────────────────────────

KNOWN_LEAKAGE_COLS = {
    # These columns contain outcome information
    "label_f5_home",
    "label_f5_away",
    "label_f5_total",
    "label_f5_home_win",
    "label_f5_home_score",
    "label_f5_away_score",
}

KNOWN_ID_COLS = {"game_pk", "game_date", "season"}


def run_phase2a(df: pd.DataFrame, out: Path):
    """
    Phase 2A: Data schema report + column-level leakage audit.
    Writes:
      - data_schema_report.md
      - leakage_audit.csv
    """
    print("\n" + "=" * 70)
    print("  PHASE 2A — Data Schema & Leakage Audit")
    print("=" * 70)

    all_cols = list(df.columns)
    n_rows = len(df)
    seasons = sorted(df["season"].dropna().unique())

    # Classify each column
    audit_rows = []
    for col in all_cols:
        dtype = str(df[col].dtype)
        null_pct = df[col].isna().mean() * 100
        n_unique = df[col].nunique()

        if col in KNOWN_LEAKAGE_COLS:
            category = "LABEL (leakage if used as feature)"
            safe_as_feature = False
        elif col in KNOWN_ID_COLS:
            category = "ID / meta (not a feature)"
            safe_as_feature = False
        elif col.startswith("target_"):
            category = "DERIVED TARGET (leakage)"
            safe_as_feature = False
        elif col in FEATURE_COLS:
            category = "PRODUCTION FEATURE"
            safe_as_feature = True
        else:
            category = "NON-PRODUCTION COLUMN"
            safe_as_feature = True  # Not in prod model, but not a label either

        # Check for suspicious patterns (potential label leakage)
        suspicious = False
        if col not in KNOWN_LEAKAGE_COLS and col not in KNOWN_ID_COLS:
            # Check if column is perfectly correlated with any label
            for label in ["label_f5_home_win"]:
                if label in df.columns and col != label:
                    try:
                        corr = df[[col, label]].dropna().corr().iloc[0, 1]
                        if abs(corr) > 0.95:
                            suspicious = True
                            category += f" ⚠️ |corr|={abs(corr):.3f} with {label}"
                    except Exception:
                        pass

        audit_rows.append({
            "column": col,
            "dtype": dtype,
            "null_pct": round(null_pct, 2),
            "n_unique": n_unique,
            "category": category,
            "safe_as_feature": safe_as_feature,
            "suspicious": suspicious,
            "in_production_model": col in FEATURE_COLS,
        })

    audit_df = pd.DataFrame(audit_rows)
    audit_df.to_csv(out / "leakage_audit.csv", index=False)
    print(f"  ✅ leakage_audit.csv — {len(audit_df)} columns audited")

    # Schema report
    label_cols = [c for c in all_cols if c.startswith("label_")]
    feature_count = len([r for r in audit_rows if r["in_production_model"]])
    unsafe_count = len([r for r in audit_rows if not r["safe_as_feature"]])
    suspicious_count = len([r for r in audit_rows if r["suspicious"]])

    # Label distributions
    label_stats = {}
    for lc in label_cols:
        if lc in df.columns:
            vals = df[lc].dropna()
            label_stats[lc] = {
                "count": len(vals),
                "null_count": df[lc].isna().sum(),
                "mean": round(float(vals.mean()), 4),
                "median": round(float(vals.median()), 4),
                "std": round(float(vals.std()), 4),
                "min": round(float(vals.min()), 4),
                "max": round(float(vals.max()), 4),
            }

    # Base rates for target markets
    totals_base_rates = {}
    for line in TOTAL_LINES:
        vals = df["label_f5_total"].dropna()
        rate = float((vals > line).mean())
        totals_base_rates[f"over_{line}"] = round(rate, 4)

    tt_base_rates = {}
    for side in ["home", "away"]:
        col = f"label_f5_{side}"
        vals = df[col].dropna()
        for line in TEAM_TOTAL_LINES:
            rate = float((vals > line).mean())
            tt_base_rates[f"{side}_over_{line}"] = round(rate, 4)

    lines = [
        "# Phase 2A — Data Schema & Leakage Audit\n",
        f"**Generated:** {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')}",
        f"**Dataset:** features_v2.parquet",
        f"**Rows:** {n_rows:,}",
        f"**Columns:** {len(all_cols)}",
        f"**Seasons:** {seasons}\n",
        "## Column Classification\n",
        f"| Category | Count |",
        f"|----------|-------|",
        f"| Production features | {feature_count} |",
        f"| Label columns (leakage if used as input) | {len(label_cols)} |",
        f"| ID / meta columns | {len(KNOWN_ID_COLS)} |",
        f"| Suspicious (|corr| > 0.95 with label) | {suspicious_count} |",
        f"| Total unsafe as feature | {unsafe_count} |",
        "",
        "## Label Distributions\n",
    ]

    for lc, stats in label_stats.items():
        lines.append(f"### `{lc}`")
        lines.append(f"- Count: {stats['count']:,} (null: {stats['null_count']:,})")
        lines.append(f"- Mean: {stats['mean']}, Median: {stats['median']}, Std: {stats['std']}")
        lines.append(f"- Range: [{stats['min']}, {stats['max']}]")
        lines.append("")

    lines.append("## F5 Totals Base Rates\n")
    lines.append("| Line | Over % | Under % |")
    lines.append("|------|--------|---------|")
    for k, v in totals_base_rates.items():
        lines.append(f"| {k} | {v:.1%} | {1-v:.1%} |")

    lines.append("\n## F5 Team Totals Base Rates\n")
    lines.append("| Side | Line | Over % | Under % |")
    lines.append("|------|------|--------|---------|")
    for k, v in tt_base_rates.items():
        side, rest = k.split("_", 1)
        lines.append(f"| {side} | {rest} | {v:.1%} | {1-v:.1%} |")

    lines.append("\n## NRFI / YRFI Data Status\n")
    lines.append("- **First-inning scoring labels:** ❌ NOT AVAILABLE in features_v2.parquet")
    lines.append("- **Required data source:** MLB Stats API `/game/{gamePk}/linescore` endpoint")
    lines.append("- **TheOddsAPI markets available:** `h2h_1st_1_innings`, `totals_1st_1_innings`")
    lines.append("- **Status:** Must fetch ~9,720 game linescores to create NRFI labels")
    lines.append("- **Action:** Phase 2B will attempt to fetch first-inning scoring data")

    lines.append("\n## Leakage Guardrails\n")
    lines.append("The following columns are EXCLUDED from all feature matrices:\n")
    for col in sorted(KNOWN_LEAKAGE_COLS | KNOWN_ID_COLS):
        lines.append(f"- `{col}`")

    (out / "data_schema_report.md").write_text("\n".join(lines))
    print(f"  ✅ data_schema_report.md")

    return audit_df


# ─────────────────────────────────────────────────────────────
# 2B — NRFI LABEL COLLECTION (MLB Stats API)
# ─────────────────────────────────────────────────────────────

def _fetch_one_linescore(gpk: int, ssl_ctx) -> Optional[dict]:
    """Fetch first-inning scoring for one game from MLB Stats API."""
    import urllib.request
    url = f"https://statsapi.mlb.com/api/v1/game/{gpk}/linescore"
    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "F5-Market-Audit/1.0")
        with urllib.request.urlopen(req, timeout=8, context=ssl_ctx) as resp:
            data = json.loads(resp.read().decode())
        innings = data.get("innings", [])
        if innings:
            first = innings[0]
            home_runs = first.get("home", {}).get("runs", 0)
            away_runs = first.get("away", {}).get("runs", 0)
            home_runs = home_runs if home_runs is not None else 0
            away_runs = away_runs if away_runs is not None else 0
            return {
                "game_pk": gpk,
                "first_inning_home": home_runs,
                "first_inning_away": away_runs,
                "first_inning_total": home_runs + away_runs,
                "nrfi": 1 if (home_runs == 0 and away_runs == 0) else 0,
            }
    except Exception:
        pass
    return None


def fetch_nrfi_labels(df: pd.DataFrame, out: Path) -> pd.DataFrame:
    """
    Fetch first-inning scoring from MLB Stats API using concurrent requests.
    Returns DataFrame with columns: game_pk, first_inning_home, first_inning_away, nrfi
    
    Uses ThreadPoolExecutor for ~20x speedup vs sequential fetching.
    Results are cached to parquet for re-runs.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    print("\n" + "=" * 70)
    print("  PHASE 2B-NRFI — Fetching First-Inning Scores from MLB Stats API")
    print("=" * 70)

    nrfi_cache = out / "nrfi_labels.parquet"
    if nrfi_cache.exists():
        print(f"  📦 Loading cached NRFI labels from {nrfi_cache}")
        nrfi_df = pd.read_parquet(nrfi_cache)
        print(f"  Loaded {len(nrfi_df)} games with NRFI labels")
        return nrfi_df

    try:
        import ssl
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
    except ImportError:
        print("  ❌ ssl not available — skipping NRFI fetch")
        return pd.DataFrame()

    game_pks = sorted(df["game_pk"].dropna().unique().astype(int))
    print(f"  Total games to fetch: {len(game_pks)}")
    print(f"  Using 20 concurrent threads…", flush=True)

    results = []
    done = 0

    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = {pool.submit(_fetch_one_linescore, gpk, ssl_ctx): gpk for gpk in game_pks}
        for future in as_completed(futures):
            done += 1
            result = future.result()
            if result is not None:
                results.append(result)
            if done % 500 == 0:
                print(f"    Progress: {done}/{len(game_pks)} ({len(results)} successful)", flush=True)

    if not results:
        print("  ❌ No NRFI labels fetched — NRFI market NOT EVALUABLE")
        return pd.DataFrame()

    nrfi_df = pd.DataFrame(results)
    nrfi_df.to_parquet(nrfi_cache, index=False)
    print(f"  ✅ Fetched {len(nrfi_df)} NRFI labels, saved to {nrfi_cache}")
    print(f"     NRFI rate: {nrfi_df['nrfi'].mean():.3f}")
    print(f"     Mean 1st inning runs: {nrfi_df['first_inning_total'].mean():.3f}")

    return nrfi_df


# ─────────────────────────────────────────────────────────────
# METRICS (enhanced from Phase 1)
# ─────────────────────────────────────────────────────────────

@dataclass
class EvalResult:
    market: str
    submarket: str
    model_name: str
    split_year: int
    n_test: int
    auc: float
    mae: float
    brier: float
    log_loss_val: float
    brier_skill: float        # 1 - brier/brier_baseline
    cal_slope: float
    cal_intercept: float
    is_monotonic: bool
    pos_rate: float           # base rate in test set
    avg_precision: float      # average precision score
    feature_group: str = "all"  # which feature subset


def compute_calibration_slope(y_true, y_prob):
    from sklearn.linear_model import LogisticRegression as LR
    eps = 1e-6
    p = np.clip(y_prob, eps, 1 - eps)
    lo = np.log(p / (1 - p)).reshape(-1, 1)
    try:
        m = LR(solver="lbfgs", max_iter=1000)
        m.fit(lo, y_true)
        return float(m.coef_[0][0]), float(m.intercept_[0])
    except Exception:
        return np.nan, np.nan


def check_monotonic(y_true, y_prob, n_bins=5):
    try:
        pt, pp = calibration_curve(y_true, y_prob, n_bins=n_bins, strategy="uniform")
        if len(pt) < 3:
            return True
        diffs = np.diff(pt)
        return int(np.sum(diffs < -0.02)) <= 1
    except Exception:
        return False


def evaluate(y_true, y_prob, market, submarket, model_name, split_year, feature_group="all") -> EvalResult:
    n = len(y_true)
    pos_rate = float(y_true.mean())
    auc = roc_auc_score(y_true, y_prob) if len(np.unique(y_true)) == 2 else 0.5
    mae = mean_absolute_error(y_true, y_prob)
    brier = brier_score_loss(y_true, y_prob)
    ll = log_loss(y_true, np.clip(y_prob, 1e-6, 1-1e-6))
    ap = average_precision_score(y_true, y_prob) if len(np.unique(y_true)) == 2 else pos_rate

    # Brier skill score: reference is always predicting base rate
    brier_base = pos_rate * (1 - pos_rate)
    brier_skill = 1 - brier / brier_base if brier_base > 0 else 0.0

    slope, intercept = compute_calibration_slope(y_true, y_prob)
    mono = check_monotonic(y_true, y_prob)

    return EvalResult(
        market=market, submarket=submarket, model_name=model_name,
        split_year=split_year, n_test=n, auc=round(auc, 4),
        mae=round(mae, 4), brier=round(brier, 4),
        log_loss_val=round(ll, 4),
        brier_skill=round(brier_skill, 4),
        cal_slope=round(slope, 4), cal_intercept=round(intercept, 4),
        is_monotonic=mono, pos_rate=round(pos_rate, 4),
        avg_precision=round(ap, 4), feature_group=feature_group,
    )


# ─────────────────────────────────────────────────────────────
# 2C — ENHANCED WALK-FORWARD MODELING
# ─────────────────────────────────────────────────────────────

def get_feature_subsets(all_feats: list[str]) -> dict[str, list[str]]:
    """Define feature subsets for ablation."""
    subsets = {"all": all_feats}

    # Pitcher-heavy subset
    pitcher = [f for f in all_feats if any(f.startswith(p) for p in PITCHER_FEAT_PREFIXES)]
    if pitcher:
        subsets["pitcher_only"] = pitcher

    # Pitcher + park
    pitcher_park = pitcher + [f for f in all_feats if f in PARK_FEATS]
    if pitcher_park:
        subsets["pitcher_park"] = pitcher_park

    # Team stats (L5/L10/L20) + pitcher + park
    team = [f for f in all_feats if any(x in f for x in ["_L5_", "_L10_", "_L20_"])]
    team_pitcher_park = list(set(team + pitcher_park))
    if team_pitcher_park:
        subsets["team_pitcher_park"] = team_pitcher_park

    return subsets


def train_and_eval_enhanced(
    df: pd.DataFrame,
    target_col: str,
    feature_cols: list[str],
    market: str,
    submarket: str,
    run_ablation: bool = False,
) -> tuple[list[EvalResult], dict]:
    """
    Enhanced walk-forward with:
      - LogReg, LightGBM (default), LightGBM (tuned)
      - Optional feature ablation
    Returns (results, raw_predictions_by_year)
    """
    results = []
    raw_preds = {}  # year → { model_name → (y_true, y_prob) }

    avail_feats = [c for c in feature_cols if c in df.columns]
    feature_subsets = get_feature_subsets(avail_feats) if run_ablation else {"all": avail_feats}

    for feat_group_name, feat_group in feature_subsets.items():
        for test_year in TEST_YEARS:
            train = df[df["season"] < test_year].copy()
            test = df[df["season"] == test_year].copy()

            if len(train) < 100 or len(test) < 50:
                continue

            X_train = train[feat_group].copy()
            y_train = train[target_col].values
            X_test = test[feat_group].copy()
            y_test = test[target_col].values

            train_means = X_train.mean()
            X_train = X_train.fillna(train_means).fillna(0)
            X_test = X_test.fillna(train_means).fillna(0)

            year_preds = raw_preds.setdefault(test_year, {})

            # ── LogisticRegression ──
            if feat_group_name == "all":  # only run LR on full set
                scaler = StandardScaler()
                X_tr_s = scaler.fit_transform(X_train.values)
                X_te_s = scaler.transform(X_test.values)
                try:
                    lr = LogisticRegression(max_iter=2000, C=1.0, solver="lbfgs")
                    lr.fit(X_tr_s, y_train)
                    lr_probs = lr.predict_proba(X_te_s)[:, 1]
                    results.append(evaluate(
                        y_test, lr_probs, market, submarket, "LogReg", test_year, feat_group_name
                    ))
                    year_preds["LogReg"] = (y_test, lr_probs)
                except Exception as e:
                    print(f"    ❌ LogReg {test_year}: {e}")

            # ── LightGBM default ──
            model_name = f"LGB_{feat_group_name}" if feat_group_name != "all" else "LightGBM"
            try:
                lgb_model = lgb.LGBMClassifier(
                    n_estimators=300, max_depth=5, learning_rate=0.05,
                    subsample=0.8, colsample_bytree=0.7, min_child_samples=30,
                    reg_alpha=0.1, reg_lambda=1.0, verbose=-1, random_state=42,
                    force_col_wise=True,
                )
                lgb_model.fit(X_train.values, y_train)
                probs = lgb_model.predict_proba(X_test.values)[:, 1]
                results.append(evaluate(
                    y_test, probs, market, submarket, model_name, test_year, feat_group_name
                ))
                if feat_group_name == "all":
                    year_preds["LightGBM"] = (y_test, probs)
                    # Also store feature importances
                    year_preds["_lgb_importances"] = dict(
                        zip(feat_group, lgb_model.feature_importances_)
                    )
            except Exception as e:
                print(f"    ❌ {model_name} {test_year}: {e}")

            # ── LightGBM tuned (more regularized, deeper) — only on full features ──
            if feat_group_name == "all":
                try:
                    lgb_tuned = lgb.LGBMClassifier(
                        n_estimators=500, max_depth=4, learning_rate=0.03,
                        subsample=0.7, colsample_bytree=0.5, min_child_samples=50,
                        reg_alpha=0.5, reg_lambda=2.0, verbose=-1, random_state=42,
                        force_col_wise=True, num_leaves=15,
                    )
                    lgb_tuned.fit(X_train.values, y_train)
                    tuned_probs = lgb_tuned.predict_proba(X_test.values)[:, 1]
                    results.append(evaluate(
                        y_test, tuned_probs, market, submarket, "LGB_tuned", test_year, feat_group_name
                    ))
                    year_preds["LGB_tuned"] = (y_test, tuned_probs)
                except Exception as e:
                    print(f"    ❌ LGB_tuned {test_year}: {e}")

    return results, raw_preds


# ─────────────────────────────────────────────────────────────
# 2D — SEGMENTATION & BUCKET DIAGNOSTICS
# ─────────────────────────────────────────────────────────────

def run_segmentation(
    df: pd.DataFrame,
    target_col: str,
    feature_cols: list[str],
    market: str,
    submarket: str,
    out: Path,
) -> dict:
    """
    Segment test-set performance by:
      - Confidence bucket (model probability quintiles)
      - Park run factor (top/bottom quartile)
      - Starting pitcher quality (ERA quintiles)
      - Season month
    
    Returns dict of segment → { metric → value }
    """
    seg_results = defaultdict(list)

    avail_feats = [c for c in feature_cols if c in df.columns]

    # Use 2025 as primary segmentation year (most recent)
    test_year = 2025
    train = df[df["season"] < test_year].copy()
    test = df[df["season"] == test_year].copy()

    if len(train) < 100 or len(test) < 50:
        return {}

    X_train = train[avail_feats].copy()
    y_train = train[target_col].values
    X_test = test[avail_feats].copy()
    y_test = test[target_col].values

    train_means = X_train.mean()
    X_train = X_train.fillna(train_means).fillna(0)
    X_test = X_test.fillna(train_means).fillna(0)

    # Train LightGBM
    try:
        model = lgb.LGBMClassifier(
            n_estimators=300, max_depth=5, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.7, min_child_samples=30,
            reg_alpha=0.1, reg_lambda=1.0, verbose=-1, random_state=42,
            force_col_wise=True,
        )
        model.fit(X_train.values, y_train)
        probs = model.predict_proba(X_test.values)[:, 1]
    except Exception:
        return {}

    test = test.copy()
    test["_prob"] = probs
    test["_target"] = y_test

    segments = {}

    # ── Confidence buckets (quintiles of predicted probability) ──
    try:
        test["_conf_bucket"] = pd.qcut(test["_prob"], 5, labels=["Q1_low", "Q2", "Q3", "Q4", "Q5_high"], duplicates="drop")
        for bucket in test["_conf_bucket"].unique():
            mask = test["_conf_bucket"] == bucket
            if mask.sum() < 20:
                continue
            y_b = test.loc[mask, "_target"].values
            p_b = test.loc[mask, "_prob"].values
            auc_b = roc_auc_score(y_b, p_b) if len(np.unique(y_b)) == 2 else 0.5
            brier_b = brier_score_loss(y_b, p_b)
            segments[f"conf_{bucket}"] = {
                "n": int(mask.sum()),
                "auc": round(auc_b, 4),
                "brier": round(brier_b, 4),
                "actual_rate": round(float(y_b.mean()), 4),
                "pred_mean": round(float(p_b.mean()), 4),
            }
    except Exception:
        pass

    # ── Park run factor (if available) ──
    if "park_run_factor" in test.columns:
        try:
            prf = test["park_run_factor"].fillna(test["park_run_factor"].median())
            test["_park_q"] = pd.qcut(prf, 3, labels=["low_park", "mid_park", "high_park"], duplicates="drop")
            for pq in test["_park_q"].unique():
                mask = test["_park_q"] == pq
                if mask.sum() < 30:
                    continue
                y_b = test.loc[mask, "_target"].values
                p_b = test.loc[mask, "_prob"].values
                auc_b = roc_auc_score(y_b, p_b) if len(np.unique(y_b)) == 2 else 0.5
                segments[f"park_{pq}"] = {
                    "n": int(mask.sum()),
                    "auc": round(auc_b, 4),
                    "actual_rate": round(float(y_b.mean()), 4),
                    "pred_mean": round(float(p_b.mean()), 4),
                }
        except Exception:
            pass

    # ── Month ──
    if "game_date" in test.columns:
        try:
            test["_month"] = test["game_date"].dt.month
            for m in sorted(test["_month"].dropna().unique()):
                mask = test["_month"] == m
                if mask.sum() < 30:
                    continue
                y_b = test.loc[mask, "_target"].values
                p_b = test.loc[mask, "_prob"].values
                auc_b = roc_auc_score(y_b, p_b) if len(np.unique(y_b)) == 2 else 0.5
                month_name = {3:"Mar",4:"Apr",5:"May",6:"Jun",7:"Jul",8:"Aug",9:"Sep",10:"Oct"}.get(int(m), str(m))
                segments[f"month_{month_name}"] = {
                    "n": int(mask.sum()),
                    "auc": round(auc_b, 4),
                    "actual_rate": round(float(y_b.mean()), 4),
                    "pred_mean": round(float(p_b.mean()), 4),
                }
        except Exception:
            pass

    return segments


# ─────────────────────────────────────────────────────────────
# 2E — GO / NO-GO VERDICT
# ─────────────────────────────────────────────────────────────

def compute_verdict_v2(results: list[EvalResult], submarket: str) -> tuple[str, str]:
    """
    Enhanced verdict with written rationale.
    Returns (verdict, rationale)
    """
    if not results:
        return "DEAD", "No results to evaluate"

    # Separate by model type, focus on 'all' feature group
    all_feat_results = [r for r in results if r.feature_group == "all"]

    best_model = None
    best_mean_auc = 0
    rationale_parts = []

    for model_type in ["LGB_tuned", "LightGBM", "LogReg"]:
        mr = [r for r in all_feat_results if r.model_name == model_type]
        if not mr:
            continue

        aucs = [r.auc for r in mr]
        mean_auc = np.mean(aucs)

        if mean_auc > best_mean_auc:
            best_mean_auc = mean_auc
            best_model = model_type

    if best_model is None:
        return "DEAD", "No model produced valid results"

    mr = [r for r in all_feat_results if r.model_name == best_model]
    aucs = [r.auc for r in mr]
    brier_skills = [r.brier_skill for r in mr]
    slopes = [r.cal_slope for r in mr if not np.isnan(r.cal_slope)]
    monos = [r.is_monotonic for r in mr]

    mean_auc = np.mean(aucs)
    max_auc = max(aucs)
    mean_brier_skill = np.mean(brier_skills)
    mean_slope = np.mean(slopes) if slopes else np.nan
    all_mono = all(monos)
    auc_std = np.std(aucs)

    rationale_parts.append(f"Best model: {best_model}")
    rationale_parts.append(f"Mean AUC: {mean_auc:.4f} (std: {auc_std:.4f})")
    rationale_parts.append(f"Best single-split AUC: {max_auc:.4f}")
    rationale_parts.append(f"Mean Brier Skill Score: {mean_brier_skill:.4f}")
    rationale_parts.append(f"Mean calibration slope: {mean_slope:.4f}")
    rationale_parts.append(f"All splits monotonic: {all_mono}")

    # Gates
    gate_auc_mean = mean_auc >= AUC_MEAN_MIN
    gate_auc_single = max_auc >= AUC_SINGLE_MIN
    gate_cal = CAL_SLOPE_LO <= mean_slope <= CAL_SLOPE_HI if not np.isnan(mean_slope) else False
    gate_brier = mean_brier_skill > BRIER_SKILL_MIN
    gate_mono = all_mono
    gate_stable = auc_std < 0.025  # AUC shouldn't swing wildly

    gates = {
        f"AUC mean ≥ {AUC_MEAN_MIN}": gate_auc_mean,
        f"AUC single ≥ {AUC_SINGLE_MIN}": gate_auc_single,
        f"Cal slope ∈ [{CAL_SLOPE_LO}, {CAL_SLOPE_HI}]": gate_cal,
        f"Brier skill > {BRIER_SKILL_MIN}": gate_brier,
        "Monotonic reliability": gate_mono,
        "AUC stability (std < 0.025)": gate_stable,
    }

    passed = sum(gates.values())
    total = len(gates)
    rationale_parts.append(f"\nGates passed: {passed}/{total}")
    for gate_name, passed_gate in gates.items():
        icon = "✅" if passed_gate else "❌"
        rationale_parts.append(f"  {icon} {gate_name}")

    # Decision logic
    if passed == total:
        verdict = "GREENLIGHT"
        rationale_parts.append("\n→ All gates passed. Ready for ROI backtest.")
    elif gate_auc_mean and gate_auc_single and (gate_brier or gate_mono):
        verdict = "CONDITIONAL"
        rationale_parts.append("\n→ Core AUC gates passed but calibration/stability issues remain.")
        rationale_parts.append("  Recommendation: Apply isotonic calibration and retest.")
    elif gate_auc_mean or (gate_auc_single and mean_auc >= 0.53):
        verdict = "WEAK_SIGNAL"
        rationale_parts.append("\n→ Marginal signal detected but insufficient for production.")
        rationale_parts.append("  Recommendation: Investigate feature engineering or data enrichment.")
    else:
        verdict = "DEAD"
        rationale_parts.append("\n→ No actionable signal. Do not pursue.")

    return verdict, "\n".join(rationale_parts)


# ─────────────────────────────────────────────────────────────
# PLOTTING (enhanced)
# ─────────────────────────────────────────────────────────────

def plot_reliability(results: list[EvalResult], raw_preds: dict, market: str, submarket: str, out: Path):
    """Reliability curve for one submarket across years."""
    rel_dir = out / "reliability_curves"
    rel_dir.mkdir(parents=True, exist_ok=True)

    fig, axes = plt.subplots(1, len(TEST_YEARS), figsize=(5 * len(TEST_YEARS), 4.5))
    if len(TEST_YEARS) == 1:
        axes = [axes]

    for i, year in enumerate(TEST_YEARS):
        ax = axes[i]
        ax.plot([0, 1], [0, 1], "k--", alpha=0.5, label="Perfect")

        if year in raw_preds:
            for model_name, data in raw_preds[year].items():
                if model_name.startswith("_"):
                    continue
                y_true, y_prob = data
                try:
                    pt, pp = calibration_curve(y_true, y_prob, n_bins=10, strategy="uniform")
                    ax.plot(pp, pt, "o-", label=model_name, markersize=4)
                except Exception:
                    pass

        ax.set_xlabel("Predicted probability")
        ax.set_ylabel("Observed frequency")
        ax.set_title(f"{market}/{submarket} — {year}")
        ax.legend(fontsize=7)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)

    plt.tight_layout()
    safe = f"{market}_{submarket}".replace("/", "_").replace(" ", "_")
    fig.savefig(rel_dir / f"{safe}.png", dpi=150)
    plt.close(fig)


def plot_auc_heatmap(all_results: list[EvalResult], out: Path):
    """Heatmap of AUC by submarket × year for top models."""
    if not all_results:
        return

    rdf = pd.DataFrame([asdict(r) for r in all_results])
    # Filter to 'all' feature group, best model per submarket
    rdf = rdf[rdf["feature_group"] == "all"]

    # Pivot: submarket × year → AUC (best model)
    best_per = rdf.groupby(["market", "submarket", "split_year"]).agg({"auc": "max"}).reset_index()
    pivot = best_per.pivot_table(index=["market", "submarket"], columns="split_year", values="auc")
    pivot["mean"] = pivot.mean(axis=1)
    pivot = pivot.sort_values("mean", ascending=False)

    fig, ax = plt.subplots(figsize=(8, max(4, len(pivot) * 0.4)))
    im = ax.imshow(pivot.values, aspect="auto", cmap="RdYlGn", vmin=0.48, vmax=0.60)

    ax.set_xticks(range(len(pivot.columns)))
    ax.set_xticklabels([str(c) for c in pivot.columns])
    ax.set_yticks(range(len(pivot.index)))
    labels = [f"{m}/{s}" for m, s in pivot.index]
    ax.set_yticklabels(labels, fontsize=7)

    # Annotate cells
    for i in range(len(pivot.index)):
        for j in range(len(pivot.columns)):
            val = pivot.values[i, j]
            if not np.isnan(val):
                ax.text(j, i, f"{val:.3f}", ha="center", va="center", fontsize=7,
                       color="white" if val < 0.52 else "black")

    plt.colorbar(im, ax=ax, label="AUC")
    ax.set_title("Phase 2 — AUC by Market/Submarket × Year (best model)")
    plt.tight_layout()
    fig.savefig(out / "auc_heatmap.png", dpi=150)
    plt.close(fig)


def plot_feature_importances(raw_preds: dict, market: str, submarket: str, out: Path):
    """Top-20 feature importances from LightGBM."""
    imp_dir = out / "feature_importances"
    imp_dir.mkdir(parents=True, exist_ok=True)

    # Collect importances from most recent year
    for year in reversed(TEST_YEARS):
        if year in raw_preds and "_lgb_importances" in raw_preds[year]:
            imps = raw_preds[year]["_lgb_importances"]
            top20 = sorted(imps.items(), key=lambda x: -x[1])[:20]
            if not top20:
                return

            names, vals = zip(*top20)
            fig, ax = plt.subplots(figsize=(8, 6))
            ax.barh(range(len(names)), vals, color="steelblue")
            ax.set_yticks(range(len(names)))
            ax.set_yticklabels(names, fontsize=8)
            ax.invert_yaxis()
            ax.set_xlabel("Feature Importance (split count)")
            ax.set_title(f"{market}/{submarket} — Top 20 Features ({year})")
            plt.tight_layout()

            safe = f"{market}_{submarket}".replace("/", "_").replace(" ", "_")
            fig.savefig(imp_dir / f"{safe}.png", dpi=150)
            plt.close(fig)
            return


# ─────────────────────────────────────────────────────────────
# MAIN ORCHESTRATOR
# ─────────────────────────────────────────────────────────────

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("  PHASE 2 — DEEP MARKET AUDIT")
    print("  F5 Totals | F5 Team Totals | NRFI/YRFI")
    print("  Walk-forward | No leakage | Enhanced metrics")
    print("=" * 70)
    print()

    # ── Load data ──
    print("Loading features…")
    df = load_features()
    print(f"  {len(df)} rows, {len(df.columns)} columns, seasons {sorted(df['season'].dropna().unique())}")
    print()

    # ══════════════════════════════════════════════════════════
    # PHASE 2A — Schema & Leakage
    # ══════════════════════════════════════════════════════════
    audit_df = run_phase2a(df, OUTPUT_DIR)

    # ══════════════════════════════════════════════════════════
    # PHASE 2B — NRFI Labels (fetch from MLB API)
    # ══════════════════════════════════════════════════════════
    nrfi_df = fetch_nrfi_labels(df, OUTPUT_DIR)

    # ══════════════════════════════════════════════════════════
    # PHASE 2C — Enhanced Modeling
    # ══════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  PHASE 2C — Enhanced Walk-Forward Modeling")
    print("=" * 70)

    all_results: list[EvalResult] = []
    all_raw_preds: dict = {}
    market_verdicts: dict = {}
    all_segments: dict = {}

    # ── Market 1: F5 Totals ──────────────────────────────────
    print("\n" + "─" * 60)
    print("  MARKET: F5 Totals (Over/Under)")
    print("─" * 60)

    for line in TOTAL_LINES:
        target_col = f"_target_total_over_{line}"
        df[target_col] = (df["label_f5_total"] > line).astype(int)

        pos_rate = df[target_col].mean()
        print(f"\n  [{f'over_{line}'}] base_rate={pos_rate:.3f}, n={len(df)}")

        if pos_rate < 0.05 or pos_rate > 0.95:
            print(f"    ⚠️ Extreme imbalance — skip")
            continue

        results, preds = train_and_eval_enhanced(
            df, target_col, FEATURE_COLS,
            "F5_Totals", f"over_{line}",
            run_ablation=(line == 4.5),  # only run ablation on the most common line
        )
        all_results.extend(results)
        all_raw_preds[f"F5_Totals/over_{line}"] = preds

        # Print results
        core = [r for r in results if r.feature_group == "all"]
        if core:
            print(f"\n    {'Model':<12} {'Year':<6} {'N':>5} {'AUC':>6} {'Brier':>7} {'BrierSk':>8} {'CalSlp':>7} {'Mono':>5}")
            print(f"    {'─'*12} {'─'*6} {'─'*5} {'─'*6} {'─'*7} {'─'*8} {'─'*7} {'─'*5}")
            for r in core:
                print(f"    {r.model_name:<12} {r.split_year:<6} {r.n_test:>5} {r.auc:>6.4f} {r.brier:>7.4f} {r.brier_skill:>8.4f} {r.cal_slope:>7.3f} {'  ✓' if r.is_monotonic else '  ✗':>5}")

        # Verdict
        verdict, rationale = compute_verdict_v2(core, f"over_{line}")
        market_verdicts[f"F5_Totals/over_{line}"] = {"verdict": verdict, "rationale": rationale}
        print(f"\n    ➤ VERDICT: {verdict}")

    # ── Market 2: F5 Team Totals ─────────────────────────────
    print("\n" + "─" * 60)
    print("  MARKET: F5 Team Totals")
    print("─" * 60)

    for side in ["home", "away"]:
        for line in TEAM_TOTAL_LINES:
            label_col = f"label_f5_{side}"
            target_col = f"_target_tt_{side}_over_{line}"
            df[target_col] = (df[label_col] > line).astype(int)

            pos_rate = df[target_col].mean()
            sub_name = f"{side}_over_{line}"
            print(f"\n  [{sub_name}] base_rate={pos_rate:.3f}, n={len(df)}")

            if pos_rate < 0.05 or pos_rate > 0.95:
                print(f"    ⚠️ Extreme imbalance — skip")
                continue

            results, preds = train_and_eval_enhanced(
                df, target_col, FEATURE_COLS,
                "F5_TeamTotals", sub_name,
                run_ablation=False,
            )
            all_results.extend(results)
            all_raw_preds[f"F5_TeamTotals/{sub_name}"] = preds

            core = [r for r in results if r.feature_group == "all"]
            if core:
                print(f"\n    {'Model':<12} {'Year':<6} {'N':>5} {'AUC':>6} {'Brier':>7} {'BrierSk':>8} {'CalSlp':>7} {'Mono':>5}")
                print(f"    {'─'*12} {'─'*6} {'─'*5} {'─'*6} {'─'*7} {'─'*8} {'─'*7} {'─'*5}")
                for r in core:
                    print(f"    {r.model_name:<12} {r.split_year:<6} {r.n_test:>5} {r.auc:>6.4f} {r.brier:>7.4f} {r.brier_skill:>8.4f} {r.cal_slope:>7.3f} {'  ✓' if r.is_monotonic else '  ✗':>5}")

            verdict, rationale = compute_verdict_v2(core, sub_name)
            market_verdicts[f"F5_TeamTotals/{sub_name}"] = {"verdict": verdict, "rationale": rationale}
            print(f"\n    ➤ VERDICT: {verdict}")

    # ── Market 3: NRFI / YRFI ────────────────────────────────
    print("\n" + "─" * 60)
    print("  MARKET: NRFI / YRFI")
    print("─" * 60)

    if nrfi_df.empty:
        print("  ⛔ NRFI labels not available — marking as NOT EVALUABLE")
        market_verdicts["NRFI"] = {
            "verdict": "NOT_EVALUABLE",
            "rationale": "Could not fetch first-inning scoring data from MLB Stats API. "
                         "No first-inning labels exist in features_v2.parquet.",
        }
    else:
        # Merge NRFI labels with features
        nrfi_df["game_pk"] = nrfi_df["game_pk"].astype(float)
        df_nrfi = df.merge(nrfi_df[["game_pk", "nrfi", "first_inning_total"]], on="game_pk", how="inner")
        print(f"  Merged: {len(df_nrfi)} games with NRFI labels (out of {len(df)} total)")
        print(f"  NRFI rate: {df_nrfi['nrfi'].mean():.3f}")
        print(f"  Seasons: {sorted(df_nrfi['season'].unique())}")

        if len(df_nrfi) < 500:
            print("  ⚠️ Too few merged games — skipping NRFI")
            market_verdicts["NRFI"] = {
                "verdict": "NOT_EVALUABLE",
                "rationale": f"Only {len(df_nrfi)} games matched after merge — insufficient for walk-forward.",
            }
        else:
            # NRFI binary target
            target_col = "nrfi"
            pos_rate = df_nrfi[target_col].mean()
            print(f"  NRFI base rate: {pos_rate:.3f}")

            results, preds = train_and_eval_enhanced(
                df_nrfi, target_col, FEATURE_COLS,
                "NRFI", "nrfi",
                run_ablation=True,
            )
            all_results.extend(results)
            all_raw_preds["NRFI/nrfi"] = preds

            core = [r for r in results if r.feature_group == "all"]
            if core:
                print(f"\n    {'Model':<12} {'Year':<6} {'N':>5} {'AUC':>6} {'Brier':>7} {'BrierSk':>8} {'CalSlp':>7} {'Mono':>5}")
                print(f"    {'─'*12} {'─'*6} {'─'*5} {'─'*6} {'─'*7} {'─'*8} {'─'*7} {'─'*5}")
                for r in core:
                    print(f"    {r.model_name:<12} {r.split_year:<6} {r.n_test:>5} {r.auc:>6.4f} {r.brier:>7.4f} {r.brier_skill:>8.4f} {r.cal_slope:>7.3f} {'  ✓' if r.is_monotonic else '  ✗':>5}")

            verdict, rationale = compute_verdict_v2(core, "nrfi")
            market_verdicts["NRFI/nrfi"] = {"verdict": verdict, "rationale": rationale}
            print(f"\n    ➤ VERDICT: {verdict}")

            # Also evaluate YRFI (inverse)
            df_nrfi["yrfi"] = 1 - df_nrfi["nrfi"]
            results_yrfi, preds_yrfi = train_and_eval_enhanced(
                df_nrfi, "yrfi", FEATURE_COLS,
                "YRFI", "yrfi",
                run_ablation=False,
            )
            all_results.extend(results_yrfi)
            all_raw_preds["YRFI/yrfi"] = preds_yrfi

            core_yrfi = [r for r in results_yrfi if r.feature_group == "all"]
            if core_yrfi:
                print(f"\n    YRFI Results:")
                print(f"    {'Model':<12} {'Year':<6} {'N':>5} {'AUC':>6} {'Brier':>7} {'BrierSk':>8} {'CalSlp':>7} {'Mono':>5}")
                print(f"    {'─'*12} {'─'*6} {'─'*5} {'─'*6} {'─'*7} {'─'*8} {'─'*7} {'─'*5}")
                for r in core_yrfi:
                    print(f"    {r.model_name:<12} {r.split_year:<6} {r.n_test:>5} {r.auc:>6.4f} {r.brier:>7.4f} {r.brier_skill:>8.4f} {r.cal_slope:>7.3f} {'  ✓' if r.is_monotonic else '  ✗':>5}")

            verdict_yrfi, rationale_yrfi = compute_verdict_v2(core_yrfi, "yrfi")
            market_verdicts["YRFI/yrfi"] = {"verdict": verdict_yrfi, "rationale": rationale_yrfi}
            print(f"\n    ➤ YRFI VERDICT: {verdict_yrfi}")

    # ══════════════════════════════════════════════════════════
    # PHASE 2D — SEGMENTATION
    # ══════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  PHASE 2D — Segmentation & Bucket Diagnostics")
    print("=" * 70)

    # Run segmentation on most promising submarkets
    seg_targets = [
        ("F5_Totals", "over_4.5", "_target_total_over_4.5"),
        ("F5_Totals", "over_5.0", "_target_total_over_5.0"),
        ("F5_TeamTotals", "away_over_1.5", "_target_tt_away_over_1.5"),
        ("F5_TeamTotals", "away_over_2.0", "_target_tt_away_over_2.0"),
    ]

    # Add NRFI if available
    if not nrfi_df.empty and len(df_nrfi) >= 500:
        seg_targets.append(("NRFI", "nrfi", "nrfi"))

    for mkt, sub, tgt in seg_targets:
        if mkt in ["NRFI", "YRFI"]:
            seg_df = df_nrfi
        else:
            seg_df = df
        if tgt not in seg_df.columns:
            continue

        print(f"\n  Segmenting {mkt}/{sub}…")
        segs = run_segmentation(seg_df, tgt, FEATURE_COLS, mkt, sub, OUTPUT_DIR)
        all_segments[f"{mkt}/{sub}"] = segs

        if segs:
            print(f"    {'Segment':<25} {'N':>5} {'AUC':>6} {'Actual':>8} {'Pred':>8}")
            print(f"    {'─'*25} {'─'*5} {'─'*6} {'─'*8} {'─'*8}")
            for seg_name, seg_data in sorted(segs.items()):
                print(f"    {seg_name:<25} {seg_data['n']:>5} {seg_data['auc']:>6.4f} {seg_data['actual_rate']:>8.4f} {seg_data.get('pred_mean', 0):>8.4f}")

    # ══════════════════════════════════════════════════════════
    # SAVE ARTIFACTS
    # ══════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  SAVING ARTIFACTS")
    print("=" * 70)

    # 1. Full diagnostics CSV
    if all_results:
        rdf = pd.DataFrame([asdict(r) for r in all_results])
        rdf.to_csv(OUTPUT_DIR / "phase2_diagnostics.csv", index=False)
        print(f"  ✅ phase2_diagnostics.csv ({len(rdf)} rows)")

    # 2. Reliability curves
    for key, preds in all_raw_preds.items():
        parts = key.split("/")
        plot_reliability(all_results, preds, parts[0], parts[1] if len(parts) > 1 else "", OUTPUT_DIR)
        plot_feature_importances(preds, parts[0], parts[1] if len(parts) > 1 else "", OUTPUT_DIR)
    print(f"  ✅ reliability_curves/ + feature_importances/")

    # 3. AUC heatmap
    plot_auc_heatmap(all_results, OUTPUT_DIR)
    print(f"  ✅ auc_heatmap.png")

    # 4. Segmentation report
    if all_segments:
        seg_rows = []
        for mkt_sub, segs in all_segments.items():
            for seg_name, seg_data in segs.items():
                seg_rows.append({"market_sub": mkt_sub, "segment": seg_name, **seg_data})
        seg_df_out = pd.DataFrame(seg_rows)
        seg_df_out.to_csv(OUTPUT_DIR / "segmentation_diagnostics.csv", index=False)
        print(f"  ✅ segmentation_diagnostics.csv ({len(seg_df_out)} rows)")

    # 5. Final GO/NO-GO report
    write_final_report(all_results, market_verdicts, all_segments, OUTPUT_DIR)
    print(f"  ✅ phase2_go_nogo_report.md")

    # ══════════════════════════════════════════════════════════
    # FINAL SUMMARY
    # ══════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  PHASE 2 — FINAL MARKET VERDICTS")
    print("=" * 70)
    print()

    icons = {"GREENLIGHT": "🟢", "CONDITIONAL": "🟡", "WEAK_SIGNAL": "🟠", "DEAD": "🔴", "NOT_EVALUABLE": "⬜"}
    for mkt, info in sorted(market_verdicts.items()):
        v = info["verdict"]
        print(f"  {icons.get(v, '?')} {mkt:<35} {v}")

    print(f"\n  Output saved to: {OUTPUT_DIR.resolve()}")
    print("=" * 70)


# ─────────────────────────────────────────────────────────────
# FINAL REPORT
# ─────────────────────────────────────────────────────────────

def write_final_report(
    results: list[EvalResult],
    verdicts: dict,
    segments: dict,
    out: Path,
):
    lines = [
        "# Phase 2 — Deep Market Audit: GO / NO-GO Report\n",
        f"**Generated:** {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')}",
        f"**Method:** Walk-forward (train ≤ year N-1, test year N)",
        f"**Models:** LogisticRegression, LightGBM (default), LightGBM (tuned)",
        f"**Test Years:** {TEST_YEARS}",
        f"**Feature set:** {len(FEATURE_COLS)} production features",
        "",
        "## Critical Data Limitations\n",
        "| Data Type | Available? | Impact |",
        "|-----------|------------|--------|",
        "| F5 scoring labels | ✅ Yes | Can build F5 Totals & Team Totals targets |",
        "| F5 Totals odds (market baseline) | ❌ No | Cannot compute Δ vs market implied prob |",
        "| F5 Team Totals odds | ❌ No | Cannot compute Δ vs market implied prob |",
        "| First-inning scoring (NRFI labels) | ⚠️ Fetched from API | Required MLB Stats API linescore fetch |",
        "| NRFI/YRFI odds | ❌ No | Cannot compute Δ vs market implied prob |",
        "| TheOddsAPI `totals_1st_5_innings` | ✅ Available for future | Not yet fetched; add to collection pipeline |",
        "",
        "**Without market odds, we evaluate model quality in absolute terms only.**",
        "**A model that beats base-rate Brier and shows AUC > 0.54 still needs market odds to confirm edge.**\n",
    ]

    # GO / NO-GO thresholds
    lines.append("## GO / NO-GO Gates (Phase 2)\n")
    lines.append(f"| Gate | Threshold |")
    lines.append(f"|------|-----------|")
    lines.append(f"| Mean AUC | ≥ {AUC_MEAN_MIN} |")
    lines.append(f"| Best single-split AUC | ≥ {AUC_SINGLE_MIN} |")
    lines.append(f"| Calibration slope | ∈ [{CAL_SLOPE_LO}, {CAL_SLOPE_HI}] |")
    lines.append(f"| Brier Skill Score | > {BRIER_SKILL_MIN} |")
    lines.append(f"| Reliability monotonic | Yes |")
    lines.append(f"| AUC stability (std) | < 0.025 |")
    lines.append("")

    # Verdicts summary table
    lines.append("## Market Verdicts\n")
    lines.append("| Market/Submarket | Verdict | Mean AUC | Best AUC | Brier Skill |")
    lines.append("|------------------|---------|----------|----------|-------------|")

    if results:
        rdf = pd.DataFrame([asdict(r) for r in results])
        rdf_core = rdf[rdf["feature_group"] == "all"]

        for mkt_sub, info in sorted(verdicts.items()):
            v = info["verdict"]
            icon = {"GREENLIGHT": "🟢", "CONDITIONAL": "🟡", "WEAK_SIGNAL": "🟠", "DEAD": "🔴", "NOT_EVALUABLE": "⬜"}.get(v, "?")

            if "/" in mkt_sub:
                mkt, sub = mkt_sub.split("/", 1)
            else:
                mkt, sub = mkt_sub, ""

            mask = (rdf_core["market"] == mkt) & (rdf_core["submarket"] == sub)
            sub_df = rdf_core[mask]

            if not sub_df.empty:
                best_model_aucs = sub_df.groupby("model_name")["auc"].mean()
                best_model = best_model_aucs.idxmax()
                best_rows = sub_df[sub_df["model_name"] == best_model]

                mean_auc = best_rows["auc"].mean()
                best_auc = best_rows["auc"].max()
                mean_bs = best_rows["brier_skill"].mean()
                lines.append(f"| {icon} {mkt_sub} | **{v}** | {mean_auc:.4f} | {best_auc:.4f} | {mean_bs:.4f} |")
            else:
                lines.append(f"| {icon} {mkt_sub} | **{v}** | N/A | N/A | N/A |")

    # Detailed rationale per market
    lines.append("\n## Detailed Verdicts\n")
    for mkt_sub, info in sorted(verdicts.items()):
        lines.append(f"### {mkt_sub}\n")
        lines.append(f"**Verdict:** {info['verdict']}\n")
        lines.append("```")
        lines.append(info["rationale"])
        lines.append("```\n")

    # Segmentation highlights
    if segments:
        lines.append("## Segmentation Highlights\n")
        for mkt_sub, segs in sorted(segments.items()):
            if not segs:
                continue
            lines.append(f"### {mkt_sub}\n")
            lines.append("| Segment | N | AUC | Actual Rate | Pred Mean |")
            lines.append("|---------|---|-----|-------------|-----------|")
            for seg_name, seg_data in sorted(segs.items()):
                lines.append(
                    f"| {seg_name} | {seg_data['n']} | {seg_data['auc']:.4f} | "
                    f"{seg_data['actual_rate']:.4f} | {seg_data.get('pred_mean', 0):.4f} |"
                )
            lines.append("")

    # Phase 2F: ROI backtest plan (only if anything greenlit)
    greenlights = [k for k, v in verdicts.items() if v["verdict"] == "GREENLIGHT"]
    conditionals = [k for k, v in verdicts.items() if v["verdict"] == "CONDITIONAL"]

    lines.append("## Phase 2F — ROI Backtest Plan\n")
    if greenlights:
        lines.append("### Greenlighted Markets\n")
        for m in greenlights:
            lines.append(f"- **{m}**: Ready for flat-stake backtest with closing odds")
        lines.append("")
        lines.append("**Prerequisites for ROI backtest:**")
        lines.append("1. Add `totals_1st_5_innings` to TheOddsAPI collection pipeline")
        lines.append("2. Collect 1+ season of closing odds for market baseline comparison")
        lines.append("3. Build line-specific models (e.g., over 4.5 at closing line of 4.5)")
        lines.append("4. Apply isotonic calibration")
        lines.append("5. Define threshold: only bet when model prob - implied prob > X%")
        lines.append("6. Simulate with flat $100 stake, track yield %")
    elif conditionals:
        lines.append("### Conditional Markets (Need Odds Data First)\n")
        for m in conditionals:
            lines.append(f"- **{m}**: Shows signal but cannot proceed without market odds")
        lines.append("")
        lines.append("**Next steps:**")
        lines.append("1. Add `totals_1st_5_innings` and `h2h_1st_1_innings` to odds collection")
        lines.append("2. After 1 month of odds data, re-run this audit with market baseline")
        lines.append("3. If model prob beats market implied prob in MAE/Brier, proceed to ROI backtest")
    else:
        lines.append("**No markets qualified for ROI backtest.** All F5 secondary markets show insufficient")
        lines.append("predictive signal with current features. Consider:")
        lines.append("1. Adding derived features: matchup-specific pitcher-vs-lineup stats")
        lines.append("2. Adding weather data (temperature, wind strongly affect run scoring)")
        lines.append("3. Adding bullpen workload features (for F5 the SP is most important, but bullpen may matter in late innings)")
        lines.append("4. Revisiting NRFI with pitcher first-inning-specific stats")

    lines.append("\n\n---\n")
    lines.append(f"*Report generated by phase2_deep_audit.py on {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')}*")

    (out / "phase2_go_nogo_report.md").write_text("\n".join(lines))


if __name__ == "__main__":
    main()
