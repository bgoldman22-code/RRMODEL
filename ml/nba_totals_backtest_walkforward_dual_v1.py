#!/usr/bin/env python3
"""
NBA Totals Dual-Model Walk-Forward Backtest V1

Combines two complementary models:
1. OVER model: Top-15 residual model (predicts edge = pred_total - market)
2. UNDER model: Classification model (predicts P(actual < market))

Bet logic ensures NO CONFLICTS:
- OVER when: edge >= 4.0 AND edge < 8.0 AND p_under < 0.50
- UNDER when: edge <= -4.0 AND edge > -8.0 AND p_under >= 0.55
- NO BET on conflicts or ambiguous signals

Walk-forward methodology:
- For each date D, train both models on data < D
- Predict on date == D with both models
- Apply conflict resolution logic
- Zero data leakage

Output:
- Per-game results CSV with both model predictions
- Summary JSON with dual-model performance
- Conflict analysis

Usage:
  python ml/nba_totals_backtest_walkforward_dual_v1.py
  python ml/nba_totals_backtest_walkforward_dual_v1.py --min-train 600
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
from sklearn.metrics import mean_absolute_error, roc_auc_score

# ============================================================================
# CONFIGURATION
# ============================================================================

REPO_ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = REPO_ROOT / "data" / "nba" / "datasets"
BACKTEST_DIR = REPO_ROOT / "data" / "nba" / "backtests"

RESIDUAL_DATASET_FILE = "nba_totals_residual_dataset.parquet"
UNDER_DATASET_FILE = "nba_totals_under_dataset.parquet"

# Top-15 features for OVER residual model (from V2)
OVER_FEATURES = [
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

# Features for UNDER classifier
UNDER_CORE_FEATURES = [
    "home_l5_ortg", "home_l5_drtg", "home_l5_pace",
    "away_l5_ortg", "away_l5_drtg", "away_l5_pace",
    "home_season_ft_rate", "home_season_tov_pct", "home_season_orb_pct",
    "away_season_ft_rate", "away_season_tov_pct", "away_season_orb_pct",
    "home_ortg_vs_away_drtg", "away_ortg_vs_home_drtg",
    "ortg_diff", "drtg_diff",
]

UNDER_SPECIFIC_FEATURES = [
    "spread_abs", "spread_squared", "blowout_risk_index",
    "pace_elasticity", "pace_diff",
    "home_pace_suppression_proxy", "away_pace_suppression_proxy",
    "home_def_suppression_proxy", "away_def_suppression_proxy",
    "combined_def_strength",
    "utc_start_hour", "early_game_flag",
    "day_of_week", "weekend_flag",
    "rest_advantage", "both_teams_rested",
    "home_rest_days", "away_rest_days",
    "home_b2b", "away_b2b",
]

UNDER_FEATURES = UNDER_CORE_FEATURES + UNDER_SPECIFIC_FEATURES

# Bet logic thresholds
OVER_EDGE_MIN = 4.0
OVER_EDGE_MAX = 8.0
UNDER_EDGE_MIN = -4.0  # -4.0 is 4 point UNDER edge
UNDER_EDGE_MAX = -8.0  # -8.0 is 8 point UNDER edge
UNDER_PROB_THRESHOLD = 0.55  # Classifier confidence threshold for UNDER bets
OVER_PROB_MAX = 0.50  # UNDER prob must be below this for OVER bets

JUICE = -110  # Standard -110 odds


# ============================================================================
# ARGUMENT PARSING
# ============================================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Dual-Model Walk-Forward Backtest (OVER + UNDER models)"
    )
    parser.add_argument("--min-train", type=int, default=500,
                        help="Minimum training samples before predicting")
    
    # OVER model params
    parser.add_argument("--over-num-boost", type=int, default=300)
    parser.add_argument("--over-max-depth", type=int, default=5)
    parser.add_argument("--over-lr", type=float, default=0.03)
    
    # UNDER model params
    parser.add_argument("--under-num-boost", type=int, default=300)
    parser.add_argument("--under-max-depth", type=int, default=5)
    parser.add_argument("--under-lr", type=float, default=0.03)
    
    parser.add_argument("--early-stopping", type=int, default=30)
    return parser.parse_args()


# ============================================================================
# DATA LOADING
# ============================================================================

def load_and_merge_datasets() -> pd.DataFrame:
    """
    Load both residual and UNDER datasets, merge on (date, home_team, away_team).
    
    This creates a unified dataset with all features from both models.
    """
    residual_path = DATASET_DIR / RESIDUAL_DATASET_FILE
    under_path = DATASET_DIR / UNDER_DATASET_FILE
    
    if not residual_path.exists():
        raise FileNotFoundError(
            f"Residual dataset not found: {residual_path}\n"
            f"Run ml/nba_totals_build_residual_dataset.py first!"
        )
    
    if not under_path.exists():
        raise FileNotFoundError(
            f"UNDER dataset not found: {under_path}\n"
            f"Run ml/nba_totals_build_under_dataset.py first!"
        )
    
    print("\n📂 Loading datasets...")
    df_residual = pd.read_parquet(residual_path)
    df_under = pd.read_parquet(under_path)
    
    print(f"  Residual dataset: {len(df_residual):,} games")
    print(f"  UNDER dataset: {len(df_under):,} games")
    
    # Merge on game identifiers
    # Use residual as base, add UNDER-specific features
    merge_keys = ["date", "home_team", "away_team"]
    
    df = df_residual.merge(
        df_under[merge_keys + UNDER_SPECIFIC_FEATURES + ["target_under_win"]],
        on=merge_keys,
        how="inner",
        suffixes=("", "_under"),
    )
    
    print(f"  Merged dataset: {len(df):,} games")
    
    # Filter to games with market odds
    df = df[df["consensus_total_line"].notna()].copy()
    df.sort_values("date", inplace=True)
    df.reset_index(drop=True, inplace=True)
    
    print(f"  With market odds: {len(df):,} games")
    print(f"  Date range: {df['date'].min()} → {df['date'].max()}")
    
    # Verify features exist
    missing_over = [f for f in OVER_FEATURES if f not in df.columns]
    missing_under = [f for f in UNDER_FEATURES if f not in df.columns]
    
    if missing_over:
        raise ValueError(f"Missing OVER features: {missing_over}")
    
    if missing_under:
        print(f"\n⚠️  Warning: Missing UNDER features (will fill with 0):")
        for feat in missing_under:
            print(f"     - {feat}")
            df[feat] = 0
    
    return df


# ============================================================================
# BET LOGIC WITH CONFLICT RESOLUTION
# ============================================================================

def calculate_dual_bet_outcome(
    over_edge: float,
    under_prob: float,
    actual_total: float,
    market_line: float,
) -> Tuple[Optional[str], Optional[float], Optional[str], bool]:
    """
    Determine bet direction with conflict resolution.
    
    Rules:
    - OVER if: over_edge >= 4.0 AND over_edge < 8.0 AND under_prob < 0.50
    - UNDER if: over_edge <= -4.0 AND over_edge > -8.0 AND under_prob >= 0.55
    - NO BET on conflicts
    
    Returns:
        (bet_direction, profit, result, conflict_flag)
    """
    # Check OVER signal
    over_signal = (over_edge >= OVER_EDGE_MIN and 
                   over_edge < OVER_EDGE_MAX and 
                   under_prob < OVER_PROB_MAX)
    
    # Check UNDER signal
    under_signal = (over_edge <= UNDER_EDGE_MIN and 
                    over_edge > UNDER_EDGE_MAX and 
                    under_prob >= UNDER_PROB_THRESHOLD)
    
    # Conflict detection
    conflict = over_signal and under_signal
    
    if conflict:
        # Both models want to bet opposite sides - NO BET
        return None, None, None, True
    
    if not over_signal and not under_signal:
        # Neither model wants to bet
        return None, None, None, False
    
    # Execute bet
    if over_signal:
        bet_direction = "OVER"
        if actual_total > market_line:
            result = "WIN"
            profit = 100 / 110  # Win $100 on $110 risk
        elif actual_total == market_line:
            result = "PUSH"
            profit = 0.0
        else:
            result = "LOSS"
            profit = -1.0
    else:  # under_signal
        bet_direction = "UNDER"
        if actual_total < market_line:
            result = "WIN"
            profit = 100 / 110
        elif actual_total == market_line:
            result = "PUSH"
            profit = 0.0
        else:
            result = "LOSS"
            profit = -1.0
    
    return bet_direction, profit, result, False


# ============================================================================
# WALK-FORWARD BACKTEST
# ============================================================================

def walk_forward_dual_backtest(df: pd.DataFrame, args: argparse.Namespace) -> pd.DataFrame:
    """
    Run dual-model walk-forward backtest.
    
    For each date D:
    - Train OVER residual model on date < D
    - Train UNDER classifier on date < D
    - Predict on date == D with both models
    - Apply conflict resolution
    - Track outcomes
    """
    print("\n" + "=" * 80)
    print("DUAL-MODEL WALK-FORWARD BACKTEST V1")
    print("=" * 80)
    
    print(f"\n📊 Dataset Info:")
    print(f"  Total games: {len(df):,}")
    print(f"  Date range: {df['date'].min()} → {df['date'].max()}")
    print(f"  OVER features: {len(OVER_FEATURES)}")
    print(f"  UNDER features: {len(UNDER_FEATURES)}")
    
    print(f"\n💰 Bet Logic:")
    print(f"  OVER: {OVER_EDGE_MIN:.1f} <= edge < {OVER_EDGE_MAX:.1f} AND p_under < {OVER_PROB_MAX:.2f}")
    print(f"  UNDER: {UNDER_EDGE_MIN:.1f} <= edge < {UNDER_EDGE_MAX:.1f} AND p_under >= {UNDER_PROB_THRESHOLD:.2f}")
    print(f"  Conflict resolution: NO BET if both signals fire")
    
    # Get unique dates
    unique_dates = sorted(df["date"].unique())
    print(f"\n📅 Walk-Forward Schedule:")
    print(f"  Unique dates: {len(unique_dates)}")
    print(f"  Min training samples: {args.min_train}")
    
    # Storage for results
    results = []
    models_trained = 0
    
    # OVER model params
    over_params = {
        "objective": "regression",
        "metric": "mae",
        "boosting_type": "gbdt",
        "num_leaves": 2 ** args.over_max_depth,
        "max_depth": args.over_max_depth,
        "learning_rate": args.over_lr,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.9,
        "bagging_freq": 1,
        "min_data_in_leaf": 20,
        "lambda_l1": 0.1,
        "lambda_l2": 0.1,
        "verbose": -1,
        "seed": 42,
    }
    
    # UNDER model params
    under_params = {
        "objective": "binary",
        "metric": "auc",
        "boosting_type": "gbdt",
        "num_leaves": 2 ** args.under_max_depth,
        "max_depth": args.under_max_depth,
        "learning_rate": args.under_lr,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.9,
        "bagging_freq": 1,
        "min_data_in_leaf": 20,
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
        
        # Train OVER residual model
        X_over_train = train_df[OVER_FEATURES].values
        y_over_train = train_df["target_residual"].values
        X_over_train = np.nan_to_num(X_over_train, 0)
        
        over_train_data = lgb.Dataset(X_over_train, label=y_over_train, feature_name=OVER_FEATURES)
        over_model = lgb.train(
            over_params,
            over_train_data,
            num_boost_round=args.over_num_boost,
            valid_sets=[over_train_data],
            valid_names=["train"],
            callbacks=[
                lgb.early_stopping(stopping_rounds=args.early_stopping, verbose=False),
                lgb.log_evaluation(period=0),
            ],
        )
        
        # Train UNDER classifier
        X_under_train = train_df[UNDER_FEATURES].values
        y_under_train = train_df["target_under_win"].values
        X_under_train = np.nan_to_num(X_under_train, 0)
        
        under_train_data = lgb.Dataset(X_under_train, label=y_under_train, feature_name=UNDER_FEATURES)
        under_model = lgb.train(
            under_params,
            under_train_data,
            num_boost_round=args.under_num_boost,
            valid_sets=[under_train_data],
            valid_names=["train"],
            callbacks=[
                lgb.early_stopping(stopping_rounds=args.early_stopping, verbose=False),
                lgb.log_evaluation(period=0),
            ],
        )
        
        models_trained += 1
        
        # Predict on today's games
        X_over_pred = pred_df[OVER_FEATURES].values
        X_over_pred = np.nan_to_num(X_over_pred, 0)
        over_residuals = over_model.predict(X_over_pred, num_iteration=over_model.best_iteration)
        
        X_under_pred = pred_df[UNDER_FEATURES].values
        X_under_pred = np.nan_to_num(X_under_pred, 0)
        under_probs = under_model.predict(X_under_pred, num_iteration=under_model.best_iteration)
        
        # Process each game
        for idx, (_, row) in enumerate(pred_df.iterrows()):
            over_residual = over_residuals[idx]
            under_prob = under_probs[idx]
            
            market_line = row["consensus_total_line"]
            actual_total = row["actual_total"]
            
            # Calculate OVER edge
            pred_total = market_line + over_residual
            over_edge = pred_total - market_line  # Same as over_residual
            
            # Evaluate bet with conflict resolution
            bet_direction, profit, result, conflict = calculate_dual_bet_outcome(
                over_edge, under_prob, actual_total, market_line
            )
            
            # Store result
            results.append({
                "date": row["date"],
                "game_id": row["game_id"],
                "home_team": row["home_team"],
                "away_team": row["away_team"],
                "actual_total": actual_total,
                "market_line": market_line,
                "over_pred_residual": over_residual,
                "over_pred_total": pred_total,
                "over_edge": over_edge,
                "under_prob": under_prob,
                "bet_direction": bet_direction,
                "bet_result": result,
                "profit_units": profit,
                "conflict_flag": conflict,
                "train_samples": len(train_df),
                "over_model_trees": over_model.best_iteration,
                "under_model_trees": under_model.best_iteration,
            })
        
        # Progress update
        if i % 50 == 0:
            print(f"  Processed {i}/{len(unique_dates)} dates ({models_trained} dual-models trained)")
    
    print(f"\n✅ Walk-forward complete!")
    print(f"  Dual-models trained: {models_trained}")
    print(f"  Predictions made: {len(results):,}")
    
    return pd.DataFrame(results)


# ============================================================================
# PERFORMANCE ANALYSIS
# ============================================================================

def analyze_dual_performance(results_df: pd.DataFrame) -> Dict:
    """Analyze dual-model backtest performance."""
    print("\n" + "=" * 80)
    print("DUAL-MODEL PERFORMANCE ANALYSIS")
    print("=" * 80)
    
    total_games = len(results_df)
    
    # Conflict analysis
    conflicts = results_df["conflict_flag"].sum()
    conflict_rate = conflicts / total_games * 100
    
    print(f"\n🔀 Conflict Analysis:")
    print(f"  Total games: {total_games:,}")
    print(f"  Conflicts (both models want opposite sides): {int(conflicts)}")
    print(f"  Conflict rate: {conflict_rate:.2f}%")
    
    # Overall bet analysis
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
    
    print(f"\n💰 Overall Betting Performance:")
    print(f"  Total bets: {total_bets:,} ({100*total_bets/total_games:.1f}% of games)")
    print(f"  Wins: {wins} ({win_rate:.1f}%)")
    print(f"  Losses: {losses}")
    print(f"  Pushes: {pushes}")
    print(f"  Total profit: {total_profit:+.2f} units")
    print(f"  ROI: {roi:+.2f}%")
    
    # By model/direction
    print(f"\n📊 Performance by Model:")
    
    summary = {
        "backtest_info": {
            "version": "dual_v1",
            "models": "over_residual_top15 + under_classifier_v1",
            "date_range": {
                "start": str(results_df["date"].min()),
                "end": str(results_df["date"].max()),
            },
            "total_games": total_games,
            "created_at": datetime.now().isoformat(),
        },
        "conflicts": {
            "total": int(conflicts),
            "rate_percent": float(conflict_rate),
        },
        "overall_performance": {
            "total_bets": total_bets,
            "bet_rate_percent": float(100 * total_bets / total_games),
            "wins": wins,
            "losses": losses,
            "pushes": pushes,
            "win_rate": win_rate,
            "profit_units": float(total_profit),
            "roi_percent": roi,
        },
        "by_direction": {},
    }
    
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
        
        summary["by_direction"][direction.lower()] = {
            "bets": len(dir_bets),
            "wins": dir_wins,
            "losses": dir_losses,
            "win_rate": dir_wr,
            "profit": float(dir_profit),
            "roi": dir_roi,
        }
    
    # Model quality metrics (all games, not just bets)
    print(f"\n📈 Model Quality (All Predictions):")
    
    # OVER model: residual MAE and correlation
    over_mae = (results_df["actual_total"] - results_df["over_pred_total"]).abs().mean()
    over_corr, _ = pearsonr(results_df["over_pred_total"], results_df["actual_total"])
    
    print(f"  OVER model:")
    print(f"    MAE: {over_mae:.3f} points")
    print(f"    Correlation: {over_corr:.4f}")
    
    # UNDER model: AUC
    actual_under = (results_df["actual_total"] < results_df["market_line"]).astype(int)
    under_auc = roc_auc_score(actual_under, results_df["under_prob"])
    
    print(f"  UNDER model:")
    print(f"    AUC: {under_auc:.4f}")
    
    summary["model_quality"] = {
        "over_model": {
            "mae": float(over_mae),
            "correlation": float(over_corr),
        },
        "under_model": {
            "auc": float(under_auc),
        },
    }
    
    # Comparison to V2 OVERS-only
    print(f"\n📊 Comparison to V2 OVERS-only:")
    print(f"  V2 OVERS-only: 161 bets, +4.35% ROI, 54.7% WR")
    print(f"  Dual V1 Total:  {total_bets} bets, {roi:+.2f}% ROI, {win_rate:.1f}% WR")
    
    if "over" in summary["by_direction"]:
        over_stats = summary["by_direction"]["over"]
        print(f"  Dual V1 OVERS:  {over_stats['bets']} bets, {over_stats['roi']:+.2f}% ROI, {over_stats['win_rate']:.1f}% WR")
    
    if "under" in summary["by_direction"]:
        under_stats = summary["by_direction"]["under"]
        print(f"  Dual V1 UNDERS: {under_stats['bets']} bets, {under_stats['roi']:+.2f}% ROI, {under_stats['win_rate']:.1f}% WR")
    
    return summary


# ============================================================================
# SAVE RESULTS
# ============================================================================

def save_results(results_df: pd.DataFrame, summary: Dict) -> None:
    """Save backtest results to CSV and JSON."""
    BACKTEST_DIR.mkdir(parents=True, exist_ok=True)
    
    # Save per-game results
    results_path = BACKTEST_DIR / "nba_totals_walkforward_dual_v1_results.csv"
    results_df.to_csv(results_path, index=False)
    print(f"\n💾 Saved results: {results_path.relative_to(REPO_ROOT)}")
    
    # Save summary
    summary_path = BACKTEST_DIR / "nba_totals_walkforward_dual_v1_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"💾 Saved summary: {summary_path.relative_to(REPO_ROOT)}")


# ============================================================================
# MAIN
# ============================================================================

def main() -> None:
    args = parse_args()
    
    print("=" * 80)
    print("NBA TOTALS DUAL-MODEL WALK-FORWARD BACKTEST V1")
    print("=" * 80)
    print("\n🎯 Combining two complementary models:")
    print("   - OVER model: Top-15 residual predictor")
    print("   - UNDER model: Classification predictor")
    print("   - Conflict resolution: NO BET if both signal opposite sides")
    
    # Load and merge datasets
    df = load_and_merge_datasets()
    
    # Run walk-forward backtest
    results_df = walk_forward_dual_backtest(df, args)
    
    # Analyze performance
    summary = analyze_dual_performance(results_df)
    
    # Save results
    save_results(results_df, summary)
    
    print("\n" + "=" * 80)
    print("✅ DUAL-MODEL BACKTEST COMPLETE")
    print("=" * 80)
    
    if summary and "overall_performance" in summary:
        perf = summary["overall_performance"]
        print(f"\n📈 Final Results:")
        print(f"  Games analyzed: {summary['backtest_info']['total_games']:,}")
        print(f"  Bets placed: {perf['total_bets']}")
        print(f"  Win rate: {perf['win_rate']:.1f}%")
        print(f"  Total profit: {perf['profit_units']:+.2f} units")
        print(f"  ROI: {perf['roi_percent']:+.2f}%")
        print(f"  Conflicts avoided: {summary['conflicts']['total']}")
        
        print(f"\n🎯 Key Questions Answered:")
        if "under" in summary.get("by_direction", {}):
            under = summary["by_direction"]["under"]
            if under["roi"] > 0:
                print(f"  ✅ UNDERS are now PROFITABLE: {under['roi']:+.2f}% ROI on {under['bets']} bets")
            else:
                print(f"  ❌ UNDERS still unprofitable: {under['roi']:+.2f}% ROI on {under['bets']} bets")
        else:
            print(f"  ❌ No UNDER bets placed (threshold too high or conflict resolution too aggressive)")
        
        if "over" in summary.get("by_direction", {}):
            over = summary["by_direction"]["over"]
            print(f"  ✅ OVERS preserved: {over['roi']:+.2f}% ROI on {over['bets']} bets (V2: +4.35%)")


if __name__ == "__main__":
    main()
