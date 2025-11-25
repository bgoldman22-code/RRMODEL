#!/usr/bin/env python3
"""
Phase 3 PRA Model Trainer

This script trains logistic regression models for PRA OVER/UNDER predictions
using the zero-leakage walkforward training dataset.

Key Features:
- Separate models for PRA_OVER and PRA_UNDER
- StandardScaler for feature normalization
- Train/test split with temporal ordering preserved
- Feature importance analysis
- Model serialization (pickle + JSON)

Usage:
    python scripts/nba/train-phase3-pra-models.py

Output:
    data/nba/models/phase3/pra_over_model_v1_YYYYMMDD.pkl
    data/nba/models/phase3/pra_over_coefficients_v1_YYYYMMDD.json
    data/nba/models/phase3/pra_under_model_v1_YYYYMMDD.pkl
    data/nba/models/phase3/pra_under_coefficients_v1_YYYYMMDD.json
"""

import json
import pickle
import os
from datetime import datetime
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score, classification_report

# Paths
REPO_ROOT = Path(__file__).parent.parent.parent
TRAINING_DIR = REPO_ROOT / 'data' / 'nba' / 'training'
OUTPUT_DIR = REPO_ROOT / 'data' / 'nba' / 'models' / 'phase3'
CHECKPOINT_FILE = REPO_ROOT / 'data' / 'nba' / 'phase3_checkpoints.json'

# Feature columns
FEATURE_COLUMNS = [
    'L5_ppg', 'L10_ppg', 'L999_ppg',
    'L5_rpg', 'L10_rpg', 'L999_rpg',
    'L5_apg', 'L10_apg', 'L999_apg',
    'L5_pra', 'L10_pra', 'L999_pra',
    'L5_minutes', 'L10_minutes',
    'L5_fga', 'L10_fga',
    'L5_fta', 'L10_fta',
    'opp_def_L5_pra_allowed', 'opp_def_L10_pra_allowed',
    'opp_def_L5_ppg_allowed', 'opp_def_L10_ppg_allowed',
    'opp_def_L5_rpg_allowed', 'opp_def_L10_rpg_allowed',
    'opp_def_L5_apg_allowed', 'opp_def_L10_apg_allowed',
    'rest_days', 'home', 'line', 'games_played'
]

print('[train-phase3-pra-models] Phase 3 PRA Model Trainer')
print('[train-phase3-pra-models] Logistic regression for OVER/UNDER predictions\n')


def load_training_data():
    """Load training dataset from JSONL"""
    print('[1/7] Loading training dataset...')
    
    # Find most recent training file
    training_files = list(TRAINING_DIR.glob('phase3_training_v1_*.jsonl'))
    if not training_files:
        raise FileNotFoundError(f'No training files found in {TRAINING_DIR}')
    
    training_file = sorted(training_files)[-1]
    print(f'  📁 Loading: {training_file.name}')
    
    # Load JSONL
    examples = []
    with open(training_file, 'r') as f:
        for line in f:
            examples.append(json.loads(line))
    
    print(f'  ✅ Loaded {len(examples)} training examples')
    
    return examples


def filter_by_market(examples, market_types):
    """Filter examples by market type (player_points, player_rebounds, player_assists)"""
    print(f'\n[2/7] Filtering by markets: {market_types}...')
    
    filtered = [ex for ex in examples if ex['market'] in market_types]
    
    print(f'  ✅ Filtered to {len(filtered)} examples')
    
    return filtered


def split_by_side(examples):
    """Split into OVER and UNDER datasets"""
    print('\n[3/7] Splitting by bet side...')
    
    over_examples = [ex for ex in examples if ex['side'] == 'Over']
    under_examples = [ex for ex in examples if ex['side'] == 'Under']
    
    print(f'  OVER examples: {len(over_examples)}')
    print(f'  UNDER examples: {len(under_examples)}')
    
    return over_examples, under_examples


def prepare_features(examples):
    """Extract features and target from examples"""
    X = []
    y = []
    
    for ex in examples:
        features = []
        for col in FEATURE_COLUMNS:
            val = ex.get(col, 0)
            # Handle missing values
            if val is None or (isinstance(val, float) and np.isnan(val)):
                val = 0
            features.append(float(val))
        
        X.append(features)
        y.append(ex['result'])
    
    return np.array(X), np.array(y)


def train_test_split_temporal(examples, test_size=0.2):
    """Split data temporally (later dates as test set)"""
    # Sort by date
    examples_sorted = sorted(examples, key=lambda x: x['date'])
    
    split_idx = int(len(examples_sorted) * (1 - test_size))
    
    train_examples = examples_sorted[:split_idx]
    test_examples = examples_sorted[split_idx:]
    
    print(f'  Train dates: {train_examples[0]["date"]} to {train_examples[-1]["date"]}')
    print(f'  Test dates: {test_examples[0]["date"]} to {test_examples[-1]["date"]}')
    
    return train_examples, test_examples


def train_model(examples, model_name):
    """Train logistic regression model"""
    print(f'\n[4/7] Training {model_name}...')
    
    # Temporal split
    train_examples, test_examples = train_test_split_temporal(examples, test_size=0.2)
    
    print(f'  Train size: {len(train_examples)}')
    print(f'  Test size: {len(test_examples)}')
    
    # Prepare features
    X_train, y_train = prepare_features(train_examples)
    X_test, y_test = prepare_features(test_examples)
    
    print(f'  Feature shape: {X_train.shape}')
    print(f'  Target distribution (train): {np.mean(y_train):.3f}')
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train logistic regression
    print(f'  🎯 Training LogisticRegression...')
    model = LogisticRegression(
        max_iter=1000,
        random_state=42,
        class_weight='balanced',  # Handle class imbalance
        solver='lbfgs'
    )
    model.fit(X_train_scaled, y_train)
    
    # Evaluate
    print(f'\n[5/7] Evaluating {model_name}...')
    
    train_pred = model.predict(X_train_scaled)
    test_pred = model.predict(X_test_scaled)
    
    train_pred_proba = model.predict_proba(X_train_scaled)[:, 1]
    test_pred_proba = model.predict_proba(X_test_scaled)[:, 1]
    
    train_acc = accuracy_score(y_train, train_pred)
    test_acc = accuracy_score(y_test, test_pred)
    
    train_auc = roc_auc_score(y_train, train_pred_proba)
    test_auc = roc_auc_score(y_test, test_pred_proba)
    
    print(f'  Train Accuracy: {train_acc:.4f}')
    print(f'  Test Accuracy: {test_acc:.4f}')
    print(f'  Train AUC: {train_auc:.4f}')
    print(f'  Test AUC: {test_auc:.4f}')
    
    # Classification report
    print(f'\n  Classification Report (Test):')
    print(classification_report(y_test, test_pred, target_names=['Loss', 'Win']))
    
    # Feature importance
    coefficients = model.coef_[0]
    feature_importance = sorted(
        zip(FEATURE_COLUMNS, coefficients),
        key=lambda x: abs(x[1]),
        reverse=True
    )
    
    print(f'\n  Top 10 Features:')
    for feat, coef in feature_importance[:10]:
        print(f'    {feat:30s} {coef:+.4f}')
    
    # Package model
    model_package = {
        'model': model,
        'scaler': scaler,
        'feature_columns': FEATURE_COLUMNS,
        'metrics': {
            'train_accuracy': float(train_acc),
            'test_accuracy': float(test_acc),
            'train_auc': float(train_auc),
            'test_auc': float(test_auc),
            'n_train': len(train_examples),
            'n_test': len(test_examples)
        },
        'coefficients': dict(zip(FEATURE_COLUMNS, coefficients.tolist())),
        'intercept': float(model.intercept_[0])
    }
    
    return model_package


def save_model(model_package, model_name):
    """Save model as pickle and JSON coefficients"""
    print(f'\n[6/7] Saving {model_name}...')
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    date_str = datetime.now().strftime('%Y%m%d')
    
    # Save pickle (full model)
    pickle_file = OUTPUT_DIR / f'{model_name}_model_v1_{date_str}.pkl'
    with open(pickle_file, 'wb') as f:
        pickle.dump(model_package, f)
    
    print(f'  ✅ Saved model pickle: {pickle_file.name}')
    
    # Save JSON (coefficients only, for JS inference)
    json_file = OUTPUT_DIR / f'{model_name}_coefficients_v1_{date_str}.json'
    
    json_data = {
        'version': 'v1',
        'created': datetime.now().isoformat(),
        'model_type': 'LogisticRegression',
        'feature_columns': FEATURE_COLUMNS,
        'coefficients': model_package['coefficients'],
        'intercept': model_package['intercept'],
        'scaler_mean': model_package['scaler'].mean_.tolist(),
        'scaler_scale': model_package['scaler'].scale_.tolist(),
        'metrics': model_package['metrics']
    }
    
    with open(json_file, 'w') as f:
        json.dump(json_data, f, indent=2)
    
    print(f'  ✅ Saved coefficients JSON: {json_file.name}')
    
    return {
        'pickle_file': str(pickle_file),
        'json_file': str(json_file)
    }


def update_checkpoint(artifacts, metrics):
    """Update phase3_checkpoints.json"""
    print('\n[7/7] Updating checkpoint...')
    
    try:
        if CHECKPOINT_FILE.exists():
            with open(CHECKPOINT_FILE, 'r') as f:
                checkpoint_data = json.load(f)
        else:
            checkpoint_data = {'checkpoints': []}
        
        checkpoint_data['checkpoints'].append({
            'timestamp': datetime.now().isoformat(),
            'step': 'train_phase3_pra_models',
            'artifacts': artifacts,
            'metrics': metrics,
            'notes': f'Trained PRA OVER/UNDER models with test accuracy {metrics["over_test_acc"]:.3f} / {metrics["under_test_acc"]:.3f}'
        })
        
        with open(CHECKPOINT_FILE, 'w') as f:
            json.dump(checkpoint_data, f, indent=2)
        
        print('  ✅ Checkpoint updated')
    except Exception as e:
        print(f'  ⚠️  Checkpoint update failed: {e}')


def main():
    start_time = datetime.now()
    
    print('=' * 60)
    print('Phase 3 PRA Model Trainer')
    print('Logistic Regression for OVER/UNDER Predictions')
    print('=' * 60 + '\n')
    
    # Load data
    examples = load_training_data()
    
    # Filter to PRA-relevant markets
    # For PRA predictions, we want all three markets (points + rebounds + assists)
    pra_examples = filter_by_market(examples, ['player_points', 'player_rebounds', 'player_assists'])
    
    # Split by side
    over_examples, under_examples = split_by_side(pra_examples)
    
    # Train OVER model
    over_model = train_model(over_examples, 'pra_over')
    
    # Train UNDER model
    under_model = train_model(under_examples, 'pra_under')
    
    # Save models
    over_artifacts = save_model(over_model, 'pra_over')
    under_artifacts = save_model(under_model, 'pra_under')
    
    # Combine artifacts
    all_artifacts = {**over_artifacts, **under_artifacts}
    
    metrics = {
        'over_test_acc': over_model['metrics']['test_accuracy'],
        'over_test_auc': over_model['metrics']['test_auc'],
        'under_test_acc': under_model['metrics']['test_accuracy'],
        'under_test_auc': under_model['metrics']['test_auc']
    }
    
    # Update checkpoint
    update_checkpoint(all_artifacts, metrics)
    
    elapsed = (datetime.now() - start_time).total_seconds()
    
    print('\n' + '=' * 60)
    print('✅ COMPLETE: PRA models trained and saved')
    print('=' * 60)
    print(f'Total time: {elapsed:.1f} seconds')
    print(f'\n📊 Model Performance:')
    print(f'   PRA OVER:  Test Acc={metrics["over_test_acc"]:.3f}, AUC={metrics["over_test_auc"]:.3f}')
    print(f'   PRA UNDER: Test Acc={metrics["under_test_acc"]:.3f}, AUC={metrics["under_test_auc"]:.3f}')
    print(f'\n🎯 Next step: Run walkforward backtest (Phase E)')
    print(f'   Run: node scripts/nba/backtest-phase3.mjs')


if __name__ == '__main__':
    main()
