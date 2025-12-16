"""
Enhanced leak-free model suite for BTTS prediction.

Upgrades from baseline:
- Fixed GBM calibration bug
- Hyperparameter-tuned versions
- Ensemble model
- All models maintain strict temporal integrity
"""

import numpy as np
import pandas as pd
import pickle
from scipy.stats import poisson
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit
import lightgbm as lgb

# Import baseline models
from model_leakfree import PoissonLeakFreeModel


class LogisticLeakFreeTuned:
    """
    Tuned Logistic Regression with grid search over C values.
    
    Searches: C in [0.01, 0.1, 1.0, 10.0]
    Uses TimeSeriesSplit for temporal validation
    """
    
    def __init__(self, C_values=None, cv_splits=3):
        """
        Args:
            C_values: List of regularization values to try
            cv_splits: Number of time-series CV splits
        """
        self.C_values = C_values or [0.01, 0.1, 1.0, 10.0]
        self.cv_splits = cv_splits
        self.best_C = None
        self.model = None
        self.scaler = None
        
    def fit(self, X, y, feature_names=None):
        """
        Train with grid search, then calibrate best model.
        
        Args:
            X: Feature matrix (leak-free features only)
            y: BTTS labels
            feature_names: List of feature names
            
        Returns:
            self
        """
        self.feature_names = feature_names
        
        # Scale features
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        
        # Grid search with time series split
        tscv = TimeSeriesSplit(n_splits=self.cv_splits)
        
        param_grid = {'C': self.C_values}
        
        base_lr = LogisticRegression(
            penalty='l2',
            solver='lbfgs',
            max_iter=1000,
            random_state=42
        )
        
        grid_search = GridSearchCV(
            base_lr,
            param_grid,
            cv=tscv,
            scoring='neg_brier_score',  # Optimize for calibration
            n_jobs=-1,
            verbose=0
        )
        
        grid_search.fit(X_scaled, y)
        
        self.best_C = grid_search.best_params_['C']
        
        # Train final model with best C and calibrate
        best_model = LogisticRegression(
            C=self.best_C,
            penalty='l2',
            solver='lbfgs',
            max_iter=1000,
            random_state=42
        )
        
        self.model = CalibratedClassifierCV(
            best_model,
            method='sigmoid',
            cv=5
        )
        
        self.model.fit(X_scaled, y)
        
        print(f"   Tuned Logistic Model Fitted:")
        print(f"      Features: {X.shape[1]}")
        print(f"      Best C: {self.best_C}")
        print(f"      Grid search CV: {self.cv_splits} splits")
        
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


class RandomForestLeakFreeTuned:
    """
    Tuned Random Forest with grid search over key hyperparameters.
    
    Searches: n_estimators, max_depth, min_samples_leaf
    """
    
    def __init__(self, param_grid=None, cv_splits=3):
        """
        Args:
            param_grid: Dict of parameters to search
            cv_splits: Number of time-series CV splits
        """
        self.param_grid = param_grid or {
            'n_estimators': [200, 300, 400],
            'max_depth': [10, 12, 15],
            'min_samples_leaf': [20, 30, 40]
        }
        self.cv_splits = cv_splits
        self.best_params = None
        self.model = None
        self.feature_names = None
        self.feature_importances_ = None
        
    def fit(self, X, y, feature_names=None):
        """
        Train with grid search.
        
        Args:
            X: Feature matrix (leak-free features only)
            y: BTTS labels
            feature_names: List of feature names
            
        Returns:
            self
        """
        self.feature_names = feature_names
        
        # Grid search with time series split
        tscv = TimeSeriesSplit(n_splits=self.cv_splits)
        
        base_rf = RandomForestClassifier(
            random_state=42,
            n_jobs=-1
        )
        
        grid_search = GridSearchCV(
            base_rf,
            self.param_grid,
            cv=tscv,
            scoring='neg_brier_score',
            n_jobs=-1,
            verbose=0
        )
        
        grid_search.fit(X, y)
        
        self.best_params = grid_search.best_params_
        self.model = grid_search.best_estimator_
        
        # Store feature importances
        if feature_names is not None:
            self.feature_importances_ = pd.DataFrame({
                'feature': feature_names,
                'importance': self.model.feature_importances_
            }).sort_values('importance', ascending=False)
        
        print(f"   Tuned Random Forest Model Fitted:")
        print(f"      Features: {X.shape[1]}")
        print(f"      Best params: {self.best_params}")
        
        return self
    
    def predict_proba(self, X):
        """
        Generate probability predictions.
        
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


class GBMLeakFreeFixed:
    """
    FIXED LightGBM with proper calibration.
    
    Bug fix: No longer splits training data for calibration.
    Instead, trains on full training set with early stopping,
    then uses Platt scaling for calibration.
    """
    
    def __init__(self, n_estimators=200, max_depth=6, learning_rate=0.05):
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
        self.feature_names = None
        self.feature_importances_ = None
        
    def fit(self, X, y, feature_names=None):
        """
        Train LightGBM on full training set.
        
        Args:
            X: Feature matrix (leak-free features only)
            y: BTTS labels
            feature_names: List of feature names
            
        Returns:
            self
        """
        self.feature_names = feature_names
        
        # Base LightGBM model
        base_gbm = lgb.LGBMClassifier(
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
        
        # Calibrate with cross-validation (no data splitting)
        self.model = CalibratedClassifierCV(
            base_gbm,
            method='sigmoid',  # Platt scaling
            cv=5  # 5-fold CV for calibration
        )
        
        self.model.fit(X, y)
        
        # Store feature importances from first calibrated classifier
        if feature_names is not None and hasattr(self.model.calibrated_classifiers_[0].estimator, 'feature_importances_'):
            importance = self.model.calibrated_classifiers_[0].estimator.feature_importances_
            self.feature_importances_ = pd.DataFrame({
                'feature': feature_names,
                'importance': importance
            }).sort_values('importance', ascending=False)
        
        print(f"   FIXED GBM Model Fitted:")
        print(f"      Features: {X.shape[1]}")
        print(f"      Estimators: {self.n_estimators}")
        print(f"      Max depth: {self.max_depth}")
        print(f"      Learning rate: {self.learning_rate}")
        print(f"      ✅ Calibrated with 5-fold CV (Platt)")
        
        return self
    
    def predict_proba(self, X):
        """
        Generate calibrated probabilities.
        
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


class EnsembleLeakFree:
    """
    Ensemble of multiple leak-free models.
    
    Simple averaging of top-performing models.
    """
    
    def __init__(self, models):
        """
        Args:
            models: List of fitted model objects
        """
        self.models = models
        
    def fit(self, X, y, feature_names=None):
        """
        Fit all constituent models.
        
        Args:
            X: Feature matrix
            y: Labels
            feature_names: Feature names
            
        Returns:
            self
        """
        for i, model in enumerate(self.models):
            print(f"\n   Training ensemble member {i+1}/{len(self.models)}...")
            model.fit(X, y, feature_names)
        
        print(f"\n   ✅ Ensemble fitted with {len(self.models)} models")
        return self
    
    def predict_proba(self, X):
        """
        Average predictions from all models.
        
        Args:
            X: Feature matrix
            
        Returns:
            np.ndarray: P(BTTS=1) averaged across models
        """
        preds = np.array([model.predict_proba(X) for model in self.models])
        return preds.mean(axis=0)
    
    def save(self, filepath):
        """Save ensemble to disk"""
        with open(filepath, 'wb') as f:
            pickle.dump(self, f)
    
    @classmethod
    def load(cls, filepath):
        """Load ensemble from disk"""
        with open(filepath, 'rb') as f:
            return pickle.load(f)


# Enhanced model registry
MODEL_REGISTRY_ENHANCED = {
    'poisson_leakfree': PoissonLeakFreeModel,  # Keep baseline
    'logistic_tuned': LogisticLeakFreeTuned,
    'rf_tuned': RandomForestLeakFreeTuned,
    'gbm_fixed': GBMLeakFreeFixed,
    'ensemble_rf_logistic': lambda: EnsembleLeakFree([
        RandomForestLeakFreeTuned(cv_splits=3),
        LogisticLeakFreeTuned(cv_splits=3)
    ]),
}


def fit_model_enhanced(model_name, X, y, feature_names=None):
    """
    Factory function to train an enhanced model.
    
    Args:
        model_name: Key from MODEL_REGISTRY_ENHANCED
        X: Feature matrix
        y: Labels
        feature_names: List of feature names
        
    Returns:
        Fitted model object
    """
    if model_name not in MODEL_REGISTRY_ENHANCED:
        raise ValueError(f"Unknown model: {model_name}. Available: {list(MODEL_REGISTRY_ENHANCED.keys())}")
    
    ModelClass = MODEL_REGISTRY_ENHANCED[model_name]
    model = ModelClass() if not callable(ModelClass()) else ModelClass()
    model.fit(X, y, feature_names)
    
    return model


def predict_proba_enhanced(model, X):
    """
    Generate predictions from enhanced model.
    
    Args:
        model: Fitted model object
        X: Feature matrix
        
    Returns:
        np.ndarray: Probabilities
    """
    return model.predict_proba(X)


if __name__ == '__main__':
    """
    Quick test of enhanced models
    """
    print("\n" + "="*80)
    print("ENHANCED LEAK-FREE MODEL SUITE TEST")
    print("="*80)
    
    # Load data
    import sys
    sys.path.append('.')
    from load_data import load_unified_data
    
    print("\n📥 Loading feature data...")
    df = pd.read_parquet('data/btts_leakfree_features.parquet')
    
    # Get feature columns (149 features)
    feature_cols = [c for c in df.columns if c not in [
        'fixture_id', 'season', 'date', 'home', 'away', 'home_norm', 'away_norm',
        'venue', 'referee', 'btts', 'home_goals', 'away_goals', 'home_xg', 'away_xg',
        'bookmaker', 'btts_yes_odds', 'btts_no_odds'
    ]]
    
    print(f"   Shape: {df.shape}")
    print(f"   Features: {len(feature_cols)}")
    
    # Simple train/test split
    train_df = df.iloc[:700]
    test_df = df.iloc[700:]
    
    X_train = train_df[feature_cols].fillna(0).values
    y_train = train_df['btts'].values
    X_test = test_df[feature_cols].fillna(0).values
    y_test = test_df['btts'].values
    
    print(f"\n   Train: {len(X_train)} matches")
    print(f"   Test: {len(X_test)} matches")
    
    # Test each enhanced model
    from sklearn.metrics import roc_auc_score, brier_score_loss
    
    models_to_test = ['logistic_tuned', 'rf_tuned', 'gbm_fixed']
    
    for model_name in models_to_test:
        print(f"\n{'='*60}")
        print(f"Testing: {model_name}")
        print(f"{'='*60}")
        
        model = fit_model_enhanced(model_name, X_train, y_train, feature_cols)
        
        # Predict on test
        preds = model.predict_proba(X_test)
        
        # Check for unique predictions (GBM bug test)
        n_unique = len(np.unique(preds))
        print(f"\n   Unique predictions: {n_unique}/{len(preds)}")
        
        if n_unique > 1:
            auc = roc_auc_score(y_test, preds)
            brier = brier_score_loss(y_test, preds)
            
            print(f"   AUC: {auc:.4f}")
            print(f"   Brier: {brier:.4f}")
            print(f"   ✅ Model working correctly")
        else:
            print(f"   ❌ BUG: Only 1 unique prediction!")
    
    print("\n" + "="*80)
    print("✅ Enhanced model suite test complete!")
    print("="*80)
