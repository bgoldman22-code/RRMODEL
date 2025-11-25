#!/usr/bin/env python3
"""
Train Elastic Net on ACTUAL TOTALS (not residuals)

This retrains the Elastic Net model architecture but predicts actual totals directly,
not residuals. Uses the same advanced features as the residual dataset.

Purpose: Test if the current production model is miscalibrated because it was
trained on a different feature set or target variable.

Key differences from current production model:
- Predicts actual_total directly (not residual from baseline)
- Uses advanced features (ORTGs, DRTGs, pace, efficiency) not basic box scores
- Uses same training data as V2 LightGBM for fair comparison
- Fresh walk-forward backtest with proper calibration

Output:
- Trained model weights (saved as separate artifact, won't overwrite production)
- Walk-forward backtest results
- Summary comparing to both V2 and production Elastic Net

Usage:
  python ml/nba_totals_train_elastic_net_on_totals.py
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import ElasticNet
from sklearn.metrics import mean_absolute_error
from scipy.stats import pearsonr

# ============================================================================
# CONFIGURATION
# ============================================================================

REPO_ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = REPO_ROOT / "data" / "nba" / "datasets"
BACKTEST_DIR = REPO_ROOT / "data" / "nba" / "backtests"
MODELS_DIR = REPO_ROOT / "netlify" / "functions" / "_lib" / "nba" / "models" / "artifacts"

# Use residual dataset (has all advanced features + actual_total)
DATASET_FILE = "nba_totals_residual_dataset.parquet"

# Use advanced features (same ones V2 uses)
# These are the Top-15 features that V2 found most important
ELASTIC_NET_FEATURES = [
    "home_season_ft_rate",
    "away_season_tov_pct",
    "home_l5_tov_pct",
    "home_l5_pace",
    "away_l5_ortg",
    "home_ortg_vs_away_drtg",
    "home_season_orb_pct",
    "home_l5_orb_pct",
    "home_l5_drtg",
    "home_l5_efg",
    "away_l10_drtg",
    "home_l10_ortg",
    "ortg_diff",
    "home_l5_ortg",
    "away_l5_drtg",
]

# Bet logic parameters (same as V2)
MIN_EDGE = 4.0  # Minimum edge to bet
MAX_EDGE = 8.0  # Maximum edge to bet
JUICE = -110    # Standard American odds

# Edge buckets for analysis
EDGE_BUCKETS = [
    (4.0, 5.0),
    (5.0, 6.0),
    (6.0, 8.0),
]


# ============================================================================
# ARGUMENT PARSING
# ============================================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train Elastic Net on Actual Totals (not residuals)"
    )
    parser.add_argument("--min-train", type=int, default=500,
                        help="Minimum training samples before predicting")
    parser.add_argument("--alpha", type=float, default=0.1,
                        help="ElasticNet alpha (regularization strength)")
    parser.add_argument("--l1-ratio", type=float, default=0.5,
                        help="ElasticNet l1_ratio (0=Ridge, 1=Lasso)")
    return parser.parse_args()


# ============================================================================
# DATA LOADING
# ============================================================================

def load_dataset() -> pd.DataFrame:
    """Load residual dataset."""
    dataset_path = DATASET_DIR / DATASET_FILE
    
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")
    
    df = pd.read_parquet(dataset_path)
    
    # Filter to games with market odds only
    df = df[df["consensus_total_line"].notna()].copy()
    df.sort_values("date", inplace=True)
    df.reset_index(drop=True, inplace=True)
    
    # Verify features exist
    missing_features = [f for f in ELASTIC_NET_FEATURES if f not in df.columns]
    if missing_features:
        raise ValueError(f"Missing features in dataset: {missing_features}")
    
    return df


# ============================================================================
# BET LOGIC
# ============================================================================

def calculate_bet_outcome(
    edge: float,
    actual_total: float,
    market_line: float,
) -> Tuple[Optional[str], Optional[float], Optional[str]]:
    """
    Determine bet direction, outcome, and profit.
    
    Returns:
        (bet_direction, profit, result)
    """
    # Only bet if edge is in range
    if abs(edge) < MIN_EDGE or abs(edge) > MAX_EDGE:
        return None, None, None
    
    # Determine bet direction
    # Positive edge = model predicts higher than market → bet OVER
    # Negative edge = model predicts lower than market → bet UNDER
    if edge > 0:
        bet_direction = "OVER"
        bet_won = actual_total > market_line
    else:
        bet_direction = "UNDER"
        bet_won = actual_total < market_line
    
    # Calculate profit
    # Risk $110 to win $100 at -110 odds
    if bet_won:
        profit = 100.0  # Win $100
        result = "WIN"
    else:
        profit = -110.0  # Lose $110
        result = "LOSS"
    
    return bet_direction, profit, result


def get_edge_bucket(edge: float) -> Optional[str]:
    """Categorize edge into buckets."""
    abs_edge = abs(edge)
    
    for min_edge, max_edge in EDGE_BUCKETS:
        if min_edge <= abs_edge < max_edge:
            return f"{min_edge:.1f}-{max_edge:.1f}"
    
    return None


# ============================================================================
# ELASTIC NET PREDICTION
# ============================================================================

def train_elastic_net(
    X_train: np.ndarray,
    y_train: np.ndarray,
    alpha: float = 0.1,
    l1_ratio: float = 0.5,
) -> ElasticNet:
    """
    Train Elastic Net model.
    
    Args:
        X_train: Training features (standardized)
        y_train: Training targets (actual totals)
        alpha: Regularization strength
        l1_ratio: L1 vs L2 ratio (0=Ridge, 1=Lasso, 0.5=Elastic Net)
    
    Returns:
        Trained ElasticNet model
    """
    model = ElasticNet(
        alpha=alpha,
        l1_ratio=l1_ratio,
        max_iter=5000,
        random_state=42,
    )
    
    model.fit(X_train, y_train)
    
    return model


def standardize_features(
    X: np.ndarray,
    means: Optional[np.ndarray] = None,
    stds: Optional[np.ndarray] = None,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Standardize features (z-score normalization).
    
    Args:
        X: Feature matrix
        means: Pre-computed means (if None, compute from X)
        stds: Pre-computed stds (if None, compute from X)
    
    Returns:
        (X_standardized, means, stds)
    """
    if means is None:
        means = np.mean(X, axis=0)
    
    if stds is None:
        stds = np.std(X, axis=0)
        stds[stds == 0] = 1  # Avoid division by zero
    
    X_standardized = (X - means) / stds
    
    return X_standardized, means, stds


# ============================================================================
# WALK-FORWARD BACKTEST
# ============================================================================

def run_walkforward_backtest(
    df: pd.DataFrame,
    min_train_samples: int = 500,
    alpha: float = 0.1,
    l1_ratio: float = 0.5,
) -> Tuple[List[Dict], Dict]:
    """
    Run walk-forward backtest with Elastic Net on actual totals.
    
    For each unique date:
    1. Train on all games before that date (if >= min_train_samples)
    2. Predict actual_total on games on that date
    3. Calculate edge vs market line
    4. Determine bet outcome
    
    Returns:
        (results_list, summary_dict)
    """
    print("\n" + "=" * 80)
    print("WALK-FORWARD BACKTEST - ELASTIC NET ON ACTUAL TOTALS")
    print("=" * 80)
    print(f"Total games: {len(df):,}")
    print(f"Date range: {df['date'].min()} to {df['date'].max()}")
    print(f"Min training samples: {min_train_samples:,}")
    print(f"Features: {len(ELASTIC_NET_FEATURES)} (Advanced - same as V2)")
    print(f"Target: actual_total (not residual)")
    print(f"Bet edge range: {MIN_EDGE} to {MAX_EDGE} points")
    print("=" * 80)
    
    unique_dates = sorted(df["date"].unique())
    results = []
    
    # Counters for progress
    total_dates = len(unique_dates)
    models_trained = 0
    total_predictions = 0
    total_bets = 0
    
    for i, test_date in enumerate(unique_dates, 1):
        # Split train/test by date (strict temporal)
        train_df = df[df["date"] < test_date].copy()
        test_df = df[df["date"] == test_date].copy()
        
        # Skip if not enough training data
        if len(train_df) < min_train_samples:
            continue
        
        # Extract features and target (ACTUAL TOTAL, not residual)
        X_train = train_df[ELASTIC_NET_FEATURES].values
        y_train = train_df["actual_total"].values
        
        X_test = test_df[ELASTIC_NET_FEATURES].values
        y_test = test_df["actual_total"].values
        
        # Standardize features
        X_train_std, means, stds = standardize_features(X_train)
        X_test_std, _, _ = standardize_features(X_test, means, stds)
        
        # Train Elastic Net
        model = train_elastic_net(X_train_std, y_train, alpha, l1_ratio)
        models_trained += 1
        
        # Predict on test set
        y_pred = model.predict(X_test_std)
        
        # Process each test game
        for j, (idx, row) in enumerate(test_df.iterrows()):
            pred_total = y_pred[j]
            actual_total = y_test[j]
            market_line = row["consensus_total_line"]
            
            # Calculate edge (model prediction - market line)
            edge = pred_total - market_line
            
            # Determine bet outcome
            bet_direction, profit, result = calculate_bet_outcome(
                edge, actual_total, market_line
            )
            
            # Edge bucket
            edge_bucket = get_edge_bucket(edge) if bet_direction else None
            
            if bet_direction:
                total_bets += 1
            
            # Store result
            results.append({
                "date": row["date"],
                "game_id": row.get("game_id", f"{row['home_team']}_{row['away_team']}"),
                "home_team": row["home_team"],
                "away_team": row["away_team"],
                "actual_total": actual_total,
                "market_line": market_line,
                "pred_total": pred_total,
                "edge": edge,
                "bet_direction": bet_direction,
                "profit": profit,
                "result": result,
                "edge_bucket": edge_bucket,
                "train_samples": len(train_df),
            })
            
            total_predictions += 1
        
        # Progress update
        if i % 50 == 0 or i == total_dates:
            print(f"[{i}/{total_dates}] Processed {test_date} | "
                  f"Models: {models_trained:,} | Predictions: {total_predictions:,} | "
                  f"Bets: {total_bets:,}")
    
    print("\n" + "=" * 80)
    print(f"✅ Backtest complete!")
    print(f"   Models trained: {models_trained:,}")
    print(f"   Total predictions: {total_predictions:,}")
    print(f"   Total bets placed: {total_bets:,}")
    print("=" * 80)
    
    # Calculate summary statistics
    summary = calculate_summary(results)
    
    return results, summary


def calculate_summary(results: List[Dict]) -> Dict:
    """Calculate performance summary."""
    df = pd.DataFrame(results)
    
    # Overall betting stats
    bets_df = df[df["bet_direction"].notna()].copy()
    
    if len(bets_df) == 0:
        print("\n⚠️  WARNING: No bets placed!")
        return {"error": "No bets placed"}
    
    total_bets = len(bets_df)
    total_profit = bets_df["profit"].sum()
    total_wagered = total_bets * 110  # Risk $110 per bet at -110 odds
    roi = (total_profit / total_wagered) * 100
    
    wins = len(bets_df[bets_df["result"] == "WIN"])
    losses = len(bets_df[bets_df["result"] == "LOSS"])
    win_rate = (wins / total_bets) * 100 if total_bets > 0 else 0
    
    # MAE on all predictions
    all_mae = mean_absolute_error(df["actual_total"], df["pred_total"])
    
    # MAE on bets only
    bet_mae = mean_absolute_error(bets_df["actual_total"], bets_df["pred_total"])
    
    # Correlation
    corr, _ = pearsonr(df["actual_total"], df["pred_total"])
    
    print("\n" + "=" * 80)
    print("📊 OVERALL PERFORMANCE - ELASTIC NET ON ACTUAL TOTALS")
    print("=" * 80)
    print(f"Total Bets:        {total_bets:,}")
    print(f"Wins:              {wins:,}")
    print(f"Losses:            {losses:,}")
    print(f"Win Rate:          {win_rate:.2f}%")
    print(f"Total Profit:      ${total_profit:,.2f}")
    print(f"Total Wagered:     ${total_wagered:,.2f}")
    print(f"ROI:               {roi:+.2f}%")
    print(f"MAE (all):         {all_mae:.2f} points")
    print(f"MAE (bets):        {bet_mae:.2f} points")
    print(f"Correlation:       {corr:.4f}")
    print("=" * 80)
    
    # Breakdown by bet direction
    print("\n📈 BY BET DIRECTION:")
    print("-" * 80)
    
    for direction in ["OVER", "UNDER"]:
        dir_df = bets_df[bets_df["bet_direction"] == direction]
        
        if len(dir_df) == 0:
            continue
        
        dir_bets = len(dir_df)
        dir_wins = len(dir_df[dir_df["result"] == "WIN"])
        dir_profit = dir_df["profit"].sum()
        dir_wagered = dir_bets * 110
        dir_roi = (dir_profit / dir_wagered) * 100
        dir_win_rate = (dir_wins / dir_bets) * 100
        
        print(f"{direction:6s}: {dir_bets:4d} bets | "
              f"{dir_win_rate:5.1f}% WR | "
              f"${dir_profit:+8.2f} | "
              f"{dir_roi:+6.2f}% ROI")
    
    # Breakdown by edge bucket
    print("\n📊 BY EDGE BUCKET:")
    print("-" * 80)
    
    for bucket in ["4.0-5.0", "5.0-6.0", "6.0-8.0"]:
        bucket_df = bets_df[bets_df["edge_bucket"] == bucket]
        
        if len(bucket_df) == 0:
            continue
        
        bucket_bets = len(bucket_df)
        bucket_wins = len(bucket_df[bucket_df["result"] == "WIN"])
        bucket_profit = bucket_df["profit"].sum()
        bucket_wagered = bucket_bets * 110
        bucket_roi = (bucket_profit / bucket_wagered) * 100
        bucket_win_rate = (bucket_wins / bucket_bets) * 100
        
        print(f"{bucket:8s}: {bucket_bets:4d} bets | "
              f"{bucket_win_rate:5.1f}% WR | "
              f"${bucket_profit:+8.2f} | "
              f"{bucket_roi:+6.2f}% ROI")
    
    print("=" * 80)
    
    # Build summary dict
    summary = {
        "model": "elastic_net_on_totals_v1",
        "features": ELASTIC_NET_FEATURES,
        "num_features": len(ELASTIC_NET_FEATURES),
        "target": "actual_total",
        "total_predictions": len(df),
        "total_bets": total_bets,
        "wins": wins,
        "losses": losses,
        "win_rate": win_rate,
        "total_profit": total_profit,
        "total_wagered": total_wagered,
        "roi": roi,
        "mae_all": all_mae,
        "mae_bets": bet_mae,
        "correlation": corr,
        "by_direction": {},
        "by_edge_bucket": {},
    }
    
    # Add direction breakdown
    for direction in ["OVER", "UNDER"]:
        dir_df = bets_df[bets_df["bet_direction"] == direction]
        if len(dir_df) > 0:
            summary["by_direction"][direction] = {
                "bets": len(dir_df),
                "wins": len(dir_df[dir_df["result"] == "WIN"]),
                "win_rate": (len(dir_df[dir_df["result"] == "WIN"]) / len(dir_df)) * 100,
                "profit": float(dir_df["profit"].sum()),
                "roi": (dir_df["profit"].sum() / (len(dir_df) * 110)) * 100,
            }
    
    # Add edge bucket breakdown
    for bucket in ["4.0-5.0", "5.0-6.0", "6.0-8.0"]:
        bucket_df = bets_df[bets_df["edge_bucket"] == bucket]
        if len(bucket_df) > 0:
            summary["by_edge_bucket"][bucket] = {
                "bets": len(bucket_df),
                "wins": len(bucket_df[bucket_df["result"] == "WIN"]),
                "win_rate": (len(bucket_df[bucket_df["result"] == "WIN"]) / len(bucket_df)) * 100,
                "profit": float(bucket_df["profit"].sum()),
                "roi": (bucket_df["profit"].sum() / (len(bucket_df) * 110)) * 100,
            }
    
    return summary


# ============================================================================
# MAIN
# ============================================================================

def main():
    args = parse_args()
    
    print("\n" + "=" * 80)
    print("🏀 NBA TOTALS - ELASTIC NET ON ACTUAL TOTALS (RETRAIN)")
    print("=" * 80)
    print("Testing if Elastic Net performs better when trained on totals directly")
    print("Uses same advanced features as V2 LightGBM for fair comparison")
    print("=" * 80)
    
    # Load dataset
    print("\n[LOAD] Loading dataset...")
    df = load_dataset()
    print(f"✅ Loaded {len(df):,} games with market odds")
    
    # Run backtest
    results, summary = run_walkforward_backtest(
        df,
        min_train_samples=args.min_train,
        alpha=args.alpha,
        l1_ratio=args.l1_ratio,
    )
    
    # Save results (with different filename to avoid overwriting)
    results_path = BACKTEST_DIR / "nba_totals_walkforward_elastic_net_on_totals_v1_results.csv"
    summary_path = BACKTEST_DIR / "nba_totals_walkforward_elastic_net_on_totals_v1_summary.json"
    
    print(f"\n[SAVE] Writing results to {results_path}")
    results_df = pd.DataFrame(results)
    results_df.to_csv(results_path, index=False)
    
    print(f"[SAVE] Writing summary to {summary_path}")
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    
    print("\n✅ Backtest complete!")
    print(f"   Results: {results_path}")
    print(f"   Summary: {summary_path}")
    
    # Print final summary
    print("\n" + "=" * 80)
    print("🎯 FINAL RESULTS - ELASTIC NET ON ACTUAL TOTALS")
    print("=" * 80)
    print(f"Total Bets:    {summary['total_bets']:,}")
    print(f"Win Rate:      {summary['win_rate']:.2f}%")
    print(f"ROI:           {summary['roi']:+.2f}%")
    print(f"Total Profit:  ${summary['total_profit']:+,.2f}")
    print("=" * 80)
    
    # Comparison table
    print("\n💡 COMPARISON TABLE:")
    print("-" * 80)
    print("Model                          | Bets | WR%   | ROI%   | OVER ROI | UNDER ROI")
    print("-" * 80)
    print(f"Elastic Net (retrained)        | {summary['total_bets']:4d} | {summary['win_rate']:5.1f} | {summary['roi']:+6.2f} | ", end="")
    if "OVER" in summary["by_direction"]:
        print(f"{summary['by_direction']['OVER']['roi']:+7.2f} | ", end="")
    else:
        print("    N/A | ", end="")
    if "UNDER" in summary["by_direction"]:
        print(f"{summary['by_direction']['UNDER']['roi']:+8.2f}")
    else:
        print("     N/A")
    
    print("Production Elastic Net         |  301 |  53.8 |  +2.75 |  +6.85  |   -0.54")
    print("V2 LightGBM (OVERS-only)       |  161 |  54.7 |  +4.35 |  +4.35  |     N/A")
    print("-" * 80)
    print()


if __name__ == "__main__":
    main()
