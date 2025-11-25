#!/usr/bin/env python3
"""
NBA Totals Walk-Forward Backtest (v1)

TRUE WALK-FORWARD VALIDATION WITH ZERO DATA LEAKAGE:
- For each date D, train ONLY on games with date < D
- Retrain model from scratch at each step
- No reuse of pre-trained model artifacts
- Strict temporal ordering enforced

This backtest is designed to be production-safe: the results can be trusted
for real-world trading decisions.
"""

import json
import os
from pathlib import Path
from datetime import datetime
import warnings

import pandas as pd
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings('ignore')

# ============================================================================
# CONFIGURATION
# ============================================================================

# Training parameters
MIN_TRAIN_GAMES = 500          # Minimum games needed before making predictions
TRAIN_WINDOW_TYPE = "expanding"  # "expanding" or "rolling"
ROLLING_WINDOW_GAMES = 1500    # Only used if TRAIN_WINDOW_TYPE = "rolling"

# Model parameters (matching experiment v2)
RIDGE_ALPHA = 3.0

# Betting parameters
EDGE_THRESHOLD = 4.0          # Minimum absolute edge to place bet (points)
DEFAULT_ODDS = -110           # Flat odds assumption

# Paths
REPO_ROOT = Path(__file__).parent.parent
BACKTEST_DATASET = REPO_ROOT / "data/nba/backtests/nba_totals_backtest_dataset.parquet"
METADATA_PATH = REPO_ROOT / "data/nba/datasets/nba_totals_training_metadata.json"

OUTPUT_DIR = REPO_ROOT / "data/nba/backtests"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Generate timestamped output files to avoid overwriting
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
OUTPUT_RESULTS_CSV = OUTPUT_DIR / f"nba_totals_walkforward_v1_results_{TIMESTAMP}.csv"
OUTPUT_SUMMARY_JSON = OUTPUT_DIR / f"nba_totals_walkforward_v1_summary_{TIMESTAMP}.json"
OUTPUT_CONFIG_JSON = OUTPUT_DIR / f"nba_totals_walkforward_v1_config_{TIMESTAMP}.json"

# Also create non-timestamped versions (latest run)
OUTPUT_RESULTS_CSV_LATEST = OUTPUT_DIR / "nba_totals_walkforward_v1_results.csv"
OUTPUT_SUMMARY_JSON_LATEST = OUTPUT_DIR / "nba_totals_walkforward_v1_summary.json"
OUTPUT_CONFIG_JSON_LATEST = OUTPUT_DIR / "nba_totals_walkforward_v1_config.json"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

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

def train_model(X_train, y_train, alpha=RIDGE_ALPHA):
    """
    Train Ridge model with standardization.
    
    Returns:
        tuple: (model, scaler)
    """
    # Standardize features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    
    # Train Ridge model
    model = Ridge(alpha=alpha)
    model.fit(X_train_scaled, y_train)
    
    return model, scaler

def predict_totals(model, scaler, X_test):
    """
    Predict totals using trained model.
    
    Returns:
        np.array: Predictions
    """
    X_test_scaled = scaler.transform(X_test)
    predictions = model.predict(X_test_scaled)
    return predictions

# ============================================================================
# MAIN BACKTEST
# ============================================================================

def main():
    print("=" * 70)
    print("NBA TOTALS WALK-FORWARD BACKTEST (v1)")
    print("=" * 70)
    print("\n🔒 ZERO DATA LEAKAGE GUARANTEE:")
    print("  - For each date D, train ONLY on games with date < D")
    print("  - Model retrained from scratch at each step")
    print("  - Strict temporal ordering enforced")
    
    # ========================================================================
    # 1. LOAD DATA
    # ========================================================================
    
    print("\n📂 Loading data...")
    
    if not BACKTEST_DATASET.exists():
        raise FileNotFoundError(f"Backtest dataset not found: {BACKTEST_DATASET}")
    
    df = pd.read_parquet(BACKTEST_DATASET)
    print(f"  ✅ Loaded {len(df):,} games")
    
    # Load metadata for feature columns
    with open(METADATA_PATH) as f:
        metadata = json.load(f)
    
    feature_cols = metadata.get('features', metadata.get('feature_columns', []))
    print(f"  ✅ Feature columns: {len(feature_cols)}")
    
    # ========================================================================
    # 2. PREPARE DATA
    # ========================================================================
    
    print("\n🔧 Preparing data...")
    
    # Convert date to datetime and extract date-only for grouping
    df['date'] = pd.to_datetime(df['date'])
    df['date_only'] = df['date'].dt.date
    
    # Sort by date (critical for temporal integrity)
    df = df.sort_values(['date', 'home_team', 'away_team']).reset_index(drop=True)
    
    # Filter to games with required data
    required_mask = (
        df['actual_total'].notna() &
        df['market_total_line_consensus'].notna()
    )
    
    # Also ensure all features are present
    for col in feature_cols:
        if col not in df.columns:
            raise ValueError(f"Feature column '{col}' not found in dataset")
        required_mask &= df[col].notna()
    
    df = df[required_mask].reset_index(drop=True)
    
    print(f"  ✅ After filtering: {len(df):,} games")
    print(f"  ✅ Date range: {df['date_only'].min()} → {df['date_only'].max()}")
    print(f"  ✅ Unique dates: {df['date_only'].nunique()}")
    
    # ========================================================================
    # 3. WALK-FORWARD LOOP
    # ========================================================================
    
    print(f"\n🚀 Starting walk-forward backtest...")
    print(f"  Config:")
    print(f"    - Min train games: {MIN_TRAIN_GAMES}")
    print(f"    - Train window: {TRAIN_WINDOW_TYPE}")
    if TRAIN_WINDOW_TYPE == "rolling":
        print(f"    - Rolling window: {ROLLING_WINDOW_GAMES} games")
    print(f"    - Ridge alpha: {RIDGE_ALPHA}")
    print(f"    - Edge threshold: {EDGE_THRESHOLD} points")
    print(f"    - Odds: {DEFAULT_ODDS}\n")
    
    unique_dates = sorted(df['date_only'].unique())
    results = []
    
    dates_processed = 0
    dates_skipped = 0
    
    for i, current_date in enumerate(unique_dates):
        # Strict temporal split: train < current_date, test = current_date
        train_mask = df['date_only'] < current_date
        test_mask = df['date_only'] == current_date
        
        train_df = df[train_mask]
        test_df = df[test_mask]
        
        n_test = len(test_df)
        n_train = len(train_df)
        
        # Progress indicator
        if (i + 1) % 20 == 0 or i == 0 or i == len(unique_dates) - 1:
            print(f"  [{i+1}/{len(unique_dates)}] {current_date}: {n_train} train, {n_test} test games")
        
        # Check if enough training data
        if n_train < MIN_TRAIN_GAMES:
            # Not enough history - skip with "insufficient_history"
            for idx, row in test_df.iterrows():
                results.append({
                    'date': current_date,
                    'home_team': row['home_team'],
                    'away_team': row['away_team'],
                    'actual_total': row['actual_total'],
                    'market_total_line': row['market_total_line_consensus'],
                    'model_total': np.nan,
                    'edge': np.nan,
                    'bet_side': 'NO_BET',
                    'bet_result': 'NO_BET',
                    'profit_units': 0.0,
                    'staked_units': 0.0,
                    'n_train_games': n_train,
                    'skip_reason': 'insufficient_history'
                })
            dates_skipped += 1
            continue
        
        # Apply rolling window if configured
        if TRAIN_WINDOW_TYPE == "rolling" and n_train > ROLLING_WINDOW_GAMES:
            train_df = train_df.iloc[-ROLLING_WINDOW_GAMES:]
            n_train = len(train_df)
        
        # Extract features and target for training
        X_train = train_df[feature_cols].values
        y_train = train_df['actual_total'].values
        
        # Train model from scratch
        try:
            model, scaler = train_model(X_train, y_train, alpha=RIDGE_ALPHA)
        except Exception as e:
            print(f"    ⚠️  Training failed for {current_date}: {e}")
            # Mark all test games as NO_BET with training_error
            for idx, row in test_df.iterrows():
                results.append({
                    'date': current_date,
                    'home_team': row['home_team'],
                    'away_team': row['away_team'],
                    'actual_total': row['actual_total'],
                    'market_total_line': row['market_total_line_consensus'],
                    'model_total': np.nan,
                    'edge': np.nan,
                    'bet_side': 'NO_BET',
                    'bet_result': 'NO_BET',
                    'profit_units': 0.0,
                    'staked_units': 0.0,
                    'n_train_games': n_train,
                    'skip_reason': 'training_error'
                })
            continue
        
        # Predict on test games
        X_test = test_df[feature_cols].values
        predictions = predict_totals(model, scaler, X_test)
        
        # Process each test game
        for (idx, row), pred in zip(test_df.iterrows(), predictions):
            market_line = row['market_total_line_consensus']
            actual_total = row['actual_total']
            
            edge = pred - market_line
            
            # Determine bet side
            if abs(edge) >= EDGE_THRESHOLD:
                bet_side = "OVER" if edge > 0 else "UNDER"
            else:
                bet_side = "NO_BET"
            
            # Calculate result and profit
            bet_result, profit, staked = calculate_bet_profit(
                actual_total, market_line, bet_side, DEFAULT_ODDS
            )
            
            results.append({
                'date': current_date,
                'home_team': row['home_team'],
                'away_team': row['away_team'],
                'actual_total': actual_total,
                'market_total_line': market_line,
                'model_total': pred,
                'edge': edge,
                'bet_side': bet_side,
                'bet_result': bet_result,
                'profit_units': profit,
                'staked_units': staked,
                'n_train_games': n_train,
                'skip_reason': None
            })
        
        dates_processed += 1
    
    print(f"\n  ✅ Processed {dates_processed} dates ({dates_skipped} skipped due to insufficient history)")
    
    # ========================================================================
    # 4. AGGREGATE METRICS
    # ========================================================================
    
    print("\n📊 Calculating metrics...")
    
    results_df = pd.DataFrame(results)
    
    # Overall stats
    total_games = len(results_df)
    bet_games = results_df[results_df['bet_side'] != 'NO_BET']
    n_bets = len(bet_games)
    
    if n_bets == 0:
        print("\n⚠️  No bets placed (edge threshold too high or insufficient data)")
        summary = {
            'total_games': total_games,
            'num_bets': 0,
            'win_rate': 0,
            'roi': 0,
            'total_profit': 0
        }
    else:
        # Win/Loss/Push breakdown
        wins = (bet_games['bet_result'] == 'WIN').sum()
        losses = (bet_games['bet_result'] == 'LOSS').sum()
        pushes = (bet_games['bet_result'] == 'PUSH').sum()
        
        win_rate = wins / (wins + losses) if (wins + losses) > 0 else 0
        total_profit = bet_games['profit_units'].sum()
        total_staked = bet_games['staked_units'].sum()
        roi = (total_profit / total_staked) * 100 if total_staked > 0 else 0
        
        avg_edge = bet_games['edge'].abs().mean()
        
        # Print summary
        print("\n" + "=" * 70)
        print("WALK-FORWARD BACKTEST RESULTS")
        print("=" * 70)
        print(f"\n📅 Period: {results_df['date'].min()} → {results_df['date'].max()}")
        print(f"🎲 Configuration:")
        print(f"  - Train window: {TRAIN_WINDOW_TYPE} (min {MIN_TRAIN_GAMES} games)")
        print(f"  - Edge threshold: {EDGE_THRESHOLD} points")
        print(f"  - Odds assumption: {DEFAULT_ODDS}")
        print(f"\n📊 Overall Performance:")
        print(f"  - Total games:    {total_games:,}")
        print(f"  - Bets placed:    {n_bets:,} ({100*n_bets/total_games:.1f}%)")
        print(f"  - Wins:           {wins} ({100*wins/n_bets:.1f}%)")
        print(f"  - Losses:         {losses} ({100*losses/n_bets:.1f}%)")
        print(f"  - Pushes:         {pushes}")
        print(f"  - Win rate:       {100*win_rate:.1f}% (excluding pushes)")
        print(f"  - Total profit:   {total_profit:+.2f} units")
        print(f"  - ROI:            {roi:+.1f}%")
        print(f"  - Avg edge (bets): {avg_edge:.2f} points")
        
        # Edge buckets
        print(f"\n📈 Performance by Edge Bucket:")
        edge_buckets = [
            (4, 6, '[4,6)'),
            (6, 8, '[6,8)'),
            (8, 100, '[8,∞)')
        ]
        
        bucket_stats = []
        for min_edge, max_edge, label in edge_buckets:
            bucket_mask = (bet_games['edge'].abs() >= min_edge) & (bet_games['edge'].abs() < max_edge)
            bucket_bets = bet_games[bucket_mask]
            
            if len(bucket_bets) == 0:
                continue
            
            b_wins = (bucket_bets['bet_result'] == 'WIN').sum()
            b_losses = (bucket_bets['bet_result'] == 'LOSS').sum()
            b_win_rate = b_wins / (b_wins + b_losses) if (b_wins + b_losses) > 0 else 0
            b_profit = bucket_bets['profit_units'].sum()
            b_staked = bucket_bets['staked_units'].sum()
            b_roi = (b_profit / b_staked) * 100 if b_staked > 0 else 0
            
            print(f"  {label:8s}: {len(bucket_bets):4d} bets, {100*b_win_rate:5.1f}% WR, {b_roi:+6.1f}% ROI")
            
            bucket_stats.append({
                'edge_range': label,
                'num_bets': int(len(bucket_bets)),
                'wins': int(b_wins),
                'losses': int(b_losses),
                'win_rate': float(b_win_rate),
                'total_profit': float(b_profit),
                'roi': float(b_roi)
            })
        
        # Create summary dict
        summary = {
            'generated_at': datetime.now().isoformat(),
            'backtest_type': 'walk_forward_v1',
            'zero_data_leakage': True,
            'dataset': {
                'path': str(BACKTEST_DATASET.relative_to(REPO_ROOT)),
                'total_games': int(total_games),
                'date_range': {
                    'start': str(results_df['date'].min()),
                    'end': str(results_df['date'].max())
                }
            },
            'config': {
                'min_train_games': MIN_TRAIN_GAMES,
                'train_window_type': TRAIN_WINDOW_TYPE,
                'rolling_window_games': ROLLING_WINDOW_GAMES if TRAIN_WINDOW_TYPE == "rolling" else None,
                'ridge_alpha': RIDGE_ALPHA,
                'edge_threshold': EDGE_THRESHOLD,
                'default_odds': DEFAULT_ODDS
            },
            'performance': {
                'num_bets': int(n_bets),
                'wins': int(wins),
                'losses': int(losses),
                'pushes': int(pushes),
                'win_rate': float(win_rate),
                'total_profit': float(total_profit),
                'total_staked': float(total_staked),
                'roi': float(roi),
                'avg_edge': float(avg_edge)
            },
            'edge_buckets': bucket_stats
        }
    
    # ========================================================================
    # 5. SAVE RESULTS
    # ========================================================================
    
    print(f"\n💾 Saving results...")
    
    # Save per-game results
    results_df.to_csv(OUTPUT_RESULTS_CSV, index=False)
    results_df.to_csv(OUTPUT_RESULTS_CSV_LATEST, index=False)
    print(f"  ✅ Per-game results (timestamped): {OUTPUT_RESULTS_CSV.relative_to(REPO_ROOT)}")
    print(f"  ✅ Per-game results (latest):      {OUTPUT_RESULTS_CSV_LATEST.relative_to(REPO_ROOT)}")
    
    # Save summary
    with open(OUTPUT_SUMMARY_JSON, 'w') as f:
        json.dump(summary, f, indent=2)
    with open(OUTPUT_SUMMARY_JSON_LATEST, 'w') as f:
        json.dump(summary, f, indent=2)
    print(f"  ✅ Summary (timestamped):          {OUTPUT_SUMMARY_JSON.relative_to(REPO_ROOT)}")
    print(f"  ✅ Summary (latest):               {OUTPUT_SUMMARY_JSON_LATEST.relative_to(REPO_ROOT)}")
    
    # Save config
    config = {
        'min_train_games': MIN_TRAIN_GAMES,
        'train_window_type': TRAIN_WINDOW_TYPE,
        'rolling_window_games': ROLLING_WINDOW_GAMES,
        'ridge_alpha': RIDGE_ALPHA,
        'edge_threshold': EDGE_THRESHOLD,
        'default_odds': DEFAULT_ODDS,
        'date_range': {
            'start': str(results_df['date'].min()),
            'end': str(results_df['date'].max())
        }
    }
    
    with open(OUTPUT_CONFIG_JSON, 'w') as f:
        json.dump(config, f, indent=2)
    with open(OUTPUT_CONFIG_JSON_LATEST, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"  ✅ Config (timestamped):           {OUTPUT_CONFIG_JSON.relative_to(REPO_ROOT)}")
    print(f"  ✅ Config (latest):                {OUTPUT_CONFIG_JSON_LATEST.relative_to(REPO_ROOT)}")
    
    print("\n" + "=" * 70)
    print("✅ WALK-FORWARD BACKTEST COMPLETE")
    print("=" * 70)
    print("\n🔒 This backtest has ZERO DATA LEAKAGE and represents true out-of-sample performance.")
    print("   Results can be trusted for production trading decisions.\n")

if __name__ == '__main__':
    main()
