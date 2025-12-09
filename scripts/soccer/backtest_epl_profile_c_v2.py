#!/usr/bin/env python3
"""
Backtest EPL BTTS predictions using corrected Football-Data.co.uk CSV data
Training period: 2021-22 through Dec 7, 2025
Goal: Find TRUE profitable probability bands with accurate team form data

This creates Profile C v2 - a corrected model that doesn't overwrite existing Profile C

Output:
    - data/premier-league/profile_c_v2/
        - profitable_bands.csv
        - backtest_results.csv
        - roi_by_probability.png
        - profile_c_v2_config.json
"""

import pandas as pd
import numpy as np
import requests
from pathlib import Path
import json
from scipy.optimize import minimize
from scipy.stats import poisson
import matplotlib.pyplot as plt
from datetime import datetime

# Configuration
SEASONS = ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26']
CSV_BASE_URL = 'https://www.football-data.co.uk/mmz4281/{season_code}/E0.csv'
OUTPUT_DIR = Path('data/premier-league/profile_c_v2')
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Season code mapping (YY format for Football-Data.co.uk)
SEASON_CODES = {
    '2021-22': '2122',
    '2022-23': '2223',
    '2023-24': '2324',
    '2024-25': '2425',
    '2025-26': '2526'
}

def fetch_season_data(season):
    """Fetch match results from Football-Data.co.uk CSV"""
    season_code = SEASON_CODES[season]
    url = CSV_BASE_URL.format(season_code=season_code)
    
    print(f"Fetching {season} from {url}")
    
    try:
        df = pd.read_csv(url)
        
        # Keep only completed matches (have full-time results)
        df = df[df['FTHG'].notna() & df['FTAG'].notna()].copy()
        
        # Convert to datetime
        df['Date'] = pd.to_datetime(df['Date'], format='%d/%m/%Y', errors='coerce')
        
        # Filter out matches after Dec 7, 2025 if it's current season
        if season == '2025-26':
            cutoff = pd.Timestamp('2025-12-07')
            df = df[df['Date'] <= cutoff]
        
        # Calculate BTTS
        df['BTTS'] = ((df['FTHG'] > 0) & (df['FTAG'] > 0)).astype(int)
        
        # Add season column
        df['Season'] = season
        
        print(f"  ✓ Loaded {len(df)} matches from {season}")
        return df[['Date', 'Season', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG', 'BTTS']]
        
    except Exception as e:
        print(f"  ✗ Error fetching {season}: {e}")
        return pd.DataFrame()

def calculate_team_form(matches_df, as_of_date, lookback_games=10):
    """
    Calculate rolling team form (attack/defense strength) as of a specific date
    Uses only matches BEFORE as_of_date to avoid lookahead bias
    """
    # Get historical matches before this date
    historical = matches_df[matches_df['Date'] < as_of_date].copy()
    
    if len(historical) < 20:  # Need minimum data
        return {}
    
    # Calculate league averages
    league_avg_goals = (historical['FTHG'].sum() + historical['FTAG'].sum()) / (len(historical) * 2)
    
    team_stats = {}
    teams = set(historical['HomeTeam'].unique()) | set(historical['AwayTeam'].unique())
    
    for team in teams:
        # Get team's recent home games
        home_games = historical[historical['HomeTeam'] == team].tail(lookback_games)
        # Get team's recent away games
        away_games = historical[historical['AwayTeam'] == team].tail(lookback_games)
        
        if len(home_games) + len(away_games) < 5:  # Need minimum games
            continue
        
        # Calculate attack/defense rates
        home_goals_for = home_games['FTHG'].sum()
        home_goals_against = home_games['FTAG'].sum()
        away_goals_for = away_games['FTAG'].sum()
        away_goals_against = away_games['FTHAG'].sum() if 'FTHAG' in away_games.columns else away_games['FTHG'].sum()
        
        total_games = len(home_games) + len(away_games)
        
        # Goals per game
        goals_for_pg = (home_goals_for + away_goals_for) / max(total_games, 1)
        goals_against_pg = (home_goals_against + away_goals_against) / max(total_games, 1)
        
        # Strength relative to league average (1.0 = average)
        attack_strength = goals_for_pg / league_avg_goals if league_avg_goals > 0 else 1.0
        defense_strength = league_avg_goals / goals_against_pg if goals_against_pg > 0 else 1.0
        
        # Cap between 0.5 and 2.0
        attack_strength = max(0.5, min(2.0, attack_strength))
        defense_strength = max(0.5, min(2.0, defense_strength))
        
        team_stats[team] = {
            'attack': attack_strength,
            'defense': defense_strength,
            'goals_for_pg': goals_for_pg,
            'goals_against_pg': goals_against_pg
        }
    
    return team_stats

def dixon_coles_btts_probability(home_attack, home_defense, away_attack, away_defense, 
                                   home_advantage=0.3, rho=0.06):
    """
    Calculate BTTS probability using Dixon-Coles model
    """
    # Expected goals
    lambda_home = np.exp(home_advantage) * home_attack * away_defense
    lambda_away = away_attack * home_defense
    
    # Cap lambdas
    lambda_home = max(0.3, min(4.0, lambda_home))
    lambda_away = max(0.3, min(4.0, lambda_away))
    
    # P(Home scores 0)
    p_home_zero = poisson.pmf(0, lambda_home)
    
    # P(Away scores 0)
    p_away_zero = poisson.pmf(0, lambda_away)
    
    # P(Both score 0) with correlation
    p_both_zero = p_home_zero * p_away_zero * (1 + rho)
    
    # P(BTTS) = 1 - P(Home=0 or Away=0)
    # = 1 - [P(Home=0) + P(Away=0) - P(Both=0)]
    p_btts = 1 - (p_home_zero + p_away_zero - p_both_zero)
    
    # Clamp to [0, 1]
    return max(0.0, min(1.0, p_btts))

def run_backtest(matches_df, lookback_games=10):
    """
    Run walk-forward backtest generating predictions for each match
    Uses only data available BEFORE each match (no lookahead bias)
    """
    results = []
    
    # Sort by date
    matches_df = matches_df.sort_values('Date').reset_index(drop=True)
    
    print(f"\nRunning backtest on {len(matches_df)} matches...")
    
    for idx, match in matches_df.iterrows():
        if idx % 100 == 0:
            print(f"  Processing match {idx}/{len(matches_df)}")
        
        match_date = match['Date']
        home_team = match['HomeTeam']
        away_team = match['AwayTeam']
        actual_btts = match['BTTS']
        
        # Calculate form using only data BEFORE this match
        team_form = calculate_team_form(matches_df, match_date, lookback_games)
        
        # Skip if we don't have form data for both teams
        if home_team not in team_form or away_team not in team_form:
            continue
        
        # Get team strengths
        home_stats = team_form[home_team]
        away_stats = team_form[away_team]
        
        # Calculate BTTS probability
        prob_btts = dixon_coles_btts_probability(
            home_attack=home_stats['attack'],
            home_defense=home_stats['defense'],
            away_attack=away_stats['attack'],
            away_defense=away_stats['defense']
        )
        
        # Apply league prior (15% shrinkage toward EPL BTTS rate ~0.52)
        prob_calibrated = 0.85 * prob_btts + 0.15 * 0.52
        
        results.append({
            'Date': match_date,
            'Season': match['Season'],
            'HomeTeam': home_team,
            'AwayTeam': away_team,
            'HomeGoals': match['FTHG'],
            'AwayGoals': match['FTAG'],
            'ActualBTTS': actual_btts,
            'PredictedProb': prob_calibrated,
            'HomeAttack': home_stats['attack'],
            'HomeDefense': home_stats['defense'],
            'AwayAttack': away_stats['attack'],
            'AwayDefense': away_stats['defense']
        })
    
    return pd.DataFrame(results)

def analyze_profitable_bands(results_df, prob_buckets=20):
    """
    Analyze ROI by probability bucket to find profitable bands
    Assumes flat odds of 1.88 for simplicity (or could integrate real odds)
    """
    # Create probability bins
    results_df['ProbBucket'] = pd.cut(
        results_df['PredictedProb'], 
        bins=prob_buckets,
        labels=False
    )
    
    bands = []
    
    for bucket in range(prob_buckets):
        bucket_data = results_df[results_df['ProbBucket'] == bucket]
        
        if len(bucket_data) == 0:
            continue
        
        min_prob = bucket_data['PredictedProb'].min()
        max_prob = bucket_data['PredictedProb'].max()
        avg_prob = bucket_data['PredictedProb'].mean()
        
        num_bets = len(bucket_data)
        num_wins = bucket_data['ActualBTTS'].sum()
        win_rate = num_wins / num_bets if num_bets > 0 else 0
        
        # Assume flat odds for BTTS YES = 1.88 (common)
        assumed_odds = 1.88
        
        # Calculate ROI
        # Stake: num_bets units
        # Returns: num_wins * assumed_odds
        # Profit: returns - stake
        # ROI: profit / stake
        stake = num_bets
        returns = num_wins * assumed_odds
        profit = returns - stake
        roi = (profit / stake * 100) if stake > 0 else 0
        
        bands.append({
            'min_prob': min_prob,
            'max_prob': max_prob,
            'avg_prob': avg_prob,
            'bets': num_bets,
            'wins': num_wins,
            'win_rate': win_rate,
            'roi': roi,
            'profit': profit
        })
    
    return pd.DataFrame(bands).sort_values('min_prob')

def find_best_band(bands_df, min_roi=5.0, min_bets=30):
    """Find the most profitable probability band"""
    # Filter bands with sufficient sample size and positive ROI
    viable_bands = bands_df[
        (bands_df['roi'] > min_roi) & 
        (bands_df['bets'] >= min_bets)
    ].copy()
    
    if len(viable_bands) == 0:
        print("⚠️ No profitable bands found with ROI > 5% and 30+ bets")
        return None
    
    # Find band with highest ROI * sqrt(bets) (balance ROI and sample size)
    viable_bands['score'] = viable_bands['roi'] * np.sqrt(viable_bands['bets'])
    best = viable_bands.loc[viable_bands['score'].idxmax()]
    
    return {
        'min_prob': best['min_prob'],
        'max_prob': best['max_prob'],
        'avg_prob': best['avg_prob'],
        'roi': best['roi'],
        'win_rate': best['win_rate'],
        'num_bets': int(best['bets']),
        'num_wins': int(best['wins']),
        'profit': best['profit']
    }

def visualize_results(results_df, bands_df):
    """Create visualization of backtest results"""
    fig, axes = plt.subplots(2, 2, figsize=(15, 12))
    
    # 1. ROI by Probability Band
    ax = axes[0, 0]
    viable = bands_df[bands_df['bets'] > 10]
    bars = ax.bar(viable['avg_prob'], viable['roi'], width=0.03, alpha=0.7)
    for i, bar in enumerate(bars):
        if viable.iloc[i]['roi'] > 5:
            bar.set_color('green')
        elif viable.iloc[i]['roi'] > 0:
            bar.set_color('lightblue')
        else:
            bar.set_color('red')
    ax.axhline(y=0, color='black', linestyle='--', linewidth=1)
    ax.set_xlabel('Predicted Probability')
    ax.set_ylabel('ROI (%)')
    ax.set_title('ROI by Probability Band (>10 bets)')
    ax.grid(True, alpha=0.3)
    
    # 2. Calibration Plot
    ax = axes[0, 1]
    calibration_bins = pd.cut(results_df['PredictedProb'], bins=10)
    calibration = results_df.groupby(calibration_bins).agg({
        'PredictedProb': 'mean',
        'ActualBTTS': 'mean'
    }).dropna()
    ax.scatter(calibration['PredictedProb'], calibration['ActualBTTS'], s=100, alpha=0.6)
    ax.plot([0, 1], [0, 1], 'r--', label='Perfect Calibration')
    ax.set_xlabel('Predicted Probability')
    ax.set_ylabel('Actual BTTS Rate')
    ax.set_title('Calibration Plot')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    # 3. Cumulative Profit by Probability Threshold
    ax = axes[1, 0]
    thresholds = np.arange(0.45, 0.75, 0.01)
    profits = []
    for thresh in thresholds:
        bets = results_df[results_df['PredictedProb'] >= thresh]
        if len(bets) > 0:
            wins = bets['ActualBTTS'].sum()
            profit = wins * 1.88 - len(bets)
            profits.append(profit)
        else:
            profits.append(0)
    ax.plot(thresholds, profits, linewidth=2)
    ax.axhline(y=0, color='black', linestyle='--', linewidth=1)
    ax.set_xlabel('Minimum Probability Threshold')
    ax.set_ylabel('Total Profit (units)')
    ax.set_title('Profit by Probability Threshold')
    ax.grid(True, alpha=0.3)
    
    # 4. Number of Bets by Probability Band
    ax = axes[1, 1]
    ax.bar(viable['avg_prob'], viable['bets'], width=0.03, alpha=0.7, color='steelblue')
    ax.set_xlabel('Predicted Probability')
    ax.set_ylabel('Number of Bets')
    ax.set_title('Sample Size by Probability Band')
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    output_path = OUTPUT_DIR / 'roi_by_probability.png'
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    print(f"\n✓ Saved visualization to {output_path}")

def main():
    print("=" * 70)
    print("EPL BTTS Profile C v2 Backtest")
    print("Using corrected Football-Data.co.uk CSV data")
    print("=" * 70)
    
    # Step 1: Fetch all season data
    print("\n1. Fetching match data...")
    all_matches = []
    for season in SEASONS:
        season_df = fetch_season_data(season)
        if len(season_df) > 0:
            all_matches.append(season_df)
    
    if len(all_matches) == 0:
        print("❌ No data fetched. Exiting.")
        return
    
    matches_df = pd.concat(all_matches, ignore_index=True)
    print(f"\n✓ Total matches: {len(matches_df)}")
    print(f"  Date range: {matches_df['Date'].min()} to {matches_df['Date'].max()}")
    print(f"  Overall BTTS rate: {matches_df['BTTS'].mean():.1%}")
    
    # Step 2: Run backtest
    print("\n2. Running walk-forward backtest...")
    results_df = run_backtest(matches_df, lookback_games=10)
    
    if len(results_df) == 0:
        print("❌ No predictions generated. Exiting.")
        return
    
    print(f"\n✓ Generated {len(results_df)} predictions")
    
    # Save raw results
    results_path = OUTPUT_DIR / 'backtest_results.csv'
    results_df.to_csv(results_path, index=False)
    print(f"✓ Saved results to {results_path}")
    
    # Step 3: Analyze profitable bands
    print("\n3. Analyzing profitable probability bands...")
    bands_df = analyze_profitable_bands(results_df, prob_buckets=30)
    
    bands_path = OUTPUT_DIR / 'profitable_bands.csv'
    bands_df.to_csv(bands_path, index=False)
    print(f"✓ Saved bands analysis to {bands_path}")
    
    # Step 4: Find best band
    print("\n4. Finding optimal profitable band...")
    best_band = find_best_band(bands_df, min_roi=5.0, min_bets=30)
    
    if best_band:
        print("\n" + "=" * 70)
        print("OPTIMAL PROFITABLE BAND (Profile C v2)")
        print("=" * 70)
        print(f"Probability Range: {best_band['min_prob']:.3f} to {best_band['max_prob']:.3f}")
        print(f"Average Probability: {best_band['avg_prob']:.3f}")
        print(f"ROI: {best_band['roi']:.1f}%")
        print(f"Win Rate: {best_band['win_rate']:.1%}")
        print(f"Sample Size: {best_band['num_bets']} bets ({best_band['num_wins']} wins)")
        print(f"Total Profit: {best_band['profit']:.1f} units")
        print("=" * 70)
        
        # Save config
        config = {
            'version': 'v2',
            'created': datetime.now().isoformat(),
            'training_period': {
                'start': str(matches_df['Date'].min()),
                'end': str(matches_df['Date'].max()),
                'num_matches': len(matches_df)
            },
            'profitable_band': best_band,
            'league_prior': 0.52,
            'shrinkage': 0.15,
            'notes': 'Trained with corrected Football-Data.co.uk CSV data (no TheSportsDB API issues)'
        }
        
        config_path = OUTPUT_DIR / 'profile_c_v2_config.json'
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        print(f"\n✓ Saved config to {config_path}")
    else:
        print("\n⚠️ No profitable band found meeting criteria (ROI>5%, 30+ bets)")
        print("Consider lowering thresholds or expanding training data")
    
    # Step 5: Create visualizations
    print("\n5. Creating visualizations...")
    visualize_results(results_df, bands_df)
    
    # Step 6: Summary statistics
    print("\n" + "=" * 70)
    print("BACKTEST SUMMARY")
    print("=" * 70)
    print(f"Total Predictions: {len(results_df)}")
    print(f"Actual BTTS Rate: {results_df['ActualBTTS'].mean():.1%}")
    print(f"Average Predicted Prob: {results_df['PredictedProb'].mean():.1%}")
    
    # Brier score (lower is better, 0 = perfect)
    brier = ((results_df['PredictedProb'] - results_df['ActualBTTS']) ** 2).mean()
    print(f"Brier Score: {brier:.4f}")
    
    # Log loss (lower is better)
    epsilon = 1e-15
    preds = results_df['PredictedProb'].clip(epsilon, 1 - epsilon)
    log_loss = -(results_df['ActualBTTS'] * np.log(preds) + 
                  (1 - results_df['ActualBTTS']) * np.log(1 - preds)).mean()
    print(f"Log Loss: {log_loss:.4f}")
    
    print("\n✓ Backtest complete!")
    print(f"\nResults saved to: {OUTPUT_DIR}")

if __name__ == '__main__':
    main()
