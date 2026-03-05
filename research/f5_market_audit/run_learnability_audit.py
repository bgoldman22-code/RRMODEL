#!/usr/bin/env python3
"""
F5 Market Learnability Audit
=============================
Statistical learnability audit for MLB F5 betting markets.
NO ROI evaluation — purely statistical signal detection.

Markets evaluated:
  1. F5 Moneyline (baseline, already validated)
  2. F5 Run Line (-0.5, +0.5)
  3. F5 Totals (Over/Under)
  4. F5 Team Totals (Home TT, Away TT)
  5. NRFI / YRFI

All evaluations are TRUE WALK-FORWARD:
  - Train on seasons ≤ year N-1
  - Test on year N
  - Evaluate separately for 2023, 2024, 2025

GO/NO-GO gates:
  - Mean AUC ≥ 0.55 across splits
  - At least one split AUC ≥ 0.57
  - MAE improves vs market implied probability
  - Calibration slope ∈ [0.85, 1.15]
  - Reliability curve is monotonic
"""

from __future__ import annotations

import json
import os
import sys
import warnings
from pathlib import Path
from dataclasses import dataclass, field

import lightgbm as lgb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, mean_absolute_error, roc_auc_score
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

# ─────────────────────────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────────────────────────
REPO_ROOT   = Path(__file__).parent.parent.parent
FEATURES_PQ = REPO_ROOT / "data" / "mlb_research" / "features" / "features_v2.parquet"
ODDS_DIR    = REPO_ROOT / "data" / "mlb_research" / "derived" / "f5_ml"
ARTIFACTS   = REPO_ROOT / "ml" / "f5_ml" / "artifacts"
OUTPUT_DIR  = Path(__file__).parent / "output"

# Feature list from production model
FEATURE_COLS = json.loads((ARTIFACTS / "features.json").read_text())

# Walk-forward splits: train on ≤ year-1, test on year
TEST_YEARS = [2023, 2024, 2025]

# GO / NO-GO thresholds
AUC_MEAN_MIN     = 0.55
AUC_SINGLE_MIN   = 0.57
CAL_SLOPE_LO     = 0.85
CAL_SLOPE_HI     = 1.15

# Totals lines to evaluate
TOTAL_LINES = [3.5, 4.0, 4.5, 5.0, 5.5]
TEAM_TOTAL_LINES = [1.5, 2.0, 2.5, 3.0]


# ─────────────────────────────────────────────────────────────
# DATA LOADING
# ─────────────────────────────────────────────────────────────

def load_features() -> pd.DataFrame:
    """Load feature matrix with basic cleaning."""
    df = pd.read_parquet(FEATURES_PQ)
    df["season"] = df["season"].astype(float)
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    return df


def load_odds() -> pd.DataFrame:
    """Load and concat all consensus odds parquets, return implied probs per game."""
    frames = []
    for pq in sorted(ODDS_DIR.glob("consensus_*.parquet")):
        frames.append(pd.read_parquet(pq))
    if not frames:
        print("WARNING: No consensus odds parquets found — market baseline unavailable")
        return pd.DataFrame()
    odds = pd.concat(frames, ignore_index=True)
    odds["game_pk"] = odds["game_pk"].astype(float)
    return odds


def get_implied_prob(odds_df: pd.DataFrame, game_pk: float, side: str) -> float:
    """Get no-vig implied probability for a specific game/side."""
    if odds_df.empty:
        return np.nan
    mask = (odds_df["game_pk"] == game_pk) & (odds_df["bet_side"].str.lower().str.strip() == side.lower())
    rows = odds_df[mask]
    if rows.empty:
        return np.nan
    return float(rows.iloc[0].get("implied_prob_novig", np.nan))


# ─────────────────────────────────────────────────────────────
# METRICS
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
    mae_market: float  # MAE of market implied prob
    mae_gain: float    # mae_market - mae (positive = model better)
    brier: float
    brier_market: float
    cal_slope: float
    cal_intercept: float
    is_monotonic: bool


def compute_calibration_slope(y_true: np.ndarray, y_prob: np.ndarray) -> tuple[float, float]:
    """Fit logistic calibration: log-odds(y) ~ a * log-odds(p) + b. Return (slope, intercept)."""
    from sklearn.linear_model import LogisticRegression as LR
    eps = 1e-6
    p_clipped = np.clip(y_prob, eps, 1 - eps)
    log_odds = np.log(p_clipped / (1 - p_clipped)).reshape(-1, 1)
    try:
        cal_lr = LR(solver="lbfgs", max_iter=1000)
        cal_lr.fit(log_odds, y_true)
        slope = float(cal_lr.coef_[0][0])
        intercept = float(cal_lr.intercept_[0])
    except Exception:
        slope, intercept = np.nan, np.nan
    return slope, intercept


def check_monotonic(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 5) -> bool:
    """Check if reliability curve is (roughly) monotonic."""
    try:
        prob_true, prob_pred = calibration_curve(y_true, y_prob, n_bins=n_bins, strategy="uniform")
        if len(prob_true) < 3:
            return True  # too few bins to judge
        # Allow at most 1 non-monotonic step
        diffs = np.diff(prob_true)
        violations = np.sum(diffs < -0.02)  # allow tiny noise
        return violations <= 1
    except Exception:
        return False


def evaluate_model(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    market_prob: np.ndarray,
    market: str,
    submarket: str,
    model_name: str,
    split_year: int,
) -> EvalResult:
    """Compute full diagnostics for one model/split."""
    n = len(y_true)
    auc = roc_auc_score(y_true, y_prob) if len(np.unique(y_true)) == 2 else 0.5
    mae = mean_absolute_error(y_true, y_prob)
    brier = brier_score_loss(y_true, y_prob)

    # Market baseline
    valid_market = ~np.isnan(market_prob)
    if valid_market.sum() > 0:
        mae_mkt = mean_absolute_error(y_true[valid_market], market_prob[valid_market])
        brier_mkt = brier_score_loss(y_true[valid_market], market_prob[valid_market])
    else:
        mae_mkt = np.nan
        brier_mkt = np.nan

    slope, intercept = compute_calibration_slope(y_true, y_prob)
    mono = check_monotonic(y_true, y_prob)

    return EvalResult(
        market=market,
        submarket=submarket,
        model_name=model_name,
        split_year=split_year,
        n_test=n,
        auc=round(auc, 4),
        mae=round(mae, 4),
        mae_market=round(mae_mkt, 4) if not np.isnan(mae_mkt) else np.nan,
        mae_gain=round(mae_mkt - mae, 4) if not np.isnan(mae_mkt) else np.nan,
        brier=round(brier, 4),
        brier_market=round(brier_mkt, 4) if not np.isnan(brier_mkt) else np.nan,
        cal_slope=round(slope, 4),
        cal_intercept=round(intercept, 4),
        is_monotonic=mono,
    )


# ─────────────────────────────────────────────────────────────
# WALK-FORWARD TRAINING
# ─────────────────────────────────────────────────────────────

def train_and_eval(
    df: pd.DataFrame,
    target_col: str,
    feature_cols: list[str],
    odds_df: pd.DataFrame,
    market: str,
    submarket: str,
    market_prob_fn=None,
) -> list[EvalResult]:
    """
    Walk-forward train/eval across TEST_YEARS.
    Returns list of EvalResult for each model × split.
    """
    results = []

    for test_year in TEST_YEARS:
        # Split
        train = df[df["season"] < test_year].copy()
        test = df[df["season"] == test_year].copy()

        if len(train) < 100 or len(test) < 50:
            print(f"    ⚠️  {market}/{submarket} year={test_year}: train={len(train)}, test={len(test)} — SKIP")
            continue

        # Prepare features
        avail_feats = [c for c in feature_cols if c in df.columns]
        X_train = train[avail_feats].copy()
        y_train = train[target_col].values
        X_test = test[avail_feats].copy()
        y_test = test[target_col].values

        # Fill NaNs with column means from training
        train_means = X_train.mean()
        X_train = X_train.fillna(train_means).fillna(0)
        X_test = X_test.fillna(train_means).fillna(0)

        # Market implied probs for baseline
        if market_prob_fn is not None:
            market_probs = np.array([market_prob_fn(row, odds_df) for _, row in test.iterrows()])
        else:
            market_probs = np.full(len(test), np.nan)

        # ── LogisticRegression ──
        scaler = StandardScaler()
        X_tr_s = scaler.fit_transform(X_train.values)
        X_te_s = scaler.transform(X_test.values)

        try:
            lr = LogisticRegression(max_iter=2000, C=1.0, solver="lbfgs")
            lr.fit(X_tr_s, y_train)
            lr_probs = lr.predict_proba(X_te_s)[:, 1]
            results.append(evaluate_model(
                y_test, lr_probs, market_probs,
                market, submarket, "LogReg", test_year,
            ))
        except Exception as e:
            print(f"    ❌ LogReg {test_year}: {e}")

        # ── LightGBM ──
        try:
            lgb_model = lgb.LGBMClassifier(
                n_estimators=300,
                max_depth=5,
                learning_rate=0.05,
                subsample=0.8,
                colsample_bytree=0.7,
                min_child_samples=30,
                reg_alpha=0.1,
                reg_lambda=1.0,
                verbose=-1,
                random_state=42,
                force_col_wise=True,
            )
            lgb_model.fit(X_train.values, y_train)
            lgb_probs = lgb_model.predict_proba(X_test.values)[:, 1]
            results.append(evaluate_model(
                y_test, lgb_probs, market_probs,
                market, submarket, "LightGBM", test_year,
            ))
        except Exception as e:
            print(f"    ❌ LightGBM {test_year}: {e}")

    return results


# ─────────────────────────────────────────────────────────────
# MARKET DEFINITIONS
# ─────────────────────────────────────────────────────────────

def build_market_datasets(df: pd.DataFrame) -> dict[str, dict]:
    """
    Build target labels for each market.
    Returns dict of market_key → { 'submarkets': { sub_key: { 'df': DataFrame, 'target': col_name, 'market_prob_fn': callable } } }
    """
    markets = {}

    # ── 1. F5 MONEYLINE (baseline) ──────────────────────────
    ml_df = df.dropna(subset=["label_f5_home_win"]).copy()
    ml_df["target_f5_ml"] = ml_df["label_f5_home_win"].astype(int)
    markets["F5_Moneyline"] = {
        "submarkets": {
            "home_win": {
                "df": ml_df,
                "target": "target_f5_ml",
                "market_prob_fn": lambda row, odds: get_implied_prob(odds, float(row["game_pk"]), "home"),
            }
        }
    }

    # ── 2. F5 RUN LINE ──────────────────────────────────────
    # -0.5: home must win by 1+ (home F5 > away F5)
    # +0.5: home must not lose by 2+ (home F5 >= away F5, i.e. win or tie)
    rl_df = df.copy()
    rl_df["target_rl_minus_0.5"] = (rl_df["label_f5_home"] > rl_df["label_f5_away"]).astype(int)
    rl_df["target_rl_plus_0.5"] = (rl_df["label_f5_home"] >= rl_df["label_f5_away"]).astype(int)

    markets["F5_RunLine"] = {
        "submarkets": {
            "home_-0.5": {
                "df": rl_df,
                "target": "target_rl_minus_0.5",
                "market_prob_fn": None,  # No odds for run line in our data
            },
            "home_+0.5": {
                "df": rl_df,
                "target": "target_rl_plus_0.5",
                "market_prob_fn": None,
            },
        }
    }

    # ── 3. F5 TOTALS (OVER/UNDER) ───────────────────────────
    tot_subs = {}
    for line in TOTAL_LINES:
        col = f"target_f5_total_over_{line}"
        df[col] = (df["label_f5_total"] > line).astype(int)
        line_df = df.copy()
        tot_subs[f"over_{line}"] = {
            "df": line_df,
            "target": col,
            "market_prob_fn": None,
        }
    markets["F5_Totals"] = {"submarkets": tot_subs}

    # ── 4. F5 TEAM TOTALS ───────────────────────────────────
    tt_subs = {}
    for line in TEAM_TOTAL_LINES:
        col_h = f"target_f5_home_tt_over_{line}"
        col_a = f"target_f5_away_tt_over_{line}"
        df[col_h] = (df["label_f5_home"] > line).astype(int)
        df[col_a] = (df["label_f5_away"] > line).astype(int)
        tt_subs[f"home_over_{line}"] = {"df": df.copy(), "target": col_h, "market_prob_fn": None}
        tt_subs[f"away_over_{line}"] = {"df": df.copy(), "target": col_a, "market_prob_fn": None}
    markets["F5_TeamTotals"] = {"submarkets": tt_subs}

    # ── 5. NRFI / YRFI ──────────────────────────────────────
    # First-inning run = either team scores in the 1st
    # We don't have inning-level data, so we CANNOT build this market
    # Mark as NOT EVALUABLE
    markets["NRFI_YRFI"] = {
        "submarkets": {},
        "not_evaluable": True,
        "reason": "No first-inning scoring data available in features_v2.parquet. "
                  "Labels only contain label_f5_home, label_f5_away (5-inning totals), "
                  "not inning-by-inning breakdowns. NRFI/YRFI requires play-by-play or "
                  "inning-level scoring data that must be collected separately.",
    }

    return markets


# ─────────────────────────────────────────────────────────────
# VERDICT LOGIC
# ─────────────────────────────────────────────────────────────

def compute_verdict(results: list[EvalResult]) -> str:
    """Determine GO / NO-GO for a market based on all model results."""
    if not results:
        return "DEAD"

    # Use best model type's results
    for model_type in ["LightGBM", "LogReg"]:
        model_results = [r for r in results if r.model_name == model_type]
        if not model_results:
            continue

        aucs = [r.auc for r in model_results]
        mean_auc = np.mean(aucs)
        max_auc = max(aucs)
        slopes = [r.cal_slope for r in model_results if not np.isnan(r.cal_slope)]
        mean_slope = np.mean(slopes) if slopes else np.nan
        mono_all = all(r.is_monotonic for r in model_results)
        mae_gains = [r.mae_gain for r in model_results if r.mae_gain is not None and not np.isnan(r.mae_gain)]
        mean_mae_gain = np.mean(mae_gains) if mae_gains else np.nan

        # Check gates
        gate_auc_mean = mean_auc >= AUC_MEAN_MIN
        gate_auc_single = max_auc >= AUC_SINGLE_MIN
        gate_cal_slope = CAL_SLOPE_LO <= mean_slope <= CAL_SLOPE_HI if not np.isnan(mean_slope) else False
        gate_monotonic = mono_all
        gate_mae = mean_mae_gain > 0 if not np.isnan(mean_mae_gain) else True  # pass if no market baseline

        if gate_auc_mean and gate_auc_single and gate_cal_slope and gate_monotonic:
            if gate_mae:
                return "GREENLIGHT"
            else:
                return "CONDITIONAL"
        elif gate_auc_mean and gate_auc_single:
            return "CONDITIONAL"

    return "DEAD"


# ─────────────────────────────────────────────────────────────
# PLOTTING
# ─────────────────────────────────────────────────────────────

def plot_reliability_curves(results: list[EvalResult], all_data: dict, output_dir: Path):
    """Save reliability curve plots for each market/submarket."""
    rel_dir = output_dir / "reliability_curves"
    rel_dir.mkdir(parents=True, exist_ok=True)

    for key, data in all_data.items():
        fig, axes = plt.subplots(1, len(TEST_YEARS), figsize=(5 * len(TEST_YEARS), 4.5))
        if len(TEST_YEARS) == 1:
            axes = [axes]

        for i, (year, info) in enumerate(sorted(data.items())):
            ax = axes[i]
            ax.plot([0, 1], [0, 1], "k--", alpha=0.5, label="Perfect")

            for model_name, (y_true, y_prob) in info.items():
                try:
                    prob_true, prob_pred = calibration_curve(y_true, y_prob, n_bins=10, strategy="uniform")
                    ax.plot(prob_pred, prob_true, "o-", label=model_name, markersize=4)
                except Exception:
                    pass

            ax.set_xlabel("Predicted probability")
            ax.set_ylabel("Observed frequency")
            ax.set_title(f"{key} — {year}")
            ax.legend(fontsize=8)
            ax.set_xlim(0, 1)
            ax.set_ylim(0, 1)

        plt.tight_layout()
        safe_name = key.replace("/", "_").replace(" ", "_")
        fig.savefig(rel_dir / f"{safe_name}.png", dpi=150)
        plt.close(fig)


def plot_auc_trends(results: list[EvalResult], output_dir: Path):
    """Bar chart of AUC by market/submarket across seasons."""
    if not results:
        return

    rdf = pd.DataFrame([r.__dict__ for r in results])

    # One plot per market
    for market in rdf["market"].unique():
        mdf = rdf[rdf["market"] == market]
        submarkets = mdf["submarket"].unique()
        models = mdf["model_name"].unique()

        fig, axes = plt.subplots(1, len(submarkets), figsize=(6 * len(submarkets), 5), squeeze=False)

        for j, sub in enumerate(submarkets):
            ax = axes[0, j]
            sdf = mdf[mdf["submarket"] == sub]

            for model in models:
                msdf = sdf[sdf["model_name"] == model]
                ax.bar(
                    [str(y) for y in msdf["split_year"]],
                    msdf["auc"],
                    alpha=0.7,
                    label=model,
                    width=0.35 if model == "LogReg" else 0.35,
                )
                # Offset bars
                if model == "LightGBM":
                    positions = list(range(len(msdf)))
                    ax.bar(
                        [str(y) + " " for y in msdf["split_year"]],
                        msdf["auc"].values,
                        alpha=0.7, label=None, width=0.35
                    )

            ax.axhline(y=AUC_MEAN_MIN, color="r", linestyle="--", alpha=0.5, label=f"Min AUC={AUC_MEAN_MIN}")
            ax.set_ylabel("AUC")
            ax.set_title(f"{market} / {sub}")
            ax.legend(fontsize=8)
            ax.set_ylim(0.45, 0.75)

        plt.tight_layout()
        fig.savefig(output_dir / f"auc_trends_{market}.png", dpi=150)
        plt.close(fig)


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "reliability_curves").mkdir(exist_ok=True)
    (OUTPUT_DIR / "calibration_plots").mkdir(exist_ok=True)

    print("=" * 70)
    print("  F5 MARKET LEARNABILITY AUDIT")
    print("  Walk-forward | No leakage | No ROI")
    print("=" * 70)
    print()

    # Load data
    print("Loading features…")
    df = load_features()
    print(f"  {len(df)} rows, {len(df.columns)} columns, seasons {sorted(df['season'].dropna().unique())}")

    print("Loading odds…")
    odds = load_odds()
    print(f"  {len(odds)} odds records")

    print("Building market datasets…")
    markets = build_market_datasets(df)
    print(f"  {len(markets)} markets defined")
    print()

    all_results: list[EvalResult] = []
    reliability_data: dict = {}  # key → { year → { model → (y_true, y_prob) } }
    market_verdicts: dict = {}

    for market_name, market_info in markets.items():
        print("─" * 60)
        print(f"  MARKET: {market_name}")
        print("─" * 60)

        if market_info.get("not_evaluable"):
            print(f"  ⛔ NOT EVALUABLE: {market_info['reason']}")
            market_verdicts[market_name] = {
                "verdict": "NOT_EVALUABLE",
                "reason": market_info["reason"],
                "submarkets": {},
            }
            print()
            continue

        market_verdicts[market_name] = {"submarkets": {}}

        for sub_name, sub_info in market_info["submarkets"].items():
            sub_df = sub_info["df"]
            target = sub_info["target"]
            prob_fn = sub_info["market_prob_fn"]

            # Check target distribution
            y = sub_df[target]
            pos_rate = y.mean()
            print(f"\n  [{sub_name}] target={target}, n={len(sub_df)}, pos_rate={pos_rate:.3f}")

            if pos_rate < 0.05 or pos_rate > 0.95:
                print(f"    ⚠️  Extreme class imbalance ({pos_rate:.3f}) — likely not bettable. SKIP.")
                continue

            results = train_and_eval(
                df=sub_df,
                target_col=target,
                feature_cols=FEATURE_COLS,
                odds_df=odds,
                market=market_name,
                submarket=sub_name,
                market_prob_fn=prob_fn,
            )

            all_results.extend(results)

            # Store reliability data for plotting
            rel_key = f"{market_name}/{sub_name}"
            reliability_data[rel_key] = {}
            # Re-run to capture predictions (we already have results, just need raw preds for plots)
            # We'll store from the results we have — but we need raw predictions
            # Instead, let's retrain just to capture preds for plotting
            for test_year in TEST_YEARS:
                train_df = sub_df[sub_df["season"] < test_year]
                test_df = sub_df[sub_df["season"] == test_year]
                if len(train_df) < 100 or len(test_df) < 50:
                    continue

                avail_feats = [c for c in FEATURE_COLS if c in sub_df.columns]
                X_train = train_df[avail_feats].fillna(train_df[avail_feats].mean()).fillna(0)
                X_test = test_df[avail_feats].fillna(train_df[avail_feats].mean()).fillna(0)
                y_train = train_df[target].values
                y_test = test_df[target].values

                year_data = {}
                scaler = StandardScaler()
                X_tr_s = scaler.fit_transform(X_train.values)
                X_te_s = scaler.transform(X_test.values)

                try:
                    lr = LogisticRegression(max_iter=2000, C=1.0, solver="lbfgs")
                    lr.fit(X_tr_s, y_train)
                    year_data["LogReg"] = (y_test, lr.predict_proba(X_te_s)[:, 1])
                except Exception:
                    pass

                try:
                    lgb_model = lgb.LGBMClassifier(
                        n_estimators=300, max_depth=5, learning_rate=0.05,
                        subsample=0.8, colsample_bytree=0.7, min_child_samples=30,
                        reg_alpha=0.1, reg_lambda=1.0, verbose=-1, random_state=42,
                        force_col_wise=True,
                    )
                    lgb_model.fit(X_train.values, y_train)
                    year_data["LightGBM"] = (y_test, lgb_model.predict_proba(X_test.values)[:, 1])
                except Exception:
                    pass

                reliability_data[rel_key][test_year] = year_data

            # Print results table for this submarket
            sub_results = [r for r in results if r.submarket == sub_name]
            if sub_results:
                print(f"\n    {'Model':<10} {'Year':<6} {'N':>5} {'AUC':>6} {'MAE':>6} {'MAE_mkt':>8} {'Gain':>6} {'Brier':>7} {'CalSlp':>7} {'Mono':>5}")
                print(f"    {'─'*10} {'─'*6} {'─'*5} {'─'*6} {'─'*6} {'─'*8} {'─'*6} {'─'*7} {'─'*7} {'─'*5}")
                for r in sub_results:
                    mae_m = f"{r.mae_market:.4f}" if r.mae_market is not None and not np.isnan(r.mae_market) else "  N/A"
                    gain = f"{r.mae_gain:+.4f}" if r.mae_gain is not None and not np.isnan(r.mae_gain) else "  N/A"
                    print(f"    {r.model_name:<10} {r.split_year:<6} {r.n_test:>5} {r.auc:>6.4f} {r.mae:>6.4f} {mae_m:>8} {gain:>6} {r.brier:>7.4f} {r.cal_slope:>7.4f} {'  ✓' if r.is_monotonic else '  ✗':>5}")

            # Verdict for this submarket
            verdict = compute_verdict(sub_results)
            market_verdicts[market_name]["submarkets"][sub_name] = verdict

            # Check early stopping
            sub_aucs = [r.auc for r in sub_results]
            mean_auc = np.mean(sub_aucs) if sub_aucs else 0

            if market_name == "F5_RunLine" and mean_auc < 0.55:
                print(f"\n    🛑 EARLY STOP: {sub_name} mean AUC={mean_auc:.4f} < 0.55")
            elif market_name == "F5_Totals" and mean_auc < 0.54:
                print(f"\n    🛑 EARLY STOP: {sub_name} mean AUC={mean_auc:.4f} < 0.54")
            elif market_name == "NRFI_YRFI" and mean_auc < 0.53:
                print(f"\n    🛑 EARLY STOP: {sub_name} mean AUC={mean_auc:.4f} < 0.53")

            print(f"\n    ➤ VERDICT: {verdict}")

        # Compute market-level verdict
        sub_verdicts = list(market_verdicts[market_name].get("submarkets", {}).values())
        if "GREENLIGHT" in sub_verdicts:
            market_verdicts[market_name]["verdict"] = "GREENLIGHT"
        elif "CONDITIONAL" in sub_verdicts:
            market_verdicts[market_name]["verdict"] = "CONDITIONAL"
        else:
            market_verdicts[market_name]["verdict"] = "DEAD"

        print(f"\n  ═══ {market_name} MARKET VERDICT: {market_verdicts[market_name]['verdict']} ═══")
        print()

    # ─────────────────────────────────────────────────────────
    # SAVE ARTIFACTS
    # ─────────────────────────────────────────────────────────

    print("\n" + "=" * 70)
    print("  SAVING ARTIFACTS")
    print("=" * 70)

    # 1. diagnostics CSV
    if all_results:
        results_df = pd.DataFrame([r.__dict__ for r in all_results])
        results_df.to_csv(OUTPUT_DIR / "diagnostics_by_market.csv", index=False)
        print(f"  ✅ diagnostics_by_market.csv ({len(results_df)} rows)")

    # 2. Reliability curves
    plot_reliability_curves(all_results, reliability_data, OUTPUT_DIR)
    print(f"  ✅ reliability_curves/ ({len(reliability_data)} plots)")

    # 3. AUC trend plots
    plot_auc_trends(all_results, OUTPUT_DIR)
    print("  ✅ auc_trends_*.png")

    # 4. Final market ranking
    ranking_lines = []
    ranking_lines.append("# F5 Market Learnability Audit — Final Ranking\n")
    ranking_lines.append(f"**Date:** {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')}")
    ranking_lines.append(f"**Method:** Walk-forward (train ≤ year N-1, test year N)")
    ranking_lines.append(f"**Models:** LogisticRegression, LightGBM")
    ranking_lines.append(f"**Test Years:** {TEST_YEARS}\n")

    ranking_lines.append("## GO / NO-GO Gates\n")
    ranking_lines.append(f"- Mean AUC ≥ {AUC_MEAN_MIN}")
    ranking_lines.append(f"- At least one split AUC ≥ {AUC_SINGLE_MIN}")
    ranking_lines.append(f"- Calibration slope ∈ [{CAL_SLOPE_LO}, {CAL_SLOPE_HI}]")
    ranking_lines.append(f"- Reliability curve monotonic")
    ranking_lines.append(f"- MAE improves vs market implied probability (when available)\n")

    ranking_lines.append("## Market Ranking\n")
    ranking_lines.append("| Rank | Market | Submarket | Mean AUC | Best AUC | MAE Gain | Cal Slope | Stability | Verdict |")
    ranking_lines.append("|------|--------|-----------|----------|----------|----------|-----------|-----------|---------|")

    if all_results:
        rdf = pd.DataFrame([r.__dict__ for r in all_results])

        # Rank by best model per submarket
        ranked = []
        for (market, sub), group in rdf.groupby(["market", "submarket"]):
            best_model = group.groupby("model_name")["auc"].mean().idxmax()
            best = group[group["model_name"] == best_model]
            mean_auc = best["auc"].mean()
            best_auc = best["auc"].max()
            mae_gain = best["mae_gain"].mean()
            cal_slope = best["cal_slope"].mean()
            stability = "stable" if best["auc"].std() < 0.02 else "variable"
            verdict = market_verdicts.get(market, {}).get("submarkets", {}).get(sub, "DEAD")

            ranked.append({
                "market": market, "submarket": sub,
                "mean_auc": mean_auc, "best_auc": best_auc,
                "mae_gain": mae_gain, "cal_slope": cal_slope,
                "stability": stability, "verdict": verdict,
                "best_model": best_model,
            })

        ranked.sort(key=lambda x: (-x["mean_auc"], -x["best_auc"]))

        for i, r in enumerate(ranked, 1):
            mg = f"{r['mae_gain']:+.4f}" if not np.isnan(r["mae_gain"]) else "N/A"
            ranking_lines.append(
                f"| {i} | {r['market']} | {r['submarket']} | "
                f"{r['mean_auc']:.4f} | {r['best_auc']:.4f} | "
                f"{mg} | {r['cal_slope']:.3f} | "
                f"{r['stability']} | **{r['verdict']}** |"
            )

    # Add not-evaluable markets
    ranking_lines.append("")
    for market_name, info in market_verdicts.items():
        if info.get("verdict") == "NOT_EVALUABLE":
            ranking_lines.append(f"\n### {market_name} — NOT EVALUABLE\n")
            ranking_lines.append(f"> {info.get('reason', 'No data')}")

    # Detailed results per market
    ranking_lines.append("\n\n## Detailed Results\n")
    if all_results:
        ranking_lines.append("| Market | Submarket | Model | Year | N | AUC | MAE | MAE_mkt | Gain | Brier | Cal_Slope | Mono |")
        ranking_lines.append("|--------|-----------|-------|------|---|-----|-----|---------|------|-------|-----------|------|")
        for r in all_results:
            mg = f"{r.mae_gain:+.4f}" if r.mae_gain is not None and not np.isnan(r.mae_gain) else "N/A"
            mm = f"{r.mae_market:.4f}" if r.mae_market is not None and not np.isnan(r.mae_market) else "N/A"
            ranking_lines.append(
                f"| {r.market} | {r.submarket} | {r.model_name} | {r.split_year} | "
                f"{r.n_test} | {r.auc:.4f} | {r.mae:.4f} | {mm} | "
                f"{mg} | {r.brier:.4f} | {r.cal_slope:.3f} | "
                f"{'✓' if r.is_monotonic else '✗'} |"
            )

    ranking_lines.append("\n\n## Recommendations\n")
    greenlights = [m for m, v in market_verdicts.items() if v.get("verdict") == "GREENLIGHT"]
    conditionals = [m for m, v in market_verdicts.items() if v.get("verdict") == "CONDITIONAL"]
    deads = [m for m, v in market_verdicts.items() if v.get("verdict") == "DEAD"]
    not_eval = [m for m, v in market_verdicts.items() if v.get("verdict") == "NOT_EVALUABLE"]

    if greenlights:
        ranking_lines.append(f"### 🟢 GREENLIGHT — Ready for ROI Backtest\n")
        for m in greenlights:
            subs = [s for s, v in market_verdicts[m].get("submarkets", {}).items() if v == "GREENLIGHT"]
            ranking_lines.append(f"- **{m}**: {', '.join(subs)}")

    if conditionals:
        ranking_lines.append(f"\n### 🟡 CONDITIONAL — Needs Filters or More Data\n")
        for m in conditionals:
            subs = [s for s, v in market_verdicts[m].get("submarkets", {}).items() if v == "CONDITIONAL"]
            ranking_lines.append(f"- **{m}**: {', '.join(subs)}")

    if deads:
        ranking_lines.append(f"\n### 🔴 DEAD — Do Not Pursue\n")
        for m in deads:
            ranking_lines.append(f"- **{m}**")

    if not_eval:
        ranking_lines.append(f"\n### ⬜ NOT EVALUABLE — Missing Data\n")
        for m in not_eval:
            ranking_lines.append(f"- **{m}**: {market_verdicts[m].get('reason', '')}")

    ranking_md = "\n".join(ranking_lines)
    (OUTPUT_DIR / "final_market_ranking.md").write_text(ranking_md)
    print("  ✅ final_market_ranking.md")

    # ─────────────────────────────────────────────────────────
    # FINAL SUMMARY
    # ─────────────────────────────────────────────────────────

    print("\n" + "=" * 70)
    print("  FINAL MARKET RANKING")
    print("=" * 70)
    print()
    print(f"  {'Market':<20} {'Verdict':<15}")
    print(f"  {'─'*20} {'─'*15}")
    for market_name, info in market_verdicts.items():
        v = info.get("verdict", "?")
        icon = {"GREENLIGHT": "🟢", "CONDITIONAL": "🟡", "DEAD": "🔴", "NOT_EVALUABLE": "⬜"}.get(v, "?")
        print(f"  {market_name:<20} {icon} {v}")
        for sub, sv in info.get("submarkets", {}).items():
            si = {"GREENLIGHT": "🟢", "CONDITIONAL": "🟡", "DEAD": "🔴"}.get(sv, "?")
            print(f"    └─ {sub:<16} {si} {sv}")

    print()
    print(f"  Output saved to: {OUTPUT_DIR.resolve()}")
    print("=" * 70)


if __name__ == "__main__":
    main()
