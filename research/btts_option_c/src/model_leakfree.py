#!/usr/bin/env python3
"""
Leak-Free BTTS Models

Implements four models trained ONLY on pre-match features:
1. Poisson GLM (poisson_leakfree)
2. Logistic Regression (logistic_leakfree)
3. Random Forest (rf_leakfree)
4. Gradient Boosted Trees with Calibration (gbm_leakfree)

All models use standardized API:
- fit(X, y, feature_names=None)
- predict_proba(X) -> np.ndarray

Author: Co-CTO
Date: December 11, 2025
"""

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score, brier_score_loss
import lightgbm as lgb
import pickle
import warnings
warnings.filterwarnings('ignore')


class PoissonLeakFreeModel:
    """
    Poisson BTTS model using ONLY pre-match rolling xG averages.
    
    Formula: P(BTTS) = (1 - e^(-λ_home)) × (1 - e^(-λ_away))
    
    Where λ values come from rolling historical xG (e.g., home_xg_for_l10).
    
    This model is leak-free because it uses team form, not actual match xG.
    """
    
    def __init__(self, window='l10'):
        """
        Args:
            window: Which rolling window to use ('l3', 'l5', 'l10', 'l20')
        """
        self.window = window
        self.home_lambda_default = 1.5
        self.away_lambda_default = 1.3
        
    def fit(self, X, y, feature_names=None):
        """
        Fit by computing global average lambdas from training set.
        
        Args:
            X: Feature matrix (must include home_xg_for_{window}, away_xg_for_{window})
            y: BTTS labels
            feature_names: List of feature names
            
        Returns:
            self
        """
        self.feature_names = feature_names
        
        # Convert to dataframe if needed
        if not isinstance(X, pd.DataFrame):
            X = pd.DataFrame(X, columns=feature_names)
        
        # Get rolling xG columns
        home_xg_col = f'home_xg_for_{self.window}'
        away_xg_col = f'away_xg_for_{self.window}'
        
        if home_xg_col in X.columns and away_xg_col in X.columns:
            self.home_lambda_default = X[home_xg_col].mean()
            self.away_lambda_default = X[away_xg_col].mean()
            
            print(f"   Poisson LeakFree Model Fitted:")
            print(f"      Window: {self.window}")
            print(f"      Home λ (avg rolling xG): {self.home_lambda_default:.3f}")
            print(f"      Away λ (avg rolling xG): {self.away_lambda_default:.3f}")
        else:
            print(f"   ⚠️  Warning: {home_xg_col}/{away_xg_col} not found, using defaults")
        
        return self
    
    def predict_proba(self, X):
        """
        Generate BTTS probabilities using rolling xG from each match.
        
        Args:
            X: Feature matrix with rolling xG features
            
        Returns:
            np.ndarray: P(BTTS=1) for each match
        """
        # Convert to dataframe if needed
        if not isinstance(X, pd.DataFrame):
            X = pd.DataFrame(X, columns=self.feature_names)
        
        # Get rolling xG for each match
        home_xg_col = f'home_xg_for_{self.window}'
        away_xg_col = f'away_xg_for_{self.window}'
        
        if home_xg_col in X.columns and away_xg_col in X.columns:
            home_lam = X[home_xg_col].fillna(self.home_lambda_default)
            away_lam = X[away_xg_col].fillna(self.away_lambda_default)
        else:
            # Fallback to defaults if columns not found
            home_lam = self.home_lambda_default
            away_lam = self.away_lambda_default
        
        # Calculate P(BTTS) = (1 - e^(-λ_home)) × (1 - e^(-λ_away))
        prob_home_scores = 1 - np.exp(-home_lam)
        prob_away_scores = 1 - np.exp(-away_lam)
        
        btts_prob = prob_home_scores * prob_away_scores
        
        return btts_prob.values if isinstance(btts_prob, pd.Series) else btts_prob
    
    def save(self, filepath):
        """Save model to disk"""
        with open(filepath, 'wb') as f:
            pickle.dump(self, f)
    
    @classmethod
    def load(cls, filepath):
        """Load model from disk"""
        with open(filepath, 'rb') as f:
            return pickle.load(f)


class LogisticLeakFreeModel:
    """
    L2-regularized Logistic Regression with Platt calibration.
    
    Uses only leak-free features (rolling stats, form, market).
    """
    
    def __init__(self, C=1.0, max_iter=1000):
        """
        Args:
            C: Inverse regularization strength
            max_iter: Maximum iterations
        """
        self.C = C
        self.max_iter = max_iter
        self.scaler = StandardScaler()
        self.model = None
        self.feature_names = None
        
    def fit(self, X, y, feature_names=None):
        """
        Train logistic regression with calibration.
        
        Args:
            X: Feature matrix (leak-free features only)
            y: BTTS labels
            feature_names: List of feature names
            
        Returns:
            self
        """
        self.feature_names = feature_names
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X)
        
        # Base logistic regression
        base_model = LogisticRegression(
            penalty='l2',
            C=self.C,
            max_iter=self.max_iter,
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
        
        print(f"   Logistic LeakFree Model Fitted:")
        print(f"      Features: {X.shape[1]}")
        print(f"      C (regularization): {self.C}")
        
        return self
    
    def predict_proba(self, X):
        """
        Generate calibrated probabilities.
        
        Args:
            X: Feature matrix
            
        Returns:
            np.ndarray: P(BTTS=1) for each match
        """
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


class RandomForestLeakFreeModel:
    """
    Random Forest classifier with moderate regularization.
    
    Uses only leak-free features.
    """
    
    def __init__(self, n_estimators=200, max_depth=10, min_samples_leaf=20):
        """
        Args:
            n_estimators: Number of trees
            max_depth: Maximum tree depth
            min_samples_leaf: Minimum samples per leaf (prevents overfitting)
        """
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.min_samples_leaf = min_samples_leaf
        self.model = None
        self.feature_names = None
        self.feature_importances_ = None
        
    def fit(self, X, y, feature_names=None):
        """
        Train random forest.
        
        Args:
            X: Feature matrix (leak-free features only)
            y: BTTS labels
            feature_names: List of feature names
            
        Returns:
            self
        """
        self.feature_names = feature_names
        
        self.model = RandomForestClassifier(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            min_samples_leaf=self.min_samples_leaf,
            random_state=42,
            n_jobs=-1
        )
        
        self.model.fit(X, y)
        
        # Store feature importances
        if feature_names is not None:
            self.feature_importances_ = pd.DataFrame({
                'feature': feature_names,
                'importance': self.model.feature_importances_
            }).sort_values('importance', ascending=False)
        
        print(f"   Random Forest LeakFree Model Fitted:")
        print(f"      Features: {X.shape[1]}")
        print(f"      Trees: {self.n_estimators}")
        print(f"      Max depth: {self.max_depth}")
        print(f"      Min samples/leaf: {self.min_samples_leaf}")
        
        return self
    
    def predict_proba(self, X):
        """
        Generate probabilities.
        
        Args:
            X: Feature matrix
            
        Returns:
            np.ndarray: P(BTTS=1) for each match
        """
        return self.model.predict_proba(X)[:, 1]
    
    def get_feature_importance(self, top_n=15):
        """
        Get top N most important features.
        
        Returns:
            DataFrame with features and importances
        """
        if self.feature_importances_ is not None:
            return self.feature_importances_.head(top_n)
        return None
    
    def save(self, filepath):
        """Save model to disk"""
        with open(filepath, 'wb') as f:
            pickle.dump(self, f)
    
    @classmethod
    def load(cls, filepath):
        """Load model from disk"""
        with open(filepath, 'rb') as f:
            return pickle.load(f)


class GBMLeakFreeModel:
    """
    LightGBM with strong regularization and post-hoc calibration.
    
    Uses only leak-free features.
    """
    
    def __init__(self, n_estimators=100, max_depth=5, learning_rate=0.05):
        """
        Args:
            n_estimators: Number of boosting rounds
            max_depth: Maximum tree depth
            learning_rate: Boosting learning rate
        """
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.model = None
        self.calibrator = None
        self.feature_names = None
        self.feature_importances_ = None
        
    def fit(self, X, y, feature_names=None):
        """
        Train LightGBM with calibration.
        
        Args:
            X: Feature matrix (leak-free features only)
            y: BTTS labels
            feature_names: List of feature names
            
        Returns:
            self
        """
        self.feature_names = feature_names
        
        # Base LightGBM model
        self.model = lgb.LGBMClassifier(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            learning_rate=self.learning_rate,
            num_leaves=31,
            min_child_samples=20,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,
            reg_lambda=0.1,
            random_state=42,
            n_jobs=-1,
            verbose=-1
        )
        
        # Split for calibration (use first 70% for training, last 30% for calibration)
        split_idx = int(len(X) * 0.7)
        X_train, X_cal = X[:split_idx], X[split_idx:]
        y_train, y_cal = y[:split_idx], y[split_idx:]
        
        # Train base model
        self.model.fit(
            X_train, y_train,
            eval_set=[(X_cal, y_cal)],
            callbacks=[lgb.early_stopping(stopping_rounds=10, verbose=False)]
        )
        
        # Calibrate on held-out set
        cal_preds = self.model.predict_proba(X_cal)[:, 1]
        
        # Use isotonic calibration
        from sklearn.calibration import CalibratedClassifierCV
        self.calibrator = CalibratedClassifierCV(
            self.model,
            method='isotonic',
            cv='prefit'
        )
        self.calibrator.fit(X_cal, y_cal)
        
        # Store feature importances
        if feature_names is not None:
            self.feature_importances_ = pd.DataFrame({
                'feature': feature_names,
                'importance': self.model.feature_importances_
            }).sort_values('importance', ascending=False)
        
        print(f"   GBM LeakFree Model Fitted:")
        print(f"      Features: {X.shape[1]}")
        print(f"      Estimators: {self.n_estimators}")
        print(f"      Max depth: {self.max_depth}")
        print(f"      Learning rate: {self.learning_rate}")
        print(f"      ✅ Calibrated on {len(X_cal)} matches")
        
        return self
    
    def predict_proba(self, X):
        """
        Generate calibrated probabilities.
        
        Args:
            X: Feature matrix
            
        Returns:
            np.ndarray: P(BTTS=1) for each match
        """
        # Use calibrated predictions
        return self.calibrator.predict_proba(X)[:, 1]
    
    def get_feature_importance(self, top_n=15):
        """
        Get top N most important features.
        
        Returns:
            DataFrame with features and importances
        """
        if self.feature_importances_ is not None:
            return self.feature_importances_.head(top_n)
        return None
    
    def save(self, filepath):
        """Save model to disk"""
        with open(filepath, 'wb') as f:
            pickle.dump(self, f)
    
    @classmethod
    def load(cls, filepath):
        """Load model from disk"""
        with open(filepath, 'rb') as f:
            return pickle.load(f)


# Model registry
MODEL_REGISTRY = {
    'poisson_leakfree': PoissonLeakFreeModel,
    'logistic_leakfree': LogisticLeakFreeModel,
    'rf_leakfree': RandomForestLeakFreeModel,
    'gbm_leakfree': GBMLeakFreeModel,
}


def fit_model(model_name, X, y, feature_names=None, **kwargs):
    """
    Factory function to fit a leak-free model.
    
    Args:
        model_name: One of ['poisson_leakfree', 'logistic_leakfree', 'rf_leakfree', 'gbm_leakfree']
        X: Feature matrix (leak-free features only)
        y: BTTS labels
        feature_names: List of feature names
        **kwargs: Additional model-specific parameters
        
    Returns:
        Fitted model instance
    """
    if model_name not in MODEL_REGISTRY:
        raise ValueError(f"Unknown model: {model_name}. Choose from {list(MODEL_REGISTRY.keys())}")
    
    model_class = MODEL_REGISTRY[model_name]
    model = model_class(**kwargs)
    model.fit(X, y, feature_names=feature_names)
    
    return model


def predict_proba(model, X):
    """
    Generate predictions from a leak-free model.
    
    Args:
        model: Fitted model instance
        X: Feature matrix
        
    Returns:
        np.ndarray: P(BTTS=1) for each match
    """
    return model.predict_proba(X)


# Example usage
if __name__ == '__main__':
    print("\n🧪 Testing leak-free models...")
    
    # Load leak-free features
    from pathlib import Path
    features_path = Path(__file__).parent.parent / 'data' / 'btts_leakfree_features.parquet'
    
    if not features_path.exists():
        print(f"❌ Features not found at: {features_path}")
        print("   Run src/features_leakfree.py first to generate features")
        exit(1)
    
    df = pd.read_parquet(features_path)
    print(f"✅ Loaded {len(df)} matches with {len(df.columns)} columns")
    
    # Get feature columns (exclude identifiers, labels, outcomes, categoricals)
    exclude_cols = [
        'fixture_id', 'season', 'date', 'home', 'away', 'home_norm', 'away_norm',
        'btts', 'home_goals', 'away_goals', 'home_xg', 'away_xg',
        'venue', 'referee', 'bookmaker'
    ]
    
    # Keep odds as features (they're numeric and pre-match info)
    # btts_yes_odds and btts_no_odds will be included
    
    feature_cols = [c for c in df.columns if c not in exclude_cols]
    print(f"📊 Using {len(feature_cols)} leak-free features")
    
    # Split into train/test (simple time split)
    split_idx = int(len(df) * 0.7)
    train_df = df.iloc[:split_idx]
    test_df = df.iloc[split_idx:]
    
    X_train = train_df[feature_cols].fillna(0)
    y_train = train_df['btts'].values
    X_test = test_df[feature_cols].fillna(0)
    y_test = test_df['btts'].values
    
    print(f"\n📦 Train: {len(X_train)} matches")
    print(f"📦 Test: {len(X_test)} matches")
    
    # Test each model
    for model_name in MODEL_REGISTRY.keys():
        print(f"\n{'='*60}")
        print(f"Testing: {model_name}")
        print('='*60)
        
        # Fit model
        model = fit_model(model_name, X_train, y_train, feature_names=feature_cols)
        
        # Predict
        y_pred_test = predict_proba(model, X_test)
        
        # Evaluate
        auc = roc_auc_score(y_test, y_pred_test)
        brier = brier_score_loss(y_test, y_pred_test)
        
        print(f"\n   📊 Test Performance:")
        print(f"      AUC: {auc:.4f}")
        print(f"      Brier: {brier:.4f}")
        
        # Check prediction diversity
        unique_preds = len(np.unique(np.round(y_pred_test, 4)))
        print(f"      Unique predictions: {unique_preds}/{len(y_pred_test)} (diversity check)")
        
        # Show feature importance for tree models
        if hasattr(model, 'get_feature_importance'):
            importance_df = model.get_feature_importance(top_n=10)
            if importance_df is not None:
                print(f"\n   📈 Top 10 Features:")
                for idx, row in importance_df.iterrows():
                    print(f"      {row['feature']}: {row['importance']:.4f}")
    
    print("\n✅ Leak-free models test complete!")
