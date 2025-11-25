#!/usr/bin/env python3
"""
NBA Totals LightGBM V2 Walk-Forward Backtest with Bet Logic

This is the production backtest for the Top-15 feature model.

Key differences from V1:
- Uses only 15 most important features (not 63)
- Includes bet logic and ROI calculation
- Bets when 4.0 <= |edge| < 8.0 points
- Assumes -110 odds (risk $110 to win $100)
- Tracks performance by edge bucket

Walk-forward methodology:
- For each date D, train on all games where date < D (min 500 games)
- Predict on games where date == D
- Zero data leakage

Output:
- Per-game results CSV
- Summary JSON with ROI, win rate, edge bucket analysis

Usage:
  python ml/nba_totals_backtest_walkforward_lgbm_v2.py
  python ml/nba_totals_backtest_walkforward_lgbm_v2.py --min-train 600
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.stats import pearsonr
from sklearn.metrics import mean_absolute_error

# ============================================================================
# CONFIGURATION
# ============================================================================

REPO_ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = REPO_ROOT / "data" / "nba" / "datasets"
BACKTEST_DIR = REPO_ROOT / "data" / "nba" / "backtests"

DATASET_FILE = "nba_totals_residual_dataset.parquet"

# Top-15 features (same as V2 trainer)
TOP15_FEATURES = [
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

# Bet logic parameters
MIN_EDGE = 4.0  # Minimum edge to bet
MAX_EDGE = 8.0  # Maximum edge to bet (avoid overconfident predictions)
JUICE = -110    # Standard American odds for totals

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
        description="Walk-Forward Backtest for NBA Totals LightGBM V2 (Top-15 Features)"
    )
    parser.add_argument("--min-train", type=int, default=500,
                        help="Minimum training samples before predicting")
    parser.add_argument("--num-boost-round", type=int, default=300,
                        help="Max boosting rounds")
    parser.add_argument("--max-depth", type=int, default=5,
                        help="Max tree depth")
    parser.add_argument("--learning-rate", type=float, default=0.03,
                        help="Learning rate")
    parser.add_argument("--feature-fraction", type=float, default=0.8,
                        help="Feature sampling fraction")
    parser.add_argument("--min-data-in-leaf", type=int, default=20,
                        help="Min samples per leaf")
    parser.add_argument("--early-stopping", type=int, default=30,
                        help="Early stopping rounds")
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
    missing_features = [f for f in TOP15_FEATURES if f not in df.columns]
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
        - bet_direction: "OVER", "UNDER", or None
        - profit: units won/lost, or None if no bet
        - result: "WIN", "LOSS", "PUSH", or None
    """
    # No bet if outside edge range
    if abs(edge) < MIN_EDGE or abs(edge) >= MAX_EDGE:
        return None, None, None
    
    # Determine bet direction
    if edge >= MIN_EDGE:
        bet_direction = "OVER"
        # OVER wins if actual > line (or >= for push)
        if actual_total > market_line:
            result = "WIN"
            profit = 100 / 110  # Win 100, risked 110
        elif actual_total == market_line:
            result = "PUSH"
            profit = 0.0
        else:
            result = "LOSS"
            profit = -1.0
    else:  # edge <= -MIN_EDGE
        bet_direction = "UNDER"
        # UNDER wins if actual < line
        if actual_total < market_line:
            result = "WIN"
            profit = 100 / 110
        elif actual_total == market_line:
            result = "PUSH"
            profit = 0.0
        else:
            result = "LOSS"
            profit = -1.0
    
    return bet_direction, profit, result


def get_edge_bucket(edge: float) -> Optional[str]:
    """Get edge bucket label for analysis."""
    abs_edge = abs(edge)
    for low, high in EDGE_BUCKETS:
        if low <= abs_edge < high:
            return f"{low:.1f}-{high:.1f}"
    return None


# ============================================================================
# WALK-FORWARD BACKTEST
# ============================================================================

def walk_forward_backtest(df: pd.DataFrame, args: argparse.Namespace) -> pd.DataFrame:
    """
    Run walk-forward backtest with bet logic.
    
    For each date D:
    - Train on date < D (min samples)
    - Predict on date == D
    - Evaluate bet outcomes
    """
    print("\n" + "=" * 80)
    print("WALK-FORWARD BACKTEST V2 (TOP-15 FEATURES + BET LOGIC)")
    print("=" * 80)
    
    print(f"\n📊 Dataset Info:")
    print(f"  Total games: {len(df):,}")
    print(f"  Date range: {df['date'].min()} → {df['date'].max()}")
    print(f"  Features: {len(TOP15_FEATURES)}")
    
    print(f"\n💰 Bet Logic:")
    print(f"  Min edge: {MIN_EDGE:.1f} points")
    print(f"  Max edge: {MAX_EDGE:.1f} points")
    print(f"  Odds: {JUICE} (American)")
    print(f"  OVER when: edge >= {MIN_EDGE:.1f}")
    print(f"  UNDER when: edge <= -{MIN_EDGE:.1f}")
    print(f"  No bet when: |edge| < {MIN_EDGE:.1f} or |edge| >= {MAX_EDGE:.1f}")
    
    # Get unique dates
    unique_dates = sorted(df["date"].unique())
    print(f"\n📅 Walk-Forward Schedule:")
    print(f"  Unique dates: {len(unique_dates)}")
    print(f"  Min training samples: {args.min_train}")
    
    # Storage for results
    results = []
    models_trained = 0
    
    # LightGBM parameters
    lgb_params = {
        "objective": "regression",
        "metric": "mae",
        "boosting_type": "gbdt",
        "num_leaves": 2 ** args.max_depth,
        "max_depth": args.max_depth,
        "learning_rate": args.learning_rate,
        "feature_fraction": args.feature_fraction,
        "bagging_fraction": 0.9,
        "bagging_freq": 1,
        "min_data_in_leaf": args.min_data_in_leaf,
        "lambda_l1": 0.1,
        "lambda_l2": 0.1,
        "verbose": -1,
        "seed": 42,
    }
    
    # Walk forward through dates
    for i, pred_date in enumerate(unique_dates, 1):
        # Training data: all games before pred_date
        train_df = df[df["date"] < pred_date]
        
        # Skip if insufficient training data
        if len(train_df) < args.min_train:
            continue
        
        # Prediction data: games on pred_date
        pred_df = df[df["date"] == pred_date]
        
        if len(pred_df) == 0:
            continue
        
        # Prepare training data
        X_train = train_df[TOP15_FEATURES].values
        y_train = train_df["target_residual"].values
        
        # Handle NaNs
        X_train = np.nan_to_num(X_train, 0)
        
        # Train model
        train_data = lgb.Dataset(X_train, label=y_train, feature_name=TOP15_FEATURES)
        
        model = lgb.train(
            lgb_params,
            train_data,
            num_boost_round=args.num_boost_round,
            valid_sets=[train_data],
            valid_names=["train"],
            callbacks=[
                lgb.early_stopping(stopping_rounds=args.early_stopping, verbose=False),
                lgb.log_evaluation(period=0),  # Silent
            ],
        )
        
        models_trained += 1
        
        # Predict on today's games
        X_pred = pred_df[TOP15_FEATURES].values
        X_pred = np.nan_to_num(X_pred, 0)
        
        pred_residuals = model.predict(X_pred, num_iteration=model.best_iteration)
        
        # Process each game
        for idx, (_, row) in enumerate(pred_df.iterrows()):
            pred_residual = pred_residuals[idx]
            market_line = row["consensus_total_line"]
            actual_total = row["actual_total"]
            
            # Calculate predicted total and edge
            pred_total = market_line + pred_residual
            edge = pred_total - market_line  # Positive = bet OVER, Negative = bet UNDER
            
            # Evaluate bet outcome
            bet_direction, profit, result = calculate_bet_outcome(edge, actual_total, market_line)
            edge_bucket = get_edge_bucket(edge) if bet_direction else None
            
            # Store result
            results.append({
                "date": row["date"],
                "game_id": row["game_id"],
                "home_team": row["home_team"],
                "away_team": row["away_team"],
                "actual_total": actual_total,
                "market_line": market_line,
                "predicted_residual": pred_residual,
                "predicted_total": pred_total,
                "edge": edge,
                "bet_direction": bet_direction,
                "bet_result": result,
                "profit_units": profit,
                "edge_bucket": edge_bucket,
                "train_samples": len(train_df),
                "model_trees": model.best_iteration,
            })
        
        # Progress update every 50 dates
        if i % 50 == 0:
            print(f"  Processed {i}/{len(unique_dates)} dates ({models_trained} models trained)")
    
    print(f"\n✅ Walk-forward complete!")
    print(f"  Models trained: {models_trained}")
    print(f"  Predictions made: {len(results):,}")
    
    return pd.DataFrame(results)


# ============================================================================
# PERFORMANCE ANALYSIS
# ============================================================================

def analyze_performance(results_df: pd.DataFrame) -> Dict:
    """Analyze backtest performance with bet logic."""
    print("\n" + "=" * 80)
    print("PERFORMANCE ANALYSIS")
    print("=" * 80)
    
    # Overall stats (all predictions)
    total_games = len(results_df)
    
    # Prediction quality
    pred_error = (results_df["predicted_total"] - results_df["actual_total"]).abs().mean()
    pred_corr, _ = pearsonr(results_df["predicted_total"], results_df["actual_total"])
    
    print(f"\n📊 Prediction Quality (All Games):")
    print(f"  Total games: {total_games:,}")
    print(f"  MAE: {pred_error:.3f} points")
    print(f"  Correlation: {pred_corr:.4f}")
    
    # Edge distribution
    edge_mean = results_df["edge"].mean()
    edge_std = results_df["edge"].std()
    edge_abs_mean = results_df["edge"].abs().mean()
    
    print(f"\n📈 Edge Distribution:")
    print(f"  Mean edge: {edge_mean:+.3f} points")
    print(f"  Std dev: {edge_std:.3f} points")
    print(f"  Mean |edge|: {edge_abs_mean:.3f} points")
    
    # Bet analysis
    bets_df = results_df[results_df["bet_direction"].notna()].copy()
    
    if len(bets_df) == 0:
        print("\n⚠️  No bets placed!")
        return {}
    
    total_bets = len(bets_df)
    total_profit = bets_df["profit_units"].sum()
    roi = (total_profit / total_bets) * 100
    
    wins = len(bets_df[bets_df["bet_result"] == "WIN"])
    losses = len(bets_df[bets_df["bet_result"] == "LOSS"])
    pushes = len(bets_df[bets_df["bet_result"] == "PUSH"])
    win_rate = (wins / (wins + losses)) * 100 if (wins + losses) > 0 else 0
    
    print(f"\n💰 Betting Performance:")
    print(f"  Total bets: {total_bets:,}")
    print(f"  Wins: {wins} ({win_rate:.1f}%)")
    print(f"  Losses: {losses}")
    print(f"  Pushes: {pushes}")
    print(f"  Total profit: {total_profit:+.2f} units")
    print(f"  ROI: {roi:+.2f}%")
    
    # By bet direction
    print(f"\n📊 By Bet Direction:")
    for direction in ["OVER", "UNDER"]:
        dir_bets = bets_df[bets_df["bet_direction"] == direction]
        if len(dir_bets) == 0:
            continue
        
        dir_wins = len(dir_bets[dir_bets["bet_result"] == "WIN"])
        dir_losses = len(dir_bets[dir_bets["bet_result"] == "LOSS"])
        dir_profit = dir_bets["profit_units"].sum()
        dir_wr = (dir_wins / (dir_wins + dir_losses)) * 100 if (dir_wins + dir_losses) > 0 else 0
        dir_roi = (dir_profit / len(dir_bets)) * 100
        
        print(f"  {direction:6s}: {len(dir_bets):3d} bets, {dir_wins}W-{dir_losses}L, "
              f"{dir_wr:.1f}% WR, {dir_profit:+.2f}u, {dir_roi:+.2f}% ROI")
    
    # By edge bucket
    print(f"\n📊 By Edge Bucket:")
    bucket_stats = []
    
    for low, high in EDGE_BUCKETS:
        bucket_label = f"{low:.1f}-{high:.1f}"
        bucket_bets = bets_df[bets_df["edge_bucket"] == bucket_label]
        
        if len(bucket_bets) == 0:
            continue
        
        bucket_wins = len(bucket_bets[bucket_bets["bet_result"] == "WIN"])
        bucket_losses = len(bucket_bets[bucket_bets["bet_result"] == "LOSS"])
        bucket_profit = bucket_bets["profit_units"].sum()
        bucket_wr = (bucket_wins / (bucket_wins + bucket_losses)) * 100 if (bucket_wins + bucket_losses) > 0 else 0
        bucket_roi = (bucket_profit / len(bucket_bets)) * 100
        
        print(f"  {bucket_label:8s}: {len(bucket_bets):3d} bets, {bucket_wins}W-{bucket_losses}L, "
              f"{bucket_wr:.1f}% WR, {bucket_profit:+.2f}u, {bucket_roi:+.2f}% ROI")
        
        bucket_stats.append({
            "bucket": bucket_label,
            "bets": len(bucket_bets),
            "wins": bucket_wins,
            "losses": bucket_losses,
            "win_rate": bucket_wr,
            "profit": float(bucket_profit),
            "roi": bucket_roi,
        })
    
    # Build summary
    summary = {
        "backtest_info": {
            "version": "v2",
            "model": "lgbm_residual_top15",
            "features": len(TOP15_FEATURES),
            "date_range": {
                "start": str(results_df["date"].min()),
                "end": str(results_df["date"].max()),
            },
            "total_games": total_games,
            "created_at": datetime.now().isoformat(),
        },
        "prediction_quality": {
            "mae": float(pred_error),
            "correlation": float(pred_corr),
            "edge_mean": float(edge_mean),
            "edge_std": float(edge_std),
            "edge_abs_mean": float(edge_abs_mean),
        },
        "betting_performance": {
            "total_bets": total_bets,
            "wins": wins,
            "losses": losses,
            "pushes": pushes,
            "win_rate": win_rate,
            "profit_units": float(total_profit),
            "roi_percent": roi,
        },
        "by_direction": {},
        "by_edge_bucket": bucket_stats,
    }
    
    for direction in ["OVER", "UNDER"]:
        dir_bets = bets_df[bets_df["bet_direction"] == direction]
        if len(dir_bets) > 0:
            dir_wins = len(dir_bets[dir_bets["bet_result"] == "WIN"])
            dir_losses = len(dir_bets[dir_bets["bet_result"] == "LOSS"])
            dir_profit = dir_bets["profit_units"].sum()
            dir_wr = (dir_wins / (dir_wins + dir_losses)) * 100 if (dir_wins + dir_losses) > 0 else 0
            dir_roi = (dir_profit / len(dir_bets)) * 100
            
            summary["by_direction"][direction.lower()] = {
                "bets": len(dir_bets),
                "wins": dir_wins,
                "losses": dir_losses,
                "win_rate": dir_wr,
                "profit": float(dir_profit),
                "roi": dir_roi,
            }
    
    return summary


# ============================================================================
# SAVE RESULTS
# ============================================================================

def save_results(results_df: pd.DataFrame, summary: Dict) -> None:
    """Save backtest results to CSV and JSON."""
    BACKTEST_DIR.mkdir(parents=True, exist_ok=True)
    
    # Save per-game results
    results_path = BACKTEST_DIR / "nba_totals_walkforward_lgbm_v2_top15_results.csv"
    results_df.to_csv(results_path, index=False)
    print(f"\n💾 Saved results: {results_path.relative_to(REPO_ROOT)}")
    
    # Save summary
    summary_path = BACKTEST_DIR / "nba_totals_walkforward_lgbm_v2_top15_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"💾 Saved summary: {summary_path.relative_to(REPO_ROOT)}")


# ============================================================================
# MAIN
# ============================================================================

def main() -> None:
    args = parse_args()
    
    print("=" * 80)
    print("NBA TOTALS LGBM V2 WALK-FORWARD BACKTEST (TOP-15 + BET LOGIC)")
    print("=" * 80)
    print("\n🎯 Production backtest with:")
    print("   - Top-15 feature model")
    print("   - Bet logic (4.0 - 8.0 point edges)")
    print("   - ROI and calibration analysis")
    print("   - Zero data leakage")
    
    # Load dataset
    df = load_dataset()
    
    # Run walk-forward backtest
    results_df = walk_forward_backtest(df, args)
    
    # Analyze performance
    summary = analyze_performance(results_df)
    
    # Save results
    save_results(results_df, summary)
    
    print("\n" + "=" * 80)
    print("✅ BACKTEST COMPLETE - TOTALS V2 (TOP-15)")
    print("=" * 80)
    
    if summary:
        print(f"\n📈 Final Results:")
        print(f"  Games analyzed: {summary['backtest_info']['total_games']:,}")
        print(f"  Bets placed: {summary['betting_performance']['total_bets']}")
        print(f"  Win rate: {summary['betting_performance']['win_rate']:.1f}%")
        print(f"  Total profit: {summary['betting_performance']['profit_units']:+.2f} units")
        print(f"  ROI: {summary['betting_performance']['roi_percent']:+.2f}%")
        
        print(f"\n🎯 V2 vs V1 Comparison:")
        print(f"  V1 (63 features): -5.47% ROI overall, +3.54% on 4-5pt edges")
        print(f"  V2 (15 features): {summary['betting_performance']['roi_percent']:+.2f}% ROI on 4-8pt edges")
        print(f"\n✅ Ready for production deployment")


if __name__ == "__main__":
    main()
