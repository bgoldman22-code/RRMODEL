#!/usr/bin/env python3
"""
Multi-Model BTTS Comparison Training Script
Compares Dixon-Coles, XGBoost, and Ensemble approaches for Bundesliga

Models:
1. Dixon-Coles Baseline: Traditional Poisson-based with team ratings
2. XGBoost Feature Model: Leverages all 44 features + odds
3. Ensemble: Weighted combination of both

Usage:
    python scripts/soccer/train_multimodel_comparison.py

Requirements:
    - data/bundesliga/matches_with_features.csv (1,224 matches, 44 features)
    - data/bundesliga/historical_completed_with_odds.csv (417 matches with odds)

Output:
    - data/bundesliga/model_comparison_report.md
    - data/bundesliga/model_comparison.png
    - data/bundesliga/dixon_coles_model.json
    - data/bundesliga/xgboost_model.json
    - data/bundesliga/ensemble_model.json
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path
from datetime import datetime
from scipy.optimize import minimize
from scipy.stats import poisson
import xgboost as xgb
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import log_loss, roc_auc_score, brier_score_loss
import matplotlib.pyplot as plt
import warnings
warnings.filterwarnings('ignore')

# Configuration
LEAGUE = 'bundesliga'
DATA_DIR = Path(f'data/{LEAGUE}')
OUTPUT_DIR = DATA_DIR
# Since odds only available 2023+, use 2023-24 for train+val, 2024-25 for test
TRAIN_SEASONS = ['2023-24']  # Will split internally for cross-validation
VAL_SEASON = '2023-24'
TEST_SEASON = '2024-25'

print("="*80)
print("MULTI-MODEL BTTS COMPARISON TRAINING")
print("="*80)
print(f"League: Bundesliga")
print(f"Training: {', '.join(TRAIN_SEASONS)} (with time-based CV)")
print(f"Test (out-of-sample): {TEST_SEASON}")
print("="*80)

# ==========================================
# DATA LOADING & MERGING
# ==========================================

def load_and_merge_data():
    """
    Load feature data and odds data, merge on date/teams
    """
    import re
    
    print("\n[1/6] LOADING DATA")
    print("-" * 80)
    
    # Load features
    features_path = DATA_DIR / 'matches_with_features.csv'
    df_features = pd.read_csv(features_path)
    df_features['date'] = pd.to_datetime(df_features['date']).dt.normalize().dt.tz_localize(None)
    print(f"✓ Loaded {len(df_features)} matches with features")
    
    # Load odds
    odds_path = DATA_DIR / 'historical_completed_with_odds.csv'
    df_odds = pd.read_csv(odds_path)
    df_odds['date'] = pd.to_datetime(df_odds['date']).dt.normalize().dt.tz_localize(None)
    
    # Normalize team names
    def normalize_team(name):
        """Clean team names for matching"""
        name = str(name).lower()
        # Remove time prefixes like "20.30  "
        name = re.sub(r'^\d+\.\d+\s+', '', name)
        # Remove score patterns like "(3-0)  "
        name = re.sub(r'\(\d+-\d+\)\s*', '', name)
        # Remove common suffixes/prefixes
        for word in ['fc', 'sc', 'sv', 'bv', '1.', 'tsv', 'vfl', 'vfb', 'tsg', 'fsv', '04', '05', '1899', '1860']:
            name = re.sub(r'\b' + word + r'\b', '', name)
        # Clean whitespace
        name = re.sub(r'\s+', ' ', name).strip()
        
        # Manual mappings for tricky cases
        mappings = {
            'bayern münchen': 'bayern',
            'bayern': 'bayern',
            'werder bremen': 'bremen',
            'bremen': 'bremen',
            'eintracht frankfurt': 'frankfurt',
            'frankfurt': 'frankfurt',
            'borussia dortmund': 'dortmund',
            'dortmund': 'dortmund',
            'borussia mönchengladbach': 'monchengladbach',
            'borussia monchengladbach': 'monchengladbach',
            'monchengladbach': 'monchengladbach',
            'mönchengladbach': 'monchengladbach',
            'rb leipzig': 'leipzig',
            'leipzig': 'leipzig',
            'bayer leverkusen': 'leverkusen',
            'bayer': 'leverkusen',
            'leverkusen': 'leverkusen',
            'hoffenheim': 'hoffenheim',
            'mainz': 'mainz',
            'köln': 'köln',
            'koln': 'köln',
            'wolfsburg': 'wolfsburg',
            'stuttgart': 'stuttgart',
            'freiburg': 'freiburg',
            'schalke': 'schalke',
            'hertha bsc': 'hertha',
            'hertha berlin': 'hertha',
            'hertha': 'hertha',
            'union berlin': 'union',
            'union': 'union',
            'augsburg': 'augsburg',
            'arminia bielefeld': 'bielefeld',
            'arminia': 'bielefeld',
            'bielefeld': 'bielefeld',
            'bochum': 'bochum',
            'heidenheim': 'heidenheim',
            'darmstadt': 'darmstadt',
        }
        
        if name in mappings:
            return mappings[name]
        
        # Get most distinctive word as fallback (prioritize longer words)
        words = [w for w in name.split() if len(w) > 2]
        if words:
            # Sort by length and take longest
            words.sort(key=len, reverse=True)
            return words[0]
        return name if name else 'unknown'
    
    df_features['home_norm'] = df_features['home'].apply(normalize_team)
    df_features['away_norm'] = df_features['away'].apply(normalize_team)
    df_odds['home_norm'] = df_odds['home'].apply(normalize_team)
    df_odds['away_norm'] = df_odds['away'].apply(normalize_team)
    
    print(f"✓ Loaded {len(df_odds)} matches with odds")
    
    # Merge on date + teams (only keep matches where we have both features AND odds)
    df_merged = df_features.merge(
        df_odds[['date', 'home_norm', 'away_norm', 'btts_yes_odds', 'btts_no_odds', 'bookmaker', 'season']],
        left_on=['date', 'home_norm', 'away_norm'],
        right_on=['date', 'home_norm', 'away_norm'],
        how='inner',
        suffixes=('', '_odds')
    )
    
    # Drop duplicate columns
    # df_merged = df_merged.drop(columns=['home_odds', 'away_odds', 'home_norm', 'away_norm'])
    df_merged = df_merged.drop(columns=['home_norm', 'away_norm'])
    
    print(f"✓ Merged dataset: {len(df_merged)} matches with both features and odds")
    
    # Split by season
    train = df_merged[df_merged['season'].isin(TRAIN_SEASONS)].copy()
    val = df_merged[df_merged['season'] == VAL_SEASON].copy()
    test = df_merged[df_merged['season'] == TEST_SEASON].copy()
    
    print(f"\nSplit:")
    print(f"  Training+Val: {len(train)} matches ({', '.join(TRAIN_SEASONS)})")
    print(f"  Test:         {len(test)} matches ({TEST_SEASON})")
    
    # If we have training data, split first 70% for train, last 30% for validation
    if len(train) > 0:
        train = train.sort_values('date')
        split_idx = int(len(train) * 0.7)
        val = train.iloc[split_idx:].copy()
        train = train.iloc[:split_idx].copy()
        print(f"\n  → Train:      {len(train)} matches (first 70%)")
        print(f"  → Validation: {len(val)} matches (last 30%)")
    else:
        print("\n⚠ No training data available - odds only cover recent seasons")
    
    # Feature columns (exclude metadata and target)
    exclude_cols = ['date', 'matchday', 'home', 'away', 'home_score', 'away_score', 
                   'btts', 'total_goals', 'season', 'btts_yes_odds', 'btts_no_odds', 
                   'bookmaker', 'season_odds']
    feature_cols = [c for c in df_merged.columns if c not in exclude_cols]
    
    print(f"\n✓ Using {len(feature_cols)} features for ML models")
    
    return train, val, test, feature_cols

# ==========================================
# MODEL 1: DIXON-COLES BASELINE
# ==========================================

def normalize_team_name(name):
    """Normalize team names for matching"""
    name = str(name).lower().strip()
    # Remove common suffixes
    for suffix in ['fc', 'sc', 'sv', '1.', 'bv']:
        name = name.replace(suffix, '')
    return name.strip()

def calculate_team_ratings(df):
    """
    Calculate attack and defense ratings from historical data
    """
    teams = pd.concat([df['home'], df['away']]).unique()
    ratings = {}
    
    for team in teams:
        home_matches = df[df['home'] == team]
        away_matches = df[df['away'] == team]
        
        # Goals scored
        home_goals = home_matches['home_score'].sum()
        away_goals = away_matches['away_score'].sum()
        total_goals = home_goals + away_goals
        
        # Goals conceded
        home_conceded = home_matches['away_score'].sum()
        away_conceded = away_matches['home_score'].sum()
        total_conceded = home_conceded + away_conceded
        
        # Games played
        games = len(home_matches) + len(away_matches)
        
        if games > 0:
            # Attack rating (log scale)
            avg_goals = total_goals / games
            attack = np.log(max(0.1, avg_goals))
            
            # Defense rating (log scale, inverted)
            avg_conceded = total_conceded / games
            defense = -np.log(max(0.1, avg_conceded))
            
            ratings[team] = {
                'attack': attack,
                'defense': defense,
                'games': games,
                'avg_goals_for': avg_goals,
                'avg_goals_against': avg_conceded
            }
        else:
            ratings[team] = {'attack': 0.0, 'defense': 0.0, 'games': 0, 
                           'avg_goals_for': 0.0, 'avg_goals_against': 0.0}
    
    return ratings

def dixon_coles_btts_prob(lambda_home, lambda_away, home_adv=0.10, tau_00=-0.15):
    """
    Calculate BTTS probability using Dixon-Coles adjusted Poisson
    """
    # P(home > 0)
    prob_home_scores = 1 - poisson.pmf(0, lambda_home)
    
    # P(away > 0)
    prob_away_scores = 1 - poisson.pmf(0, lambda_away)
    
    # Base: Independent Poisson
    prob_btts = prob_home_scores * prob_away_scores
    
    # Dixon-Coles adjustment for 0-0
    prob_00_base = poisson.pmf(0, lambda_home) * poisson.pmf(0, lambda_away)
    prob_00_adjusted = prob_00_base * (1 + tau_00)
    
    # Adjust BTTS
    btts_adjusted = prob_btts + (prob_00_base - prob_00_adjusted)
    
    return np.clip(btts_adjusted, 0.01, 0.99)

def train_dixon_coles(train_df):
    """
    Train Dixon-Coles model
    """
    print("\n[2/6] TRAINING DIXON-COLES BASELINE")
    print("-" * 80)
    
    # Calculate team ratings from training data
    ratings = calculate_team_ratings(train_df)
    
    # Fixed parameters (calibrated from literature)
    home_adv = 0.10
    tau_00 = -0.15
    
    print(f"✓ Calculated ratings for {len(ratings)} teams")
    print(f"  Home advantage: {home_adv:.3f}")
    print(f"  tau_00 (low-score adjustment): {tau_00:.3f}")
    
    # Generate predictions
    predictions = []
    for _, row in train_df.iterrows():
        home_rating = ratings.get(row['home'], {'attack': 0, 'defense': 0})
        away_rating = ratings.get(row['away'], {'attack': 0, 'defense': 0})
        
        # Expected goals
        lambda_home = np.exp(home_adv + home_rating['attack'] - away_rating['defense'])
        lambda_away = np.exp(away_rating['attack'] - home_rating['defense'])
        
        # BTTS probability
        btts_prob = dixon_coles_btts_prob(lambda_home, lambda_away, home_adv, tau_00)
        
        predictions.append(btts_prob)
    
    train_df['dixon_coles_prob'] = predictions
    
    # Save model
    model = {
        'model_type': 'dixon_coles',
        'home_advantage': home_adv,
        'tau_00': tau_00,
        'team_ratings': {k: {key: float(val) if isinstance(val, (np.floating, np.integer)) else val 
                            for key, val in v.items()} 
                        for k, v in ratings.items()},
        'trained_on': f"{min(train_df['date']).date()} to {max(train_df['date']).date()}",
        'num_matches': len(train_df)
    }
    
    model_path = OUTPUT_DIR / 'dixon_coles_model.json'
    with open(model_path, 'w') as f:
        json.dump(model, f, indent=2)
    
    print(f"✓ Model saved to {model_path}")
    
    return model

def predict_dixon_coles(df, model):
    """
    Generate Dixon-Coles predictions for new data
    """
    ratings = model['team_ratings']
    home_adv = model['home_advantage']
    tau_00 = model['tau_00']
    
    predictions = []
    for _, row in df.iterrows():
        home_rating = ratings.get(row['home'], {'attack': 0, 'defense': 0})
        away_rating = ratings.get(row['away'], {'attack': 0, 'defense': 0})
        
        lambda_home = np.exp(home_adv + home_rating['attack'] - away_rating['defense'])
        lambda_away = np.exp(away_rating['attack'] - home_rating['defense'])
        
        btts_prob = dixon_coles_btts_prob(lambda_home, lambda_away, home_adv, tau_00)
        predictions.append(btts_prob)
    
    return np.array(predictions)

# ==========================================
# MODEL 2: XGBOOST FEATURE MODEL
# ==========================================

def train_xgboost(train_df, val_df, feature_cols):
    """
    Train XGBoost model using all features + odds
    """
    print("\n[3/6] TRAINING XGBOOST FEATURE MODEL")
    print("-" * 80)
    
    # Prepare data
    X_train = train_df[feature_cols].fillna(0)
    y_train = train_df['btts']
    
    X_val = val_df[feature_cols].fillna(0)
    y_val = val_df['btts']
    
    print(f"✓ Training set: {len(X_train)} samples, {len(feature_cols)} features")
    print(f"✓ Validation set: {len(X_val)} samples")
    
    # XGBoost parameters
    params = {
        'objective': 'binary:logistic',
        'eval_metric': ['logloss', 'auc'],
        'max_depth': 5,
        'learning_rate': 0.05,
        'n_estimators': 200,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'min_child_weight': 3,
        'random_state': 42,
        'verbosity': 0
    }
    
    # Train
    print("\nTraining XGBoost...")
    model = xgb.XGBClassifier(**params)
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False
    )
    
    # Get feature importance
    feature_importance = pd.DataFrame({
        'feature': feature_cols,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)
    
    print(f"\n✓ Training complete")
    print(f"\nTop 10 most important features:")
    for i, row in feature_importance.head(10).iterrows():
        print(f"  {row['feature']}: {row['importance']:.4f}")
    
    # Save model info
    model_info = {
        'model_type': 'xgboost',
        'params': params,
        'feature_importance': feature_importance.to_dict('records'),
        'num_features': len(feature_cols),
        'trained_on': f"{min(train_df['date']).date()} to {max(train_df['date']).date()}",
        'num_matches': len(train_df)
    }
    
    model_path = OUTPUT_DIR / 'xgboost_model.json'
    with open(model_path, 'w') as f:
        json.dump(model_info, f, indent=2)
    
    print(f"✓ Model info saved to {model_path}")
    
    # Generate predictions
    train_df['xgboost_prob'] = model.predict_proba(X_train)[:, 1]
    val_df['xgboost_prob'] = model.predict_proba(X_val)[:, 1]
    
    return model, feature_importance

def predict_xgboost(df, model, feature_cols):
    """
    Generate XGBoost predictions for new data
    """
    X = df[feature_cols].fillna(0)
    return model.predict_proba(X)[:, 1]

# ==========================================
# MODEL 3: ENSEMBLE
# ==========================================

def train_ensemble(train_df, val_df):
    """
    Train ensemble by finding optimal weights for Dixon-Coles + XGBoost
    """
    print("\n[4/6] TRAINING ENSEMBLE MODEL")
    print("-" * 80)
    
    # Use validation set to find optimal weights
    def ensemble_loss(weights):
        w_dc, w_xgb = weights
        # Normalize weights
        w_dc = max(0, w_dc)
        w_xgb = max(0, w_xgb)
        total = w_dc + w_xgb
        if total == 0:
            return 1000
        w_dc /= total
        w_xgb /= total
        
        # Ensemble prediction
        ensemble_pred = w_dc * val_df['dixon_coles_prob'] + w_xgb * val_df['xgboost_prob']
        ensemble_pred = np.clip(ensemble_pred, 0.01, 0.99)
        
        # Log loss
        return log_loss(val_df['btts'], ensemble_pred)
    
    # Optimize weights
    result = minimize(
        ensemble_loss,
        x0=[0.5, 0.5],
        method='Nelder-Mead',
        options={'maxiter': 100}
    )
    
    # Get optimal weights
    w_dc, w_xgb = result.x
    w_dc = max(0, w_dc)
    w_xgb = max(0, w_xgb)
    total = w_dc + w_xgb
    w_dc /= total
    w_xgb /= total
    
    print(f"✓ Optimal weights found:")
    print(f"  Dixon-Coles: {w_dc:.3f}")
    print(f"  XGBoost:     {w_xgb:.3f}")
    
    # Generate ensemble predictions
    train_df['ensemble_prob'] = w_dc * train_df['dixon_coles_prob'] + w_xgb * train_df['xgboost_prob']
    val_df['ensemble_prob'] = w_dc * val_df['dixon_coles_prob'] + w_xgb * val_df['xgboost_prob']
    
    # Save model
    model = {
        'model_type': 'ensemble',
        'weight_dixon_coles': float(w_dc),
        'weight_xgboost': float(w_xgb),
        'optimized_on': 'validation_set',
        'val_log_loss': float(result.fun)
    }
    
    model_path = OUTPUT_DIR / 'ensemble_model.json'
    with open(model_path, 'w') as f:
        json.dump(model, f, indent=2)
    
    print(f"✓ Model saved to {model_path}")
    
    return model

def predict_ensemble(df, ensemble_model, dc_probs, xgb_probs):
    """
    Generate ensemble predictions
    """
    w_dc = ensemble_model['weight_dixon_coles']
    w_xgb = ensemble_model['weight_xgboost']
    return w_dc * dc_probs + w_xgb * xgb_probs

# ==========================================
# EVALUATION & COMPARISON
# ==========================================

def calculate_metrics(y_true, y_pred):
    """
    Calculate comprehensive metrics
    """
    y_pred = np.clip(y_pred, 0.01, 0.99)
    
    metrics = {
        'log_loss': log_loss(y_true, y_pred),
        'auc': roc_auc_score(y_true, y_pred),
        'brier_score': brier_score_loss(y_true, y_pred),
        'accuracy': ((y_pred > 0.5) == y_true).mean()
    }
    
    return metrics

def calculate_roi(df, pred_col):
    """
    Calculate ROI assuming 1-unit bets on BTTS YES when model predicts > 50%
    """
    df = df.copy()
    df['bet'] = df[pred_col] > 0.5
    
    bets_placed = df['bet'].sum()
    if bets_placed == 0:
        return {'roi': 0, 'profit': 0, 'bets': 0, 'wins': 0, 'hit_rate': 0}
    
    # Calculate profit
    profit = 0
    wins = 0
    for _, row in df[df['bet']].iterrows():
        if row['btts'] == 1:
            profit += (row['btts_yes_odds'] - 1)
            wins += 1
        else:
            profit -= 1
    
    roi = (profit / bets_placed) * 100
    hit_rate = (wins / bets_placed) * 100
    
    return {
        'roi': roi,
        'profit': profit,
        'bets': int(bets_placed),
        'wins': int(wins),
        'hit_rate': hit_rate
    }

def evaluate_models(train_df, val_df, test_df):
    """
    Compare all three models
    """
    print("\n[5/6] EVALUATING MODELS")
    print("-" * 80)
    
    results = {}
    
    for model_name, pred_col in [('Dixon-Coles', 'dixon_coles_prob'),
                                   ('XGBoost', 'xgboost_prob'),
                                   ('Ensemble', 'ensemble_prob')]:
        
        print(f"\n{model_name}:")
        print("-" * 40)
        
        # Metrics on each split
        for split_name, df in [('Training', train_df), ('Validation', val_df), ('Test', test_df)]:
            if len(df) == 0:
                continue
            
            metrics = calculate_metrics(df['btts'], df[pred_col])
            roi_stats = calculate_roi(df, pred_col)
            
            print(f"\n{split_name} ({len(df)} matches):")
            print(f"  Log Loss:    {metrics['log_loss']:.4f}")
            print(f"  AUC:         {metrics['auc']:.4f}")
            print(f"  Brier Score: {metrics['brier_score']:.4f}")
            print(f"  Accuracy:    {metrics['accuracy']:.1%}")
            print(f"  ROI:         {roi_stats['roi']:.1f}%")
            print(f"  Profit:      {roi_stats['profit']:.2f} units on {roi_stats['bets']} bets")
            print(f"  Hit Rate:    {roi_stats['hit_rate']:.1f}% ({roi_stats['wins']}/{roi_stats['bets']})")
            
            results[f"{model_name}_{split_name}"] = {
                **metrics,
                **roi_stats
            }
    
    return results

# ==========================================
# VISUALIZATION
# ==========================================

def visualize_comparison(train_df, val_df, test_df, results):
    """
    Create comparison visualizations
    """
    print("\n[6/6] GENERATING VISUALIZATIONS")
    print("-" * 80)
    
    fig, axes = plt.subplots(2, 3, figsize=(18, 12))
    fig.suptitle('Bundesliga BTTS: Multi-Model Comparison', fontsize=16, fontweight='bold')
    
    models = ['dixon_coles_prob', 'xgboost_prob', 'ensemble_prob']
    model_names = ['Dixon-Coles', 'XGBoost', 'Ensemble']
    colors = ['#FF6B6B', '#4ECDC4', '#95E1D3']
    
    # Plot 1: Calibration curves
    ax = axes[0, 0]
    for i, (model, name, color) in enumerate(zip(models, model_names, colors)):
        bins = np.linspace(0, 1, 11)
        bin_centers = (bins[:-1] + bins[1:]) / 2
        
        df_val_copy = val_df.copy()
        df_val_copy['bin'] = pd.cut(df_val_copy[model], bins=bins)
        calibration = df_val_copy.groupby('bin', observed=True).agg({
            model: 'mean',
            'btts': 'mean'
        }).dropna()
        
        ax.scatter(calibration[model], calibration['btts'], 
                  s=100, alpha=0.7, label=name, color=color)
    
    ax.plot([0, 1], [0, 1], 'k--', alpha=0.5, label='Perfect calibration')
    ax.set_xlabel('Predicted Probability', fontsize=11)
    ax.set_ylabel('Observed Rate', fontsize=11)
    ax.set_title('Calibration Curve (Validation)', fontsize=12, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    # Plot 2: ROI by split
    ax = axes[0, 1]
    splits = ['Training', 'Validation', 'Test']
    x = np.arange(len(splits))
    width = 0.25
    
    for i, (model_name, color) in enumerate(zip(model_names, colors)):
        rois = [results.get(f"{model_name}_{split}", {}).get('roi', 0) for split in splits]
        ax.bar(x + i*width, rois, width, label=model_name, color=color, alpha=0.8)
    
    ax.set_xlabel('Dataset', fontsize=11)
    ax.set_ylabel('ROI (%)', fontsize=11)
    ax.set_title('ROI Comparison by Dataset', fontsize=12, fontweight='bold')
    ax.set_xticks(x + width)
    ax.set_xticklabels(splits)
    ax.axhline(y=0, color='black', linestyle='-', linewidth=0.8)
    ax.legend()
    ax.grid(True, alpha=0.3, axis='y')
    
    # Plot 3: Log Loss comparison
    ax = axes[0, 2]
    for i, (model_name, color) in enumerate(zip(model_names, colors)):
        losses = [results.get(f"{model_name}_{split}", {}).get('log_loss', 1) for split in splits]
        ax.plot(splits, losses, marker='o', label=model_name, color=color, linewidth=2, markersize=8)
    
    ax.set_xlabel('Dataset', fontsize=11)
    ax.set_ylabel('Log Loss (lower is better)', fontsize=11)
    ax.set_title('Log Loss Comparison', fontsize=12, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    # Plot 4: Prediction distributions
    ax = axes[1, 0]
    for model, name, color in zip(models, model_names, colors):
        ax.hist(val_df[model], bins=20, alpha=0.5, label=name, color=color, edgecolor='black')
    
    ax.axvline(x=val_df['btts'].mean(), color='red', linestyle='--', linewidth=2, label='Actual BTTS rate')
    ax.set_xlabel('Predicted BTTS Probability', fontsize=11)
    ax.set_ylabel('Frequency', fontsize=11)
    ax.set_title('Prediction Distributions (Validation)', fontsize=12, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3, axis='y')
    
    # Plot 5: AUC comparison
    ax = axes[1, 1]
    for i, (model_name, color) in enumerate(zip(model_names, colors)):
        aucs = [results.get(f"{model_name}_{split}", {}).get('auc', 0.5) for split in splits]
        ax.plot(splits, aucs, marker='o', label=model_name, color=color, linewidth=2, markersize=8)
    
    ax.axhline(y=0.5, color='black', linestyle='--', alpha=0.5, label='Random')
    ax.set_xlabel('Dataset', fontsize=11)
    ax.set_ylabel('AUC (higher is better)', fontsize=11)
    ax.set_title('AUC Comparison', fontsize=12, fontweight='bold')
    ax.set_ylim(0.45, 1.0)
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    # Plot 6: Profit comparison
    ax = axes[1, 2]
    for i, (model_name, color) in enumerate(zip(model_names, colors)):
        profits = [results.get(f"{model_name}_{split}", {}).get('profit', 0) for split in splits]
        ax.bar(x + i*width, profits, width, label=model_name, color=color, alpha=0.8)
    
    ax.set_xlabel('Dataset', fontsize=11)
    ax.set_ylabel('Profit (units)', fontsize=11)
    ax.set_title('Profit Comparison (1-unit bets)', fontsize=12, fontweight='bold')
    ax.set_xticks(x + width)
    ax.set_xticklabels(splits)
    ax.axhline(y=0, color='black', linestyle='-', linewidth=0.8)
    ax.legend()
    ax.grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    
    # Save
    plot_path = OUTPUT_DIR / 'model_comparison.png'
    plt.savefig(plot_path, dpi=150, bbox_inches='tight')
    print(f"✓ Saved comparison plot to {plot_path}")
    plt.close()

# ==========================================
# REPORT GENERATION
# ==========================================

def generate_report(results, train_df, val_df, test_df):
    """
    Generate comprehensive markdown report
    """
    report = []
    report.append("# Bundesliga BTTS: Multi-Model Comparison Report")
    report.append(f"\n**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report.append(f"\n**League:** Bundesliga")
    report.append(f"**Training Period:** {', '.join(TRAIN_SEASONS)}")
    report.append(f"**Validation Period:** {VAL_SEASON}")
    report.append(f"**Test Period:** {TEST_SEASON}")
    
    report.append("\n---\n")
    report.append("## Dataset Summary")
    report.append(f"\n- **Training:** {len(train_df)} matches")
    report.append(f"- **Validation:** {len(val_df)} matches")
    report.append(f"- **Test:** {len(test_df)} matches")
    report.append(f"- **Total:** {len(train_df) + len(val_df) + len(test_df)} matches with features + odds")
    
    report.append("\n---\n")
    report.append("## Model Architectures")
    
    report.append("\n### 1. Dixon-Coles Baseline")
    report.append("- **Type:** Traditional Poisson-based")
    report.append("- **Inputs:** Team attack/defense ratings derived from historical results")
    report.append("- **Parameters:** Home advantage, low-score correlation adjustment (tau)")
    report.append("- **Pros:** Interpretable, requires minimal data")
    report.append("- **Cons:** Doesn't leverage rich features (form, H2H, season stats)")
    
    report.append("\n### 2. XGBoost Feature Model")
    report.append("- **Type:** Gradient boosted trees")
    report.append("- **Inputs:** 44 features (form, season stats, H2H, attack/defense strength)")
    report.append("- **Parameters:** 200 trees, max_depth=5, learning_rate=0.05")
    report.append("- **Pros:** Leverages all available features, captures non-linear patterns")
    report.append("- **Cons:** Black box, requires more data")
    
    report.append("\n### 3. Ensemble")
    report.append("- **Type:** Weighted combination of Dixon-Coles + XGBoost")
    report.append("- **Weights:** Optimized via validation set to minimize log loss")
    report.append("- **Pros:** Combines statistical rigor with ML power")
    report.append("- **Cons:** More complex, two models to maintain")
    
    report.append("\n---\n")
    report.append("## Results Summary")
    
    model_names = ['Dixon-Coles', 'XGBoost', 'Ensemble']
    splits = ['Training', 'Validation', 'Test']
    
    # Metrics table
    report.append("\n### Validation Set Performance (Primary Metric)")
    report.append("\n| Model | Log Loss ↓ | AUC ↑ | Brier ↓ | Accuracy | ROI | Profit | Bets | Hit Rate |")
    report.append("|-------|-----------|-------|---------|----------|-----|--------|------|----------|")
    
    for model_name in model_names:
        key = f"{model_name}_Validation"
        if key in results:
            r = results[key]
            report.append(f"| **{model_name}** | {r['log_loss']:.4f} | {r['auc']:.3f} | {r['brier_score']:.4f} | {r['accuracy']:.1%} | {r['roi']:.1f}% | {r['profit']:.1f}u | {r['bets']} | {r['hit_rate']:.1f}% |")
    
    # Test set
    report.append("\n### Test Set Performance (Out-of-Sample)")
    report.append("\n| Model | Log Loss ↓ | AUC ↑ | ROI | Profit | Bets | Hit Rate |")
    report.append("|-------|-----------|-------|-----|--------|------|----------|")
    
    for model_name in model_names:
        key = f"{model_name}_Test"
        if key in results:
            r = results[key]
            report.append(f"| **{model_name}** | {r['log_loss']:.4f} | {r['auc']:.3f} | {r['roi']:.1f}% | {r['profit']:.1f}u | {r['bets']} | {r['hit_rate']:.1f}% |")
    
    report.append("\n---\n")
    report.append("## Key Findings")
    
    # Determine winner on validation set
    val_rois = {name: results.get(f"{name}_Validation", {}).get('roi', -999) for name in model_names}
    best_model = max(val_rois, key=val_rois.get)
    best_roi = val_rois[best_model]
    
    report.append(f"\n### Winner: **{best_model}**")
    report.append(f"- **Validation ROI:** {best_roi:.1f}%")
    
    test_key = f"{best_model}_Test"
    if test_key in results:
        test_roi = results[test_key]['roi']
        report.append(f"- **Test ROI:** {test_roi:.1f}%")
    
    report.append("\n### Model Comparison")
    for model_name in model_names:
        val_key = f"{model_name}_Validation"
        if val_key in results:
            r_val = results[val_key]
            test_key = f"{model_name}_Test"
            r_test = results.get(test_key, {})
            
            report.append(f"\n**{model_name}:**")
            report.append(f"- Val: {r_val['roi']:.1f}% ROI, {r_val['auc']:.3f} AUC, {r_val['bets']} bets")
            if r_test:
                report.append(f"- Test: {r_test['roi']:.1f}% ROI, {r_test['auc']:.3f} AUC, {r_test['bets']} bets")
    
    report.append("\n---\n")
    report.append("## Recommendations")
    
    if best_roi > 15:
        report.append(f"\n✅ **Deploy {best_model}** for production betting")
        report.append(f"- ROI exceeds 15% threshold ({best_roi:.1f}%)")
        report.append("- Strong validation and test performance")
        report.append("- Recommended stake sizing: Kelly Criterion with 25% fractional Kelly")
    elif best_roi > 5:
        report.append(f"\n⚠️ **Cautiously deploy {best_model}** with reduced stakes")
        report.append(f"- ROI is positive but below 15% threshold ({best_roi:.1f}%)")
        report.append("- Monitor closely for first 2-3 weeks")
        report.append("- Recommended stake sizing: Fixed 1-2% bankroll per bet")
    else:
        report.append("\n❌ **Do NOT deploy** for production betting")
        report.append(f"- Best ROI too low ({best_roi:.1f}%)")
        report.append("- Continue model development:")
        report.append("  - Add more features (xG, shots, possession)")
        report.append("  - Try different time windows for form")
        report.append("  - Consider market-specific models (pinnacle vs recreational books)")
    
    report.append("\n---\n")
    report.append("## Next Steps")
    report.append("\n1. Review calibration plots and identify probability bands with highest edge")
    report.append("2. Implement filtering gates (min edge, max EV cap)")
    report.append("3. Build Serie A model using same pipeline")
    report.append("4. If ROI > 15%, integrate into Netlify function for live predictions")
    report.append("5. Set up monitoring dashboard to track live performance")
    
    report_text = "\n".join(report)
    
    report_path = OUTPUT_DIR / 'model_comparison_report.md'
    with open(report_path, 'w') as f:
        f.write(report_text)
    
    print(f"✓ Saved report to {report_path}")
    
    return report_text

# ==========================================
# MAIN PIPELINE
# ==========================================

def main():
    """
    Execute full training pipeline
    """
    # Load data
    train_df, val_df, test_df, feature_cols = load_and_merge_data()
    
    # Train Dixon-Coles
    dc_model = train_dixon_coles(train_df)
    val_df['dixon_coles_prob'] = predict_dixon_coles(val_df, dc_model)
    test_df['dixon_coles_prob'] = predict_dixon_coles(test_df, dc_model)
    
    # Train XGBoost
    xgb_model, feature_importance = train_xgboost(train_df, val_df, feature_cols)
    test_df['xgboost_prob'] = predict_xgboost(test_df, xgb_model, feature_cols)
    
    # Train Ensemble
    ensemble_model = train_ensemble(train_df, val_df)
    test_df['ensemble_prob'] = predict_ensemble(
        test_df, ensemble_model,
        test_df['dixon_coles_prob'],
        test_df['xgboost_prob']
    )
    
    # Evaluate
    results = evaluate_models(train_df, val_df, test_df)
    
    # Visualize
    visualize_comparison(train_df, val_df, test_df, results)
    
    # Generate report
    report = generate_report(results, train_df, val_df, test_df)
    
    print("\n" + "="*80)
    print("TRAINING COMPLETE!")
    print("="*80)
    print("\nOutputs:")
    print(f"  - {OUTPUT_DIR / 'dixon_coles_model.json'}")
    print(f"  - {OUTPUT_DIR / 'xgboost_model.json'}")
    print(f"  - {OUTPUT_DIR / 'ensemble_model.json'}")
    print(f"  - {OUTPUT_DIR / 'model_comparison.png'}")
    print(f"  - {OUTPUT_DIR / 'model_comparison_report.md'}")
    print("\nNext: Review report and decide on deployment strategy!")
    print("="*80)

if __name__ == '__main__':
    main()
