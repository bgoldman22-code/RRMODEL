#!/usr/bin/env python3
"""Quick sanity classifier for NBA Assists props.

Purpose
-------
Train a lightweight discriminative model on existing Phase 3.7 features to see
if there's any measurable signal (AUC/ROI) for Assists Over/Under outcomes.
This is *not* a production system—just a diagnostic experiment before Phase 3.8.

Outputs (stdout only):
- Dataset stats (rows, dates, class balance)
- Feature list summary
- Train/test split details
- Test metrics: AUC, Brier, Log-loss
- Calibration buckets (0.50+)
- Simple flat-stake backtest at several probability thresholds
- One-line takeaway
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

import numpy as np
import pandas as pd
import lightgbm as lgb
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
ASSIST_MARKET_VALUES = {"player_assists"}
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
    (0.80, 0.90),
    (0.90, 1.01),  # include 1.0
]
MIN_BUCKET_SIZE = 30
BACKTEST_THRESHOLDS = [0.55, 0.60, 0.65, 0.70]
PAYOUT_PER_WIN = 100 / 110  # -110 odds → risk 1 to win 0.9091
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

    if not records:
        raise ValueError("Training file is empty—cannot run experiment.")

    df = pd.DataFrame(records)
    if DATE_COLUMN not in df.columns:
        raise KeyError(f"Date column '{DATE_COLUMN}' missing from dataset.")

    df[DATE_COLUMN] = pd.to_datetime(df[DATE_COLUMN], errors="coerce")
    df = df.dropna(subset=[DATE_COLUMN, TARGET_COLUMN])
    df = df.sort_values(DATE_COLUMN).reset_index(drop=True)

    print(f"✓ Loaded {len(df):,} total rows from {TRAINING_FILE.name}")
    return df


def filter_assists_market(df: pd.DataFrame) -> pd.DataFrame:
    market_col = None
    for candidate in ("market", "stat_type", "bet_type"):
        if candidate in df.columns:
            market_col = candidate
            break

    if market_col is None:
        raise KeyError("Could not find a market/stat_type column to filter Assists bets.")

    mask = df[market_col].isin(ASSIST_MARKET_VALUES)
    if mask.sum() == 0:
        raise ValueError(
            "No Assists rows found. Update ASSIST_MARKET_VALUES if market names changed."
        )

    df_assists = df.loc[mask].copy()
    print(f"✓ Filtered to Assists market via '{market_col}': {len(df_assists):,} rows")
    return df_assists


def add_side_feature(df: pd.DataFrame) -> pd.DataFrame:
    if SIDE_COLUMN not in df.columns:
        print("⚠️  'side' column missing—defaulting is_over=NaN")
        df["is_over"] = np.nan
        return df

    df["is_over"] = (
        df[SIDE_COLUMN]
        .astype(str)
        .str.lower()
        .str.strip()
        .eq("over")
        .astype(int)
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

    if not feature_cols:
        raise ValueError("No numeric feature columns available after exclusions.")

    return sorted(feature_cols)


@dataclass
class DatasetSplit:
    X_train: np.ndarray
    y_train: np.ndarray
    X_test: np.ndarray
    y_test: np.ndarray
    df_train: pd.DataFrame
    df_test: pd.DataFrame


def temporal_split(
    df: pd.DataFrame, feature_cols: Sequence[str], train_frac: float = 0.8
) -> DatasetSplit:
    if not 0.0 < train_frac < 1.0:
        raise ValueError("train_frac must be between 0 and 1")

    unique_dates = df[DATE_COLUMN].sort_values().unique()
    if len(unique_dates) < 5:
        raise ValueError("Need at least 5 unique dates for a temporal split.")

    cutoff_idx = max(1, int(len(unique_dates) * train_frac))
    cutoff_idx = min(cutoff_idx, len(unique_dates) - 1)
    cutoff_date = unique_dates[cutoff_idx]

    train_mask = df[DATE_COLUMN] < cutoff_date
    test_mask = ~train_mask

    df_train = df.loc[train_mask].copy()
    df_test = df.loc[test_mask].copy()

    if df_train.empty or df_test.empty:
        raise ValueError(
            "Temporal split failed (one side empty). Check date distribution or train_frac."
        )

    def prepare_matrix(frame: pd.DataFrame) -> np.ndarray:
        mat = frame.loc[:, feature_cols]
        return mat.fillna(mat.median()).to_numpy(dtype=np.float32)

    X_train = prepare_matrix(df_train)
    y_train = df_train[TARGET_COLUMN].astype(int).to_numpy()
    X_test = prepare_matrix(df_test)
    y_test = df_test[TARGET_COLUMN].astype(int).to_numpy()

    print(
        f"Train range: {df_train[DATE_COLUMN].min().date()} → {df_train[DATE_COLUMN].max().date()}"
    )
    print(
        f"Test  range: {df_test[DATE_COLUMN].min().date()} → {df_test[DATE_COLUMN].max().date()}"
    )
    print(f"Train rows: {len(df_train):,} | Test rows: {len(df_test):,}")

    return DatasetSplit(X_train, y_train, X_test, y_test, df_train, df_test)


# =============================================================================
# MODELING
# =============================================================================


def train_classifier(split: DatasetSplit) -> lgb.LGBMClassifier:
    model = lgb.LGBMClassifier(
        n_estimators=500,
        learning_rate=0.02,
        max_depth=-1,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_samples=50,
        n_jobs=-1,
        random_state=42,
        verbose=-1,
    )

    model.fit(split.X_train, split.y_train)
    return model


def compute_calibration_table(
    y_true: np.ndarray, probs: np.ndarray, buckets: Sequence[Tuple[float, float]]
) -> List[Dict[str, float]]:
    rows: List[Dict[str, float]] = []
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
            }
        )
    return rows


def run_flat_stake_backtest(
    y_true: np.ndarray, probs: np.ndarray, thresholds: Sequence[float]
) -> List[Dict[str, float]]:
    results: List[Dict[str, float]] = []
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
        win_rate = wins / n_bets
        results.append(
            {
                "threshold": thresh,
                "bets": n_bets,
                "wins": wins,
                "win_rate": win_rate,
                "roi": roi,
            }
        )
    return results


# =============================================================================
# MAIN EXECUTION
# =============================================================================


def main() -> None:
    print("=" * 80)
    print("PHASE 3.8 QUICK ASSISTS CLASSIFIER")
    print("=" * 80)

    df = load_training_data()
    df = filter_assists_market(df)
    df = add_side_feature(df)

    # Basic stats
    hit_rate = df[TARGET_COLUMN].mean()
    print(
        f"Rows: {len(df):,} | Date range: {df[DATE_COLUMN].min().date()} → {df[DATE_COLUMN].max().date()}"
    )
    print(f"Class balance (hit rate): {hit_rate:.3%}")

    feature_cols = select_feature_columns(df)
    print(f"Using {len(feature_cols)} numeric features")
    print("First 10 features:", feature_cols[:10])

    split = temporal_split(df, feature_cols, train_frac=0.8)

    print("\nTraining LightGBM classifier...")
    model = train_classifier(split)
    probs = model.predict_proba(split.X_test)[:, 1]

    # Metrics
    auc = roc_auc_score(split.y_test, probs) if len(np.unique(split.y_test)) > 1 else 0.5
    brier = brier_score_loss(split.y_test, probs)
    ll = log_loss(split.y_test, np.clip(probs, 1e-6, 1 - 1e-6))

    print("\n=== TEST METRICS ===")
    print(f"ROC AUC: {auc:.4f}")
    print(f"Brier  : {brier:.4f}")
    print(f"LogLoss: {ll:.4f}")

    print("\n=== CALIBRATION BUCKETS (>=30 bets) ===")
    calib_rows = compute_calibration_table(split.y_test, probs, BUCKETS)
    if not calib_rows:
        print("(No buckets with >=30 bets above 0.50 probability)")
    else:
        print(f"{'Bucket':<15}{'Bets':>8}{'Avg p':>10}{'Hit%':>10}")
        for row in calib_rows:
            print(
                f"{row['bucket']:<15}{row['n']:>8}{row['avg_pred']:>10.3f}{row['hit_rate']:>10.3f}"
            )

    print("\n=== FLAT-STAKE BACKTEST (-110 odds) ===")
    backtest_rows = run_flat_stake_backtest(split.y_test, probs, BACKTEST_THRESHOLDS)
    print(f"{'Threshold':<12}{'Bets':>8}{'Wins':>8}{'Win%':>10}{'ROI':>10}")
    for row in backtest_rows:
        win_pct = "nan" if np.isnan(row["win_rate"]) else f"{row['win_rate']*100:0.1f}%"
        roi_pct = "nan" if np.isnan(row["roi"]) else f"{row['roi']*100:0.1f}%"
        print(
            f"{row['threshold']:<12.2f}{row['bets']:>8}{row['wins']:>8}{win_pct:>10}{roi_pct:>10}"
        )

    # Final summary line
    interpretation = (
        "No discernible signal (AUC≈0.50)."
        if auc < 0.515
        else "Weak signal present (AUC>0.52)."
        if auc < 0.56
        else "Meaningful signal detected (AUC≥0.56)."
    )
    print("\n=== SUMMARY ===")
    print(f"Test AUC: {auc:.4f}")
    print(f"Brier: {brier:.4f}")
    roi_60 = next((row for row in backtest_rows if row["threshold"] == 0.60), None)
    if roi_60 and not np.isnan(roi_60["roi"]):
        print(
            f"Flat-stake ROI p>=0.60: {roi_60['roi']*100:+0.2f}% over {roi_60['bets']} bets"
        )
    else:
        print("Flat-stake ROI p>=0.60: N/A (no bets)")
    print(interpretation)


if __name__ == "__main__":
    main()
