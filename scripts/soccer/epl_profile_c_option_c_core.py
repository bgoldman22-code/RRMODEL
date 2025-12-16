#!/usr/bin/env python3
"""
EPL Profile C - Option C Core Functions (EXPERIMENTAL)

This module contains experimental enhancements to the EPL Profile C BTTS system.
It builds on top of the verified production pipeline but remains strictly separate.

DESIGN PRINCIPLES:
==================
1. Import from production where possible (no code duplication)
2. Build additive features on top of existing merged dataset
3. Explore richer models (logistic, ensemble) alongside Dixon-Coles
4. Enable optional external data (xG, shots) without breaking core pipeline
5. Maintain zero-leakage walk-forward validation

BASELINE (STEP 1):
==================
Initially, this module will clone the production pipeline exactly to establish
a baseline. Subsequent steps will add:
- Richer feature engineering (rolling stats, market signals)
- Better probability models (logistic, gradient boosting)
- External data integration (RapidAPI, API-Football, etc.)

IMPORTS FROM PRODUCTION:
========================
- load_epl_data() from epl_profile_c_core.py (data loading)
- standardize_team_name() from team_name_utils.py (normalization)
- dixon_coles functions (as baseline model)

NEW FUNCTIONS (OPTION C):
==========================
- load_epl_data_option_c(): Wrapper with optional external features
- prepare_walkforward_data_option_c(): 3-key merge + feature engineering
- build_option_c_features(): Rich feature builder (Step 2)
- train_option_c_classifier(): Advanced BTTS model (Step 3)
- predict_btts_prob_option_c(): Calibrated probabilities (Step 3)

USAGE:
======
from scripts.soccer.epl_profile_c_option_c_core import (
    load_epl_data_option_c,
    prepare_walkforward_data_option_c
)

# Load data with optional external features
results_df, team_stats_df, odds_df = load_epl_data_option_c()

# Prepare walk-forward dataset with features
combined_df = prepare_walkforward_data_option_c(results_df, odds_df)
"""

import pandas as pd
import numpy as np
import sys
from pathlib import Path
from datetime import datetime

# Import from production (reuse existing functions)
parent_dir = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(parent_dir))

from epl_profile_c_core import (
    load_epl_data,
    calculate_team_ratings,
    calibrate_dixon_coles,
    calculate_btts_probability,
    shin_implied_prob,
    find_profitable_bands
)

from scripts.soccer.team_name_utils import standardize_team_name

# ============================================================================
# STEP 1: BASELINE FUNCTIONS (Clone Production Pipeline)
# ============================================================================

def load_epl_data_option_c(data_dir=None, include_external=False):
    """
    Load EPL data with optional external features
    
    STEP 1: Wraps production loader exactly
    STEP 4+: Can add external data sources (xG, shots, etc.)
    
    Args:
        data_dir: Path to data directory (if None, auto-detect)
        include_external: If True, attempt to load external features (Step 4+)
        
    Returns:
        results_df: Match results with scores and BTTS
        team_stats_df: Season-level team statistics  
        odds_df: BTTS odds from bookmakers
        external_df: External features (None if not available, Step 4+)
    """
    # Auto-detect data directory if not provided
    if data_dir is None:
        # Try parent directory first (outside RRMODEL)
        parent_data = Path(__file__).resolve().parents[3] / 'data' / 'premier_league'
        if parent_data.exists():
            data_dir = str(parent_data) + '/'
        else:
            # Fall back to default
            data_dir = 'data/premier_league/'
    
    # STEP 1: Use production loader as-is
    results_df, team_stats_df, odds_df = load_epl_data(data_dir)
    
    # TODO (Step 4+): Load external features if requested
    external_df = None
    if include_external:
        # Placeholder for future external data integration
        # Will load xG, shots, etc. from external APIs
        pass
    
    print(f"✓ Loaded EPL data (Option C)")
    print(f"  Results: {len(results_df):,} matches")
    print(f"  Team stats: {len(team_stats_df):,} team-seasons")
    print(f"  Odds: {len(odds_df):,} matches")
    if external_df is not None:
        print(f"  External: {len(external_df):,} matches")
    
    return results_df, team_stats_df, odds_df, external_df


def prepare_walkforward_data_option_c(results_df, odds_df, external_df=None):
    """
    Prepare walk-forward dataset with 3-key merge + optional features
    
    STEP 1: Clone production 3-key merge exactly
    STEP 2: Add rich feature engineering (rolling stats, market signals)
    STEP 4+: Merge in external data if available
    
    Args:
        results_df: Match results from load_epl_data()
        odds_df: BTTS odds from load_epl_data()
        external_df: External features (None if not available, Step 4+)
        
    Returns:
        combined_df: Merged dataset with features, ready for walk-forward
    """
    print("\nPreparing Option C walk-forward dataset...")
    
    # STEP 1: Use same 3-key merge as production
    # Normalize team names in results
    results_df = results_df.copy()
    results_df['home_norm'] = results_df['home'].apply(standardize_team_name)
    results_df['away_norm'] = results_df['away'].apply(standardize_team_name)
    
    # Use real match dates from odds file (results has fake dates)
    odds_df = odds_df.copy()
    odds_df['home_norm'] = odds_df['home'].apply(standardize_team_name)
    odds_df['away_norm'] = odds_df['away'].apply(standardize_team_name)
    
    # Odds file uses 'date' column (not 'commence_time')
    if 'date' in odds_df.columns:
        odds_df['date_odds'] = pd.to_datetime(odds_df['date'])
    elif 'commence_time' in odds_df.columns:
        odds_df['date_odds'] = pd.to_datetime(odds_df['commence_time'])
    else:
        raise ValueError("Odds file missing date column (expected 'date' or 'commence_time')")
    
    # 3-key merge: season, home_norm, away_norm (same as production)
    combined = results_df.merge(
        odds_df[['season', 'home_norm', 'away_norm', 'date_odds', 
                 'btts_yes_odds', 'btts_no_odds']],
        on=['season', 'home_norm', 'away_norm'],
        how='inner'
    )
    
    # Use real match dates from odds (not fake results dates)
    combined['date'] = combined['date_odds']
    combined = combined.drop(columns=['date_odds'])
    
    # Sort chronologically
    combined = combined.sort_values('date').reset_index(drop=True)
    
    # Calculate BTTS outcome if not already present
    if 'btts' not in combined.columns:
        combined['btts'] = (
            (combined['home_score'] > 0) & (combined['away_score'] > 0)
        ).astype(int)
    
    print(f"✓ Combined: {len(combined):,} matches with odds")
    print(f"  Coverage: {100 * len(combined) / len(odds_df):.1f}%")
    print(f"  Date range: {combined['date'].min().date()} to {combined['date'].max().date()}")
    print(f"  BTTS rate: {combined['btts'].mean():.1%}")
    
    # TODO (Step 2): Add rich feature engineering here
    # - Rolling BTTS rates per team
    # - Rolling goals for/against
    # - Market signals (implied probs, edge estimates)
    
    # TODO (Step 4+): Merge in external features if available
    if external_df is not None:
        # Left join external data (optional, won't break if missing)
        pass
    
    return combined


# ============================================================================
# STEP 2: FEATURE ENGINEERING (To Be Implemented)
# ============================================================================

def build_option_c_features(combined_df):
    """
    Build rich features from existing data + optional external sources
    
    STEP 2 IMPLEMENTATION:
    - Rolling BTTS rates (last 3, 5, 10 matches per team)
    - Rolling goals for/against (home/away splits)
    - League-level BTTS baseline (season, recent window)
    - Market signals (implied prob, edge vs DC model)
    - Odds-space features (log odds, overround)
    
    STEP 4+ ADDITIONS:
    - xG, shots, possession from external APIs
    - Rolling xG features
    
    Args:
        combined_df: Merged dataset from prepare_walkforward_data_option_c()
        
    Returns:
        combined_df: Same dataframe with additional feature columns
    """
    # TODO: Implement in Step 2
    raise NotImplementedError("Feature engineering will be implemented in Step 2")


# ============================================================================
# STEP 3: ADVANCED PROBABILITY MODELS (To Be Implemented)
# ============================================================================

def train_option_c_classifier(train_df, model_type='logistic'):
    """
    Train Option C BTTS probability model
    
    STEP 3 IMPLEMENTATION:
    - Logistic regression baseline
    - Gradient boosting (XGBoost/LightGBM)
    - Probability calibration (Platt scaling, isotonic regression)
    
    Args:
        train_df: Training data with features
        model_type: 'logistic', 'xgboost', 'lightgbm', or 'blend'
        
    Returns:
        model: Trained classifier
        metrics: Training metrics (AUC, Brier, log loss)
    """
    # TODO: Implement in Step 3
    raise NotImplementedError("Classifier training will be implemented in Step 3")


def predict_btts_prob_option_c(model, eval_df):
    """
    Generate calibrated BTTS probabilities for evaluation set
    
    Args:
        model: Trained classifier from train_option_c_classifier()
        eval_df: Evaluation data with features
        
    Returns:
        probs: Array of BTTS YES probabilities (calibrated)
    """
    # TODO: Implement in Step 3
    raise NotImplementedError("Probability prediction will be implemented in Step 3")


# ============================================================================
# STEP 4+: EXTERNAL DATA INTEGRATION (To Be Implemented)
# ============================================================================

def load_external_features(source='rapidapi', season=None, date_range=None):
    """
    Load external match-level features from various APIs
    
    STEP 4 SOURCES:
    - RapidAPI xG statistics
    - API-Football (shots, possession, etc.)
    - Sportmonks (xG, advanced metrics)
    - Premier-League-API GitHub (static data)
    - EPL BallDontLie (stats, lineups)
    
    Args:
        source: Which API to query ('rapidapi', 'api_football', etc.)
        season: Filter by season (e.g., '2023-24')
        date_range: Tuple of (start_date, end_date)
        
    Returns:
        external_df: DataFrame with keys (season, date, home_norm, away_norm)
                     and additional feature columns
    """
    # TODO: Implement in Step 4
    raise NotImplementedError("External data loading will be implemented in Step 4+")


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def compare_vs_baseline(option_c_results, baseline_results):
    """
    Compare Option C vs production baseline
    
    Metrics:
    - AUC, Brier score, log loss
    - Calibration curves
    - ROI with identical band logic
    - Feature importance (if applicable)
    
    Args:
        option_c_results: Results from Option C backtest
        baseline_results: Results from production backtest
        
    Returns:
        comparison_df: Detailed comparison metrics
    """
    # TODO: Implement as needed
    pass


if __name__ == '__main__':
    """
    Quick test of baseline functions (Step 1)
    """
    print("EPL Profile C - Option C Core Module")
    print("=" * 50)
    
    # Test data loading
    results_df, team_stats_df, odds_df, external_df = load_epl_data_option_c()
    
    # Test walk-forward preparation
    combined_df = prepare_walkforward_data_option_c(results_df, odds_df)
    
    print("\n✓ Baseline functions operational")
    print(f"✓ Merged dataset: {len(combined_df):,} matches")
    print("\nNext: Proceed to Step 1 backtest validation")
