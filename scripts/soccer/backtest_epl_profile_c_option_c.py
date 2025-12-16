#!/usr/bin/env python3
"""
EPL Profile C - Option C Walk-Forward Backtest (EXPERIMENTAL)

This script implements the same walk-forward methodology as the production
backtest, but uses the Option C pipeline (richer features, better models).

STEP 1 GOAL:
============
Clone the production backtest exactly to establish baseline. Should produce
identical results (±rounding noise) to verify Option C pipeline correctness.

SUBSEQUENT STEPS:
=================
- Step 2: Add feature engineering
- Step 3: Replace/augment DC model with advanced classifier
- Step 4+: Integrate external data sources

DESIGN:
=======
- Same walk-forward schedule as production (90-day eval blocks)
- Same band selection logic initially
- Compare Option C vs baseline at each step

USAGE:
======
python scripts/soccer/backtest_epl_profile_c_option_c.py

OUTPUT:
=======
- data/premier_league/profile_c_option_c_walkforward_bets.csv
- Comparison metrics vs production baseline
"""

import pandas as pd
import numpy as np
import sys
from pathlib import Path
from datetime import datetime, timedelta

# Import from production (reuse walk-forward logic)
parent_dir = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(parent_dir))

from epl_profile_c_core import (
    calculate_team_ratings,
    calibrate_dixon_coles,
    calculate_btts_probability,
    shin_implied_prob,
    find_profitable_bands
)

from scripts.soccer.epl_profile_c_option_c_core import (
    load_epl_data_option_c,
    prepare_walkforward_data_option_c
)


# ============================================================================
# WALK-FORWARD CONFIGURATION
# ============================================================================

EVALUATION_BLOCK_DAYS = 90      # Evaluate on 90-day windows
TUNING_HORIZON_DAYS = 365       # Use last year for band tuning
MIN_TRAINING_MATCHES = 300      # Skip early periods
RETRAIN_EVERY_BLOCKS = 1        # Retrain model every step


# ============================================================================
# STEP 1: BASELINE BACKTEST (Clone Production)
# ============================================================================

def run_full_walkforward_option_c(
    combined_df,
    evaluation_block_days=EVALUATION_BLOCK_DAYS,
    tuning_horizon_days=TUNING_HORIZON_DAYS,
    min_training_matches=MIN_TRAINING_MATCHES,
    use_advanced_model=False  # Step 1: False (use DC), Step 3+: True
):
    """
    Run walk-forward backtest using Option C pipeline
    
    STEP 1: Uses same DC model as production (baseline verification)
    STEP 3+: Can switch to advanced classifier (use_advanced_model=True)
    
    Args:
        combined_df: Prepared dataset from prepare_walkforward_data_option_c()
        evaluation_block_days: Size of evaluation windows (default 90)
        tuning_horizon_days: Size of tuning window (default 365)
        min_training_matches: Min training matches to start (default 300)
        use_advanced_model: If True, use Option C classifier (Step 3+)
        
    Returns:
        all_bets_df: All bets across all walk-forward steps
        summary_df: Summary metrics per step
    """
    print("\n" + "="*80)
    print("EPL PROFILE C - OPTION C WALK-FORWARD BACKTEST")
    print("="*80)
    
    if use_advanced_model:
        print("\nMode: EXPERIMENTAL (Option C advanced model)")
    else:
        print("\nMode: BASELINE (Dixon-Coles only, should match production)")
    
    # Find evaluation windows
    min_date = combined_df['date'].min()
    max_date = combined_df['date'].max()
    
    # Start from first date with sufficient training data
    training_matches = 0
    evaluation_start = min_date
    
    for idx, row in combined_df.iterrows():
        training_matches += 1
        if training_matches >= min_training_matches:
            evaluation_start = row['date']
            break
    
    print(f"\nData coverage: {min_date.date()} to {max_date.date()}")
    print(f"First evaluation start: {evaluation_start.date()} (after {training_matches} training matches)")
    
    # Generate walk-forward schedule
    schedule = []
    current_eval_start = evaluation_start
    step_num = 1
    
    while current_eval_start <= max_date - timedelta(days=30):  # Need at least 30 days
        eval_end = current_eval_start + timedelta(days=evaluation_block_days)
        
        # Count matches in evaluation window
        eval_mask = (
            (combined_df['date'] >= current_eval_start) &
            (combined_df['date'] < eval_end)
        )
        eval_count = eval_mask.sum()
        
        if eval_count > 0:
            schedule.append({
                'step': step_num,
                'eval_start': current_eval_start,
                'eval_end': eval_end,
                'eval_count': eval_count
            })
            step_num += 1
        
        # Advance to next block
        current_eval_start = eval_end
    
    schedule_df = pd.DataFrame(schedule)
    print(f"\n✓ Walk-forward schedule: {len(schedule_df)} steps")
    print(f"  First: {schedule_df.iloc[0]['eval_start'].date()} to {schedule_df.iloc[0]['eval_end'].date()}")
    print(f"  Last: {schedule_df.iloc[-1]['eval_start'].date()} to {schedule_df.iloc[-1]['eval_end'].date()}")
    
    # Run each walk-forward step
    all_bets = []
    summary_rows = []
    
    for idx, step_info in schedule_df.iterrows():
        step_bets, step_summary = run_single_walkforward_step(
            combined_df=combined_df,
            step_num=step_info['step'],
            eval_start=step_info['eval_start'],
            eval_end=step_info['eval_end'],
            tuning_horizon_days=tuning_horizon_days,
            use_advanced_model=use_advanced_model
        )
        
        if len(step_bets) > 0:
            all_bets.append(step_bets)
        summary_rows.append(step_summary)
    
    # Combine results
    if len(all_bets) > 0:
        all_bets_df = pd.concat(all_bets, ignore_index=True)
    else:
        all_bets_df = pd.DataFrame()
    
    summary_df = pd.DataFrame(summary_rows)
    
    # Print overall summary
    print("\n" + "="*80)
    print("OVERALL RESULTS (OPTION C)")
    print("="*80)
    
    if len(all_bets_df) > 0:
        total_bets = len(all_bets_df)
        wins = (all_bets_df['profit_units'] > 0).sum()
        total_profit = all_bets_df['profit_units'].sum()
        total_stake = len(all_bets_df)  # Unit stakes
        roi = total_profit / total_stake
        
        print(f"\nTotal bets: {total_bets}")
        print(f"Win rate: {100 * wins / total_bets:.1f}%")
        print(f"Total profit: {total_profit:+.2f} units")
        print(f"ROI: {100 * roi:+.2f}%")
        
        # Distribution
        yes_bets = (all_bets_df['bet_type'] == 'BTTS_YES').sum()
        no_bets = (all_bets_df['bet_type'] == 'BTTS_NO').sum()
        print(f"\nBet distribution:")
        print(f"  BTTS YES: {yes_bets} ({100*yes_bets/total_bets:.1f}%)")
        print(f"  BTTS NO: {no_bets} ({100*no_bets/total_bets:.1f}%)")
    else:
        print("\nNo bets placed")
    
    return all_bets_df, summary_df


def run_single_walkforward_step(
    combined_df,
    step_num,
    eval_start,
    eval_end,
    tuning_horizon_days,
    use_advanced_model=False
):
    """
    Run single walk-forward step
    
    STEP 1: Uses DC model (baseline)
    STEP 3+: Can use advanced classifier
    """
    print(f"\n{'='*80}")
    print(f"STEP {step_num}: {eval_start.date()} to {eval_end.date()}")
    print(f"{'='*80}")
    
    # Partition data (zero leakage)
    train_mask = combined_df['date'] < eval_start
    train_df = combined_df[train_mask].copy()
    
    tuning_start = eval_start - timedelta(days=tuning_horizon_days)
    tuning_mask = (combined_df['date'] >= tuning_start) & (combined_df['date'] < eval_start)
    tuning_df = combined_df[tuning_mask].copy()
    
    eval_mask = (combined_df['date'] >= eval_start) & (combined_df['date'] < eval_end)
    eval_df = combined_df[eval_mask].copy()
    
    print(f"  Training matches: {len(train_df):,}")
    print(f"  Tuning matches: {len(tuning_df):,}")
    print(f"  Evaluation matches: {len(eval_df):,}")
    
    if len(train_df) == 0 or len(eval_df) == 0:
        print("  ⚠️ Insufficient data, skipping")
        return pd.DataFrame(), {
            'step': step_num,
            'bets': 0,
            'roi': 0,
            'profit': 0
        }
    
    # STEP 1: Use DC model (baseline)
    if not use_advanced_model:
        # Calculate team ratings from training data
        team_ratings = calculate_team_ratings(train_df)
        
        # Calibrate Dixon-Coles
        dc_params = calibrate_dixon_coles(train_df, team_ratings)
        home_adv = dc_params['home_advantage']
        tau_00 = dc_params['tau_00']
        
        print(f"  Dixon-Coles: home_adv={home_adv:.3f}, tau_00={tau_00:.3f}")
        
        # Generate predictions for tuning set
        tuning_df['model_btts_prob'] = tuning_df.apply(
            lambda row: calculate_btts_probability(
                home_team=row['home_norm'],
                away_team=row['away_norm'],
                team_ratings=team_ratings,
                home_advantage=home_adv,
                tau_00=tau_00
            ),
            axis=1
        )
        
        # Generate predictions for evaluation set
        eval_df['model_btts_prob'] = eval_df.apply(
            lambda row: calculate_btts_probability(
                home_team=row['home_norm'],
                away_team=row['away_norm'],
                team_ratings=team_ratings,
                home_advantage=home_adv,
                tau_00=tau_00
            ),
            axis=1
        )
    else:
        # TODO (Step 3): Use advanced classifier
        raise NotImplementedError("Advanced model not yet implemented")
    
    # Calculate market probabilities
    for df in [tuning_df, eval_df]:
        df['market_btts_yes_prob'] = df.apply(
            lambda row: shin_implied_prob([row['btts_yes_odds'], row['btts_no_odds']])[0],
            axis=1
        )
        df['market_btts_no_prob'] = df.apply(
            lambda row: shin_implied_prob([row['btts_yes_odds'], row['btts_no_odds']])[1],
            axis=1
        )
    
    # Find profitable bands on tuning set
    bands = find_profitable_bands(
        tuning_df=tuning_df,
        min_roi=0.0,
        min_edge=0.05,
        max_kelly=0.35,
        min_matches=10
    )
    
    print(f"  Bands discovered: {len(bands)}")
    
    if len(bands) == 0:
        print("  ⚠️ No profitable bands found")
        return pd.DataFrame(), {
            'step': step_num,
            'bets': 0,
            'roi': 0,
            'profit': 0
        }
    
    # Apply bands to evaluation set
    bets = []
    for _, band in bands.iterrows():
        band_mask = (
            (eval_df['model_btts_prob'] >= band['prob_min']) &
            (eval_df['model_btts_prob'] < band['prob_max'])
        )
        band_matches = eval_df[band_mask].copy()
        
        if len(band_matches) > 0:
            for _, match in band_matches.iterrows():
                bet_type = band['bet_type']
                bet_odds = match['btts_yes_odds'] if bet_type == 'BTTS_YES' else match['btts_no_odds']
                outcome = match['btts'] if bet_type == 'BTTS_YES' else (1 - match['btts'])
                profit = (bet_odds - 1) if outcome == 1 else -1
                
                bets.append({
                    'step': step_num,
                    'date': match['date'],
                    'home': match['home'],
                    'away': match['away'],
                    'bet_type': bet_type,
                    'odds': bet_odds,
                    'model_prob': match['model_btts_prob'],
                    'outcome': outcome,
                    'profit_units': profit
                })
    
    bets_df = pd.DataFrame(bets)
    
    if len(bets_df) > 0:
        step_bets = len(bets_df)
        step_profit = bets_df['profit_units'].sum()
        step_roi = step_profit / step_bets
        step_wins = (bets_df['profit_units'] > 0).sum()
        
        print(f"  ✓ Bets placed: {step_bets}")
        print(f"    Win rate: {100 * step_wins / step_bets:.1f}%")
        print(f"    Profit: {step_profit:+.2f} units")
        print(f"    ROI: {100 * step_roi:+.2f}%")
    else:
        step_bets = 0
        step_profit = 0
        step_roi = 0
        print(f"  ⚠️ No bets placed")
    
    summary = {
        'step': step_num,
        'eval_start': eval_start,
        'eval_end': eval_end,
        'train_matches': len(train_df),
        'eval_matches': len(eval_df),
        'bands_found': len(bands),
        'bets': step_bets,
        'profit': step_profit,
        'roi': step_roi
    }
    
    return bets_df, summary


# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == '__main__':
    print("\nEPL PROFILE C - OPTION C BACKTEST")
    print("="*80)
    print("\nSTEP 1: Baseline verification (should match production)")
    print("Mode: Dixon-Coles only (no advanced features yet)")
    print("="*80)
    
    # Load data
    results_df, team_stats_df, odds_df, external_df = load_epl_data_option_c()
    
    # Prepare walk-forward dataset
    combined_df = prepare_walkforward_data_option_c(results_df, odds_df)
    
    # Run baseline backtest
    all_bets_df, summary_df = run_full_walkforward_option_c(
        combined_df=combined_df,
        use_advanced_model=False  # STEP 1: baseline
    )
    
    # Save results
    output_dir = Path('data/premier_league')
    output_dir.mkdir(parents=True, exist_ok=True)
    
    if len(all_bets_df) > 0:
        bets_path = output_dir / 'profile_c_option_c_walkforward_bets.csv'
        all_bets_df.to_csv(bets_path, index=False)
        print(f"\n✓ Saved bets to {bets_path}")
    
    summary_path = output_dir / 'profile_c_option_c_walkforward_summary.csv'
    summary_df.to_csv(summary_path, index=False)
    print(f"✓ Saved summary to {summary_path}")
    
    print("\n" + "="*80)
    print("BASELINE VERIFICATION COMPLETE")
    print("="*80)
    print("\nNext steps:")
    print("1. Compare these results vs production backtest")
    print("2. If identical (±rounding), baseline is verified")
    print("3. Proceed to Step 2 (feature engineering)")
