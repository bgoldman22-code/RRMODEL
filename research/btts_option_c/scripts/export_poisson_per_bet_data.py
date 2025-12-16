#!/usr/bin/env python3
"""
export_poisson_per_bet_data.py

Generate per-bet level data for Poisson model across all walk-forward folds.
This creates results/walkforward_poisson_per_bet.csv for bucket analysis.

This script does NOT modify core walkforward logic - it's a one-time export utility.
"""

import sys
from pathlib import Path
import pandas as pd
import numpy as np

# Add src to path
RESEARCH_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(RESEARCH_DIR))

from src.load_data import load_unified_data
from src.build_features import add_rolling_form_features, add_match_level_features, add_form_trend_features
from src.walkforward import create_walkforward_splits, WalkforwardWindowConfig
from src.model_baselines import fit_poisson, predict_poisson
from src.evaluate import compute_fair_two_way, run_two_sided_threshold_sweep_with_bet_details


def build_features(df):
    """Apply feature engineering"""
    df = add_rolling_form_features(df, windows=[5, 10])
    df = add_match_level_features(df)
    df = add_form_trend_features(df)
    df = df.dropna(subset=['btts', 'home_xg', 'away_xg'])
    return df


def export_poisson_per_bet():
    """Export per-bet data for Poisson model"""
    
    print("\n" + "="*80)
    print("POISSON PER-BET DATA EXPORT".center(80))
    print("="*80)
    
    # Load data
    print("\n📥 Loading data...")
    df = load_unified_data()
    print(f"✅ Loaded {len(df)} matches")
    
    # Build features
    print("\n📊 Building features...")
    df = build_features(df)
    print(f"✅ Features ready: {len(df)} matches")
    
    # Create walk-forward splits (same config as main pipeline)
    print("\n🔄 Creating walk-forward splits...")
    config = WalkforwardWindowConfig(
        test_window_days=60,
        step_days=45,
        min_train_days=170,
        min_train_matches=220,
        min_test_matches=60,
        min_test_unique_dates=15
    )
    splits = create_walkforward_splits(df, n_splits=6, window_config=config)
    print(f"✅ Created {len(splits)} folds")
    
    # Define threshold grid (same as main pipeline)
    thresholds = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75]
    
    print("\n" + "="*80)
    print("GENERATING PER-BET DATA (POISSON ONLY)")
    print("="*80)
    
    all_bets = []
    
    for train_df, test_df, fold_meta in splits:
        fold_idx = fold_meta['fold']
        print(f"\n🔷 Fold {fold_idx}: {fold_meta['test_start']} to {fold_meta['test_end']}")
        
        # Get test data
        y_true_test = test_df['btts'].values
        yes_odds_test = test_df['btts_yes_odds'].values if 'btts_yes_odds' in test_df.columns else np.full(len(test_df), np.nan)
        no_odds_test = test_df['btts_no_odds'].values if 'btts_no_odds' in test_df.columns else np.full(len(test_df), np.nan)
        
        # Create match IDs (use index for now, could enhance with date+teams)
        match_ids = test_df.index.values
        
        # Train Poisson model
        print(f"   Training Poisson...")
        model = fit_poisson(train_df)
        
        # Get predictions
        y_proba_test = predict_poisson(model, test_df)
        print(f"   ✅ Generated {len(y_proba_test)} predictions")
        
        # Compute fair odds
        fair_yes_odds, fair_no_odds = compute_fair_two_way(yes_odds_test, no_odds_test)
        
        # Generate per-bet details
        bet_df = run_two_sided_threshold_sweep_with_bet_details(
            y_true=y_true_test,
            y_proba=y_proba_test,
            yes_odds=yes_odds_test,
            no_odds=no_odds_test,
            thresholds_yes=thresholds,
            thresholds_no=thresholds,
            stake=10.0,
            fair_yes_odds=fair_yes_odds,
            fair_no_odds=fair_no_odds,
            match_ids=match_ids,
            fold_id=fold_idx,
        )
        
        # Add fold metadata
        bet_df['train_start'] = fold_meta['train_start']
        bet_df['train_end'] = fold_meta['train_end']
        bet_df['test_start'] = fold_meta['test_start']
        bet_df['test_end'] = fold_meta['test_end']
        
        all_bets.append(bet_df)
        print(f"   ✅ Exported {len(bet_df)} bets (across all thresholds)")
    
    # Combine all folds
    print("\n" + "="*80)
    print("SAVING RESULTS")
    print("="*80)
    
    all_bets_df = pd.concat(all_bets, ignore_index=True)
    
    # Save to CSV
    results_dir = RESEARCH_DIR / 'results'
    results_dir.mkdir(exist_ok=True)
    
    output_file = results_dir / 'walkforward_poisson_per_bet.csv'
    all_bets_df.to_csv(output_file, index=False)
    
    print(f"\n✅ Saved per-bet data: {output_file}")
    print(f"   Total bets: {len(all_bets_df)}")
    print(f"   Columns: {list(all_bets_df.columns)}")
    
    # Print summary statistics
    print("\n" + "="*80)
    print("SUMMARY STATISTICS")
    print("="*80)
    
    print(f"\nTotal matches (unique): {all_bets_df['match_id'].nunique()}")
    print(f"Total bets (all thresholds): {len(all_bets_df)}")
    print(f"\nBreakdown by side:")
    print(all_bets_df['side'].value_counts())
    
    print(f"\nBreakdown by fold:")
    print(all_bets_df['fold'].value_counts().sort_index())
    
    print(f"\nBreakdown by threshold:")
    for side in ['YES', 'NO']:
        side_df = all_bets_df[all_bets_df['side'] == side]
        print(f"\n{side} side:")
        print(side_df.groupby('threshold').size())
    
    print(f"\nOverall win rate: {all_bets_df['is_win'].mean():.1%}")
    print(f"YES win rate: {all_bets_df[all_bets_df['side'] == 'YES']['is_win'].mean():.1%}")
    print(f"NO win rate: {all_bets_df[all_bets_df['side'] == 'NO']['is_win'].mean():.1%}")
    
    print("\n" + "="*80)
    print("EXPORT COMPLETE")
    print("="*80)
    print(f"\nNext steps:")
    print(f"  1. Run: python3 scripts/analyze_poisson_two_sided_buckets.py")
    print(f"  2. Review: BTTS_POISSON_EDGE_AND_PROB_BUCKETS.md")


if __name__ == '__main__':
    export_poisson_per_bet()
