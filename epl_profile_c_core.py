#!/usr/bin/env python3
"""
EPL Profile C Core Functions (Parameterized, Reusable)

This module contains all core functions for Dixon-Coles BTTS modeling, 
extracted from backtest_epl_profile_c_v2.py and made fully parameterized 
for use in both single-split and walk-forward backtests.

NO GLOBAL STATE: All functions take explicit parameters.
ZERO LEAKAGE: Caller controls which data is used for what purpose.

Functions:
- load_epl_data(): Load results, team_stats, odds
- normalize_team_name(): Consistent team name matching
- calculate_team_ratings(): Compute attack/defense ratings
- dixon_coles_log_likelihood(): DC objective function
- calibrate_dixon_coles(): MLE parameter estimation
- calculate_btts_probability(): BTTS prob from Poisson rates
- generate_predictions(): Generate BTTS predictions
- shin_implied_prob(): Remove vig from bookmaker odds
- find_profitable_bands(): Search for profitable probability windows
- evaluate_calibration(): Brier score, log loss, calibration plot
"""

import pandas as pd
import numpy as np
import re
from pathlib import Path
from scipy.optimize import minimize
from scipy.stats import poisson
from datetime import datetime
import sys

# Import canonical team name normalization
script_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(script_dir / 'scripts' / 'soccer'))
from team_name_utils import standardize_team_name

# Alias for backward compatibility
normalize_team_name = standardize_team_name

def load_epl_data(data_dir='data/premier_league/'):
    """
    Load all Premier League data files
    
    Args:
        data_dir: Path to data directory
        
    Returns:
        results_df: Match results with scores and BTTS
        team_stats_df: Season-level team statistics
        odds_df: BTTS odds from bookmakers
    """
    data_path = Path(data_dir)
    
    # Load results
    results_path = data_path / 'historical_results.csv'
    if not results_path.exists():
        raise FileNotFoundError(f"Missing {results_path}")
    results = pd.read_csv(results_path)
    results['date'] = pd.to_datetime(results['date'])
    
    # Normalize team names for matching with odds (using canonical function)
    results['home_normalized'] = results['home'].apply(standardize_team_name)
    results['away_normalized'] = results['away'].apply(standardize_team_name)
    
    # Load team stats
    stats_path = data_path / 'team_stats_by_season.csv'
    if not stats_path.exists():
        raise FileNotFoundError(f"Missing {stats_path}")
    team_stats = pd.read_csv(stats_path)
    
    # Normalize team names in stats for consistency
    team_stats['team_normalized'] = team_stats['team'].apply(standardize_team_name)
    
    # Load closing odds
    odds_path = data_path / 'historical_completed_with_odds.csv'
    if not odds_path.exists():
        raise FileNotFoundError(f"Missing {odds_path}")
    odds = pd.read_csv(odds_path)
    odds['date'] = pd.to_datetime(odds['date']).dt.tz_localize(None)
    
    # Normalize team names in odds (they should already be normalized, but ensure consistency)
    odds['home_normalized'] = odds['home'].apply(standardize_team_name)
    odds['away_normalized'] = odds['away'].apply(standardize_team_name)
    
    return results, team_stats, odds

def calculate_team_ratings(results_df, team_stats_df, league_avg_goals, 
                           allowed_seasons=None):
    """
    Calculate attack and defense ratings for each team
    Uses log-linear model: log(λ) = baseline + attack - defense
    
    Args:
        results_df: Match results (used to determine which teams to rate)
        team_stats_df: Season-level team statistics
        league_avg_goals: Average goals per team per match
        allowed_seasons: List of seasons to use from team_stats (for zero-leakage).
                        If None, uses all available seasons.
    
    Returns:
        dict: {team_name: {'attack': float, 'defense': float, 'games': int, 'season': str}}
    """
    ratings = {}
    
    # Filter team_stats to only allowed seasons (zero-leakage control)
    if allowed_seasons is not None:
        train_stats = team_stats_df[team_stats_df['season'].isin(allowed_seasons)].copy()
    else:
        train_stats = team_stats_df.copy()
    
    teams = pd.concat([results_df['home'], results_df['away']]).unique()
    
    for team in teams:
        # Get team stats (use most recent allowed season available)
        team_data = train_stats[train_stats['team'] == team]
        
        if len(team_data) > 0:
            # Use most recent season for this team
            recent = team_data.sort_values('season').iloc[-1]
            
            # Attack rating (log scale relative to league average)
            goals_per_game = recent['goals_for_per_game']
            attack_rating = np.log(max(0.1, goals_per_game)) - np.log(league_avg_goals / 2)
            
            # Defense rating (INVERTED: good defense = positive rating)
            goals_against_per_game = recent['goals_against_per_game']
            defense_rating = np.log(league_avg_goals / 2) - np.log(max(0.1, goals_against_per_game))
            
            ratings[team] = {
                'attack': attack_rating,
                'defense': defense_rating,
                'games': recent['games'],
                'season': recent['season']
            }
        else:
            # Default ratings for teams not in allowed seasons
            ratings[team] = {
                'attack': 0.0,
                'defense': 0.0,
                'games': 10,
                'season': 'DEFAULT'
            }
    
    return ratings

def dixon_coles_log_likelihood(params, results_df, team_ratings):
    """
    Dixon-Coles negative log-likelihood for minimization
    
    Args:
        params: [home_advantage, tau_00, tau_10, tau_01, tau_11]
        results_df: Match results with home/away/scores
        team_ratings: Dict of team ratings from calculate_team_ratings()
        
    Returns:
        float: Negative log-likelihood
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
    
    return -log_likelihood

def calibrate_dixon_coles(results_df, team_ratings, league_avg_goals, verbose=True):
    """
    Calibrate Dixon-Coles parameters using maximum likelihood estimation
    
    Args:
        results_df: Training match results
        team_ratings: Team ratings dict from calculate_team_ratings()
        league_avg_goals: Average goals per team per match
        verbose: Print optimization progress
        
    Returns:
        dict: Calibrated parameters
    """
    # Initial guess: [home_advantage, tau_00, tau_10, tau_01, tau_11]
    initial_params = [0.08, -0.15, -0.08, -0.08, 0.03]
    
    # Optimize
    result = minimize(
        dixon_coles_log_likelihood,
        initial_params,
        args=(results_df, team_ratings),
        method='BFGS',
        options={'disp': verbose, 'maxiter': 100}
    )
    
    if result.success:
        home_adv, tau_00, tau_10, tau_01, tau_11 = result.x
        
        return {
            'home_advantage': float(home_adv),
            'tau_00': float(tau_00),
            'tau_10': float(tau_10),
            'tau_01': float(tau_01),
            'tau_11': float(tau_11),
            'league_avg_goals': league_avg_goals,
            'calibrated_on': datetime.now().isoformat(),
            'success': True
        }
    else:
        # Return defaults if calibration fails
        return {
            'home_advantage': 0.08,
            'tau_00': -0.15,
            'tau_10': -0.08,
            'tau_01': -0.08,
            'tau_11': 0.03,
            'league_avg_goals': league_avg_goals,
            'calibrated_on': datetime.now().isoformat(),
            'success': False
        }

def calculate_btts_probability(lambda_home, lambda_away, dc_params):
    """
    Calculate BTTS probability using Dixon-Coles adjusted Poisson
    
    Args:
        lambda_home: Expected home goals
        lambda_away: Expected away goals
        dc_params: Dict with tau parameters
        
    Returns:
        float: BTTS probability [0, 1]
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
    
    Args:
        results_df: Match results to generate predictions for
        team_ratings: Team ratings dict from calculate_team_ratings()
        dc_params: Dixon-Coles parameters from calibrate_dixon_coles()
        
    Returns:
        DataFrame with predictions
    """
    predictions = []
    
    # Default ratings for teams not in training data
    default_rating = {'attack': 0.0, 'defense': 0.0, 'games': 10, 'season': 'DEFAULT'}
    
    for _, match in results_df.iterrows():
        home = match['home']
        away = match['away']
        
        # Get team ratings (use defaults if team not in training data)
        home_ratings = team_ratings.get(home, default_rating)
        away_ratings = team_ratings.get(away, default_rating)
        
        home_attack = home_ratings['attack']
        home_defense = home_ratings['defense']
        away_attack = away_ratings['attack']
        away_defense = away_ratings['defense']
        
        # Calculate expected goals
        lambda_home = np.exp(dc_params['home_advantage'] + home_attack - away_defense)
        lambda_away = np.exp(away_attack - home_defense)
        
        # Calculate BTTS probability
        btts_prob = calculate_btts_probability(lambda_home, lambda_away, dc_params)
        
        # Use normalized names for odds matching
        home_norm = match.get('home_normalized', normalize_team_name(home))
        away_norm = match.get('away_normalized', normalize_team_name(away))
        
        predictions.append({
            'date': match['date'],
            'home': home_norm,
            'away': away_norm,
            'home_full': home,
            'away_full': away,
            'season': match['season'],
            'actual_btts': match['btts'],
            'predicted_btts_prob': btts_prob,
            'lambda_home': lambda_home,
            'lambda_away': lambda_away,
            'actual_home_score': match['home_score'],
            'actual_away_score': match['away_score'],
            'home_has_training_data': home in team_ratings,
            'away_has_training_data': away in team_ratings
        })
    
    return pd.DataFrame(predictions)

def shin_implied_prob(yes_odds, no_odds):
    """
    Calculate fair probability using Shin method (removes vig)
    
    Args:
        yes_odds: BTTS YES decimal odds
        no_odds: BTTS NO decimal odds
        
    Returns:
        float: Fair BTTS YES probability
    """
    p_yes_book = 1 / yes_odds
    p_no_book = 1 / no_odds
    overround = p_yes_book + p_no_book
    
    # Shin method (approximation)
    fair_yes = p_yes_book / overround
    
    return fair_yes

def find_profitable_bands(predictions_df, odds_df, 
                          min_matches=20, prob_step=0.02, band_width=0.10):
    """
    Find profitable probability windows for betting BTTS YES and BTTS NO
    
    Args:
        predictions_df: Predictions with predicted_btts_prob
        odds_df: Odds with btts_yes_odds, btts_no_odds
        min_matches: Minimum matches required in a band
        prob_step: Step size for band search
        band_width: Width of each probability band
        
    Returns:
        DataFrame with all tested bands and their statistics
    """
    # Merge predictions with odds on home+away+season
    df = predictions_df.merge(
        odds_df,
        on=['home', 'away', 'season'],
        how='inner',
        suffixes=('_pred', '_odds')
    )
    
    if len(df) == 0:
        return pd.DataFrame()
    
    # Calculate market-implied probabilities (Shin method)
    df['market_btts_prob'] = df.apply(
        lambda row: shin_implied_prob(row['btts_yes_odds'], row['btts_no_odds']),
        axis=1
    )
    
    # Calculate edge
    df['edge_yes'] = df['predicted_btts_prob'] - df['market_btts_prob']
    df['edge_no'] = (1 - df['predicted_btts_prob']) - (1 - df['market_btts_prob'])
    
    all_bands = []
    
    # Test probability bands for BTTS YES
    for low in np.arange(0.50, 0.85, prob_step):
        high = low + band_width
        mask = (df['predicted_btts_prob'] >= low) & (df['predicted_btts_prob'] < high)
        subset = df[mask]
        
        if len(subset) >= min_matches:
            hit_rate = subset['actual_btts'].mean()
            avg_odds = subset['btts_yes_odds'].mean()
            
            # Calculate ROI (assuming unit stakes)
            profit = (subset['actual_btts'] * subset['btts_yes_odds']).sum() - len(subset)
            roi = profit / len(subset)
            
            # Kelly criterion (fractional)
            avg_prob = subset['predicted_btts_prob'].mean()
            kelly_fraction = (avg_prob * avg_odds - 1) / (avg_odds - 1) if avg_odds > 1 else 0
            
            all_bands.append({
                'bet_type': 'BTTS_YES',
                'prob_low': low,
                'prob_high': high,
                'n_matches': len(subset),
                'hit_rate': hit_rate,
                'avg_odds': avg_odds,
                'roi': roi,
                'profit_units': profit,
                'kelly_fraction': max(0, kelly_fraction),
                'avg_edge': subset['edge_yes'].mean()
            })
    
    # Test probability bands for BTTS NO
    for low in np.arange(0.20, 0.60, prob_step):
        high = low + band_width
        mask = (df['predicted_btts_prob'] >= low) & (df['predicted_btts_prob'] < high)
        subset = df[mask]
        
        if len(subset) >= min_matches:
            hit_rate = (1 - subset['actual_btts']).mean()
            avg_odds = subset['btts_no_odds'].mean()
            
            # Calculate ROI
            profit = ((1 - subset['actual_btts']) * subset['btts_no_odds']).sum() - len(subset)
            roi = profit / len(subset)
            
            # Kelly criterion
            avg_prob = 1 - subset['predicted_btts_prob'].mean()
            kelly_fraction = (avg_prob * avg_odds - 1) / (avg_odds - 1) if avg_odds > 1 else 0
            
            all_bands.append({
                'bet_type': 'BTTS_NO',
                'prob_low': low,
                'prob_high': high,
                'n_matches': len(subset),
                'hit_rate': hit_rate,
                'avg_odds': avg_odds,
                'roi': roi,
                'profit_units': profit,
                'kelly_fraction': max(0, kelly_fraction),
                'avg_edge': subset['edge_no'].mean()
            })
    
    # Return sorted by ROI
    bands_df = pd.DataFrame(all_bands)
    if len(bands_df) > 0:
        bands_df = bands_df.sort_values('roi', ascending=False)
    
    return bands_df

def evaluate_calibration(predictions_df, odds_df, n_bins=10):
    """
    Evaluate prediction calibration with Brier score and log loss
    
    Args:
        predictions_df: Predictions with predicted_btts_prob
        odds_df: Odds data
        n_bins: Number of probability bins for calibration plot
        
    Returns:
        tuple: (calibration_df, brier_score, log_loss)
    """
    # Merge on home+away+season
    df = predictions_df.merge(
        odds_df,
        on=['home', 'away', 'season'],
        how='inner',
        suffixes=('_pred', '_odds')
    )
    
    if len(df) == 0:
        return None, None, None
    
    # Bin predictions
    bins = np.linspace(0, 1, n_bins + 1)
    df['prob_bin'] = pd.cut(df['predicted_btts_prob'], bins=bins)
    
    calibration = df.groupby('prob_bin', observed=True).agg({
        'actual_btts': ['mean', 'count'],
        'predicted_btts_prob': 'mean'
    }).reset_index()
    
    calibration.columns = ['prob_bin', 'actual_rate', 'count', 'predicted_prob']
    
    # Calculate Brier score
    brier = ((df['predicted_btts_prob'] - df['actual_btts'])**2).mean()
    
    # Log loss
    epsilon = 1e-10
    log_loss = -(
        df['actual_btts'] * np.log(df['predicted_btts_prob'] + epsilon) +
        (1 - df['actual_btts']) * np.log(1 - df['predicted_btts_prob'] + epsilon)
    ).mean()
    
    return calibration, brier, log_loss
