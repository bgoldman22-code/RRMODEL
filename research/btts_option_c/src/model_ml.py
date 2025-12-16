#!/usr/bin/env python3
"""
Phase 2: Modern ML Models

Implements gradient boosting models with hyperparameter optimization:
1. LightGBM
2. XGBoost  
3. CatBoost

All with Optuna hyperparameter search and TIME-AWARE cross-validation.

⚠️  CRITICAL: Uses TimeSeriesSplit to prevent data leakage.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import roc_auc_score, brier_score_loss, log_loss
import lightgbm as lgb
import xgboost as xgb
import catboost as cb
import optuna
import pickle

from feature_config import resolve_active_feature_list

RESEARCH_DIR = Path(__file__).parent.parent
MODELS_DIR = RESEARCH_DIR / 'models'


def train_lgbm_with_optuna(X, y, n_trials=50):
    """
    Train LightGBM with Optuna hyperparameter optimization
    
    Uses TimeSeriesSplit for time-aware CV (trains on past, predicts future).
    """
    print("\n⚡ Training LightGBM with Optuna...")
    print("   CV Strategy: TimeSeriesSplit (time-aware, no data leakage)")
    
    def objective(trial):
        params = {
            'objective': 'binary',
            'metric': 'auc',
            'boosting_type': 'gbdt',
            'num_leaves': trial.suggest_int('num_leaves', 20, 60),
            'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.1, log=True),
            'feature_fraction': trial.suggest_float('feature_fraction', 0.6, 0.95),
            'bagging_fraction': trial.suggest_float('bagging_fraction', 0.6, 0.95),
            'bagging_freq': trial.suggest_int('bagging_freq', 1, 7),
            'min_child_samples': trial.suggest_int('min_child_samples', 5, 50),
            'lambda_l1': trial.suggest_float('lambda_l1', 1e-8, 10.0, log=True),
            'lambda_l2': trial.suggest_float('lambda_l2', 1e-8, 10.0, log=True),
            'verbose': -1,
            'seed': 42
        }
        
        # TIME-SERIES CROSS-VALIDATION (trains on past, tests on future)
        tscv = TimeSeriesSplit(n_splits=5)
        auc_scores = []
        
        for train_idx, val_idx in tscv.split(X):
            X_train, X_val = X[train_idx], X[val_idx]
            y_train, y_val = y[train_idx], y[val_idx]
            
            train_data = lgb.Dataset(X_train, label=y_train)
            val_data = lgb.Dataset(X_val, label=y_val, reference=train_data)
            
            model = lgb.train(
                params,
                train_data,
                num_boost_round=500,
                valid_sets=[val_data],
                callbacks=[lgb.early_stopping(stopping_rounds=30, verbose=False)]
            )
            
            preds = model.predict(X_val)
            auc = roc_auc_score(y_val, preds)
            auc_scores.append(auc)
        
        return np.mean(auc_scores)
    
    study = optuna.create_study(direction='maximize', study_name='lgbm_btts')
    study.optimize(objective, n_trials=n_trials, show_progress_bar=True)
    
    print(f"   ✅ Best AUC: {study.best_value:.4f}")
    print(f"   ✅ Best params: {study.best_params}")
    
    # Train final model with best params
    best_params = study.best_params
    best_params.update({'objective': 'binary', 'metric': 'auc', 'verbose': -1, 'seed': 42})
    
    train_data = lgb.Dataset(X, label=y)
    final_model = lgb.train(best_params, train_data, num_boost_round=500)
    
    return final_model, study.best_params


def train_xgboost_with_optuna(X, y, n_trials=50):
    """
    Train XGBoost with Optuna hyperparameter optimization
    
    Uses TimeSeriesSplit for time-aware CV (trains on past, predicts future).
    """
    print("\n🚀 Training XGBoost with Optuna...")
    print("   CV Strategy: TimeSeriesSplit (time-aware, no data leakage)")
    
    def objective(trial):
        params = {
            'objective': 'binary:logistic',
            'eval_metric': 'auc',
            'max_depth': trial.suggest_int('max_depth', 3, 10),
            'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.1, log=True),
            'n_estimators': trial.suggest_int('n_estimators', 100, 500),
            'min_child_weight': trial.suggest_int('min_child_weight', 1, 10),
            'subsample': trial.suggest_float('subsample', 0.6, 0.95),
            'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 0.95),
            'reg_alpha': trial.suggest_float('reg_alpha', 1e-8, 10.0, log=True),
            'reg_lambda': trial.suggest_float('reg_lambda', 1e-8, 10.0, log=True),
            'random_state': 42
        }
        
        # TIME-SERIES CROSS-VALIDATION
        tscv = TimeSeriesSplit(n_splits=5)
        auc_scores = []
        
        for train_idx, val_idx in tscv.split(X):
            X_train, X_val = X[train_idx], X[val_idx]
            y_train, y_val = y[train_idx], y[val_idx]
            
            model = xgb.XGBClassifier(**params)
            # XGBoost 3.0+ uses early_stopping_rounds parameter directly in fit()
            model.fit(
                X_train, y_train, 
                eval_set=[(X_val, y_val)],
                early_stopping_rounds=30,
                verbose=False
            )
            
            preds = model.predict_proba(X_val)[:, 1]
            auc = roc_auc_score(y_val, preds)
            auc_scores.append(auc)
        
        return np.mean(auc_scores)
    
    study = optuna.create_study(direction='maximize', study_name='xgb_btts')
    study.optimize(objective, n_trials=n_trials, show_progress_bar=True)
    
    print(f"   ✅ Best AUC: {study.best_value:.4f}")
    print(f"   ✅ Best params: {study.best_params}")
    
    best_params = study.best_params
    best_params.update({'objective': 'binary:logistic', 'eval_metric': 'auc', 'random_state': 42})
    
    final_model = xgb.XGBClassifier(**best_params)
    final_model.fit(X, y)
    
    return final_model, study.best_params


def train_catboost_with_optuna(X, y, n_trials=50):
    """
    Train CatBoost with Optuna hyperparameter optimization
    
    Uses TimeSeriesSplit for time-aware CV (trains on past, predicts future).
    """
    print("\n🐱 Training CatBoost with Optuna...")
    print("   CV Strategy: TimeSeriesSplit (time-aware, no data leakage)")
    
    def objective(trial):
        params = {
            'iterations': trial.suggest_int('iterations', 100, 500),
            'depth': trial.suggest_int('depth', 4, 10),
            'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.1, log=True),
            'l2_leaf_reg': trial.suggest_float('l2_leaf_reg', 1e-8, 10.0, log=True),
            'border_count': trial.suggest_int('border_count', 32, 255),
            'random_seed': 42,
            'verbose': False
        }
        
        # TIME-SERIES CROSS-VALIDATION
        tscv = TimeSeriesSplit(n_splits=5)
        auc_scores = []
        
        for train_idx, val_idx in tscv.split(X):
            X_train, X_val = X[train_idx], X[val_idx]
            y_train, y_val = y[train_idx], y[val_idx]
            
            model = cb.CatBoostClassifier(**params)
            model.fit(X_train, y_train, eval_set=(X_val, y_val),
                     early_stopping_rounds=30, verbose=False)
            
            preds = model.predict_proba(X_val)[:, 1]
            auc = roc_auc_score(y_val, preds)
            auc_scores.append(auc)
        
        return np.mean(auc_scores)
    
    study = optuna.create_study(direction='maximize', study_name='catboost_btts')
    study.optimize(objective, n_trials=n_trials, show_progress_bar=True)
    
    print(f"   ✅ Best AUC: {study.best_value:.4f}")
    print(f"   ✅ Best params: {study.best_params}")
    
    best_params = study.best_params
    best_params.update({'random_seed': 42, 'verbose': False})
    
    final_model = cb.CatBoostClassifier(**best_params)
    final_model.fit(X, y)
    
    return final_model, study.best_params


def train_modern_ml_models(df, n_trials=30):
    """
    Train all Phase 2 modern ML models
    
    Returns:
        dict of trained models and performance metrics
    """
    print("=" * 80)
    print("PHASE 2: MODERN ML MODEL TRAINING")
    print("=" * 80)
    
    from feature_importance import prepare_feature_matrix
    X, y, feature_names = prepare_feature_matrix(df)
    
    results = {}
    
    # Model 1: LightGBM
    lgbm_model, lgbm_params = train_lgbm_with_optuna(X, y, n_trials=n_trials)
    lgbm_preds = lgbm_model.predict(X)
    
    results['lightgbm'] = {
        'model': lgbm_model,
        'params': lgbm_params,
        'predictions': lgbm_preds,
        'auc': roc_auc_score(y, lgbm_preds),
        'brier': brier_score_loss(y, lgbm_preds),
        'logloss': log_loss(y, lgbm_preds),
        'cv_strategy': 'TimeSeriesSplit(n_splits=5)'
    }
    
    with open(MODELS_DIR / 'lightgbm_btts.pkl', 'wb') as f:
        pickle.dump(lgbm_model, f)
    
    # Model 2: XGBoost
    xgb_model, xgb_params = train_xgboost_with_optuna(X, y, n_trials=n_trials)
    xgb_preds = xgb_model.predict_proba(X)[:, 1]
    
    results['xgboost'] = {
        'model': xgb_model,
        'params': xgb_params,
        'predictions': xgb_preds,
        'auc': roc_auc_score(y, xgb_preds),
        'brier': brier_score_loss(y, xgb_preds),
        'logloss': log_loss(y, xgb_preds),
        'cv_strategy': 'TimeSeriesSplit(n_splits=5)'
    }
    
    with open(MODELS_DIR / 'xgboost_btts.pkl', 'wb') as f:
        pickle.dump(xgb_model, f)
    
    # Model 3: CatBoost
    cb_model, cb_params = train_catboost_with_optuna(X, y, n_trials=n_trials)
    cb_preds = cb_model.predict_proba(X)[:, 1]
    
    results['catboost'] = {
        'model': cb_model,
        'params': cb_params,
        'predictions': cb_preds,
        'auc': roc_auc_score(y, cb_preds),
        'brier': brier_score_loss(y, cb_preds),
        'logloss': log_loss(y, cb_preds),
        'cv_strategy': 'TimeSeriesSplit(n_splits=5)'
    }
    
    with open(MODELS_DIR / 'catboost_btts.pkl', 'wb') as f:
        pickle.dump(cb_model, f)
    
    print("\n✅ Phase 2 modern ML training complete!")
    
    return results


# ============================================================================
# WALKFORWARD-COMPATIBLE FIT/PREDICT FUNCTIONS
# ============================================================================

def prepare_features_ml(train_df, test_df=None, exclude_cols=None):
    """
    Extract feature matrix and target from DataFrame for ML models
    
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
        raise ValueError("[FATAL] Feature selection produced an empty allowlist for Phase 2 models")
    if len(feature_cols) > 25:
        raise ValueError(f"[FATAL] Feature allowlist too large: {len(feature_cols)} > 25")
    
    # 🚨 BANNED FEATURE CHECK: Crash if any leaked features sneak in
    BANNED_SUBSTRINGS = ["goals_fpl", "home_goals", "away_goals", "_shots", "_corners", "_fouls", "_cards"]
    for f in feature_cols:
        for banned in BANNED_SUBSTRINGS:
            if banned in f:
                raise ValueError(f"[FATAL] Banned feature '{banned}' found in Phase 2 feature set: {f}")

    if not hasattr(prepare_features_ml, '_feature_allowlist_logged'):
        print(f"\n🧱 Using prediction-safe feature allowlist (Phase 2): {len(feature_cols)} features")
        for col in feature_cols:
            print(f"   - {col}")
        prepare_features_ml._feature_allowlist_logged = True

    # Select only numeric columns from TRAIN
    X_train_df = train_df[feature_cols].select_dtypes(include=[np.number])
    numeric_feature_cols = X_train_df.columns.tolist()
    if len(numeric_feature_cols) == 0:
        raise ValueError("No numeric prediction-safe features available for Phase 2 models")
    dropped_non_numeric = [c for c in feature_cols if c not in numeric_feature_cols]
    if dropped_non_numeric:
        print(f"⚠️  Dropped non-numeric features: {dropped_non_numeric}")
    
    # 🔍 LEAKAGE CHECK: Log features once (first call only)
    if not hasattr(prepare_features_ml, '_features_logged'):
        print("\n🔍 FEATURE LEAKAGE CHECK (Phase 2 - Modern ML):")
        print(f"   Total features: {len(X_train_df.columns)}")
        leaky_features = [c for c in X_train_df.columns if 'goals_fpl' in c.lower()]
        if leaky_features:
            print(f"   ❌ WARNING: Found leaked features: {leaky_features}")
        else:
            print(f"   ✅ No 'goals_fpl' features found")
        prepare_features_ml._features_logged = True
    
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


def fit_lightgbm(train_df, params=None):
    """
    Fit LightGBM model on training data
    
    Args:
        train_df: DataFrame with features and 'btts' column
        params: Optional hyperparameters (uses defaults if None)
    
    Returns:
        Dict with {'model': fitted_model, 'train_df': train_df_copy}
    """
    X, y, feature_names = prepare_features_ml(train_df, test_df=None)
    
    # DEBUG: Check for potential issues
    if len(X) != len(train_df):
        print(f"⚠️  WARNING: X length ({len(X)}) != train_df length ({len(train_df)})")
    if len(np.unique(y)) < 2:
        print(f"⚠️  WARNING: Only {len(np.unique(y))} unique labels in training data")
    
    if params is None:
        # Default parameters (reasonable baseline)
        params = {
            'objective': 'binary',
            'metric': 'auc',
            'boosting_type': 'gbdt',
            'num_leaves': 31,
            'learning_rate': 0.05,
            'feature_fraction': 0.8,
            'bagging_fraction': 0.8,
            'bagging_freq': 5,
            'min_child_samples': 20,
            'lambda_l1': 0.01,
            'lambda_l2': 0.01,
            'verbose': -1,
            'seed': 42
        }
    
    train_data = lgb.Dataset(X, label=y, feature_name=feature_names)
    model = lgb.train(
        params,
        train_data,
        num_boost_round=300,
        valid_sets=[train_data],
        callbacks=[lgb.early_stopping(stopping_rounds=30, verbose=False)]
    )
    
    # Return model + training data for leakage-free imputation
    return {'model': model, 'train_df': train_df.copy()}


def predict_lightgbm(model_dict, test_df):
    """
    Generate predictions from LightGBM model
    
    Args:
        model_dict: Dict from fit_lightgbm with {'model', 'train_df'}
        test_df: DataFrame with same features as training
    
    Returns:
        np.ndarray of BTTS probabilities
    """
    # Use leakage-free feature prep (fits on train, applies to test)
    _, _, X_test, _, _ = prepare_features_ml(model_dict['train_df'], test_df)
    return model_dict['model'].predict(X_test)


def fit_xgboost(train_df, params=None):
    """
    Fit XGBoost model on training data
    
    Args:
        train_df: DataFrame with features and 'btts' column
        params: Optional hyperparameters (uses defaults if None)
    
    Returns:
        Dict with {'model': fitted_model, 'train_df': train_df_copy}
    """
    X, y, feature_names = prepare_features_ml(train_df, test_df=None)
    
    if params is None:
        # Default parameters (reasonable baseline)
        params = {
            'objective': 'binary:logistic',
            'eval_metric': 'auc',
            'max_depth': 6,
            'learning_rate': 0.05,
            'n_estimators': 300,
            'min_child_weight': 5,
            'subsample': 0.8,
            'colsample_bytree': 0.8,
            'reg_alpha': 0.01,
            'reg_lambda': 0.01,
            'seed': 42
        }
    
    model = xgb.XGBClassifier(**params)
    model.fit(X, y)
    
    return {'model': model, 'train_df': train_df.copy()}


def predict_xgboost(model_dict, test_df):
    """
    Generate predictions from XGBoost model
    
    Args:
        model_dict: Dict from fit_xgboost with {'model', 'train_df'}
        test_df: DataFrame with same features as training
    
    Returns:
        np.ndarray of BTTS probabilities
    """
    _, _, X_test, _, _ = prepare_features_ml(model_dict['train_df'], test_df)
    return model_dict['model'].predict_proba(X_test)[:, 1]


def fit_catboost(train_df, params=None):
    """
    Fit CatBoost model on training data
    
    Args:
        train_df: DataFrame with features and 'btts' column
        params: Optional hyperparameters (uses defaults if None)
    
    Returns:
        Dict with {'model': fitted_model, 'train_df': train_df_copy}
    """
    X, y, feature_names = prepare_features_ml(train_df, test_df=None)
    
    if params is None:
        # Default parameters (reasonable baseline)
        params = {
            'iterations': 300,
            'learning_rate': 0.05,
            'depth': 6,
            'l2_leaf_reg': 3,
            'random_seed': 42,
            'verbose': False
        }
    
    model = cb.CatBoostClassifier(**params)
    model.fit(X, y)
    
    return {'model': model, 'train_df': train_df.copy()}


def predict_catboost(model_dict, test_df):
    """
    Generate predictions from CatBoost model
    
    Args:
        model_dict: Dict from fit_catboost with {'model', 'train_df'}
        test_df: DataFrame with same features as training
    
    Returns:
        np.ndarray of BTTS probabilities
    """
    _, _, X_test, _, _ = prepare_features_ml(model_dict['train_df'], test_df)
    return model_dict['model'].predict_proba(X_test)[:, 1]


if __name__ == '__main__':
    import sys
    sys.path.append(str(Path(__file__).parent))
    
    from load_data import load_unified_data
    from build_features import build_all_features
    
    df = load_unified_data()
    df = build_all_features(df)
    
    results = train_modern_ml_models(df, n_trials=30)
    
    print("\n" + "=" * 80)
    print("PHASE 2 RESULTS SUMMARY")
    print("=" * 80)
    
    for model_name, metrics in results.items():
        print(f"\n{model_name.upper()}:")
        print(f"  AUC: {metrics['auc']:.4f}")
        print(f"  Brier: {metrics['brier']:.4f}")
        print(f"  LogLoss: {metrics['logloss']:.4f}")
