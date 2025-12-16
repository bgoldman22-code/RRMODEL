#!/usr/bin/env python3
"""
Phase 1: Baseline Models

Implements simple baseline models:
1. Logistic Regression (calibrated)
2. Naive Poisson BTTS estimator
3. Baseline Random Forest

All models trained with k-fold cross-validation.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import TimeSeriesSplit
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score, brier_score_loss, log_loss
from sklearn.preprocessing import StandardScaler
import pickle

from feature_config import resolve_active_feature_list

RESEARCH_DIR = Path(__file__).parent.parent
MODELS_DIR = RESEARCH_DIR / 'models'


class LogisticBTTSModel:
    """
    Calibrated Logistic Regression for BTTS prediction
    """
    
    def __init__(self):
        self.scaler = StandardScaler()
        self.model = None
        self.feature_names = None
    
    def fit(self, X, y, feature_names=None):
        """Train model with calibration"""
        self.feature_names = feature_names
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X)
        
        # Train logistic regression with L2 regularization
        base_model = LogisticRegression(
            penalty='l2',
            C=1.0,
            max_iter=1000,
            random_state=42,
            solver='lbfgs'
        )
        
        # Apply Platt scaling for calibration
        self.model = CalibratedClassifierCV(
            base_model,
            method='sigmoid',
            cv=5
        )
        
        self.model.fit(X_scaled, y)
        
        return self
    
    def predict_proba(self, X):
        """Generate calibrated probabilities"""
        X_scaled = self.scaler.transform(X)
        return self.model.predict_proba(X_scaled)[:, 1]
    
    def save(self, filepath):
        """Save model to disk"""
        with open(filepath, 'wb') as f:
            pickle.dump(self, f)
    
    @classmethod
    def load(cls, filepath):
        """Load model from disk"""
        with open(filepath, 'rb') as f:
            return pickle.load(f)


class PoissonBTTSModel:
    """
    Naive Poisson-based BTTS estimator
    
    ⚠️  IMPORTANT: This model uses xG (expected goals) if available.
    If xG is NOT available, it falls back to actual goals.
    
    Assumes goals/xG follow Poisson distribution:
    P(BTTS) = P(Home > 0) * P(Away > 0)
            = (1 - P(Home = 0)) * (1 - P(Away = 0))
            = (1 - exp(-λ_home)) * (1 - exp(-λ_away))
    
    Where λ (lambda) is the expected goal rate per team.
    """
    
    def __init__(self):
        self.home_lambda = None
        self.away_lambda = None
        self.using_xg = False  # Track whether we're using xG or goals
    
    def fit(self, df):
        """
        Fit using historical goal/xG averages
        
        Args:
            df: DataFrame with home_goals, away_goals (or home_xg, away_xg)
        """
        # Use xG if available, else actual goals
        if 'home_xg' in df.columns and df['home_xg'].notna().sum() > 0:
            self.home_lambda = df['home_xg'].mean()
            self.away_lambda = df['away_xg'].mean()
            self.using_xg = True
            
            # Log statistics
            print(f"\n   📊 Poisson Model Fitted:")
            print(f"      Using: xG (expected goals)")
            print(f"      Home λ (avg xG): {self.home_lambda:.3f}")
            print(f"      Away λ (avg xG): {self.away_lambda:.3f}")
            print(f"      Home xG median: {df['home_xg'].median():.3f}")
            print(f"      Away xG median: {df['away_xg'].median():.3f}")
            print(f"      xG coverage: {df['home_xg'].notna().sum()}/{len(df)} matches")
            
        elif 'home_goals' in df.columns:
            self.home_lambda = df['home_goals'].mean()
            self.away_lambda = df['away_goals'].mean()
            self.using_xg = False
            
            # Log statistics
            print(f"\n   📊 Poisson Model Fitted:")
            print(f"      Using: Actual goals (xG not available)")
            print(f"      Home λ (avg goals): {self.home_lambda:.3f}")
            print(f"      Away λ (avg goals): {self.away_lambda:.3f}")
            print(f"      Home goals median: {df['home_goals'].median():.1f}")
            print(f"      Away goals median: {df['away_goals'].median():.1f}")
            
        else:
            # Default EPL averages
            self.home_lambda = 1.5
            self.away_lambda = 1.2
            self.using_xg = False
            
            print(f"\n   ⚠️  Poisson Model: Using default EPL averages")
            print(f"      Home λ: {self.home_lambda:.3f}")
            print(f"      Away λ: {self.away_lambda:.3f}")
        
        return self
    
    def predict_proba(self, df):
        """
        Generate BTTS probabilities using Poisson
        
        P(BTTS) = P(Home > 0) * P(Away > 0)
                = (1 - P(Home = 0)) * (1 - P(Away = 0))
                = (1 - exp(-λ_home)) * (1 - exp(-λ_away))
        """
        # Get match-specific lambdas if available
        if 'home_xg' in df.columns:
            home_lam = df['home_xg'].fillna(self.home_lambda)
            away_lam = df['away_xg'].fillna(self.away_lambda)
        else:
            home_lam = self.home_lambda
            away_lam = self.away_lambda
        
        # Calculate probabilities
        prob_home_scores = 1 - np.exp(-home_lam)
        prob_away_scores = 1 - np.exp(-away_lam)
        
        btts_prob = prob_home_scores * prob_away_scores
        
        return btts_prob
    
    def save(self, filepath):
        """Save model to disk"""
        with open(filepath, 'wb') as f:
            pickle.dump(self, f)
    
    @classmethod
    def load(cls, filepath):
        """Load model from disk"""
        with open(filepath, 'rb') as f:
            return pickle.load(f)


class RandomForestBTTSModel:
    """
    Baseline Random Forest classifier
    """
    
    def __init__(self):
        self.model = None
        self.feature_names = None
    
    def fit(self, X, y, feature_names=None):
        """Train Random Forest"""
        self.feature_names = feature_names
        
        self.model = RandomForestClassifier(
            n_estimators=200,
            max_depth=10,
            min_samples_leaf=20,
            max_features='sqrt',
            random_state=42,
            n_jobs=-1
        )
        
        self.model.fit(X, y)
        
        return self
    
    def predict_proba(self, X):
        """Generate probabilities"""
        return self.model.predict_proba(X)[:, 1]
    
    def save(self, filepath):
        """Save model to disk"""
        with open(filepath, 'wb') as f:
            pickle.dump(self, f)
    
    @classmethod
    def load(cls, filepath):
        """Load model from disk"""
        with open(filepath, 'rb') as f:
            return pickle.load(f)


def train_baseline_models(df):
    """
    Train all Phase 1 baseline models with TIME-AWARE cross-validation
    
    ⚠️  CRITICAL: Uses TimeSeriesSplit to avoid data leakage.
    Data is sorted by date, and we always train on past data to predict future matches.
    This prevents the model from seeing future information during training.
    
    CV Strategy: TimeSeriesSplit with 5 splits
    - Fold 1: Train on first 20%, test on next 20%
    - Fold 2: Train on first 40%, test on next 20%
    - Fold 3: Train on first 60%, test on next 20%
    - Fold 4: Train on first 80%, test on next 20%
    - Fold 5: Train on all data for final model
    
    Returns:
        dict of trained models and their CV performance
    """
    print("=" * 80)
    print("PHASE 1: BASELINE MODEL TRAINING")
    print("=" * 80)
    
    # Ensure data is sorted by date (CRITICAL for time-series CV)
    df = df.sort_values('date').reset_index(drop=True)
    print(f"\n   📅 Data sorted by date: {df['date'].min()} to {df['date'].max()}")
    
    # Prepare feature matrix
    from feature_importance import prepare_feature_matrix
    X, y, feature_names = prepare_feature_matrix(df)
    
    results = {}
    
    # Cross-validation setup: TIME-SERIES AWARE
    # Uses TimeSeriesSplit to ensure we only train on past data
    tscv = TimeSeriesSplit(n_splits=5)
    print(f"\n   🔀 Cross-validation: TimeSeriesSplit (n_splits=5)")
    print(f"      Strategy: Train on past, predict future (no data leakage)")
    
    # Model 1: Logistic Regression
    print("\n📊 Training Logistic Regression...")
    lr_preds = np.zeros(len(y))
    
    for fold, (train_idx, val_idx) in enumerate(tscv.split(X), 1):
        X_train, X_val = X[train_idx], X[val_idx]
        y_train, y_val = y[train_idx], y[val_idx]
        
        # Log date ranges for this fold
        train_dates = df.iloc[train_idx]['date']
        val_dates = df.iloc[val_idx]['date']
        print(f"   Fold {fold}: Train={train_dates.min()} to {train_dates.max()}, "
              f"Val={val_dates.min()} to {val_dates.max()}")
        
        model = LogisticBTTSModel()
        model.fit(X_train, y_train, feature_names)
        
        lr_preds[val_idx] = model.predict_proba(X_val)
        
        fold_auc = roc_auc_score(y_val, lr_preds[val_idx])
        print(f"      → AUC: {fold_auc:.4f}")
    
    # Overall metrics
    results['logistic'] = {
        'model': model,  # Last fold model
        'predictions': lr_preds,
        'auc': roc_auc_score(y, lr_preds),
        'brier': brier_score_loss(y, lr_preds),
        'logloss': log_loss(y, lr_preds),
        'cv_strategy': 'TimeSeriesSplit(n_splits=5)'
    }
    
    print(f"   ✅ Overall AUC: {results['logistic']['auc']:.4f}")
    print(f"   ✅ Brier Score: {results['logistic']['brier']:.4f}")
    print(f"   ✅ Log Loss: {results['logistic']['logloss']:.4f}")
    
    # Save model
    model.save(MODELS_DIR / 'logistic_btts.pkl')
    
    # Model 2: Poisson BTTS
    print("\n📊 Training Poisson BTTS Estimator...")
    poisson_model = PoissonBTTSModel()
    poisson_model.fit(df)
    
    poisson_preds = poisson_model.predict_proba(df)
    
    results['poisson'] = {
        'model': poisson_model,
        'predictions': poisson_preds,
        'auc': roc_auc_score(y, poisson_preds),
        'brier': brier_score_loss(y, poisson_preds),
        'logloss': log_loss(y, poisson_preds),
        'cv_strategy': 'Full data (simple baseline)'
    }
    
    print(f"   ✅ AUC: {results['poisson']['auc']:.4f}")
    print(f"   ✅ Brier Score: {results['poisson']['brier']:.4f}")
    print(f"   ✅ Log Loss: {results['poisson']['logloss']:.4f}")
    
    poisson_model.save(MODELS_DIR / 'poisson_btts.pkl')
    
    # Model 3: Random Forest
    print("\n📊 Training Random Forest...")
    rf_preds = np.zeros(len(y))
    
    for fold, (train_idx, val_idx) in enumerate(tscv.split(X), 1):
        X_train, X_val = X[train_idx], X[val_idx]
        y_train, y_val = y[train_idx], y[val_idx]
        
        # Log date ranges for this fold
        train_dates = df.iloc[train_idx]['date']
        val_dates = df.iloc[val_idx]['date']
        print(f"   Fold {fold}: Train={train_dates.min()} to {train_dates.max()}, "
              f"Val={val_dates.min()} to {val_dates.max()}")
        
        model = RandomForestBTTSModel()
        model.fit(X_train, y_train, feature_names)
        
        rf_preds[val_idx] = model.predict_proba(X_val)
        
        fold_auc = roc_auc_score(y_val, rf_preds[val_idx])
        print(f"      → AUC: {fold_auc:.4f}")
    
    results['random_forest'] = {
        'model': model,
        'predictions': rf_preds,
        'auc': roc_auc_score(y, rf_preds),
        'brier': brier_score_loss(y, rf_preds),
        'logloss': log_loss(y, rf_preds),
        'cv_strategy': 'TimeSeriesSplit(n_splits=5)'
    }
    
    print(f"   ✅ Overall AUC: {results['random_forest']['auc']:.4f}")
    print(f"   ✅ Brier Score: {results['random_forest']['brier']:.4f}")
    print(f"   ✅ Log Loss: {results['random_forest']['logloss']:.4f}")
    
    model.save(MODELS_DIR / 'random_forest_btts.pkl')
    
    print("\n✅ Phase 1 baseline models training complete!")
    
    return results


# ============================================================================
# WALKFORWARD-COMPATIBLE FIT/PREDICT FUNCTIONS
# ============================================================================

def prepare_features(train_df, test_df=None, exclude_cols=None):
    """
    Extract feature matrix and target from DataFrame
    
    ⚠️  LEAKAGE-FREE: Fits imputer on TRAIN only, applies to both train and test
    
    Args:
        train_df: Training DataFrame with BTTS labels and features
        test_df: Optional test DataFrame (if None, returns train only)
        exclude_cols: Additional columns to exclude
    
    Returns:
        If test_df is None: (X_train, y_train, feature_names)
        If test_df provided: (X_train, y_train, X_test, y_test, feature_names)
    """
    if exclude_cols is None:
        exclude_cols = []
    
    # Standard exclusions
    base_exclude = [
        'btts', 'season', 'date', 'home_norm', 'away_norm',
        'home_goals', 'away_goals', 'fixture_id',
        'home', 'away', 'venue', 'referee', 'bookmaker',
        # ❌ CRITICAL: Exclude FPL goals (actual match results = target leakage!)
        'home_goals_fpl', 'away_goals_fpl'
    ]
    
    all_exclude = list(set(base_exclude + exclude_cols))
    candidate_cols = [c for c in train_df.columns if c not in all_exclude]
    feature_cols = resolve_active_feature_list(candidate_cols)
    
    # ✅ RUNTIME GUARDS: Verify allowlist integrity
    if not feature_cols:
        raise ValueError("[FATAL] Feature selection produced an empty allowlist")
    if len(feature_cols) > 25:
        raise ValueError(f"[FATAL] Feature allowlist too large: {len(feature_cols)} > 25")
    
    # 🚨 BANNED FEATURE CHECK: Crash if any leaked features sneak in
    BANNED_SUBSTRINGS = ["goals_fpl", "home_goals", "away_goals", "_shots", "_corners", "_fouls", "_cards"]
    for f in feature_cols:
        for banned in BANNED_SUBSTRINGS:
            if banned in f:
                raise ValueError(f"[FATAL] Banned feature '{banned}' found in baseline feature set: {f}")

    if not hasattr(prepare_features, '_feature_allowlist_logged'):
        print(f"\n🧱 Using prediction-safe feature allowlist (Phase 1): {len(feature_cols)} features")
        for col in feature_cols:
            print(f"   - {col}")
        prepare_features._feature_allowlist_logged = True

    # Select only numeric columns from TRAIN
    X_train_df = train_df[feature_cols].select_dtypes(include=[np.number])
    numeric_feature_cols = X_train_df.columns.tolist()
    if len(numeric_feature_cols) == 0:
        raise ValueError("No numeric prediction-safe features available for Phase 1 models")
    dropped_non_numeric = [c for c in feature_cols if c not in numeric_feature_cols]
    if dropped_non_numeric:
        print(f"⚠️  Dropped non-numeric features: {dropped_non_numeric}")
    
    # 🔍 LEAKAGE CHECK: Log features once (first call only)
    if not hasattr(prepare_features, '_features_logged'):
        print("\n🔍 FEATURE LEAKAGE CHECK (Phase 1 - Baselines):")
        print(f"   Total features: {len(X_train_df.columns)}")
        leaky_features = [c for c in X_train_df.columns if 'goals_fpl' in c.lower()]
        if leaky_features:
            print(f"   ❌ WARNING: Found leaked features: {leaky_features}")
        else:
            print(f"   ✅ No 'goals_fpl' features found")
        prepare_features._features_logged = True
    
    # ✅ FIT imputer on training data ONLY (prevents leakage)
    train_medians = X_train_df.median()
    
    # Fill train NaN using train medians
    X_train = X_train_df.fillna(train_medians).values
    y_train = train_df['btts'].values
    feature_names = X_train_df.columns.tolist()
    
    # If no test set, return train only
    if test_df is None:
        return X_train, y_train, feature_names
    
    # ✅ APPLY same train medians to test (prevents leakage)
    X_test_df = test_df[feature_cols].select_dtypes(include=[np.number])
    X_test = X_test_df.fillna(train_medians).values  # Use TRAIN medians!
    y_test = test_df['btts'].values
    
    return X_train, y_train, X_test, y_test, feature_names


def fit_logistic(train_df):
    """
    Fit logistic regression model on training data
    
    Args:
        train_df: DataFrame with features and 'btts' column
    
    Returns:
        Dict with {'model': fitted_model, 'train_df': train_df_copy}
    """
    X, y, feature_names = prepare_features(train_df, test_df=None)
    model = LogisticBTTSModel()
    model.fit(X, y, feature_names=feature_names)
    return {'model': model, 'train_df': train_df.copy()}


def predict_logistic(model_dict, test_df):
    """
    Generate predictions from logistic model
    
    Args:
        model_dict: Dict from fit_logistic with {'model', 'train_df'}
        test_df: DataFrame with same features as training
    
    Returns:
        np.ndarray of BTTS probabilities
    """
    _, _, X_test, _, _ = prepare_features(model_dict['train_df'], test_df)
    return model_dict['model'].predict_proba(X_test)


def fit_poisson(train_df):
    """
    Fit Poisson BTTS model on training data
    
    Args:
        train_df: DataFrame with xG columns and 'btts' column
    
    Returns:
        Fitted PoissonBTTSModel (simple model, no train_df needed)
    """
    model = PoissonBTTSModel()
    # ✅ Pass DataFrame, not arrays - this fixes the API mismatch
    model.fit(train_df)
    return model


def predict_poisson(model, test_df):
    """
    Generate predictions from Poisson model
    
    Args:
        model: Fitted PoissonBTTSModel
        test_df: DataFrame with xG columns
    
    Returns:
        np.ndarray of BTTS probabilities
    """
    # ✅ Pass DataFrame, not arrays - matches PoissonBTTSModel.predict_proba API
    probs = model.predict_proba(test_df)
    
    # Handle Series or array return
    if isinstance(probs, pd.Series):
        return probs.values
    return probs


def fit_random_forest(train_df):
    """
    Fit Random Forest model on training data
    
    Args:
        train_df: DataFrame with features and 'btts' column
    
    Returns:
        Dict with {'model': fitted_model, 'train_df': train_df_copy}
    """
    X, y, feature_names = prepare_features(train_df, test_df=None)
    model = RandomForestBTTSModel()
    model.fit(X, y, feature_names=feature_names)
    return {'model': model, 'train_df': train_df.copy()}


def predict_random_forest(model_dict, test_df):
    """
    Generate predictions from Random Forest model
    
    Args:
        model_dict: Dict from fit_random_forest with {'model', 'train_df'}
        test_df: DataFrame with same features as training
    
    Returns:
        np.ndarray of BTTS probabilities
    """
    _, _, X_test, _, _ = prepare_features(model_dict['train_df'], test_df)
    return model_dict['model'].predict_proba(X_test)


if __name__ == '__main__':
    import sys
    sys.path.append(str(Path(__file__).parent))
    
    from load_data import load_unified_data
    from build_features import build_all_features
    
    print("=" * 80)
    print("BTTS RESEARCH PIPELINE - PHASE 1 BASELINES")
    print("=" * 80)
    
    # Load data
    df = load_unified_data()
    df = build_all_features(df)
    
    # Train models
    results = train_baseline_models(df)
    
    # Summary
    print("\n" + "=" * 80)
    print("PHASE 1 RESULTS SUMMARY")
    print("=" * 80)
    
    for model_name, metrics in results.items():
        print(f"\n{model_name.upper()}:")
        print(f"  AUC: {metrics['auc']:.4f}")
        print(f"  Brier: {metrics['brier']:.4f}")
        print(f"  LogLoss: {metrics['logloss']:.4f}")
