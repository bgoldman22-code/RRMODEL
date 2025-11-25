#!/usr/bin/env python3
"""
NBA Totals Walk-Forward Backtest - LightGBM Residual Model

TRUE WALK-FORWARD VALIDATION WITH ZERO DATA LEAKAGE:
- For each date D, train ONLY on games with date < D
- Retrain LightGBM model from scratch at each step
- Predict RESIDUALS (actual - market), not raw totals
- Convert to totals: predicted_total = market_line + predicted_residual
- No reuse of pre-trained model artifacts
- Strict temporal ordering enforced

This backtest is designed to be production-safe: the results can be trusted
for real-world trading decisions.

Usage:
  python ml/nba_totals_backtest_walkforward_lgbm_v1.py
  python ml/nba_totals_backtest_walkforward_lgbm_v1.py --edge-threshold 5.0
"""

import json
import os
import argparse
from pathlib import Path
from datetime import datetime
import warnings

import pandas as pd
import numpy as np
import lightgbm as lgb

warnings.filterwarnings('ignore')

# ============================================================================
# DEFAULT CONFIGURATION
# ============================================================================

# Training parameters
MIN_TRAIN_GAMES = 500          # Minimum games needed before making predictions
TRAIN_WINDOW_TYPE = "expanding"  # "expanding" or "rolling"
ROLLING_WINDOW_GAMES = 1500    # Only used if TRAIN_WINDOW_TYPE = "rolling"

# LightGBM parameters (matching trained model)
LGBM_PARAMS = {
    "objective": "regression",
    "metric": ["rmse", "mae"],
    "boosting_type": "gbdt",
    "num_leaves": 32,
    "max_depth": 5,
    "learning_rate": 0.03,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.9,
    "bagging_freq": 1,
    "min_data_in_leaf": 20,
    "lambda_l1": 0.1,
    "lambda_l2": 0.1,
    "verbose": -1,
    "seed": 42,
}
NUM_BOOST_ROUND = 50  # Conservative (early stopped at 12 in static training)

# Betting parameters
EDGE_THRESHOLD = 3.0          # Minimum absolute edge to place bet (points)
DEFAULT_ODDS = -110           # Flat odds assumption

# Paths
REPO_ROOT = Path(__file__).parent.parent
RESIDUAL_DATASET = REPO_ROOT / "data/nba/datasets/nba_totals_residual_dataset.parquet"
METADATA_PATH = REPO_ROOT / "data/nba/datasets/nba_totals_residual_metadata.json"

OUTPUT_DIR = REPO_ROOT / "data/nba/backtests"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="NBA Totals LightGBM Walk-Forward Backtest")
    parser.add_argument("--edge-threshold", type=float, default=EDGE_THRESHOLD,
                        help="Minimum edge (points) to place bet")
    parser.add_argument("--min-train-games", type=int, default=MIN_TRAIN_GAMES,
                        help="Minimum training games before betting")
    return parser.parse_args()


def calculate_bet_profit(actual_total, market_line, bet_side, odds=DEFAULT_ODDS):
    """
    Calculate profit for a single bet.
    
    Args:
        actual_total: Actual game total
        market_line: Market total line
        bet_side: 'OVER', 'UNDER', or 'NO_BET'
        odds: American odds (default -110)
    
    Returns:
        tuple: (bet_result, profit_units, staked_units)
    """
    if bet_side == "NO_BET":
        return "NO_BET", 0.0, 0.0
    
    staked_units = 1.0
    
    # Check for push
    if actual_total == market_line:
        return "PUSH", 0.0, staked_units
    
    # Determine if bet won
    if bet_side == "OVER":
        won = actual_total > market_line
    else:  # UNDER
        won = actual_total < market_line
    
    # Calculate profit
    if won:
        if odds < 0:
            profit = 100.0 / abs(odds)  # -110 → 0.9091 profit
        else:
            profit = odds / 100.0
        return "WIN", profit, staked_units
    else:
        return "LOSS", -1.0, staked_units


def train_lgbm(X_train, y_train, feature_names):
    """
    Train LightGBM model.
    
    Returns:
        lgb.Booster: Trained model
    """
    train_data = lgb.Dataset(X_train, label=y_train, feature_name=feature_names)
    
    model = lgb.train(
        LGBM_PARAMS,
        train_data,
        num_boost_round=NUM_BOOST_ROUND,
        valid_sets=[train_data],
        callbacks=[lgb.log_evaluation(period=0)],  # Silent
    )
    
    return model


def predict_residuals(model, X_test):
    """
    Predict residuals using trained model.
    
    Returns:
        np.array: Predictions
    """
    predictions = model.predict(X_test)
    return predictions


# ============================================================================
# MAIN BACKTEST
# ============================================================================

def main():
    args = parse_args()
    
    # Update globals based on args
    global EDGE_THRESHOLD, MIN_TRAIN_GAMES
    EDGE_THRESHOLD = args.edge_threshold
    MIN_TRAIN_GAMES = args.min_train_games
    
    # Generate timestamped output files
    TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
    OUTPUT_RESULTS_CSV = OUTPUT_DIR / f"nba_totals_walkforward_lgbm_v1_results_{TIMESTAMP}.csv"
    OUTPUT_SUMMARY_JSON = OUTPUT_DIR / f"nba_totals_walkforward_lgbm_v1_summary_{TIMESTAMP}.json"
    OUTPUT_CONFIG_JSON = OUTPUT_DIR / f"nba_totals_walkforward_lgbm_v1_config_{TIMESTAMP}.json"
    
    OUTPUT_RESULTS_CSV_LATEST = OUTPUT_DIR / "nba_totals_walkforward_lgbm_v1_results.csv"
    OUTPUT_SUMMARY_JSON_LATEST = OUTPUT_DIR / "nba_totals_walkforward_lgbm_v1_summary.json"
    OUTPUT_CONFIG_JSON_LATEST = OUTPUT_DIR / "nba_totals_walkforward_lgbm_v1_config.json"
    
    print("=" * 70)
    print("NBA TOTALS WALK-FORWARD BACKTEST - LGBM RESIDUAL MODEL")
    print("=" * 70)
    print("\n🔒 ZERO DATA LEAKAGE GUARANTEE:")
    print("  - For each date D, train ONLY on games with date < D")
    print("  - LightGBM retrained from scratch at each step")
    print("  - Predicts RESIDUALS (actual - market), not raw totals")
    print("  - Strict temporal ordering enforced")
    
    # ========================================================================
    # 1. LOAD DATA
    # ========================================================================
    
    print("\n📂 Loading data...")
    
    if not RESIDUAL_DATASET.exists():
        raise FileNotFoundError(f"Dataset not found: {RESIDUAL_DATASET}")
    
    if not METADATA_PATH.exists():
        raise FileNotFoundError(f"Metadata not found: {METADATA_PATH}")
    
    df = pd.read_parquet(RESIDUAL_DATASET)
    with open(METADATA_PATH) as f:
        metadata = json.load(f)
    
    feature_cols = metadata["features"]
    
    # Filter to games with market odds (required for residual modeling)
    df = df[df["consensus_total_line"].notna()].copy()
    df.sort_values("date", inplace=True)
    df.reset_index(drop=True, inplace=True)
    
    print(f"  Loaded {len(df):,} games with market odds")
    print(f"  Features: {len(feature_cols)}")
    print(f"  Date range: {df['date'].min()} → {df['date'].max()}")
    print(f"  Seasons: {sorted(df['season'].unique())}")
    
    # ========================================================================
    # 2. CONFIGURE BACKTEST
    # ========================================================================
    
    config = {
        "model_type": "lightgbm_residual",
        "target": "target_residual",
        "min_train_games": MIN_TRAIN_GAMES,
        "train_window_type": TRAIN_WINDOW_TYPE,
        "rolling_window_games": ROLLING_WINDOW_GAMES if TRAIN_WINDOW_TYPE == "rolling" else None,
        "lgbm_params": LGBM_PARAMS,
        "num_boost_round": NUM_BOOST_ROUND,
        "edge_threshold": EDGE_THRESHOLD,
        "default_odds": DEFAULT_ODDS,
        "dataset_path": str(RESIDUAL_DATASET.relative_to(REPO_ROOT)),
        "total_games": len(df),
        "features": feature_cols,
        "num_features": len(feature_cols),
        "timestamp": TIMESTAMP,
    }
    
    print("\n⚙️  Configuration:")
    print(f"  Model: LightGBM Residual (Gradient Boosting)")
    print(f"  Target: Actual - Market Line")
    print(f"  Min train games: {MIN_TRAIN_GAMES:,}")
    print(f"  Train window: {TRAIN_WINDOW_TYPE}")
    print(f"  Edge threshold: {EDGE_THRESHOLD:.1f} points")
    print(f"  Boosting rounds: {NUM_BOOST_ROUND}")
    print(f"  Max depth: {LGBM_PARAMS['max_depth']}")
    
    # ========================================================================
    # 3. WALK-FORWARD BACKTEST
    # ========================================================================
    
    print("\n🚀 Running walk-forward backtest...")
    print("  (This will retrain LightGBM at each new date)\n")
    
    results = []
    dates = sorted(df["date"].unique())
    
    model_train_count = 0
    
    for i, current_date in enumerate(dates, 1):
        # Get all prior games (strict temporal split)
        train_mask = df["date"] < current_date
        test_mask = df["date"] == current_date
        
        train_df = df[train_mask]
        test_df = df[test_mask]
        
        if len(test_df) == 0:
            continue
        
        # Check minimum training size
        if len(train_df) < MIN_TRAIN_GAMES:
            # Skip this date (not enough history)
            for _, game in test_df.iterrows():
                results.append({
                    "date": game["date"],
                    "season": game["season"],
                    "game_id": game["game_id"],
                    "home_team": game["home_team"],
                    "away_team": game["away_team"],
                    "actual_total": game["actual_total"],
                    "consensus_total_line": game["consensus_total_line"],
                    "predicted_residual": None,
                    "predicted_total": None,
                    "edge": None,
                    "bet_side": "NO_BET",
                    "bet_result": "NO_BET",
                    "profit_units": 0.0,
                    "staked_units": 0.0,
                    "train_games": len(train_df),
                    "skip_reason": "insufficient_training_data",
                })
            continue
        
        # Apply rolling window if configured
        if TRAIN_WINDOW_TYPE == "rolling" and len(train_df) > ROLLING_WINDOW_GAMES:
            train_df = train_df.tail(ROLLING_WINDOW_GAMES)
        
        # Train model
        X_train = train_df[feature_cols].values
        y_train = train_df["target_residual"].values
        
        # Handle NaNs
        X_train = np.nan_to_num(X_train, 0)
        
        model = train_lgbm(X_train, y_train, feature_cols)
        model_train_count += 1
        
        # Predict for each game on this date
        for _, game in test_df.iterrows():
            X_test = game[feature_cols].values.reshape(1, -1)
            X_test = np.nan_to_num(X_test, 0)
            
            predicted_residual = predict_residuals(model, X_test)[0]
            predicted_total = game["consensus_total_line"] + predicted_residual
            edge = predicted_total - game["consensus_total_line"]
            
            # Betting decision
            if abs(edge) >= EDGE_THRESHOLD:
                bet_side = "OVER" if edge > 0 else "UNDER"
            else:
                bet_side = "NO_BET"
            
            # Calculate profit
            bet_result, profit, staked = calculate_bet_profit(
                game["actual_total"],
                game["consensus_total_line"],
                bet_side,
                DEFAULT_ODDS
            )
            
            results.append({
                "date": game["date"],
                "season": game["season"],
                "game_id": game["game_id"],
                "home_team": game["home_team"],
                "away_team": game["away_team"],
                "actual_total": game["actual_total"],
                "consensus_total_line": game["consensus_total_line"],
                "predicted_residual": predicted_residual,
                "predicted_total": predicted_total,
                "edge": edge,
                "bet_side": bet_side,
                "bet_result": bet_result,
                "profit_units": profit,
                "staked_units": staked,
                "train_games": len(train_df),
                "skip_reason": None,
            })
        
        # Progress update
        if i % 10 == 0 or i == len(dates):
            games_processed = sum(1 for r in results if r["skip_reason"] is None)
            bets_placed = sum(1 for r in results if r["bet_side"] != "NO_BET")
            print(f"  [{i}/{len(dates)}] {current_date}: "
                  f"train={len(train_df):,} games, "
                  f"processed={games_processed:,}, bets={bets_placed:,}")
    
    # ========================================================================
    # 4. ANALYZE RESULTS
    # ========================================================================
    
    print("\n📊 Analyzing results...")
    
    results_df = pd.DataFrame(results)
    
    # Filter to games with predictions
    valid_df = results_df[results_df["skip_reason"].isna()].copy()
    bet_df = valid_df[valid_df["bet_side"] != "NO_BET"].copy()
    
    total_profit = bet_df["profit_units"].sum()
    total_staked = bet_df["staked_units"].sum()
    roi = (total_profit / total_staked * 100) if total_staked > 0 else 0
    
    wins = len(bet_df[bet_df["bet_result"] == "WIN"])
    losses = len(bet_df[bet_df["bet_result"] == "LOSS"])
    pushes = len(bet_df[bet_df["bet_result"] == "PUSH"])
    win_rate = (wins / (wins + losses) * 100) if (wins + losses) > 0 else 0
    
    print(f"\n{'='*70}")
    print("WALK-FORWARD BACKTEST RESULTS - LGBM RESIDUAL MODEL")
    print(f"{'='*70}")
    
    print(f"\n📈 Overall Performance:")
    print(f"  Total games: {len(valid_df):,}")
    print(f"  Bets placed: {len(bet_df):,} ({len(bet_df)/len(valid_df)*100:.1f}%)")
    print(f"  Models trained: {model_train_count:,}")
    print(f"\n  Wins: {wins:,}")
    print(f"  Losses: {losses:,}")
    print(f"  Pushes: {pushes:,}")
    print(f"  Win rate: {win_rate:.2f}%")
    print(f"\n  Total profit: {total_profit:+.2f} units")
    print(f"  Total staked: {total_staked:.2f} units")
    print(f"  ROI: {roi:+.2f}%")
    
    # Edge bucket analysis
    if len(bet_df) > 0:
        print(f"\n📊 Performance by Edge Bucket:")
        bet_df["edge_bucket"] = pd.cut(
            bet_df["edge"].abs(),
            bins=[0, 4, 5, 6, 8, 100],
            labels=["3-4", "4-5", "5-6", "6-8", "8+"]
        )
        
        for bucket in ["3-4", "4-5", "5-6", "6-8", "8+"]:
            bucket_df = bet_df[bet_df["edge_bucket"] == bucket]
            if len(bucket_df) > 0:
                bucket_profit = bucket_df["profit_units"].sum()
                bucket_staked = bucket_df["staked_units"].sum()
                bucket_roi = (bucket_profit / bucket_staked * 100) if bucket_staked > 0 else 0
                bucket_wins = len(bucket_df[bucket_df["bet_result"] == "WIN"])
                bucket_losses = len(bucket_df[bucket_df["bet_result"] == "LOSS"])
                bucket_wr = (bucket_wins / (bucket_wins + bucket_losses) * 100) if (bucket_wins + bucket_losses) > 0 else 0
                
                print(f"  {bucket:5s}: {len(bucket_df):4d} bets, "
                      f"WR={bucket_wr:5.1f}%, "
                      f"Profit={bucket_profit:+6.2f}u, "
                      f"ROI={bucket_roi:+6.2f}%")
    
    # Per-season analysis
    print(f"\n📊 Performance by Season:")
    for season in sorted(valid_df["season"].unique()):
        season_bet_df = bet_df[bet_df["season"] == season]
        if len(season_bet_df) > 0:
            season_profit = season_bet_df["profit_units"].sum()
            season_staked = season_bet_df["staked_units"].sum()
            season_roi = (season_profit / season_staked * 100) if season_staked > 0 else 0
            season_wins = len(season_bet_df[season_bet_df["bet_result"] == "WIN"])
            season_losses = len(season_bet_df[season_bet_df["bet_result"] == "LOSS"])
            season_wr = (season_wins / (season_wins + season_losses) * 100) if (season_wins + season_losses) > 0 else 0
            
            print(f"  {season}: {len(season_bet_df):4d} bets, "
                  f"WR={season_wr:5.1f}%, "
                  f"Profit={season_profit:+7.2f}u, "
                  f"ROI={season_roi:+6.2f}%")
    
    # ========================================================================
    # 5. SAVE OUTPUTS
    # ========================================================================
    
    print(f"\n💾 Saving results...")
    
    # Save detailed results
    results_df.to_csv(OUTPUT_RESULTS_CSV, index=False)
    results_df.to_csv(OUTPUT_RESULTS_CSV_LATEST, index=False)
    print(f"  ✅ Results CSV: {OUTPUT_RESULTS_CSV.relative_to(REPO_ROOT)}")
    
    # Save summary
    summary = {
        "backtest_type": "walk_forward_lgbm_residual_v1",
        "timestamp": TIMESTAMP,
        "config": config,
        "results": {
            "total_games": len(valid_df),
            "bets_placed": len(bet_df),
            "models_trained": model_train_count,
            "wins": wins,
            "losses": losses,
            "pushes": pushes,
            "win_rate_pct": round(win_rate, 2),
            "total_profit_units": round(total_profit, 2),
            "total_staked_units": round(total_staked, 2),
            "roi_pct": round(roi, 2),
        },
        "date_range": {
            "start": str(valid_df["date"].min()),
            "end": str(valid_df["date"].max()),
        },
    }
    
    with open(OUTPUT_SUMMARY_JSON, "w") as f:
        json.dump(summary, f, indent=2)
    with open(OUTPUT_SUMMARY_JSON_LATEST, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"  ✅ Summary JSON: {OUTPUT_SUMMARY_JSON.relative_to(REPO_ROOT)}")
    
    # Save config
    with open(OUTPUT_CONFIG_JSON, "w") as f:
        json.dump(config, f, indent=2)
    with open(OUTPUT_CONFIG_JSON_LATEST, "w") as f:
        json.dump(config, f, indent=2)
    print(f"  ✅ Config JSON: {OUTPUT_CONFIG_JSON.relative_to(REPO_ROOT)}")
    
    print(f"\n{'='*70}")
    print("✅ WALK-FORWARD BACKTEST COMPLETE")
    print(f"{'='*70}")
    
    if roi > 0:
        print(f"\n🎉 Model is profitable! ROI = {roi:+.2f}%")
    else:
        print(f"\n⚠️  Model is unprofitable. ROI = {roi:+.2f}%")
        print("   Consider tuning hyperparameters or edge threshold.")


if __name__ == "__main__":
    main()
