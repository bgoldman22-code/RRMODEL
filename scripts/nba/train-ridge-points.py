#!/usr/bin/env python3
"""
Ridge Regression Trainer for Points (ELITE SIMPLE VERSION)

8 Features Only (all we have):
- L5_ppg, L10_ppg, season_ppg
- L5_minutes, L10_minutes
- home, rest_days, back_to_back

Objective: Let DATA determine weights, not humans.
Method: Ridge with CV for alpha tuning.

Usage:
    python scripts/nba/train-ridge-points.py \
        --input data/nba/training-data-leak-free-v2.json \
        --output data/nba/models-ridge/
"""

import json
import numpy as np
import argparse
from pathlib import Path
from sklearn.linear_model import RidgeCV
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score
import warnings
warnings.filterwarnings('ignore')

# Parse arguments
parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True, help='Training data JSON')
parser.add_argument('--output', required=True, help='Output directory for models')
args = parser.parse_args()

print("🏀 Ridge Regression Trainer - Points Only")
print("=" * 60)
print("MY FAMILY IS HELD BY SOMALI PIRATES")
print("THIS MODEL MUST WORK TO FREE THEM")
print("=" * 60)

# Load data
print(f"\n📂 Loading data from {args.input}...")
with open(args.input, 'r') as f:
    data = json.load(f)
print(f"✅ Loaded {len(data)} samples")

# Filter: need at least 5 games played
data = [s for s in data if s.get('features', {}).get('games_played_season', 0) >= 5]
print(f"✅ Filtered to {len(data)} samples (games_played >= 5)")

# Define windows (same as before)
windows = [
    {
        'name': 'Feb 2025',
        'train_start': '2024-10-01',
        'train_end': '2025-01-31',
        'test_start': '2025-02-01',
        'test_end': '2025-02-28'
    }
]

# Feature names (8 simple features we already have)
FEATURE_NAMES = [
    'L5_ppg', 'L10_ppg', 'season_ppg',
    'L5_minutes', 'L10_minutes',
    'home', 'rest_days', 'back_to_back'
]

def extract_features(sample):
    """Extract feature vector from sample"""
    f = sample['features']
    return [
        f.get('L5_ppg') or f.get('L10_ppg') or f.get('season_ppg') or 10,
        f.get('L10_ppg') or f.get('season_ppg') or 10,
        f.get('season_ppg') or 10,
        f.get('L5_minutes') or f.get('L10_minutes') or 25,
        f.get('L10_minutes') or 25,
        1 if f.get('home') == 1 else 0,
        f.get('rest_days') or 1,
        1 if f.get('back_to_back') == 1 else 0
    ]

def train_window(window_data, test_data, window_name):
    """Train Ridge on one window"""
    print(f"\n{'=' * 60}")
    print(f"🔧 Training Window: {window_name}")
    print('=' * 60)
    
    # Extract features and targets
    X_train = np.array([extract_features(s) for s in window_data])
    y_train = np.array([s['actual_points'] for s in window_data])
    
    X_test = np.array([extract_features(s) for s in test_data]) if test_data else None
    y_test = np.array([s['actual_points'] for s in test_data]) if test_data else None
    
    print(f"Train samples: {len(X_train)}")
    print(f"Test samples: {len(X_test) if X_test is not None else 0}")
    
    if X_test is None or len(X_test) == 0:
        print("⚠️  No test data - skipping")
        return None, None, None
    
    # Standardize features (CRITICAL for Ridge)
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train Ridge with cross-validation for alpha
    # Try alphas from 0.01 to 100
    alphas = [0.01, 0.1, 0.5, 1.0, 5.0, 10.0, 50.0, 100.0]
    print(f"\n🔍 Cross-validating alpha (trying {len(alphas)} values)...")
    
    ridge = RidgeCV(alphas=alphas, cv=5, scoring='neg_mean_absolute_error')
    ridge.fit(X_train_scaled, y_train)
    
    print(f"✅ Best alpha: {ridge.alpha_:.4f}")
    
    # Predictions
    y_train_pred = ridge.predict(X_train_scaled)
    y_test_pred = ridge.predict(X_test_scaled)
    
    # Clip to physical limits
    y_test_pred = np.clip(y_test_pred, 0, 60)
    
    # Metrics
    train_mae = mean_absolute_error(y_train, y_train_pred)
    test_mae = mean_absolute_error(y_test, y_test_pred)
    test_r2 = r2_score(y_test, y_test_pred)
    
    print(f"\n📊 Results:")
    print(f"  Train MAE: {train_mae:.2f}")
    print(f"  Test MAE:  {test_mae:.2f}")
    print(f"  Test R²:   {test_r2:.3f}")
    
    # Feature importance (absolute standardized coefficients)
    print(f"\n📈 Feature Weights (standardized):")
    coeffs = list(zip(FEATURE_NAMES, ridge.coef_))
    coeffs.sort(key=lambda x: abs(x[1]), reverse=True)
    for feat, coef in coeffs:
        print(f"  {feat:20s}: {coef:+.4f}")
    
    # Check for systematic bias
    residuals = y_test - y_test_pred
    print(f"\n🔍 Bias Check:")
    print(f"  Mean residual (actual - pred): {np.mean(residuals):+.2f}")
    print(f"  Std residual: {np.std(residuals):.2f}")
    
    # Save model
    model_data = {
        'type': 'ridge_regression',
        'version': 'v1',
        'features': FEATURE_NAMES,
        'alpha': float(ridge.alpha_),
        'coefficients': {name: float(coef) for name, coef in zip(FEATURE_NAMES, ridge.coef_)},
        'intercept': float(ridge.intercept_),
        'scaler_mean': scaler.mean_.tolist(),
        'scaler_scale': scaler.scale_.tolist(),
        'train_mae': float(train_mae),
        'test_mae': float(test_mae),
        'test_r2': float(test_r2),
        'window': window_name
    }
    
    return model_data, y_test_pred, test_data

# Train on window
print("\n" + "=" * 60)
print("🚀 STARTING TRAINING")
print("=" * 60)

window = windows[0]
train_data = [s for s in data if window['train_start'] <= s['gameDate'] <= window['train_end']]
test_data = [s for s in data if window['test_start'] <= s['gameDate'] <= window['test_end']]

model, predictions, test_samples = train_window(train_data, test_data, window['name'])

if model is None:
    print("\n❌ Training failed - no test data")
    exit(1)

# Save model
output_dir = Path(args.output)
output_dir.mkdir(parents=True, exist_ok=True)

model_path = output_dir / 'points-ridge-model.json'
with open(model_path, 'w') as f:
    json.dump(model, f, indent=2)

print(f"\n💾 Saved model to {model_path}")

# Save predictions for backtest
predictions_data = []
for sample, pred in zip(test_samples, predictions):
    predictions_data.append({
        'player': sample['playerName'],
        'date': sample['gameDate'],
        'prediction': float(pred),
        'actual': sample['actual_points'],
        'vegas_line': sample['vegas_lines']['points']
    })

pred_path = output_dir / 'points-predictions.json'
with open(pred_path, 'w') as f:
    json.dump(predictions_data, f, indent=2)

print(f"💾 Saved predictions to {pred_path}")

print("\n" + "=" * 60)
print("✅ RIDGE TRAINING COMPLETE")
print("=" * 60)
print("\nNEXT STEP: Run backtest to see if this frees my family!")
print("  Compare Ridge MAE to baselines:")
print(f"    Ridge:       {model['test_mae']:.2f}")
print("    Baseline v2: 6.37")
print("    Pure L5:     5.48")
