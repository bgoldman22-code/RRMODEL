#!/usr/bin/env python3
"""Phase 3.6 multi-output NBA props training pipeline."""
from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Tuple

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, brier_score_loss, roc_auc_score
from sklearn.model_selection import TimeSeriesSplit

from feature_config import ALL_FEATURES, STAT_CONFIGS, build_feature_matrix
from calibration_utils import calibrate, apply_isotonic, apply_platt

REPO_ROOT = Path(__file__).parents[3]
DATA_FILE = REPO_ROOT / 'data' / 'nba' / 'training' / 'phase3_training_v1_20251124.jsonl'
OUTPUT_DIR = REPO_ROOT / 'models' / 'phase3.6'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

LIGHTGBM_COMMON_PARAMS = {
    'boosting_type': 'gbdt',
    'learning_rate': 0.045,
    'num_leaves': 64,
    'feature_fraction': 0.85,
    'bagging_fraction': 0.85,
    'bagging_freq': 5,
    'max_depth': -1,
    'min_data_in_leaf': 40,
    'lambda_l1': 0.2,
    'lambda_l2': 0.4,
    'verbose': -1
}


@dataclass
class ModelArtifacts:
    model_path: str
    metadata_path: str
    feature_columns: Tuple[str, ...]
    metrics: Dict

    def to_metadata(self) -> Dict:
        return {
            'model_path': self.model_path,
            'feature_columns': list(self.feature_columns),
            'metrics': self.metrics
        }


def load_examples(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f'Missing training file: {path}')
    records = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    df = pd.DataFrame(records)
    df['date'] = pd.to_datetime(df['date'])
    return df


def walkforward_splits(df: pd.DataFrame, n_splits: int = 4) -> TimeSeriesSplit:
    return TimeSeriesSplit(n_splits=n_splits, gap=0, test_size=max(350, len(df) // 6))


def train_regressor(X_train, y_train, X_val, y_val, objective: str = 'regression') -> Tuple[lgb.Booster, Dict]:
    params = LIGHTGBM_COMMON_PARAMS.copy()
    params['objective'] = objective
    if objective == 'tweedie':
        params['tweedie_variance_power'] = 1.3
        params['metric'] = 'l2'
    else:
        params['metric'] = 'l1'

    train_set = lgb.Dataset(X_train, y_train, feature_name=ALL_FEATURES)
    val_set = lgb.Dataset(X_val, y_val, reference=train_set)

    booster = lgb.train(
        params,
        train_set,
        num_boost_round=1200,
        valid_sets=[train_set, val_set],
        valid_names=['train', 'val'],
        callbacks=[
            lgb.early_stopping(80),
            lgb.log_evaluation(100)
        ]
    )

    val_pred = booster.predict(X_val)
    metrics = {
        'mae': float(mean_absolute_error(y_val, val_pred)),
        'rmse': float(mean_squared_error(y_val, val_pred, squared=False))
    }
    return booster, metrics


def train_classifier(X_train, y_train, X_val, y_val) -> Tuple[lgb.Booster, Dict]:
    params = LIGHTGBM_COMMON_PARAMS.copy()
    params.update({
        'objective': 'binary',
        'metric': 'auc',
        'is_unbalance': True
    })
    train_set = lgb.Dataset(X_train, y_train, feature_name=[*ALL_FEATURES, 'proj_mu', 'proj_variance', 'line_minus_mu', 'z_score'])
    val_set = lgb.Dataset(X_val, y_val, reference=train_set)
    booster = lgb.train(
        params,
        train_set,
        num_boost_round=1500,
        valid_sets=[train_set, val_set],
        valid_names=['train', 'val'],
        callbacks=[lgb.early_stopping(120), lgb.log_evaluation(100)]
    )
    val_pred = booster.predict(X_val)
    metrics = {
        'auc': float(roc_auc_score(y_val, val_pred)),
        'brier': float(brier_score_loss(y_val, val_pred))
    }
    return booster, metrics


def save_booster(booster: lgb.Booster, out_dir: Path, name: str, feature_columns) -> ModelArtifacts:
    out_dir.mkdir(parents=True, exist_ok=True)
    model_path = out_dir / f'{name}.txt'
    metadata_path = out_dir / f'{name}.json'
    booster.save_model(str(model_path))
    metadata = {
        'model_name': name,
        'feature_columns': list(feature_columns),
        'best_iteration': booster.best_iteration,
        'metrics': booster.best_score,
        'model_path': str(model_path.relative_to(REPO_ROOT))
    }
    metadata_path.write_text(json.dumps(metadata, indent=2))
    return ModelArtifacts(str(model_path.relative_to(REPO_ROOT)), str(metadata_path.relative_to(REPO_ROOT)), feature_columns, metadata)


def compute_variance_targets(actual: np.ndarray, mu: np.ndarray) -> np.ndarray:
    residual = actual - mu
    variance = residual ** 2
    return np.clip(variance, 0.25, None)


def derive_distribution_params(mu: np.ndarray, variance: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    variance = np.maximum(variance, mu + 1e-3)
    alpha = (variance - mu) / (np.clip(mu, 1e-3, None) ** 2)
    alpha = np.clip(alpha, 1e-4, 50)
    return mu, alpha


def extend_probability_features(X: np.ndarray, mu: np.ndarray, variance: np.ndarray, lines: np.ndarray) -> np.ndarray:
    std = np.sqrt(np.maximum(variance, 1e-3))
    z = (lines - mu) / std
    line_minus_mu = lines - mu
    extra = np.column_stack([mu, variance, line_minus_mu, z])
    return np.hstack([X, extra])


def train_market(df: pd.DataFrame, stat_key: str) -> Dict:
    config = STAT_CONFIGS[stat_key]
    df_market = df[df['market'] == config.market].copy()
    df_market.sort_values('date', inplace=True)

    feature_df = build_feature_matrix(df_market, stat_key)
    X = feature_df.to_numpy()
    y = df_market[config.target_col].to_numpy()
    lines = df_market['line'].to_numpy()
    over_target = (y > lines).astype(int)

    splits = walkforward_splits(df_market)
    latest_metrics = {}
    artifacts = {}

    for fold, (train_idx, val_idx) in enumerate(splits.split(X)):
        X_train, X_val = X[train_idx], X[val_idx]
        y_train, y_val = y[train_idx], y[val_idx]
        lines_train, lines_val = lines[train_idx], lines[val_idx]
        over_train, over_val = over_target[train_idx], over_target[val_idx]

        print(f'[{stat_key.upper()}] Fold {fold+1}/{splits.get_n_splits()}')
        proj_model, proj_metrics = train_regressor(X_train, y_train, X_val, y_val, 'regression')
        proj_art = save_booster(proj_model, OUTPUT_DIR / stat_key, 'projection_booster', feature_df.columns)

        mu_val = proj_model.predict(X_val)
        mu_train = proj_model.predict(X_train)
        variance_targets = compute_variance_targets(y_train, mu_train)
        variance_model, var_metrics = train_regressor(X_train, variance_targets, X_val, compute_variance_targets(y_val, mu_val), 'tweedie')
        var_art = save_booster(variance_model, OUTPUT_DIR / stat_key, 'distribution_booster', feature_df.columns)

        var_val_pred = variance_model.predict(X_val)
        prob_features_train = extend_probability_features(X_train, mu_train, variance_model.predict(X_train), lines_train)
        prob_features_val = extend_probability_features(X_val, mu_val, var_val_pred, lines_val)
        prob_model, prob_metrics = train_classifier(prob_features_train, over_train, prob_features_val, over_val)
        prob_art = save_booster(prob_model, OUTPUT_DIR / stat_key, 'probability_booster', list(feature_df.columns) + ['proj_mu', 'proj_variance', 'line_minus_mu', 'z_score'])

        raw_val_pred = prob_model.predict(prob_features_val)
        calibration = calibrate(raw_val_pred, over_val)
        calib_path = OUTPUT_DIR / stat_key / 'calibration.json'
        calib_path.write_text(json.dumps(calibration.to_json(), indent=2))

        latest_metrics = {
            'projection': proj_metrics,
            'dispersion': var_metrics,
            'probability': prob_metrics,
            'calibration_bins': calibration.reliability_bins
        }
        artifacts = {
            'projection': proj_art.to_metadata(),
            'distribution': var_art.to_metadata(),
            'probability': prob_art.to_metadata(),
            'calibration': str(calib_path.relative_to(REPO_ROOT))
        }

    return {
        'stat': stat_key,
        'artifacts': artifacts,
        'metrics': latest_metrics
    }


def main():
    df = load_examples(DATA_FILE)
    registry_entries = {}
    summary = []
    for stat_key in STAT_CONFIGS.keys():
        result = train_market(df, stat_key)
        registry_entries[stat_key] = result['artifacts']
        summary.append({
            'stat': stat_key,
            'metrics': result['metrics']
        })

    summary_path = OUTPUT_DIR / 'training_summary_phase3.6.json'
    summary_payload = {
        'timestamp': datetime.utcnow().isoformat(),
        'entries': summary
    }
    summary_path.write_text(json.dumps(summary_payload, indent=2))

    print('\nTraining complete. Artifacts saved to:', OUTPUT_DIR)


if __name__ == '__main__':
    main()
