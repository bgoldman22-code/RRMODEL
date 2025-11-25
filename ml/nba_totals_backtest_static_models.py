#!/usr/bin/env python3
"""
NBA Totals Static Model Backtest

Evaluates frozen models (baseline + experiment v2) against historical market totals lines.
No walk-forward training - just static model performance vs the market.
"""

import json
import os
from pathlib import Path
from datetime import datetime

import pandas as pd
import numpy as np

# Paths
REPO_ROOT = Path(__file__).parent.parent
BACKTEST_DATASET = REPO_ROOT / "data/nba/backtests/nba_totals_backtest_dataset.parquet"
METADATA_PATH = REPO_ROOT / "data/nba/datasets/nba_totals_training_metadata.json"

MODEL_BASELINE = REPO_ROOT / "netlify/functions/_lib/nba/models/artifacts/total_model_simple.json"
MODEL_EXPERIMENT = REPO_ROOT / "netlify/functions/_lib/nba/models/artifacts/total_model_experiment_v2.json"

OUTPUT_DIR = REPO_ROOT / "data/nba/backtests"
OUTPUT_SUMMARY = OUTPUT_DIR / "nba_totals_static_models_summary_experiment_v2.json"

# Betting parameters
EDGE_THRESHOLD = 4.0  # Minimum edge to bet (points)
DEFAULT_ODDS = -110   # Flat odds assumption if per-book odds not used

def load_model(model_path):
    """Load model artifact JSON."""
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")
    
    with open(model_path) as f:
        model = json.load(f)
    
    return model

def predict_total(model, features_df):
    """
    Predict totals using model weights.
    
    Model structure:
    {
        "weights": {...},
        "bias": float,
        "means": {...},
        "stds": {...}
    }
    
    Prediction: bias + sum(weight_i * ((x_i - mean_i) / std_i))
    """
    weights = model['weights']
    bias = model['bias']
    means = model['means']
    stds = model['stds']
    
    predictions = np.full(len(features_df), bias)
    
    for feature, weight in weights.items():
        if feature not in features_df.columns:
            print(f"  ⚠️  Feature '{feature}' not found in dataset, skipping")
            continue
        
        # Normalize: (x - mean) / std
        x = features_df[feature].values
        mean = means.get(feature, 0)
        std = stds.get(feature, 1)
        
        if std == 0:
            std = 1  # Avoid division by zero
        
        normalized = (x - mean) / std
        predictions += weight * normalized
    
    return predictions

def calculate_bet_profit(actual_total, market_line, bet_side, odds=-110):
    """
    Calculate profit for a single bet.
    
    Args:
        actual_total: Actual game total
        market_line: Market total line
        bet_side: 'over' or 'under'
        odds: American odds (default -110)
    
    Returns:
        Profit in units (positive = win, negative = loss)
    """
    # Determine if bet won
    if bet_side == 'over':
        won = actual_total > market_line
    else:  # under
        won = actual_total < market_line
    
    # If push (exactly on line), return 0
    if actual_total == market_line:
        return 0
    
    # Calculate profit based on American odds
    if won:
        if odds < 0:
            # Favorite: risk |odds| to win 100
            profit = 100 / abs(odds)
        else:
            # Underdog: risk 100 to win odds
            profit = odds / 100
    else:
        profit = -1  # Lost 1 unit
    
    return profit

def evaluate_model(model, features_df, actual_totals, market_lines, model_name):
    """Evaluate a single model."""
    print(f"\n{'='*60}")
    print(f"EVALUATING: {model_name}")
    print(f"{'='*60}")
    
    # Get predictions
    predictions = predict_total(model, features_df)
    
    # Calculate edges
    edges = predictions - market_lines
    
    # Overall prediction quality
    mae = np.mean(np.abs(predictions - actual_totals))
    corr = np.corrcoef(predictions, actual_totals)[0, 1]
    
    print(f"\n📊 Prediction Quality:")
    print(f"  MAE vs actual:    {mae:.2f} points")
    print(f"  Correlation:      {corr:.3f}")
    print(f"  Mean prediction:  {predictions.mean():.1f}")
    print(f"  Mean actual:      {actual_totals.mean():.1f}")
    
    # Filter to bets (abs(edge) >= threshold)
    bet_mask = np.abs(edges) >= EDGE_THRESHOLD
    n_bets = bet_mask.sum()
    
    if n_bets == 0:
        print(f"\n⚠️  No bets with edge >= {EDGE_THRESHOLD} points")
        return {
            'model_name': model_name,
            'mae': mae,
            'correlation': corr,
            'num_bets': 0,
            'win_rate': 0,
            'roi': 0,
            'total_profit': 0,
            'avg_edge': 0
        }
    
    # Bet details
    bet_edges = edges[bet_mask]
    bet_predictions = predictions[bet_mask]
    bet_actuals = actual_totals[bet_mask]
    bet_lines = market_lines[bet_mask]
    
    # Determine bet sides
    bet_sides = np.where(bet_edges > 0, 'over', 'under')
    
    # Calculate profits
    profits = []
    for i in range(n_bets):
        profit = calculate_bet_profit(
            bet_actuals.iloc[i],
            bet_lines.iloc[i],
            bet_sides[i],
            DEFAULT_ODDS
        )
        profits.append(profit)
    
    profits = np.array(profits)
    
    # Metrics
    wins = (profits > 0).sum()
    losses = (profits < 0).sum()
    pushes = (profits == 0).sum()
    
    win_rate = wins / (wins + losses) if (wins + losses) > 0 else 0
    total_profit = profits.sum()
    roi = (total_profit / n_bets) * 100  # ROI as percentage
    
    print(f"\n🎲 Betting Performance (Edge Threshold: {EDGE_THRESHOLD}+ points):")
    print(f"  Total bets:       {n_bets:,}")
    print(f"  Wins:             {wins} ({100*wins/n_bets:.1f}%)")
    print(f"  Losses:           {losses} ({100*losses/n_bets:.1f}%)")
    print(f"  Pushes:           {pushes}")
    print(f"  Win rate:         {100*win_rate:.1f}% (excluding pushes)")
    print(f"  Total profit:     {total_profit:+.2f} units")
    print(f"  ROI:              {roi:+.1f}%")
    print(f"  Avg edge on bets: {bet_edges.mean():.2f} points")
    
    # Edge buckets
    edge_buckets = [
        (4, 6, '4-6'),
        (6, 8, '6-8'),
        (8, 100, '8+')
    ]
    
    print(f"\n📈 Performance by Edge Bucket:")
    bucket_stats = []
    
    for min_edge, max_edge, label in edge_buckets:
        bucket_mask = (np.abs(bet_edges) >= min_edge) & (np.abs(bet_edges) < max_edge)
        if bucket_mask.sum() == 0:
            continue
        
        bucket_profits = profits[bucket_mask]
        bucket_wins = (bucket_profits > 0).sum()
        bucket_losses = (bucket_profits < 0).sum()
        bucket_win_rate = bucket_wins / (bucket_wins + bucket_losses) if (bucket_wins + bucket_losses) > 0 else 0
        bucket_roi = (bucket_profits.sum() / bucket_mask.sum()) * 100
        
        print(f"  Edge {label} pts: {bucket_mask.sum():3d} bets, {100*bucket_win_rate:5.1f}% WR, {bucket_roi:+6.1f}% ROI")
        
        bucket_stats.append({
            'edge_range': label,
            'num_bets': int(bucket_mask.sum()),
            'win_rate': float(bucket_win_rate),
            'roi': float(bucket_roi)
        })
    
    return {
        'model_name': model_name,
        'mae': float(mae),
        'correlation': float(corr),
        'num_bets': int(n_bets),
        'wins': int(wins),
        'losses': int(losses),
        'pushes': int(pushes),
        'win_rate': float(win_rate),
        'roi': float(roi),
        'total_profit': float(total_profit),
        'avg_edge': float(bet_edges.mean()),
        'edge_buckets': bucket_stats
    }

def main():
    """Main execution."""
    print("=" * 60)
    print("NBA TOTALS STATIC MODEL BACKTEST")
    print("=" * 60)
    
    # Load backtest dataset
    print("\n📂 Loading backtest dataset...")
    if not BACKTEST_DATASET.exists():
        raise FileNotFoundError(f"Backtest dataset not found: {BACKTEST_DATASET}")
    
    df = pd.read_parquet(BACKTEST_DATASET)
    print(f"  ✅ Loaded {len(df):,} games")
    print(f"  ✅ Date range: {df['date'].min()} → {df['date'].max()}")
    
    # Load metadata for feature list
    with open(METADATA_PATH) as f:
        metadata = json.load(f)
    
    feature_columns = metadata.get('features', metadata.get('feature_columns', []))
    print(f"  ✅ Feature columns: {len(feature_columns)}")
    
    # Extract features and targets
    features_df = df[feature_columns]
    actual_totals = df['actual_total']
    market_lines = df['market_total_line_consensus']
    
    # Load models
    print("\n📂 Loading models...")
    model_baseline = load_model(MODEL_BASELINE)
    print(f"  ✅ Baseline: {MODEL_BASELINE.name}")
    
    model_experiment = load_model(MODEL_EXPERIMENT)
    print(f"  ✅ Experiment v2: {MODEL_EXPERIMENT.name}")
    
    # Evaluate baseline
    results_baseline = evaluate_model(
        model_baseline,
        features_df,
        actual_totals,
        market_lines,
        "Baseline Model"
    )
    
    # Evaluate experiment
    results_experiment = evaluate_model(
        model_experiment,
        features_df,
        actual_totals,
        market_lines,
        "Experiment V2"
    )
    
    # Compare
    print(f"\n{'='*60}")
    print("COMPARISON: Experiment V2 vs Baseline")
    print(f"{'='*60}")
    
    delta_bets = results_experiment['num_bets'] - results_baseline['num_bets']
    delta_wr = results_experiment['win_rate'] - results_baseline['win_rate']
    delta_roi = results_experiment['roi'] - results_baseline['roi']
    delta_profit = results_experiment['total_profit'] - results_baseline['total_profit']
    
    print(f"\n  Bets:        {delta_bets:+d} ({results_experiment['num_bets']} vs {results_baseline['num_bets']})")
    print(f"  Win rate:    {100*delta_wr:+.1f}% ({100*results_experiment['win_rate']:.1f}% vs {100*results_baseline['win_rate']:.1f}%)")
    print(f"  ROI:         {delta_roi:+.1f}% ({results_experiment['roi']:+.1f}% vs {results_baseline['roi']:+.1f}%)")
    print(f"  Total profit: {delta_profit:+.2f} units ({results_experiment['total_profit']:+.2f} vs {results_baseline['total_profit']:+.2f})")
    
    # Save summary
    print(f"\n💾 Saving summary...")
    summary = {
        'generated_at': datetime.now().isoformat(),
        'dataset': {
            'path': str(BACKTEST_DATASET.relative_to(REPO_ROOT)),
            'num_games': len(df),
            'date_range': {
                'start': str(df['date'].min()),
                'end': str(df['date'].max())
            }
        },
        'parameters': {
            'edge_threshold': EDGE_THRESHOLD,
            'default_odds': DEFAULT_ODDS
        },
        'models': {
            'baseline': results_baseline,
            'experiment_v2': results_experiment
        },
        'comparison': {
            'delta_bets': int(delta_bets),
            'delta_win_rate': float(delta_wr),
            'delta_roi': float(delta_roi),
            'delta_total_profit': float(delta_profit)
        }
    }
    
    with open(OUTPUT_SUMMARY, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"  ✅ Saved: {OUTPUT_SUMMARY.relative_to(REPO_ROOT)}")
    
    print(f"\n{'='*60}")
    print("✅ STATIC BACKTEST COMPLETE")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
