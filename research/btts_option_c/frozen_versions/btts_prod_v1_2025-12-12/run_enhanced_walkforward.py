#!/usr/bin/env python3
"""
Enhanced Leak-Free Walk-Forward Validation

Runs walk-forward backtesting for enhanced leak-free models:
- poisson_leakfree (baseline)
- logistic_tuned
- rf_tuned
- gbm_fixed
- ensemble_rf_logistic

Uses ONLY pre-match features (no data leakage).
Includes per-bet output with match details and edge calculations.

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

from model_leakfree_enhanced import fit_model_enhanced, predict_proba_enhanced, MODEL_REGISTRY_ENHANCED
from model_leakfree import PoissonLeakFreeModel
from sklearn.metrics import roc_auc_score, brier_score_loss

RESEARCH_DIR = Path(__file__).parent
RESULTS_DIR = RESEARCH_DIR / 'results'
RESULTS_DIR.mkdir(exist_ok=True)


def create_walkforward_splits(df, n_splits=8):
    """
    Create expanding-window walk-forward splits.
    
    Args:
        df: DataFrame with date column
        n_splits: Approximate number of folds (auto-determined by step size)
        
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
        
        print(f"   Fold {fold_num}: Train [{metadata['train_start']} to {metadata['train_end']}] "
              f"({metadata['train_matches']} matches) → "
              f"Test [{metadata['test_start']} to {metadata['test_end']}] ({metadata['test_matches']} matches)")
        
        fold_num += 1
        current_end_date += pd.Timedelta(days=step_days)
    
    print(f"\n   ✅ Created {len(splits)} folds")
    
    return splits


def run_enhanced_walkforward(model_name, df, feature_cols):
    """
    Run walk-forward validation for a single enhanced model.
    
    Args:
        model_name: Key from MODEL_REGISTRY_ENHANCED
        df: Full dataframe
        feature_cols: List of feature column names
        
    Returns:
        DataFrame with per-fold metrics and per-bet results
    """
    print(f"\n{'='*80}")
    print(f"RUNNING ENHANCED WALK-FORWARD: {model_name}")
    print(f"{'='*80}\n")
    
    # Create splits
    splits = create_walkforward_splits(df)
    
    # Store per-fold metrics
    fold_metrics = []
    
    # Store per-bet results
    all_bets = []
    
    for train_df, test_df, metadata in splits:
        fold = metadata['fold']
        
        print(f"\n{'='*60}")
        print(f"Fold {fold}/{len(splits)}")
        print(f"{'='*60}")
        
        # Prepare train data
        X_train = train_df[feature_cols].fillna(0).values
        y_train = train_df['btts'].values
        
        # Prepare test data
        X_test = test_df[feature_cols].fillna(0).values
        y_test = test_df['btts'].values
        
        # Train model
        print(f"\n   Training {model_name}...")
        model = fit_model_enhanced(model_name, X_train, y_train, feature_cols)
        
        # Predict on test
        print(f"   Predicting on {len(X_test)} test matches...")
        y_pred = model.predict_proba(X_test)
        
        # Compute metrics
        auc = roc_auc_score(y_test, y_pred) if len(np.unique(y_test)) > 1 else np.nan
        brier = brier_score_loss(y_test, y_pred)
        
        print(f"\n   📊 Fold {fold} Metrics:")
        print(f"      AUC: {auc:.4f}")
        print(f"      Brier: {brier:.4f}")
        
        # Store metrics
        fold_metrics.append({
            'model': model_name,
            'fold': fold,
            'train_start': metadata['train_start'],
            'train_end': metadata['train_end'],
            'test_start': metadata['test_start'],
            'test_end': metadata['test_end'],
            'train_matches': metadata['train_matches'],
            'test_matches': metadata['test_matches'],
            'auc': auc,
            'brier': brier
        })
        
        # Store per-bet results
        for i, idx in enumerate(test_df.index):
            row = test_df.loc[idx]
            
            bet_record = {
                'model': model_name,
                'fold': fold,
                'fixture_id': row.get('fixture_id', ''),
                'date': row['date'],
                'home': row.get('home_norm', ''),
                'away': row.get('away_norm', ''),
                'btts_actual': int(y_test[i]),
                'btts_prob': y_pred[i],
                'btts_yes_odds': row.get('btts_yes_odds', np.nan),
                'btts_no_odds': row.get('btts_no_odds', np.nan),
            }
            
            # Compute edges if odds available
            # Using FAIR IMPLIED (vig-removed) method for mathematically correct edge
            if pd.notna(bet_record['btts_yes_odds']) and pd.notna(bet_record['btts_no_odds']):
                yes_implied = 1 / bet_record['btts_yes_odds']
                no_implied = 1 / bet_record['btts_no_odds']
                overround = yes_implied + no_implied
                vig = overround - 1.0
                
                # Remove vig proportionally to get fair probabilities
                fair_prob_yes = yes_implied / overround
                fair_prob_no = no_implied / overround
                
                # Edge = model_prob - fair_prob (NOT raw implied)
                bet_record['yes_edge'] = y_pred[i] - fair_prob_yes
                bet_record['no_edge'] = (1 - y_pred[i]) - fair_prob_no
                bet_record['vig'] = vig
                
                # Also compute raw edges for comparison/debugging
                bet_record['yes_edge_raw'] = y_pred[i] - yes_implied
                bet_record['no_edge_raw'] = (1 - y_pred[i]) - no_implied
            else:
                bet_record['yes_edge'] = np.nan
                bet_record['no_edge'] = np.nan
                bet_record['vig'] = np.nan
                bet_record['yes_edge_raw'] = np.nan
                bet_record['no_edge_raw'] = np.nan
            
            all_bets.append(bet_record)
    
    # Create DataFrames
    metrics_df = pd.DataFrame(fold_metrics)
    bets_df = pd.DataFrame(all_bets)
    
    # Print summary
    print(f"\n{'='*80}")
    print(f"SUMMARY: {model_name}")
    print(f"{'='*80}")
    print(f"\n   Mean AUC: {metrics_df['auc'].mean():.4f} (±{metrics_df['auc'].std():.4f})")
    print(f"   Mean Brier: {metrics_df['brier'].mean():.4f} (±{metrics_df['brier'].std():.4f})")
    print(f"   Total test bets: {len(bets_df)}")
    
    return metrics_df, bets_df


def main():
    """
    Run enhanced walk-forward for all models.
    """
    print("\n" + "="*80)
    print("ENHANCED LEAK-FREE WALK-FORWARD VALIDATION")
    print("="*80)
    
    # Load data
    print("\n📥 Loading feature data...")
    df = pd.read_parquet(RESEARCH_DIR / 'data' / 'btts_leakfree_features.parquet')
    
    # Get feature columns (149 features)
    feature_cols = [c for c in df.columns if c not in [
        'fixture_id', 'season', 'date', 'home', 'away', 'home_norm', 'away_norm',
        'venue', 'referee', 'btts', 'home_goals', 'away_goals', 'home_xg', 'away_xg',
        'bookmaker', 'btts_yes_odds', 'btts_no_odds'
    ]]
    
    print(f"   Shape: {df.shape}")
    print(f"   Features: {len(feature_cols)}")
    print(f"   Date range: {df['date'].min().date()} to {df['date'].max().date()}")
    
    # Models to test (exclude ensemble for now - too slow)
    models_to_test = [
        'poisson_leakfree',
        'logistic_tuned',
        'rf_tuned',
        'gbm_fixed'
    ]
    
    all_metrics = []
    all_bets = []
    
    for model_name in models_to_test:
        metrics_df, bets_df = run_enhanced_walkforward(model_name, df, feature_cols)
        
        all_metrics.append(metrics_df)
        all_bets.append(bets_df)
        
        # Save individual model results
        metrics_path = RESULTS_DIR / f'walkforward_enhanced_{model_name}_metrics.csv'
        bets_path = RESULTS_DIR / f'walkforward_enhanced_{model_name}_bets.csv'
        
        metrics_df.to_csv(metrics_path, index=False)
        bets_df.to_csv(bets_path, index=False)
        
        print(f"\n   💾 Saved results:")
        print(f"      Metrics: {metrics_path}")
        print(f"      Bets: {bets_path}")
    
    # Combine all results
    combined_metrics = pd.concat(all_metrics, ignore_index=True)
    combined_bets = pd.concat(all_bets, ignore_index=True)
    
    # Save combined
    combined_metrics.to_csv(RESULTS_DIR / 'walkforward_enhanced_all_models_metrics.csv', index=False)
    combined_bets.to_csv(RESULTS_DIR / 'walkforward_enhanced_all_models_bets.csv', index=False)
    
    # Print final comparison
    print(f"\n{'='*80}")
    print(f"FINAL MODEL COMPARISON")
    print(f"{'='*80}\n")
    
    summary = combined_metrics.groupby('model').agg({
        'auc': ['mean', 'std'],
        'brier': ['mean', 'std'],
        'test_matches': 'sum'
    }).round(4)
    
    print(summary)
    
    print(f"\n✅ Enhanced walk-forward validation complete!")
    print(f"   Results saved to: {RESULTS_DIR}")


if __name__ == '__main__':
    main()
