#!/usr/bin/env python3
"""
Standalone Flask server for LightGBM training and prediction.
This replaces the Netlify CLI approach for local testing.
"""

import json
import base64
import io
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import lightgbm as lgb
import pandas as pd
import numpy as np

app = Flask(__name__)
CORS(app)

# In-memory booster state (for warm-start)
booster_cache = {}

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'lightgbm_version': lgb.__version__
    })

def compute_stats(df):
    """
    Step 1: Feature statistics logging (temporary diagnostics)
    Compute min, max, mean, std for all columns
    """
    stats = {}
    for col in df.columns:
        series = df[col]
        stats[col] = {
            "min": float(series.min()),
            "max": float(series.max()),
            "mean": float(series.mean()),
            "std": float(series.std())
        }
    return stats


def validate_features(df, feature_cols, target_col):
    """
    Step 1: Guardrails - validate features and target
    Returns (is_valid, error_message)
    """
    # Check features
    for col in feature_cols:
        series = df[col]
        
        # Check for NaN or INF
        if series.isna().any():
            return False, f"Feature '{col}' contains NaN values"
        if np.isinf(series).any():
            return False, f"Feature '{col}' contains INF values"
        
        # Check if constant (min == max)
        col_min = series.min()
        col_max = series.max()
        if col_min == col_max:
            return False, f"Feature '{col}' is constant (min={col_min}, max={col_max})"
        
        # Note: We allow all-zeros if there's variation (min != max checked above)
        # But if you want to explicitly fail on all-zeros, uncomment:
        # if (series == 0).all():
        #     return False, f"Feature '{col}' is all zeros"
    
    # Check target
    target_series = df[target_col]
    if target_series.isna().any():
        return False, f"Target '{target_col}' contains NaN values"
    if np.isinf(target_series).any():
        return False, f"Target '{target_col}' contains INF values"
    
    target_min = target_series.min()
    target_max = target_series.max()
    if target_min == target_max:
        return False, f"Target '{target_col}' is constant (min={target_min}, max={target_max})"
    
    return True, None


@app.route('/train-lgbm', methods=['POST'])
def train_lgbm():
    """
    Train LightGBM model with conservative configuration.
    
    Request body:
    {
        "csv": "base64-encoded CSV data",
        "boosterState": "base64-encoded booster (optional - IGNORED in Step 2)",
        "params": { "learning_rate": 0.05, ... }
    }
    
    Returns:
    {
        "predictions": [...],
        "boosterState": "base64-encoded booster",
        "metrics": { "mae": ..., "val_mae": ... }
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'csv' not in data:
            return jsonify({'error': 'Missing csv field'}), 400
        
        # Decode CSV
        csv_data = base64.b64decode(data['csv']).decode('utf-8')
        df = pd.read_csv(io.StringIO(csv_data))
        
        if len(df) == 0:
            return jsonify({'error': 'Empty dataset'}), 400
        
        # Extract features and target
        target_col = 'target'
        if target_col not in df.columns:
            return jsonify({'error': f'Missing {target_col} column'}), 400
        
        feature_cols = [c for c in df.columns if c != target_col]
        
        # Step 1: Compute and print feature/target statistics
        print("\n" + "="*80)
        print("FEATURE/TARGET STATISTICS")
        print("="*80)
        stats = compute_stats(df)
        for col, col_stats in stats.items():
            print(f"{col:20s} | min={col_stats['min']:10.4f} | max={col_stats['max']:10.4f} | mean={col_stats['mean']:10.4f} | std={col_stats['std']:10.4f}")
        print("="*80 + "\n")
        
        # Step 1: Validate features and target (guardrails)
        is_valid, error_msg = validate_features(df, feature_cols, target_col)
        if not is_valid:
            print(f"❌ VALIDATION FAILED: {error_msg}")
            return jsonify({'error': error_msg}), 400
        
        print("✅ All features and target passed validation")
        
        X = df[feature_cols].values
        y = df[target_col].values
        
        # Split into train/valid (80/20 temporal split)
        split_idx = int(len(df) * 0.8)
        X_train, X_valid = X[:split_idx], X[split_idx:]
        y_train, y_valid = y[:split_idx], y[split_idx:]
        
        print(f"📊 Training samples: {len(X_train)}, Validation samples: {len(X_valid)}")
        
        # LightGBM datasets
        train_data = lgb.Dataset(X_train, label=y_train)
        valid_data = lgb.Dataset(X_valid, label=y_valid, reference=train_data)
        
        # Step 2: Conservative LightGBM configuration (no warm-start)
        # Ignore any boosterState passed in - always train fresh model
        print("🔧 Using conservative LightGBM configuration (no warm-start)")
        
        lgbm_params = {
            "objective": "regression_l1",
            "metric": ["l1"],
            "learning_rate": 0.03,
            "num_leaves": 31,
            "min_data_in_leaf": 50,
            "num_iterations": 500,
            "max_depth": -1,
            "boosting_type": "gbdt",
            "verbosity": -1
        }
        
        # Train (no init_model - warm-start disabled)
        num_rounds = 500
        early_stopping_rounds = 50
        
        # Train (no init_model - warm-start disabled)
        num_rounds = 500
        early_stopping_rounds = 50
        
        callbacks = [lgb.early_stopping(stopping_rounds=early_stopping_rounds, verbose=False)]
        
        print(f"🚀 Training LightGBM for up to {num_rounds} rounds...")
        booster = lgb.train(
            lgbm_params,
            train_data,
            num_boost_round=num_rounds,
            valid_sets=[valid_data],
            callbacks=callbacks
        )
        
        print(f"✅ Training complete. Best iteration: {booster.best_iteration}")
        
        # Make predictions on validation set
        predictions = booster.predict(X_valid, num_iteration=booster.best_iteration).tolist()
        
        # Calculate metrics
        val_mae = np.mean(np.abs(np.array(predictions) - y_valid))
        train_preds = booster.predict(X_train, num_iteration=booster.best_iteration)
        train_mae = np.mean(np.abs(train_preds - y_train))
        
        print(f"📊 Metrics: Train MAE={train_mae:.4f}, Val MAE={val_mae:.4f}")
        
        # Serialize booster
        booster_str = booster.model_to_string()
        booster_bytes = booster_str.encode('utf-8')
        booster_b64 = base64.b64encode(booster_bytes).decode('utf-8')
        
        return jsonify({
            'predictions': predictions,
            'boosterState': booster_b64,
            'metrics': {
                'mae': train_mae,
                'val_mae': val_mae
            },
            'bestIteration': booster.best_iteration,
            'numFeatures': len(feature_cols),
            'training_size': len(X_train),
            'validation_size': len(X_valid)
        })
        
    except Exception as e:
        import traceback
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@app.route('/predict-lgbm', methods=['POST'])
def predict_lgbm():
    """
    Make predictions with existing LightGBM booster.
    
    Request body:
    {
        "csv": "base64-encoded CSV data",
        "boosterState": "base64-encoded booster"
    }
    
    Returns:
    {
        "predictions": [...]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'csv' not in data:
            return jsonify({'error': 'Missing csv field'}), 400
        
        if 'boosterState' not in data or not data['boosterState']:
            return jsonify({'error': 'Missing boosterState field'}), 400
        
        # Decode CSV
        csv_data = base64.b64decode(data['csv']).decode('utf-8')
        df = pd.read_csv(io.StringIO(csv_data))
        
        if len(df) == 0:
            return jsonify({'error': 'Empty dataset'}), 400
        
        # Load booster
        booster_bytes = base64.b64decode(data['boosterState'])
        temp_path = '/tmp/lightgbm_booster_predict.txt'
        with open(temp_path, 'wb') as f:
            f.write(booster_bytes)
        booster = lgb.Booster(model_file=temp_path)
        
        # Extract features (exclude target if present)
        feature_cols = [c for c in df.columns if c != 'target']
        X = df[feature_cols].values
        
        # Predict
        predictions = booster.predict(X, num_iteration=booster.best_iteration).tolist()
        
        return jsonify({
            'predictions': predictions,
            'numSamples': len(X)
        })
        
    except Exception as e:
        import traceback
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8888))
    print(f'🚀 LightGBM Flask Server starting on port {port}...')
    print(f'   LightGBM version: {lgb.__version__}')
    print(f'   Health check: http://localhost:{port}/health')
    print(f'   Training endpoint: http://localhost:{port}/train-lgbm')
    print(f'   Prediction endpoint: http://localhost:{port}/predict-lgbm')
    app.run(host='0.0.0.0', port=port, debug=False)
