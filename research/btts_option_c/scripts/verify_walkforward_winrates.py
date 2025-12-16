#!/usr/bin/env python3
"""
verify_walkforward_winrates.py

Standalone W/L (wins/losses) audit for BTTS walk-forward two-sided betting results.

This script:
- Reconstructs win/loss counts and win rates from raw predictions + labels + odds
- Compares them to results/walkforward_two_sided_roi.csv
- Focuses on Poisson model (best performer)
- Validates that bet selection and W/L counting is mathematically correct

Usage:
    cd research/btts_option_c/
    python3 scripts/verify_walkforward_winrates.py
"""

import sys
from pathlib import Path
import pandas as pd
import numpy as np
from typing import List, Tuple, Dict

# Add src to path
RESEARCH_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(RESEARCH_DIR))

from src.load_data import load_unified_data
from src.build_features import add_rolling_form_features, add_match_level_features, add_form_trend_features
from src.walkforward import create_walkforward_splits, WalkforwardWindowConfig
from src.model_baselines import fit_poisson, predict_poisson


def build_features(df):
    """Apply the same feature engineering as RUN_WALKFORWARD.py"""
    print("📊 Engineering features...")
    df = add_rolling_form_features(df, windows=[5, 10])
    df = add_match_level_features(df)
    df = add_form_trend_features(df)
    df = df.dropna(subset=['btts', 'home_xg', 'away_xg'])
    print(f"✅ Features ready: {len(df)} matches")
    return df


def compute_side_stats(y_true, y_proba, yes_odds, no_odds, threshold, side):
    """
    Compute n_bets, n_wins, win_rate for a single side and threshold.
    
    This is the AUDIT version - intentionally simple to match the core logic.
    No edge gating, no extra filters - just threshold + odds availability.
    
    Args:
        y_true: Array of BTTS labels (0/1)
        y_proba: Array of P(BTTS Yes) from model
        yes_odds: Array of BTTS YES odds
        no_odds: Array of BTTS NO odds
        threshold: Probability threshold for placing bet
        side: 'YES' or 'NO'
    
    Returns:
        dict with n_bets, n_wins, win_rate
    """
    p_yes = np.asarray(y_proba, dtype=float)
    p_no = 1.0 - p_yes
    
    yes_odds = np.asarray(yes_odds, dtype=float)
    no_odds = np.asarray(no_odds, dtype=float)
    
    has_yes = ~np.isnan(yes_odds)
    has_no = ~np.isnan(no_odds)
    
    if side == "YES":
        prob = p_yes
        odds = yes_odds
        has_market = has_yes
        wins = (y_true == 1)  # YES bet wins when BTTS occurred
    elif side == "NO":
        prob = p_no
        odds = no_odds
        has_market = has_no
        wins = (y_true == 0)  # NO bet wins when BTTS did NOT occur
    else:
        raise ValueError(f"Unknown side: {side}")
    
    # Simple bet mask: prob >= threshold AND odds available
    mask = (prob >= threshold) & has_market
    
    n_bets = int(mask.sum())
    if n_bets == 0:
        return {
            "n_bets": 0,
            "n_wins": 0,
            "win_rate": np.nan,
        }
    
    n_wins = int((wins & mask).sum())
    win_rate = n_wins / n_bets
    
    return {
        "n_bets": n_bets,
        "n_wins": n_wins,
        "win_rate": win_rate,
    }


def audit_poisson_walkforward():
    """
    Re-run walk-forward for Poisson model in audit mode.
    
    Reconstructs W/L stats from scratch and compares to CSV.
    """
    print("\n" + "="*80)
    print("BTTS WALK-FORWARD W/L AUDIT - POISSON MODEL".center(80))
    print("="*80)
    
    # ========== STEP 1: LOAD & PREPARE DATA ==========
    print("\n" + "="*80)
    print("STEP 1: LOADING DATA")
    print("="*80)
    
    df = load_unified_data()
    print(f"✅ Loaded {len(df)} matches")
    
    df = build_features(df)
    
    # ========== STEP 2: CREATE FOLDS ==========
    print("\n" + "="*80)
    print("STEP 2: CREATING WALK-FORWARD FOLDS")
    print("="*80)
    
    # Use same config as RUN_WALKFORWARD.py
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
    
    # ========== STEP 3: AUDIT THRESHOLDS ==========
    print("\n" + "="*80)
    print("STEP 3: AUDIT CONFIGURATION")
    print("="*80)
    
    audit_thresholds_yes = [0.50, 0.55, 0.60, 0.65]
    audit_thresholds_no = [0.50, 0.55, 0.60, 0.65]
    
    print(f"Models to audit: ['poisson']")
    print(f"YES thresholds: {audit_thresholds_yes}")
    print(f"NO thresholds: {audit_thresholds_no}")
    print(f"Total combinations per fold: {len(audit_thresholds_yes) + len(audit_thresholds_no)}")
    
    # ========== STEP 4: RUN AUDIT FOR EACH FOLD ==========
    print("\n" + "="*80)
    print("STEP 4: RECONSTRUCTING W/L STATS PER FOLD")
    print("="*80)
    
    audit_rows = []
    
    for train_df, test_df, fold_meta in splits:
        fold_idx = fold_meta['fold']
        print(f"\n🔷 Fold {fold_idx}:")
        print(f"   Train: {fold_meta['train_start']} to {fold_meta['train_end']} ({fold_meta['train_matches']} matches)")
        print(f"   Test:  {fold_meta['test_start']} to {fold_meta['test_end']} ({fold_meta['test_matches']} matches)")
        
        # Get test data
        y_true_test = test_df['btts'].values
        yes_odds_test = test_df['btts_yes_odds'].values if 'btts_yes_odds' in test_df.columns else np.full(len(test_df), np.nan)
        no_odds_test = test_df['btts_no_odds'].values if 'btts_no_odds' in test_df.columns else np.full(len(test_df), np.nan)
        
        # Train Poisson model (same as production)
        try:
            print(f"   Training Poisson...")
            model = fit_poisson(train_df)
            
            # Get predictions (Poisson uses xG columns directly)
            y_proba_test = predict_poisson(model, test_df)
            
            print(f"   ✅ Predictions generated: {len(y_proba_test)} samples")
            print(f"      p_yes range: [{y_proba_test.min():.3f}, {y_proba_test.max():.3f}]")
            
            # Audit YES side
            for threshold in audit_thresholds_yes:
                stats = compute_side_stats(
                    y_true_test,
                    y_proba_test,
                    yes_odds_test,
                    no_odds_test,
                    threshold=threshold,
                    side="YES",
                )
                
                audit_rows.append({
                    "model": "poisson",
                    "fold": fold_idx,
                    "side": "YES",
                    "threshold": threshold,
                    **stats,
                    **fold_meta,  # Include fold metadata for reference
                })
                
                if stats['n_bets'] > 0:
                    print(f"      YES @ {threshold:.2f}: {stats['n_bets']:3d} bets, "
                          f"{stats['n_wins']:3d} wins, {stats['win_rate']:.1%} win rate")
            
            # Audit NO side
            for threshold in audit_thresholds_no:
                stats = compute_side_stats(
                    y_true_test,
                    y_proba_test,
                    yes_odds_test,
                    no_odds_test,
                    threshold=threshold,
                    side="NO",
                )
                
                audit_rows.append({
                    "model": "poisson",
                    "fold": fold_idx,
                    "side": "NO",
                    "threshold": threshold,
                    **stats,
                    **fold_meta,
                })
                
                if stats['n_bets'] > 0:
                    print(f"      NO  @ {threshold:.2f}: {stats['n_bets']:3d} bets, "
                          f"{stats['n_wins']:3d} wins, {stats['win_rate']:.1%} win rate")
        
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            continue
    
    # ========== STEP 5: SAVE AUDIT RESULTS ==========
    print("\n" + "="*80)
    print("STEP 5: SAVING AUDIT RESULTS")
    print("="*80)
    
    audit_df = pd.DataFrame(audit_rows)
    
    results_dir = RESEARCH_DIR / 'results'
    results_dir.mkdir(exist_ok=True)
    
    # Save per-fold details
    raw_file = results_dir / 'walkforward_poisson_winrate_audit_raw.csv'
    audit_df.to_csv(raw_file, index=False)
    print(f"✅ Saved per-fold audit: {raw_file}")
    print(f"   Rows: {len(audit_df)}")
    
    # Aggregate across folds
    audit_agg = (
        audit_df
        .groupby(["model", "side", "threshold"], as_index=False)
        .agg({
            "n_bets": "sum",
            "n_wins": "sum",
        })
    )
    audit_agg["win_rate"] = audit_agg["n_wins"] / audit_agg["n_bets"].replace(0, np.nan)
    
    agg_file = results_dir / 'walkforward_poisson_winrate_audit_agg.csv'
    audit_agg.to_csv(agg_file, index=False)
    print(f"✅ Saved aggregated audit: {agg_file}")
    print(f"   Rows: {len(audit_agg)}")
    
    # ========== STEP 6: COMPARE TO ORIGINAL CSV ==========
    print("\n" + "="*80)
    print("STEP 6: COMPARISON TO ORIGINAL CSV")
    print("="*80)
    
    orig_file = results_dir / 'walkforward_two_sided_roi.csv'
    
    if not orig_file.exists():
        print(f"⚠️  Original file not found: {orig_file}")
        print("   Cannot perform comparison")
        return
    
    orig = pd.read_csv(orig_file)
    print(f"✅ Loaded original: {len(orig)} rows")
    
    # Filter to Poisson only
    orig_poisson = orig[
        (orig["model"] == "poisson") &
        (orig["side"].isin(["YES", "NO"])) &
        (orig["threshold"].isin(audit_thresholds_yes + audit_thresholds_no))
    ].copy()
    
    print(f"   Filtered to Poisson: {len(orig_poisson)} rows")
    
    # Aggregate original in same way
    orig_agg = (
        orig_poisson
        .groupby(["model", "side", "threshold"], as_index=False)
        .agg({
            "n_bets": "sum",
            "n_wins": "sum",
        })
    )
    orig_agg["win_rate"] = orig_agg["n_wins"] / orig_agg["n_bets"].replace(0, np.nan)
    
    # Merge audit vs original
    merged = audit_agg.merge(
        orig_agg,
        on=["model", "side", "threshold"],
        how="outer",
        suffixes=("_audit", "_orig"),
    )
    
    # Calculate differences
    merged["n_bets_diff"] = merged["n_bets_audit"].fillna(-9999) - merged["n_bets_orig"].fillna(-9999)
    merged["n_wins_diff"] = merged["n_wins_audit"].fillna(-9999) - merged["n_wins_orig"].fillna(-9999)
    merged["win_rate_diff"] = merged["win_rate_audit"] - merged["win_rate_orig"]
    
    # ========== STEP 7: PRINT COMPARISON REPORT ==========
    print("\n" + "="*80)
    print("AUDIT vs ORIGINAL COMPARISON (Poisson, Aggregated Across Folds)".center(80))
    print("="*80)
    print()
    
    print("Legend:")
    print("  _audit = Reconstructed from scratch in this audit script")
    print("  _orig  = From existing walkforward_two_sided_roi.csv")
    print("  _diff  = audit - orig (should be 0 if match)")
    print()
    
    # Format for display
    display_cols = [
        'side', 'threshold',
        'n_bets_audit', 'n_bets_orig', 'n_bets_diff',
        'n_wins_audit', 'n_wins_orig', 'n_wins_diff',
        'win_rate_audit', 'win_rate_orig', 'win_rate_diff'
    ]
    
    print(merged[display_cols].to_string(index=False))
    print()
    
    # ========== STEP 8: DISCREPANCY ANALYSIS ==========
    print("\n" + "="*80)
    print("DISCREPANCY ANALYSIS")
    print("="*80)
    
    # Check for mismatches
    n_bets_mismatch = merged[merged['n_bets_diff'].abs() > 0]
    n_wins_mismatch = merged[merged['n_wins_diff'].abs() > 0]
    win_rate_mismatch = merged[merged['win_rate_diff'].abs() > 0.001]  # Allow 0.1% tolerance
    
    if len(n_bets_mismatch) == 0 and len(n_wins_mismatch) == 0 and len(win_rate_mismatch) == 0:
        print("✅ PERFECT MATCH!")
        print("   All n_bets, n_wins, and win_rates match between audit and original.")
        print("   W/L counting logic is mathematically correct.")
    else:
        print("⚠️  DISCREPANCIES FOUND:")
        print()
        
        if len(n_bets_mismatch) > 0:
            print(f"❌ n_bets mismatches: {len(n_bets_mismatch)} combinations")
            print(n_bets_mismatch[['side', 'threshold', 'n_bets_audit', 'n_bets_orig', 'n_bets_diff']].to_string(index=False))
            print()
        
        if len(n_wins_mismatch) > 0:
            print(f"❌ n_wins mismatches: {len(n_wins_mismatch)} combinations")
            print(n_wins_mismatch[['side', 'threshold', 'n_wins_audit', 'n_wins_orig', 'n_wins_diff']].to_string(index=False))
            print()
        
        if len(win_rate_mismatch) > 0:
            print(f"❌ win_rate mismatches: {len(win_rate_mismatch)} combinations")
            print(win_rate_mismatch[['side', 'threshold', 'win_rate_audit', 'win_rate_orig', 'win_rate_diff']].to_string(index=False))
            print()
        
        print("Possible causes:")
        print("  1. Bet selection logic difference (threshold interpretation)")
        print("  2. Label mapping issue (YES/NO assignment)")
        print("  3. Odds filtering difference (NaN handling)")
        print("  4. Prediction/label alignment mismatch")
        print("  5. Fold aggregation error")
        print()
        print("Next steps:")
        print("  - Drill down per-fold to find which fold(s) have mismatches")
        print("  - Compare bet masks row-by-row for mismatching combinations")
        print("  - Add logging to production code to dump intermediate bet masks")
    
    print("\n" + "="*80)
    print("AUDIT COMPLETE")
    print("="*80)


if __name__ == '__main__':
    audit_poisson_walkforward()
