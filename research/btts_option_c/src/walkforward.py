#!/usr/bin/env python3
"""
Walk-Forward Backtesting Engine

Implements time-series expanding-window walk-forward validation for all three phases:
- Phase 1: Baseline models (Logistic, Poisson, Random Forest)
- Phase 2: Modern ML (LightGBM, XGBoost, CatBoost)
- Phase 3: Hybrids (DC residual, DC blend, DC stacked)

Uses proper time-series splitting with NO data leakage.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

# Import model trainers
from model_baselines import (
    fit_logistic, predict_logistic,
    fit_poisson, predict_poisson,
    fit_random_forest, predict_random_forest
)
from model_ml import (
    fit_lightgbm, predict_lightgbm,
    fit_xgboost, predict_xgboost,
    fit_catboost, predict_catboost
)
from model_phase3_hybrids import (
    load_dc_probs,
    fit_dc_residual_model, predict_dc_residual_model,
    fit_blended_model, predict_blended_model,
    fit_stacked_model, predict_stacked_model
)
from evaluate import (
    compute_classification_metrics,
    run_threshold_sweep,
    compute_fair_yes_odds,
    run_two_sided_threshold_sweep,
    compute_fair_two_way
)


# Model definitions per phase
PHASE1_MODELS = ["logistic", "poisson", "random_forest"]
PHASE2_MODELS = ["lightgbm", "xgboost", "catboost"]
PHASE3_MODELS = []  # ❌ DISABLED: Phase 3 is leaky (uses perfect in-sample predictions)
                    # TODO: Re-implement with proper out-of-fold stacking


@dataclass
class WalkforwardWindowConfig:
    """Configuration for time-window based walk-forward splits."""

    test_window_days: int = 60
    step_days: int = 60
    min_train_days: int = 150
    min_train_matches: int = 200
    min_test_matches: int = 50
    min_test_unique_dates: int = 12


DEFAULT_WALKFORWARD_WINDOW_CONFIG = WalkforwardWindowConfig()


def create_walkforward_splits(
    df: pd.DataFrame,
    n_splits: int = 6,
    window_config: Optional[WalkforwardWindowConfig] = None
) -> List[Tuple[pd.DataFrame, pd.DataFrame, Dict]]:
    """
    Create walk-forward splits using fixed time windows with safety guards.

    Args:
        df: Full dataset (must include 'date' column)
        n_splits: Maximum number of folds to return
        window_config: Optional override for window sizing / guardrails

    Returns:
        List of (train_df, test_df, metadata) tuples
    """
    print(f"\n{'='*80}")
    print(f"CREATING WALK-FORWARD SPLITS (target {n_splits})")
    print(f"{'='*80}")

    if 'date' not in df.columns:
        raise ValueError("Dataset must contain 'date' column for walk-forward splits")

    df = df.copy()
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)

    config = window_config or DEFAULT_WALKFORWARD_WINDOW_CONFIG
    min_date = df['date'].min()
    max_date = df['date'].max()

    print(f"📅 Full date range: {min_date.date()} to {max_date.date()}")
    print(f"📊 Total matches: {len(df)} | Unique dates: {df['date'].nunique()}")
    print(
        f"⚙️  Window config -> test_window: {config.test_window_days}d, step: {config.step_days}d, "
        f"min train: {config.min_train_days}d/{config.min_train_matches} matches, "
        f"min test matches: {config.min_test_matches}, min test dates: {config.min_test_unique_dates}"
    )

    splits: List[Tuple[pd.DataFrame, pd.DataFrame, Dict]] = []
    test_window = pd.Timedelta(days=config.test_window_days)
    step = pd.Timedelta(days=config.step_days)
    min_train_span = pd.Timedelta(days=config.min_train_days)

    current_test_start = min_date + min_train_span
    fold_attempt = 1

    while current_test_start < max_date and len(splits) < n_splits:
        test_end = min(current_test_start + test_window, max_date + pd.Timedelta(days=1))
        train_mask = df['date'] < current_test_start
        test_mask = (df['date'] >= current_test_start) & (df['date'] < test_end)
        train_df = df.loc[train_mask].copy()
        test_df = df.loc[test_mask].copy()

        train_span = train_df['date'].max() - train_df['date'].min() if len(train_df) else pd.Timedelta(0)
        test_unique_dates = test_df['date'].nunique()

        if len(train_df) < config.min_train_matches:
            print(
                f"⚠️  Skip attempt {fold_attempt}: insufficient train matches "
                f"({len(train_df)} < {config.min_train_matches}) before {current_test_start.date()}"
            )
        elif train_span < min_train_span:
            print(
                f"⚠️  Skip attempt {fold_attempt}: train span {train_span.days}d < {config.min_train_days}d"
            )
        elif len(test_df) < config.min_test_matches:
            print(
                f"⚠️  Skip attempt {fold_attempt}: insufficient test matches "
                f"({len(test_df)} < {config.min_test_matches}) in window {current_test_start.date()} - {(test_end - pd.Timedelta(days=1)).date()}"
            )
        elif test_unique_dates < config.min_test_unique_dates:
            print(
                f"⚠️  Skip attempt {fold_attempt}: only {test_unique_dates} unique test dates "
                f"(< {config.min_test_unique_dates})"
            )
        else:
            fold_id = len(splits) + 1
            fold_meta = {
                'fold': fold_id,
                'train_start': train_df['date'].min().date(),
                'train_end': train_df['date'].max().date(),
                'test_start': test_df['date'].min().date(),
                'test_end': test_df['date'].max().date(),
                'train_matches': len(train_df),
                'test_matches': len(test_df),
                'train_unique_dates': train_df['date'].nunique(),
                'test_unique_dates': test_unique_dates
            }

            print(f"\nFold {fold_id} window:")
            print(
                f"  Train: {fold_meta['train_start']} → {fold_meta['train_end']} "
                f"({fold_meta['train_matches']} matches across {fold_meta['train_unique_dates']} dates)"
            )
            print(
                f"  Test:  {fold_meta['test_start']} → {fold_meta['test_end']} "
                f"({fold_meta['test_matches']} matches across {fold_meta['test_unique_dates']} dates)"
            )

            splits.append((train_df, test_df, fold_meta))

        fold_attempt += 1
        current_test_start += step

    if len(splits) == 0:
        raise RuntimeError("Failed to create any walk-forward folds with the provided window config")

    if len(splits) < n_splits:
        print(
            f"⚠️  Requested {n_splits} folds but only built {len(splits)} valid windows "
            f"(max date reached)."
        )

    print(f"\n✅ Created {len(splits)} walk-forward splits")
    return splits


def train_and_predict_phase1(
    model_name: str,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame
) -> np.ndarray:
    """
    Train and predict for Phase 1 baseline model
    
    Args:
        model_name: One of ['logistic', 'poisson', 'random_forest']
        train_df: Training data
        test_df: Test data
    
    Returns:
        Array of BTTS probabilities for test set
    """
    if model_name == "logistic":
        model = fit_logistic(train_df)
        return predict_logistic(model, test_df)
    elif model_name == "poisson":
        model = fit_poisson(train_df)
        return predict_poisson(model, test_df)
    elif model_name == "random_forest":
        model = fit_random_forest(train_df)
        return predict_random_forest(model, test_df)
    else:
        raise ValueError(f"Unknown Phase 1 model: {model_name}")


def train_and_predict_phase2(
    model_name: str,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame
) -> np.ndarray:
    """
    Train and predict for Phase 2 modern ML model
    
    Args:
        model_name: One of ['lightgbm', 'xgboost', 'catboost']
        train_df: Training data
        test_df: Test data
    
    Returns:
        Array of BTTS probabilities for test set
    """
    if model_name == "lightgbm":
        model = fit_lightgbm(train_df)
        return predict_lightgbm(model, test_df)
    elif model_name == "xgboost":
        model = fit_xgboost(train_df)
        return predict_xgboost(model, test_df)
    elif model_name == "catboost":
        model = fit_catboost(train_df)
        return predict_catboost(model, test_df)
    else:
        raise ValueError(f"Unknown Phase 2 model: {model_name}")


def train_and_predict_phase3(
    model_name: str,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    base_models_train: Dict[str, np.ndarray],
    base_models_test: Dict[str, np.ndarray]
) -> np.ndarray:
    """
    Train and predict for Phase 3 hybrid model
    
    Args:
        model_name: One of ['dc_residual', 'dc_blend', 'dc_stacked']
        train_df: Training data
        test_df: Test data
        base_models_train: Dict of base model predictions on train set
        base_models_test: Dict of base model predictions on test set
    
    Returns:
        Array of BTTS probabilities for test set
    """
    # Load DC probabilities
    dc_probs_train = load_dc_probs(train_df)
    dc_probs_test = load_dc_probs(test_df)
    
    if model_name == "dc_residual":
        # Use best ML model for residual (typically LightGBM)
        best_ml_model = "lightgbm"
        model = fit_dc_residual_model(train_df, dc_probs_train)
        return predict_dc_residual_model(model, test_df, dc_probs_test)
    
    elif model_name == "dc_blend":
        # Blend DC with best ML model
        best_ml_model = "lightgbm"
        p_ml_train = base_models_train.get(best_ml_model)
        p_ml_test = base_models_test.get(best_ml_model)
        
        if p_ml_train is None or p_ml_test is None:
            # Fallback: train ML model if not available
            ml_model = fit_lightgbm(train_df)
            p_ml_train = predict_lightgbm(ml_model, train_df)
            p_ml_test = predict_lightgbm(ml_model, test_df)
        
        blend_params = fit_blended_model(train_df, dc_probs_train, p_ml_train)
        return predict_blended_model(blend_params, dc_probs_test, p_ml_test)
    
    elif model_name == "dc_stacked":
        # Stack all base model predictions
        meta_model = fit_stacked_model(train_df, base_models_train)
        return predict_stacked_model(meta_model, base_models_test)
    
    else:
        raise ValueError(f"Unknown Phase 3 model: {model_name}")


def evaluate_fold(
    fold: int,
    phase: str,
    model_name: str,
    y_true: np.ndarray,
    y_proba: np.ndarray,
    yes_odds: np.ndarray,
    fair_yes_odds: Optional[np.ndarray],
    thresholds: List[float] = [0.50, 0.55, 0.60, 0.65],
    fold_meta: Optional[Dict] = None
) -> Tuple[Dict, List[Dict]]:
    """
    Evaluate model performance on a single fold
    
    Args:
        fold: Fold number
        phase: Phase name ('Phase 1', 'Phase 2', 'Phase 3')
        model_name: Model name
        y_true: True BTTS labels
        y_proba: Predicted BTTS probabilities
        yes_odds: Bookmaker BTTS YES odds
        thresholds: Betting thresholds to test
    
    Returns:
        (metrics_dict, roi_dicts_list)
    """
    # Compute classification metrics
    metrics = compute_classification_metrics(y_true, y_proba)
    metrics_dict = {
        'fold': fold,
        'phase': phase,
        'model': model_name,
        'auc': metrics['auc'],
        'brier': metrics['brier'],
        'logloss': metrics['logloss'],
        'n_samples': len(y_true)
    }
    if fold_meta:
        metrics_dict.update({
            'train_start': fold_meta.get('train_start'),
            'train_end': fold_meta.get('train_end'),
            'test_start': fold_meta.get('test_start'),
            'test_end': fold_meta.get('test_end'),
            'train_matches': fold_meta.get('train_matches'),
            'test_matches': fold_meta.get('test_matches'),
            'train_unique_dates': fold_meta.get('train_unique_dates'),
            'test_unique_dates': fold_meta.get('test_unique_dates')
        })
    
    # Compute ROI for each threshold
        roi_dicts = []
        sweep_results = run_threshold_sweep(
            y_true,
            y_proba,
            yes_odds,
            thresholds=thresholds,
            stake=10.0,
            require_positive_edge=False,
            fair_yes_odds=fair_yes_odds
        )
        for sweep_row in sweep_results:
            roi_entry = {
                'fold': fold,
                'phase': phase,
                'model': model_name,
                'threshold': sweep_row['threshold'],
                'roi': sweep_row['roi'],
                'roi_fair': sweep_row['roi_fair'],
                'n_bets': sweep_row['bets'],
                'profit': sweep_row['profit'],
                'profit_fair': sweep_row['profit_fair'],
                'wins': sweep_row['wins'],
                'losses': sweep_row['losses'],
                'total_staked': sweep_row['total_staked'],
                'avg_edge': sweep_row['avg_edge'],
                'median_edge': sweep_row['median_edge']
            }
            if fold_meta:
                roi_entry.update({
                    'train_start': fold_meta.get('train_start'),
                    'train_end': fold_meta.get('train_end'),
                    'test_start': fold_meta.get('test_start'),
                    'test_end': fold_meta.get('test_end')
                })
            roi_dicts.append(roi_entry)
    
    return metrics_dict, roi_dicts


def run_all_walkforward_experiments(
    df: pd.DataFrame,
    n_splits: int = 6,
    thresholds: List[float] = [0.50, 0.55, 0.60, 0.65],
    window_config: Optional[WalkforwardWindowConfig] = None
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Run complete walk-forward backtest for all phases
    
    Args:
        df: Full engineered dataset with BTTS labels and odds
        n_splits: Number of walk-forward folds (default 6)
        thresholds: Betting thresholds to test (default [0.50, 0.55, 0.60, 0.65])
        window_config: Optional override for split window sizing / guards
    
    Returns:
        (metrics_df, roi_df)
    """
    print("\n" + "="*80)
    print("WALK-FORWARD BACKTEST - ALL PHASES")
    print("="*80)
    
    # Create splits
    splits = create_walkforward_splits(df, n_splits=n_splits, window_config=window_config)
    
    # Storage for results
    all_metrics = []
    all_roi = []
    
    # Run each fold
    for train_df, test_df, fold_meta in splits:
        fold_idx = fold_meta['fold']
        print(f"\n{'='*80}")
        print(f"FOLD {fold_idx}/{n_splits}")
        print(f"{'='*80}")
        
        # Get true labels and odds for test set
        y_true_test = test_df['btts'].values
        yes_odds_test = test_df['btts_yes_odds'].values if 'btts_yes_odds' in test_df.columns else np.full(len(test_df), np.nan)
        no_odds_test = test_df['btts_no_odds'].values if 'btts_no_odds' in test_df.columns else np.full(len(test_df), np.nan)
        fair_yes_odds = compute_fair_yes_odds(yes_odds_test, no_odds_test)
        
        # ✅ GUARD: Skip folds with too few samples or single-class labels
        if len(test_df) < 30:
            print(f"⚠️  Skipping fold {fold_idx}: too few test samples ({len(test_df)})")
            continue
        
        if len(np.unique(y_true_test)) < 2:
            print(f"⚠️  Skipping fold {fold_idx}: only one class present in test labels")
            continue
        
        # ✅ ASSERT: Verify no train/test overlap
        assert set(train_df.index).isdisjoint(set(test_df.index)), \
            f"Fold {fold_idx}: Train/test index overlap detected!"
        
        train_keys = set(zip(train_df['season'], train_df['date'], 
                             train_df['home_norm'], train_df['away_norm']))
        test_keys = set(zip(test_df['season'], test_df['date'], 
                            test_df['home_norm'], test_df['away_norm']))
        assert train_keys.isdisjoint(test_keys), \
            f"Fold {fold_idx}: Duplicate matches in train/test!"
        
        # Storage for base model predictions (needed for Phase 3)
        base_models_train = {}
        base_models_test = {}
        
        # ========== PHASE 1: BASELINE MODELS ==========
        print(f"\n🔷 PHASE 1: Baseline Models")
        for model_name in PHASE1_MODELS:
            try:
                print(f"   Training {model_name}...")
                # ✅ ONLY predict on test (no train predictions to avoid memorization)
                y_proba_test = train_and_predict_phase1(model_name, train_df, test_df)
                
                # Store for Phase 3 (if re-enabled with proper OOF)
                base_models_test[model_name] = y_proba_test
                
                # Evaluate
                metrics, roi_list = evaluate_fold(
                    fold_idx, "Phase 1: Baseline", model_name,
                    y_true_test, y_proba_test, yes_odds_test, fair_yes_odds, thresholds,
                    fold_meta=fold_meta
                )
                all_metrics.append(metrics)
                all_roi.extend(roi_list)
                
                print(f"      ✅ AUC: {metrics['auc']:.4f}, Brier: {metrics['brier']:.4f}")
            except Exception as e:
                print(f"      ❌ {model_name} failed: {e}")
        
        # ========== PHASE 2: MODERN ML ==========
        print(f"\n🔷 PHASE 2: Modern ML")
        for model_name in PHASE2_MODELS:
            try:
                print(f"   Training {model_name}...")
                # ✅ ONLY predict on test (no train predictions to avoid memorization)
                y_proba_test = train_and_predict_phase2(model_name, train_df, test_df)
                
                # Store for Phase 3 (if re-enabled with proper OOF)
                base_models_test[model_name] = y_proba_test
                
                # Evaluate
                metrics, roi_list = evaluate_fold(
                    fold_idx, "Phase 2: Modern ML", model_name,
                    y_true_test, y_proba_test, yes_odds_test, fair_yes_odds, thresholds,
                    fold_meta=fold_meta
                )
                all_metrics.append(metrics)
                all_roi.extend(roi_list)
                
                print(f"      ✅ AUC: {metrics['auc']:.4f}, Brier: {metrics['brier']:.4f}")
            except Exception as e:
                print(f"      ❌ {model_name} failed: {e}")
        
        # ========== PHASE 3: HYBRIDS ==========
        print(f"\n🔷 PHASE 3: Hybrid Models")
        for model_name in PHASE3_MODELS:
            try:
                print(f"   Training {model_name}...")
                y_proba_test = train_and_predict_phase3(
                    model_name, train_df, test_df,
                    base_models_train, base_models_test
                )
                
                # Evaluate
                metrics, roi_list = evaluate_fold(
                    fold_idx, "Phase 3: Hybrid", model_name,
                    y_true_test, y_proba_test, yes_odds_test, fair_yes_odds, thresholds,
                    fold_meta=fold_meta
                )
                all_metrics.append(metrics)
                all_roi.extend(roi_list)
                
                print(f"      ✅ AUC: {metrics['auc']:.4f}, Brier: {metrics['brier']:.4f}")
            except Exception as e:
                print(f"      ❌ {model_name} failed: {e}")
    
    # ========== TWO-SIDED BETTING EVALUATION ==========
    print(f"\n{'='*80}")
    print("TWO-SIDED BETTING EVALUATION (YES + NO)")
    print(f"{'='*80}")
    print("Computing two-sided threshold sweeps for all folds...")
    print("(This extends betting to both BTTS YES and BTTS NO using p_no = 1 - p_yes)")
    
    # Re-run experiments with two-sided sweep for each fold
    all_two_sided = []
    
    for train_df, test_df, fold_meta in splits:
        fold_idx = fold_meta['fold']
        print(f"\n🔷 Fold {fold_idx}: Two-sided sweep")
        
        # Get test data
        y_true_test = test_df['btts'].values
        yes_odds_test = test_df['btts_yes_odds'].values if 'btts_yes_odds' in test_df.columns else np.full(len(test_df), np.nan)
        no_odds_test = test_df['btts_no_odds'].values if 'btts_no_odds' in test_df.columns else np.full(len(test_df), np.nan)
        
        # Skip if too few samples
        if len(test_df) < 30 or len(np.unique(y_true_test)) < 2:
            print(f"   ⚠️  Skipping fold {fold_idx} (insufficient data)")
            continue
        
        # Compute fair odds for both sides
        fair_yes_odds_full, fair_no_odds_full = compute_fair_two_way(yes_odds_test, no_odds_test)
        
        # Evaluate Phase 1 models
        for model_name in PHASE1_MODELS:
            try:
                # Get predictions
                y_proba_test = train_and_predict_phase1(model_name, train_df, test_df)
                
                # Run two-sided sweep
                sweep_two_sided = run_two_sided_threshold_sweep(
                    y_true=y_true_test,
                    y_proba=y_proba_test,
                    yes_odds=yes_odds_test,
                    no_odds=no_odds_test,
                    thresholds_yes=thresholds,
                    thresholds_no=thresholds,
                    stake=10.0,
                    fair_yes_odds=fair_yes_odds_full,
                    fair_no_odds=fair_no_odds_full,
                )
                
                # Add fold metadata
                sweep_two_sided['fold'] = fold_idx
                sweep_two_sided['phase'] = "Phase 1: Baseline"
                sweep_two_sided['model'] = model_name
                sweep_two_sided['train_start'] = fold_meta['train_start']
                sweep_two_sided['train_end'] = fold_meta['train_end']
                sweep_two_sided['test_start'] = fold_meta['test_start']
                sweep_two_sided['test_end'] = fold_meta['test_end']
                sweep_two_sided['train_n'] = fold_meta['train_matches']
                sweep_two_sided['test_n'] = fold_meta['test_matches']
                
                all_two_sided.append(sweep_two_sided)
                
                # Print summary
                for side in ['YES', 'NO']:
                    best_row = sweep_two_sided[sweep_two_sided['side'] == side].nlargest(1, 'roi_fair')
                    if len(best_row) > 0:
                        row = best_row.iloc[0]
                        print(f"      {model_name:15s} | {side:3s} @ {row['threshold']:.2f}: "
                              f"ROI={row['roi']:.2f}% ({row['n_bets']} bets)")
            
            except Exception as e:
                print(f"      ❌ Phase 1/{model_name} failed: {e}")
                continue
        
        # Evaluate Phase 2 models
        for model_name in PHASE2_MODELS:
            try:
                # Get predictions
                y_proba_test = train_and_predict_phase2(model_name, train_df, test_df)
                
                # Run two-sided sweep
                sweep_two_sided = run_two_sided_threshold_sweep(
                    y_true=y_true_test,
                    y_proba=y_proba_test,
                    yes_odds=yes_odds_test,
                    no_odds=no_odds_test,
                    thresholds_yes=thresholds,
                    thresholds_no=thresholds,
                    stake=10.0,
                    fair_yes_odds=fair_yes_odds_full,
                    fair_no_odds=fair_no_odds_full,
                )
                
                # Add fold metadata
                sweep_two_sided['fold'] = fold_idx
                sweep_two_sided['phase'] = "Phase 2: Modern ML"
                sweep_two_sided['model'] = model_name
                sweep_two_sided['train_start'] = fold_meta['train_start']
                sweep_two_sided['train_end'] = fold_meta['train_end']
                sweep_two_sided['test_start'] = fold_meta['test_start']
                sweep_two_sided['test_end'] = fold_meta['test_end']
                sweep_two_sided['train_n'] = fold_meta['train_matches']
                sweep_two_sided['test_n'] = fold_meta['test_matches']
                
                all_two_sided.append(sweep_two_sided)
                
                # Print summary
                for side in ['YES', 'NO']:
                    best_row = sweep_two_sided[sweep_two_sided['side'] == side].nlargest(1, 'roi_fair')
                    if len(best_row) > 0:
                        row = best_row.iloc[0]
                        print(f"      {model_name:15s} | {side:3s} @ {row['threshold']:.2f}: "
                              f"ROI={row['roi']:.2f}% ({row['n_bets']} bets)")
            
            except Exception as e:
                print(f"      ❌ Phase 2/{model_name} failed: {e}")
                continue
    
    # Save two-sided results
    if all_two_sided:
        two_sided_df = pd.concat(all_two_sided, ignore_index=True)
        results_dir = Path(__file__).parent.parent / 'results'
        results_dir.mkdir(exist_ok=True)
        two_sided_file = results_dir / 'walkforward_two_sided_roi.csv'
        two_sided_df.to_csv(two_sided_file, index=False)
        print(f"\n✅ Saved two-sided ROI to: {two_sided_file}")
        print(f"   Total rows: {len(two_sided_df)} (YES + NO sweeps for all folds/models)")
    else:
        print("\n⚠️  No two-sided results to save")
    
    print(f"{'='*80}\n")
    
    # Convert to DataFrames
    metrics_df = pd.DataFrame(all_metrics)
    roi_df = pd.DataFrame(all_roi)
    
    # Compute overall metrics (concatenate all test folds)
    print(f"\n{'='*80}")
    print("COMPUTING OVERALL METRICS (All Folds Combined)")
    print(f"{'='*80}")
    
    overall_metrics = []
    for phase in metrics_df['phase'].unique():
        for model in metrics_df[metrics_df['phase'] == phase]['model'].unique():
            fold_metrics = metrics_df[(metrics_df['phase'] == phase) & (metrics_df['model'] == model)]
            
            # Weighted average by n_samples
            weights = fold_metrics['n_samples'].values
            overall = {
                'fold': 'ALL',
                'phase': phase,
                'model': model,
                'auc': np.average(fold_metrics['auc'], weights=weights),
                'brier': np.average(fold_metrics['brier'], weights=weights),
                'logloss': np.average(fold_metrics['logloss'], weights=weights),
                'n_samples': weights.sum()
            }
            overall_metrics.append(overall)
            print(f"{phase} - {model}: AUC={overall['auc']:.4f}, Brier={overall['brier']:.4f}")
    
    # Append overall metrics
    metrics_df = pd.concat([metrics_df, pd.DataFrame(overall_metrics)], ignore_index=True)
    
    print(f"\n✅ Walk-forward backtest complete!")
    print(f"   Total folds: {n_splits}")
    print(f"   Total models: {len(PHASE1_MODELS) + len(PHASE2_MODELS) + len(PHASE3_MODELS)}")
    print(f"   Metrics rows: {len(metrics_df)}")
    print(f"   ROI rows: {len(roi_df)}")
    
    return metrics_df, roi_df


if __name__ == '__main__':
    import sys
    sys.path.append(str(Path(__file__).parent))
    
    from load_data import load_unified_data
    from build_features import build_all_features
    
    print("Testing walk-forward engine...")
    df = load_unified_data()
    df = build_all_features(df)
    
    # Test with 3 folds for speed
    metrics_df, roi_df = run_all_walkforward_experiments(df, n_splits=3)
    
    print("\n📊 Sample metrics:")
    print(metrics_df.head(10))
    
    print("\n💰 Sample ROI:")
    print(roi_df.head(10))
