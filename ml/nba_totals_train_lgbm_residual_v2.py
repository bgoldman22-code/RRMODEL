#!/usr/bin/env python3
"""
NBA Totals LightGBM Residual Model V2 (Top-15 Features)

This is the production model based on feature experiments that showed:
- Top-15 features outperform the full 63-feature set
- Better predictive metrics: MAE=14.07 (vs 14.17), Corr=0.405 (vs 0.393)
- Better calibration: success rate increases with edge size (4-8 points)

Features:
- Uses only 15 most important features (from permutation importance)
- Residual target: actual_total - consensus_total_line
- Time-series train/test split (no shuffling)
- LightGBM gradient boosting

Output:
- JSON artifact: total_model_lgbm_residual_v2_top15.json
- Ready for walk-forward backtest integration

Usage:
  python ml/nba_totals_train_lgbm_residual_v2.py
  python ml/nba_totals_train_lgbm_residual_v2.py --test-size 0.25
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from scipy.stats import pearsonr

# ============================================================================
# CONFIGURATION
# ============================================================================

REPO_ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = REPO_ROOT / "data" / "nba" / "datasets"
ARTIFACTS_DIR = REPO_ROOT / "netlify" / "functions" / "_lib" / "nba" / "models" / "artifacts"

DATASET_FILE = "nba_totals_residual_dataset.parquet"
METADATA_FILE = "nba_totals_residual_metadata.json"

MODEL_NAME = "total_model_lgbm_residual_v2_top15"
ARTIFACT_FILE = f"{MODEL_NAME}.json"

# Top-15 features from permutation importance experiments
# These are the most predictive features for beating the market
TOP15_FEATURES = [
    "home_season_ft_rate",       # 1. Most important: FT Rate
    "away_season_tov_pct",        # 2. Away turnover %
    "home_l5_tov_pct",            # 3. Home turnover % (L5)
    "home_l5_pace",               # 4. Home pace (L5)
    "away_l5_ortg",               # 5. Away ORtg (L5)
    "home_ortg_vs_away_drtg",     # 6. Matchup interaction
    "home_season_orb_pct",        # 7. Home ORB% (season)
    "home_l5_orb_pct",            # 8. Home ORB% (L5)
    "home_l5_drtg",               # 9. Home DRtg (L5)
    "home_l5_efg",                # 10. Home eFG% (L5)
    "away_l10_drtg",              # 11. Away DRtg (L10)
    "home_l10_ortg",              # 12. Home ORtg (L10)
    "ortg_diff",                  # 13. ORtg differential
    "home_l5_ortg",               # 14. Home ORtg (L5)
    "away_l5_drtg",               # 15. Away DRtg (L5)
]


# ============================================================================
# ARGUMENT PARSING
# ============================================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train NBA Totals LightGBM Residual Model V2 (Top-15 Features)"
    )
    parser.add_argument("--test-size", type=float, default=0.2,
                        help="Fraction for test set (time-series split)")
    parser.add_argument("--num-boost-round", type=int, default=300,
                        help="Max boosting rounds")
    parser.add_argument("--max-depth", type=int, default=5,
                        help="Max tree depth")
    parser.add_argument("--learning-rate", type=float, default=0.03,
                        help="Learning rate")
    parser.add_argument("--feature-fraction", type=float, default=0.8,
                        help="Feature sampling fraction")
    parser.add_argument("--min-data-in-leaf", type=int, default=20,
                        help="Min samples per leaf")
    parser.add_argument("--early-stopping", type=int, default=50,
                        help="Early stopping rounds")
    return parser.parse_args()


# ============================================================================
# DATA LOADING
# ============================================================================

def load_dataset() -> Tuple[pd.DataFrame, Dict]:
    """Load residual dataset and metadata."""
    dataset_path = DATASET_DIR / DATASET_FILE
    metadata_path = DATASET_DIR / METADATA_FILE
    
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")
    if not metadata_path.exists():
        raise FileNotFoundError(f"Metadata not found: {metadata_path}")
    
    df = pd.read_parquet(dataset_path)
    with open(metadata_path) as f:
        metadata = json.load(f)
    
    return df, metadata


def prepare_data(df: pd.DataFrame, feature_cols: List[str], test_size: float) -> Tuple:
    """
    Prepare train/test splits with time-series ordering.
    
    Only include games with market odds (required for residual target).
    """
    # Filter to games with market odds
    df_with_odds = df[df["consensus_total_line"].notna()].copy()
    df_with_odds.sort_values("date", inplace=True)
    df_with_odds.reset_index(drop=True, inplace=True)
    
    print(f"\n📊 Data Preparation:")
    print(f"  Total samples: {len(df):,}")
    print(f"  With market odds: {len(df_with_odds):,}")
    print(f"  Date range: {df_with_odds['date'].min()} → {df_with_odds['date'].max()}")
    
    # Verify all features exist
    missing_features = [f for f in feature_cols if f not in df_with_odds.columns]
    if missing_features:
        raise ValueError(f"Missing features in dataset: {missing_features}")
    
    # Time-series split (NO shuffling)
    split_idx = int(len(df_with_odds) * (1 - test_size))
    train_df = df_with_odds.iloc[:split_idx]
    test_df = df_with_odds.iloc[split_idx:]
    
    print(f"\n📈 Train/Test Split:")
    print(f"  Train: {len(train_df):,} games ({train_df['date'].min()} → {train_df['date'].max()})")
    print(f"  Test:  {len(test_df):,} games ({test_df['date'].min()} → {test_df['date'].max()})")
    
    # Extract features and target
    X_train = train_df[feature_cols].values
    y_train = train_df["target_residual"].values
    X_test = test_df[feature_cols].values
    y_test = test_df["target_residual"].values
    
    # Check for NaNs
    train_nans = np.isnan(X_train).sum()
    test_nans = np.isnan(X_test).sum()
    if train_nans > 0 or test_nans > 0:
        print(f"\n⚠️  Warning: Found {train_nans} NaNs in train, {test_nans} in test")
        print("    Filling NaNs with 0")
        X_train = np.nan_to_num(X_train, 0)
        X_test = np.nan_to_num(X_test, 0)
    
    return X_train, y_train, X_test, y_test, train_df, test_df


# ============================================================================
# MODEL TRAINING
# ============================================================================

def train_lgbm(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
    feature_names: List[str],
    args: argparse.Namespace,
) -> lgb.Booster:
    """Train LightGBM model with early stopping."""
    print("\n🌳 Training LightGBM V2 (Top-15 Features)...")
    
    # Create datasets
    train_data = lgb.Dataset(X_train, label=y_train, feature_name=feature_names)
    test_data = lgb.Dataset(X_test, label=y_test, feature_name=feature_names, reference=train_data)
    
    # Hyperparameters
    params = {
        "objective": "regression",
        "metric": ["rmse", "mae"],
        "boosting_type": "gbdt",
        "num_leaves": 2 ** args.max_depth,
        "max_depth": args.max_depth,
        "learning_rate": args.learning_rate,
        "feature_fraction": args.feature_fraction,
        "bagging_fraction": 0.9,
        "bagging_freq": 1,
        "min_data_in_leaf": args.min_data_in_leaf,
        "lambda_l1": 0.1,
        "lambda_l2": 0.1,
        "verbose": -1,
        "seed": 42,
    }
    
    print(f"  Hyperparameters:")
    for key, val in params.items():
        print(f"    {key}: {val}")
    
    # Train with early stopping
    evals_result = {}
    model = lgb.train(
        params,
        train_data,
        num_boost_round=args.num_boost_round,
        valid_sets=[train_data, test_data],
        valid_names=["train", "test"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=args.early_stopping, verbose=True),
            lgb.log_evaluation(period=50),
            lgb.record_evaluation(evals_result),
        ],
    )
    
    print(f"\n✅ Training complete!")
    print(f"  Best iteration: {model.best_iteration}")
    print(f"  Best score: {model.best_score}")
    
    return model


# ============================================================================
# MODEL EVALUATION
# ============================================================================

def evaluate_model(
    model: lgb.Booster,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> Dict:
    """Evaluate model performance on train and test sets."""
    print("\n📊 Model Evaluation:")
    
    # Predictions
    train_pred = model.predict(X_train, num_iteration=model.best_iteration)
    test_pred = model.predict(X_test, num_iteration=model.best_iteration)
    
    # Metrics
    train_rmse = np.sqrt(mean_squared_error(y_train, train_pred))
    train_mae = mean_absolute_error(y_train, train_pred)
    train_r2 = r2_score(y_train, train_pred)
    train_corr, _ = pearsonr(y_train, train_pred)
    
    test_rmse = np.sqrt(mean_squared_error(y_test, test_pred))
    test_mae = mean_absolute_error(y_test, test_pred)
    test_r2 = r2_score(y_test, test_pred)
    test_corr, _ = pearsonr(y_test, test_pred)
    
    print(f"\n  Train Set:")
    print(f"    RMSE: {train_rmse:.3f}")
    print(f"    MAE:  {train_mae:.3f}")
    print(f"    R²:   {train_r2:.4f}")
    print(f"    Corr: {train_corr:.4f}")
    
    print(f"\n  Test Set:")
    print(f"    RMSE: {test_rmse:.3f}")
    print(f"    MAE:  {test_mae:.3f}")
    print(f"    R²:   {test_r2:.4f}")
    print(f"    Corr: {test_corr:.4f}")
    
    # Residual analysis
    train_residuals = y_train - train_pred
    test_residuals = y_test - test_pred
    
    print(f"\n  Residual Distribution (Test):")
    print(f"    Mean: {test_residuals.mean():.3f}")
    print(f"    Std:  {test_residuals.std():.3f}")
    print(f"    Min:  {test_residuals.min():.3f}")
    print(f"    Max:  {test_residuals.max():.3f}")
    
    # Convert predictions back to totals for context
    test_df_copy = test_df.copy()
    test_df_copy["predicted_residual"] = test_pred
    test_df_copy["predicted_total"] = test_df_copy["consensus_total_line"] + test_df_copy["predicted_residual"]
    test_df_copy["total_error"] = test_df_copy["actual_total"] - test_df_copy["predicted_total"]
    
    total_mae = test_df_copy["total_error"].abs().mean()
    total_corr, _ = pearsonr(test_df_copy["predicted_total"], test_df_copy["actual_total"])
    
    print(f"\n  Total Prediction (Market Line + Residual):")
    print(f"    MAE vs Actual: {total_mae:.3f} points")
    print(f"    Corr vs Actual: {total_corr:.4f}")
    
    return {
        "train": {
            "rmse": float(train_rmse),
            "mae": float(train_mae),
            "r2": float(train_r2),
            "correlation": float(train_corr),
            "samples": len(y_train),
        },
        "test": {
            "rmse": float(test_rmse),
            "mae": float(test_mae),
            "r2": float(test_r2),
            "correlation": float(test_corr),
            "samples": len(y_test),
            "residual_mean": float(test_residuals.mean()),
            "residual_std": float(test_residuals.std()),
            "total_mae": float(total_mae),
            "total_correlation": float(total_corr),
        },
    }


# ============================================================================
# FEATURE IMPORTANCE
# ============================================================================

def extract_feature_importance(model: lgb.Booster, feature_names: List[str]) -> List[Dict]:
    """Extract and display feature importances."""
    importances = model.feature_importance(importance_type="gain")
    feature_importance = sorted(
        zip(feature_names, importances),
        key=lambda x: x[1],
        reverse=True,
    )
    
    print(f"\n🔍 Feature Importances (by gain):")
    for i, (feat, imp) in enumerate(feature_importance, 1):
        print(f"  {i:2d}. {feat:35s} {imp:10.1f}")
    
    return [{"feature": feat, "importance": float(imp)} for feat, imp in feature_importance]


# ============================================================================
# ARTIFACT SAVING
# ============================================================================

def save_artifact(
    model: lgb.Booster,
    feature_names: List[str],
    feature_importance: List[Dict],
    metrics: Dict,
    args: argparse.Namespace,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> None:
    """Save model artifact as JSON."""
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    
    artifact_path = ARTIFACTS_DIR / ARTIFACT_FILE
    
    # Convert booster to JSON string
    booster_json = model.model_to_string()
    
    artifact = {
        "model_name": MODEL_NAME,
        "model_version": "v2",
        "model_type": "lgbm_residual_top15",
        "description": "Top-15 feature LightGBM residual model (production)",
        "target": "target_residual",
        "created_at": datetime.now().isoformat(),
        "features": feature_names,
        "num_features": len(feature_names),
        "feature_importance": feature_importance,
        "hyperparameters": {
            "num_boost_round": args.num_boost_round,
            "max_depth": args.max_depth,
            "learning_rate": args.learning_rate,
            "feature_fraction": args.feature_fraction,
            "min_data_in_leaf": args.min_data_in_leaf,
            "early_stopping_rounds": args.early_stopping,
        },
        "training_info": {
            "best_iteration": model.best_iteration,
            "best_score": {
                dataset: {metric: float(value) for metric, value in scores.items()}
                for dataset, scores in model.best_score.items()
            },
            "train_date_range": {
                "start": str(train_df['date'].min()),
                "end": str(train_df['date'].max()),
            },
            "test_date_range": {
                "start": str(test_df['date'].min()),
                "end": str(test_df['date'].max()),
            },
        },
        "metrics": metrics,
        "booster": booster_json,
        "usage": {
            "description": "Top-15 feature LightGBM model for predicting NBA totals residuals",
            "prediction": "predicted_total = consensus_total_line + model.predict(features)",
            "features_required": "15 most important features from permutation analysis",
            "betting_strategy": "Bet when 4.0 <= |edge| < 8.0 points",
        },
    }
    
    with open(artifact_path, "w") as f:
        json.dump(artifact, f, indent=2)
    
    print(f"\n💾 Saved artifact: {artifact_path.relative_to(REPO_ROOT)}")
    print(f"   Size: {artifact_path.stat().st_size / 1024:.1f} KB")


# ============================================================================
# MAIN
# ============================================================================

def main() -> None:
    args = parse_args()
    
    print("=" * 80)
    print("NBA TOTALS LGBM RESIDUAL MODEL V2 TRAINER (TOP-15 FEATURES)")
    print("=" * 80)
    print("\n🎯 Production model based on feature experiments")
    print("   - Uses only 15 most important features")
    print("   - Better predictive performance than full 63-feature model")
    print("   - Better calibration for 4-8 point edges")
    
    # Load data
    df, metadata = load_dataset()
    
    print(f"\n📋 Top-15 Features:")
    for i, feat in enumerate(TOP15_FEATURES, 1):
        print(f"  {i:2d}. {feat}")
    
    # Prepare train/test splits
    X_train, y_train, X_test, y_test, train_df, test_df = prepare_data(
        df, TOP15_FEATURES, args.test_size
    )
    
    # Train model
    model = train_lgbm(X_train, y_train, X_test, y_test, TOP15_FEATURES, args)
    
    # Evaluate
    metrics = evaluate_model(model, X_train, y_train, X_test, y_test, train_df, test_df)
    
    # Feature importance
    feature_importance = extract_feature_importance(model, TOP15_FEATURES)
    
    # Save artifact
    save_artifact(model, TOP15_FEATURES, feature_importance, metrics, args, train_df, test_df)
    
    print("\n" + "=" * 80)
    print("✅ TRAINING COMPLETE - TOTALS V2 (TOP-15)")
    print("=" * 80)
    print(f"\n📈 Model Summary:")
    print(f"  Version: V2 (Top-15 Features)")
    print(f"  Type: LightGBM Gradient Boosting (Residual)")
    print(f"  Target: Actual Total - Market Line")
    print(f"  Features: {len(TOP15_FEATURES)}")
    print(f"  Trees: {model.best_iteration}")
    print(f"  Test MAE: {metrics['test']['mae']:.3f} points (residual)")
    print(f"  Test Corr: {metrics['test']['correlation']:.4f}")
    print(f"  Total MAE: {metrics['test']['total_mae']:.3f} points")
    print(f"  Total Corr: {metrics['test']['total_correlation']:.4f}")
    print(f"\n✅ Ready for walk-forward backtest with bet logic")
    print(f"   Recommended edge range: 4.0 - 8.0 points")


if __name__ == "__main__":
    main()
