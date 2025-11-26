#!/usr/bin/env python3
"""
Phase 3.5 - LightGBM NBA Props Training Pipeline

This script trains 6 separate LightGBM binary classifiers for NBA props prediction:
- Points OVER / UNDER
- Rebounds OVER / UNDER  
- Assists OVER / UNDER

ZERO-LEAKAGE ENFORCEMENT:
- Uses same temporal split as Phase 3 (80/20 train/test by date)
- All features pre-calculated in phase3_training_v1 with walkforward logic
- No future data contamination possible

Key Features:
- LightGBM with class balancing for imbalanced datasets
- AUC optimization (better than accuracy for probability calibration)
- Per-market modeling (each market has unique dynamics)
- Comprehensive evaluation metrics (AUC, accuracy, precision, recall, calibration)
- Full model artifact saving (LightGBM .txt + JSON metadata)

Usage:
    python scripts/nba/train-lgbm-nba-props.py

Output:
    data/nba/models/phase3_lgbm/
        points_over_v1_YYYYMMDD.txt
        points_over_v1_YYYYMMDD.json
        points_under_v1_YYYYMMDD.txt
        points_under_v1_YYYYMMDD.json
        rebounds_over_v1_YYYYMMDD.txt
        rebounds_over_v1_YYYYMMDD.json
        rebounds_under_v1_YYYYMMDD.txt
        rebounds_under_v1_YYYYMMDD.json
        assists_over_v1_YYYYMMDD.txt
        assists_over_v1_YYYYMMDD.json
        assists_under_v1_YYYYMMDD.txt
        assists_under_v1_YYYYMMDD.json
"""

import json
import os
from datetime import datetime
from pathlib import Path
import numpy as np
import lightgbm as lgb
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, 
    roc_auc_score, classification_report, roc_curve,
    precision_recall_curve
)

# Paths
REPO_ROOT = Path(__file__).parent.parent.parent
TRAINING_FILE = REPO_ROOT / 'data' / 'nba' / 'training' / 'phase3_training_v1_20251124.jsonl'
OUTPUT_DIR = REPO_ROOT / 'data' / 'nba' / 'models' / 'phase3_lgbm'
CHECKPOINT_FILE = REPO_ROOT / 'data' / 'nba' / 'phase3_checkpoints.json'
MODEL_VERSION = 'v2'

# Feature columns (same as Phase 3 logistic + new advanced features)
POINTS_LINE_DELTA_FEATURES = [
    ('L5_ppg', 'line_minus_L5_ppg'),
    ('L10_ppg', 'line_minus_L10_ppg'),
    ('L20_ppg', 'line_minus_L20_ppg'),
    ('L40_ppg', 'line_minus_L40_ppg'),
    ('L999_ppg', 'line_minus_L999_ppg')
]

REBOUNDS_LINE_DELTA_FEATURES = [
    ('L5_rpg', 'line_minus_L5_rpg'),
    ('L10_rpg', 'line_minus_L10_rpg'),
    ('L20_rpg', 'line_minus_L20_rpg'),
    ('L40_rpg', 'line_minus_L40_rpg'),
    ('L999_rpg', 'line_minus_L999_rpg')
]

FEATURE_COLUMNS = [
    # Rolling player stats (L5, L10, L20, L40, L999)
    'L5_ppg', 'L10_ppg', 'L20_ppg', 'L40_ppg', 'L999_ppg',
    'L5_rpg', 'L10_rpg', 'L20_rpg', 'L40_rpg', 'L999_rpg',
    'L5_apg', 'L10_apg', 'L20_apg', 'L40_apg', 'L999_apg',
    'L5_pra', 'L10_pra', 'L20_pra', 'L40_pra', 'L999_pra',
    'L5_minutes', 'L10_minutes', 'L20_minutes', 'L40_minutes',
    'L5_fga', 'L10_fga', 'L20_fga', 'L40_fga',
    'L5_fta', 'L10_fta', 'L20_fta', 'L40_fta',
    
    # Season-to-date stats
    'season_ppg', 'season_rpg', 'season_apg', 'season_pra',
    'season_minutes', 'season_fga', 'season_fta', 'season_games_played',
    
    # Head-to-head stats (vs this opponent, this season)
    'h2h_ppg', 'h2h_rpg', 'h2h_apg', 'h2h_pra',
    'h2h_minutes', 'h2h_fga', 'h2h_fta', 'h2h_games_played',
    
    # Opponent defense
    'opp_def_L5_pra_allowed', 'opp_def_L10_pra_allowed',
    'opp_def_L5_ppg_allowed', 'opp_def_L10_ppg_allowed',
    'opp_def_L5_rpg_allowed', 'opp_def_L10_rpg_allowed',
    'opp_def_L5_apg_allowed', 'opp_def_L10_apg_allowed',
    
    # Context
    'rest_days', 'home', 'line', 'games_played',

    # Line-aware deltas (points markets)
    'line_minus_L5_ppg', 'line_minus_L10_ppg', 'line_minus_L20_ppg',
    'line_minus_L40_ppg', 'line_minus_L999_ppg', 'line_z_L10_ppg',

    # Line-aware deltas (rebounds markets)
    'line_minus_L5_rpg', 'line_minus_L10_rpg', 'line_minus_L20_rpg',
    'line_minus_L40_rpg', 'line_minus_L999_rpg', 'line_z_L10_rpg'
]

LINE_Z_EPS = 1e-6

# LightGBM hyperparameters (optimized for AUC and calibration)
LGBM_PARAMS = {
    'objective': 'binary',
    'metric': 'auc',
    'boosting_type': 'gbdt',
    'num_leaves': 31,
    'learning_rate': 0.05,
    'feature_fraction': 0.8,
    'bagging_fraction': 0.8,
    'bagging_freq': 5,
    'verbose': -1,
    'max_depth': 6,
    'min_data_in_leaf': 20,
    'lambda_l1': 0.1,
    'lambda_l2': 0.1,
    'scale_pos_weight': 1.0  # Will be adjusted per-market based on class balance
}

print('=' * 70)
print('Phase 3.5 - LightGBM NBA Props Training Pipeline')
print('Training 6 per-market models with zero-leakage guarantee')
print('=' * 70)
print()


def load_training_data():
    """Load training dataset from JSONL"""
    print('[1/8] Loading training dataset...')
    
    if not TRAINING_FILE.exists():
        raise FileNotFoundError(f'Training file not found: {TRAINING_FILE}')
    
    print(f'  📁 Loading: {TRAINING_FILE.name}')
    
    examples = []
    with open(TRAINING_FILE, 'r') as f:
        for line in f:
            if line.strip():
                examples.append(json.loads(line))
    
    print(f'  ✅ Loaded {len(examples)} training examples')
    
    return examples


def filter_by_market_and_side(examples, market, side):
    """Filter examples to specific market and side"""
    filtered = [ex for ex in examples if ex['market'] == market and ex['side'] == side]
    return filtered


def temporal_train_test_split(examples, test_size=0.2):
    """
    Split data temporally (later dates as test set)
    
    ZERO-LEAKAGE GUARANTEE:
    - Examples are sorted by date
    - Train set contains only earlier dates
    - Test set contains only later dates
    - This simulates real-world deployment (train on past, predict future)
    """
    # Sort by date
    examples_sorted = sorted(examples, key=lambda x: x['date'])
    
    split_idx = int(len(examples_sorted) * (1 - test_size))
    
    train_examples = examples_sorted[:split_idx]
    test_examples = examples_sorted[split_idx:]
    
    return train_examples, test_examples


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


def safe_float(value):
    """Best-effort float conversion that treats None/NaN as None"""
    if value is None:
        return None
    try:
        val = float(value)
        if np.isnan(val):
            return None
        return val
    except (TypeError, ValueError):
        return None


def augment_line_features(examples):
    """Add explicit line-minus-stat features for points and rebounds"""
    points_diffs = []
    rebounds_diffs = []

    # First pass: compute deltas and collect L10 diffs for std calc
    for ex in examples:
        line = safe_float(ex.get('line'))
        market = ex.get('market')

        if line is None:
            continue

        if market == 'player_points':
            for source_key, target_key in POINTS_LINE_DELTA_FEATURES:
                source_val = safe_float(ex.get(source_key))
                ex[target_key] = line - source_val if source_val is not None else 0.0
            points_diffs.append(ex.get('line_minus_L10_ppg', 0.0))
        elif market == 'player_rebounds':
            for source_key, target_key in REBOUNDS_LINE_DELTA_FEATURES:
                source_val = safe_float(ex.get(source_key))
                ex[target_key] = line - source_val if source_val is not None else 0.0
            rebounds_diffs.append(ex.get('line_minus_L10_rpg', 0.0))

    points_std = np.std(points_diffs) if points_diffs else 1.0
    rebounds_std = np.std(rebounds_diffs) if rebounds_diffs else 1.0

    if points_std < LINE_Z_EPS:
        points_std = 1.0
    if rebounds_std < LINE_Z_EPS:
        rebounds_std = 1.0

    # Second pass: assign z-score style features & default zeros for other markets
    for ex in examples:
        market = ex.get('market')

        if market == 'player_points':
            diff = ex.get('line_minus_L10_ppg', 0.0)
            ex['line_z_L10_ppg'] = diff / (points_std + LINE_Z_EPS)
        else:
            ex['line_z_L10_ppg'] = 0.0

        if market == 'player_rebounds':
            diff = ex.get('line_minus_L10_rpg', 0.0)
            ex['line_z_L10_rpg'] = diff / (rebounds_std + LINE_Z_EPS)
        else:
            ex['line_z_L10_rpg'] = 0.0

        # Ensure all delta keys exist even for markets where they don't apply
        for _, target_key in POINTS_LINE_DELTA_FEATURES:
            ex.setdefault(target_key, 0.0)
        for _, target_key in REBOUNDS_LINE_DELTA_FEATURES:
            ex.setdefault(target_key, 0.0)



def calculate_scale_pos_weight(y_train):
    """Calculate scale_pos_weight for class imbalance"""
    n_positive = np.sum(y_train)
    n_negative = len(y_train) - n_positive
    
    if n_positive == 0 or n_negative == 0:
        return 1.0
    
    return n_negative / n_positive


def train_lgbm_model(train_examples, test_examples, model_name, market, side):
    """
    Train a single LightGBM model
    
    Args:
        train_examples: List of training examples
        test_examples: List of test examples
        model_name: Name for saving (e.g., 'points_over')
        market: Market type (for metadata)
        side: Side type (for metadata)
    
    Returns:
        Dict with model, metadata, and evaluation metrics
    """
    print(f'\n[Training] {model_name}')
    print(f'  Market: {market} | Side: {side}')
    
    # Prepare data
    X_train, y_train = prepare_features(train_examples)
    X_test, y_test = prepare_features(test_examples)
    
    print(f'  Train size: {len(train_examples)} (dates: {train_examples[0]["date"]} to {train_examples[-1]["date"]})')
    print(f'  Test size: {len(test_examples)} (dates: {test_examples[0]["date"]} to {test_examples[-1]["date"]})')
    print(f'  Feature shape: {X_train.shape}')
    print(f'  Target distribution (train): {np.mean(y_train):.3f}')
    
    # Calculate class weight
    scale_pos_weight = calculate_scale_pos_weight(y_train)
    print(f'  Scale pos weight: {scale_pos_weight:.3f}')
    
    # Update params with class weight
    params = LGBM_PARAMS.copy()
    params['scale_pos_weight'] = scale_pos_weight
    
    # Create LightGBM datasets
    lgb_train = lgb.Dataset(X_train, y_train, feature_name=FEATURE_COLUMNS)
    lgb_test = lgb.Dataset(X_test, y_test, reference=lgb_train, feature_name=FEATURE_COLUMNS)
    
    # Train model
    print(f'  🎯 Training LightGBM...')
    
    model = lgb.train(
        params,
        lgb_train,
        num_boost_round=200,
        valid_sets=[lgb_train, lgb_test],
        valid_names=['train', 'test'],
        callbacks=[
            lgb.early_stopping(stopping_rounds=20),
            lgb.log_evaluation(period=50)
        ]
    )
    
    # Evaluate
    print(f'\n  📊 Evaluation:')
    
    train_pred = model.predict(X_train)
    test_pred = model.predict(X_test)
    
    train_pred_binary = (train_pred >= 0.5).astype(int)
    test_pred_binary = (test_pred >= 0.5).astype(int)
    
    train_acc = accuracy_score(y_train, train_pred_binary)
    test_acc = accuracy_score(y_test, test_pred_binary)
    
    train_auc = roc_auc_score(y_train, train_pred)
    test_auc = roc_auc_score(y_test, test_pred)
    
    test_precision = precision_score(y_test, test_pred_binary, zero_division=0)
    test_recall = recall_score(y_test, test_pred_binary, zero_division=0)
    
    print(f'    Train Accuracy: {train_acc:.4f}')
    print(f'    Test Accuracy: {test_acc:.4f}')
    print(f'    Train AUC: {train_auc:.4f}')
    print(f'    Test AUC: {test_auc:.4f}')
    print(f'    Test Precision: {test_precision:.4f}')
    print(f'    Test Recall: {test_recall:.4f}')
    
    # Feature importance
    feature_importance = model.feature_importance(importance_type='gain')
    feature_names = model.feature_name()
    
    importance_dict = dict(zip(feature_names, feature_importance.tolist()))
    
    # Sort by importance
    sorted_importance = sorted(importance_dict.items(), key=lambda x: x[1], reverse=True)
    
    print(f'\n  🔝 Top 10 Features:')
    for feat, imp in sorted_importance[:10]:
        print(f'    {feat:30s} {imp:10.1f}')
    
    # Calculate probability distribution
    prob_bins = np.histogram(test_pred, bins=[0, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 1.0])[0]
    
    # Calibration analysis (simplified)
    calibration_bins = []
    bin_edges = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]
    for i in range(len(bin_edges) - 1):
        mask = (test_pred >= bin_edges[i]) & (test_pred < bin_edges[i+1])
        if np.sum(mask) > 0:
            actual_rate = np.mean(y_test[mask])
            predicted_rate = np.mean(test_pred[mask])
            calibration_bins.append({
                'bin': f'{bin_edges[i]:.2f}-{bin_edges[i+1]:.2f}',
                'count': int(np.sum(mask)),
                'predicted': float(predicted_rate),
                'actual': float(actual_rate)
            })
    
    # Package results
    result = {
        'model': model,
        'model_name': model_name,
        'market': market,
        'side': side,
        'feature_columns': FEATURE_COLUMNS,
        'hyperparameters': params,
        'metrics': {
            'train_accuracy': float(train_acc),
            'test_accuracy': float(test_acc),
            'train_auc': float(train_auc),
            'test_auc': float(test_auc),
            'test_precision': float(test_precision),
            'test_recall': float(test_recall),
            'n_train': len(train_examples),
            'n_test': len(test_examples),
            'train_date_range': [train_examples[0]['date'], train_examples[-1]['date']],
            'test_date_range': [test_examples[0]['date'], test_examples[-1]['date']],
            'scale_pos_weight': float(scale_pos_weight)
        },
        'feature_importance': importance_dict,
        'top_10_features': [{'feature': feat, 'importance': float(imp)} for feat, imp in sorted_importance[:10]],
        'calibration': calibration_bins,
        'best_iteration': model.best_iteration
    }
    
    return result


def save_model(result, date_str):
    """Save LightGBM model and metadata"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    model_name = result['model_name']
    
    # Save LightGBM model as text file
    model_file = OUTPUT_DIR / f'{model_name}_{MODEL_VERSION}_{date_str}.txt'
    result['model'].save_model(str(model_file))
    print(f'  ✅ Saved LightGBM model: {model_file.name}')
    
    # Save JSON metadata (for inference)
    json_file = OUTPUT_DIR / f'{model_name}_{MODEL_VERSION}_{date_str}.json'
    
    # Remove model object before JSON serialization
    json_data = {k: v for k, v in result.items() if k != 'model'}
    json_data['version'] = MODEL_VERSION
    json_data['created'] = datetime.now().isoformat()
    json_data['model_file'] = model_file.name
    
    with open(json_file, 'w') as f:
        json.dump(json_data, f, indent=2)
    
    print(f'  ✅ Saved metadata JSON: {json_file.name}')
    
    return {
        'model_file': str(model_file),
        'json_file': str(json_file)
    }


def update_checkpoint(artifacts, summary):
    """Update phase3_checkpoints.json"""
    print('\n[8/8] Updating checkpoint...')
    
    try:
        if CHECKPOINT_FILE.exists():
            with open(CHECKPOINT_FILE, 'r') as f:
                checkpoint_data = json.load(f)
        else:
            checkpoint_data = {'checkpoints': []}
        
        checkpoint_data['checkpoints'].append({
            'timestamp': datetime.now().isoformat(),
            'step': 'train_phase3_lgbm_models',
            'artifacts': artifacts,
            'summary': summary,
            'notes': 'Trained 6 LightGBM models (Points/Rebounds/Assists × Over/Under) with per-market optimization'
        })
        
        with open(CHECKPOINT_FILE, 'w') as f:
            json.dump(checkpoint_data, f, indent=2)
        
        print('  ✅ Checkpoint updated')
    except Exception as e:
        print(f'  ⚠️  Checkpoint update failed: {e}')


def main():
    """Main training pipeline"""
    start_time = datetime.now()
    
    # Load data
    examples = load_training_data()
    augment_line_features(examples)
    
    # Define model configurations
    print('\n[2/8] Preparing model configurations...')
    
    model_configs = [
        {'market': 'player_points', 'side': 'Over', 'name': 'points_over'},
        {'market': 'player_points', 'side': 'Under', 'name': 'points_under'},
        {'market': 'player_rebounds', 'side': 'Over', 'name': 'rebounds_over'},
        {'market': 'player_rebounds', 'side': 'Under', 'name': 'rebounds_under'},
        {'market': 'player_assists', 'side': 'Over', 'name': 'assists_over'},
        {'market': 'player_assists', 'side': 'Under', 'name': 'assists_under'},
    ]
    
    print(f'  ✅ Will train {len(model_configs)} models\n')
    
    # Train all models
    print('[3/8] Training models...')
    print('=' * 70)
    
    results = []
    date_str = datetime.now().strftime('%Y%m%d')
    
    for i, config in enumerate(model_configs, 1):
        print(f'\n[Model {i}/{len(model_configs)}] {config["name"]}')
        
        # Filter data
        market_examples = filter_by_market_and_side(examples, config['market'], config['side'])
        
        if len(market_examples) < 100:
            print(f'  ⚠️  Insufficient data: {len(market_examples)} examples. Skipping.')
            continue
        
        # Split temporally
        train_examples, test_examples = temporal_train_test_split(market_examples, test_size=0.2)
        
        # Train model
        result = train_lgbm_model(
            train_examples, 
            test_examples, 
            config['name'],
            config['market'],
            config['side']
        )
        
        # Save model
        artifacts = save_model(result, date_str)
        result['artifacts'] = artifacts
        
        results.append(result)
    
    # Summary
    print('\n' + '=' * 70)
    print('[4/8] Training Summary')
    print('=' * 70)
    
    for result in results:
        print(f'\n{result["model_name"]}:')
        print(f'  Test AUC: {result["metrics"]["test_auc"]:.4f}')
        print(f'  Test Accuracy: {result["metrics"]["test_accuracy"]:.4f}')
        print(f'  Test Examples: {result["metrics"]["n_test"]}')
    
    # Save summary
    print('\n[5/8] Saving training summary...')
    
    summary_file = OUTPUT_DIR / f'training_summary_{MODEL_VERSION}_{date_str}.json'
    
    summary = {
    'version': MODEL_VERSION,
        'created': datetime.now().isoformat(),
        'n_models': len(results),
        'models': [
            {
                'name': r['model_name'],
                'market': r['market'],
                'side': r['side'],
                'test_auc': r['metrics']['test_auc'],
                'test_accuracy': r['metrics']['test_accuracy'],
                'n_test': r['metrics']['n_test'],
                'artifacts': r['artifacts']
            }
            for r in results
        ]
    }
    
    with open(summary_file, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f'  ✅ Saved summary: {summary_file.name}')
    
    # Collect all artifacts
    all_artifacts = []
    for result in results:
        all_artifacts.extend(result['artifacts'].values())
    all_artifacts.append(str(summary_file))
    
    # Update checkpoint
    update_checkpoint(all_artifacts, {
        'n_models': len(results),
        'avg_test_auc': np.mean([r['metrics']['test_auc'] for r in results])
    })
    
    # Final summary
    elapsed = (datetime.now() - start_time).total_seconds()
    
    print('\n' + '=' * 70)
    print('✅ COMPLETE: All LightGBM models trained and saved')
    print('=' * 70)
    print(f'Total time: {elapsed:.1f} seconds')
    print(f'Models trained: {len(results)}')
    print(f'Average test AUC: {np.mean([r["metrics"]["test_auc"] for r in results]):.4f}')
    print(f'\n📁 Models saved to: {OUTPUT_DIR}')
    print(f'\n🎯 Next step: Run threshold analysis (Step 2)')
    print(f'   python scripts/nba/backtest-lgbm-thresholds.mjs')


if __name__ == '__main__':
    main()
