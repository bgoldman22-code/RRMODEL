#!/usr/bin/env python3
"""
Phase 3.9 Numeric Projection Training Pipeline

Trains LightGBM regression models to predict Points, Rebounds, Assists.
Combos (PR, PA, RA, PRA) derived as sums at inference time.

Usage:
    python3 scripts/nba/train_phase39_projections.py --market points
    python3 scripts/nba/train_phase39_projections.py --market rebounds
    python3 scripts/nba/train_phase39_projections.py --market assists
    python3 scripts/nba/train_phase39_projections.py --all  # Train all markets
"""

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Tuple, List

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, median_absolute_error, explained_variance_score
from scipy.stats import pearsonr

# ============================================================================
# Configuration
# ============================================================================

REPO_ROOT = Path(__file__).parents[2]
DATA_FILE = REPO_ROOT / 'data' / 'nba' / 'training' / 'phase3_training_v1_20251202.jsonl'
OUTPUT_DIR = REPO_ROOT / 'models' / 'nba' / 'phase3.9' / 'projections'
DOCS_DIR = REPO_ROOT / 'docs' / 'phase39_validation'

# Market configurations
MARKET_CONFIGS = {
    'points': {
        'market_filter': 'player_points',
        'target_col': 'actual_points',
        'feature_prefix': 'ppg',
        'display_name': 'Points'
    },
    'rebounds': {
        'market_filter': 'player_rebounds',
        'target_col': 'actual_rebounds',
        'feature_prefix': 'rpg',
        'display_name': 'Rebounds'
    },
    'assists': {
        'market_filter': 'player_assists',
        'target_col': 'actual_assists',
        'feature_prefix': 'apg',
        'display_name': 'Assists'
    }
}

# LightGBM hyperparameters (Phase 3.6-inspired)
LIGHTGBM_PARAMS = {
    'objective': 'regression',
    'metric': 'l1',  # MAE
    'boosting_type': 'gbdt',
    'learning_rate': 0.03,
    'num_leaves': 48,
    'max_depth': -1,
    'feature_fraction': 0.85,
    'bagging_fraction': 0.85,
    'bagging_freq': 5,
    'min_data_in_leaf': 30,
    'lambda_l1': 0.1,
    'lambda_l2': 0.2,
    'verbose': -1,
    'seed': 42
}

EARLY_STOPPING_ROUNDS = 100
MAX_ITERATIONS = 1500

# ============================================================================
# Feature Engineering
# ============================================================================

def get_feature_columns(market_key: str) -> List[str]:
    """
    Define feature columns for a given market.
    Excludes outcome labels and line-related leakage features.
    """
    # Core rolling stats (L5, L10, L20, L40, L999)
    prefix = MARKET_CONFIGS[market_key]['feature_prefix']
    
    features = [
        # Primary stat rolling averages
        f'L5_{prefix}', f'L10_{prefix}', f'L20_{prefix}', f'L40_{prefix}', f'L999_{prefix}',
        
        # Related stats (contextual)
        'L5_minutes', 'L10_minutes', 'L20_minutes', 'L40_minutes', 'L999_minutes',
        'L5_fga', 'L10_fga', 'L20_fga', 'L40_fga', 'L999_fga',
        'L5_fta', 'L10_fta', 'L20_fta', 'L40_fta', 'L999_fta',
        
        # Variance features
        f'L10_std_{prefix}', f'L10_cv_{prefix}',
        f'L10_boom_rate_{prefix}', f'L10_bust_rate_{prefix}',
        f'L20_std_{prefix}', f'L20_cv_{prefix}',
        f'L20_boom_rate_{prefix}', f'L20_bust_rate_{prefix}',
        'L10_minutes_volatility', 'L20_minutes_volatility',
        
        # Game context
        'games_played', 'L5_games', 'L10_games', 'L20_games', 'L40_games', 'L999_games',
        
        # Opponent defense
        f'opp_def_L5_{prefix}_allowed', f'opp_def_L10_{prefix}_allowed',
        'opp_def_L5_pra_allowed', 'opp_def_L10_pra_allowed',
        
        # Contextual
        'home',  # Home vs away
        'rest_days',  # Days since last game
    ]
    
    # Add complementary stats for context
    if market_key == 'points':
        features.extend(['L5_rpg', 'L10_rpg', 'L5_apg', 'L10_apg'])
    elif market_key == 'rebounds':
        features.extend(['L5_ppg', 'L10_ppg', 'L5_apg', 'L10_apg'])
    elif market_key == 'assists':
        features.extend(['L5_ppg', 'L10_ppg', 'L5_rpg', 'L10_rpg'])
    
    return features

# ============================================================================
# Data Loading & Splitting
# ============================================================================

def load_training_data(market_filter: str) -> pd.DataFrame:
    """Load and filter training data for specific market."""
    if not DATA_FILE.exists():
        raise FileNotFoundError(f'Training data not found: {DATA_FILE}')
    
    records = []
    with open(DATA_FILE, 'r') as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))
    
    df = pd.DataFrame(records)
    df['date'] = pd.to_datetime(df['date'])
    
    # Filter to market
    df_market = df[df['market'] == market_filter].copy()
    df_market = df_market.sort_values('date').reset_index(drop=True)
    
    print(f'Loaded {len(df_market):,} examples for market={market_filter}')
    print(f'Date range: {df_market["date"].min()} to {df_market["date"].max()}')
    
    return df_market

def temporal_split_70_15_15(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Split data into train/val/test using 70/15/15 temporal split.
    
    Returns:
        train, val, test DataFrames
    """
    n = len(df)
    train_end = int(0.70 * n)
    val_end = int(0.85 * n)
    
    train = df.iloc[:train_end].copy()
    val = df.iloc[train_end:val_end].copy()
    test = df.iloc[val_end:].copy()
    
    print(f'\nTemporal Split (70/15/15):')
    print(f'  Train: {len(train):,} rows ({train["date"].min()} to {train["date"].max()})')
    print(f'  Val:   {len(val):,} rows ({val["date"].min()} to {val["date"].max()})')
    print(f'  Test:  {len(test):,} rows ({test["date"].min()} to {test["date"].max()})')
    
    return train, val, test

# ============================================================================
# Model Training
# ============================================================================

def train_projection_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    feature_names: List[str]
) -> Tuple[lgb.Booster, Dict]:
    """
    Train LightGBM regression model with early stopping.
    
    Returns:
        booster: Trained LightGBM model
        metrics: Dictionary of training metrics
    """
    train_data = lgb.Dataset(X_train, label=y_train, feature_name=feature_names)
    val_data = lgb.Dataset(X_val, label=y_val, reference=train_data, feature_name=feature_names)
    
    print(f'\nTraining LightGBM model...')
    print(f'  Features: {len(feature_names)}')
    print(f'  Params: lr={LIGHTGBM_PARAMS["learning_rate"]}, leaves={LIGHTGBM_PARAMS["num_leaves"]}')
    print(f'  Early stopping: {EARLY_STOPPING_ROUNDS} rounds on val MAE')
    
    booster = lgb.train(
        LIGHTGBM_PARAMS,
        train_data,
        num_boost_round=MAX_ITERATIONS,
        valid_sets=[train_data, val_data],
        valid_names=['train', 'val'],
        callbacks=[
            lgb.early_stopping(stopping_rounds=EARLY_STOPPING_ROUNDS, verbose=False),
            lgb.log_evaluation(period=100)
        ]
    )
    
    best_iter = booster.best_iteration
    print(f'\n✅ Training complete! Best iteration: {best_iter}')
    
    # Get best scores
    train_mae = booster.best_score['train']['l1']
    val_mae = booster.best_score['val']['l1']
    
    metrics = {
        'best_iteration': best_iter,
        'train_mae': train_mae,
        'val_mae': val_mae
    }
    
    return booster, metrics

# ============================================================================
# Evaluation
# ============================================================================

def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict:
    """Compute comprehensive evaluation metrics."""
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    bias = np.mean(y_pred - y_true)
    med_ae = median_absolute_error(y_true, y_pred)
    
    # Correlation
    if len(y_true) > 1:
        corr, _ = pearsonr(y_pred, y_true)
    else:
        corr = 0.0
    
    # Explained variance
    exp_var = explained_variance_score(y_true, y_pred)
    
    return {
        'mae': float(mae),
        'rmse': float(rmse),
        'bias': float(bias),
        'median_ae': float(med_ae),
        'correlation': float(corr),
        'explained_variance': float(exp_var),
        'n_samples': len(y_true)
    }

def compute_segmented_metrics(
    df: pd.DataFrame,
    y_true: np.ndarray,
    y_pred: np.ndarray,
    market_key: str
) -> Dict:
    """Compute metrics by segment (line bucket, minutes bucket, etc.)."""
    df_eval = df.copy()
    df_eval['y_true'] = y_true
    df_eval['y_pred'] = y_pred
    df_eval['abs_error'] = np.abs(y_true - y_pred)
    
    segments = {}
    
    # By line bucket
    if 'line' in df_eval.columns:
        line_buckets = pd.cut(
            df_eval['line'],
            bins=[0, 15, 25, 100],
            labels=['low', 'medium', 'high']
        )
        df_eval['line_bucket'] = line_buckets
        
        segments['by_line_bucket'] = {}
        for bucket in ['low', 'medium', 'high']:
            mask = df_eval['line_bucket'] == bucket
            if mask.sum() > 0:
                segments['by_line_bucket'][bucket] = {
                    'mae': float(df_eval[mask]['abs_error'].mean()),
                    'n': int(mask.sum())
                }
    
    # By minutes bucket
    if 'L10_minutes' in df_eval.columns:
        mins_buckets = pd.cut(
            df_eval['L10_minutes'],
            bins=[0, 25, 35, 100],
            labels=['bench', 'starter', 'star']
        )
        df_eval['mins_bucket'] = mins_buckets
        
        segments['by_minutes_bucket'] = {}
        for bucket in ['bench', 'starter', 'star']:
            mask = df_eval['mins_bucket'] == bucket
            if mask.sum() > 0:
                segments['by_minutes_bucket'][bucket] = {
                    'mae': float(df_eval[mask]['abs_error'].mean()),
                    'n': int(mask.sum())
                }
    
    # By home/away
    if 'home' in df_eval.columns:
        segments['by_location'] = {
            'home': {
                'mae': float(df_eval[df_eval['home'] == 1]['abs_error'].mean()),
                'n': int((df_eval['home'] == 1).sum())
            },
            'away': {
                'mae': float(df_eval[df_eval['home'] == 0]['abs_error'].mean()),
                'n': int((df_eval['home'] == 0).sum())
            }
        }
    
    return segments

# ============================================================================
# Model Persistence
# ============================================================================

def save_model_artifacts(
    market_key: str,
    booster: lgb.Booster,
    feature_names: List[str],
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    train_metrics: Dict,
    val_metrics: Dict,
    test_metrics: Dict,
    test_segments: Dict,
    config: Dict
) -> Dict:
    """
    Save model, metadata, and validation report.
    
    Returns:
        paths: Dictionary of saved file paths
    """
    market_dir = OUTPUT_DIR / market_key
    market_dir.mkdir(parents=True, exist_ok=True)
    
    # Save LightGBM model
    model_path = market_dir / 'model.txt'
    booster.save_model(str(model_path))
    
    # Build metadata
    metadata = {
        'model_name': market_key,
        'phase': '3.9',
        'training_date': datetime.utcnow().isoformat() + 'Z',
        'data_source': str(DATA_FILE.relative_to(REPO_ROOT)),
        'dataset_stats': {
            'total_rows': len(train_df) + len(val_df) + len(test_df),
            'train_rows': len(train_df),
            'val_rows': len(val_df),
            'test_rows': len(test_df),
            'date_range': {
                'train': [str(train_df['date'].min().date()), str(train_df['date'].max().date())],
                'val': [str(val_df['date'].min().date()), str(val_df['date'].max().date())],
                'test': [str(test_df['date'].min().date()), str(test_df['date'].max().date())]
            }
        },
        'features': {
            'count': len(feature_names),
            'columns': feature_names
        },
        'hyperparameters': {
            **LIGHTGBM_PARAMS,
            'early_stopping_rounds': EARLY_STOPPING_ROUNDS,
            'max_iterations': MAX_ITERATIONS,
            'best_iteration': booster.best_iteration
        },
        'metrics': {
            'train': train_metrics,
            'val': val_metrics,
            'test': test_metrics
        },
        'segment_metrics': {
            'test': test_segments
        }
    }
    
    # Save metadata JSON
    metadata_path = market_dir / 'metadata.json'
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    # Generate validation report markdown
    report_path = market_dir / 'validation_report.md'
    generate_validation_report(market_key, metadata, report_path, config)
    
    print(f'\n✅ Model artifacts saved:')
    print(f'   Model: {model_path.relative_to(REPO_ROOT)}')
    print(f'   Metadata: {metadata_path.relative_to(REPO_ROOT)}')
    print(f'   Report: {report_path.relative_to(REPO_ROOT)}')
    
    return {
        'model': str(model_path.relative_to(REPO_ROOT)),
        'metadata': str(metadata_path.relative_to(REPO_ROOT)),
        'report': str(report_path.relative_to(REPO_ROOT))
    }

def generate_validation_report(
    market_key: str,
    metadata: Dict,
    output_path: Path,
    config: Dict
):
    """Generate human-readable validation report markdown."""
    display_name = config['display_name']
    test_metrics = metadata['metrics']['test']
    segments = metadata['segment_metrics']['test']
    
    report = f"""# Phase 3.9 Projection Model: {display_name}

**Training Date:** {metadata['training_date']}  
**Model Path:** `{metadata['model_name']}/model.txt`  
**Phase:** {metadata['phase']}

---

## Dataset Summary

**Total Rows:** {metadata['dataset_stats']['total_rows']:,}

| Split | Rows | Date Range |
|-------|------|------------|
| Train | {metadata['dataset_stats']['train_rows']:,} | {metadata['dataset_stats']['date_range']['train'][0]} → {metadata['dataset_stats']['date_range']['train'][1]} |
| Val   | {metadata['dataset_stats']['val_rows']:,} | {metadata['dataset_stats']['date_range']['val'][0]} → {metadata['dataset_stats']['date_range']['val'][1]} |
| Test  | {metadata['dataset_stats']['test_rows']:,} | {metadata['dataset_stats']['date_range']['test'][0]} → {metadata['dataset_stats']['date_range']['test'][1]} |

**Features:** {metadata['features']['count']}

---

## Model Configuration

| Parameter | Value |
|-----------|-------|
| Objective | {metadata['hyperparameters']['objective']} |
| Metric | {metadata['hyperparameters']['metric']} |
| Learning Rate | {metadata['hyperparameters']['learning_rate']} |
| Num Leaves | {metadata['hyperparameters']['num_leaves']} |
| Min Data in Leaf | {metadata['hyperparameters']['min_data_in_leaf']} |
| L1 Regularization | {metadata['hyperparameters']['lambda_l1']} |
| L2 Regularization | {metadata['hyperparameters']['lambda_l2']} |
| Early Stopping | {metadata['hyperparameters']['early_stopping_rounds']} rounds |
| **Best Iteration** | **{metadata['hyperparameters']['best_iteration']}** |

---

## Test Set Performance

### Primary Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| **MAE** | **{test_metrics['mae']:.2f}** | ≤ 3.5 (Points) / 2.0 (Rebounds) / 1.8 (Assists) | {'✅' if test_metrics['mae'] <= (3.5 if market_key == 'points' else 2.0 if market_key == 'rebounds' else 1.8) else '⚠️'} |
| **Bias** | **{test_metrics['bias']:.3f}** | ±0.5 | {'✅' if abs(test_metrics['bias']) < 0.5 else '⚠️'} |
| **RMSE** | {test_metrics['rmse']:.2f} | - | - |
| **Correlation** | {test_metrics['correlation']:.3f} | ≥ 0.80 | {'✅' if test_metrics['correlation'] >= 0.80 else '⚠️'} |

### Secondary Metrics

| Metric | Value |
|--------|-------|
| Median AE | {test_metrics['median_ae']:.2f} |
| Explained Variance | {test_metrics['explained_variance']:.3f} |
| Samples | {test_metrics['n_samples']:,} |

---

## Segmented Performance

"""
    
    # Line bucket segmentation
    if 'by_line_bucket' in segments:
        report += "### By Line Bucket\n\n"
        report += "| Bucket | MAE | Samples |\n"
        report += "|--------|-----|-------|\n"
        for bucket, metrics in segments['by_line_bucket'].items():
            report += f"| {bucket.capitalize()} | {metrics['mae']:.2f} | {metrics['n']:,} |\n"
        report += "\n"
    
    # Minutes bucket segmentation
    if 'by_minutes_bucket' in segments:
        report += "### By Minutes Bucket\n\n"
        report += "| Bucket | MAE | Samples |\n"
        report += "|--------|-----|-------|\n"
        for bucket, metrics in segments['by_minutes_bucket'].items():
            report += f"| {bucket.capitalize()} | {metrics['mae']:.2f} | {metrics['n']:,} |\n"
        report += "\n"
    
    # Location segmentation
    if 'by_location' in segments:
        report += "### By Location\n\n"
        report += "| Location | MAE | Samples |\n"
        report += "|----------|-----|-------|\n"
        for loc, metrics in segments['by_location'].items():
            report += f"| {loc.capitalize()} | {metrics['mae']:.2f} | {metrics['n']:,} |\n"
        report += "\n"
    
    report += f"""---

## Next Steps

"""
    
    if test_metrics['mae'] <= (3.5 if market_key == 'points' else 2.0 if market_key == 'rebounds' else 1.8):
        report += "✅ Model meets MAE target - ready for integration\n"
    else:
        report += "⚠️ Model exceeds MAE target - consider feature engineering or hyperparameter tuning\n"
    
    if abs(test_metrics['bias']) < 0.5:
        report += "✅ Bias within acceptable range\n"
    else:
        report += "⚠️ Bias exceeds ±0.5 - may need calibration adjustment\n"
    
    if test_metrics['correlation'] >= 0.80:
        report += "✅ Strong correlation - model captures relationship well\n"
    else:
        report += "⚠️ Weak correlation - feature set may need expansion\n"
    
    report += "\n---\n\n**Status:** Model training complete\n"
    
    with open(output_path, 'w') as f:
        f.write(report)

# ============================================================================
# Main Training Pipeline
# ============================================================================

def train_market(market_key: str):
    """Train projection model for a single market."""
    config = MARKET_CONFIGS[market_key]
    print(f'\n{"="*80}')
    print(f'Training Phase 3.9 Projection Model: {config["display_name"]}')
    print(f'{"="*80}')
    
    # Load data
    df = load_training_data(config['market_filter'])
    
    # Split data
    train_df, val_df, test_df = temporal_split_70_15_15(df)
    
    # Get features
    feature_cols = get_feature_columns(market_key)
    target_col = config['target_col']
    
    # Filter to available columns (some might be missing)
    available_features = [f for f in feature_cols if f in df.columns]
    if len(available_features) < len(feature_cols):
        missing = set(feature_cols) - set(available_features)
        print(f'\n⚠️ Warning: {len(missing)} features not found in data: {list(missing)[:5]}...')
    
    print(f'\nUsing {len(available_features)} features')
    
    # Prepare train/val/test matrices
    X_train = train_df[available_features].values
    y_train = train_df[target_col].values
    X_val = val_df[available_features].values
    y_val = val_df[target_col].values
    X_test = test_df[available_features].values
    y_test = test_df[target_col].values
    
    # Train model
    booster, train_info = train_projection_model(
        X_train, y_train, X_val, y_val, available_features
    )
    
    # Evaluate on all splits
    y_train_pred = booster.predict(X_train)
    y_val_pred = booster.predict(X_val)
    y_test_pred = booster.predict(X_test)
    
    train_metrics = compute_metrics(y_train, y_train_pred)
    val_metrics = compute_metrics(y_val, y_val_pred)
    test_metrics = compute_metrics(y_test, y_test_pred)
    
    # Segmented evaluation on test set
    test_segments = compute_segmented_metrics(test_df, y_test, y_test_pred, market_key)
    
    # Print summary
    print(f'\n{"="*80}')
    print(f'✅ {config["display_name"]} Model Training Complete')
    print(f'{"="*80}')
    print(f'\nTest Set Performance:')
    print(f'  MAE:         {test_metrics["mae"]:.3f}')
    print(f'  RMSE:        {test_metrics["rmse"]:.3f}')
    print(f'  Bias:        {test_metrics["bias"]:.3f}')
    print(f'  Correlation: {test_metrics["correlation"]:.3f}')
    print(f'  Explained Var: {test_metrics["explained_variance"]:.3f}')
    
    # Save artifacts
    paths = save_model_artifacts(
        market_key,
        booster,
        available_features,
        train_df,
        val_df,
        test_df,
        train_metrics,
        val_metrics,
        test_metrics,
        test_segments,
        config
    )
    
    return {
        'market': market_key,
        'display_name': config['display_name'],
        'test_metrics': test_metrics,
        'paths': paths
    }

def main():
    parser = argparse.ArgumentParser(description='Train Phase 3.9 projection models')
    parser.add_argument(
        '--market',
        choices=['points', 'rebounds', 'assists'],
        help='Market to train (points, rebounds, or assists)'
    )
    parser.add_argument(
        '--all',
        action='store_true',
        help='Train all markets'
    )
    
    args = parser.parse_args()
    
    if not args.market and not args.all:
        parser.error('Must specify --market or --all')
    
    # Determine markets to train
    if args.all:
        markets = ['points', 'rebounds', 'assists']
    else:
        markets = [args.market]
    
    # Train models
    results = []
    for market in markets:
        result = train_market(market)
        results.append(result)
    
    # Save training summary
    summary_path = OUTPUT_DIR / 'training_summary.json'
    summary = {
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'phase': '3.9',
        'data_source': str(DATA_FILE.relative_to(REPO_ROOT)),
        'results': results
    }
    
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f'\n{"="*80}')
    print(f'✅ ALL TRAINING COMPLETE')
    print(f'{"="*80}')
    print(f'\nSummary saved: {summary_path.relative_to(REPO_ROOT)}')
    print(f'\nTest MAE Summary:')
    for result in results:
        mae = result['test_metrics']['mae']
        status = '✅' if mae <= (3.5 if result['market'] == 'points' else 2.0 if result['market'] == 'rebounds' else 1.8) else '⚠️'
        print(f'  {result["display_name"]:10s}: {mae:.3f} {status}')

if __name__ == '__main__':
    main()
