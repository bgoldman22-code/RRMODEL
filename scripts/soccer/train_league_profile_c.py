#!/usr/bin/env python3
"""
Train Dixon-Coles + Profile C models for Bundesliga and Serie A
Each league gets its own independent model with separate parameters

Usage:
    python scripts/soccer/train_league_profile_c.py

Requirements:
    - Historical results CSV (from fetch_all_leagues.py)
    - Team stats CSV (from fetch_all_leagues.py)  
    - Closing odds CSV (user-provided)

Output:
    - data/{league}/dixon_coles_params.json
    - data/{league}/profitable_bands.csv
    - data/{league}/profile_c_config.json
    - data/{league}/backtest_report.md
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path
from scipy.optimize import minimize
from scipy.stats import poisson
import matplotlib.pyplot as plt
from datetime import datetime

# League configurations
LEAGUES = {
    'bundesliga': {
        'name': 'German Bundesliga',
        'output_dir': 'data/bundesliga/',
        'expected_btts_rate': 0.58,
        'expected_goals_per_game': 3.2,
        'training_seasons': ['2020-21', '2021-22', '2022-23'],
        'validation_season': '2023-24'
    },
    'serie_a': {
        'name': 'Italian Serie A',
        'output_dir': 'data/serie_a/',
        'expected_btts_rate': 0.50,
        'expected_goals_per_game': 2.7,
        'training_seasons': ['2020-21', '2021-22', '2022-23'],
        'validation_season': '2023-24'
    }
}

def load_league_data(league_key):
    """Load all data files for a league"""
    config = LEAGUES[league_key]
    data_dir = Path(config['output_dir'])
    
    print(f"\n{'='*60}")
    print(f"Loading {config['name']} data...")
    print(f"{'='*60}")
    
    # Load results
    results_path = data_dir / 'historical_results.csv'
    if not results_path.exists():
        raise FileNotFoundError(f"Missing {results_path}")
    results = pd.read_csv(results_path)
    results['date'] = pd.to_datetime(results['date'])
    print(f"✓ Loaded {len(results)} matches")
    
    # Load team stats
    stats_path = data_dir / 'team_stats_by_season.csv'
    if not stats_path.exists():
        raise FileNotFoundError(f"Missing {stats_path}")
    team_stats = pd.read_csv(stats_path)
    print(f"✓ Loaded stats for {len(team_stats)} team-seasons")
    
    # Load closing odds (optional for now)
    odds_path = data_dir / 'closing_odds_by_match.csv'
    if odds_path.exists():
        odds = pd.read_csv(odds_path)
        odds['date'] = pd.to_datetime(odds['date'])
        print(f"✓ Loaded odds for {len(odds)} matches")
    else:
        print(f"⚠ No closing odds found at {odds_path}")
        print(f"  Will create placeholder odds for testing")
        odds = None
    
    return results, team_stats, odds

def split_train_validation(results, training_seasons, validation_season):
    """Split data into training and validation sets"""
    train = results[results['season'].isin(training_seasons)].copy()
    val = results[results['season'] == validation_season].copy()
    
    print(f"\nTrain: {len(train)} matches ({', '.join(training_seasons)})")
    print(f"Validation: {len(val)} matches ({validation_season})")
    
    return train, val

def calculate_team_ratings(results_df, team_stats_df, league_avg_goals):
    """
    Calculate attack and defense ratings for each team
    Uses log-linear model: log(λ) = baseline + attack - defense
    """
    ratings = {}
    
    teams = pd.concat([results_df['home'], results_df['away']]).unique()
    
    for team in teams:
        # Get team stats (use most recent season available)
        team_data = team_stats_df[team_stats_df['team'] == team]
        
        if len(team_data) > 0:
            recent = team_data.iloc[-1]  # Most recent season
            
            # Attack rating (log scale relative to league average)
            goals_per_game = recent['goals_for_per_game']
            attack_rating = np.log(max(0.1, goals_per_game)) - np.log(league_avg_goals / 2)
            
            # Defense rating (INVERTED: good defense = positive rating)
            goals_against_per_game = recent['goals_against_per_game']
            defense_rating = np.log(league_avg_goals / 2) - np.log(max(0.1, goals_against_per_game))
            
            ratings[team] = {
                'attack': attack_rating,
                'defense': defense_rating,
                'games': recent['games']
            }
        else:
            # Default ratings for missing teams
            ratings[team] = {
                'attack': 0.0,
                'defense': 0.0,
                'games': 10
            }
    
    return ratings

def dixon_coles_log_likelihood(params, results_df, team_ratings):
    """
    Dixon-Coles negative log-likelihood
    params = [home_advantage, tau_00, tau_10, tau_01, tau_11]
    """
    home_adv, tau_00, tau_10, tau_01, tau_11 = params
    
    log_likelihood = 0
    
    for _, match in results_df.iterrows():
        home = match['home']
        away = match['away']
        home_score = match['home_score']
        away_score = match['away_score']
        
        # Get team ratings
        home_attack = team_ratings[home]['attack']
        home_defense = team_ratings[home]['defense']
        away_attack = team_ratings[away]['attack']
        away_defense = team_ratings[away]['defense']
        
        # Calculate expected goals (Poisson intensities)
        lambda_home = np.exp(home_adv + home_attack - away_defense)
        lambda_away = np.exp(away_attack - home_defense)
        
        # Base Poisson probabilities
        prob_home = poisson.pmf(home_score, lambda_home)
        prob_away = poisson.pmf(away_score, lambda_away)
        
        # Dixon-Coles adjustment for low scores
        tau_factor = 1.0
        if home_score == 0 and away_score == 0:
            tau_factor = 1 + tau_00
        elif home_score == 1 and away_score == 0:
            tau_factor = 1 + tau_10
        elif home_score == 0 and away_score == 1:
            tau_factor = 1 + tau_01
        elif home_score == 1 and away_score == 1:
            tau_factor = 1 + tau_11
        
        # Combined probability
        prob = prob_home * prob_away * tau_factor
        
        # Add to log likelihood (with small epsilon to avoid log(0))
        log_likelihood += np.log(max(prob, 1e-10))
    
    return -log_likelihood  # Return negative for minimization

def calibrate_dixon_coles(results_df, team_ratings, league_avg_goals):
    """
    Calibrate Dixon-Coles parameters using maximum likelihood estimation
    """
    print("\nCalibrating Dixon-Coles parameters...")
    
    # Initial guess: [home_advantage, tau_00, tau_10, tau_01, tau_11]
    initial_params = [0.10, -0.15, -0.08, -0.08, 0.03]
    
    # Optimize
    result = minimize(
        dixon_coles_log_likelihood,
        initial_params,
        args=(results_df, team_ratings),
        method='BFGS',
        options={'disp': True, 'maxiter': 100}
    )
    
    if result.success:
        home_adv, tau_00, tau_10, tau_01, tau_11 = result.x
        
        print("\n✓ Calibration successful!")
        print(f"  Home advantage: {home_adv:.4f}")
        print(f"  tau_00: {tau_00:.4f}")
        print(f"  tau_10: {tau_10:.4f}")
        print(f"  tau_01: {tau_01:.4f}")
        print(f"  tau_11: {tau_11:.4f}")
        
        return {
            'home_advantage': float(home_adv),
            'tau_00': float(tau_00),
            'tau_10': float(tau_10),
            'tau_01': float(tau_01),
            'tau_11': float(tau_11),
            'league_avg_goals': league_avg_goals,
            'calibrated_on': datetime.now().isoformat()
        }
    else:
        print("\n✗ Calibration failed, using defaults")
        return {
            'home_advantage': 0.10,
            'tau_00': -0.15,
            'tau_10': -0.08,
            'tau_01': -0.08,
            'tau_11': 0.03,
            'league_avg_goals': league_avg_goals,
            'calibrated_on': datetime.now().isoformat()
        }

def calculate_btts_probability(lambda_home, lambda_away, dc_params):
    """
    Calculate BTTS probability using Dixon-Coles adjusted Poisson
    """
    # P(home > 0)
    prob_home_scores = 1 - poisson.pmf(0, lambda_home)
    
    # P(away > 0)  
    prob_away_scores = 1 - poisson.pmf(0, lambda_away)
    
    # Base: Independent Poisson
    prob_btts = prob_home_scores * prob_away_scores
    
    # Dixon-Coles adjustment for 0-0 (both teams scoreless)
    tau_00 = dc_params['tau_00']
    prob_00_base = poisson.pmf(0, lambda_home) * poisson.pmf(0, lambda_away)
    prob_00_adjusted = prob_00_base * (1 + tau_00)
    
    # Adjust BTTS: subtract extra 0-0 probability added by correlation
    btts_adjusted = prob_btts + (prob_00_base - prob_00_adjusted)
    
    return max(0.01, min(0.99, btts_adjusted))

def generate_predictions(results_df, team_ratings, dc_params):
    """
    Generate BTTS predictions for all matches
    """
    predictions = []
    
    for _, match in results_df.iterrows():
        home = match['home']
        away = match['away']
        
        # Calculate expected goals
        home_attack = team_ratings[home]['attack']
        home_defense = team_ratings[home]['defense']
        away_attack = team_ratings[away]['attack']
        away_defense = team_ratings[away]['defense']
        
        lambda_home = np.exp(dc_params['home_advantage'] + home_attack - away_defense)
        lambda_away = np.exp(away_attack - home_defense)
        
        # Calculate BTTS probability
        btts_prob = calculate_btts_probability(lambda_home, lambda_away, dc_params)
        
        predictions.append({
            'date': match['date'],
            'home': home,
            'away': away,
            'season': match['season'],
            'actual_btts': match['btts'],
            'predicted_btts_prob': btts_prob,
            'lambda_home': lambda_home,
            'lambda_away': lambda_away,
            'actual_home_score': match['home_score'],
            'actual_away_score': match['away_score']
        })
    
    return pd.DataFrame(predictions)

def create_placeholder_odds(predictions_df):
    """
    Create placeholder odds based on predicted probabilities
    (Used when real odds unavailable)
    """
    print("\n⚠ Creating placeholder odds (20% vig assumed)")
    
    odds = []
    for _, row in predictions_df.iterrows():
        # Add 20% vig (10% per side)
        prob_yes = row['predicted_btts_prob']
        prob_no = 1 - prob_yes
        
        # Overround = 1.10 (10% vig)
        btts_yes_odds = 1.10 / prob_yes
        btts_no_odds = 1.10 / prob_no
        
        odds.append({
            'date': row['date'],
            'home': row['home'],
            'away': row['away'],
            'btts_yes_close': btts_yes_odds,
            'btts_no_close': btts_no_odds,
            'bookmaker': 'PLACEHOLDER'
        })
    
    return pd.DataFrame(odds)

def shin_implied_prob(yes_odds, no_odds):
    """
    Calculate fair probability using Shin method (removes vig)
    """
    p_yes_book = 1 / yes_odds
    p_no_book = 1 / no_odds
    overround = p_yes_book + p_no_book
    
    # Shin method (approximation)
    fair_yes = p_yes_book / overround
    
    return fair_yes

def find_profitable_bands(predictions_df, odds_df):
    """
    Find profitable probability windows for betting
    """
    print("\nFinding profitable bands...")
    
    # Merge predictions with odds
    df = predictions_df.merge(
        odds_df,
        on=['date', 'home', 'away'],
        how='left'
    )
    
    # Drop rows without odds
    df = df.dropna(subset=['btts_yes_close', 'btts_no_close'])
    
    if len(df) == 0:
        print("✗ No matches with odds data")
        return pd.DataFrame()
    
    # Calculate market probability (Shin method)
    df['market_prob_yes'] = df.apply(
        lambda row: shin_implied_prob(row['btts_yes_close'], row['btts_no_close']),
        axis=1
    )
    
    # Calculate edge
    df['edge_yes'] = df['predicted_btts_prob'] - df['market_prob_yes']
    
    # Bin by model probability (5% buckets)
    bins = np.arange(0, 1.05, 0.05)
    df['prob_bin'] = pd.cut(df['predicted_btts_prob'], bins=bins)
    
    # Calculate ROI per bin
    roi_by_bin = []
    
    for bin_label, group in df.groupby('prob_bin'):
        bets = len(group)
        wins = group['actual_btts'].sum()
        
        # Calculate profit betting YES
        profit = 0
        for _, row in group.iterrows():
            if row['actual_btts'] == 1:
                profit += (row['btts_yes_close'] - 1)  # Win
            else:
                profit -= 1  # Loss
        
        roi = (profit / bets) * 100 if bets > 0 else 0
        hit_rate = (wins / bets) * 100 if bets > 0 else 0
        
        roi_by_bin.append({
            'bin': str(bin_label),
            'min_prob': bin_label.left,
            'max_prob': bin_label.right,
            'bets': bets,
            'wins': wins,
            'hit_rate': hit_rate,
            'roi': roi,
            'avg_edge': group['edge_yes'].mean(),
            'avg_odds': group['btts_yes_close'].mean()
        })
    
    roi_df = pd.DataFrame(roi_by_bin)
    
    # Find profitable bands (ROI > 5%, bets > 15)
    profitable = roi_df[(roi_df['roi'] > 5) & (roi_df['bets'] > 15)]
    
    print(f"\n✓ Found {len(profitable)} profitable bands (ROI > 5%, min 15 bets)")
    if len(profitable) > 0:
        print("\nProfitable Bands:")
        print(profitable.to_string(index=False))
    
    return roi_df

def create_profile_c_config(profitable_bands_df, league_config):
    """
    Create Profile C configuration from profitable bands
    """
    if len(profitable_bands_df) == 0:
        print("\n✗ No profitable bands found, using defaults")
        return {
            'league': league_config['name'],
            'profitable_band': {
                'min_prob': 0.55,
                'max_prob': 0.70
            },
            'gates': {
                'min_edge': 0.05,
                'max_ev_cap': 0.20,
                'kelly_fraction': 0.25,
                'max_stake': 0.03
            },
            'backtest_performance': {
                'roi': 0.0,
                'hit_rate': 0.0,
                'sample_size': 0
            }
        }
    
    # Find best band (highest ROI with sufficient sample)
    best_band = profitable_bands_df[
        (profitable_bands_df['roi'] > 5) & 
        (profitable_bands_df['bets'] > 15)
    ].sort_values('roi', ascending=False)
    
    if len(best_band) > 0:
        best = best_band.iloc[0]
        
        return {
            'league': league_config['name'],
            'profitable_band': {
                'min_prob': float(best['min_prob']),
                'max_prob': float(best['max_prob'])
            },
            'gates': {
                'min_edge': 0.05,
                'max_ev_cap': 0.20,
                'kelly_fraction': 0.25,
                'max_stake': 0.03
            },
            'backtest_performance': {
                'roi': float(best['roi']),
                'hit_rate': float(best['hit_rate']),
                'sample_size': int(best['bets']),
                'avg_edge': float(best['avg_edge'])
            }
        }
    else:
        print("\n⚠ No bands meet criteria, using defaults")
        return create_profile_c_config(pd.DataFrame(), league_config)

def visualize_results(predictions_df, profitable_bands_df, league_key):
    """
    Create visualization of backtest results
    """
    config = LEAGUES[league_key]
    output_dir = Path(config['output_dir'])
    
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle(f"{config['name']} - Backtest Results", fontsize=16)
    
    # Plot 1: Calibration curve
    ax = axes[0, 0]
    bins = np.arange(0, 1.05, 0.10)
    predictions_df['prob_bin_plot'] = pd.cut(predictions_df['predicted_btts_prob'], bins=bins)
    calibration = predictions_df.groupby('prob_bin_plot').agg({
        'predicted_btts_prob': 'mean',
        'actual_btts': 'mean'
    }).dropna()
    
    ax.scatter(calibration['predicted_btts_prob'], calibration['actual_btts'], s=100, alpha=0.6)
    ax.plot([0, 1], [0, 1], 'r--', label='Perfect calibration')
    ax.set_xlabel('Predicted Probability')
    ax.set_ylabel('Actual Rate')
    ax.set_title('Calibration Curve')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    # Plot 2: ROI by probability band
    ax = axes[0, 1]
    if len(profitable_bands_df) > 0:
        profitable_bands_df_plot = profitable_bands_df[profitable_bands_df['bets'] > 0]
        ax.bar(profitable_bands_df_plot['min_prob'], profitable_bands_df_plot['roi'], 
               width=0.05, alpha=0.7, edgecolor='black')
        ax.axhline(y=0, color='red', linestyle='--', label='Break-even')
        ax.axhline(y=5, color='green', linestyle='--', label='5% ROI target')
        ax.set_xlabel('Model Probability (BTTS YES)')
        ax.set_ylabel('ROI (%)')
        ax.set_title('ROI by Probability Band')
        ax.legend()
        ax.grid(True, alpha=0.3)
    
    # Plot 3: Prediction distribution
    ax = axes[1, 0]
    ax.hist(predictions_df['predicted_btts_prob'], bins=20, alpha=0.7, edgecolor='black')
    ax.axvline(x=config['expected_btts_rate'], color='red', linestyle='--', 
               label=f"Expected: {config['expected_btts_rate']:.0%}")
    ax.set_xlabel('Predicted BTTS Probability')
    ax.set_ylabel('Frequency')
    ax.set_title('Prediction Distribution')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    # Plot 4: Actual vs Predicted goals
    ax = axes[1, 1]
    ax.scatter(predictions_df['lambda_home'], predictions_df['actual_home_score'], 
               alpha=0.3, label='Home')
    ax.scatter(predictions_df['lambda_away'], predictions_df['actual_away_score'], 
               alpha=0.3, label='Away')
    ax.plot([0, 4], [0, 4], 'r--', label='Perfect prediction')
    ax.set_xlabel('Expected Goals (λ)')
    ax.set_ylabel('Actual Goals')
    ax.set_title('Goal Prediction Accuracy')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plot_path = output_dir / 'backtest_visualizations.png'
    plt.savefig(plot_path, dpi=150, bbox_inches='tight')
    print(f"\n✓ Saved visualizations to: {plot_path}")
    plt.close()

def train_league(league_key):
    """
    Complete training pipeline for one league
    """
    config = LEAGUES[league_key]
    output_dir = Path(config['output_dir'])
    
    print(f"\n{'#'*60}")
    print(f"# TRAINING: {config['name'].upper()}")
    print(f"{'#'*60}")
    
    # Load data
    results, team_stats, odds = load_league_data(league_key)
    
    # Split train/validation
    train_results, val_results = split_train_validation(
        results,
        config['training_seasons'],
        config['validation_season']
    )
    
    # Calculate team ratings
    print("\nCalculating team ratings...")
    team_ratings = calculate_team_ratings(
        train_results,
        team_stats,
        config['expected_goals_per_game']
    )
    print(f"✓ Calculated ratings for {len(team_ratings)} teams")
    
    # Calibrate Dixon-Coles
    dc_params = calibrate_dixon_coles(
        train_results,
        team_ratings,
        config['expected_goals_per_game']
    )
    
    # Save Dixon-Coles params
    dc_path = output_dir / 'dixon_coles_params.json'
    with open(dc_path, 'w') as f:
        json.dump(dc_params, f, indent=2)
    print(f"\n✓ Saved Dixon-Coles params to: {dc_path}")
    
    # Generate predictions
    print("\nGenerating predictions on training data...")
    train_predictions = generate_predictions(train_results, team_ratings, dc_params)
    
    print("Generating predictions on validation data...")
    val_predictions = generate_predictions(val_results, team_ratings, dc_params)
    
    # Handle odds (use provided or create placeholder)
    if odds is not None:
        train_odds = odds[odds['date'].isin(train_predictions['date'])]
        val_odds = odds[odds['date'].isin(val_predictions['date'])]
    else:
        train_odds = create_placeholder_odds(train_predictions)
        val_odds = create_placeholder_odds(val_predictions)
    
    # Find profitable bands
    train_bands = find_profitable_bands(train_predictions, train_odds)
    
    # Save profitable bands
    if len(train_bands) > 0:
        bands_path = output_dir / 'profitable_bands.csv'
        train_bands.to_csv(bands_path, index=False)
        print(f"✓ Saved profitable bands to: {bands_path}")
    
    # Create Profile C config
    profile_c = create_profile_c_config(train_bands, config)
    
    # Save Profile C config
    pc_path = output_dir / 'profile_c_config.json'
    with open(pc_path, 'w') as f:
        json.dump(profile_c, f, indent=2)
    print(f"✓ Saved Profile C config to: {pc_path}")
    
    # Visualize results
    visualize_results(train_predictions, train_bands, league_key)
    
    # Validation performance
    print(f"\n{'='*60}")
    print("VALIDATION RESULTS:")
    print(f"{'='*60}")
    val_bands = find_profitable_bands(val_predictions, val_odds)
    
    return {
        'league': config['name'],
        'league_key': league_key,
        'train_matches': len(train_results),
        'val_matches': len(val_results),
        'backtest_roi': profile_c['backtest_performance']['roi'],
        'val_bands': val_bands
    }

def main():
    """
    Train models for all leagues
    """
    print("="*60)
    print("SOCCER LEAGUE PROFILE C TRAINER")
    print("="*60)
    print(f"Target leagues: {', '.join([LEAGUES[k]['name'] for k in LEAGUES.keys()])}")
    print("="*60)
    
    results = {}
    
    for league_key in LEAGUES.keys():
        try:
            league_results = train_league(league_key)
            results[league_key] = league_results
        except Exception as e:
            print(f"\n✗ ERROR training {league_key}: {str(e)}")
            import traceback
            traceback.print_exc()
            continue
    
    # Summary
    print("\n" + "="*60)
    print("TRAINING SUMMARY")
    print("="*60)
    
    for league_key, result in results.items():
        print(f"\n{result['league']}:")
        print(f"  Training: {result['train_matches']} matches")
        print(f"  Validation: {result['val_matches']} matches")
        print(f"  Backtest ROI: {result['backtest_roi']:.1f}%")
    
    print("\n" + "="*60)
    print("COMPLETE!")
    print("="*60)
    print("\nNext steps:")
    print("1. Review backtest visualizations in data/{league}/")
    print("2. If ROI > 15%, proceed to production deployment")
    print("3. Build league-specific Profile C modules for Netlify")
    print("="*60)

if __name__ == '__main__':
    main()
