#!/usr/bin/env python3
"""Phase 3.8 Market Classifier with Isotonic Calibration.

Purpose
-------
Train a stronger single-model binary classifier per market (Points/Rebounds/Assists)
with proper train/val/test splits, isotonic calibration, and hyperparameter tuning.

This builds on the quick classifiers from Block 1, adding:
- 60/20/20 temporal split (train/val/test)
- Isotonic calibration trained on validation set
- Early stopping based on validation AUC
- Comprehensive calibration analysis
- Markdown reports per market

Usage
-----
python3 scripts/nba/phase38_train_market_classifier.py --market points
python3 scripts/nba/phase38_train_market_classifier.py --market rebounds
python3 scripts/nba/phase38_train_market_classifier.py --market assists
"""

from __future__ import annotations

import argparse
import json
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.calibration import IsotonicRegression
from sklearn.metrics import (
    brier_score_loss,
    log_loss,
    roc_auc_score,
)

# =============================================================================
# CONFIGURATION
# =============================================================================

REPO_ROOT = Path(__file__).resolve().parents[2]
TRAINING_FILE = REPO_ROOT / "data/nba/training/phase3_training_v1_20251202.jsonl"
OUTPUT_DIR = REPO_ROOT / "docs/phase38_validation"
MODEL_DIR = REPO_ROOT / "models/phase3.8/market_classifiers"

MARKET_VALUES = {
    "points": {"player_points"},
    "rebounds": {"player_rebounds"},
    "assists": {"player_assists"},
}

DATE_COLUMN = "date"
TARGET_COLUMN = "result"
SIDE_COLUMN = "side"
LINE_COLUMN = "line"

BUCKETS: List[Tuple[float, float]] = [
    (0.50, 0.55),
    (0.55, 0.60),
    (0.60, 0.65),
    (0.65, 0.70),
    (0.70, 0.75),
    (0.75, 0.80),
    (0.80, 0.85),
    (0.85, 0.90),
    (0.90, 1.01),
]
MIN_BUCKET_SIZE = 20  # Lower threshold for more granular calibration analysis
BACKTEST_THRESHOLDS = [0.55, 0.60, 0.65, 0.70]
PAYOUT_PER_WIN = 100 / 110

EXCLUDE_COLUMNS = {
    TARGET_COLUMN,
    DATE_COLUMN,
    "id",
    "player",
    "team",
    "opponent",
    "bookmaker",
    "market",
    "stat_type",
    "bet_type",
    "model_version",
    "fold",
    "actual_value",
    "actual_points",
    "actual_rebounds",
    "actual_assists",
    "actual_pra",
    "actual_minutes",
    "mu",
    "sigma",
}
EXCLUDE_PREFIXES = ("actual_", "mu_", "sigma_", "prob_", "edge_", "pred_")

# =============================================================================
# DATA UTILITIES
# =============================================================================


def load_training_data() -> pd.DataFrame:
    if not TRAINING_FILE.exists():
        raise FileNotFoundError(f"Training file not found: {TRAINING_FILE}")

    records: List[Dict] = []
    with TRAINING_FILE.open("r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            records.append(json.loads(line))

    df = pd.DataFrame(records)
    df[DATE_COLUMN] = pd.to_datetime(df[DATE_COLUMN], errors="coerce")
    df = df.dropna(subset=[DATE_COLUMN, TARGET_COLUMN])
    df = df.sort_values(DATE_COLUMN).reset_index(drop=True)

    print(f"✓ Loaded {len(df):,} total rows")
    return df


def filter_market(df: pd.DataFrame, market: str) -> pd.DataFrame:
    market_col = None
    for candidate in ("market", "stat_type", "bet_type"):
        if candidate in df.columns:
            market_col = candidate
            break

    if market_col is None:
        raise KeyError("Could not find a market column.")

    mask = df[market_col].isin(MARKET_VALUES[market])
    if mask.sum() == 0:
        raise ValueError(f"No {market} rows found.")

    df_market = df.loc[mask].copy()
    print(f"✓ Filtered to {market.capitalize()} market: {len(df_market):,} rows")
    return df_market


def add_side_feature(df: pd.DataFrame) -> pd.DataFrame:
    if SIDE_COLUMN not in df.columns:
        df["is_over"] = np.nan
        return df

    df["is_over"] = (
        df[SIDE_COLUMN].astype(str).str.lower().str.strip().eq("over").astype(int)
    )
    return df


def select_feature_columns(df: pd.DataFrame) -> List[str]:
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    feature_cols = []
    for col in numeric_cols:
        if col in EXCLUDE_COLUMNS:
            continue
        if any(col.startswith(prefix) for prefix in EXCLUDE_PREFIXES):
            continue
        feature_cols.append(col)

    if LINE_COLUMN in df.columns and LINE_COLUMN not in feature_cols:
        feature_cols.append(LINE_COLUMN)
    if "is_over" in df.columns and "is_over" not in feature_cols:
        feature_cols.append("is_over")

    return sorted(feature_cols)


@dataclass
class DatasetSplit:
    X_train: np.ndarray
    y_train: np.ndarray
    X_val: np.ndarray
    y_val: np.ndarray
    X_test: np.ndarray
    y_test: np.ndarray
    df_train: pd.DataFrame
    df_val: pd.DataFrame
    df_test: pd.DataFrame


def temporal_split_60_20_20(
    df: pd.DataFrame, feature_cols: Sequence[str]
) -> DatasetSplit:
    """Split data 60% train, 20% val, 20% test by temporal ordering."""
    unique_dates = df[DATE_COLUMN].sort_values().unique()
    if len(unique_dates) < 10:
        raise ValueError("Need at least 10 unique dates for 60/20/20 split.")

    train_cutoff_idx = max(1, int(len(unique_dates) * 0.6))
    val_cutoff_idx = max(train_cutoff_idx + 1, int(len(unique_dates) * 0.8))

    train_cutoff = unique_dates[train_cutoff_idx]
    val_cutoff = unique_dates[val_cutoff_idx]

    df_train = df.loc[df[DATE_COLUMN] < train_cutoff].copy()
    df_val = df.loc[
        (df[DATE_COLUMN] >= train_cutoff) & (df[DATE_COLUMN] < val_cutoff)
    ].copy()
    df_test = df.loc[df[DATE_COLUMN] >= val_cutoff].copy()

    if df_train.empty or df_val.empty or df_test.empty:
        raise ValueError("One of the splits is empty. Check date distribution.")

    def prepare_matrix(frame: pd.DataFrame) -> np.ndarray:
        mat = frame.loc[:, feature_cols]
        return mat.fillna(mat.median()).to_numpy(dtype=np.float32)

    X_train = prepare_matrix(df_train)
    y_train = df_train[TARGET_COLUMN].astype(int).to_numpy()
    X_val = prepare_matrix(df_val)
    y_val = df_val[TARGET_COLUMN].astype(int).to_numpy()
    X_test = prepare_matrix(df_test)
    y_test = df_test[TARGET_COLUMN].astype(int).to_numpy()

    print(
        f"Train: {df_train[DATE_COLUMN].min().date()} → {df_train[DATE_COLUMN].max().date()} ({len(df_train):,} rows)"
    )
    print(
        f"Val:   {df_val[DATE_COLUMN].min().date()} → {df_val[DATE_COLUMN].max().date()} ({len(df_val):,} rows)"
    )
    print(
        f"Test:  {df_test[DATE_COLUMN].min().date()} → {df_test[DATE_COLUMN].max().date()} ({len(df_test):,} rows)"
    )

    return DatasetSplit(
        X_train, y_train, X_val, y_val, X_test, y_test, df_train, df_val, df_test
    )


# =============================================================================
# MODELING
# =============================================================================


def train_classifier_with_early_stopping(split: DatasetSplit) -> lgb.LGBMClassifier:
    """Train LightGBM with early stopping on validation AUC."""
    print("\nTraining LightGBM classifier with early stopping...")

    model = lgb.LGBMClassifier(
        n_estimators=1000,  # Large, will stop early
        learning_rate=0.02,
        max_depth=-1,
        num_leaves=31,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_samples=50,
        n_jobs=-1,
        random_state=42,
        verbose=-1,
    )

    model.fit(
        split.X_train,
        split.y_train,
        eval_set=[(split.X_val, split.y_val)],
        eval_metric="auc",
        callbacks=[lgb.early_stopping(stopping_rounds=50, verbose=False)],
    )

    print(f"  Best iteration: {model.best_iteration_}")
    print(f"  Best validation AUC: {model.best_score_['valid_0']['auc']:.4f}")

    return model


def train_isotonic_calibrator(
    raw_probs: np.ndarray, y_true: np.ndarray
) -> IsotonicRegression:
    """Train isotonic regression calibrator."""
    calibrator = IsotonicRegression(out_of_bounds="clip")
    calibrator.fit(raw_probs, y_true)
    return calibrator


def compute_metrics(
    y_true: np.ndarray, probs: np.ndarray
) -> Dict[str, float]:
    """Compute evaluation metrics."""
    if len(np.unique(y_true)) < 2:
        auc = 0.5
    else:
        auc = roc_auc_score(y_true, probs)

    brier = brier_score_loss(y_true, probs)
    ll = log_loss(y_true, np.clip(probs, 1e-6, 1 - 1e-6))
    calib_error = probs.mean() - y_true.mean()

    return {
        "auc": auc,
        "brier": brier,
        "logloss": ll,
        "calib_error": calib_error,
    }


def compute_calibration_table(
    y_true: np.ndarray, probs: np.ndarray, buckets: Sequence[Tuple[float, float]]
) -> List[Dict]:
    rows = []
    for low, high in buckets:
        mask = (probs >= low) & (probs < high)
        n = int(mask.sum())
        if n < MIN_BUCKET_SIZE:
            continue
        bucket_probs = probs[mask]
        bucket_hits = y_true[mask]
        rows.append(
            {
                "bucket": f"[{low:.2f}, {high:.2f})",
                "n": n,
                "avg_pred": bucket_probs.mean(),
                "hit_rate": bucket_hits.mean(),
                "calib_error": bucket_probs.mean() - bucket_hits.mean(),
            }
        )
    return rows


def run_flat_stake_backtest(
    y_true: np.ndarray, probs: np.ndarray, thresholds: Sequence[float]
) -> List[Dict]:
    results = []
    for thresh in thresholds:
        mask = probs >= thresh
        n_bets = int(mask.sum())
        if n_bets == 0:
            results.append(
                {
                    "threshold": thresh,
                    "bets": 0,
                    "wins": 0,
                    "win_rate": np.nan,
                    "roi": np.nan,
                }
            )
            continue

        wins = int(y_true[mask].sum())
        losses = n_bets - wins
        profit = wins * PAYOUT_PER_WIN - losses * 1.0
        roi = profit / n_bets
        results.append(
            {
                "threshold": thresh,
                "bets": n_bets,
                "wins": wins,
                "win_rate": wins / n_bets,
                "roi": roi,
            }
        )
    return results


# =============================================================================
# REPORTING
# =============================================================================


def generate_markdown_report(
    market: str,
    split: DatasetSplit,
    raw_metrics: Dict[str, Dict[str, float]],
    calib_metrics: Dict[str, Dict[str, float]],
    calib_tables: Dict[str, List[Dict]],
    backtest_results: Dict[str, List[Dict]],
) -> str:
    """Generate comprehensive markdown report."""
    lines = [
        f"# Phase 3.8 Market Classifier: {market.capitalize()}",
        "",
        f"**Generated:** {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "**Model:** LightGBM binary classifier with isotonic calibration",
        "",
        "---",
        "",
        "## Dataset",
        "",
        f"- Total rows: {len(split.df_train) + len(split.df_val) + len(split.df_test):,}",
        f"- Train: {len(split.df_train):,} ({len(split.df_train) / (len(split.df_train) + len(split.df_val) + len(split.df_test)) * 100:.1f}%)",
        f"- Val: {len(split.df_val):,} ({len(split.df_val) / (len(split.df_train) + len(split.df_val) + len(split.df_test)) * 100:.1f}%)",
        f"- Test: {len(split.df_test):,} ({len(split.df_test) / (len(split.df_train) + len(split.df_val) + len(split.df_test)) * 100:.1f}%)",
        f"- Train date range: {split.df_train[DATE_COLUMN].min().date()} → {split.df_train[DATE_COLUMN].max().date()}",
        f"- Val date range: {split.df_val[DATE_COLUMN].min().date()} → {split.df_val[DATE_COLUMN].max().date()}",
        f"- Test date range: {split.df_test[DATE_COLUMN].min().date()} → {split.df_test[DATE_COLUMN].max().date()}",
        "",
        "---",
        "",
        "## Test Metrics",
        "",
        "### Raw Model (before calibration)",
        "",
        f"- **AUC:** {raw_metrics['test']['auc']:.4f}",
        f"- **Brier:** {raw_metrics['test']['brier']:.4f}",
        f"- **LogLoss:** {raw_metrics['test']['logloss']:.4f}",
        f"- **Calibration Error:** {raw_metrics['test']['calib_error']:+.4f}",
        "",
        "### Calibrated Model (isotonic on validation set)",
        "",
        f"- **AUC:** {calib_metrics['test']['auc']:.4f} (unchanged, calibration preserves ranking)",
        f"- **Brier:** {calib_metrics['test']['brier']:.4f} ({'better' if calib_metrics['test']['brier'] < raw_metrics['test']['brier'] else 'worse'} than raw)",
        f"- **LogLoss:** {calib_metrics['test']['logloss']:.4f} ({'better' if calib_metrics['test']['logloss'] < raw_metrics['test']['logloss'] else 'worse'} than raw)",
        f"- **Calibration Error:** {calib_metrics['test']['calib_error']:+.4f}",
        "",
        "---",
        "",
        "## Calibration Analysis (Calibrated Probabilities)",
        "",
        "| Bucket | Bets | Avg Pred | Hit Rate | Calib Error |",
        "|--------|------|----------|----------|-------------|",
    ]

    for row in calib_tables["test"]:
        lines.append(
            f"| {row['bucket']} | {row['n']:,} | {row['avg_pred']:.3f} | {row['hit_rate']:.3f} | {row['calib_error']:+.3f} |"
        )

    lines.extend(
        [
            "",
            "---",
            "",
            "## Flat-Stake Backtest (Test Set, -110 odds)",
            "",
            "### Raw Probabilities",
            "",
            "| Threshold | Bets | Wins | Win% | ROI |",
            "|-----------|------|------|------|-----|",
        ]
    )

    for row in backtest_results["raw"]:
        win_pct = "N/A" if np.isnan(row["win_rate"]) else f"{row['win_rate']*100:.1f}%"
        roi_pct = "N/A" if np.isnan(row["roi"]) else f"{row['roi']*100:+.1f}%"
        lines.append(
            f"| p≥{row['threshold']:.2f} | {row['bets']:,} | {row['wins']} | {win_pct} | {roi_pct} |"
        )

    lines.extend(
        [
            "",
            "### Calibrated Probabilities",
            "",
            "| Threshold | Bets | Wins | Win% | ROI |",
            "|-----------|------|------|------|-----|",
        ]
    )

    for row in backtest_results["calib"]:
        win_pct = "N/A" if np.isnan(row["win_rate"]) else f"{row['win_rate']*100:.1f}%"
        roi_pct = "N/A" if np.isnan(row["roi"]) else f"{row['roi']*100:+.1f}%"
        lines.append(
            f"| p≥{row['threshold']:.2f} | {row['bets']:,} | {row['wins']} | {win_pct} | {roi_pct} |"
        )

    lines.extend(
        [
            "",
            "---",
            "",
            "## Summary",
            "",
            f"**Test AUC:** {calib_metrics['test']['auc']:.4f}",
            f"**Calibrated Brier:** {calib_metrics['test']['brier']:.4f}",
            "",
            "**Key Findings:**",
        ]
    )

    # Find best ROI threshold
    best_roi_calib = max(backtest_results["calib"], key=lambda x: x["roi"] if not np.isnan(x["roi"]) else -999)
    if not np.isnan(best_roi_calib["roi"]):
        lines.append(
            f"- Best calibrated ROI: **{best_roi_calib['roi']*100:+.1f}%** at p≥{best_roi_calib['threshold']:.2f} ({best_roi_calib['bets']} bets)"
        )

    # Check for calibration issues
    max_calib_error = max([abs(row["calib_error"]) for row in calib_tables["test"]], default=0)
    if max_calib_error > 0.10:
        lines.append(f"- ⚠️ Maximum calibration error: {max_calib_error:.3f} (>10pp in at least one bucket)")
    else:
        lines.append(f"- ✅ Good calibration: max error {max_calib_error:.3f} (<10pp)")

    # AUC assessment
    if calib_metrics['test']['auc'] >= 0.55:
        lines.append(f"- ✅ **Strong signal:** AUC {calib_metrics['test']['auc']:.4f} ≥ target 0.55")
    elif calib_metrics['test']['auc'] >= 0.52:
        lines.append(f"- ⚠️ **Weak signal:** AUC {calib_metrics['test']['auc']:.4f} (target: 0.55+)")
    else:
        lines.append(f"- 🚨 **No signal:** AUC {calib_metrics['test']['auc']:.4f} ≈ random")

    lines.extend(
        [
            "",
            "---",
            "",
            "**Next Steps:**",
            "- If AUC < 0.55: Consider feature engineering (line-relative features, interaction terms)",
            "- If calibration poor: Investigate specific probability ranges or side-specific patterns",
            "- If promising: Proceed to Block 3 (separate Over/Under models)",
            "",
        ]
    )

    return "\n".join(lines)


# =============================================================================
# MAIN
# =============================================================================


def main():
    parser = argparse.ArgumentParser(
        description="Train Phase 3.8 market classifier with isotonic calibration."
    )
    parser.add_argument(
        "--market",
        type=str,
        required=True,
        choices=["points", "rebounds", "assists"],
        help="Market to train (points, rebounds, or assists)",
    )
    args = parser.parse_args()

    market = args.market

    print("=" * 80)
    print(f"PHASE 3.8 MARKET CLASSIFIER: {market.upper()}")
    print("=" * 80)

    # Load and prepare data
    df = load_training_data()
    df = filter_market(df, market)
    df = add_side_feature(df)

    hit_rate = df[TARGET_COLUMN].mean()
    print(f"Overall hit rate: {hit_rate:.3%}")

    feature_cols = select_feature_columns(df)
    print(f"Using {len(feature_cols)} numeric features")

    # Split data 60/20/20
    split = temporal_split_60_20_20(df, feature_cols)

    # Train model with early stopping
    model = train_classifier_with_early_stopping(split)

    # Get raw probabilities
    raw_probs_val = model.predict_proba(split.X_val)[:, 1]
    raw_probs_test = model.predict_proba(split.X_test)[:, 1]

    # Compute raw metrics
    raw_metrics = {
        "val": compute_metrics(split.y_val, raw_probs_val),
        "test": compute_metrics(split.y_test, raw_probs_test),
    }

    print("\n=== RAW MODEL METRICS ===")
    print(f"Val:  AUC={raw_metrics['val']['auc']:.4f}, Brier={raw_metrics['val']['brier']:.4f}")
    print(f"Test: AUC={raw_metrics['test']['auc']:.4f}, Brier={raw_metrics['test']['brier']:.4f}")

    # Train isotonic calibrator on validation set
    print("\nTraining isotonic calibrator on validation set...")
    calibrator = train_isotonic_calibrator(raw_probs_val, split.y_val)

    # Apply calibrator
    calib_probs_test = calibrator.predict(raw_probs_test)

    # Compute calibrated metrics
    calib_metrics = {
        "test": compute_metrics(split.y_test, calib_probs_test),
    }

    print("\n=== CALIBRATED MODEL METRICS ===")
    print(f"Test: AUC={calib_metrics['test']['auc']:.4f}, Brier={calib_metrics['test']['brier']:.4f}, CalibError={calib_metrics['test']['calib_error']:+.4f}")

    # Compute calibration tables
    calib_tables = {
        "test": compute_calibration_table(split.y_test, calib_probs_test, BUCKETS),
    }

    print("\n=== CALIBRATION BUCKETS (Test Set) ===")
    print(f"{'Bucket':<15}{'Bets':>8}{'Avg Pred':>10}{'Hit Rate':>10}{'Calib Err':>10}")
    for row in calib_tables["test"]:
        print(
            f"{row['bucket']:<15}{row['n']:>8}{row['avg_pred']:>10.3f}{row['hit_rate']:>10.3f}{row['calib_error']:>10.3f}"
        )

    # Run backtests
    backtest_results = {
        "raw": run_flat_stake_backtest(split.y_test, raw_probs_test, BACKTEST_THRESHOLDS),
        "calib": run_flat_stake_backtest(split.y_test, calib_probs_test, BACKTEST_THRESHOLDS),
    }

    print("\n=== FLAT-STAKE BACKTEST (Calibrated, Test Set) ===")
    print(f"{'Threshold':<12}{'Bets':>8}{'Wins':>8}{'Win%':>10}{'ROI':>10}")
    for row in backtest_results["calib"]:
        win_pct = "N/A" if np.isnan(row["win_rate"]) else f"{row['win_rate']*100:.1f}%"
        roi_pct = "N/A" if np.isnan(row["roi"]) else f"{row['roi']*100:+.1f}%"
        print(
            f"{row['threshold']:<12.2f}{row['bets']:>8}{row['wins']:>8}{win_pct:>10}{roi_pct:>10}"
        )

    # Generate markdown report
    report = generate_markdown_report(
        market, split, raw_metrics, calib_metrics, calib_tables, backtest_results
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = OUTPUT_DIR / f"PHASE38_MARKET_CLASSIFIER_{market}.md"
    report_path.write_text(report)
    print(f"\n✓ Saved report: {report_path}")

    # Save model and calibrator
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.booster_.save_model(str(MODEL_DIR / f"{market}_classifier.txt"))
    
    with (MODEL_DIR / f"{market}_isotonic_calibrator.pkl").open("wb") as f:
        pickle.dump(calibrator, f)

    print(f"✓ Saved model: {MODEL_DIR / f'{market}_classifier.txt'}")
    print(f"✓ Saved calibrator: {MODEL_DIR / f'{market}_isotonic_calibrator.pkl'}")

    print("\n" + "=" * 80)
    print(f"COMPLETED: {market.upper()} Market Classifier")
    print("=" * 80)


if __name__ == "__main__":
    main()
