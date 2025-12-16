#!/usr/bin/env python3
"""
Phase 3: Hybrid & Ensemble Models

Implements advanced models that combine Dixon-Coles Poisson baseline with ML:
1. DC + ML Residual Correction
2. Blended Ensemble (weighted average)
3. Stacked Meta-Model

⚠️  READ-ONLY ACCESS to Profile C Dixon-Coles probabilities.
Does NOT modify production code.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, brier_score_loss
import pickle
import warnings

RESEARCH_DIR = Path(__file__).parent.parent
MODELS_DIR = RESEARCH_DIR / 'models'


# ============================================================================
# DIXON-COLES PROBABILITY LOADER (READ-ONLY)
# ============================================================================

def load_dc_probs(df):
    """
    Load Dixon-Coles BTTS probabilities for matches in df
    
    This function provides READ-ONLY access to Profile C DC probabilities.
    It matches on (season, date, home_norm, away_norm).
    
    Args:
        df: DataFrame with match keys
    
    Returns:
        pd.Series with DC BTTS probabilities (0-1), aligned with df index
    
    Notes:
        - If DC probabilities are not available, returns naive baseline
        - Uses cached DC output or fallback to Poisson estimates
    """
    # Try to load cached DC probabilities from Profile C
    dc_cache_path = RESEARCH_DIR.parent.parent / 'results' / 'profile_c_btts_probs.csv'
    
    if dc_cache_path.exists():
        try:
            dc_df = pd.read_csv(dc_cache_path, parse_dates=['date'])
            
            # Merge DC probs onto input df
            merged = df.merge(
                dc_df[['season', 'date', 'home_norm', 'away_norm', 'dc_btts_prob']],
                on=['season', 'date', 'home_norm', 'away_norm'],
                how='left'
            )
            
            dc_probs = merged['dc_btts_prob']
            coverage = dc_probs.notna().sum() / len(df) * 100
            
            if coverage > 0:
                warnings.warn(
                    f"Loaded DC probabilities: {coverage:.1f}% coverage. "
                    f"Filling missing with Poisson fallback."
                )
            
            # Fill missing DC probs with Poisson fallback
            if dc_probs.isna().any():
                dc_probs = dc_probs.fillna(compute_poisson_btts_fallback(df))
            
            return dc_probs
            
        except Exception as e:
            warnings.warn(f"Could not load DC probabilities: {e}. Using Poisson fallback.")
    
    # Fallback: Use simple Poisson BTTS estimator
    warnings.warn("DC probabilities not found. Using Poisson fallback for all matches.")
    return compute_poisson_btts_fallback(df)


def compute_poisson_btts_fallback(df):
    """
    Fallback: Compute simple Poisson BTTS probabilities using xG
    
    Args:
        df: DataFrame with home_xg, away_xg columns
    
    Returns:
        pd.Series of BTTS probabilities
    """
    # Use xG if available, otherwise use league averages
    if 'home_xg' in df.columns and df['home_xg'].notna().any():
        lambda_home = df['home_xg'].fillna(df['home_xg'].mean())
        lambda_away = df['away_xg'].fillna(df['away_xg'].mean())
    else:
        # Use EPL historical averages: ~1.4 goals per team
        lambda_home = pd.Series([1.4] * len(df))
        lambda_away = pd.Series([1.4] * len(df))
    
    # P(BTTS) = P(Home > 0) * P(Away > 0)
    #         = (1 - P(Home = 0)) * (1 - P(Away = 0))
    #         = (1 - e^(-λ_home)) * (1 - e^(-λ_away))
    p_home_scores = 1 - np.exp(-lambda_home)
    p_away_scores = 1 - np.exp(-lambda_away)
    p_btts = p_home_scores * p_away_scores
    
    return p_btts


# ============================================================================
# PHASE 3.1: DC + ML RESIDUAL CORRECTION
# ============================================================================

def fit_dc_residual_model(train_df, dc_probs_train, ml_model_type='lightgbm'):
    """
    Fit residual correction model: learns to predict (y_true - p_dc)
    
    Strategy:
    1. Compute residuals: r = y_true - p_dc
    2. Train ML model to predict r using features
    3. At inference: p_hybrid = clip(p_dc + r_hat, 0, 1)
    
    Args:
        train_df: DataFrame with features and 'btts' column
        dc_probs_train: Series of DC BTTS probabilities for training data
        ml_model_type: 'lightgbm', 'xgboost', or 'catboost'
    
    Returns:
        dict with 'model' and 'ml_type'
    """
    from model_ml import fit_lightgbm, fit_xgboost, fit_catboost
    
    # Compute residuals
    y_true = train_df['btts'].values
    residuals = y_true - dc_probs_train.values
    
    # Create temporary df with residuals as target
    train_residual_df = train_df.copy()
    train_residual_df['btts'] = residuals  # Replace BTTS with residual
    
    # Train ML model to predict residuals
    if ml_model_type == 'lightgbm':
        model = fit_lightgbm(train_residual_df)
    elif ml_model_type == 'xgboost':
        model = fit_xgboost(train_residual_df)
    elif ml_model_type == 'catboost':
        model = fit_catboost(train_residual_df)
    else:
        raise ValueError(f"Unknown ML model type: {ml_model_type}")
    
    return {'model': model, 'ml_type': ml_model_type}


def predict_dc_residual_model(model_dict, test_df, dc_probs_test):
    """
    Generate hybrid predictions: p_dc + residual_correction
    
    Args:
        model_dict: Dict from fit_dc_residual_model
        test_df: DataFrame with features
        dc_probs_test: Series of DC BTTS probabilities for test data
    
    Returns:
        np.ndarray of hybrid BTTS probabilities
    """
    from model_ml import predict_lightgbm, predict_xgboost, predict_catboost
    
    model = model_dict['model']
    ml_type = model_dict['ml_type']
    
    # Predict residuals
    if ml_type == 'lightgbm':
        residual_preds = predict_lightgbm(model, test_df)
    elif ml_type == 'xgboost':
        residual_preds = predict_xgboost(model, test_df)
    elif ml_type == 'catboost':
        residual_preds = predict_catboost(model, test_df)
    else:
        raise ValueError(f"Unknown ML model type: {ml_type}")
    
    # Hybrid = DC + residual correction, clipped to [0, 1]
    p_hybrid = np.clip(dc_probs_test.values + residual_preds, 0, 1)
    
    return p_hybrid


# ============================================================================
# PHASE 3.2: BLENDED ENSEMBLE (WEIGHTED AVERAGE)
# ============================================================================

def fit_blended_model(train_df, p_dc_train, p_ml_train):
    """
    Learn optimal blend weight: p_blend = w * p_ml + (1-w) * p_dc
    
    Strategy: Fit logistic regression on [p_dc, p_ml] to learn weights
    
    Args:
        train_df: DataFrame with 'btts' column
        p_dc_train: Series/array of DC probabilities
        p_ml_train: Series/array of ML probabilities
    
    Returns:
        dict with 'weight_ml' and 'weight_dc'
    """
    y_true = train_df['btts'].values
    
    # Stack probabilities as features
    X_blend = np.column_stack([p_ml_train, p_dc_train])
    
    # Fit logistic regression (learns weights via coefficients)
    blend_model = LogisticRegression(penalty=None, random_state=42)
    blend_model.fit(X_blend, y_true)
    
    # Extract weights (normalized)
    coefs = blend_model.coef_[0]
    weight_ml = coefs[0] / (coefs[0] + coefs[1])
    weight_dc = coefs[1] / (coefs[0] + coefs[1])
    
    return {
        'weight_ml': weight_ml,
        'weight_dc': weight_dc,
        'model': blend_model  # Store for direct prediction if needed
    }


def predict_blended_model(blend_params, p_dc_test, p_ml_test):
    """
    Generate blended predictions: w_ml * p_ml + w_dc * p_dc
    
    Args:
        blend_params: Dict from fit_blended_model
        p_dc_test: Series/array of DC probabilities
        p_ml_test: Series/array of ML probabilities
    
    Returns:
        np.ndarray of blended BTTS probabilities
    """
    w_ml = blend_params['weight_ml']
    w_dc = blend_params['weight_dc']
    
    p_blend = w_ml * p_ml_test + w_dc * p_dc_test
    
    # Clip to [0, 1] for safety
    p_blend = np.clip(p_blend, 0, 1)
    
    return p_blend


# ============================================================================
# PHASE 3.3: STACKED META-MODEL
# ============================================================================

def fit_stacked_model(train_df, base_model_probs_dict):
    """
    Train stacked meta-model using base model predictions as features
    
    Strategy:
    1. Use base model probabilities as features:
       - DC, Poisson, Logistic, RF, LightGBM, XGBoost, CatBoost
    2. Train calibrated logistic regression as meta-model
    
    Args:
        train_df: DataFrame with 'btts' column
        base_model_probs_dict: Dict of {model_name: proba_array}
    
    Returns:
        Fitted LogisticRegression meta-model
    """
    y_true = train_df['btts'].values
    
    # Stack all base model probabilities as features
    base_prob_arrays = [probs for probs in base_model_probs_dict.values()]
    X_stack = np.column_stack(base_prob_arrays)
    
    # Train meta-model (logistic regression for calibration)
    meta_model = LogisticRegression(penalty='l2', C=1.0, random_state=42)
    meta_model.fit(X_stack, y_true)
    
    return meta_model


def predict_stacked_model(meta_model, base_model_probs_dict):
    """
    Generate stacked meta-model predictions
    
    Args:
        meta_model: Fitted LogisticRegression from fit_stacked_model
        base_model_probs_dict: Dict of {model_name: proba_array} for test data
    
    Returns:
        np.ndarray of stacked BTTS probabilities
    """
    # Stack all base model probabilities as features
    base_prob_arrays = [probs for probs in base_model_probs_dict.values()]
    X_stack = np.column_stack(base_prob_arrays)
    
    # Predict with meta-model
    p_stacked = meta_model.predict_proba(X_stack)[:, 1]
    
    return p_stacked


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def save_phase3_model(model, model_name):
    """Save Phase 3 model to disk"""
    filepath = MODELS_DIR / f'{model_name}.pkl'
    with open(filepath, 'wb') as f:
        pickle.dump(model, f)


def load_phase3_model(model_name):
    """Load Phase 3 model from disk"""
    filepath = MODELS_DIR / f'{model_name}.pkl'
    with open(filepath, 'rb') as f:
        return pickle.load(f)


if __name__ == '__main__':
    print("=" * 80)
    print("BTTS RESEARCH PIPELINE - PHASE 3 HYBRIDS")
    print("=" * 80)
    print("\n⚠️  Phase 3 models require base model predictions.")
    print("Run RUN_WALKFORWARD.py to execute full Phase 3 evaluation.")
