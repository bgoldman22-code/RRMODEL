#!/usr/bin/env python3
"""
OPTION A BASELINE — ODDS EXCLUDED FROM MODEL FEATURES

Train and freeze the production-ready logistic regression model using ONLY
leak-free features (odds explicitly excluded).

Usage:
    python3 scripts/train_option_a_baseline.py

Outputs:
    - models/logistic_leakfree_tuned_OPTION_A.pkl
    - models/logistic_leakfree_tuned_OPTION_A_metadata.json

Author: Co-CTO
Date: December 16, 2025
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

import pandas as pd
import numpy as np
import pickle
import json
from datetime import datetime
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score, brier_score_loss
import warnings
warnings.filterwarnings('ignore')

# Paths
RESEARCH_DIR = Path(__file__).parent.parent
DATA_DIR = RESEARCH_DIR / 'data'
MODELS_DIR = RESEARCH_DIR / 'models'

# ============================================================================
# EXPECTED BASELINE FEATURE COUNT — DRIFT GUARD
# ============================================================================
EXPECTED_FEATURE_COUNT = 148

# ============================================================================
# CANONICAL EXCLUSION LIST — MUST MATCH features_leakfree.py
# ============================================================================
EXCLUDE_COLS = [
    'fixture_id', 'season', 'date', 'home', 'away', 'home_norm', 'away_norm',
    'venue', 'referee', 'bookmaker', 'btts',
    'home_goals', 'away_goals', 'home_xg', 'away_xg',
    'home_goals_fpl', 'away_goals_fpl',
    'btts_yes_odds', 'btts_no_odds',
]


def main():
    print("=" * 70)
    print("  OPTION A BASELINE — ODDS EXCLUDED FROM MODEL FEATURES")
    print("=" * 70)
    
    features_path = DATA_DIR / 'btts_leakfree_features.parquet'
    
    if not features_path.exists():
        print(f"Features not found at: {features_path}")
        sys.exit(1)
    
    df = pd.read_parquet(features_path)
    print(f"\nLoaded {len(df)} matches")
    
    feature_cols = [c for c in df.columns if c not in EXCLUDE_COLS]
    print(f"Feature columns (reconstructed): {len(feature_cols)}")
    
    assert 'btts_yes_odds' not in feature_cols, "btts_yes_odds found in features!"
    assert 'btts_no_odds' not in feature_cols, "btts_no_odds found in features!"
    print("Confirmed: odds NOT in feature list (Option A enforced)")
    
    if len(feature_cols) != EXPECTED_FEATURE_COUNT:
        print(f"WARNING: Feature count changed! Expected {EXPECTED_FEATURE_COUNT}, got {len(feature_cols)}")
    else:
        print(f"Feature count matches baseline: {EXPECTED_FEATURE_COUNT}")
    
    df = df.sort_values('date').reset_index(drop=True)
    date_min = df['date'].min()
    date_max = df['date'].max()
    print(f"\nTraining date range: {date_min.date()} to {date_max.date()}")
    
    X = df[feature_cols].fillna(0)
    y = df['btts'].values
    
    non_numeric = X.select_dtypes(exclude=[np.number]).columns.tolist()
    if non_numeric:
        print(f"Non-numeric columns found: {non_numeric}")
        sys.exit(1)
    print("All feature columns are numeric")
    
    print(f"\nTraining on {len(X)} matches")
    print(f"   BTTS rate: {y.mean():.3f}")
    
    print("\nTraining Logistic Regression (C=1.0, Platt calibration)...")
    
    C = 1.0
    max_iter = 1000
    
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    base_model = LogisticRegression(
        penalty='l2', C=C, max_iter=max_iter, random_state=42, solver='lbfgs'
    )
    
    calibrated_model = CalibratedClassifierCV(base_model, method='sigmoid', cv=5)
    calibrated_model.fit(X_scaled, y)
    print("Model training complete")
    
    y_pred = calibrated_model.predict_proba(X_scaled)[:, 1]
    auc = roc_auc_score(y, y_pred)
    brier = brier_score_loss(y, y_pred)
    unique_preds = len(np.unique(np.round(y_pred, 4)))
    
    print(f"\nTraining Set Metrics:")
    print(f"   AUC: {auc:.4f}")
    print(f"   Brier Score: {brier:.4f}")
    print(f"   Unique predictions: {unique_preds}/{len(y_pred)}")
    
    model_obj = {
        'model': calibrated_model,
        'scaler': scaler,
        'feature_names': feature_cols,
        'feature_count': len(feature_cols),
        'training_date_range': (str(date_min.date()), str(date_max.date())),
        'training_samples': len(X),
        'btts_rate': float(y.mean()),
        'hyperparameters': {'C': C, 'max_iter': max_iter, 'calibration_method': 'sigmoid', 'calibration_cv': 5},
        'metrics': {'auc': float(auc), 'brier': float(brier)},
        'policy': 'OPTION_A: odds NOT model features',
        'created_at': datetime.now().isoformat()
    }
    
    model_path = MODELS_DIR / 'logistic_leakfree_tuned_OPTION_A.pkl'
    with open(model_path, 'wb') as f:
        pickle.dump(model_obj, f)
    print(f"\nSaved model to: {model_path}")
    
    metadata = {
        'model_name': 'logistic_leakfree_tuned_OPTION_A',
        'feature_policy': 'OPTION A: odds excluded from model features',
        'feature_count': len(feature_cols),
        'feature_names': feature_cols,
        'training_date_range': {'start': str(date_min.date()), 'end': str(date_max.date())},
        'training_samples': len(X),
        'btts_rate': float(y.mean()),
        'hyperparameters': {'C': C, 'max_iter': max_iter, 'calibration_method': 'sigmoid', 'calibration_cv': 5},
        'metrics': {'auc': float(auc), 'brier': float(brier)},
        'created_at': datetime.now().isoformat(),
        'frozen': True,
        'version': 'BTTS_OPTION_A_BASELINE_v1'
    }
    
    metadata_path = MODELS_DIR / 'logistic_leakfree_tuned_OPTION_A_metadata.json'
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved metadata to: {metadata_path}")
    
    print("\n" + "=" * 70)
    print("  OPTION A BASELINE MODEL FROZEN")
    print("=" * 70)
    print(f"   Model: {model_path.name}")
    print(f"   Features: {len(feature_cols)}")
    print(f"   Training range: {date_min.date()} to {date_max.date()}")
    print(f"   AUC: {auc:.4f}")
    print(f"   Policy: OPTION A - odds NOT model features")
    print("=" * 70)


if __name__ == '__main__':
    main()
