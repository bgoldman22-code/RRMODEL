#!/usr/bin/env python3
"""
NBA Totals Feature Experiments - Walk-Forward Evaluation

NO BET LOGIC - Pure predictive performance evaluation:
- Feature importance (permutation-based, walk-forward aware)
- Ablation experiments (drop feature groups)
- Top-K feature experiments (use only most important features)
- Optional: test spread & line movement features

All experiments use walk-forward validation to measure:
- MAE, RMSE, Bias
- Correlation
- Edge distribution & calibration
- Feature importance

Usage:
  python ml/nba_totals_feature_experiments.py
  python ml/nba_totals_feature_experiments.py --experiments baseline drop_four_factors
  python ml/nba_totals_feature_experiments.py --skip-permutation
"""

from __future__ import annotations

import argparse
import json
import warnings
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.stats import pearsonr

warnings.filterwarnings('ignore')

# ============================================================================
# PATHS
# ============================================================================

REPO_ROOT = Path(__file__).parent.parent
DATASET_DIR = REPO_ROOT / "data" / "nba" / "datasets"
EXPERIMENTS_DIR = REPO_ROOT / "data" / "nba" / "experiments"
EXPERIMENTS_DIR.mkdir(parents=True, exist_ok=True)

RESIDUAL_DATASET = DATASET_DIR / "nba_totals_residual_dataset.parquet"
METADATA_FILE = DATASET_DIR / "nba_totals_residual_metadata.json"

OUTPUT_SUMMARY = EXPERIMENTS_DIR / "nba_totals_feature_experiments_summary.json"
OUTPUT_IMPORTANCE = EXPERIMENTS_DIR / "nba_totals_permutation_importance.json"

# ============================================================================
# LIGHTGBM PARAMETERS
# ============================================================================

LGBM_PARAMS = {
    "objective": "regression",
    "metric": ["rmse", "mae"],
    "boosting_type": "gbdt",
    "num_leaves": 32,
    "max_depth": 5,
    "learning_rate": 0.03,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.9,
    "bagging_freq": 1,
    "min_data_in_leaf": 20,
    "lambda_l1": 0.1,
    "lambda_l2": 0.1,
    "verbose": -1,
    "seed": 42,
}
NUM_BOOST_ROUND = 50
MIN_TRAIN_GAMES = 500

# ============================================================================
# FEATURE GROUPS
# ============================================================================

FEATURE_GROUPS = {
    "pace": [
        "home_l5_pace", "away_l5_pace",
        "home_l10_pace", "away_l10_pace",
        "home_season_pace", "away_season_pace",
        "pace_diff",
    ],
    "ratings": [
        "home_l5_ortg", "away_l5_ortg",
        "home_l5_drtg", "away_l5_drtg",
        "home_l10_ortg", "away_l10_ortg",
        "home_l10_drtg", "away_l10_drtg",
        "home_season_ortg", "away_season_ortg",
        "home_season_drtg", "away_season_drtg",
        "home_l10_net_rtg", "away_l10_net_rtg",
        "ortg_diff", "drtg_diff", "net_rtg_diff",
    ],
    "four_factors": [
        "home_l5_efg", "away_l5_efg",
        "home_l5_tov_pct", "away_l5_tov_pct",
        "home_l5_orb_pct", "away_l5_orb_pct",
        "home_l5_ft_rate", "away_l5_ft_rate",
        "home_l10_efg", "away_l10_efg",
        "home_l10_tov_pct", "away_l10_tov_pct",
        "home_l10_orb_pct", "away_l10_orb_pct",
        "home_l10_ft_rate", "away_l10_ft_rate",
        "home_season_efg", "away_season_efg",
        "home_season_tov_pct", "away_season_tov_pct",
        "home_season_orb_pct", "away_season_orb_pct",
        "home_season_ft_rate", "away_season_ft_rate",
        "efg_diff", "tov_pct_diff", "orb_pct_diff", "ft_rate_diff",
    ],
    "rest": [
        "home_rest_days", "away_rest_days",
        "home_b2b", "away_b2b",
        "home_three_in_four", "away_three_in_four",
        "home_four_in_six", "away_four_in_six",
    ],
    "matchups": [
        "home_ortg_vs_away_drtg", "away_ortg_vs_home_drtg",
    ],
    "home_court": [
        "home_court",
    ],
}

# ============================================================================
# EXPERIMENT CONFIGURATIONS
# ============================================================================

EXPERIMENTS = {
    "baseline_lgbm_residual_v1": {
        "description": "Full 63-feature model (baseline)",
        "feature_groups": ["pace", "ratings", "four_factors", "rest", "matchups", "home_court"],
    },
    "drop_four_factors": {
        "description": "Drop all Four Factors features",
        "feature_groups": ["pace", "ratings", "rest", "matchups", "home_court"],
    },
    "drop_rest_schedule": {
        "description": "Drop rest/schedule features (B2B, rest days, etc.)",
        "feature_groups": ["pace", "ratings", "four_factors", "matchups", "home_court"],
    },
    "drop_pace": {
        "description": "Drop all pace features",
        "feature_groups": ["ratings", "four_factors", "rest", "matchups", "home_court"],
    },
    "drop_matchups": {
        "description": "Drop matchup interaction features",
        "feature_groups": ["pace", "ratings", "four_factors", "rest", "home_court"],
    },
    "only_ratings_and_pace": {
        "description": "Keep only ratings and pace (drop rest, four factors, matchups)",
        "feature_groups": ["pace", "ratings", "home_court"],
    },
    "top_k_20_features": {
        "description": "Top 20 most important features",
        "feature_groups": "auto_top_k",
        "top_k": 20,
    },
    "top_k_15_features": {
        "description": "Top 15 most important features",
        "feature_groups": "auto_top_k",
        "top_k": 15,
    },
    "top_k_10_features": {
        "description": "Top 10 most important features",
        "feature_groups": "auto_top_k",
        "top_k": 10,
    },
}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def parse_args():
    parser = argparse.ArgumentParser(description="NBA Totals Feature Experiments")
    parser.add_argument("--experiments", nargs="*", default=None,
                        help="Specific experiments to run (default: all)")
    parser.add_argument("--skip-permutation", action="store_true",
                        help="Skip permutation importance calculation")
    parser.add_argument("--min-train-games", type=int, default=MIN_TRAIN_GAMES,
                        help="Minimum training games")
    return parser.parse_args()


def load_data() -> Tuple[pd.DataFrame, Dict, List[str]]:
    """Load dataset and metadata."""
    print("📂 Loading data...")
    
    if not RESIDUAL_DATASET.exists():
        raise FileNotFoundError(f"Dataset not found: {RESIDUAL_DATASET}")
    
    if not METADATA_FILE.exists():
        raise FileNotFoundError(f"Metadata not found: {METADATA_FILE}")
    
    df = pd.read_parquet(RESIDUAL_DATASET)
    with open(METADATA_FILE) as f:
        metadata = json.load(f)
    
    all_features = metadata["features"]
    
    # Filter to games with market odds
    df = df[df["consensus_total_line"].notna()].copy()
    df.sort_values("date", inplace=True)
    df.reset_index(drop=True, inplace=True)
    
    print(f"  ✅ Loaded {len(df):,} games with market odds")
    print(f"  ✅ Total features available: {len(all_features)}")
    print(f"  ✅ Date range: {df['date'].min()} → {df['date'].max()}")
    
    return df, metadata, all_features


def get_features_for_experiment(exp_config: Dict, all_features: List[str], 
                                 top_k_features: Optional[List[str]] = None) -> List[str]:
    """Build feature list for an experiment."""
    feature_groups = exp_config.get("feature_groups")
    
    if feature_groups == "auto_top_k":
        # Use top-K features from permutation importance
        if top_k_features is None:
            raise ValueError("top_k_features required for auto_top_k experiments")
        k = exp_config.get("top_k", 20)
        return top_k_features[:k]
    
    # Build from feature groups
    features = []
    for group in feature_groups:
        if group in FEATURE_GROUPS:
            features.extend(FEATURE_GROUPS[group])
        else:
            print(f"  ⚠️  Unknown feature group: {group}")
    
    # Verify features exist in dataset
    valid_features = [f for f in features if f in all_features]
    
    if len(valid_features) < len(features):
        missing = set(features) - set(valid_features)
        print(f"  ⚠️  Missing {len(missing)} features: {missing}")
    
    return valid_features


def train_lgbm(X_train: np.ndarray, y_train: np.ndarray, feature_names: List[str]) -> lgb.Booster:
    """Train LightGBM model."""
    train_data = lgb.Dataset(X_train, label=y_train, feature_name=feature_names)
    
    model = lgb.train(
        LGBM_PARAMS,
        train_data,
        num_boost_round=NUM_BOOST_ROUND,
        valid_sets=[train_data],
        callbacks=[lgb.log_evaluation(period=0)],  # Silent
    )
    
    return model


def walk_forward_evaluate(df: pd.DataFrame, feature_cols: List[str], 
                          experiment_name: str, min_train_games: int = MIN_TRAIN_GAMES) -> pd.DataFrame:
    """
    Run walk-forward evaluation with NO bet logic.
    
    Returns DataFrame with per-game predictions and errors.
    """
    print(f"\n🚀 Running walk-forward: {experiment_name}")
    print(f"  Features: {len(feature_cols)}")
    
    results = []
    dates = sorted(df["date"].unique())
    models_trained = 0
    
    for i, current_date in enumerate(dates, 1):
        train_mask = df["date"] < current_date
        test_mask = df["date"] == current_date
        
        train_df = df[train_mask]
        test_df = df[test_mask]
        
        if len(test_df) == 0:
            continue
        
        # Check minimum training size
        if len(train_df) < min_train_games:
            # Skip (insufficient data)
            for _, game in test_df.iterrows():
                results.append({
                    "experiment": experiment_name,
                    "date": game["date"],
                    "season": game["season"],
                    "game_id": game["game_id"],
                    "home_team": game["home_team"],
                    "away_team": game["away_team"],
                    "actual_total": game["actual_total"],
                    "market_total_line": game["consensus_total_line"],
                    "pred_residual": np.nan,
                    "pred_total": np.nan,
                    "edge": np.nan,
                    "residual_error": np.nan,
                    "abs_error": np.nan,
                    "squared_error": np.nan,
                    "train_games": len(train_df),
                    "skip_reason": "insufficient_training_data",
                })
            continue
        
        # Train model
        X_train = train_df[feature_cols].values
        y_train = train_df["target_residual"].values
        X_train = np.nan_to_num(X_train, 0)
        
        model = train_lgbm(X_train, y_train, feature_cols)
        models_trained += 1
        
        # Predict for each game on this date
        for _, game in test_df.iterrows():
            X_test = game[feature_cols].values.reshape(1, -1)
            X_test = np.nan_to_num(X_test, 0)
            
            pred_residual = model.predict(X_test)[0]
            pred_total = game["consensus_total_line"] + pred_residual
            edge = pred_total - game["consensus_total_line"]
            
            actual_residual = game["actual_total"] - game["consensus_total_line"]
            residual_error = actual_residual - pred_residual
            
            abs_error = abs(game["actual_total"] - pred_total)
            squared_error = (game["actual_total"] - pred_total) ** 2
            
            results.append({
                "experiment": experiment_name,
                "date": game["date"],
                "season": game["season"],
                "game_id": game["game_id"],
                "home_team": game["home_team"],
                "away_team": game["away_team"],
                "actual_total": game["actual_total"],
                "market_total_line": game["consensus_total_line"],
                "pred_residual": pred_residual,
                "pred_total": pred_total,
                "edge": edge,
                "residual_error": residual_error,
                "abs_error": abs_error,
                "squared_error": squared_error,
                "train_games": len(train_df),
                "skip_reason": None,
            })
        
        # Progress
        if i % 20 == 0 or i == len(dates):
            valid_count = len([r for r in results if r["skip_reason"] is None])
            print(f"  [{i:3d}/{len(dates)}] {current_date}: train={len(train_df):,}, "
                  f"predicted={valid_count:,}, models={models_trained}")
    
    results_df = pd.DataFrame(results)
    
    # Filter to valid predictions
    valid_df = results_df[results_df["skip_reason"].isna()].copy()
    
    print(f"  ✅ Complete: {len(valid_df):,} games predicted, {models_trained} models trained")
    
    return results_df


def compute_metrics(results_df: pd.DataFrame, experiment_name: str) -> Dict:
    """Compute predictive metrics (NO bet logic)."""
    valid_df = results_df[results_df["skip_reason"].isna()].copy()
    
    if len(valid_df) == 0:
        return {
            "experiment": experiment_name,
            "error": "no_valid_predictions",
        }
    
    # Basic error metrics
    mae = valid_df["abs_error"].mean()
    rmse = np.sqrt(valid_df["squared_error"].mean())
    bias = (valid_df["pred_total"] - valid_df["actual_total"]).mean()
    
    # Correlation
    correlation, _ = pearsonr(valid_df["pred_total"], valid_df["actual_total"])
    
    # Edge distribution
    edge_mean = valid_df["edge"].mean()
    edge_median = valid_df["edge"].median()
    edge_std = valid_df["edge"].std()
    
    # Edge buckets (distribution)
    edge_abs = valid_df["edge"].abs()
    edge_hist = {
        "0-2": len(valid_df[edge_abs < 2]) / len(valid_df) * 100,
        "2-4": len(valid_df[(edge_abs >= 2) & (edge_abs < 4)]) / len(valid_df) * 100,
        "4-6": len(valid_df[(edge_abs >= 4) & (edge_abs < 6)]) / len(valid_df) * 100,
        "6+": len(valid_df[edge_abs >= 6]) / len(valid_df) * 100,
    }
    
    # Calibration by edge bucket (what % of games actually beat the line in each bucket?)
    calibration = {}
    for bucket_name, lower, upper in [("3-4", 3, 4), ("4-5", 4, 5), ("5-6", 5, 6), ("6-8", 6, 8), ("8+", 8, 100)]:
        bucket_df = valid_df[(edge_abs >= lower) & (edge_abs < upper)]
        if len(bucket_df) > 0:
            # For OVER bets (edge > 0), success = actual > market
            over_df = bucket_df[bucket_df["edge"] > 0]
            under_df = bucket_df[bucket_df["edge"] < 0]
            
            over_success = len(over_df[over_df["actual_total"] > over_df["market_total_line"]]) / len(over_df) * 100 if len(over_df) > 0 else np.nan
            under_success = len(under_df[under_df["actual_total"] < under_df["market_total_line"]]) / len(under_df) * 100 if len(under_df) > 0 else np.nan
            
            calibration[bucket_name] = {
                "count": len(bucket_df),
                "over_count": len(over_df),
                "under_count": len(under_df),
                "over_success_pct": round(over_success, 2) if not np.isnan(over_success) else None,
                "under_success_pct": round(under_success, 2) if not np.isnan(under_success) else None,
            }
    
    metrics = {
        "experiment": experiment_name,
        "total_games": len(valid_df),
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "bias": round(bias, 3),
        "correlation": round(correlation, 4),
        "edge_distribution": {
            "mean": round(edge_mean, 3),
            "median": round(edge_median, 3),
            "std": round(edge_std, 3),
            "histogram_pct": {k: round(v, 2) for k, v in edge_hist.items()},
        },
        "calibration_by_edge_bucket": calibration,
    }
    
    return metrics


def permutation_importance_walk_forward(df: pd.DataFrame, feature_cols: List[str],
                                       min_train_games: int = MIN_TRAIN_GAMES) -> Dict:
    """
    Compute permutation importance using walk-forward predictions.
    
    For computational efficiency, we'll use a simplified approach:
    - Train on a fixed period (e.g., first 80% of data)
    - Test on remaining 20%
    - Permute each feature and measure impact on test metrics
    """
    print("\n🔍 Computing permutation importance (simplified walk-forward)...")
    
    # Use time-series split (80/20)
    split_idx = int(len(df) * 0.8)
    train_df = df.iloc[:split_idx]
    test_df = df.iloc[split_idx:]
    
    if len(train_df) < min_train_games:
        print("  ⚠️  Insufficient data for permutation importance")
        return {}
    
    print(f"  Train: {len(train_df):,} games ({train_df['date'].min()} → {train_df['date'].max()})")
    print(f"  Test:  {len(test_df):,} games ({test_df['date'].min()} → {test_df['date'].max()})")
    
    # Train baseline model
    X_train = train_df[feature_cols].values
    y_train = train_df["target_residual"].values
    X_train = np.nan_to_num(X_train, 0)
    
    X_test = test_df[feature_cols].values
    y_test = test_df["target_residual"].values
    market_lines = test_df["consensus_total_line"].values
    actual_totals = test_df["actual_total"].values
    
    X_test = np.nan_to_num(X_test, 0)
    
    print(f"  Training baseline model on {len(train_df):,} games...")
    baseline_model = train_lgbm(X_train, y_train, feature_cols)
    
    # Baseline predictions
    baseline_pred_residuals = baseline_model.predict(X_test)
    baseline_pred_totals = market_lines + baseline_pred_residuals
    
    baseline_mae = np.mean(np.abs(actual_totals - baseline_pred_totals))
    baseline_rmse = np.sqrt(np.mean((actual_totals - baseline_pred_totals) ** 2))
    baseline_corr, _ = pearsonr(baseline_pred_totals, actual_totals)
    
    print(f"  Baseline: MAE={baseline_mae:.3f}, RMSE={baseline_rmse:.3f}, Corr={baseline_corr:.4f}")
    
    # Permutation importance for each feature
    print(f"\n  Computing permutation importance for {len(feature_cols)} features...")
    
    importances = []
    
    for i, feat in enumerate(feature_cols, 1):
        # Create permuted test set
        X_test_permuted = X_test.copy()
        feat_idx = feature_cols.index(feat)
        np.random.seed(42)
        X_test_permuted[:, feat_idx] = np.random.permutation(X_test_permuted[:, feat_idx])
        
        # Predict with permuted feature
        pred_residuals = baseline_model.predict(X_test_permuted)
        pred_totals = market_lines + pred_residuals
        
        # Compute degraded metrics
        perm_mae = np.mean(np.abs(actual_totals - pred_totals))
        perm_rmse = np.sqrt(np.mean((actual_totals - pred_totals) ** 2))
        perm_corr, _ = pearsonr(pred_totals, actual_totals)
        
        # Importance = increase in error / decrease in correlation
        mae_increase = perm_mae - baseline_mae
        rmse_increase = perm_rmse - baseline_rmse
        corr_decrease = baseline_corr - perm_corr
        
        importances.append({
            "feature": feat,
            "baseline_mae": round(baseline_mae, 3),
            "permuted_mae": round(perm_mae, 3),
            "mae_increase": round(mae_increase, 3),
            "baseline_rmse": round(baseline_rmse, 3),
            "permuted_rmse": round(perm_rmse, 3),
            "rmse_increase": round(rmse_increase, 3),
            "baseline_corr": round(baseline_corr, 4),
            "permuted_corr": round(perm_corr, 4),
            "corr_decrease": round(corr_decrease, 4),
            "importance_score": round(mae_increase + corr_decrease * 10, 3),  # Combined metric
        })
        
        if i % 10 == 0 or i == len(feature_cols):
            print(f"    [{i:2d}/{len(feature_cols)}] {feat:40s} MAE+={mae_increase:+.3f}, Corr-={corr_decrease:+.4f}")
    
    # Sort by importance
    importances.sort(key=lambda x: x["importance_score"], reverse=True)
    
    print(f"\n  ✅ Top 15 most important features:")
    for i, imp in enumerate(importances[:15], 1):
        print(f"    {i:2d}. {imp['feature']:40s} Score={imp['importance_score']:7.3f} "
              f"(MAE+={imp['mae_increase']:+.3f}, Corr-={imp['corr_decrease']:+.4f})")
    
    return {
        "baseline_metrics": {
            "mae": round(baseline_mae, 3),
            "rmse": round(baseline_rmse, 3),
            "correlation": round(baseline_corr, 4),
        },
        "importances": importances,
        "train_period": {
            "start": str(train_df["date"].min()),
            "end": str(train_df["date"].max()),
            "games": len(train_df),
        },
        "test_period": {
            "start": str(test_df["date"].min()),
            "end": str(test_df["date"].max()),
            "games": len(test_df),
        },
    }


def permutation_importance_by_group(df: pd.DataFrame, feature_cols: List[str],
                                   min_train_games: int = MIN_TRAIN_GAMES) -> Dict:
    """Compute permutation importance at the group level."""
    print("\n🔍 Computing group-level permutation importance...")
    
    # Use same train/test split
    split_idx = int(len(df) * 0.8)
    train_df = df.iloc[:split_idx]
    test_df = df.iloc[split_idx:]
    
    # Train baseline
    X_train = train_df[feature_cols].values
    y_train = train_df["target_residual"].values
    X_train = np.nan_to_num(X_train, 0)
    
    X_test = test_df[feature_cols].values
    y_test = test_df["target_residual"].values
    market_lines = test_df["consensus_total_line"].values
    actual_totals = test_df["actual_total"].values
    X_test = np.nan_to_num(X_test, 0)
    
    baseline_model = train_lgbm(X_train, y_train, feature_cols)
    baseline_pred_residuals = baseline_model.predict(X_test)
    baseline_pred_totals = market_lines + baseline_pred_residuals
    
    baseline_mae = np.mean(np.abs(actual_totals - baseline_pred_totals))
    baseline_corr, _ = pearsonr(baseline_pred_totals, actual_totals)
    
    # Permute each group
    group_importances = []
    
    for group_name, group_features in FEATURE_GROUPS.items():
        # Only permute features that exist in current feature set
        group_features_present = [f for f in group_features if f in feature_cols]
        
        if not group_features_present:
            continue
        
        # Permute all features in group
        X_test_permuted = X_test.copy()
        for feat in group_features_present:
            feat_idx = feature_cols.index(feat)
            np.random.seed(42)
            X_test_permuted[:, feat_idx] = np.random.permutation(X_test_permuted[:, feat_idx])
        
        # Predict with permuted group
        pred_residuals = baseline_model.predict(X_test_permuted)
        pred_totals = market_lines + pred_residuals
        
        perm_mae = np.mean(np.abs(actual_totals - pred_totals))
        perm_corr, _ = pearsonr(pred_totals, actual_totals)
        
        mae_increase = perm_mae - baseline_mae
        corr_decrease = baseline_corr - perm_corr
        
        group_importances.append({
            "group": group_name,
            "num_features": len(group_features_present),
            "features": group_features_present,
            "mae_increase": round(mae_increase, 3),
            "corr_decrease": round(corr_decrease, 4),
            "importance_score": round(mae_increase + corr_decrease * 10, 3),
        })
        
        print(f"  {group_name:20s} ({len(group_features_present):2d} feats): "
              f"MAE+={mae_increase:+.3f}, Corr-={corr_decrease:+.4f}, Score={mae_increase + corr_decrease * 10:7.3f}")
    
    group_importances.sort(key=lambda x: x["importance_score"], reverse=True)
    
    return {
        "baseline_mae": round(baseline_mae, 3),
        "baseline_corr": round(baseline_corr, 4),
        "group_importances": group_importances,
    }


# ============================================================================
# MAIN
# ============================================================================

def main():
    args = parse_args()
    
    print("=" * 80)
    print("NBA TOTALS FEATURE EXPERIMENTS - WALK-FORWARD EVALUATION")
    print("=" * 80)
    print("\n🎯 Goal: Understand which features matter (NO bet logic)")
    
    # Load data
    df, metadata, all_features = load_data()
    
    # Determine which experiments to run
    if args.experiments:
        experiments_to_run = {k: v for k, v in EXPERIMENTS.items() if k in args.experiments}
        if not experiments_to_run:
            print(f"\n⚠️  No matching experiments found: {args.experiments}")
            return
    else:
        experiments_to_run = EXPERIMENTS
    
    print(f"\n🧪 Running {len(experiments_to_run)} experiments:")
    for exp_name, exp_config in experiments_to_run.items():
        print(f"  - {exp_name}: {exp_config['description']}")
    
    # ========================================================================
    # 1. PERMUTATION IMPORTANCE (if not skipped)
    # ========================================================================
    
    top_k_features = None
    
    if not args.skip_permutation:
        print("\n" + "=" * 80)
        print("STEP 1: PERMUTATION IMPORTANCE")
        print("=" * 80)
        
        # Use all features for importance calculation
        importance_results = permutation_importance_walk_forward(df, all_features, args.min_train_games)
        
        # Group-level importance
        group_importance_results = permutation_importance_by_group(df, all_features, args.min_train_games)
        
        # Save importance results
        importance_output = {
            "timestamp": datetime.now().isoformat(),
            "feature_level": importance_results,
            "group_level": group_importance_results,
        }
        
        with open(OUTPUT_IMPORTANCE, "w") as f:
            json.dump(importance_output, f, indent=2)
        
        print(f"\n✅ Saved permutation importance: {OUTPUT_IMPORTANCE.relative_to(REPO_ROOT)}")
        
        # Extract top-K features for later experiments
        if "importances" in importance_results:
            top_k_features = [imp["feature"] for imp in importance_results["importances"]]
    
    # ========================================================================
    # 2. RUN EXPERIMENTS
    # ========================================================================
    
    print("\n" + "=" * 80)
    print("STEP 2: RUN EXPERIMENTS")
    print("=" * 80)
    
    all_results = {}
    all_metrics = {}
    
    for exp_name, exp_config in experiments_to_run.items():
        print(f"\n{'─' * 80}")
        print(f"Experiment: {exp_name}")
        print(f"Description: {exp_config['description']}")
        print(f"{'─' * 80}")
        
        # Get feature list for this experiment
        try:
            feature_cols = get_features_for_experiment(exp_config, all_features, top_k_features)
        except ValueError as e:
            print(f"  ⚠️  Skipping {exp_name}: {e}")
            continue
        
        if not feature_cols:
            print(f"  ⚠️  Skipping {exp_name}: No valid features")
            continue
        
        print(f"  Using {len(feature_cols)} features")
        
        # Run walk-forward evaluation
        results_df = walk_forward_evaluate(df, feature_cols, exp_name, args.min_train_games)
        
        # Compute metrics
        metrics = compute_metrics(results_df, exp_name)
        
        # Store results
        all_results[exp_name] = results_df
        all_metrics[exp_name] = metrics
        
        # Print summary
        if "error" not in metrics:
            print(f"\n  📊 Metrics:")
            print(f"    Games: {metrics['total_games']:,}")
            print(f"    MAE: {metrics['mae']:.3f} points")
            print(f"    RMSE: {metrics['rmse']:.3f} points")
            print(f"    Bias: {metrics['bias']:+.3f} points")
            print(f"    Correlation: {metrics['correlation']:.4f}")
            print(f"    Edge std: {metrics['edge_distribution']['std']:.3f}")
            
            print(f"\n  📊 Edge Distribution:")
            for bucket, pct in metrics['edge_distribution']['histogram_pct'].items():
                print(f"    {bucket:5s}: {pct:5.1f}%")
            
            print(f"\n  📊 Calibration (success rate by edge bucket):")
            for bucket, cal in metrics['calibration_by_edge_bucket'].items():
                if cal['over_count'] > 0 or cal['under_count'] > 0:
                    over_str = f"{cal['over_success_pct']:.1f}%" if cal['over_success_pct'] else "N/A"
                    under_str = f"{cal['under_success_pct']:.1f}%" if cal['under_success_pct'] else "N/A"
                    print(f"    {bucket:5s}: {cal['count']:3d} games (O={cal['over_count']:3d}@{over_str:6s}, "
                          f"U={cal['under_count']:3d}@{under_str:6s})")
        
        # Save per-experiment results
        exp_results_file = EXPERIMENTS_DIR / f"nba_totals_feature_experiments_results_{exp_name}.csv"
        results_df.to_csv(exp_results_file, index=False)
        print(f"\n  ✅ Saved results: {exp_results_file.relative_to(REPO_ROOT)}")
    
    # ========================================================================
    # 3. SAVE SUMMARY
    # ========================================================================
    
    print("\n" + "=" * 80)
    print("STEP 3: SAVE SUMMARY")
    print("=" * 80)
    
    summary = {
        "timestamp": datetime.now().isoformat(),
        "config": {
            "min_train_games": args.min_train_games,
            "lgbm_params": LGBM_PARAMS,
            "num_boost_round": NUM_BOOST_ROUND,
        },
        "experiments": all_metrics,
    }
    
    with open(OUTPUT_SUMMARY, "w") as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n✅ Saved summary: {OUTPUT_SUMMARY.relative_to(REPO_ROOT)}")
    
    # ========================================================================
    # 4. COMPARISON TABLE
    # ========================================================================
    
    print("\n" + "=" * 80)
    print("EXPERIMENT COMPARISON")
    print("=" * 80)
    
    print(f"\n{'Experiment':<30s} {'Feats':>6s} {'MAE':>7s} {'RMSE':>7s} {'Bias':>7s} {'Corr':>7s} {'Edge Std':>9s} {'Games':>7s}")
    print("─" * 100)
    
    for exp_name, metrics in all_metrics.items():
        if "error" in metrics:
            print(f"{exp_name:<30s} ERROR")
        else:
            # Get feature count
            exp_config = experiments_to_run[exp_name]
            feature_cols = get_features_for_experiment(exp_config, all_features, top_k_features)
            feat_count = len(feature_cols)
            
            print(f"{exp_name:<30s} {feat_count:6d} "
                  f"{metrics['mae']:7.3f} "
                  f"{metrics['rmse']:7.3f} "
                  f"{metrics['bias']:+7.3f} "
                  f"{metrics['correlation']:7.4f} "
                  f"{metrics['edge_distribution']['std']:9.3f} "
                  f"{metrics['total_games']:7,d}")
    
    print("\n" + "=" * 80)
    print("✅ EXPERIMENTS COMPLETE")
    print("=" * 80)
    
    print(f"\n📁 Output files:")
    print(f"  - Summary: {OUTPUT_SUMMARY.relative_to(REPO_ROOT)}")
    if not args.skip_permutation:
        print(f"  - Importance: {OUTPUT_IMPORTANCE.relative_to(REPO_ROOT)}")
    print(f"  - Per-experiment CSVs: data/nba/experiments/nba_totals_feature_experiments_results_*.csv")
    
    print(f"\n💡 Key Insights:")
    print(f"  - Compare MAE/Correlation across experiments to find optimal feature set")
    print(f"  - Check calibration tables: ideally, higher edge buckets should have higher success rates")
    print(f"  - Lower edge std may indicate better calibration (less overconfidence)")
    print(f"  - NO bet logic applied yet - these are pure predictive metrics")


if __name__ == "__main__":
    main()
