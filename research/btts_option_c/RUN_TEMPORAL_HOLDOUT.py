#!/usr/bin/env python3
"""
RUN_TEMPORAL_HOLDOUT.py

Simple temporal train/test split experiment for BTTS prediction.

Strategy:
- Compute the 40th percentile match date (chronological quantile)
- Train on every match on/before that cutoff date (≈1 season)
- Test on every match after the cutoff date (everything future)
- No k-fold cross-validation (simpler than walk-forward)
- Evaluate Phase 1 + Phase 2 models (6 total)
- Compute metrics (AUC, Brier, LogLoss) and betting ROI on test set

This answers: "If we trained once on ~1 season and froze the model,
how well would it have done on the future matches?"

Usage:
    cd /Users/brentgoldman/Desktop/REPO33/RRMODEL/research/btts_option_c
    python3 RUN_TEMPORAL_HOLDOUT.py
    
Outputs:
    results/temporal_holdout_metrics.csv  - Model performance on test set
    results/temporal_holdout_roi.csv      - Betting ROI on test set
"""

import sys
from pathlib import Path
from datetime import datetime

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from src.load_data import load_unified_data
from src.build_features import add_rolling_form_features, add_match_level_features, add_form_trend_features
from src.temporal_holdout import (
    run_temporal_holdout_experiment,
    print_sanity_check,
    print_leaderboards,
    TRAIN_FRACTION
)


def load_final_btts_dataset():
    """
    Load and prepare complete BTTS dataset with all features
    
    Returns:
        pd.DataFrame with:
        - date (datetime)
        - btts (label)
        - btts_yes_odds, btts_no_odds (odds)
        - all engineered features
    """
    print("\n" + "="*80)
    print("LOADING & PREPARING DATA")
    print("="*80)
    
    # Load unified data
    print("📥 Loading unified match data...")
    df = load_unified_data()
    print(f"✅ Loaded {len(df)} matches")
    
    # AUDIT LOGGING: Document odds/label semantics
    print("\n" + "="*80)
    print("BTTS ODDS & LABEL AUDIT SUMMARY".center(80))
    print("="*80)
    from src.load_data import get_btts_odds_coverage_summary
    print(get_btts_odds_coverage_summary())
    print("="*80)
    
    # Log date range
    if 'date' in df.columns:
        print(f"   Date range: {df['date'].min().date()} to {df['date'].max().date()}")
    
    # Engineer features
    print("\n📊 Engineering features...")
    df = add_rolling_form_features(df, windows=[5, 10])
    df = add_match_level_features(df)
    df = add_form_trend_features(df)
    print(f"✅ Total features: {len(df.columns)}")
    
    # Clean data
    print("\n🧹 Cleaning data...")
    before = len(df)
    df = df.dropna(subset=['btts', 'home_xg', 'away_xg'])
    after = len(df)
    if before > after:
        print(f"   Dropped {before - after} rows with missing BTTS/xG data")
    
    print(f"✅ Final dataset: {len(df)} matches")
    
    # Assertions
    assert 'date' in df.columns, "Missing 'date' column"
    assert df['date'].dtype == 'datetime64[ns]' or df['date'].dtype.name.startswith('datetime'), \
        f"'date' column must be datetime, got {df['date'].dtype}"
    assert 'btts' in df.columns, "Missing 'btts' label column"
    assert 'btts_yes_odds' in df.columns or 'btts_yes_odds' in df.columns, \
        "Missing BTTS odds columns"
    
    print("="*80)
    
    return df


def main():
    """
    Main execution pipeline
    """
    print("\n" + "="*80)
    print("  BTTS TEMPORAL HOLDOUT EXPERIMENT")
    print("="*80)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Train fraction: {TRAIN_FRACTION:.1%}")
    print("="*80)
    
    # ========== STEP 1: LOAD DATA ==========
    df = load_final_btts_dataset()
    
    # ========== STEP 2: RUN EXPERIMENT ==========
    metrics_df, roi_df = run_temporal_holdout_experiment(df, train_fraction=TRAIN_FRACTION)
    
    # ========== STEP 3: SAVE RESULTS ==========
    print("\n" + "="*80)
    print("SAVING RESULTS")
    print("="*80)
    
    results_dir = Path(__file__).parent / 'results'
    results_dir.mkdir(exist_ok=True)
    
    metrics_file = results_dir / 'temporal_holdout_metrics.csv'
    roi_file = results_dir / 'temporal_holdout_roi.csv'
    
    metrics_df.to_csv(metrics_file, index=False)
    roi_df.to_csv(roi_file, index=False)
    
    print(f"✅ Saved metrics to: {metrics_file}")
    print(f"✅ Saved ROI to: {roi_file}")
    print("="*80)
    
    # ========== STEP 4: LEADERBOARDS ==========
    print_leaderboards(metrics_df, roi_df)
    
    # ========== STEP 5: SANITY CHECK ==========
    print_sanity_check(metrics_df, roi_df)
    
    # ========== FINAL SUMMARY ==========
    print("\n" + "="*80)
    print("EXPERIMENT COMPLETE")
    print("="*80)
    print(f"Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"\n📁 Results saved to:")
    print(f"   {metrics_file}")
    print(f"   {roi_file}")
    print("\n🎯 Next steps:")
    print("   1. Review sanity check warnings (if any)")
    print("   2. Compare best model ROI vs Profile C baseline (+19.64%)")
    print("   3. If results look clean, consider production deployment")
    print("="*80)


if __name__ == '__main__':
    main()
