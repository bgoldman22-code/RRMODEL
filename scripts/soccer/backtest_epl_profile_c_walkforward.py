#!/usr/bin/env python3
"""
EPL Profile C - Walk-Forward Backtest with Rolling 2-Month Retrain

TRUE LIVE SIMULATION:
====================
This script implements a proper walk-forward backtest that simulates live trading:

1. EXPANDING WINDOW TRAINING
   - Each step uses ALL historical data before evaluation window
   - Retrains Dixon-Coles + team ratings every 2 months
   - Mimics how model would be deployed: retrain weekly/monthly

2. STRICT TIME PARTITIONING (ZERO LEAKAGE)
   For each walk-forward step:
   - Training set: ALL matches BEFORE evaluation_start
   - Tuning set: Last 365 days of training (for band optimization)
   - Evaluation set: Next 60 days forward (strictly out-of-sample)
   
3. BAND TUNING & SELECTION
   - Bands discovered on recent past (tuning window)
   - Applied to future matches (evaluation window)
   - Band selection criteria: ROI > 2%, edge > 8%, Kelly < 40%, min 20 matches
   
4. KELLY-BASED BET SIZING
   - Each band has Kelly fraction from tuning
   - Actual stakes: quarter-Kelly for safety (0.25x)
   - Tracks both unit-stake ROI and Kelly-weighted returns

5. REALISTIC DEPLOYMENT SIMULATION
   - Models how system would perform in production
   - Captures parameter drift, market changes over time
   - Shows true long-term profitability and variance

WALKFORWARD SCHEDULE:
=====================
evaluation_block_days = 60  (approximately 2 months)
tuning_horizon_days = 365   (use last year for band optimization)
min_training_matches = 300  (skip early periods with insufficient data)

Start from first date where we have 300+ training matches with odds.
Advance by 60 days per step until data exhausted.

USAGE:
======
python backtest_epl_profile_c_walkforward.py

OUTPUT:
=======
- data/premier_league/profile_c_walkforward_bets.csv (all bets across all steps)
- data/premier_league/profile_c_walkforward_bands.csv (band selections per step)
- data/premier_league/profile_c_walkforward_equity.png (cumulative profit chart)
- data/premier_league/profile_c_walkforward_summary.md (full analysis)
"""

import pandas as pd
import numpy as np
import json
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from pathlib import Path
from datetime import datetime, timedelta
import sys

# Add parent directories to path for imports
script_dir = Path(__file__).resolve().parent
project_dir = script_dir.parent.parent
sys.path.insert(0, str(project_dir))

# Import core functions from refactored module
from epl_profile_c_core import (
    load_epl_data,
    normalize_team_name,
    calculate_team_ratings,
    calibrate_dixon_coles,
    generate_predictions,
    find_profitable_bands
)

# Walk-forward configuration
WALKFORWARD_CONFIG = {
    'evaluation_block_days': 60,    # 2-month evaluation windows
    'tuning_horizon_days': 365,     # Use last year for band optimization
    'min_training_matches': 300,    # Skip if insufficient training data
    'min_tuning_matches': 200,      # Minimum matches in tuning window
    'band_selection_criteria': {
        'min_roi': 0.02,            # 2% minimum ROI
        'min_edge': 0.08,           # 8% minimum edge
        'max_kelly': 0.40,          # Maximum Kelly fraction
        'min_matches': 20            # Minimum sample size
    },
    'kelly_multiplier': 0.25,       # Quarter-Kelly for safety
    'output_dir': '/Users/brentgoldman/Desktop/REPO33/data/premier_league/'
}

def prepare_walkforward_data(results, odds):
    """
    Prepare combined dataset for walk-forward (merge results + odds)
    
    Args:
        results: Match results DataFrame
        odds: BTTS odds DataFrame
        
    Returns:
        DataFrame: Combined data sorted by date with BTTS odds
    """
    # Keep only seasons where we have odds
    results_with_odds = results[results['season'].isin(odds['season'].unique())].copy()
    
    # Merge results with odds on home+away+season
    # Odds file uses normalized names directly
    df = results_with_odds.merge(
        odds,
        left_on=['home_normalized', 'away_normalized', 'season'],
        right_on=['home', 'away', 'season'],
        how='inner',
        suffixes=('_results', '_odds')
    )
    
    # Use odds date (actual match timestamp) not results date (placeholder)
    if 'date_odds' in df.columns:
        df = df.rename(columns={'date_odds': 'date'})
        df = df.drop(columns=['date_results'], errors='ignore')
    elif 'date' not in df.columns and 'date_results' in df.columns:
        df = df.rename(columns={'date_results': 'date'})
    
    # Sort by date
    df = df.sort_values('date').reset_index(drop=True)
    
    # Keep essential columns - use the normalized names from odds as 'home'/'away'
    # and full names from results as 'home_full'/'away_full'
    cols_to_keep = [
        'date', 'season',
        'home_results',  'away_results',  # Original full names from results
        'home_normalized', 'away_normalized',  # Normalized names
        'home_score', 'away_score', 'btts',
        'btts_yes_odds', 'btts_no_odds', 'bookmaker'
    ]
    
    # Filter to available columns
    cols_to_keep = [c for c in cols_to_keep if c in df.columns]
    df = df[cols_to_keep]
    
    # Rename for consistency
    df = df.rename(columns={
        'home_results': 'home_full',
        'away_results': 'away_full',
        'home_normalized': 'home',
        'away_normalized': 'away'
    })
    
    return df

def get_walkforward_schedule(df, config):
    """
    Generate walk-forward schedule (list of evaluation windows)
    
    Args:
        df: Combined match data sorted by date
        config: Walk-forward configuration
        
    Returns:
        list: List of dicts with {step_id, eval_start, eval_end, training_end}
    """
    schedule = []
    step_id = 1
    
    first_date = df['date'].min()
    last_date = df['date'].max()
    
    # Find first viable evaluation start (need min_training_matches before it)
    current_date = first_date
    while current_date < last_date:
        training_matches = len(df[df['date'] < current_date])
        if training_matches >= config['min_training_matches']:
            break
        current_date += timedelta(days=30)  # Advance by month
    
    eval_start = current_date
    
    # Generate schedule
    while eval_start < last_date - timedelta(days=config['evaluation_block_days']):
        eval_end = eval_start + timedelta(days=config['evaluation_block_days'])
        
        # Check if we have enough evaluation matches
        eval_matches = len(df[(df['date'] >= eval_start) & (df['date'] < eval_end)])
        
        if eval_matches >= 10:  # At least 10 matches in eval window
            schedule.append({
                'step_id': step_id,
                'eval_start': eval_start,
                'eval_end': eval_end,
                'training_end': eval_start  # Training uses all data BEFORE eval_start
            })
            step_id += 1
        
        # Advance to next window
        eval_start = eval_end
    
    return schedule

def partition_data(df, team_stats, eval_start, eval_end, config):
    """
    Partition data for one walk-forward step (ZERO LEAKAGE)
    
    Args:
        df: Full combined dataset
        team_stats: Team statistics by season
        eval_start: Evaluation window start
        eval_end: Evaluation window end
        config: Walk-forward configuration
        
    Returns:
        tuple: (train_df, tuning_df, eval_df, train_team_stats)
    """
    # Training: ALL data before eval_start
    train_df = df[df['date'] < eval_start].copy()
    
    # Tuning: Last N days of training (for band optimization)
    tuning_start = eval_start - timedelta(days=config['tuning_horizon_days'])
    tuning_df = train_df[train_df['date'] >= tuning_start].copy()
    
    # Evaluation: Future window [eval_start, eval_end)
    eval_df = df[(df['date'] >= eval_start) & (df['date'] < eval_end)].copy()
    
    # Team stats: Only seasons present in training data (LEAKAGE PREVENTION)
    allowed_seasons = sorted(train_df['season'].unique())
    train_team_stats = team_stats[team_stats['season'].isin(allowed_seasons)].copy()
    
    return train_df, tuning_df, eval_df, train_team_stats

def run_walkforward_step(step_info, df, team_stats, config):
    """
    Execute one walk-forward step: train → tune → evaluate
    
    Args:
        step_info: Dict with step_id, eval_start, eval_end
        df: Full combined dataset
        team_stats: Full team statistics
        config: Walk-forward configuration
        
    Returns:
        tuple: (step_bets, step_bands, step_metrics)
    """
    step_id = step_info['step_id']
    eval_start = step_info['eval_start']
    eval_end = step_info['eval_end']
    
    print(f"\n{'='*80}")
    print(f"STEP {step_id}: {eval_start.date()} to {eval_end.date()}")
    print(f"{'='*80}")
    
    # 1. PARTITION DATA (ZERO LEAKAGE)
    train_df, tuning_df, eval_df, train_team_stats = partition_data(
        df, team_stats, eval_start, eval_end, config
    )
    
    print(f"  Training matches: {len(train_df)} (all data before {eval_start.date()})")
    print(f"  Tuning matches: {len(tuning_df)} (last {config['tuning_horizon_days']} days of training)")
    print(f"  Evaluation matches: {len(eval_df)} ({eval_start.date()} to {eval_end.date()})")
    
    # Skip if insufficient tuning data
    if len(tuning_df) < config['min_tuning_matches']:
        print(f"  ⚠️  SKIPPED: Insufficient tuning data ({len(tuning_df)} < {config['min_tuning_matches']})")
        return None, None, None
    
    # Skip if no evaluation matches
    if len(eval_df) == 0:
        print(f"  ⚠️  SKIPPED: No evaluation matches")
        return None, None, None
    
    # 2. CALCULATE LEAGUE STATISTICS (on training data)
    league_avg_goals = train_df[['home_score', 'away_score']].values.flatten().mean()
    print(f"  League avg goals: {league_avg_goals:.2f}")
    
    # 3. CALCULATE TEAM RATINGS (training seasons only)
    allowed_seasons = sorted(train_df['season'].unique())
    
    # Prepare training results for team ratings (need original team names)
    train_results_for_ratings = train_df.copy()
    train_results_for_ratings['home'] = train_results_for_ratings['home_full']
    train_results_for_ratings['away'] = train_results_for_ratings['away_full']
    
    team_ratings = calculate_team_ratings(
        train_results_for_ratings,
        train_team_stats,
        league_avg_goals,
        allowed_seasons=allowed_seasons
    )
    
    print(f"  Team ratings: {len(team_ratings)} teams (seasons: {allowed_seasons})")
    
    # Verify zero leakage
    seasons_used = set([r.get('season', 'DEFAULT') for r in team_ratings.values()])
    eval_seasons = set(eval_df['season'].unique())
    leak_detected = any(s in eval_seasons for s in seasons_used if s != 'DEFAULT')
    
    if leak_detected:
        raise ValueError(f"LEAKAGE DETECTED in step {step_id}: Eval seasons {eval_seasons} found in ratings!")
    
    print(f"  ✓ Zero-leakage verified: No eval-season stats used")
    
    # 4. CALIBRATE DIXON-COLES (on training data)
    dc_params = calibrate_dixon_coles(
        train_results_for_ratings,
        team_ratings,
        league_avg_goals,
        verbose=False
    )
    
    print(f"  Dixon-Coles: home_adv={dc_params['home_advantage']:.3f}, tau_00={dc_params['tau_00']:.3f}")
    
    # 5. GENERATE PREDICTIONS FOR TUNING WINDOW
    tuning_results_for_pred = tuning_df.copy()
    tuning_results_for_pred['home'] = tuning_results_for_pred['home_full']
    tuning_results_for_pred['away'] = tuning_results_for_pred['away_full']
    
    tuning_preds = generate_predictions(tuning_results_for_pred, team_ratings, dc_params)
    
    # Prepare tuning odds for band finding
    tuning_odds = tuning_df[['home', 'away', 'season', 'btts_yes_odds', 'btts_no_odds']].copy()
    
    # 6. FIND BANDS ON TUNING DATA
    all_bands = find_profitable_bands(
        tuning_preds,
        tuning_odds,
        min_matches=config['band_selection_criteria']['min_matches']
    )
    
    if len(all_bands) == 0:
        print(f"  ⚠️  No bands found in tuning window")
        return None, None, None
    
    # 7. SELECT ACTIVE BANDS (profitability filters)
    criteria = config['band_selection_criteria']
    active_bands = all_bands[
        (all_bands['roi'] > criteria['min_roi']) &
        (all_bands['avg_edge'] >= criteria['min_edge']) &
        (all_bands['kelly_fraction'] <= criteria['max_kelly']) &
        (all_bands['n_matches'] >= criteria['min_matches'])
    ].copy()
    
    print(f"  Bands found: {len(all_bands)} total, {len(active_bands)} active")
    
    if len(active_bands) == 0:
        print(f"  ⚠️  No bands passed selection criteria")
        # Still return all bands for analysis
        all_bands['step_id'] = step_id
        all_bands['eval_start'] = eval_start
        all_bands['eval_end'] = eval_end
        all_bands['active'] = False
        return pd.DataFrame(), all_bands, None
    
    # Tag bands with step info
    active_bands['step_id'] = step_id
    active_bands['eval_start'] = eval_start
    active_bands['eval_end'] = eval_end
    active_bands['active'] = True
    
    all_bands['step_id'] = step_id
    all_bands['eval_start'] = eval_start
    all_bands['eval_end'] = eval_end
    all_bands['active'] = all_bands.index.isin(active_bands.index)
    
    # 8. GENERATE PREDICTIONS FOR EVALUATION WINDOW
    eval_results_for_pred = eval_df.copy()
    eval_results_for_pred['home'] = eval_results_for_pred['home_full']
    eval_results_for_pred['away'] = eval_results_for_pred['away_full']
    
    eval_preds = generate_predictions(eval_results_for_pred, team_ratings, dc_params)
    
    # Merge with odds
    eval_with_odds = eval_preds.merge(
        eval_df[['home', 'away', 'season', 'date', 'btts_yes_odds', 'btts_no_odds']],
        on=['home', 'away', 'season'],
        how='inner'
    )
    
    print(f"  Evaluation predictions: {len(eval_with_odds)} matches")
    
    # 9. APPLY ACTIVE BANDS TO EVALUATION SET (PLACE BETS)
    bets = []
    
    for _, match in eval_with_odds.iterrows():
        pred_prob = match['predicted_btts_prob']
        
        # Check YES bands
        for _, band in active_bands[active_bands['bet_type'] == 'BTTS_YES'].iterrows():
            if band['prob_low'] <= pred_prob < band['prob_high']:
                # Calculate market-implied probability
                market_prob = 1 / match['btts_yes_odds']  # Simplification
                edge = pred_prob - market_prob
                
                # Bet sizing
                kelly_frac = band['kelly_fraction']
                stake_frac = kelly_frac * config['kelly_multiplier']
                
                # Profit (1 unit stake basis)
                profit = match['actual_btts'] * match['btts_yes_odds'] - 1
                
                bets.append({
                    'step_id': step_id,
                    'date': match['date'],
                    'season': match['season'],
                    'home': match['home_full'],
                    'away': match['away_full'],
                    'bet_type': 'BTTS_YES',
                    'predicted_prob': pred_prob,
                    'market_prob': market_prob,
                    'edge': edge,
                    'band_prob_low': band['prob_low'],
                    'band_prob_high': band['prob_high'],
                    'kelly_fraction_band': kelly_frac,
                    'stake_fraction': stake_frac,
                    'odds': match['btts_yes_odds'],
                    'actual_btts': match['actual_btts'],
                    'profit_units': profit,
                    'profit_kelly': profit * stake_frac,
                    'eval_start': eval_start,
                    'eval_end': eval_end
                })
                break  # One bet per market per match
        
        # Check NO bands
        for _, band in active_bands[active_bands['bet_type'] == 'BTTS_NO'].iterrows():
            if band['prob_low'] <= pred_prob < band['prob_high']:
                market_prob = 1 / match['btts_no_odds']
                edge = (1 - pred_prob) - market_prob
                
                kelly_frac = band['kelly_fraction']
                stake_frac = kelly_frac * config['kelly_multiplier']
                
                profit = (1 - match['actual_btts']) * match['btts_no_odds'] - 1
                
                bets.append({
                    'step_id': step_id,
                    'date': match['date'],
                    'season': match['season'],
                    'home': match['home_full'],
                    'away': match['away_full'],
                    'bet_type': 'BTTS_NO',
                    'predicted_prob': pred_prob,
                    'market_prob': market_prob,
                    'edge': edge,
                    'band_prob_low': band['prob_low'],
                    'band_prob_high': band['prob_high'],
                    'kelly_fraction_band': kelly_frac,
                    'stake_fraction': stake_frac,
                    'odds': match['btts_no_odds'],
                    'actual_btts': match['actual_btts'],
                    'profit_units': profit,
                    'profit_kelly': profit * stake_frac,
                    'eval_start': eval_start,
                    'eval_end': eval_end
                })
                break
    
    bets_df = pd.DataFrame(bets)
    
    # 10. CALCULATE STEP METRICS
    if len(bets_df) > 0:
        step_metrics = {
            'step_id': step_id,
            'eval_start': eval_start,
            'eval_end': eval_end,
            'n_bets': len(bets_df),
            'n_wins': (bets_df['profit_units'] > 0).sum(),
            'win_rate': (bets_df['profit_units'] > 0).mean(),
            'total_profit_units': bets_df['profit_units'].sum(),
            'total_profit_kelly': bets_df['profit_kelly'].sum(),
            'roi_units': bets_df['profit_units'].mean(),
            'roi_kelly': bets_df['profit_kelly'].sum() / bets_df['stake_fraction'].sum() if bets_df['stake_fraction'].sum() > 0 else 0,
            'avg_odds': bets_df['odds'].mean(),
            'avg_edge': bets_df['edge'].mean(),
            'n_yes_bets': (bets_df['bet_type'] == 'BTTS_YES').sum(),
            'n_no_bets': (bets_df['bet_type'] == 'BTTS_NO').sum()
        }
        
        print(f"  Bets placed: {len(bets_df)} (YES: {step_metrics['n_yes_bets']}, NO: {step_metrics['n_no_bets']})")
        print(f"  Win rate: {step_metrics['win_rate']:.1%}")
        print(f"  Profit: {step_metrics['total_profit_units']:.2f} units (ROI: {step_metrics['roi_units']:.2%})")
        print(f"  Kelly profit: {step_metrics['total_profit_kelly']:.2f}")
    else:
        step_metrics = None
        print(f"  No bets placed in evaluation window")
    
    return bets_df, all_bands, step_metrics

def run_full_walkforward(config=WALKFORWARD_CONFIG):
    """
    Execute complete walk-forward backtest
    
    Args:
        config: Walk-forward configuration dict
        
    Returns:
        tuple: (all_bets_df, all_bands_df, metrics_df)
    """
    print("\n" + "="*80)
    print("EPL PROFILE C - WALK-FORWARD BACKTEST")
    print("="*80)
    print(f"Evaluation block: {config['evaluation_block_days']} days")
    print(f"Tuning horizon: {config['tuning_horizon_days']} days")
    print(f"Kelly multiplier: {config['kelly_multiplier']}x (quarter-Kelly)")
    
    # 1. LOAD DATA
    print("\nLoading data...")
    results, team_stats, odds = load_epl_data(config['output_dir'])
    
    print(f"✓ Results: {len(results)} matches")
    print(f"✓ Team stats: {len(team_stats)} team-seasons")
    print(f"✓ Odds: {len(odds)} matches")
    
    # 2. PREPARE COMBINED DATASET
    print("\nPreparing walk-forward dataset...")
    df = prepare_walkforward_data(results, odds)
    
    print(f"✓ Combined: {len(df)} matches with odds")
    print(f"  Date range: {df['date'].min().date()} to {df['date'].max().date()}")
    print(f"  Seasons: {sorted(df['season'].unique())}")
    
    # 3. GENERATE WALK-FORWARD SCHEDULE
    print("\nGenerating walk-forward schedule...")
    schedule = get_walkforward_schedule(df, config)
    
    print(f"✓ Schedule: {len(schedule)} evaluation windows")
    print(f"  First: {schedule[0]['eval_start'].date()} to {schedule[0]['eval_end'].date()}")
    print(f"  Last: {schedule[-1]['eval_start'].date()} to {schedule[-1]['eval_end'].date()}")
    
    # 4. RUN ALL WALK-FORWARD STEPS
    all_bets = []
    all_bands = []
    all_metrics = []
    
    for step_info in schedule:
        bets, bands, metrics = run_walkforward_step(step_info, df, team_stats, config)
        
        if bets is not None and len(bets) > 0:
            all_bets.append(bets)
        
        if bands is not None and len(bands) > 0:
            all_bands.append(bands)
        
        if metrics is not None:
            all_metrics.append(metrics)
    
    # 5. COMBINE RESULTS
    print("\n" + "="*80)
    print("COMBINING RESULTS")
    print("="*80)
    
    if len(all_bets) == 0:
        print("✗ No bets placed across all steps!")
        return None, None, None
    
    bets_df = pd.concat(all_bets, ignore_index=True)
    bands_df = pd.concat(all_bands, ignore_index=True) if len(all_bands) > 0 else pd.DataFrame()
    metrics_df = pd.DataFrame(all_metrics) if len(all_metrics) > 0 else pd.DataFrame()
    
    print(f"✓ Total bets: {len(bets_df)}")
    print(f"✓ Total bands tested: {len(bands_df)}")
    print(f"✓ Steps with bets: {len(metrics_df)}")
    
    return bets_df, bands_df, metrics_df

def create_equity_curve(bets_df, output_dir):
    """
    Create and save equity curve visualization
    
    Args:
        bets_df: DataFrame with all bets
        output_dir: Output directory path
    """
    print("\nCreating equity curve...")
    
    # Sort by date
    df = bets_df.sort_values('date').copy()
    
    # Cumulative profit (unit stakes)
    df['cumulative_units'] = df['profit_units'].cumsum()
    
    # Cumulative profit (Kelly stakes)
    df['cumulative_kelly'] = df['profit_kelly'].cumsum()
    
    # Create plot
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10), sharex=True)
    
    # Plot 1: Unit stakes equity curve
    ax1.plot(df['date'], df['cumulative_units'], linewidth=2, label='Unit Stakes', color='blue')
    ax1.axhline(0, color='black', linestyle='--', linewidth=1, alpha=0.5)
    ax1.set_ylabel('Cumulative Profit (units)', fontsize=12)
    ax1.set_title('EPL Profile C Walk-Forward Equity Curve', fontsize=14, fontweight='bold')
    ax1.grid(alpha=0.3)
    ax1.legend()
    
    # Add shaded regions for each step
    for step_id in df['step_id'].unique():
        step_data = df[df['step_id'] == step_id]
        if len(step_data) > 0:
            start = step_data['eval_start'].iloc[0]
            end = step_data['eval_end'].iloc[0]
            if step_id % 2 == 0:
                ax1.axvspan(start, end, alpha=0.05, color='gray')
                ax2.axvspan(start, end, alpha=0.05, color='gray')
    
    # Plot 2: Kelly stakes equity curve
    ax2.plot(df['date'], df['cumulative_kelly'], linewidth=2, label='Kelly Stakes (0.25x)', color='green')
    ax2.axhline(0, color='black', linestyle='--', linewidth=1, alpha=0.5)
    ax2.set_xlabel('Date', fontsize=12)
    ax2.set_ylabel('Cumulative Profit (Kelly-weighted)', fontsize=12)
    ax2.grid(alpha=0.3)
    ax2.legend()
    
    # Format x-axis
    ax2.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m'))
    ax2.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
    plt.xticks(rotation=45)
    
    plt.tight_layout()
    
    # Save
    output_path = Path(output_dir) / 'profile_c_walkforward_equity.png'
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    
    print(f"✓ Saved equity curve to {output_path}")

def generate_summary_report(bets_df, bands_df, metrics_df, output_dir):
    """
    Generate comprehensive markdown summary report
    
    Args:
        bets_df: All bets
        bands_df: All bands tested
        metrics_df: Per-step metrics
        output_dir: Output directory
    """
    print("\nGenerating summary report...")
    
    output_path = Path(output_dir) / 'profile_c_walkforward_summary.md'
    
    # Overall statistics
    total_bets = len(bets_df)
    total_profit_units = bets_df['profit_units'].sum()
    roi_units = bets_df['profit_units'].mean()
    win_rate = (bets_df['profit_units'] > 0).mean()
    
    total_profit_kelly = bets_df['profit_kelly'].sum()
    total_kelly_stake = bets_df['stake_fraction'].sum()
    roi_kelly = total_profit_kelly / total_kelly_stake if total_kelly_stake > 0 else 0
    
    # By year
    bets_df['year'] = pd.to_datetime(bets_df['date']).dt.year
    by_year = bets_df.groupby('year').agg({
        'profit_units': ['sum', 'mean', 'count'],
        'profit_kelly': 'sum'
    }).round(3)
    
    # By season
    by_season = bets_df.groupby('season').agg({
        'profit_units': ['sum', 'mean', 'count'],
        'profit_kelly': 'sum'
    }).round(3)
    
    # By bet type
    by_type = bets_df.groupby('bet_type').agg({
        'profit_units': ['sum', 'mean', 'count'],
        'odds': 'mean'
    }).round(3)
    
    # Top bands (by frequency)
    bets_df['band_key'] = bets_df.apply(
        lambda x: f"{x['bet_type']} [{x['band_prob_low']:.2f}-{x['band_prob_high']:.2f}]",
        axis=1
    )
    
    top_bands = bets_df.groupby('band_key').agg({
        'profit_units': ['sum', 'mean', 'count'],
        'odds': 'mean',
        'edge': 'mean'
    }).sort_values(('profit_units', 'sum'), ascending=False).head(10)
    
    # Drawdown analysis
    bets_sorted = bets_df.sort_values('date')
    bets_sorted['cumulative'] = bets_sorted['profit_units'].cumsum()
    bets_sorted['peak'] = bets_sorted['cumulative'].cummax()
    bets_sorted['drawdown'] = bets_sorted['cumulative'] - bets_sorted['peak']
    max_dd = bets_sorted['drawdown'].min()
    
    # Longest losing streak
    bets_sorted['is_loss'] = bets_sorted['profit_units'] < 0
    bets_sorted['streak_id'] = (bets_sorted['is_loss'] != bets_sorted['is_loss'].shift()).cumsum()
    losing_streaks = bets_sorted[bets_sorted['is_loss']].groupby('streak_id').size()
    longest_streak = losing_streaks.max() if len(losing_streaks) > 0 else 0
    
    # Generate report
    report = f"""# EPL Profile C - Walk-Forward Backtest Report

**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Executive Summary

### Walk-Forward Configuration
- **Evaluation blocks:** {WALKFORWARD_CONFIG['evaluation_block_days']} days (≈2 months)
- **Tuning horizon:** {WALKFORWARD_CONFIG['tuning_horizon_days']} days (last year)
- **Kelly multiplier:** {WALKFORWARD_CONFIG['kelly_multiplier']}x (quarter-Kelly for safety)
- **Band criteria:** ROI > {WALKFORWARD_CONFIG['band_selection_criteria']['min_roi']:.0%}, edge > {WALKFORWARD_CONFIG['band_selection_criteria']['min_edge']:.0%}
- **Total steps:** {len(metrics_df)}
- **Date range:** {bets_df['date'].min().date()} to {bets_df['date'].max().date()}

### Overall Performance
- **Total bets:** {total_bets:,}
- **Win rate:** {win_rate:.2%}
- **Total profit (units):** {total_profit_units:.2f} units
- **ROI (unit stakes):** {roi_units:.2%}
- **Total profit (Kelly):** {total_profit_kelly:.2f}
- **ROI (Kelly stakes):** {roi_kelly:.2%}
- **Max drawdown:** {max_dd:.2f} units
- **Longest losing streak:** {longest_streak} bets

---

## Performance by Year

| Year | Bets | Profit (units) | ROI | Kelly Profit |
|------|------|----------------|-----|--------------|
"""
    
    for year, row in by_year.iterrows():
        count = int(row[('profit_units', 'count')])
        profit = row[('profit_units', 'sum')]
        roi = row[('profit_units', 'mean')]
        kelly_profit = row[('profit_kelly', 'sum')]
        report += f"| {year} | {count} | {profit:.2f} | {roi:.2%} | {kelly_profit:.2f} |\n"
    
    report += f"""
---

## Performance by Season

| Season | Bets | Profit (units) | ROI | Kelly Profit |
|--------|------|----------------|-----|--------------|
"""
    
    for season, row in by_season.iterrows():
        count = int(row[('profit_units', 'count')])
        profit = row[('profit_units', 'sum')]
        roi = row[('profit_units', 'mean')]
        kelly_profit = row[('profit_kelly', 'sum')]
        report += f"| {season} | {count} | {profit:.2f} | {roi:.2%} | {kelly_profit:.2f} |\n"
    
    report += f"""
---

## Performance by Bet Type

| Bet Type | Bets | Profit (units) | ROI | Avg Odds |
|----------|------|----------------|-----|----------|
"""
    
    for bet_type, row in by_type.iterrows():
        count = int(row[('profit_units', 'count')])
        profit = row[('profit_units', 'sum')]
        roi = row[('profit_units', 'mean')]
        odds = row[('odds', 'mean')]
        report += f"| {bet_type} | {count} | {profit:.2f} | {roi:.2%} | {odds:.2f} |\n"
    
    report += f"""
---

## Top 10 Bands (by total profit)

| Band | Bets | Profit | ROI | Avg Odds | Avg Edge |
|------|------|--------|-----|----------|----------|
"""
    
    for band_key, row in top_bands.iterrows():
        count = int(row[('profit_units', 'count')])
        profit = row[('profit_units', 'sum')]
        roi = row[('profit_units', 'mean')]
        odds = row[('odds', 'mean')]
        edge = row[('edge', 'mean')]
        report += f"| {band_key} | {count} | {profit:.2f} | {roi:.2%} | {odds:.2f} | {edge:.2%} |\n"
    
    report += f"""
---

## Risk Metrics

- **Maximum Drawdown:** {max_dd:.2f} units
- **Longest Losing Streak:** {longest_streak} consecutive bets
- **Worst Step:** {metrics_df['roi_units'].min():.2%} ROI
- **Best Step:** {metrics_df['roi_units'].max():.2%} ROI
- **Steps with profit:** {(metrics_df['total_profit_units'] > 0).sum()} / {len(metrics_df)} ({(metrics_df['total_profit_units'] > 0).mean():.1%})

---

## Walk-Forward Validation Notes

### Zero-Leakage Guarantee ✓

This backtest implements strict walk-forward validation:

1. **Each step retrains** Dixon-Coles and team ratings on ALL data before evaluation window
2. **Band tuning** uses only the last {WALKFORWARD_CONFIG['tuning_horizon_days']} days of training data
3. **Evaluation** is strictly forward-looking (future matches only)
4. **Team stats** filtered to seasons present in training data (no future leakage)

### Comparison to Single-Split Backtest

The original single-split backtest (v2) showed:
- Training: 2023-24 (388 matches)
- Validation: 2024-25 + 2025-26 (541 matches)
- Profitable bands: 11
- Best band: BTTS NO [0.31-0.41] at 27.41% ROI

Walk-forward typically shows:
- **Lower ROI** (more realistic, accounts for parameter drift)
- **Higher variance** (fewer matches per evaluation window)
- **More consistent bands** (bands that work across multiple steps)

### Production Deployment

This walk-forward simulation approximates live trading performance:
- Retrain model every 60 days (or more frequently)
- Use last 365 days for band optimization
- Apply quarter-Kelly bet sizing for safety
- Track equity curve, monitor for degradation

---

## Files Generated

- **profile_c_walkforward_bets.csv** - All {total_bets:,} bets with outcomes
- **profile_c_walkforward_bands.csv** - {len(bands_df)} bands tested across all steps
- **profile_c_walkforward_equity.png** - Cumulative profit over time
- **profile_c_walkforward_summary.md** - This report

---

**End of Walk-Forward Backtest Report**

*This analysis demonstrates the EPL Profile C strategy's performance under realistic live-trading conditions with rolling retraining and strict zero-leakage validation.*
"""
    
    with open(output_path, 'w') as f:
        f.write(report)
    
    print(f"✓ Saved summary report to {output_path}")

def main():
    """Main execution"""
    # Run full walk-forward
    bets_df, bands_df, metrics_df = run_full_walkforward()
    
    if bets_df is None or len(bets_df) == 0:
        print("\n✗ Walk-forward backtest failed or produced no bets")
        return
    
    # Save outputs
    output_dir = Path(WALKFORWARD_CONFIG['output_dir'])
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("\n" + "="*80)
    print("SAVING OUTPUTS")
    print("="*80)
    
    # Save bets
    bets_path = output_dir / 'profile_c_walkforward_bets.csv'
    bets_df.to_csv(bets_path, index=False)
    print(f"✓ Saved {len(bets_df)} bets to {bets_path}")
    
    # Save bands
    if len(bands_df) > 0:
        bands_path = output_dir / 'profile_c_walkforward_bands.csv'
        bands_df.to_csv(bands_path, index=False)
        print(f"✓ Saved {len(bands_df)} bands to {bands_path}")
    
    # Create equity curve
    create_equity_curve(bets_df, output_dir)
    
    # Generate summary
    generate_summary_report(bets_df, bands_df, metrics_df, output_dir)
    
    print("\n" + "="*80)
    print("✓ WALK-FORWARD BACKTEST COMPLETE")
    print("="*80)
    print(f"\nTotal bets: {len(bets_df):,}")
    print(f"Total profit: {bets_df['profit_units'].sum():.2f} units")
    print(f"ROI: {bets_df['profit_units'].mean():.2%}")
    print(f"\nReview: {output_dir}/profile_c_walkforward_summary.md")

if __name__ == '__main__':
    main()
