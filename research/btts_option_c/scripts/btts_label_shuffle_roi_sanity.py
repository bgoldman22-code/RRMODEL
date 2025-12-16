#!/usr/bin/env python3
"""
BTTS Label Shuffle ROI Sanity Check

Extends label-shuffle testing to ROI metrics. With shuffled labels,
we expect:
- AUC ~0.5 (random discrimination)
- ROI and ROI_fair ~0% (no edge, break-even after many trials)
- No "thousands of percent" ROIs

This verifies that profitable ROI in real data comes from genuine
predictive power, not from bugs in the calculation logic.
"""

import sys
from pathlib import Path
import pandas as pd
import numpy as np

# Add src to path
RESEARCH_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(RESEARCH_DIR))

from src.load_data import load_epl_btts_with_odds
from src.temporal_holdout import create_temporal_split
from src.model_baselines import train_poisson_btts
from src.evaluate import compute_fair_two_way, run_two_sided_threshold_sweep
from sklearn.metrics import roc_auc_score


def run_label_shuffle_roi_test(n_shuffles=10):
    """
    Run label-shuffle test focusing on ROI metrics.
    """
    print("="*80)
    print("LABEL SHUFFLE ROI SANITY CHECK")
    print("="*80)
    
    # Load data
    print("\n📊 Loading data...")
    df_full = load_epl_btts_with_odds()
    print(f"  Total matches: {len(df_full)}")
    
    # Create temporal split
    train_df, test_df = create_temporal_split(df_full, test_fraction=0.4)
    print(f"  Train: {len(train_df)}, Test: {len(test_df)}")
    
    # Train Poisson model on REAL labels (for feature preparation)
    print("\n🏗️ Training Poisson model...")
    model, feature_cols = train_poisson_btts(train_df)
    print(f"  Features: {len(feature_cols)}")
    
    # Get test features and predictions
    X_test = test_df[feature_cols].values
    y_test = test_df['btts'].values
    y_proba_real = model.predict(X_test)
    
    # Get odds
    yes_odds = test_df['btts_yes_odds'].values
    no_odds = test_df['btts_no_odds'].values
    
    # Compute fair odds
    fair_yes_odds, fair_no_odds = compute_fair_two_way(yes_odds, no_odds)
    
    # Filter to matches with both odds available
    has_both_odds = ~np.isnan(yes_odds) & ~np.isnan(no_odds)
    
    # Real labels performance
    print("\n✅ REAL LABELS (baseline):")
    auc_real = roc_auc_score(y_test[has_both_odds], y_proba_real[has_both_odds])
    print(f"  AUC: {auc_real:.4f}")
    
    df_real = run_two_sided_threshold_sweep(
        y_true=y_test[has_both_odds],
        y_proba=y_proba_real[has_both_odds],
        yes_odds=yes_odds[has_both_odds],
        no_odds=no_odds[has_both_odds],
        thresholds_yes=[0.55],
        thresholds_no=[0.65],
        stake=10.0,
        fair_yes_odds=fair_yes_odds[has_both_odds],
        fair_no_odds=fair_no_odds[has_both_odds],
    )
    
    yes_real = df_real[df_real['side'] == 'YES'].iloc[0]
    no_real = df_real[df_real['side'] == 'NO'].iloc[0]
    
    print(f"\n  YES (threshold 0.55):")
    print(f"    Bets: {yes_real['n_bets']}, Wins: {yes_real['n_wins']}, Win rate: {yes_real['win_rate']:.1%}")
    print(f"    ROI: {yes_real['roi']:.2f}%, Fair ROI: {yes_real['roi_fair']:.2f}%")
    
    print(f"\n  NO (threshold 0.65):")
    print(f"    Bets: {no_real['n_bets']}, Wins: {no_real['n_wins']}, Win rate: {no_real['win_rate']:.1%}")
    print(f"    ROI: {no_real['roi']:.2f}%, Fair ROI: {no_real['roi_fair']:.2f}%")
    
    # Now shuffle labels multiple times
    print(f"\n🔀 SHUFFLED LABELS ({n_shuffles} trials):")
    print("  Expected: AUC ~0.5, ROI ~0%, no extreme values")
    
    shuffle_results = {
        'auc': [],
        'yes_roi': [],
        'yes_roi_fair': [],
        'yes_bets': [],
        'no_roi': [],
        'no_roi_fair': [],
        'no_bets': [],
    }
    
    np.random.seed(42)
    for i in range(n_shuffles):
        # Shuffle labels
        y_shuffled = y_test[has_both_odds].copy()
        np.random.shuffle(y_shuffled)
        
        # Compute AUC
        auc_shuffled = roc_auc_score(y_shuffled, y_proba_real[has_both_odds])
        shuffle_results['auc'].append(auc_shuffled)
        
        # Compute ROI
        df_shuffled = run_two_sided_threshold_sweep(
            y_true=y_shuffled,
            y_proba=y_proba_real[has_both_odds],
            yes_odds=yes_odds[has_both_odds],
            no_odds=no_odds[has_both_odds],
            thresholds_yes=[0.55],
            thresholds_no=[0.65],
            stake=10.0,
            fair_yes_odds=fair_yes_odds[has_both_odds],
            fair_no_odds=fair_no_odds[has_both_odds],
        )
        
        yes_shuffled = df_shuffled[df_shuffled['side'] == 'YES'].iloc[0]
        no_shuffled = df_shuffled[df_shuffled['side'] == 'NO'].iloc[0]
        
        shuffle_results['yes_roi'].append(yes_shuffled['roi'])
        shuffle_results['yes_roi_fair'].append(yes_shuffled['roi_fair'])
        shuffle_results['yes_bets'].append(yes_shuffled['n_bets'])
        shuffle_results['no_roi'].append(no_shuffled['roi'])
        shuffle_results['no_roi_fair'].append(no_shuffled['roi_fair'])
        shuffle_results['no_bets'].append(no_shuffled['n_bets'])
    
    # Summarize shuffle results
    print(f"\n  AUC:")
    print(f"    Mean: {np.mean(shuffle_results['auc']):.4f}")
    print(f"    Std: {np.std(shuffle_results['auc']):.4f}")
    print(f"    Range: [{np.min(shuffle_results['auc']):.4f}, {np.max(shuffle_results['auc']):.4f}]")
    
    print(f"\n  YES ROI (raw):")
    print(f"    Mean: {np.mean(shuffle_results['yes_roi']):.2f}%")
    print(f"    Std: {np.std(shuffle_results['yes_roi']):.2f}%")
    print(f"    Range: [{np.min(shuffle_results['yes_roi']):.2f}%, {np.max(shuffle_results['yes_roi']):.2f}%]")
    
    print(f"\n  YES ROI (fair):")
    print(f"    Mean: {np.mean(shuffle_results['yes_roi_fair']):.2f}%")
    print(f"    Std: {np.std(shuffle_results['yes_roi_fair']):.2f}%")
    print(f"    Range: [{np.min(shuffle_results['yes_roi_fair']):.2f}%, {np.max(shuffle_results['yes_roi_fair']):.2f}%]")
    
    print(f"\n  NO ROI (raw):")
    print(f"    Mean: {np.mean(shuffle_results['no_roi']):.2f}%")
    print(f"    Std: {np.std(shuffle_results['no_roi']):.2f}%")
    print(f"    Range: [{np.min(shuffle_results['no_roi']):.2f}%, {np.max(shuffle_results['no_roi']):.2f}%]")
    
    print(f"\n  NO ROI (fair):")
    print(f"    Mean: {np.mean(shuffle_results['no_roi_fair']):.2f}%")
    print(f"    Std: {np.std(shuffle_results['no_roi_fair']):.2f}%")
    print(f"    Range: [{np.min(shuffle_results['no_roi_fair']):.2f}%, {np.max(shuffle_results['no_roi_fair']):.2f}%]")
    
    # Validation
    print("\n" + "="*80)
    print("✅ VALIDATION:")
    print("="*80)
    
    auc_close_to_50 = abs(np.mean(shuffle_results['auc']) - 0.5) < 0.05
    roi_close_to_0 = abs(np.mean(shuffle_results['yes_roi_fair'])) < 10  # Within ±10%
    no_extreme = all(abs(r) < 200 for r in shuffle_results['yes_roi_fair'] + shuffle_results['no_roi_fair'])
    
    if auc_close_to_50:
        print("  ✅ AUC clusters near 0.5 (random discrimination)")
    else:
        print(f"  ⚠️ AUC mean is {np.mean(shuffle_results['auc']):.4f}, expected ~0.5")
    
    if roi_close_to_0:
        print("  ✅ Mean fair ROI is near 0% (no systematic edge)")
    else:
        print(f"  ⚠️ Mean fair ROI is {np.mean(shuffle_results['yes_roi_fair']):.2f}%, expected ~0%")
    
    if no_extreme:
        print("  ✅ No extreme ROI values (all within ±200%)")
    else:
        print("  ⚠️ Some ROI values exceed ±200% (potential bug)")
    
    if auc_close_to_50 and roi_close_to_0 and no_extreme:
        print("\n🎉 PASS: Label shuffle confirms ROI calculation is correct!")
        print("  Real profitability comes from genuine predictive power, not bugs.")
    else:
        print("\n⚠️ FAIL: Label shuffle reveals potential issues")
    
    print("\n" + "="*80)


if __name__ == '__main__':
    run_label_shuffle_roi_test(n_shuffles=10)
