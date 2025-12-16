#!/usr/bin/env python3
"""
Leak-Free Walk-Forward Validation

Runs walk-forward backtesting for all leak-free models:
- poisson_leakfree
- logistic_leakfree
- rf_leakfree
- gbm_leakfree

Uses ONLY pre-match features (no data leakage).

Author: Co-CTO
Date: December 11, 2025
"""

import pandas as pd
import numpy as np
from pathlib import Path
import sys
import warnings
warnings.filterwarnings('ignore')

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from model_leakfree import fit_model, predict_proba, MODEL_REGISTRY
from evaluate import (
    compute_classification_metrics,
    run_two_sided_threshold_sweep,
    compute_fair_two_way
)

RESEARCH_DIR = Path(__file__).parent
RESULTS_DIR = RESEARCH_DIR / 'results'
RESULTS_DIR.mkdir(exist_ok=True)


def create_leakfree_walkforward_splits(df, n_splits=6):
    """
    Create expanding-window walk-forward splits.
    
    Args:
        df: DataFrame with date column
        n_splits: Number of folds
        
    Returns:
        List of (train_df, test_df, metadata) tuples
    """
    print(f"\n{'='*80}")
    print(f"CREATING WALK-FORWARD SPLITS")
    print(f"{'='*80}\n")
    
    df = df.copy()
    df = df.sort_values('date').reset_index(drop=True)
    
    min_date = df['date'].min()
    max_date = df['date'].max()
    total_days = (max_date - min_date).days
    
    print(f"📅 Date range: {min_date.date()} to {max_date.date()}")
    print(f"   Total days: {total_days}")
    print(f"   Total matches: {len(df)}")
    
    # Use fixed test window of 60 days, step by 60 days
    test_window_days = 60
    step_days = 60
    min_train_days = 150
    
    splits = []
    current_end_date = min_date + pd.Timedelta(days=min_train_days + test_window_days)
    fold_num = 1
    
    while current_end_date <= max_date:
        test_start_date = current_end_date - pd.Timedelta(days=test_window_days)
        test_end_date = current_end_date
        
        # Train on all data before test start
        train_mask = df['date'] < test_start_date
        test_mask = (df['date'] >= test_start_date) & (df['date'] < test_end_date)
        
        train_df = df[train_mask].copy()
        test_df = df[test_mask].copy()
        
        # Skip if insufficient matches
        if len(train_df) < 200 or len(test_df) < 30:
            current_end_date += pd.Timedelta(days=step_days)
            continue
        
        metadata = {
            'fold': fold_num,
            'train_start': train_df['date'].min().date(),
            'train_end': train_df['date'].max().date(),
            'test_start': test_df['date'].min().date(),
            'test_end': test_df['date'].max().date(),
            'train_matches': len(train_df),
            'test_matches': len(test_df),
        }
        
        splits.append((train_df, test_df, metadata))
        
        print(f"\n✅ Fold {fold_num}:")
        print(f"   Train: {metadata['train_start']} to {metadata['train_end']} ({metadata['train_matches']} matches)")
        print(f"   Test:  {metadata['test_start']} to {metadata['test_end']} ({metadata['test_matches']} matches)")
        
        fold_num += 1
        current_end_date += pd.Timedelta(days=step_days)
    
    print(f"\n📊 Created {len(splits)} folds")
    
    return splits


def run_leakfree_walkforward(model_name, df, feature_cols):
    """
    Run walk-forward validation for a single leak-free model.
    
    Args:
        model_name: Model identifier
        df: DataFrame with features and labels
        feature_cols: List of feature column names
        
    Returns:
        DataFrame with per-bet results
    """
    print(f"\n{'='*80}")
    print(f"WALK-FORWARD: {model_name}")
    print(f"{'='*80}\n")
    
    splits = create_leakfree_walkforward_splits(df, n_splits=6)
    
    all_results = []
    
    for train_df, test_df, metadata in splits:
        print(f"\n🔄 Processing Fold {metadata['fold']}...")
        
        # Prepare features (fill NaN with 0)
        X_train = train_df[feature_cols].fillna(0).values
        y_train = train_df['btts'].values
        X_test = test_df[feature_cols].fillna(0).values
        y_test = test_df['btts'].values
        
        # Get odds
        yes_odds = test_df['btts_yes_odds'].values if 'btts_yes_odds' in test_df.columns else np.full(len(test_df), np.nan)
        no_odds = test_df['btts_no_odds'].values if 'btts_no_odds' in test_df.columns else np.full(len(test_df), np.nan)
        
        # Train model
        print(f"   Training {model_name}...")
        model = fit_model(model_name, X_train, y_train, feature_names=feature_cols)
        
        # Predict
        print(f"   Predicting on test set...")
        y_pred = predict_proba(model, X_test)
        
        # Compute classification metrics
        metrics = compute_classification_metrics(y_test, y_pred)
        
        print(f"   📊 Metrics:")
        print(f"      AUC: {metrics['auc']:.4f}")
        print(f"      Brier: {metrics['brier']:.4f}")
        
        # Run two-sided threshold sweep
        print(f"   Running two-sided threshold sweep...")
        
        # Compute fair odds (remove vig proportionally)
        fair_yes_odds, fair_no_odds = compute_fair_two_way(yes_odds, no_odds)
        
        # Run sweep
        sweep_results = run_two_sided_threshold_sweep(
            y_true=y_test,
            y_pred_btts=y_pred,
            yes_odds=yes_odds,
            no_odds=no_odds,
            fair_yes_odds=fair_yes_odds,
            fair_no_odds=fair_no_odds,
            threshold_grid=np.arange(0.45, 0.75, 0.025)
        )
        
        # Add metadata to each bet
        for result in sweep_results:
            result['fold'] = metadata['fold']
            result['model'] = model_name
            result['train_start'] = metadata['train_start']
            result['train_end'] = metadata['train_end']
            result['test_start'] = metadata['test_start']
            result['test_end'] = metadata['test_end']
            all_results.append(result)
        
        print(f"   ✅ Fold {metadata['fold']} complete: {len(sweep_results)} threshold results")
    
    # Convert to DataFrame
    results_df = pd.DataFrame(all_results)
    
    print(f"\n✅ Walk-forward complete for {model_name}")
    print(f"   Total results: {len(results_df)}")
    
    return results_df


def main():
    """Main execution function."""
    
    print("\n" + "="*80)
    print("LEAK-FREE BTTS WALK-FORWARD VALIDATION")
    print("="*80)
    
    # Load leak-free features
    features_path = RESEARCH_DIR / 'data' / 'btts_leakfree_features.parquet'
    
    print(f"\n📂 Loading leak-free features from: {features_path}")
    
    if not features_path.exists():
        print(f"❌ Features not found!")
        print(f"   Run: python3 src/features_leakfree.py")
        return
    
    df = pd.read_parquet(features_path)
    print(f"   ✅ Loaded {len(df)} matches with {len(df.columns)} columns")
    
    # Get feature columns
    exclude_cols = [
        'fixture_id', 'season', 'date', 'home', 'away', 'home_norm', 'away_norm',
        'btts', 'home_goals', 'away_goals', 'home_xg', 'away_xg',
        'venue', 'referee', 'bookmaker'
    ]
    
    feature_cols = [c for c in df.columns if c not in exclude_cols]
    
    # Remove any non-numeric columns
    numeric_cols = df[feature_cols].select_dtypes(include=['number']).columns.tolist()
    feature_cols = numeric_cols
    
    print(f"   📊 Using {len(feature_cols)} leak-free features")
    
    # Run walk-forward for each model
    model_names = ['poisson_leakfree', 'logistic_leakfree', 'rf_leakfree', 'gbm_leakfree']
    
    all_model_results = {}
    
    for model_name in model_names:
        print(f"\n{'#'*80}")
        print(f"# MODEL: {model_name.upper()}")
        print(f"{'#'*80}")
        
        results_df = run_leakfree_walkforward(model_name, df, feature_cols)
        all_model_results[model_name] = results_df
        
        # Save individual model results
        output_path = RESULTS_DIR / f'walkforward_leakfree_{model_name}_thresholds.csv'
        results_df.to_csv(output_path, index=False)
        print(f"\n💾 Saved results to: {output_path}")
    
    # Combine all results
    combined_df = pd.concat(all_model_results.values(), ignore_index=True)
    combined_path = RESULTS_DIR / 'walkforward_leakfree_all_models_thresholds.csv'
    combined_df.to_csv(combined_path, index=False)
    
    print(f"\n{'='*80}")
    print("SUMMARY")
    print(f"{'='*80}\n")
    
    # Summary by model
    for model_name in model_names:
        model_df = combined_df[combined_df['model'] == model_name]
        
        # Aggregate across all folds at optimal threshold
        # (Use threshold that maximizes fair ROI)
        threshold_agg = model_df.groupby('threshold_yes').agg({
            'total_bets': 'sum',
            'yes_bets': 'sum',
            'no_bets': 'sum',
            'fair_roi': 'mean',
            'market_roi': 'mean'
        }).reset_index()
        
        best_threshold_row = threshold_agg.loc[threshold_agg['fair_roi'].idxmax()]
        
        print(f"\n📊 {model_name.upper()}:")
        print(f"   Best threshold (YES): {best_threshold_row['threshold_yes']:.3f}")
        print(f"   Total bets: {best_threshold_row['total_bets']:.0f}")
        print(f"   YES bets: {best_threshold_row['yes_bets']:.0f}")
        print(f"   NO bets: {best_threshold_row['no_bets']:.0f}")
        print(f"   Fair ROI: {best_threshold_row['fair_roi']:.2%}")
        print(f"   Market ROI: {best_threshold_row['market_roi']:.2%}")
    
    print(f"\n💾 Combined results saved to: {combined_path}")
    print(f"\n✅ Walk-forward validation complete!")


if __name__ == '__main__':
    main()
