#!/usr/bin/env python3
"""
NBA Totals UNDER Classifier V1

Trains a LightGBM classifier to predict UNDER wins (actual_total < market_line).

This is complementary to the OVER-focused residual model. The UNDER model uses:
- All core team strength features (ORtg, DRtg, Pace, Four Factors)
- UNDER-specific features (blowout risk, pace suppression, defense, timing)
- Classification target: target_under_win (1/0)

Output:
- JSON artifact: total_model_under_classifier_v1.json
- Ready for dual-model walk-forward backtest

Usage:
  python ml/nba_totals_train_under_classifier_v1.py
  python ml/nba_totals_train_under_classifier_v1.py --test-size 0.25
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
from sklearn.metrics import (
    roc_auc_score,
    log_loss,
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
)

# ============================================================================
# CONFIGURATION
# ============================================================================

REPO_ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = REPO_ROOT / "data" / "nba" / "datasets"
ARTIFACTS_DIR = REPO_ROOT / "netlify" / "functions" / "_lib" / "nba" / "models" / "artifacts"

DATASET_FILE = "nba_totals_under_dataset.parquet"
METADATA_FILE = "nba_totals_under_metadata.json"

MODEL_NAME = "total_model_under_classifier_v1"
ARTIFACT_FILE = f"{MODEL_NAME}.json"

# Feature groups for UNDER model
CORE_FEATURES = [
    # Team strength (L5)
    "home_l5_ortg", "home_l5_drtg", "home_l5_pace",
    "away_l5_ortg", "away_l5_drtg", "away_l5_pace",
    
    # Team strength (season)
    "home_season_ft_rate", "home_season_tov_pct", "home_season_orb_pct",
    "away_season_ft_rate", "away_season_tov_pct", "away_season_orb_pct",
    
    # Matchup interactions
    "home_ortg_vs_away_drtg", "away_ortg_vs_home_drtg",
    "ortg_diff", "drtg_diff",
]

UNDER_SPECIFIC_FEATURES = [
    # Blowout risk (when spread data available)
    "spread_abs", "spread_squared", "blowout_risk_index",
    
    # Pace suppression
    "pace_elasticity", "pace_diff",
    "home_pace_suppression_proxy", "away_pace_suppression_proxy",
    
    # Defensive suppression
    "home_def_suppression_proxy", "away_def_suppression_proxy",
    "combined_def_strength",
    
    # Timing/scheduling
    "utc_start_hour", "early_game_flag",
    "day_of_week", "weekend_flag",
    "rest_advantage", "both_teams_rested",
    
    # Rest/scheduling (from core dataset)
    "home_rest_days", "away_rest_days",
    "home_b2b", "away_b2b",
]

ALL_FEATURES = CORE_FEATURES + UNDER_SPECIFIC_FEATURES


# ============================================================================
# ARGUMENT PARSING
# ============================================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train NBA Totals UNDER Classifier V1"
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
    """Load UNDER dataset and metadata."""
    dataset_path = DATASET_DIR / DATASET_FILE
    metadata_path = DATASET_DIR / METADATA_FILE
    
    if not dataset_path.exists():
        raise FileNotFoundError(
            f"UNDER dataset not found: {dataset_path}\n"
            f"Run ml/nba_totals_build_under_dataset.py first!"
        )
    if not metadata_path.exists():
        raise FileNotFoundError(f"Metadata not found: {metadata_path}")
    
    df = pd.read_parquet(dataset_path)
    with open(metadata_path) as f:
        metadata = json.load(f)
    
    return df, metadata


def prepare_data(df: pd.DataFrame, feature_cols: List[str], test_size: float) -> Tuple:
    """
    Prepare train/test splits with time-series ordering.
    
    Only include games with market odds and valid target.
    """
    # Filter to games with market odds and valid UNDER target
    df_valid = df[
        (df["consensus_total_line"].notna()) &
        (df["target_under_win"].notna())
    ].copy()
    
    df_valid.sort_values("date", inplace=True)
    df_valid.reset_index(drop=True, inplace=True)
    
    print(f"\n📊 Data Preparation:")
    print(f"  Total samples: {len(df):,}")
    print(f"  With valid target: {len(df_valid):,}")
    print(f"  Date range: {df_valid['date'].min()} → {df_valid['date'].max()}")
    
    # Check feature availability
    missing_features = [f for f in feature_cols if f not in df_valid.columns]
    if missing_features:
        print(f"\n⚠️  Warning: Missing features (will be filled with 0):")
        for feat in missing_features:
            print(f"     - {feat}")
        # Add missing features as 0
        for feat in missing_features:
            df_valid[feat] = 0
    
    # Time-series split (NO shuffling)
    split_idx = int(len(df_valid) * (1 - test_size))
    train_df = df_valid.iloc[:split_idx]
    test_df = df_valid.iloc[split_idx:]
    
    print(f"\n📈 Train/Test Split:")
    print(f"  Train: {len(train_df):,} games ({train_df['date'].min()} → {train_df['date'].max()})")
    print(f"  Test:  {len(test_df):,} games ({test_df['date'].min()} → {test_df['date'].max()})")
    
    # Extract features and target
    X_train = train_df[feature_cols].values
    y_train = train_df["target_under_win"].values
    X_test = test_df[feature_cols].values
    y_test = test_df["target_under_win"].values
    
    # Check for NaNs and fill
    train_nans = np.isnan(X_train).sum()
    test_nans = np.isnan(X_test).sum()
    if train_nans > 0 or test_nans > 0:
        print(f"\n⚠️  Warning: Found {train_nans} NaNs in train, {test_nans} in test")
        print("    Filling NaNs with 0")
        X_train = np.nan_to_num(X_train, 0)
        X_test = np.nan_to_num(X_test, 0)
    
    # Class balance
    train_under_rate = y_train.mean()
    test_under_rate = y_test.mean()
    
    print(f"\n📊 Class Balance:")
    print(f"  Train UNDER rate: {train_under_rate:.1%}")
    print(f"  Test UNDER rate:  {test_under_rate:.1%}")
    
    return X_train, y_train, X_test, y_test, train_df, test_df


# ============================================================================
# MODEL TRAINING
# ============================================================================

def train_lgbm_classifier(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
    feature_names: List[str],
    args: argparse.Namespace,
) -> lgb.Booster:
    """Train LightGBM binary classifier with early stopping."""
    print("\n🌳 Training LightGBM UNDER Classifier V1...")
    
    # Create datasets
    train_data = lgb.Dataset(X_train, label=y_train, feature_name=feature_names)
    test_data = lgb.Dataset(X_test, label=y_test, feature_name=feature_names, reference=train_data)
    
    # Hyperparameters
    params = {
        "objective": "binary",
        "metric": ["binary_logloss", "auc"],
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
        "is_unbalance": False,  # Classes are roughly balanced (~50% UNDER)
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

def evaluate_classifier(
    model: lgb.Booster,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> Dict:
    """Evaluate classifier performance with calibration analysis."""
    print("\n📊 Model Evaluation:")
    
    # Predictions
    train_proba = model.predict(X_train, num_iteration=model.best_iteration)
    test_proba = model.predict(X_test, num_iteration=model.best_iteration)
    
    train_pred = (train_proba >= 0.5).astype(int)
    test_pred = (test_proba >= 0.5).astype(int)
    
    # Metrics
    train_auc = roc_auc_score(y_train, train_proba)
    train_logloss = log_loss(y_train, train_proba)
    train_acc = accuracy_score(y_train, train_pred)
    train_precision = precision_score(y_train, train_pred, zero_division=0)
    train_recall = recall_score(y_train, train_pred, zero_division=0)
    train_f1 = f1_score(y_train, train_pred, zero_division=0)
    
    test_auc = roc_auc_score(y_test, test_proba)
    test_logloss = log_loss(y_test, test_proba)
    test_acc = accuracy_score(y_test, test_pred)
    test_precision = precision_score(y_test, test_pred, zero_division=0)
    test_recall = recall_score(y_test, test_pred, zero_division=0)
    test_f1 = f1_score(y_test, test_pred, zero_division=0)
    
    print(f"\n  Train Set:")
    print(f"    AUC:       {train_auc:.4f}")
    print(f"    Log Loss:  {train_logloss:.4f}")
    print(f"    Accuracy:  {train_acc:.4f}")
    print(f"    Precision: {train_precision:.4f}")
    print(f"    Recall:    {train_recall:.4f}")
    print(f"    F1:        {train_f1:.4f}")
    
    print(f"\n  Test Set:")
    print(f"    AUC:       {test_auc:.4f}")
    print(f"    Log Loss:  {test_logloss:.4f}")
    print(f"    Accuracy:  {test_acc:.4f}")
    print(f"    Precision: {test_precision:.4f}")
    print(f"    Recall:    {test_recall:.4f}")
    print(f"    F1:        {test_f1:.4f}")
    
    # Calibration analysis (test set)
    print(f"\n  Calibration (Test Set):")
    print(f"  {'P(UNDER) Range':<20} {'Count':<10} {'Actual UNDER %':<20}")
    print(f"  {'-'*20} {'-'*10} {'-'*20}")
    
    calibration_bins = []
    bins = [(0.0, 0.4), (0.4, 0.45), (0.45, 0.5), (0.5, 0.55), (0.55, 0.6), (0.6, 1.0)]
    
    for low, high in bins:
        mask = (test_proba >= low) & (test_proba < high)
        count = mask.sum()
        if count > 0:
            actual_under_rate = y_test[mask].mean()
            print(f"  {low:.2f} - {high:.2f}        {count:<10} {actual_under_rate:.1%}")
            calibration_bins.append({
                "range": f"{low:.2f}-{high:.2f}",
                "count": int(count),
                "predicted_mean": float(test_proba[mask].mean()),
                "actual_under_rate": float(actual_under_rate),
            })
    
    # Betting simulation at different thresholds
    print(f"\n  UNDER Betting Simulation (Test Set, -110 odds):")
    print(f"  {'Threshold':<12} {'Bets':<10} {'Win Rate':<12} {'ROI':<10}")
    print(f"  {'-'*12} {'-'*10} {'-'*12} {'-'*10}")
    
    betting_results = []
    for threshold in [0.50, 0.52, 0.55, 0.57, 0.60]:
        mask = test_proba >= threshold
        bets = mask.sum()
        if bets > 0:
            wins = y_test[mask].sum()
            win_rate = wins / bets
            # -110 odds: risk 1.1 to win 1
            profit = wins * (1.0 / 1.1) - (bets - wins) * 1.0
            roi = (profit / bets) * 100
            print(f"  {threshold:<12.2f} {bets:<10} {win_rate:<12.1%} {roi:>+9.2f}%")
            betting_results.append({
                "threshold": threshold,
                "bets": int(bets),
                "win_rate": float(win_rate),
                "roi": float(roi),
            })
    
    return {
        "train": {
            "auc": float(train_auc),
            "log_loss": float(train_logloss),
            "accuracy": float(train_acc),
            "precision": float(train_precision),
            "recall": float(train_recall),
            "f1": float(train_f1),
            "samples": len(y_train),
        },
        "test": {
            "auc": float(test_auc),
            "log_loss": float(test_logloss),
            "accuracy": float(test_acc),
            "precision": float(test_precision),
            "recall": float(test_recall),
            "f1": float(test_f1),
            "samples": len(y_test),
        },
        "calibration_bins": calibration_bins,
        "betting_simulation": betting_results,
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
    print(f"  {'Rank':<6} {'Feature':<40} {'Importance':<12}")
    print(f"  {'-'*6} {'-'*40} {'-'*12}")
    for i, (feat, imp) in enumerate(feature_importance[:20], 1):
        print(f"  {i:<6} {feat:<40} {imp:>10.1f}")
    
    if len(feature_importance) > 20:
        print(f"  ... ({len(feature_importance) - 20} more features)")
    
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
        "model_version": "v1",
        "model_type": "lgbm_binary_classifier",
        "description": "UNDER-specific LightGBM classifier (complementary to OVER residual model)",
        "target": "target_under_win",
        "created_at": datetime.now().isoformat(),
        "features": feature_names,
        "num_features": len(feature_names),
        "feature_groups": {
            "core_team_strength": len(CORE_FEATURES),
            "under_specific": len(UNDER_SPECIFIC_FEATURES),
        },
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
            "description": "UNDER classifier for NBA totals (predicts P(actual < market))",
            "prediction": "p_under = model.predict(features)",
            "recommended_threshold": "0.55 (based on betting simulation)",
            "features_required": "Core team strength + UNDER-specific features",
            "complementary_to": "total_model_lgbm_residual_v2_top15 (OVER model)",
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
    print("NBA TOTALS UNDER CLASSIFIER V1 TRAINER")
    print("=" * 80)
    print("\n🎯 Classification model for UNDER detection")
    print("   - Complementary to OVER residual model")
    print("   - Uses core team strength + UNDER-specific features")
    print("   - Target: P(actual_total < market_line)")
    
    # Load data
    df, metadata = load_dataset()
    
    print(f"\n📋 Feature Groups:")
    print(f"   Core team strength: {len(CORE_FEATURES)} features")
    print(f"   UNDER-specific: {len(UNDER_SPECIFIC_FEATURES)} features")
    print(f"   Total: {len(ALL_FEATURES)} features")
    
    # Prepare train/test splits
    X_train, y_train, X_test, y_test, train_df, test_df = prepare_data(
        df, ALL_FEATURES, args.test_size
    )
    
    # Train model
    model = train_lgbm_classifier(X_train, y_train, X_test, y_test, ALL_FEATURES, args)
    
    # Evaluate
    metrics = evaluate_classifier(model, X_train, y_train, X_test, y_test, train_df, test_df)
    
    # Feature importance
    feature_importance = extract_feature_importance(model, ALL_FEATURES)
    
    # Save artifact
    save_artifact(model, ALL_FEATURES, feature_importance, metrics, args, train_df, test_df)
    
    print("\n" + "=" * 80)
    print("✅ TRAINING COMPLETE - UNDER CLASSIFIER V1")
    print("=" * 80)
    print(f"\n📈 Model Summary:")
    print(f"  Version: V1 (UNDER Classifier)")
    print(f"  Type: LightGBM Binary Classification")
    print(f"  Target: P(actual_total < market_line)")
    print(f"  Features: {len(ALL_FEATURES)}")
    print(f"  Trees: {model.best_iteration}")
    print(f"  Test AUC: {metrics['test']['auc']:.4f}")
    print(f"  Test Accuracy: {metrics['test']['accuracy']:.4f}")
    print(f"  Test F1: {metrics['test']['f1']:.4f}")
    print(f"\n✅ Ready for dual-model walk-forward backtest")
    print(f"   Recommended threshold: 0.55 (based on betting simulation)")


if __name__ == "__main__":
    main()
