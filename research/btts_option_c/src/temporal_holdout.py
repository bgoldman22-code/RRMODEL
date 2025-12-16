#!/usr/bin/env python3
"""
Temporal Holdout Experiment Module

Implements a single temporal train/test split for BTTS prediction:
- Percentage-based split by chronological date (default 40% train / 60% test)
- Train models on earliest matches, test on future matches
- No k-fold cross-validation (simpler than walk-forward)
- Evaluates Phase 1 + Phase 2 models only (skip Phase 3 hybrids)

This answers: "If we trained once on ~1 season and froze the model,
how well would it have done on future matches?"
"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import Optional
from sklearn.metrics import roc_auc_score, brier_score_loss, log_loss

# Import existing model functions (already leak-free)
from model_baselines import (
    prepare_features,
    fit_logistic, predict_logistic,
    fit_poisson, predict_poisson,
    fit_random_forest, predict_random_forest
)
from model_ml import (
    prepare_features_ml,
    fit_lightgbm, predict_lightgbm,
    fit_xgboost, predict_xgboost,
    fit_catboost, predict_catboost
)
from evaluate import run_threshold_sweep, compute_fair_yes_odds, run_two_sided_threshold_sweep, compute_fair_two_way


# ============================================================
# CONFIGURATION
# ============================================================

TRAIN_FRACTION = 0.40  # 40% of earliest matches for training
CONFIDENCE_THRESHOLDS = [0.55, 0.60]  # For ROI curves
ROI_THRESHOLD_GRID = [round(x, 2) for x in np.arange(0.50, 0.66, 0.01)]
STAKE_PER_BET = 10.0

# Models to evaluate
PHASE1_MODELS = ['logistic', 'poisson', 'random_forest']
PHASE2_MODELS = ['lightgbm', 'xgboost', 'catboost']


# ============================================================
# TEMPORAL SPLIT
# ============================================================

def temporal_train_test_split(
    df: pd.DataFrame,
    train_fraction: float = TRAIN_FRACTION,
    cutoff_date: Optional[datetime] = None,
):
    """
    Split data by chronological date using percentage
    
    Args:
        df: DataFrame with 'date' column
        train_fraction: Fraction of earliest matches to use for training (default 0.40)
    
    Returns:
        train_df, test_df, split_metadata dict
    """
    print("\n" + "="*80)
    print("TEMPORAL TRAIN/TEST SPLIT")
    print("="*80)
    
    # Sort by date and ensure datetime dtype
    df_sorted = df.copy()
    df_sorted['date'] = pd.to_datetime(df_sorted['date'])
    df_sorted = df_sorted.sort_values('date').reset_index(drop=True)
    n = len(df_sorted)
    if n == 0:
        raise ValueError("Temporal split requires at least one row")

    unique_dates = df_sorted['date'].drop_duplicates().reset_index(drop=True)
    if len(unique_dates) < 2:
        raise ValueError("Temporal split requires at least two unique match dates")

    if cutoff_date is None:
        raw_idx = int(np.floor(len(unique_dates) * train_fraction))
        bounded_idx = int(np.clip(raw_idx, 1, len(unique_dates) - 1))
        cutoff_date = unique_dates.iloc[bounded_idx - 1]
        split_source = f"quantile_{train_fraction:.0%}"
    else:
        cutoff_date = pd.to_datetime(cutoff_date)
        split_source = "explicit"
        if cutoff_date <= unique_dates.min() or cutoff_date >= unique_dates.max():
            raise ValueError(
                "Provided cutoff_date must fall within observed date range and allow non-empty train/test sets"
            )

    train_mask = df_sorted['date'] <= cutoff_date
    test_mask = df_sorted['date'] > cutoff_date

    train_df = df_sorted.loc[train_mask].copy()
    test_df = df_sorted.loc[test_mask].copy()

    if len(train_df) == 0 or len(test_df) == 0:
        raise ValueError(
            f"Temporal split failed: cutoff_date {cutoff_date} produces empty train ({len(train_df)}) or test ({len(test_df)}) set"
        )

    actual_fraction = len(train_df) / n
    train_unique_dates = train_df['date'].nunique()
    test_unique_dates = test_df['date'].nunique()

    # Log split info
    print(f"Target train fraction: {train_fraction:.1%}")
    print(f"Actual train fraction: {actual_fraction:.1%}")
    print(f"Cutoff date (train <= cutoff): {cutoff_date.date()} [{split_source}]")
    print(f"Total matches: {n} | Unique dates: {len(unique_dates)}")
    print(f"\n📊 TRAIN SET ({len(train_df)} matches across {train_unique_dates} dates):")
    print(f"   Date range: {train_df['date'].min().date()} to {train_df['date'].max().date()}")
    print(f"   BTTS distribution: {train_df['btts'].value_counts().to_dict()}")
    
    print(f"\n📊 TEST SET ({len(test_df)} matches across {test_unique_dates} dates):")
    print(f"   Date range: {test_df['date'].min().date()} to {test_df['date'].max().date()}")
    print(f"   BTTS distribution: {test_df['btts'].value_counts().to_dict()}")
    
    # Sanity checks
    if train_df['btts'].nunique() < 2:
        print("\n⚠️  WARNING: Train set has only one BTTS class!")
    if test_df['btts'].nunique() < 2:
        print("\n⚠️  WARNING: Test set has only one BTTS class!")
    
    # Verify temporal ordering (no overlap)
    assert train_df['date'].max() <= test_df['date'].min(), \
        "Train/test date overlap detected!"
    
    print("\n✅ Temporal split complete (no date overlap)")
    print("="*80)
    
    split_metadata = {
        'cutoff_date': cutoff_date,
        'split_source': split_source,
        'train_fraction_target': train_fraction,
        'train_fraction_actual': actual_fraction,
        'train_unique_dates': train_unique_dates,
        'test_unique_dates': test_unique_dates,
        'total_rows': n,
        'total_unique_dates': len(unique_dates)
    }
    
    return train_df, test_df, split_metadata


# ============================================================
# MODEL TRAINING & PREDICTION
# ============================================================

def train_and_predict_phase1(model_name: str, train_df: pd.DataFrame, test_df: pd.DataFrame):
    """
    Train and predict Phase 1 baseline model
    
    Args:
        model_name: 'logistic', 'poisson', or 'random_forest'
        train_df: Training data
        test_df: Test data
    
    Returns:
        y_proba_test: Predicted probabilities on test set
    """
    if model_name == 'logistic':
        # Logistic uses prepare_features
        model_dict = fit_logistic(train_df)
        y_proba_test = predict_logistic(model_dict, test_df)
    
    elif model_name == 'poisson':
        # Poisson doesn't use prepare_features (different API)
        model = fit_poisson(train_df)
        y_proba_test = predict_poisson(model, test_df)
    
    elif model_name == 'random_forest':
        # Random Forest uses prepare_features
        model_dict = fit_random_forest(train_df)
        y_proba_test = predict_random_forest(model_dict, test_df)
    
    else:
        raise ValueError(f"Unknown Phase 1 model: {model_name}")
    
    return y_proba_test


def train_and_predict_phase2(model_name: str, train_df: pd.DataFrame, test_df: pd.DataFrame):
    """
    Train and predict Phase 2 modern ML model
    
    Args:
        model_name: 'lightgbm', 'xgboost', or 'catboost'
        train_df: Training data
        test_df: Test data
    
    Returns:
        y_proba_test: Predicted probabilities on test set
    """
    if model_name == 'lightgbm':
        model_dict = fit_lightgbm(train_df)
        y_proba_test = predict_lightgbm(model_dict, test_df)
    
    elif model_name == 'xgboost':
        model_dict = fit_xgboost(train_df)
        y_proba_test = predict_xgboost(model_dict, test_df)
    
    elif model_name == 'catboost':
        model_dict = fit_catboost(train_df)
        y_proba_test = predict_catboost(model_dict, test_df)
    
    else:
        raise ValueError(f"Unknown Phase 2 model: {model_name}")
    
    return y_proba_test


# ============================================================
# METRICS COMPUTATION
# ============================================================

def compute_metrics(y_true, y_proba):
    """
    Compute classification metrics
    
    Returns:
        dict with auc, brier, logloss
    """
    metrics = {
        'auc': roc_auc_score(y_true, y_proba),
        'brier': brier_score_loss(y_true, y_proba),
        'logloss': log_loss(y_true, y_proba)
    }
    return metrics


# ============================================================
# MAIN EXPERIMENT RUNNER
# ============================================================

def run_temporal_holdout_experiment(df: pd.DataFrame, train_fraction: float = TRAIN_FRACTION):
    """
    Run complete temporal holdout experiment
    
    Args:
        df: Complete dataset with features, labels, and odds
        train_fraction: Fraction of earliest matches for training (default 0.40)
    
    Returns:
        metrics_df: DataFrame with model metrics on test set
        roi_df: DataFrame with ROI results on test set
    """
    print("\n" + "="*80)
    print("TEMPORAL HOLDOUT EXPERIMENT")
    print("="*80)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Split data temporally
    train_df, test_df, split_meta = temporal_train_test_split(df, train_fraction)
    
    # Store date ranges for reporting
    train_start = train_df['date'].min().date()
    train_end = train_df['date'].max().date()
    test_start = test_df['date'].min().date()
    test_end = test_df['date'].max().date()
    train_size = len(train_df)
    test_size = len(test_df)
    cutoff_date = split_meta['cutoff_date']
    actual_fraction = split_meta['train_fraction_actual']
    
    # Get test labels and odds
    y_true_test = test_df['btts'].values
    yes_odds_test = test_df['btts_yes_odds'].values if 'btts_yes_odds' in test_df.columns else np.full(len(test_df), np.nan)
    no_odds_test = test_df['btts_no_odds'].values if 'btts_no_odds' in test_df.columns else np.full(len(test_df), np.nan)
    fair_yes_odds = compute_fair_yes_odds(yes_odds_test, no_odds_test)
    
    # Storage for results
    metrics_list = []
    roi_list = []
    
    # ========== PHASE 1: BASELINE MODELS ==========
    print("\n" + "="*80)
    print("PHASE 1: BASELINE MODELS")
    print("="*80)
    
    for model_name in PHASE1_MODELS:
        print(f"\n🔹 Training {model_name}...")
        try:
            y_proba_test = train_and_predict_phase1(model_name, train_df, test_df)
            
            # Compute metrics
            metrics = compute_metrics(y_true_test, y_proba_test)
            print(f"   AUC: {metrics['auc']:.4f}, Brier: {metrics['brier']:.4f}, LogLoss: {metrics['logloss']:.4f}")
            
            # Store metrics
            metrics_list.append({
                'phase': 'phase1',
                'model': model_name,
                'auc': metrics['auc'],
                'brier': metrics['brier'],
                'logloss': metrics['logloss'],
                'train_start': train_start,
                'train_end': train_end,
                'test_start': test_start,
                'test_end': test_end,
                'train_size': train_size,
                'test_size': test_size,
                'train_cutoff_date': cutoff_date,
                'train_fraction_target': train_fraction,
                'train_fraction_actual': actual_fraction,
                'split_source': split_meta['split_source'],
                'train_unique_dates': split_meta['train_unique_dates'],
                'test_unique_dates': split_meta['test_unique_dates']
            })
            
            roi_sweep = run_threshold_sweep(
                y_true_test,
                y_proba_test,
                yes_odds_test,
                thresholds=ROI_THRESHOLD_GRID,
                stake=STAKE_PER_BET,
                require_positive_edge=True,
                fair_yes_odds=fair_yes_odds
            )
            for sweep_row in roi_sweep:
                if sweep_row['threshold'] in CONFIDENCE_THRESHOLDS:
                    print(
                        f"   ROI @ {sweep_row['threshold']:.2f}: {sweep_row['roi']:.2f}% "
                        f"({sweep_row['bets']} bets, {sweep_row['wins']} wins)"
                    )
                roi_list.append({
                    'phase': 'phase1',
                    'model': model_name,
                    'threshold': sweep_row['threshold'],
                    'bets': sweep_row['bets'],
                    'wins': sweep_row['wins'],
                    'profit': sweep_row['profit'],
                    'profit_fair': sweep_row['profit_fair'],
                    'roi': sweep_row['roi'],
                    'roi_fair': sweep_row['roi_fair'],
                    'total_staked': sweep_row['total_staked'],
                    'avg_edge': sweep_row['avg_edge'],
                    'median_edge': sweep_row['median_edge'],
                    'train_start': train_start,
                    'train_end': train_end,
                    'test_start': test_start,
                    'test_end': test_end,
                    'train_cutoff_date': cutoff_date,
                    'train_fraction_target': train_fraction,
                    'train_fraction_actual': actual_fraction,
                    'split_source': split_meta['split_source']
                })
        
        except Exception as e:
            print(f"   ❌ ERROR: {e}")
            continue
    
    # ========== PHASE 2: MODERN ML MODELS ==========
    print("\n" + "="*80)
    print("PHASE 2: MODERN ML MODELS")
    print("="*80)
    
    for model_name in PHASE2_MODELS:
        print(f"\n🔹 Training {model_name}...")
        try:
            y_proba_test = train_and_predict_phase2(model_name, train_df, test_df)
            
            # Compute metrics
            metrics = compute_metrics(y_true_test, y_proba_test)
            print(f"   AUC: {metrics['auc']:.4f}, Brier: {metrics['brier']:.4f}, LogLoss: {metrics['logloss']:.4f}")
            
            # Store metrics
            metrics_list.append({
                'phase': 'phase2',
                'model': model_name,
                'auc': metrics['auc'],
                'brier': metrics['brier'],
                'logloss': metrics['logloss'],
                'train_start': train_start,
                'train_end': train_end,
                'test_start': test_start,
                'test_end': test_end,
                'train_size': train_size,
                'test_size': test_size,
                'train_cutoff_date': cutoff_date,
                'train_fraction_target': train_fraction,
                'train_fraction_actual': actual_fraction,
                'split_source': split_meta['split_source'],
                'train_unique_dates': split_meta['train_unique_dates'],
                'test_unique_dates': split_meta['test_unique_dates']
            })
            
            roi_sweep = run_threshold_sweep(
                y_true_test,
                y_proba_test,
                yes_odds_test,
                thresholds=ROI_THRESHOLD_GRID,
                stake=STAKE_PER_BET,
                require_positive_edge=True,
                fair_yes_odds=fair_yes_odds
            )
            for sweep_row in roi_sweep:
                if sweep_row['threshold'] in CONFIDENCE_THRESHOLDS:
                    print(
                        f"   ROI @ {sweep_row['threshold']:.2f}: {sweep_row['roi']:.2f}% "
                        f"({sweep_row['bets']} bets, {sweep_row['wins']} wins)"
                    )
                roi_list.append({
                    'phase': 'phase2',
                    'model': model_name,
                    'threshold': sweep_row['threshold'],
                    'bets': sweep_row['bets'],
                    'wins': sweep_row['wins'],
                    'profit': sweep_row['profit'],
                    'profit_fair': sweep_row['profit_fair'],
                    'roi': sweep_row['roi'],
                    'roi_fair': sweep_row['roi_fair'],
                    'total_staked': sweep_row['total_staked'],
                    'avg_edge': sweep_row['avg_edge'],
                    'median_edge': sweep_row['median_edge'],
                    'train_start': train_start,
                    'train_end': train_end,
                    'test_start': test_start,
                    'test_end': test_end,
                    'train_cutoff_date': cutoff_date,
                    'train_fraction_target': train_fraction,
                    'train_fraction_actual': actual_fraction,
                    'split_source': split_meta['split_source']
                })
        
        except Exception as e:
            print(f"   ❌ ERROR: {e}")
            continue
    
    # ========== TWO-SIDED BETTING EVALUATION ==========
    print("\n" + "="*80)
    print("TWO-SIDED BETTING EVALUATION (YES + NO)")
    print("="*80)
    print("Computing two-sided threshold sweeps for all models...")
    print("(This extends betting to both BTTS YES and BTTS NO using p_no = 1 - p_yes)")
    
    # Compute fair odds for both sides
    fair_yes_odds_full, fair_no_odds_full = compute_fair_two_way(yes_odds_test, no_odds_test)
    
    # Define threshold grids for both sides
    thresholds_yes = ROI_THRESHOLD_GRID
    thresholds_no = ROI_THRESHOLD_GRID
    
    # Storage for two-sided results
    two_sided_list = []
    
    # Re-run predictions and compute two-sided sweeps for all models
    all_models = [(phase, model) for phase in ['phase1', 'phase2'] 
                  for model in (PHASE1_MODELS if phase == 'phase1' else PHASE2_MODELS)]
    
    for phase, model_name in all_models:
        try:
            # Get predictions again (we need them for two-sided sweep)
            if phase == 'phase1':
                y_proba_test = train_and_predict_phase1(model_name, train_df, test_df)
            else:
                y_proba_test = train_and_predict_phase2(model_name, train_df, test_df)
            
            # Run two-sided threshold sweep
            sweep_two_sided = run_two_sided_threshold_sweep(
                y_true=y_true_test,
                y_proba=y_proba_test,
                yes_odds=yes_odds_test,
                no_odds=no_odds_test,
                thresholds_yes=thresholds_yes,
                thresholds_no=thresholds_no,
                stake=STAKE_PER_BET,
                fair_yes_odds=fair_yes_odds_full,
                fair_no_odds=fair_no_odds_full,
            )
            
            # Add metadata columns
            sweep_two_sided['phase'] = phase
            sweep_two_sided['model'] = model_name
            sweep_two_sided['train_start'] = train_start
            sweep_two_sided['train_end'] = train_end
            sweep_two_sided['test_start'] = test_start
            sweep_two_sided['test_end'] = test_end
            sweep_two_sided['train_cutoff_date'] = cutoff_date
            sweep_two_sided['train_fraction_target'] = train_fraction
            sweep_two_sided['train_fraction_actual'] = actual_fraction
            sweep_two_sided['split_source'] = split_meta['split_source']
            
            two_sided_list.append(sweep_two_sided)
            
            # Print summary for key thresholds
            for side in ['YES', 'NO']:
                best_row = sweep_two_sided[
                    (sweep_two_sided['side'] == side) & 
                    (sweep_two_sided['threshold'].isin(CONFIDENCE_THRESHOLDS))
                ].nlargest(1, 'roi_fair')
                
                if len(best_row) > 0:
                    row = best_row.iloc[0]
                    print(f"   {model_name:15s} | {side:3s} @ {row['threshold']:.2f}: "
                          f"ROI={row['roi']:.2f}% ({row['n_bets']} bets, {row['n_wins']} wins)")
        
        except Exception as e:
            print(f"   ❌ ERROR ({phase}/{model_name}): {e}")
            continue
    
    # Combine all two-sided results
    if two_sided_list:
        two_sided_df = pd.concat(two_sided_list, ignore_index=True)
        
        # Save two-sided results
        results_dir = Path(__file__).parent.parent / 'results'
        results_dir.mkdir(exist_ok=True)
        two_sided_file = results_dir / 'temporal_holdout_two_sided_roi.csv'
        two_sided_df.to_csv(two_sided_file, index=False)
        print(f"\n✅ Saved two-sided ROI to: {two_sided_file}")
        print(f"   Total rows: {len(two_sided_df)} (YES + NO sweeps for all models)")
    else:
        print("\n⚠️  No two-sided results to save")
    
    print("="*80)
    
    # Convert to DataFrames
    metrics_df = pd.DataFrame(metrics_list)
    roi_df = pd.DataFrame(roi_list)
    
    print("\n" + "="*80)
    print("TEMPORAL HOLDOUT EXPERIMENT COMPLETE")
    print("="*80)
    print(f"Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    return metrics_df, roi_df


# ============================================================
# SANITY CHECKS
# ============================================================

def print_sanity_check(metrics_df: pd.DataFrame, roi_df: pd.DataFrame):
    """
    Print sanity check summary to detect suspicious results
    
    Checks for:
    - Perfect AUC (>= 0.99)
    - Perfect Brier (<= 0.01)
    - Identical ROI across multiple models
    """
    print("\n" + "="*80)
    print("🔍 SANITY CHECK")
    print("="*80)
    
    # AUC range
    min_auc = metrics_df['auc'].min()
    max_auc = metrics_df['auc'].max()
    print(f"AUC range: {min_auc:.4f} to {max_auc:.4f}")
    
    if max_auc >= 0.99:
        print("⚠️  WARNING: AUC >= 0.99 detected (suspiciously high)")
        perfect_models = metrics_df[metrics_df['auc'] >= 0.99]
        for _, row in perfect_models.iterrows():
            print(f"   {row['phase']} - {row['model']}: AUC = {row['auc']:.4f}")
    
    # Brier range
    min_brier = metrics_df['brier'].min()
    max_brier = metrics_df['brier'].max()
    print(f"Brier range: {min_brier:.4f} to {max_brier:.4f}")
    
    if min_brier <= 0.01:
        print("⚠️  WARNING: Brier <= 0.01 detected (suspiciously low)")
        perfect_models = metrics_df[metrics_df['brier'] <= 0.01]
        for _, row in perfect_models.iterrows():
            print(f"   {row['phase']} - {row['model']}: Brier = {row['brier']:.4f}")
    
    # Check for identical ROI (group by threshold)
    for threshold in CONFIDENCE_THRESHOLDS:
        roi_subset = roi_df[roi_df['threshold'] == threshold].copy()
        if len(roi_subset) == 0:
            continue
        
        # Round ROI to 4 decimals for comparison
        roi_subset['roi_rounded'] = roi_subset['roi'].round(4)
        roi_counts = roi_subset['roi_rounded'].value_counts()
        
        # If 3+ models have identical ROI, flag it
        duplicates = roi_counts[roi_counts >= 3]
        if len(duplicates) > 0:
            print(f"\n⚠️  WARNING: Identical ROI at threshold {threshold:.2f}")
            for roi_value, count in duplicates.items():
                print(f"   {count} models with ROI = {roi_value:.4f}%")
                identical_models = roi_subset[roi_subset['roi_rounded'] == roi_value]
                for _, row in identical_models.iterrows():
                    print(f"      {row['phase']} - {row['model']}")
    
    # Expected ranges
    print("\n✅ EXPECTED RANGES (for valid results):")
    print("   AUC: 0.60 - 0.80 (good models)")
    print("   Brier: 0.18 - 0.24 (good calibration)")
    print("   ROI: Different for each model (not identical)")
    
    print("="*80)


# ============================================================
# LEADERBOARDS
# ============================================================

def print_leaderboards(metrics_df: pd.DataFrame, roi_df: pd.DataFrame):
    """
    Print leaderboards for top models
    """
    print("\n" + "="*80)
    print("📊 LEADERBOARD: TOP MODELS BY AUC")
    print("="*80)
    
    top_auc = metrics_df.sort_values('auc', ascending=False).head(6)
    for idx, row in top_auc.iterrows():
        print(f"{idx+1}. {row['phase']} - {row['model']}")
        print(f"   AUC: {row['auc']:.4f}, Brier: {row['brier']:.4f}, LogLoss: {row['logloss']:.4f}")
    
    # ROI leaderboards per threshold
    for threshold in CONFIDENCE_THRESHOLDS:
        print(f"\n" + "="*80)
        print(f"💰 LEADERBOARD: TOP MODELS BY ROI @ {threshold:.2f} THRESHOLD")
        print("="*80)
        
        roi_subset = roi_df[roi_df['threshold'] == threshold].copy()
        top_roi = roi_subset.sort_values('roi', ascending=False).head(6)
        
        for idx, row in top_roi.iterrows():
            print(f"{idx+1}. {row['phase']} - {row['model']}")
            print(f"   ROI: {row['roi']:.2f}%, Bets: {row['bets']}, Wins: {row['wins']}, Profit: ${row['profit']:.2f}")
    
    print("="*80)
