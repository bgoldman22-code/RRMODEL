#!/usr/bin/env python3
"""
NBA Totals Model Diagnostics

Evaluates the current production totals model to determine whether it needs:
  1. Simple calibration (bias + logistic mapping)
  2. Full retraining

Computes:
  - Correlation between model predictions and actual totals
  - MAE / RMSE
  - Mean error (systematic bias)
  - Edge bucket analysis (correlation between edge and over-hit-rate)
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path
from collections import defaultdict
import sys

# Repo paths
REPO_ROOT = Path(__file__).parent.parent
DATA_DIR = REPO_ROOT / "data" / "nba"
GAMES_DIR = DATA_DIR / "games"
MODEL_PATH = REPO_ROOT / "netlify" / "functions" / "_lib" / "nba" / "models" / "artifacts" / "total_model_simple.json"
OUTPUT_DIR = DATA_DIR / "totals"


def load_total_model():
    """Load the production totals model"""
    with open(MODEL_PATH, 'r') as f:
        return json.load(f)


def load_historical_games(seasons=['2024_25']):
    """
    Load historical game data from multiple seasons.
    Filters out preseason games based on date heuristics.
    
    NBA regular season typically starts in mid-late October.
    Preseason games before that are excluded.
    """
    all_games = []
    
    # Season start dates (regular season begins)
    # These are approximate dates when regular season starts for each season
    season_start_dates = {
        '2022_23': '2022-10-18',  # Regular season started Oct 18, 2022
        '2023_24': '2023-10-24',  # Regular season started Oct 24, 2023
        '2024_25': '2024-10-22',  # Regular season started Oct 22, 2024
        '2025_26': '2025-10-21',  # Typical start (adjust if needed)
    }
    
    for season in seasons:
        game_file = GAMES_DIR / f"games_{season}.json"
        if game_file.exists():
            print(f"Loading {game_file}...")
            with open(game_file, 'r') as f:
                games = json.load(f)
                
                # Get season start date (default to Oct 20 if not specified)
                start_date = season_start_dates.get(season, f"{season.split('_')[0]}-10-20")
                
                # Filter out preseason: only include games on or after season start
                regular_season = [
                    g for g in games 
                    if g.get('date', '') >= start_date
                ]
                
                preseason_count = len(games) - len(regular_season)
                all_games.extend(regular_season)
                print(f"  Loaded {len(regular_season)} regular season games from {season}")
                if preseason_count > 0:
                    print(f"  Filtered out {preseason_count} preseason games")
        else:
            print(f"  Warning: {game_file} not found")
    
    print(f"\nTotal games loaded: {len(all_games)}")
    return all_games


def calculate_l10_stats(games, team_id, game_date, window=10):
    """
    Calculate L10 stats for a team before a specific game date.
    Mirrors the logic in nba-predictions-elite/index.mjs calculateAdvancedStats()
    """
    # Filter games before the target date
    team_games = [
        g for g in games 
        if (g['homeTeam'] == team_id or g['awayTeam'] == team_id)
        and g['date'] < game_date
        and g.get('homeScore') is not None
        and g.get('awayScore') is not None
    ]
    
    # Sort by date and take most recent N
    team_games = sorted(team_games, key=lambda x: x['date'])[-window:]
    
    if len(team_games) == 0:
        # Return league average defaults
        return {
            'fgPct': 0.47,
            'fg3Pct': 0.36,
            'ftPct': 0.78,
            'rebounds': 44.0,
            'assists': 26.0,
            'turnovers': 13.5
        }
    
    stats = {
        'fgPct': 0,
        'fg3Pct': 0,
        'ftPct': 0,
        'rebounds': 0,
        'assists': 0,
        'turnovers': 0
    }
    
    for game in team_games:
        is_home = game['homeTeam'] == team_id
        team_stats = game['homeStats'] if is_home else game['awayStats']
        
        if not team_stats:
            continue
            
        stats['fgPct'] += team_stats.get('fgPct', 0.47)
        stats['fg3Pct'] += team_stats.get('fg3Pct', 0.36)
        stats['ftPct'] += team_stats.get('ftPct', 0.78)
        stats['rebounds'] += team_stats.get('rebounds', 44)
        stats['assists'] += team_stats.get('assists', 26)
        stats['turnovers'] += team_stats.get('turnovers', 13.5)
    
    # Average
    n = len(team_games)
    for key in stats:
        stats[key] /= n
    
    return stats


def build_total_features(home_l10, away_l10):
    """
    Build feature vector for total model prediction.
    Mirrors the feature engineering in nba-predictions-elite/index.mjs
    """
    features = {
        # Home L10 stats
        'home_l10_fgPct': home_l10['fgPct'],
        'home_l10_fg3Pct': home_l10['fg3Pct'],
        'home_l10_ftPct': home_l10['ftPct'],
        'home_l10_rebounds': home_l10['rebounds'],
        'home_l10_assists': home_l10['assists'],
        'home_l10_turnovers': home_l10['turnovers'],
        
        # Away L10 stats
        'away_l10_fgPct': away_l10['fgPct'],
        'away_l10_fg3Pct': away_l10['fg3Pct'],
        'away_l10_ftPct': away_l10['ftPct'],
        'away_l10_rebounds': away_l10['rebounds'],
        'away_l10_assists': away_l10['assists'],
        'away_l10_turnovers': away_l10['turnovers'],
        
        # Differentials
        'fgPct_diff': home_l10['fgPct'] - away_l10['fgPct'],
        'fg3Pct_diff': home_l10['fg3Pct'] - away_l10['fg3Pct'],
        'rebounds_diff': home_l10['rebounds'] - away_l10['rebounds'],
        'assists_diff': home_l10['assists'] - away_l10['assists'],
        'turnovers_diff': home_l10['turnovers'] - away_l10['turnovers'],
        
        # Home court
        'home_court': 1
    }
    
    return features


def predict_total(model, features):
    """
    Predict game total using linear model.
    Mirrors predict() function in nba-predictions-elite/index.mjs
    """
    weights = model['weights']
    bias = model['bias']
    means = model['means']
    stds = model['stds']
    
    # Normalize and predict
    pred = bias
    for key, weight in weights.items():
        value = features.get(key, 0)
        mean = means.get(key, 0)
        std = stds.get(key, 1)
        normalized = (value - mean) / std if std > 0 else 0
        pred += weight * normalized
    
    return pred


def compute_diagnostics(games, model):
    """
    Compute diagnostic metrics for the totals model.
    """
    results = []
    
    print("\nComputing predictions for all games...")
    for i, game in enumerate(games):
        if i % 100 == 0:
            print(f"  Progress: {i}/{len(games)}")
        
        # Skip if missing scores
        if game.get('homeScore') is None or game.get('awayScore') is None:
            continue
        
        home_team = game['homeTeam']
        away_team = game['awayTeam']
        game_date = game['date']
        
        # Calculate L10 stats for both teams
        home_l10 = calculate_l10_stats(games, home_team, game_date)
        away_l10 = calculate_l10_stats(games, away_team, game_date)
        
        # Build features
        features = build_total_features(home_l10, away_l10)
        
        # Predict total
        model_total = predict_total(model, features)
        
        # Actual total
        actual_total = game['homeScore'] + game['awayScore']
        
        results.append({
            'date': game_date,
            'game': f"{away_team} @ {home_team}",
            'home_team': home_team,
            'away_team': away_team,
            'home_score': game['homeScore'],
            'away_score': game['awayScore'],
            'actual_total': actual_total,
            'model_total': model_total,
            'error': model_total - actual_total,
            'abs_error': abs(model_total - actual_total)
        })
    
    print(f"\nTotal predictions computed: {len(results)}")
    return pd.DataFrame(results)


def analyze_results(df):
    """
    Compute overall diagnostic metrics.
    """
    print("\n" + "="*60)
    print("OVERALL DIAGNOSTICS")
    print("="*60)
    
    # Basic stats
    print(f"\nSample size: {len(df)} games")
    print(f"Date range: {df['date'].min()} to {df['date'].max()}")
    
    # Prediction accuracy
    mae = df['abs_error'].mean()
    rmse = np.sqrt((df['error'] ** 2).mean())
    mean_error = df['error'].mean()
    median_error = df['error'].median()
    
    print(f"\n--- Prediction Accuracy ---")
    print(f"MAE (Mean Absolute Error):     {mae:.2f} points")
    print(f"RMSE (Root Mean Square Error): {rmse:.2f} points")
    print(f"Mean Error (Bias):             {mean_error:.2f} points")
    print(f"Median Error:                  {median_error:.2f} points")
    
    # Correlation
    corr_total = df['model_total'].corr(df['actual_total'])
    print(f"\n--- Correlation ---")
    print(f"Correlation(model, actual):    {corr_total:.4f}")
    
    # Distribution of errors
    print(f"\n--- Error Distribution ---")
    print(f"25th percentile: {df['error'].quantile(0.25):.2f}")
    print(f"50th percentile: {df['error'].quantile(0.50):.2f}")
    print(f"75th percentile: {df['error'].quantile(0.75):.2f}")
    print(f"Std Dev:         {df['error'].std():.2f}")
    
    return {
        'mae': mae,
        'rmse': rmse,
        'mean_error': mean_error,
        'median_error': median_error,
        'correlation': corr_total,
        'std_error': df['error'].std()
    }


def analyze_edge_buckets(df):
    """
    Analyze performance by edge buckets.
    This would require market line data which we don't have,
    so we'll simulate by assuming model predictions vs actual are the 'edge'
    """
    print("\n" + "="*60)
    print("EDGE BUCKET ANALYSIS (Simulated)")
    print("="*60)
    print("\nNote: True edge analysis requires market lines.")
    print("Showing error distribution instead:\n")
    
    # Define error buckets
    buckets = [
        (-999, -15),
        (-15, -10),
        (-10, -7),
        (-7, -4),
        (-4, -2),
        (-2, 0),
        (0, 2),
        (2, 4),
        (4, 7),
        (7, 10),
        (10, 15),
        (15, 999)
    ]
    
    bucket_stats = []
    
    for low, high in buckets:
        mask = (df['error'] >= low) & (df['error'] < high)
        bucket_df = df[mask]
        
        if len(bucket_df) == 0:
            continue
        
        bucket_stats.append({
            'bucket': f"[{low}, {high})",
            'count': len(bucket_df),
            'pct': len(bucket_df) / len(df) * 100,
            'mean_error': bucket_df['error'].mean(),
            'mae': bucket_df['abs_error'].mean(),
            'avg_model': bucket_df['model_total'].mean(),
            'avg_actual': bucket_df['actual_total'].mean()
        })
    
    bucket_df_out = pd.DataFrame(bucket_stats)
    
    print(bucket_df_out.to_string(index=False))
    
    return bucket_df_out


def analyze_over_under_performance(df):
    """
    Analyze how well the model predicts overs vs unders.
    """
    print("\n" + "="*60)
    print("OVER/UNDER PERFORMANCE")
    print("="*60)
    
    # Classify predictions
    df['predicted_high'] = df['model_total'] > df['model_total'].median()
    df['actual_high'] = df['actual_total'] > df['actual_total'].median()
    df['correct_direction'] = df['predicted_high'] == df['actual_high']
    
    accuracy = df['correct_direction'].mean()
    
    print(f"\nDirectional Accuracy: {accuracy:.1%}")
    print(f"(Predicting above/below median correctly)")
    
    # When model predicts high
    high_pred = df[df['predicted_high']]
    print(f"\nWhen model predicts HIGH total ({len(high_pred)} games):")
    print(f"  Actually high: {high_pred['actual_high'].sum()} ({high_pred['actual_high'].mean():.1%})")
    print(f"  Avg model:     {high_pred['model_total'].mean():.1f}")
    print(f"  Avg actual:    {high_pred['actual_total'].mean():.1f}")
    
    # When model predicts low
    low_pred = df[~df['predicted_high']]
    print(f"\nWhen model predicts LOW total ({len(low_pred)} games):")
    print(f"  Actually low:  {(~low_pred['actual_high']).sum()} ({(~low_pred['actual_high']).mean():.1%})")
    print(f"  Avg model:     {low_pred['model_total'].mean():.1f}")
    print(f"  Avg actual:    {low_pred['actual_total'].mean():.1f}")


def save_results(df, overall_stats, bucket_stats):
    """
    Save diagnostic results to CSV.
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Save full predictions
    predictions_file = OUTPUT_DIR / "diagnostics_predictions.csv"
    df.to_csv(predictions_file, index=False)
    print(f"\n✅ Saved predictions to: {predictions_file}")
    
    # Save summary
    summary_file = OUTPUT_DIR / "diagnostics_summary.csv"
    summary_df = pd.DataFrame([overall_stats])
    summary_df.to_csv(summary_file, index=False)
    print(f"✅ Saved summary to: {summary_file}")
    
    # Save bucket analysis
    if bucket_stats is not None and len(bucket_stats) > 0:
        bucket_file = OUTPUT_DIR / "diagnostics_buckets.csv"
        bucket_stats.to_csv(bucket_file, index=False)
        print(f"✅ Saved bucket analysis to: {bucket_file}")


def main():
    """
    Main diagnostic pipeline.
    """
    print("="*60)
    print("NBA TOTALS MODEL DIAGNOSTICS")
    print("="*60)
    
    # Load model
    print("\nLoading production totals model...")
    model = load_total_model()
    print(f"✓ Model loaded from: {MODEL_PATH}")
    print(f"  Features: {len(model['weights'])}")
    print(f"  Bias: {model['bias']:.2f}")
    
    # Load games
    games = load_historical_games()
    
    if len(games) == 0:
        print("\n❌ ERROR: No games loaded!")
        sys.exit(1)
    
    # Compute predictions
    df = compute_diagnostics(games, model)
    
    if len(df) == 0:
        print("\n❌ ERROR: No predictions computed!")
        sys.exit(1)
    
    # Analyze results
    overall_stats = analyze_results(df)
    bucket_stats = analyze_edge_buckets(df)
    analyze_over_under_performance(df)
    
    # Save results
    save_results(df, overall_stats, bucket_stats)
    
    # Recommendations
    print("\n" + "="*60)
    print("RECOMMENDATIONS")
    print("="*60)
    
    if abs(overall_stats['mean_error']) > 3:
        print(f"\n⚠️  BIAS DETECTED: {overall_stats['mean_error']:.2f} points")
        print("   → Simple calibration recommended (bias correction)")
    else:
        print(f"\n✓ Bias is acceptable: {overall_stats['mean_error']:.2f} points")
    
    if overall_stats['mae'] > 12:
        print(f"\n⚠️  HIGH MAE: {overall_stats['mae']:.2f} points")
        print("   → Consider full model retraining")
    elif overall_stats['mae'] > 10:
        print(f"\n⚡ MAE is moderate: {overall_stats['mae']:.2f} points")
        print("   → Calibration may improve performance")
    else:
        print(f"\n✓ MAE is good: {overall_stats['mae']:.2f} points")
    
    if overall_stats['correlation'] < 0.3:
        print(f"\n⚠️  LOW CORRELATION: {overall_stats['correlation']:.4f}")
        print("   → Full model retraining strongly recommended")
    elif overall_stats['correlation'] < 0.5:
        print(f"\n⚡ Correlation is moderate: {overall_stats['correlation']:.4f}")
        print("   → Model is working but has room for improvement")
    else:
        print(f"\n✓ Correlation is strong: {overall_stats['correlation']:.4f}")
    
    print("\n" + "="*60)
    print("DIAGNOSTICS COMPLETE")
    print("="*60)


if __name__ == "__main__":
    main()
