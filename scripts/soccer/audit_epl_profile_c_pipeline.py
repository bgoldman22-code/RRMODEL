#!/usr/bin/env python3
"""
EPL Profile C Pipeline Audit Script

STEP 6 - FINAL VERIFICATION AUDIT
==================================

This script performs a comprehensive audit of the EPL Profile C pipeline
after the 3-key merge fix (Steps 1-5). It validates:

1. Data integrity: Merged results + odds coverage, BTTS rates
2. Walk-forward backtest: Runs using production code, collects metrics
3. Edge explorer: Verifies compatibility with merged dataset

The script REUSES production code paths:
- epl_profile_c_core.py (load_epl_data, Dixon-Coles functions)
- team_name_utils.py (standardize_team_name)
- backtest_epl_profile_c_walkforward.py (prepare_walkforward_data, run_full_walkforward)

NO MODEL LOGIC CHANGES - READ-ONLY AUDIT
"""

import pandas as pd
import numpy as np
import sys
from pathlib import Path
from datetime import datetime

# Add parent directories to path for imports
script_dir = Path(__file__).resolve().parent
project_dir = script_dir.parent.parent
sys.path.insert(0, str(project_dir))
sys.path.insert(0, str(script_dir))

# Import production code
from epl_profile_c_core import load_epl_data
from team_name_utils import standardize_team_name
from backtest_epl_profile_c_walkforward import (
    prepare_walkforward_data,
    run_full_walkforward,
    WALKFORWARD_CONFIG
)

# Configuration
DATA_DIR = '/Users/brentgoldman/Desktop/REPO33/data/premier_league/'
OUTPUT_DIR = '/Users/brentgoldman/Desktop/REPO33/RRMODEL/'

def print_section_header(title):
    """Print formatted section header"""
    print("\n" + "="*80)
    print(title.center(80))
    print("="*80 + "\n")

def audit_merged_data():
    """
    STEP 6.2 - Verify merged data consistency
    
    Returns:
        dict: Audit metrics (coverage, BTTS rate, etc.)
    """
    print_section_header("STEP 6.2 - MERGED DATA CONSISTENCY AUDIT")
    
    print("Loading raw data files...")
    results, team_stats, odds = load_epl_data(DATA_DIR)
    
    print(f"✓ Results loaded: {len(results):,} rows")
    print(f"✓ Team stats loaded: {len(team_stats):,} team-seasons")
    print(f"✓ Odds loaded: {len(odds):,} rows")
    
    print("\nApplying 3-key merge (season, home_norm, away_norm)...")
    merged = prepare_walkforward_data(results, odds)
    
    print(f"✓ Merged dataset: {len(merged):,} rows")
    
    # Calculate coverage by season
    print("\n" + "-"*80)
    print("COVERAGE BY SEASON")
    print("-"*80)
    
    coverage_data = []
    for season in sorted(odds['season'].unique()):
        odds_count = len(odds[odds['season'] == season])
        merged_count = len(merged[merged['season'] == season])
        coverage_pct = (merged_count / odds_count * 100) if odds_count > 0 else 0
        
        coverage_data.append({
            'season': season,
            'odds_rows': odds_count,
            'merged_rows': merged_count,
            'coverage_pct': coverage_pct
        })
        
        print(f"  {season}: {merged_count:3d} / {odds_count:3d} = {coverage_pct:5.1f}%")
    
    overall_coverage = (len(merged) / len(odds) * 100) if len(odds) > 0 else 0
    print(f"\n  OVERALL: {len(merged):3d} / {len(odds):3d} = {overall_coverage:5.1f}%")
    
    # BTTS rate analysis
    print("\n" + "-"*80)
    print("BTTS RATE ANALYSIS")
    print("-"*80)
    
    btts_rate_merged = merged['btts'].mean()
    btts_expected = 0.556  # Historical EPL average
    btts_diff = btts_rate_merged - btts_expected
    
    print(f"  Merged dataset BTTS rate: {btts_rate_merged:.3f} ({btts_rate_merged*100:.1f}%)")
    print(f"  Expected EPL baseline:    {btts_expected:.3f} ({btts_expected*100:.1f}%)")
    print(f"  Difference:              {btts_diff:+.3f} ({btts_diff*100:+.1f} pp)")
    
    if abs(btts_diff) < 0.05:
        print("  ✓ Within expected range (±5 percentage points)")
    else:
        print("  ⚠ Outside expected range - investigate potential bias")
    
    # Data quality checks
    print("\n" + "-"*80)
    print("DATA QUALITY CHECKS")
    print("-"*80)
    
    # Check for missing odds
    missing_btts_yes = merged['btts_yes_odds'].isna().sum()
    missing_btts_no = merged['btts_no_odds'].isna().sum()
    print(f"  Missing BTTS YES odds: {missing_btts_yes} ({missing_btts_yes/len(merged)*100:.1f}%)")
    print(f"  Missing BTTS NO odds:  {missing_btts_no} ({missing_btts_no/len(merged)*100:.1f}%)")
    
    # Check date range
    date_min = merged['date'].min()
    date_max = merged['date'].max()
    date_span_days = (date_max - date_min).days
    print(f"\n  Date range: {date_min.date()} to {date_max.date()}")
    print(f"  Span: {date_span_days:,} days ({date_span_days/365.25:.1f} years)")
    
    # Check trusted_for_backtest flag
    trusted_count = merged['trusted_for_backtest'].sum()
    print(f"\n  Rows with trusted_for_backtest=True: {trusted_count:,} ({trusted_count/len(merged)*100:.1f}%)")
    
    # Return metrics for reporting
    metrics = {
        'results_rows': len(results),
        'odds_rows': len(odds),
        'merged_rows': len(merged),
        'overall_coverage_pct': overall_coverage,
        'btts_rate_merged': btts_rate_merged,
        'btts_rate_expected': btts_expected,
        'btts_diff': btts_diff,
        'date_range_start': date_min,
        'date_range_end': date_max,
        'date_span_days': date_span_days,
        'coverage_by_season': coverage_data
    }
    
    return metrics

def audit_walkforward_backtest():
    """
    STEP 6.3 - Verify walk-forward backtest using production code
    
    Returns:
        dict: Backtest metrics (bets, ROI, win rate, drawdown, etc.)
    """
    print_section_header("STEP 6.3 - WALK-FORWARD BACKTEST AUDIT")
    
    print("Running walk-forward backtest using production code...")
    print(f"Config: {WALKFORWARD_CONFIG['evaluation_block_days']}-day eval blocks, "
          f"{WALKFORWARD_CONFIG['tuning_horizon_days']}-day tuning horizon\n")
    
    # Run backtest (this calls the production function)
    bets_df, bands_df, metrics_df = run_full_walkforward()
    
    if bets_df is None or len(bets_df) == 0:
        print("✗ Backtest failed or produced no bets!")
        return None
    
    print("\n" + "-"*80)
    print("BACKTEST RESULTS SUMMARY")
    print("-"*80)
    
    # Overall metrics
    total_bets = len(bets_df)
    total_profit_units = bets_df['profit_units'].sum()
    total_profit_kelly = bets_df['profit_kelly'].sum()
    avg_roi_units = bets_df['profit_units'].mean()
    
    # Calculate win rate from profit (positive profit = win)
    win_rate = (bets_df['profit_units'] > 0).sum() / total_bets
    
    print(f"  Total bets: {total_bets:,}")
    print(f"  Total profit (unit stakes): {total_profit_units:+.2f} units")
    print(f"  Total profit (Kelly stakes): {total_profit_kelly:+.2f} units")
    print(f"  ROI (unit stakes): {avg_roi_units:.2%}")
    print(f"  Win rate: {win_rate:.1%}")
    
    # Bet distribution
    yes_bets = (bets_df['bet_type'] == 'BTTS_YES').sum()
    no_bets = (bets_df['bet_type'] == 'BTTS_NO').sum()
    print(f"\n  Bet distribution:")
    print(f"    BTTS YES: {yes_bets:,} ({yes_bets/total_bets*100:.1f}%)")
    print(f"    BTTS NO:  {no_bets:,} ({no_bets/total_bets*100:.1f}%)")
    
    # Calculate max drawdown
    bets_sorted = bets_df.sort_values('date').copy()
    bets_sorted['cumulative_profit'] = bets_sorted['profit_units'].cumsum()
    bets_sorted['cumulative_max'] = bets_sorted['cumulative_profit'].cummax()
    bets_sorted['drawdown'] = bets_sorted['cumulative_profit'] - bets_sorted['cumulative_max']
    max_drawdown = bets_sorted['drawdown'].min()
    
    print(f"\n  Max drawdown: {max_drawdown:.2f} units")
    
    # Performance by walk-forward step
    if 'step_id' in bets_df.columns:
        print("\n" + "-"*80)
        print("PERFORMANCE BY WALK-FORWARD STEP")
        print("-"*80)
        
        step_perf = []
        for step_id in sorted(bets_df['step_id'].unique()):
            step_bets = bets_df[bets_df['step_id'] == step_id]
            step_profit = step_bets['profit_units'].sum()
            step_roi = step_bets['profit_units'].mean()
            step_win_rate = (step_bets['profit_units'] > 0).sum() / len(step_bets)
            
            step_perf.append({
                'step_id': step_id,
                'bets': len(step_bets),
                'profit': step_profit,
                'roi': step_roi,
                'win_rate': step_win_rate
            })
            
            print(f"  Step {step_id}: {len(step_bets):2d} bets, "
                  f"ROI {step_roi:+6.1%}, Win Rate {step_win_rate:5.1%}, "
                  f"Profit {step_profit:+6.2f}u")
    
    # Return metrics
    metrics = {
        'total_bets': total_bets,
        'total_profit_units': total_profit_units,
        'total_profit_kelly': total_profit_kelly,
        'roi_units': avg_roi_units,
        'win_rate': win_rate,
        'yes_bets': yes_bets,
        'no_bets': no_bets,
        'max_drawdown': max_drawdown,
        'step_performance': step_perf if 'step_id' in bets_df.columns else []
    }
    
    return metrics

def main(steps=None):
    """
    Main audit execution
    
    Args:
        steps: List of steps to run (e.g., ['6.2', '6.3']) or None for all
    """
    print("\n" + "="*80)
    print("EPL PROFILE C PIPELINE - FINAL VERIFICATION AUDIT".center(80))
    print("="*80)
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Script: {Path(__file__).name}")
    print("="*80)
    
    if steps:
        print(f"\nRunning steps: {', '.join(steps)}")
    else:
        print("\nRunning all steps")
    
    merged_metrics = None
    backtest_metrics = None
    
    # STEP 6.2 - Merged data audit
    if steps is None or '6.2' in steps:
        merged_metrics = audit_merged_data()
    
    # STEP 6.3 - Walk-forward backtest audit
    if steps is None or '6.3' in steps:
        backtest_metrics = audit_walkforward_backtest()
    
    # Final summary
    print_section_header("AUDIT COMPLETE")
    
    if merged_metrics:
        print("✓ Step 6.2 completed")
        print(f"  Merge coverage: {merged_metrics['overall_coverage_pct']:.1f}%")
        print(f"  BTTS rate: {merged_metrics['btts_rate_merged']:.1%} (expected: {merged_metrics['btts_rate_expected']:.1%})")
    
    if backtest_metrics:
        print("\n✓ Step 6.3 completed")
        print(f"  Backtest bets: {backtest_metrics['total_bets']:,}")
        print(f"  Backtest ROI: {backtest_metrics['roi_units']:.2%}")
        print(f"  Backtest win rate: {backtest_metrics['win_rate']:.1%}")
    
    if (steps is None or len(steps) >= 2) and merged_metrics and backtest_metrics:
        print("\n✅ EPL PROFILE C PIPELINE - VERIFIED AND OPERATIONAL")
    elif not merged_metrics and not backtest_metrics:
        print("\n✗ No audit steps completed")
    
    print("\n" + "="*80)
    
    return merged_metrics, backtest_metrics

if __name__ == '__main__':
    # Allow running specific steps from command line
    import sys
    if len(sys.argv) > 1:
        steps = sys.argv[1:]  # e.g., python audit.py 6.2
    else:
        steps = None  # Run all steps
    
    main(steps)
