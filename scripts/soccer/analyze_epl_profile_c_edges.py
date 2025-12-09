#!/usr/bin/env python3
"""
EPL Profile C - Edge Explorer (Analysis Only)

PURE ANALYSIS MODE - NO BEHAVIOR CHANGES
=========================================
This script analyzes ALL edges in the walk-forward evaluation windows to answer:

1. Are we leaving money on the table?
   → Which profitable edges are currently excluded by Profile C?

2. Are small edges profitable or noise?
   → Does ROI increase with edge magnitude?

3. Does the model have broad predictive value?
   → Can we "bet every edge" profitably?

4. Where are the true profitable regions?
   → By probability band, edge bucket, odds range

CRITICAL: This script does NOT modify existing Profile C behavior, config, or thresholds.
It operates in read-only analysis mode.

WALK-FORWARD CONSISTENCY:
=========================
- Uses SAME data sources as main walk-forward backtest
- Recreates SAME evaluation windows and schedule
- Applies SAME zero-leakage temporal partitioning
- Reuses core functions (calculate_team_ratings, calibrate_dixon_coles, etc.)

OUTPUT:
=======
- data/premier_league/profile_c_edge_universe_walkforward.csv (all edges)
- data/premier_league/profile_c_edge_portfolios.csv (simulated portfolios)
- data/premier_league/profile_c_edge_buckets.csv (ROI by edge/prob/odds buckets)
- data/premier_league/profile_c_edge_explorer_summary.md (analysis report)

USAGE:
======
python analyze_epl_profile_c_edges.py
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from pathlib import Path
from datetime import datetime, timedelta
import sys

# Add parent directories to path for imports
script_dir = Path(__file__).resolve().parent
project_dir = script_dir.parent.parent
sys.path.insert(0, str(project_dir))

# Import core functions from refactored module (read-only reuse)
from epl_profile_c_core import (
    load_epl_data,
    normalize_team_name,
    calculate_team_ratings,
    calibrate_dixon_coles,
    generate_predictions,
    shin_implied_prob
)

# Analysis configuration (matches walk-forward exactly)
ANALYSIS_CONFIG = {
    'evaluation_block_days': 90,    # Same as walk-forward
    'tuning_horizon_days': 365,
    'min_training_matches': 300,
    'output_dir': '/Users/brentgoldman/Desktop/REPO33/data/premier_league/'
}

# Edge thresholds to test
EDGE_THRESHOLDS = [0.00, 0.02, 0.05, 0.08, 0.10]

# Edge buckets for ROI analysis
EDGE_BUCKETS = [
    (0.00, 0.02, '[0-2%]'),
    (0.02, 0.04, '[2-4%]'),
    (0.04, 0.06, '[4-6%]'),
    (0.06, 0.08, '[6-8%]'),
    (0.08, 0.10, '[8-10%]'),
    (0.10, 0.15, '[10-15%]'),
    (0.15, 1.00, '[15%+]')
]

# Probability buckets
PROB_BUCKETS = [
    (0.0, 0.2, '[0-20%]'),
    (0.2, 0.3, '[20-30%]'),
    (0.3, 0.4, '[30-40%]'),
    (0.4, 0.5, '[40-50%]'),
    (0.5, 0.6, '[50-60%]'),
    (0.6, 0.7, '[60-70%]'),
    (0.7, 0.8, '[70-80%]'),
    (0.8, 1.0, '[80-100%]')
]

# Odds buckets
ODDS_BUCKETS = [
    (1.40, 1.70, '[1.40-1.70]'),
    (1.70, 2.00, '[1.70-2.00]'),
    (2.00, 2.30, '[2.00-2.30]'),
    (2.30, 2.60, '[2.30-2.60]'),
    (2.60, 3.00, '[2.60-3.00]'),
    (3.00, 5.00, '[3.00+]')
]


def prepare_walkforward_data(results, odds):
    """
    Prepare combined dataset for walk-forward (same as main script)
    """
    # Normalize team names in both datasets
    results['home_normalized'] = results['home'].apply(normalize_team_name)
    results['away_normalized'] = results['away'].apply(normalize_team_name)
    odds['home_normalized'] = odds['home'].apply(normalize_team_name)
    odds['away_normalized'] = odds['away'].apply(normalize_team_name)
    
    # Convert date columns
    results['date'] = pd.to_datetime(results['date'])
    odds['date'] = pd.to_datetime(odds['date'])
    
    # Merge on home, away, season
    combined = pd.merge(
        results,
        odds,
        on=['home_normalized', 'away_normalized', 'season'],
        suffixes=('', '_odds'),
        how='inner'
    )
    
    # Use results date (more reliable)
    if 'date_odds' in combined.columns:
        combined = combined.drop('date_odds', axis=1)
    
    # Standardize column names for goals
    if 'home_score' in combined.columns:
        combined['home_goals'] = combined['home_score']
    if 'away_score' in combined.columns:
        combined['away_goals'] = combined['away_score']
    
    # Keep only necessary columns
    keep_cols = [
        'date', 'season', 'home', 'away', 'home_normalized', 'away_normalized',
        'home_goals', 'away_goals', 'btts', 'btts_yes_odds', 'btts_no_odds'
    ]
    available_cols = [c for c in keep_cols if c in combined.columns]
    combined = combined[available_cols].copy()
    
    # Sort by date
    combined = combined.sort_values('date').reset_index(drop=True)
    
    return combined


def get_walkforward_schedule(df, config):
    """
    Generate walk-forward schedule (same logic as main script)
    """
    df = df.copy()
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date')
    
    min_date = df['date'].min()
    max_date = df['date'].max()
    
    schedule = []
    current_start = min_date
    step_id = 1
    
    while current_start < max_date:
        # Check if we have enough training data
        training_df = df[df['date'] < current_start]
        if len(training_df) < config['min_training_matches']:
            current_start += timedelta(days=config['evaluation_block_days'])
            continue
        
        eval_end = current_start + timedelta(days=config['evaluation_block_days'])
        
        # Check if there are any matches in evaluation window
        eval_matches = df[(df['date'] >= current_start) & (df['date'] < eval_end)]
        if len(eval_matches) == 0:
            current_start += timedelta(days=config['evaluation_block_days'])
            continue
        
        schedule.append({
            'step_id': step_id,
            'eval_start': current_start,
            'eval_end': eval_end,
            'training_end': current_start - timedelta(days=1)
        })
        
        step_id += 1
        current_start += timedelta(days=config['evaluation_block_days'])
    
    return schedule


def partition_data(df, team_stats, eval_start, eval_end, config):
    """
    Partition data into training/tuning/eval (same logic as main script)
    """
    # Training: all before eval_start
    train_df = df[df['date'] < eval_start].copy()
    
    # Tuning: last N days of training
    tuning_cutoff = eval_start - timedelta(days=config['tuning_horizon_days'])
    tuning_df = train_df[train_df['date'] >= tuning_cutoff].copy()
    
    # Evaluation: matches in [eval_start, eval_end)
    eval_df = df[(df['date'] >= eval_start) & (df['date'] < eval_end)].copy()
    
    # Filter team stats to training seasons only (zero-leakage)
    training_seasons = set(train_df['season'].unique())
    train_team_stats = team_stats[team_stats['season'].isin(training_seasons)].copy()
    
    return train_df, tuning_df, eval_df, train_team_stats


def compute_edge_universe_for_step(step_info, df, team_stats, config):
    """
    Compute ALL edges for a single walk-forward step
    
    Returns: DataFrame with all eval matches + model predictions + edges
    """
    step_id = step_info['step_id']
    eval_start = step_info['eval_start']
    eval_end = step_info['eval_end']
    
    print(f"\n{'='*60}")
    print(f"STEP {step_id}: {eval_start.date()} to {eval_end.date()}")
    print(f"{'='*60}")
    
    # Partition data (zero-leakage)
    train_df, tuning_df, eval_df, train_team_stats = partition_data(
        df, team_stats, eval_start, eval_end, config
    )
    
    print(f"  Training matches: {len(train_df)}")
    print(f"  Tuning matches: {len(tuning_df)}")
    print(f"  Evaluation matches: {len(eval_df)}")
    
    if len(eval_df) == 0:
        print(f"  ⚠️  No evaluation matches, skipping")
        return None
    
    # Calculate league average goals
    league_avg_goals = train_df[['home_goals', 'away_goals']].values.flatten().mean()
    print(f"  League avg goals: {league_avg_goals:.2f}")
    
    # Calculate team ratings (with zero-leakage season filter)
    training_seasons = list(train_df['season'].unique())
    team_ratings = calculate_team_ratings(
        train_df,
        train_team_stats,
        league_avg_goals,
        allowed_seasons=training_seasons
    )
    print(f"  Team ratings: {len(team_ratings)} teams")
    
    # Verify zero-leakage
    eval_seasons = set(eval_df['season'].unique())
    training_seasons_set = set(training_seasons)
    eval_only_seasons = eval_seasons - training_seasons_set
    
    seasons_used = set()
    for team, stats in team_ratings.items():
        if 'seasons' in stats:
            seasons_used.update(stats['seasons'])
    
    if any(s in eval_only_seasons for s in seasons_used if s != 'DEFAULT'):
        raise ValueError(f"LEAKAGE DETECTED: Eval-only seasons {eval_only_seasons} used in ratings")
    
    print(f"  ✓ Zero-leakage verified")
    
    # Calibrate Dixon-Coles
    dc_params = calibrate_dixon_coles(train_df, team_ratings, league_avg_goals, verbose=False)
    print(f"  Dixon-Coles: home_adv={dc_params['home_advantage']:.3f}")
    
    # Generate predictions for EVALUATION matches
    eval_results_for_pred = eval_df.copy()
    eval_results_for_pred['home_full'] = eval_results_for_pred['home']
    eval_results_for_pred['away_full'] = eval_results_for_pred['away']
    eval_results_for_pred['home'] = eval_results_for_pred['home_normalized']
    eval_results_for_pred['away'] = eval_results_for_pred['away_normalized']
    
    eval_preds = generate_predictions(eval_results_for_pred, team_ratings, dc_params)
    
    # Merge predictions back with eval data (preserve original columns)
    eval_with_preds = eval_df.merge(
        eval_preds[['home', 'away', 'predicted_btts_prob', 'lambda_home', 'lambda_away']],
        left_on=['home_normalized', 'away_normalized'],
        right_on=['home', 'away'],
        how='left',
        suffixes=('', '_pred')
    )
    
    # Drop duplicate columns from merge
    eval_with_preds = eval_with_preds.drop(['home_pred', 'away_pred'], axis=1, errors='ignore')
    
    # Compute edges for BOTH YES and NO
    eval_with_preds['p_model_yes'] = eval_with_preds['predicted_btts_prob']
    eval_with_preds['p_model_no'] = 1.0 - eval_with_preds['p_model_yes']
    
    # Market probabilities (Shin-adjusted)
    eval_with_preds['p_market_yes'] = eval_with_preds['btts_yes_odds'].apply(
        lambda x: shin_implied_prob(x, 1.0 / x) if pd.notna(x) and x > 0 else np.nan
    )
    eval_with_preds['p_market_no'] = eval_with_preds['btts_no_odds'].apply(
        lambda x: shin_implied_prob(x, 1.0 / x) if pd.notna(x) and x > 0 else np.nan
    )
    
    # Edges
    eval_with_preds['edge_yes'] = eval_with_preds['p_model_yes'] - eval_with_preds['p_market_yes']
    eval_with_preds['edge_no'] = eval_with_preds['p_model_no'] - eval_with_preds['p_market_no']
    
    # Add step metadata
    eval_with_preds['step_id'] = step_id
    eval_with_preds['eval_start'] = eval_start
    eval_with_preds['eval_end'] = eval_end
    
    # Rename btts to actual_btts for clarity
    if 'btts' in eval_with_preds.columns:
        eval_with_preds['actual_btts'] = eval_with_preds['btts']
    
    print(f"  ✓ Computed edges for {len(eval_with_preds)} matches")
    print(f"    Avg edge YES: {eval_with_preds['edge_yes'].mean():.4f}")
    print(f"    Avg edge NO: {eval_with_preds['edge_no'].mean():.4f}")
    
    return eval_with_preds


def compute_full_edge_universe(df, team_stats, config):
    """
    Compute edge universe for ALL walk-forward steps
    """
    print("\n" + "="*60)
    print("COMPUTING FULL EDGE UNIVERSE")
    print("="*60)
    
    schedule = get_walkforward_schedule(df, config)
    print(f"\n✓ Schedule: {len(schedule)} evaluation windows")
    print(f"  First: {schedule[0]['eval_start'].date()} to {schedule[0]['eval_end'].date()}")
    print(f"  Last: {schedule[-1]['eval_start'].date()} to {schedule[-1]['eval_end'].date()}")
    
    all_edges = []
    
    for step_info in schedule:
        edge_df = compute_edge_universe_for_step(step_info, df, team_stats, config)
        if edge_df is not None:
            all_edges.append(edge_df)
    
    # Combine all steps
    edge_universe = pd.concat(all_edges, ignore_index=True)
    
    print(f"\n{'='*60}")
    print("EDGE UNIVERSE COMPLETE")
    print(f"{'='*60}")
    print(f"Total matches: {len(edge_universe)}")
    print(f"Date range: {edge_universe['date'].min().date()} to {edge_universe['date'].max().date()}")
    print(f"Avg edge YES: {edge_universe['edge_yes'].mean():.4f}")
    print(f"Avg edge NO: {edge_universe['edge_no'].mean():.4f}")
    
    return edge_universe


def simulate_edge_portfolios(edge_universe):
    """
    Simulate "bet every edge" portfolios for different thresholds
    """
    print(f"\n{'='*60}")
    print("SIMULATING EDGE PORTFOLIOS")
    print(f"{'='*60}")
    
    portfolios = []
    
    for threshold in EDGE_THRESHOLDS:
        # BTTS YES portfolio
        yes_bets = edge_universe[edge_universe['edge_yes'] >= threshold].copy()
        if len(yes_bets) > 0:
            yes_bets['profit'] = yes_bets.apply(
                lambda row: (row['btts_yes_odds'] - 1) if row['actual_btts'] == 1 else -1,
                axis=1
            )
            yes_total_profit = yes_bets['profit'].sum()
            yes_roi = yes_total_profit / len(yes_bets) if len(yes_bets) > 0 else 0
            yes_win_rate = (yes_bets['actual_btts'] == 1).mean()
            
            portfolios.append({
                'threshold': threshold,
                'side': 'YES',
                'bets': len(yes_bets),
                'total_profit': yes_total_profit,
                'roi': yes_roi,
                'win_rate': yes_win_rate,
                'avg_odds': yes_bets['btts_yes_odds'].mean(),
                'avg_edge': yes_bets['edge_yes'].mean()
            })
            
            print(f"  Edge ≥ {threshold:.0%} YES: {len(yes_bets)} bets, ROI={yes_roi:.2%}")
        
        # BTTS NO portfolio
        no_bets = edge_universe[edge_universe['edge_no'] >= threshold].copy()
        if len(no_bets) > 0:
            no_bets['profit'] = no_bets.apply(
                lambda row: (row['btts_no_odds'] - 1) if row['actual_btts'] == 0 else -1,
                axis=1
            )
            no_total_profit = no_bets['profit'].sum()
            no_roi = no_total_profit / len(no_bets) if len(no_bets) > 0 else 0
            no_win_rate = (no_bets['actual_btts'] == 0).mean()
            
            portfolios.append({
                'threshold': threshold,
                'side': 'NO',
                'bets': len(no_bets),
                'total_profit': no_total_profit,
                'roi': no_roi,
                'win_rate': no_win_rate,
                'avg_odds': no_bets['btts_no_odds'].mean(),
                'avg_edge': no_bets['edge_no'].mean()
            })
            
            print(f"  Edge ≥ {threshold:.0%} NO: {len(no_bets)} bets, ROI={no_roi:.2%}")
    
    return pd.DataFrame(portfolios)


def analyze_edge_buckets(edge_universe):
    """
    Compute ROI by edge magnitude buckets
    """
    print(f"\n{'='*60}")
    print("ANALYZING EDGE BUCKETS")
    print(f"{'='*60}")
    
    bucket_results = []
    
    for edge_min, edge_max, label in EDGE_BUCKETS:
        # YES bets in this edge bucket
        yes_mask = (edge_universe['edge_yes'] >= edge_min) & (edge_universe['edge_yes'] < edge_max)
        yes_bets = edge_universe[yes_mask].copy()
        
        if len(yes_bets) > 0:
            yes_bets['profit'] = yes_bets.apply(
                lambda row: (row['btts_yes_odds'] - 1) if row['actual_btts'] == 1 else -1,
                axis=1
            )
            
            bucket_results.append({
                'edge_bucket': label,
                'side': 'YES',
                'bets': len(yes_bets),
                'roi': yes_bets['profit'].sum() / len(yes_bets),
                'win_rate': (yes_bets['actual_btts'] == 1).mean(),
                'avg_odds': yes_bets['btts_yes_odds'].mean(),
                'avg_edge': yes_bets['edge_yes'].mean()
            })
        
        # NO bets in this edge bucket
        no_mask = (edge_universe['edge_no'] >= edge_min) & (edge_universe['edge_no'] < edge_max)
        no_bets = edge_universe[no_mask].copy()
        
        if len(no_bets) > 0:
            no_bets['profit'] = no_bets.apply(
                lambda row: (row['btts_no_odds'] - 1) if row['actual_btts'] == 0 else -1,
                axis=1
            )
            
            bucket_results.append({
                'edge_bucket': label,
                'side': 'NO',
                'bets': len(no_bets),
                'roi': no_bets['profit'].sum() / len(no_bets),
                'win_rate': (no_bets['actual_btts'] == 0).mean(),
                'avg_odds': no_bets['btts_no_odds'].mean(),
                'avg_edge': no_bets['edge_no'].mean()
            })
    
    buckets_df = pd.DataFrame(bucket_results)
    
    # Print summary
    for side in ['YES', 'NO']:
        print(f"\n  BTTS {side}:")
        side_buckets = buckets_df[buckets_df['side'] == side]
        for _, row in side_buckets.iterrows():
            print(f"    {row['edge_bucket']}: {row['bets']} bets, ROI={row['roi']:.2%}")
    
    return buckets_df


def analyze_probability_buckets(edge_universe, min_edge=0.02):
    """
    Compute ROI by model probability buckets (filtered by min edge)
    """
    print(f"\n{'='*60}")
    print(f"ANALYZING PROBABILITY BUCKETS (Edge ≥ {min_edge:.0%})")
    print(f"{'='*60}")
    
    bucket_results = []
    
    for prob_min, prob_max, label in PROB_BUCKETS:
        # YES bets
        yes_mask = (
            (edge_universe['p_model_yes'] >= prob_min) &
            (edge_universe['p_model_yes'] < prob_max) &
            (edge_universe['edge_yes'] >= min_edge)
        )
        yes_bets = edge_universe[yes_mask].copy()
        
        if len(yes_bets) > 0:
            yes_bets['profit'] = yes_bets.apply(
                lambda row: (row['btts_yes_odds'] - 1) if row['actual_btts'] == 1 else -1,
                axis=1
            )
            
            bucket_results.append({
                'prob_bucket': label,
                'side': 'YES',
                'bets': len(yes_bets),
                'roi': yes_bets['profit'].sum() / len(yes_bets),
                'win_rate': (yes_bets['actual_btts'] == 1).mean(),
                'avg_odds': yes_bets['btts_yes_odds'].mean(),
                'avg_edge': yes_bets['edge_yes'].mean(),
                'avg_prob': yes_bets['p_model_yes'].mean()
            })
        
        # NO bets (based on model NO probability = 1 - model YES)
        no_mask = (
            (edge_universe['p_model_no'] >= prob_min) &
            (edge_universe['p_model_no'] < prob_max) &
            (edge_universe['edge_no'] >= min_edge)
        )
        no_bets = edge_universe[no_mask].copy()
        
        if len(no_bets) > 0:
            no_bets['profit'] = no_bets.apply(
                lambda row: (row['btts_no_odds'] - 1) if row['actual_btts'] == 0 else -1,
                axis=1
            )
            
            bucket_results.append({
                'prob_bucket': label,
                'side': 'NO',
                'bets': len(no_bets),
                'roi': no_bets['profit'].sum() / len(no_bets),
                'win_rate': (no_bets['actual_btts'] == 0).mean(),
                'avg_odds': no_bets['btts_no_odds'].mean(),
                'avg_edge': no_bets['edge_no'].mean(),
                'avg_prob': no_bets['p_model_no'].mean()
            })
    
    prob_buckets_df = pd.DataFrame(bucket_results)
    
    # Print summary
    for side in ['YES', 'NO']:
        print(f"\n  BTTS {side}:")
        side_buckets = prob_buckets_df[prob_buckets_df['side'] == side]
        for _, row in side_buckets.iterrows():
            if row['bets'] >= 5:  # Only show buckets with meaningful sample
                print(f"    {row['prob_bucket']}: {row['bets']} bets, ROI={row['roi']:.2%}")
    
    return prob_buckets_df


def analyze_odds_buckets(edge_universe, min_edge=0.02):
    """
    Compute ROI by odds buckets (filtered by min edge)
    """
    print(f"\n{'='*60}")
    print(f"ANALYZING ODDS BUCKETS (Edge ≥ {min_edge:.0%})")
    print(f"{'='*60}")
    
    bucket_results = []
    
    for odds_min, odds_max, label in ODDS_BUCKETS:
        # YES bets
        yes_mask = (
            (edge_universe['btts_yes_odds'] >= odds_min) &
            (edge_universe['btts_yes_odds'] < odds_max) &
            (edge_universe['edge_yes'] >= min_edge)
        )
        yes_bets = edge_universe[yes_mask].copy()
        
        if len(yes_bets) > 0:
            yes_bets['profit'] = yes_bets.apply(
                lambda row: (row['btts_yes_odds'] - 1) if row['actual_btts'] == 1 else -1,
                axis=1
            )
            
            bucket_results.append({
                'odds_bucket': label,
                'side': 'YES',
                'bets': len(yes_bets),
                'roi': yes_bets['profit'].sum() / len(yes_bets),
                'win_rate': (yes_bets['actual_btts'] == 1).mean(),
                'avg_odds': yes_bets['btts_yes_odds'].mean(),
                'avg_edge': yes_bets['edge_yes'].mean()
            })
        
        # NO bets
        no_mask = (
            (edge_universe['btts_no_odds'] >= odds_min) &
            (edge_universe['btts_no_odds'] < odds_max) &
            (edge_universe['edge_no'] >= min_edge)
        )
        no_bets = edge_universe[no_mask].copy()
        
        if len(no_bets) > 0:
            no_bets['profit'] = no_bets.apply(
                lambda row: (row['btts_no_odds'] - 1) if row['actual_btts'] == 0 else -1,
                axis=1
            )
            
            bucket_results.append({
                'odds_bucket': label,
                'side': 'NO',
                'bets': len(no_bets),
                'roi': no_bets['profit'].sum() / len(no_bets),
                'win_rate': (no_bets['actual_btts'] == 0).mean(),
                'avg_odds': no_bets['btts_no_odds'].mean(),
                'avg_edge': no_bets['edge_no'].mean()
            })
    
    odds_buckets_df = pd.DataFrame(bucket_results)
    
    # Print summary
    for side in ['YES', 'NO']:
        print(f"\n  BTTS {side}:")
        side_buckets = odds_buckets_df[odds_buckets_df['side'] == side]
        for _, row in side_buckets.iterrows():
            if row['bets'] >= 5:
                print(f"    {row['odds_bucket']}: {row['bets']} bets, ROI={row['roi']:.2%}")
    
    return odds_buckets_df


def compare_to_profile_c(edge_universe, output_dir):
    """
    Compare edge universe to actual Profile C bets
    """
    print(f"\n{'='*60}")
    print("COMPARING TO PROFILE C BETS")
    print(f"{'='*60}")
    
    # Load actual Profile C bets
    bets_file = Path(output_dir) / 'profile_c_walkforward_bets.csv'
    if not bets_file.exists():
        print("  ⚠️  profile_c_walkforward_bets.csv not found, skipping comparison")
        return None
    
    profile_c_bets = pd.read_csv(bets_file)
    profile_c_bets['date'] = pd.to_datetime(profile_c_bets['date'])
    
    print(f"  Profile C bets: {len(profile_c_bets)}")
    print(f"  Edge universe: {len(edge_universe)} matches")
    
    # Tag edge universe with whether it was bet by Profile C
    edge_universe['profile_c_bet'] = False
    edge_universe['profile_c_bet_type'] = None
    
    for _, bet in profile_c_bets.iterrows():
        mask = (
            (edge_universe['date'] == bet['date']) &
            (edge_universe['home'] == bet['home']) &
            (edge_universe['away'] == bet['away'])
        )
        edge_universe.loc[mask, 'profile_c_bet'] = True
        edge_universe.loc[mask, 'profile_c_bet_type'] = bet['bet_type']
    
    # Analyze what Profile C bet vs didn't bet
    profile_c_yes = edge_universe[edge_universe['profile_c_bet_type'] == 'BTTS_YES']
    profile_c_no = edge_universe[edge_universe['profile_c_bet_type'] == 'BTTS_NO']
    not_bet = edge_universe[edge_universe['profile_c_bet'] == False]
    
    print(f"\n  Profile C YES bets: {len(profile_c_yes)}")
    if len(profile_c_yes) > 0:
        print(f"    Avg edge: {profile_c_yes['edge_yes'].mean():.4f}")
        print(f"    Avg model prob: {profile_c_yes['p_model_yes'].mean():.3f}")
    
    print(f"\n  Profile C NO bets: {len(profile_c_no)}")
    if len(profile_c_no) > 0:
        print(f"    Avg edge: {profile_c_no['edge_no'].mean():.4f}")
        print(f"    Avg model prob (NO): {profile_c_no['p_model_no'].mean():.3f}")
    
    print(f"\n  Matches NOT bet: {len(not_bet)}")
    
    # Find profitable edges NOT bet by Profile C
    not_bet_yes_positive = not_bet[not_bet['edge_yes'] >= 0.05].copy()
    not_bet_no_positive = not_bet[not_bet['edge_no'] >= 0.05].copy()
    
    if len(not_bet_yes_positive) > 0:
        not_bet_yes_positive['profit'] = not_bet_yes_positive.apply(
            lambda row: (row['btts_yes_odds'] - 1) if row['actual_btts'] == 1 else -1,
            axis=1
        )
        missed_yes_roi = not_bet_yes_positive['profit'].sum() / len(not_bet_yes_positive)
        print(f"\n  Missed YES opportunities (edge ≥ 5%): {len(not_bet_yes_positive)}")
        print(f"    Would have made: {not_bet_yes_positive['profit'].sum():.2f} units")
        print(f"    ROI: {missed_yes_roi:.2%}")
    
    if len(not_bet_no_positive) > 0:
        not_bet_no_positive['profit'] = not_bet_no_positive.apply(
            lambda row: (row['btts_no_odds'] - 1) if row['actual_btts'] == 0 else -1,
            axis=1
        )
        missed_no_roi = not_bet_no_positive['profit'].sum() / len(not_bet_no_positive)
        print(f"\n  Missed NO opportunities (edge ≥ 5%): {len(not_bet_no_positive)}")
        print(f"    Would have made: {not_bet_no_positive['profit'].sum():.2f} units")
        print(f"    ROI: {missed_no_roi:.2%}")
    
    comparison = {
        'profile_c_bets': len(profile_c_bets),
        'total_matches': len(edge_universe),
        'missed_yes_5pct': len(not_bet_yes_positive) if len(not_bet_yes_positive) > 0 else 0,
        'missed_yes_profit': not_bet_yes_positive['profit'].sum() if len(not_bet_yes_positive) > 0 else 0,
        'missed_no_5pct': len(not_bet_no_positive) if len(not_bet_no_positive) > 0 else 0,
        'missed_no_profit': not_bet_no_positive['profit'].sum() if len(not_bet_no_positive) > 0 else 0
    }
    
    return comparison


def generate_summary_report(edge_universe, portfolios_df, edge_buckets_df, 
                            prob_buckets_df, odds_buckets_df, comparison, output_dir):
    """
    Generate comprehensive markdown summary report
    """
    print(f"\n{'='*60}")
    print("GENERATING SUMMARY REPORT")
    print(f"{'='*60}")
    
    report = []
    report.append("# EPL Profile C - Edge Explorer Analysis\n")
    report.append(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    report.append("**Mode:** Analysis Only (No Behavior Changes)\n\n")
    
    report.append("---\n\n")
    report.append("## 🎯 Executive Summary\n\n")
    report.append("This analysis explores ALL edges in the walk-forward evaluation windows to answer:\n\n")
    report.append("1. **Are we leaving money on the table?**\n")
    report.append("2. **Are small edges profitable or noise?**\n")
    report.append("3. **Does the model have broad predictive value?**\n")
    report.append("4. **Where are the true profitable regions?**\n\n")
    
    # Overview statistics
    report.append("### Dataset Overview\n\n")
    report.append(f"- **Total matches analyzed:** {len(edge_universe)}\n")
    report.append(f"- **Date range:** {edge_universe['date'].min().date()} to {edge_universe['date'].max().date()}\n")
    report.append(f"- **Evaluation steps:** {edge_universe['step_id'].nunique()}\n")
    report.append(f"- **Average edge (YES):** {edge_universe['edge_yes'].mean():.2%}\n")
    report.append(f"- **Average edge (NO):** {edge_universe['edge_no'].mean():.2%}\n\n")
    
    # Question 1: Leaving money on the table?
    report.append("---\n\n")
    report.append("## 💰 Question 1: Are We Leaving Money on the Table?\n\n")
    
    if comparison:
        report.append(f"**Profile C placed {comparison['profile_c_bets']} bets** out of {comparison['total_matches']} possible matches.\n\n")
        
        if comparison['missed_yes_5pct'] > 0 or comparison['missed_no_5pct'] > 0:
            report.append("### Missed Opportunities (Edge ≥ 5%)\n\n")
            
            if comparison['missed_yes_5pct'] > 0:
                report.append(f"**BTTS YES:**\n")
                report.append(f"- Missed bets: **{comparison['missed_yes_5pct']}**\n")
                report.append(f"- Potential profit: **{comparison['missed_yes_profit']:.2f} units**\n")
                report.append(f"- ROI: **{(comparison['missed_yes_profit']/comparison['missed_yes_5pct']):.2%}**\n\n")
            
            if comparison['missed_no_5pct'] > 0:
                report.append(f"**BTTS NO:**\n")
                report.append(f"- Missed bets: **{comparison['missed_no_5pct']}**\n")
                report.append(f"- Potential profit: **{comparison['missed_no_profit']:.2f} units**\n")
                report.append(f"- ROI: **{(comparison['missed_no_profit']/comparison['missed_no_5pct']):.2%}**\n\n")
            
            total_missed = comparison['missed_yes_5pct'] + comparison['missed_no_5pct']
            total_missed_profit = comparison['missed_yes_profit'] + comparison['missed_no_profit']
            
            if total_missed > 0:
                report.append(f"**Total missed profit:** {total_missed_profit:.2f} units from {total_missed} edges\n\n")
                
                if total_missed_profit > 5:
                    report.append("### ⚠️ VERDICT: YES, Leaving Significant Money on the Table\n\n")
                    report.append(f"Relaxing edge threshold from 5% to include edges ≥5% would capture {total_missed} additional bets ")
                    report.append(f"worth {total_missed_profit:.2f} units ({(total_missed_profit/total_missed):.2%} ROI).\n\n")
                elif total_missed_profit > 0:
                    report.append("### ✅ VERDICT: Minor Opportunity Cost\n\n")
                    report.append(f"There are {total_missed} missed edges ≥5%, but aggregate profit is modest ({total_missed_profit:.2f} units). ")
                    report.append("Current Profile C config is reasonably capturing the main opportunities.\n\n")
                else:
                    report.append("### ✅ VERDICT: Not Leaving Money on Table\n\n")
                    report.append("Missed edges ≥5% were actually unprofitable in aggregate. Current filters are appropriate.\n\n")
        else:
            report.append("### ✅ VERDICT: Profile C Captures All Significant Edges\n\n")
            report.append("No profitable edges ≥5% were excluded. Current band selection is optimal.\n\n")
    else:
        report.append("*Comparison to Profile C bets not available*\n\n")
    
    # Question 2: Small edges profitable?
    report.append("---\n\n")
    report.append("## 📊 Question 2: Are Small Edges Profitable or Noise?\n\n")
    report.append("### ROI by Edge Magnitude\n\n")
    
    report.append("#### BTTS YES\n\n")
    report.append("| Edge Bucket | Bets | ROI | Win Rate | Avg Odds | Avg Edge |\n")
    report.append("|-------------|------|-----|----------|----------|----------|\n")
    
    yes_buckets = edge_buckets_df[edge_buckets_df['side'] == 'YES'].sort_values('avg_edge')
    for _, row in yes_buckets.iterrows():
        report.append(f"| {row['edge_bucket']} | {row['bets']} | {row['roi']:.2%} | {row['win_rate']:.1%} | {row['avg_odds']:.2f} | {row['avg_edge']:.2%} |\n")
    
    report.append("\n#### BTTS NO\n\n")
    report.append("| Edge Bucket | Bets | ROI | Win Rate | Avg Odds | Avg Edge |\n")
    report.append("|-------------|------|-----|----------|----------|----------|\n")
    
    no_buckets = edge_buckets_df[edge_buckets_df['side'] == 'NO'].sort_values('avg_edge')
    for _, row in no_buckets.iterrows():
        report.append(f"| {row['edge_bucket']} | {row['bets']} | {row['roi']:.2%} | {row['win_rate']:.1%} | {row['avg_odds']:.2f} | {row['avg_edge']:.2%} |\n")
    
    # Analyze small edge profitability
    report.append("\n### Analysis\n\n")
    
    small_edges_yes = edge_buckets_df[(edge_buckets_df['side'] == 'YES') & (edge_buckets_df['avg_edge'] < 0.05)]
    small_edges_no = edge_buckets_df[(edge_buckets_df['side'] == 'NO') & (edge_buckets_df['avg_edge'] < 0.05)]
    
    if len(small_edges_yes) > 0:
        avg_roi_small_yes = small_edges_yes['roi'].mean()
        report.append(f"**BTTS YES edges <5%:** Average ROI = {avg_roi_small_yes:.2%}\n")
    
    if len(small_edges_no) > 0:
        avg_roi_small_no = small_edges_no['roi'].mean()
        report.append(f"**BTTS NO edges <5%:** Average ROI = {avg_roi_small_no:.2%}\n\n")
    
    # Check if ROI increases with edge
    yes_sorted = edge_buckets_df[edge_buckets_df['side'] == 'YES'].sort_values('avg_edge')
    no_sorted = edge_buckets_df[edge_buckets_df['side'] == 'NO'].sort_values('avg_edge')
    
    yes_correlation = yes_sorted['avg_edge'].corr(yes_sorted['roi']) if len(yes_sorted) > 2 else 0
    no_correlation = no_sorted['avg_edge'].corr(no_sorted['roi']) if len(no_sorted) > 2 else 0
    
    report.append(f"**Edge-ROI correlation (YES):** {yes_correlation:.3f}\n")
    report.append(f"**Edge-ROI correlation (NO):** {no_correlation:.3f}\n\n")
    
    if yes_correlation > 0.5 or no_correlation > 0.5:
        report.append("### ✅ VERDICT: ROI Increases with Edge Magnitude\n\n")
        report.append("Higher edges consistently produce higher ROI. The model's edge calculations are meaningful.\n\n")
    elif yes_correlation > 0.2 or no_correlation > 0.2:
        report.append("### ⚠️ VERDICT: Weak Edge-ROI Relationship\n\n")
        report.append("ROI shows some increase with edge magnitude, but relationship is noisy. ")
        report.append("Small edges may contain signal but require larger samples.\n\n")
    else:
        report.append("### ❌ VERDICT: Small Edges Are Noise\n\n")
        report.append("No clear relationship between edge magnitude and ROI. ")
        report.append("Recommend minimum edge threshold ≥5% to filter noise.\n\n")
    
    # Question 3: Broad predictive value?
    report.append("---\n\n")
    report.append("## 🌍 Question 3: Does the Model Have Broad Predictive Value?\n\n")
    report.append("### 'Bet Every Edge' Portfolio Performance\n\n")
    
    report.append("| Threshold | Side | Bets | Total Profit | ROI | Win Rate | Avg Odds |\n")
    report.append("|-----------|------|------|--------------|-----|----------|----------|\n")
    
    for _, row in portfolios_df.iterrows():
        report.append(f"| Edge ≥ {row['threshold']:.0%} | {row['side']} | {row['bets']} | {row['total_profit']:.2f} | {row['roi']:.2%} | {row['win_rate']:.1%} | {row['avg_odds']:.2f} |\n")
    
    # Analyze broad profitability
    report.append("\n### Analysis\n\n")
    
    bet_all_yes = portfolios_df[(portfolios_df['side'] == 'YES') & (portfolios_df['threshold'] == 0.0)]
    bet_all_no = portfolios_df[(portfolios_df['side'] == 'NO') & (portfolios_df['threshold'] == 0.0)]
    
    if len(bet_all_yes) > 0:
        yes_roi = bet_all_yes.iloc[0]['roi']
        report.append(f"**Bet ALL YES edges:** {bet_all_yes.iloc[0]['bets']} bets, ROI = {yes_roi:.2%}\n")
    
    if len(bet_all_no) > 0:
        no_roi = bet_all_no.iloc[0]['roi']
        report.append(f"**Bet ALL NO edges:** {bet_all_no.iloc[0]['bets']} bets, ROI = {no_roi:.2%}\n\n")
    
    # Check if any threshold is profitable
    profitable_portfolios = portfolios_df[portfolios_df['roi'] > 0.02]
    
    if len(profitable_portfolios) > 0:
        report.append("### ✅ VERDICT: Model Has Predictive Value\n\n")
        report.append(f"**{len(profitable_portfolios)} portfolios** show ROI >2%:\n\n")
        for _, row in profitable_portfolios.iterrows():
            report.append(f"- Edge ≥ {row['threshold']:.0%} {row['side']}: {row['roi']:.2%} ROI ({row['bets']} bets)\n")
        report.append("\nThe model successfully identifies profitable betting opportunities. ")
        report.append("Edge filtering improves ROI, suggesting selective betting is optimal.\n\n")
    else:
        report.append("### ⚠️ VERDICT: Limited Broad Value\n\n")
        report.append("No 'bet every edge' portfolio exceeds 2% ROI. ")
        report.append("Model requires careful band selection and edge filtering for profitability.\n\n")
    
    # Question 4: True profitable regions
    report.append("---\n\n")
    report.append("## 🎯 Question 4: Where Are the True Profitable Regions?\n\n")
    
    report.append("### By Model Probability (Edge ≥ 2%)\n\n")
    
    report.append("#### BTTS YES\n\n")
    report.append("| Probability | Bets | ROI | Win Rate | Avg Odds | Avg Edge |\n")
    report.append("|-------------|------|-----|----------|----------|----------|\n")
    
    yes_prob = prob_buckets_df[(prob_buckets_df['side'] == 'YES') & (prob_buckets_df['bets'] >= 5)]
    for _, row in yes_prob.iterrows():
        report.append(f"| {row['prob_bucket']} | {row['bets']} | {row['roi']:.2%} | {row['win_rate']:.1%} | {row['avg_odds']:.2f} | {row['avg_edge']:.2%} |\n")
    
    report.append("\n#### BTTS NO\n\n")
    report.append("| Probability | Bets | ROI | Win Rate | Avg Odds | Avg Edge |\n")
    report.append("|-------------|------|-----|----------|----------|----------|\n")
    
    no_prob = prob_buckets_df[(prob_buckets_df['side'] == 'NO') & (prob_buckets_df['bets'] >= 5)]
    for _, row in no_prob.iterrows():
        report.append(f"| {row['prob_bucket']} | {row['bets']} | {row['roi']:.2%} | {row['win_rate']:.1%} | {row['avg_odds']:.2f} | {row['avg_edge']:.2%} |\n")
    
    report.append("\n### By Odds Range (Edge ≥ 2%)\n\n")
    
    report.append("#### BTTS YES\n\n")
    report.append("| Odds Range | Bets | ROI | Win Rate | Avg Edge |\n")
    report.append("|------------|------|-----|----------|----------|\n")
    
    yes_odds = odds_buckets_df[(odds_buckets_df['side'] == 'YES') & (odds_buckets_df['bets'] >= 5)]
    for _, row in yes_odds.iterrows():
        report.append(f"| {row['odds_bucket']} | {row['bets']} | {row['roi']:.2%} | {row['win_rate']:.1%} | {row['avg_edge']:.2%} |\n")
    
    report.append("\n#### BTTS NO\n\n")
    report.append("| Odds Range | Bets | ROI | Win Rate | Avg Edge |\n")
    report.append("|------------|------|-----|----------|----------|\n")
    
    no_odds = odds_buckets_df[(odds_buckets_df['side'] == 'NO') & (odds_buckets_df['bets'] >= 5)]
    for _, row in no_odds.iterrows():
        report.append(f"| {row['odds_bucket']} | {row['bets']} | {row['roi']:.2%} | {row['win_rate']:.1%} | {row['avg_edge']:.2%} |\n")
    
    # Identify best regions
    report.append("\n### 🏆 Best Performing Regions\n\n")
    
    # Best probability regions
    best_yes_prob = prob_buckets_df[(prob_buckets_df['side'] == 'YES') & (prob_buckets_df['bets'] >= 5)].nlargest(3, 'roi')
    best_no_prob = prob_buckets_df[(prob_buckets_df['side'] == 'NO') & (prob_buckets_df['bets'] >= 5)].nlargest(3, 'roi')
    
    if len(best_yes_prob) > 0:
        report.append("**BTTS YES - Top Probability Ranges:**\n\n")
        for _, row in best_yes_prob.iterrows():
            report.append(f"- **{row['prob_bucket']}**: {row['roi']:.2%} ROI ({row['bets']} bets, {row['win_rate']:.1%} win rate)\n")
        report.append("\n")
    
    if len(best_no_prob) > 0:
        report.append("**BTTS NO - Top Probability Ranges:**\n\n")
        for _, row in best_no_prob.iterrows():
            report.append(f"- **{row['prob_bucket']}**: {row['roi']:.2%} ROI ({row['bets']} bets, {row['win_rate']:.1%} win rate)\n")
        report.append("\n")
    
    # Best odds regions
    best_yes_odds = odds_buckets_df[(odds_buckets_df['side'] == 'YES') & (odds_buckets_df['bets'] >= 5)].nlargest(3, 'roi')
    best_no_odds = odds_buckets_df[(odds_buckets_df['side'] == 'NO') & (odds_buckets_df['bets'] >= 5)].nlargest(3, 'roi')
    
    if len(best_yes_odds) > 0:
        report.append("**BTTS YES - Top Odds Ranges:**\n\n")
        for _, row in best_yes_odds.iterrows():
            report.append(f"- **{row['odds_bucket']}**: {row['roi']:.2%} ROI ({row['bets']} bets)\n")
        report.append("\n")
    
    if len(best_no_odds) > 0:
        report.append("**BTTS NO - Top Odds Ranges:**\n\n")
        for _, row in best_no_odds.iterrows():
            report.append(f"- **{row['odds_bucket']}**: {row['roi']:.2%} ROI ({row['bets']} bets)\n")
        report.append("\n")
    
    # Final recommendations
    report.append("---\n\n")
    report.append("## 📝 Key Takeaways\n\n")
    
    # Synthesize findings
    if comparison and (comparison['missed_yes_profit'] + comparison['missed_no_profit']) > 5:
        report.append(f"1. **Money Left on Table:** YES - {comparison['missed_yes_5pct'] + comparison['missed_no_5pct']} missed edges ≥5% ")
        report.append(f"worth {comparison['missed_yes_profit'] + comparison['missed_no_profit']:.2f} units\n")
    else:
        report.append("1. **Money Left on Table:** NO - Current Profile C captures main opportunities\n")
    
    # Small edges verdict
    small_edge_profitable = False
    if len(small_edges_yes) > 0 and small_edges_yes['roi'].mean() > 0.02:
        small_edge_profitable = True
    if len(small_edges_no) > 0 and small_edges_no['roi'].mean() > 0.02:
        small_edge_profitable = True
    
    if small_edge_profitable:
        report.append("2. **Small Edges:** PROFITABLE - Edges 2-5% show positive ROI\n")
    else:
        report.append("2. **Small Edges:** NOISE - Recommend minimum 5% edge threshold\n")
    
    # Broad value verdict
    broad_profitable = len(profitable_portfolios) > 0
    if broad_profitable:
        report.append("3. **Model Predictive Value:** HIGH - Multiple edge thresholds show >2% ROI\n")
    else:
        report.append("3. **Model Predictive Value:** SELECTIVE - Requires careful band selection\n")
    
    # Best regions
    if len(best_no_prob) > 0:
        top_region = best_no_prob.iloc[0]
        report.append(f"4. **Top Region:** BTTS NO {top_region['prob_bucket']} ({top_region['roi']:.2%} ROI, {top_region['bets']} bets)\n")
    
    report.append("\n---\n\n")
    report.append("**End of Edge Explorer Analysis**\n\n")
    report.append("*Generated by analyze_epl_profile_c_edges.py*\n")
    report.append("*Analysis mode only - no Profile C behavior changes*\n")
    
    # Write report
    output_file = Path(output_dir) / 'profile_c_edge_explorer_summary.md'
    with open(output_file, 'w') as f:
        f.writelines(report)
    
    print(f"✓ Summary report saved to {output_file}")


def main():
    """
    Main analysis pipeline
    """
    print("\n" + "="*60)
    print("EPL PROFILE C - EDGE EXPLORER ANALYSIS")
    print("="*60)
    print("Mode: Analysis Only (No Behavior Changes)")
    print()
    
    output_dir = ANALYSIS_CONFIG['output_dir']
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # Load data (same sources as walk-forward)
    print("Loading data...")
    results, team_stats, odds = load_epl_data('/Users/brentgoldman/Desktop/REPO33/data/premier_league')
    print(f"✓ Results: {len(results)} matches")
    print(f"✓ Team stats: {len(team_stats)} team-seasons")
    print(f"✓ Odds: {len(odds)} matches")
    
    # Prepare combined dataset
    print("\nPreparing walk-forward dataset...")
    df = prepare_walkforward_data(results, odds)
    print(f"✓ Combined: {len(df)} matches with odds")
    
    # Compute full edge universe
    edge_universe = compute_full_edge_universe(df, team_stats, ANALYSIS_CONFIG)
    
    # Save edge universe
    edge_file = Path(output_dir) / 'profile_c_edge_universe_walkforward.csv'
    edge_universe.to_csv(edge_file, index=False)
    print(f"\n✓ Saved edge universe to {edge_file}")
    
    # Simulate edge portfolios
    portfolios_df = simulate_edge_portfolios(edge_universe)
    portfolios_file = Path(output_dir) / 'profile_c_edge_portfolios.csv'
    portfolios_df.to_csv(portfolios_file, index=False)
    print(f"✓ Saved portfolios to {portfolios_file}")
    
    # Analyze edge buckets
    edge_buckets_df = analyze_edge_buckets(edge_universe)
    
    # Analyze probability buckets
    prob_buckets_df = analyze_probability_buckets(edge_universe, min_edge=0.02)
    
    # Analyze odds buckets
    odds_buckets_df = analyze_odds_buckets(edge_universe, min_edge=0.02)
    
    # Combine all buckets
    all_buckets = pd.concat([
        edge_buckets_df.assign(bucket_type='edge'),
        prob_buckets_df.assign(bucket_type='probability'),
        odds_buckets_df.assign(bucket_type='odds')
    ], ignore_index=True)
    
    buckets_file = Path(output_dir) / 'profile_c_edge_buckets.csv'
    all_buckets.to_csv(buckets_file, index=False)
    print(f"✓ Saved buckets to {buckets_file}")
    
    # Compare to Profile C
    comparison = compare_to_profile_c(edge_universe, output_dir)
    
    # Generate summary report
    generate_summary_report(
        edge_universe, portfolios_df, edge_buckets_df,
        prob_buckets_df, odds_buckets_df, comparison, output_dir
    )
    
    print("\n" + "="*60)
    print("✓ EDGE EXPLORER ANALYSIS COMPLETE")
    print("="*60)
    print(f"\nReview: {output_dir}profile_c_edge_explorer_summary.md")
    print()


if __name__ == '__main__':
    main()
