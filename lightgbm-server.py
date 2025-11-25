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

@app.route('/train-lgbm', methods=['POST'])
def train_lgbm():
    """
    Train LightGBM model with warm-start support.
    
    Request body:
    {
        "csv": "base64-encoded CSV data",
        "boosterState": "base64-encoded booster (optional)",
        "params": { "learning_rate": 0.05, ... }
    }
    
    Returns:
    {
        "predictions": [...],
        "boosterState": "base64-encoded booster"
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
        X = df[feature_cols].values
        y = df[target_col].values
        
        # Split into train/valid (80/20 temporal split)
        split_idx = int(len(df) * 0.8)
        X_train, X_valid = X[:split_idx], X[split_idx:]
        y_train, y_valid = y[:split_idx], y[split_idx:]
        
        # LightGBM datasets
        train_data = lgb.Dataset(X_train, label=y_train)
        valid_data = lgb.Dataset(X_valid, label=y_valid, reference=train_data)
        
        # Training parameters
        params = data.get('params', {})
        default_params = {
            'objective': 'regression',
            'metric': 'mae',
            'boosting_type': 'gbdt',
            'learning_rate': 0.05,
            'num_leaves': 31,
            'min_data_in_leaf': 20,
            'feature_fraction': 0.8,
            'bagging_fraction': 0.8,
            'bagging_freq': 5,
            'verbose': -1
        }
        params = {**default_params, **params}
        
        # Warm-start: load previous booster if provided
        init_model = None
        if 'boosterState' in data and data['boosterState']:
            try:
                booster_bytes = base64.b64decode(data['boosterState'])
                # Save to temp file for LightGBM to load
                temp_path = '/tmp/lightgbm_booster.txt'
                with open(temp_path, 'wb') as f:
                    f.write(booster_bytes)
                init_model = temp_path
            except Exception as e:
                print(f'Warning: Could not load booster state: {e}')
        
        # Train
        num_rounds = params.pop('num_boost_round', 100)
        early_stopping_rounds = params.pop('early_stopping_rounds', 10)
        
        callbacks = [lgb.early_stopping(stopping_rounds=early_stopping_rounds, verbose=False)]
        
        booster = lgb.train(
            params,
            train_data,
            num_boost_round=num_rounds,
            valid_sets=[valid_data],
            init_model=init_model,
            callbacks=callbacks
        )
        
        # Make predictions on validation set
        predictions = booster.predict(X_valid, num_iteration=booster.best_iteration).tolist()
        
        # Serialize booster
        booster_str = booster.model_to_string()
        booster_bytes = booster_str.encode('utf-8')
        booster_b64 = base64.b64encode(booster_bytes).decode('utf-8')
        
        return jsonify({
            'predictions': predictions,
            'boosterState': booster_b64,
            'bestIteration': booster.best_iteration,
            'numFeatures': len(feature_cols),
            'trainSamples': len(X_train),
            'validSamples': len(X_valid)
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
