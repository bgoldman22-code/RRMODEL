#!/usr/bin/env python3
"""
RUN_WALKFORWARD.py

Master script to run complete walk-forward backtest for all three phases:
- Phase 1: Baseline models (Logistic, Poisson, Random Forest)
- Phase 2: Modern ML (LightGBM, XGBoost, CatBoost)
- Phase 3: Hybrids (DC residual, DC blend, DC stacked)

Usage:
    cd research/btts_option_c/
    python3 RUN_WALKFORWARD.py
    
Outputs:
    results/walkforward_metrics.csv  - Model performance metrics per fold
    results/walkforward_roi.csv      - Betting ROI per threshold per fold
"""

import sys
from pathlib import Path
from datetime import datetime

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from src.load_data import load_unified_data
from src.build_features import add_rolling_form_features, add_match_level_features, add_form_trend_features
from src.walkforward import (
    run_all_walkforward_experiments,
    WalkforwardWindowConfig
)

WALKFORWARD_WINDOW_CONFIG = WalkforwardWindowConfig(
    test_window_days=60,
    step_days=45,
    min_train_days=170,
    min_train_matches=220,
    min_test_matches=60,
    min_test_unique_dates=15
)


def build_all_features(df):
    """
    Apply all feature engineering steps
    
    Args:
        df: Base unified dataset
    
    Returns:
        DataFrame with all engineered features
    """
    print("\n📊 Engineering features...")
    df = add_rolling_form_features(df, windows=[5, 10])
    df = add_match_level_features(df)
    df = add_form_trend_features(df)
    print(f"✅ Total features: {len(df.columns)}")
    return df


def main():
    """
    Main execution pipeline
    """
    print("\n" + "="*80)
    print("  BTTS WALK-FORWARD BACKTEST - PHASES 1, 2, 3")
    print("="*80)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # ========== STEP 1: LOAD DATA ==========
    print("\n" + "="*80)
    print("STEP 1: LOADING DATA")
    print("="*80)
    df = load_unified_data()
    print(f"✅ Loaded {len(df)} matches")
    
    # AUDIT LOGGING: Document odds/label semantics
    print("\n" + "="*80)
    print("BTTS ODDS & LABEL AUDIT SUMMARY".center(80))
    print("="*80)
    from src.load_data import get_btts_odds_coverage_summary
    print(get_btts_odds_coverage_summary())
    print("="*80)
    
    # ========== STEP 2: ENGINEER FEATURES ==========
    print("\n" + "="*80)
    print("STEP 2: FEATURE ENGINEERING")
    print("="*80)
    df = build_all_features(df)
    
    # Drop rows with NaN in critical columns
    print("\n🧹 Cleaning data...")
    before = len(df)
    df = df.dropna(subset=['btts', 'home_xg', 'away_xg'])
    after = len(df)
    if before > after:
        print(f"   Dropped {before - after} rows with missing BTTS/xG data")
    print(f"✅ Final dataset: {len(df)} matches")
    
    # ========== STEP 3: RUN WALK-FORWARD BACKTEST ==========
    print("\n" + "="*80)
    print("STEP 3: WALK-FORWARD BACKTEST")
    print("="*80)
    print(
        "Window config => test_window: "
        f"{WALKFORWARD_WINDOW_CONFIG.test_window_days}d, step: {WALKFORWARD_WINDOW_CONFIG.step_days}d, "
        f"min_train_days: {WALKFORWARD_WINDOW_CONFIG.min_train_days}d, "
        f"min_train_matches: {WALKFORWARD_WINDOW_CONFIG.min_train_matches}, "
        f"min_test_matches: {WALKFORWARD_WINDOW_CONFIG.min_test_matches}"
    )
    
    metrics_df, roi_df = run_all_walkforward_experiments(
        df,
        n_splits=6,
        thresholds=[0.50, 0.55, 0.60, 0.65],
        window_config=WALKFORWARD_WINDOW_CONFIG
    )
    
    # ========== STEP 4: SAVE RESULTS ==========
    print("\n" + "="*80)
    print("STEP 4: SAVING RESULTS")
    print("="*80)
    
    results_dir = Path(__file__).parent / 'results'
    results_dir.mkdir(exist_ok=True)
    
    metrics_file = results_dir / 'walkforward_metrics.csv'
    roi_file = results_dir / 'walkforward_roi.csv'
    
    metrics_df.to_csv(metrics_file, index=False)
    roi_df.to_csv(roi_file, index=False)
    
    print(f"✅ Saved metrics to: {metrics_file}")
    print(f"✅ Saved ROI to: {roi_file}")
    
    # ========== STEP 5: SUMMARY ==========
    print("\n" + "="*80)
    print("WALK-FORWARD BACKTEST COMPLETE")
    print("="*80)
    print(f"Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    print("\n📊 TOP 5 MODELS (by Overall AUC):")
    overall_metrics = metrics_df[metrics_df['fold'] == 'ALL'].copy()
    overall_metrics = overall_metrics.sort_values('auc', ascending=False)
    
    for idx, row in overall_metrics.head(5).iterrows():
        print(f"   {idx+1}. {row['phase']} - {row['model']}")
        print(f"      AUC: {row['auc']:.4f}, Brier: {row['brier']:.4f}, LogLoss: {row['logloss']:.4f}")
    
    print("\n💰 TOP 5 MODELS (by Overall ROI at 55% threshold):")
    roi_55 = roi_df[roi_df['threshold'] == 0.55].copy()
    roi_summary = roi_55.groupby(['phase', 'model']).agg({
        'roi': 'mean',
        'n_bets': 'sum',
        'profit': 'sum'
    }).reset_index()
    roi_summary = roi_summary.sort_values('roi', ascending=False)
    
    for idx, row in roi_summary.head(5).iterrows():
        print(f"   {idx+1}. {row['phase']} - {row['model']}")
        print(f"      ROI: {row['roi']:.2f}%, Bets: {int(row['n_bets'])}, Profit: ${row['profit']:.2f}")
    
    print("\n" + "="*80)
    print("📁 Results saved to:")
    print(f"   {metrics_file}")
    print(f"   {roi_file}")
    print("="*80)
    
    # Sanity check summary
    print("\n" + "="*80)
    print("🔍 SANITY CHECK")
    print("="*80)
    fold_metrics = metrics_df[metrics_df['fold'] != 'ALL']
    unique_folds = sorted(fold_metrics['fold'].unique())
    print(f"✅ Folds evaluated: {unique_folds}")
    print(f"✅ Metrics rows: {len(metrics_df)}")
    print(f"✅ ROI rows: {len(roi_df)}")
    print(f"✅ AUC range: {fold_metrics['auc'].min():.4f} to {fold_metrics['auc'].max():.4f}")
    print(f"✅ Brier range: {fold_metrics['brier'].min():.4f} to {fold_metrics['brier'].max():.4f}")
    
    # Check for suspicious perfect scores
    perfect_auc = fold_metrics[fold_metrics['auc'] >= 0.995]
    if len(perfect_auc) > 0:
        print(f"\n⚠️  WARNING: {len(perfect_auc)} folds with AUC >= 0.995 (suspicious)")
        print("   This may indicate data leakage or memorization")
    
    zero_brier = fold_metrics[fold_metrics['brier'] <= 0.01]
    if len(zero_brier) > 0:
        print(f"⚠️  WARNING: {len(zero_brier)} folds with Brier <= 0.01 (suspicious)")
        print("   This may indicate data leakage or memorization")
    
    print("="*80)


if __name__ == '__main__':
    main()
