#!/usr/bin/env python3
"""
NBA Totals Production 70/30 Blend Backtest

This replicates EXACTLY what production does:
- 70% matchup-based formula (ORTGs × pace)
- 30% Elastic Net model
- Blended prediction for final total

This should match the behavior seen in user's screenshots where:
- Most picks are UNDERS
- Edges are high (10-15 points)
- Few OVER picks

Purpose: Diagnose why production behaves differently than pure model backtest.

Usage:
  python ml/nba_totals_backtest_production_70_30_blend.py
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

# Use residual dataset (has all features we need)
DATASET_FILE = "nba_totals_residual_dataset.parquet"

# 18 features for Elastic Net (from production models-inline.mjs)
ELASTIC_NET_FEATURES = [
    "home_l10_fgPct",
    "home_l10_fg3Pct",
    "home_l10_ftPct",
    "home_l10_rebounds",
    "home_l10_assists",
    "home_l10_turnovers",
    "away_l10_fgPct",
    "away_l10_fg3Pct",
    "away_l10_ftPct",
    "away_l10_rebounds",
    "away_l10_assists",
    "away_l10_turnovers",
    "fgPct_diff",
    "fg3Pct_diff",
    "rebounds_diff",
    "assists_diff",
    "turnovers_diff",
    "home_court",
]

# Features needed for matchup formula
MATCHUP_FEATURES = [
    "home_l10_ortg",
    "home_l10_drtg",
    "away_l10_ortg",
    "away_l10_drtg",
    "home_l10_pace",
    "away_l10_pace",
]

# Bet logic parameters
MIN_EDGE = 4.0
MAX_EDGE = 8.0
JUICE = -110

# Edge buckets
EDGE_BUCKETS = [
    (4.0, 5.0),
    (5.0, 6.0),
    (6.0, 8.0),
]

# BLEND RATIO (matching production)
MATCHUP_WEIGHT = 0.7  # 70% physics-based
MODEL_WEIGHT = 0.3    # 30% ML model

# League average defensive rating (for normalization)
LEAGUE_AVG_DRTG = 112.6


# ============================================================================
# DATA LOADING
# ============================================================================

def load_dataset() -> pd.DataFrame:
    """Load residual dataset with all features."""
    dataset_path = DATASET_DIR / DATASET_FILE
    
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")
    
    df = pd.read_parquet(dataset_path)
    
    # Filter to games with market odds
    df = df[df["consensus_total_line"].notna()].copy()
    df.sort_values("date", inplace=True)
    df.reset_index(drop=True, inplace=True)
    
    # Map advanced features to basic names for Elastic Net
    # (EFG as proxy for FG%, etc.)
    if "home_l10_fgPct" not in df.columns:
        print("[FEATURE MAPPING] Mapping advanced → basic features...")
        df["home_l10_fgPct"] = df["home_l10_efg"]
        df["home_l10_fg3Pct"] = df["home_l10_efg"]  # Proxy
        df["home_l10_ftPct"] = df["home_l10_ft_rate"]
        df["home_l10_rebounds"] = df["home_l10_orb_pct"]  # Proxy
        df["home_l10_assists"] = df["home_l10_ortg"]  # Proxy
        df["home_l10_turnovers"] = df["home_l10_tov_pct"]
        
        df["away_l10_fgPct"] = df["away_l10_efg"]
        df["away_l10_fg3Pct"] = df["away_l10_efg"]
        df["away_l10_ftPct"] = df["away_l10_ft_rate"]
        df["away_l10_rebounds"] = df["away_l10_orb_pct"]
        df["away_l10_assists"] = df["away_l10_ortg"]
        df["away_l10_turnovers"] = df["away_l10_tov_pct"]
        
        df["fgPct_diff"] = df["home_l10_fgPct"] - df["away_l10_fgPct"]
        df["fg3Pct_diff"] = df["home_l10_fg3Pct"] - df["away_l10_fg3Pct"]
        df["rebounds_diff"] = df["home_l10_rebounds"] - df["away_l10_rebounds"]
        df["assists_diff"] = df["home_l10_assists"] - df["away_l10_assists"]
        df["turnovers_diff"] = df["home_l10_turnovers"] - df["away_l10_turnovers"]
        df["home_court"] = 1
    
    # Verify all features exist
    missing = [f for f in ELASTIC_NET_FEATURES + MATCHUP_FEATURES if f not in df.columns]
    if missing:
        raise ValueError(f"Missing features: {missing}")
    
    return df


# ============================================================================
# BET LOGIC
# ============================================================================

def calculate_bet_outcome(
    edge: float,
    actual_total: float,
    market_line: float,
) -> Tuple[Optional[str], Optional[float], Optional[str]]:
    """Determine bet direction, outcome, and profit."""
    if abs(edge) < MIN_EDGE or abs(edge) > MAX_EDGE:
        return None, None, None
    
    if edge > 0:
        bet_direction = "OVER"
        bet_won = actual_total > market_line
    else:
        bet_direction = "UNDER"
        bet_won = actual_total < market_line
    
    if bet_won:
        profit = 100.0
        result = "WIN"
    else:
        profit = -110.0
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
# MODEL PREDICTION
# ============================================================================

def train_elastic_net(
    X_train: np.ndarray,
    y_train: np.ndarray,
    alpha: float = 0.1,
    l1_ratio: float = 0.5,
) -> ElasticNet:
    """Train Elastic Net model."""
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
    """Standardize features (z-score)."""
    if means is None:
        means = np.mean(X, axis=0)
    
    if stds is None:
        stds = np.std(X, axis=0)
        stds[stds == 0] = 1
    
    X_standardized = (X - means) / stds
    
    return X_standardized, means, stds


def calculate_matchup_formula(row: pd.Series) -> float:
    """
    Calculate matchup-based total (production logic).
    
    This is the 70% component from production code:
    homeExpectedPts = home_ortg × (away_drtg / league_avg_drtg) × (avg_pace / 100)
    awayExpectedPts = away_ortg × (home_drtg / league_avg_drtg) × (avg_pace / 100)
    total = homeExpectedPts + awayExpectedPts
    """
    home_ortg = row["home_l10_ortg"]
    home_drtg = row["home_l10_drtg"]
    away_ortg = row["away_l10_ortg"]
    away_drtg = row["away_l10_drtg"]
    
    avg_pace = (row["home_l10_pace"] + row["away_l10_pace"]) / 2
    
    # Home team scoring (adjusted for away defense)
    home_def_adj = away_drtg / LEAGUE_AVG_DRTG
    home_expected_pts = home_ortg * home_def_adj * (avg_pace / 100)
    
    # Away team scoring (adjusted for home defense)
    away_def_adj = home_drtg / LEAGUE_AVG_DRTG
    away_expected_pts = away_ortg * away_def_adj * (avg_pace / 100)
    
    total_from_matchup = home_expected_pts + away_expected_pts
    
    return total_from_matchup


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
    Run walk-forward backtest with 70/30 blend.
    
    For each date:
    1. Train Elastic Net on historical data
    2. Calculate matchup formula total
    3. Blend: 70% matchup + 30% model
    4. Calculate edge vs market
    5. Determine bet outcome
    """
    print("\n" + "=" * 80)
    print("WALK-FORWARD BACKTEST - PRODUCTION 70/30 BLEND")
    print("=" * 80)
    print(f"Total games: {len(df):,}")
    print(f"Date range: {df['date'].min()} to {df['date'].max()}")
    print(f"Min training samples: {min_train_samples:,}")
    print(f"Blend: {MATCHUP_WEIGHT:.0%} matchup + {MODEL_WEIGHT:.0%} model")
    print(f"Bet edge range: {MIN_EDGE} to {MAX_EDGE} points")
    print("=" * 80)
    
    unique_dates = sorted(df["date"].unique())
    results = []
    
    total_dates = len(unique_dates)
    models_trained = 0
    total_predictions = 0
    total_bets = 0
    
    for i, test_date in enumerate(unique_dates, 1):
        train_df = df[df["date"] < test_date].copy()
        test_df = df[df["date"] == test_date].copy()
        
        if len(train_df) < min_train_samples:
            continue
        
        # Train Elastic Net model
        X_train = train_df[ELASTIC_NET_FEATURES].values
        y_train = train_df["actual_total"].values
        
        X_test = test_df[ELASTIC_NET_FEATURES].values
        y_test = test_df["actual_total"].values
        
        X_train_std, means, stds = standardize_features(X_train)
        X_test_std, _, _ = standardize_features(X_test, means, stds)
        
        model = train_elastic_net(X_train_std, y_train, alpha, l1_ratio)
        models_trained += 1
        
        # Predict with model (30% component)
        model_predictions = model.predict(X_test_std)
        
        # Process each test game
        for j, (idx, row) in enumerate(test_df.iterrows()):
            # Get model prediction (30%)
            pred_model = model_predictions[j]
            
            # Calculate matchup formula (70%)
            pred_matchup = calculate_matchup_formula(row)
            
            # BLEND: 70% matchup + 30% model (PRODUCTION LOGIC)
            pred_total_blended = (MATCHUP_WEIGHT * pred_matchup) + (MODEL_WEIGHT * pred_model)
            
            actual_total = y_test[j]
            market_line = row["consensus_total_line"]
            
            # Calculate edge (blended prediction - market)
            edge = pred_total_blended - market_line
            
            # Determine bet outcome
            bet_direction, profit, result = calculate_bet_outcome(
                edge, actual_total, market_line
            )
            
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
                "pred_model": pred_model,
                "pred_matchup": pred_matchup,
                "pred_blended": pred_total_blended,
                "edge": edge,
                "bet_direction": bet_direction,
                "profit": profit,
                "result": result,
                "edge_bucket": edge_bucket,
                "train_samples": len(train_df),
            })
            
            total_predictions += 1
        
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
    
    summary = calculate_summary(results)
    
    return results, summary


def calculate_summary(results: List[Dict]) -> Dict:
    """Calculate performance summary."""
    df = pd.DataFrame(results)
    
    bets_df = df[df["bet_direction"].notna()].copy()
    
    if len(bets_df) == 0:
        print("\n⚠️  WARNING: No bets placed!")
        return {"error": "No bets placed"}
    
    total_bets = len(bets_df)
    total_profit = bets_df["profit"].sum()
    total_wagered = total_bets * 110
    roi = (total_profit / total_wagered) * 100
    
    wins = len(bets_df[bets_df["result"] == "WIN"])
    losses = len(bets_df[bets_df["result"] == "LOSS"])
    win_rate = (wins / total_bets) * 100 if total_bets > 0 else 0
    
    # MAE on all predictions (using blended)
    all_mae = mean_absolute_error(df["actual_total"], df["pred_blended"])
    bet_mae = mean_absolute_error(bets_df["actual_total"], bets_df["pred_blended"])
    
    # Correlation
    corr, _ = pearsonr(df["actual_total"], df["pred_blended"])
    
    # Average predictions
    avg_model = df["pred_model"].mean()
    avg_matchup = df["pred_matchup"].mean()
    avg_blended = df["pred_blended"].mean()
    avg_actual = df["actual_total"].mean()
    avg_market = df["market_line"].mean()
    
    print("\n" + "=" * 80)
    print("📊 OVERALL PERFORMANCE - PRODUCTION 70/30 BLEND")
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
    
    print("\n📊 PREDICTION AVERAGES:")
    print("-" * 80)
    print(f"Avg Model Pred:    {avg_model:.1f} (30% weight)")
    print(f"Avg Matchup Pred:  {avg_matchup:.1f} (70% weight)")
    print(f"Avg Blended Pred:  {avg_blended:.1f} (final)")
    print(f"Avg Market Line:   {avg_market:.1f}")
    print(f"Avg Actual Total:  {avg_actual:.1f}")
    print(f"Bias (pred - act): {avg_blended - avg_actual:+.1f}")
    print(f"Edge (pred - mkt): {avg_blended - avg_market:+.1f}")
    print("=" * 80)
    
    # Breakdown by direction
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
        "model": "production_70_30_blend",
        "matchup_weight": MATCHUP_WEIGHT,
        "model_weight": MODEL_WEIGHT,
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
        "avg_predictions": {
            "model": float(avg_model),
            "matchup": float(avg_matchup),
            "blended": float(avg_blended),
            "market": float(avg_market),
            "actual": float(avg_actual),
            "bias": float(avg_blended - avg_actual),
            "edge": float(avg_blended - avg_market),
        },
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
    parser = argparse.ArgumentParser(
        description="Backtest production 70/30 blend (matchup + model)"
    )
    parser.add_argument("--min-train", type=int, default=500)
    parser.add_argument("--alpha", type=float, default=0.1)
    parser.add_argument("--l1-ratio", type=float, default=0.5)
    args = parser.parse_args()
    
    print("\n" + "=" * 80)
    print("🏀 NBA TOTALS - PRODUCTION 70/30 BLEND BACKTEST")
    print("=" * 80)
    print("Testing ACTUAL production behavior:")
    print("  70% Matchup Formula (ORTG × DRTG × pace)")
    print("  30% Elastic Net Model")
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
    
    # Save results
    results_path = BACKTEST_DIR / "nba_totals_production_70_30_blend_results.csv"
    summary_path = BACKTEST_DIR / "nba_totals_production_70_30_blend_summary.json"
    
    print(f"\n[SAVE] Writing results to {results_path}")
    results_df = pd.DataFrame(results)
    results_df.to_csv(results_path, index=False)
    
    print(f"[SAVE] Writing summary to {summary_path}")
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    
    print("\n✅ Backtest complete!")
    print(f"   Results: {results_path}")
    print(f"   Summary: {summary_path}")
    
    # Final comparison
    print("\n" + "=" * 80)
    print("🎯 FINAL COMPARISON")
    print("=" * 80)
    print("Model                          | Bets | WR%   | ROI%   | OVER ROI | UNDER ROI")
    print("-" * 80)
    print(f"Production 70/30 Blend         | {summary['total_bets']:4d} | {summary['win_rate']:5.1f} | {summary['roi']:+6.2f} | ", end="")
    if "OVER" in summary["by_direction"]:
        print(f"{summary['by_direction']['OVER']['roi']:+7.2f} | ", end="")
    else:
        print("    N/A | ", end="")
    if "UNDER" in summary["by_direction"]:
        print(f"{summary['by_direction']['UNDER']['roi']:+8.2f}")
    else:
        print("     N/A")
    
    print("Production Elastic Net (100%)  |  301 |  53.8 |  +2.75 |  +6.85  |   -0.54")
    print("V2 LightGBM (OVERS-only)       |  161 |  54.7 |  +4.35 |  +4.35  |     N/A")
    print("-" * 80)
    
    # Diagnosis
    print("\n💡 DIAGNOSIS:")
    if summary["avg_predictions"]["edge"] < 0:
        print("   ⚠️  Blended predictions are LOWER than market (negative bias)")
        print("   → This explains why production shows mostly UNDERS")
    else:
        print("   ✅ Blended predictions match expected behavior")
    
    print()


if __name__ == "__main__":
    main()
