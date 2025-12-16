#!/usr/bin/env python3
"""
BTTS NORTHERN STAR INDICATOR DISCOVERY + 3-PHASE MODEL TOURNAMENT

⚠️  RESEARCH PIPELINE - PHASE 1 & 2 ONLY ⚠️

This script runs Phase 1–2 BTTS research (feature discovery + direct ML models).
It does NOT yet integrate the existing Profile C Dixon–Coles model.

What IS implemented:
✅ Phase 1: Logistic (calibrated), Poisson (xG-based), Random Forest
✅ Phase 2: LightGBM, XGBoost, CatBoost (with Optuna + TimeSeriesSplit CV)
✅ Feature importance: MI, RF, SHAP
✅ L5/L10 rolling features
✅ Time-aware cross-validation (no data leakage)
✅ Calibration evaluation

What is NOT implemented:
❌ Phase 3: Hybrid models (Dixon-Coles + ML residuals, blended, stacked)
❌ Betting/ROI simulation execution (framework exists, not integrated)
❌ Walk-forward validation
❌ Integration with Profile C baseline

Master experiment runner that executes:
1. Load & merge data from all sources (904-match EPL universe)
2. Engineer L5/L10 rolling features
3. Discover feature importance (MI, RF, SHAP)
4. Train Phase 1 baselines (Logistic, Poisson, RF)
5. Train Phase 2 modern ML (LightGBM, XGBoost, CatBoost)
6. Generate master leaderboard with calibration metrics

All outputs saved to /research/btts_option_c/results/
"""

import sys
from pathlib import Path
import pandas as pd
import numpy as np
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# Add src to path
sys.path.append(str(Path(__file__).parent / 'src'))

from load_data import load_unified_data, get_feature_summary
from build_features import build_all_features
from feature_importance import run_feature_importance_analysis

RESEARCH_DIR = Path(__file__).parent
RESULTS_DIR = RESEARCH_DIR / 'results'


def print_section(title):
    """Print formatted section header"""
    print("\n" + "=" * 80)
    print(f"{title:^80}")
    print("=" * 80 + "\n")


def run_complete_pipeline():
    """
    Execute complete BTTS research pipeline
    """
    start_time = datetime.now()
    
    print_section("🌟 BTTS NORTHERN STAR INDICATOR DISCOVERY 🌟")
    print(f"Started: {start_time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    # STEP 1: Load Data
    print_section("STEP 1: DATA LOADING & MERGING")
    df = load_unified_data(force_rebuild=False)
    
    summary = get_feature_summary(df)
    print(f"\n📊 Dataset Summary:")
    print(f"   Total matches: {summary['total_matches']}")
    print(f"   BTTS rate: {summary['btts_rate']:.1%}")
    print(f"   Date range: {summary['date_range'][0]} to {summary['date_range'][1]}")
    print(f"   Base features: {summary['total_features']}")
    
    # STEP 2: Feature Engineering
    print_section("STEP 2: FEATURE ENGINEERING (L5/L10 ROLLING)")
    df_features = build_all_features(df)
    
    print(f"\n✅ Feature engineering complete!")
    print(f"   Total features: {len(df_features.columns)}")
    print(f"   Rolling features: {len([c for c in df_features.columns if '_L5' in c or '_L10' in c])}")
    print(f"   Engineered features: {len([c for c in df_features.columns if 'trend' in c or 'dominance' in c])}")
    
    # STEP 3: Feature Importance Discovery
    print_section("STEP 3: FEATURE IMPORTANCE DISCOVERY")
    print("Running 3 independent methods: MI, RF, SHAP...\n")
    
    try:
        rankings_df, lgbm_model, shap_values = run_feature_importance_analysis(df_features)
        
        print(f"\n✅ Feature importance analysis complete!")
        print(f"   Rankings saved to: {RESULTS_DIR / 'feature_ranking.csv'}")
        print(f"   SHAP plots saved to: {RESULTS_DIR / 'shap/'}")
        
        print(f"\n🏆 TOP 10 BTTS INDICATORS:")
        for idx, row in rankings_df.head(10).iterrows():
            print(f"   {row['composite_rank']:.0f}. {row['feature']}")
    
    except Exception as e:
        print(f"⚠️  Feature importance failed: {e}")
        print("   Continuing with model training...")
        rankings_df = None
    
    # STEP 4: Phase 1 - Baseline Models
    print_section("STEP 4: PHASE 1 - BASELINE MODELS")
    
    try:
        from model_baselines import train_baseline_models
        phase1_results = train_baseline_models(df_features)
        
        print(f"\n✅ Phase 1 complete!")
        print(f"   Models trained: Logistic, Poisson, Random Forest")
        
    except Exception as e:
        print(f"⚠️  Phase 1 failed: {e}")
        phase1_results = {}
    
    # STEP 5: Phase 2 - Modern ML
    print_section("STEP 5: PHASE 2 - MODERN ML (with Optuna)")
    print("This will take 10-20 minutes for hyperparameter optimization...\n")
    
    try:
        from model_ml import train_modern_ml_models
        phase2_results = train_modern_ml_models(df_features, n_trials=30)
        
        print(f"\n✅ Phase 2 complete!")
        print(f"   Models trained: LightGBM, XGBoost, CatBoost")
        
    except Exception as e:
        print(f"⚠️  Phase 2 failed: {e}")
        phase2_results = {}
    
    # STEP 6: Calibration Evaluation
    print_section("STEP 6: CALIBRATION EVALUATION")
    
    print("\n📊 Generating calibration curves...\n")
    
    try:
        from evaluate import plot_calibration_curve, plot_roc_curve
        
        # Create calibration directory if needed
        CALIBRATION_DIR = RESULTS_DIR / 'calibration_plots'
        CALIBRATION_DIR.mkdir(parents=True, exist_ok=True)
        
        y_true = df_features['btts'].values
        
        # Plot for Phase 1 models
        for model_name, metrics in phase1_results.items():
            if 'predictions' in metrics:
                y_pred = metrics['predictions']
                plot_calibration_curve(y_true, y_pred, model_name)
                plot_roc_curve(y_true, y_pred, model_name)
                print(f"   ✅ {model_name}: Calibration & ROC curves saved")
        
        # Plot for Phase 2 models
        for model_name, metrics in phase2_results.items():
            if 'predictions' in metrics:
                y_pred = metrics['predictions']
                plot_calibration_curve(y_true, y_pred, model_name)
                plot_roc_curve(y_true, y_pred, model_name)
                print(f"   ✅ {model_name}: Calibration & ROC curves saved")
        
        print(f"\n✅ Calibration plots saved to: {CALIBRATION_DIR}")
    
    except Exception as e:
        print(f"⚠️  Calibration plotting failed: {e}")
        print("   Continuing with leaderboard...")
    
    # STEP 7: Generate Master Leaderboard
    print_section("STEP 7: MASTER LEADERBOARD")
    
    leaderboard = []
    
    # Add Phase 1 results
    for model_name, metrics in phase1_results.items():
        leaderboard.append({
            'phase': 'Phase 1: Baseline',
            'model': model_name,
            'auc': metrics.get('auc', 0),
            'brier': metrics.get('brier', 0),
            'logloss': metrics.get('logloss', 0),
            'cv_strategy': metrics.get('cv_strategy', 'N/A')
        })
    
    # Add Phase 2 results
    for model_name, metrics in phase2_results.items():
        leaderboard.append({
            'phase': 'Phase 2: Modern ML',
            'model': model_name,
            'auc': metrics.get('auc', 0),
            'brier': metrics.get('brier', 0),
            'logloss': metrics.get('logloss', 0),
            'cv_strategy': metrics.get('cv_strategy', 'N/A')
        })
    
    # Create leaderboard dataframe
    leaderboard_df = pd.DataFrame(leaderboard)
    leaderboard_df = leaderboard_df.sort_values('auc', ascending=False)
    
    # Save leaderboard
    leaderboard_file = RESULTS_DIR / 'model_leaderboard.csv'
    leaderboard_df.to_csv(leaderboard_file, index=False)
    
    # Print leaderboard
    print("\n🏆 FINAL MODEL LEADERBOARD (by AUC):\n")
    print(f"{'Rank':<6} {'Phase':<20} {'Model':<20} {'AUC':<10} {'Brier':<10} {'LogLoss':<10} {'CV Strategy':<30}")
    print("-" * 110)
    
    for idx, row in leaderboard_df.iterrows():
        rank = idx + 1
        print(f"{rank:<6} {row['phase']:<20} {row['model']:<20} "
              f"{row['auc']:<10.4f} {row['brier']:<10.4f} {row['logloss']:<10.4f} {row['cv_strategy']:<30}")
    
    print(f"\n💾 Leaderboard saved to: {leaderboard_file}")
    print(f"📊 CV Strategy: TimeSeriesSplit (trains on past, predicts future - NO DATA LEAKAGE)")
    
    # STEP 7: Summary Report
    print_section("EXPERIMENT SUMMARY")
    
    end_time = datetime.now()
    duration = end_time - start_time
    
    print(f"Started:  {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Finished: {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Duration: {duration}")
    
    print(f"\n📊 Data:")
    print(f"   Matches analyzed: {len(df_features)}")
    print(f"   Features engineered: {len(df_features.columns)}")
    print(f"   BTTS rate: {df_features['btts'].mean():.1%}")
    
    if rankings_df is not None:
        print(f"\n🏆 Top 5 BTTS Indicators:")
        for idx, row in rankings_df.head(5).iterrows():
            print(f"   {row['composite_rank']:.0f}. {row['feature']}")
    
    print(f"\n🤖 Models Trained:")
    print(f"   Phase 1 Baselines: {len(phase1_results)}")
    print(f"   Phase 2 Modern ML: {len(phase2_results)}")
    print(f"   Total: {len(leaderboard_df)}")
    
    if len(leaderboard_df) > 0:
        best_model = leaderboard_df.iloc[0]
        print(f"\n🥇 Best Model:")
        print(f"   {best_model['model']} ({best_model['phase']})")
        print(f"   AUC: {best_model['auc']:.4f}")
        print(f"   Brier: {best_model['brier']:.4f}")
    
    print(f"\n📁 Outputs saved to:")
    print(f"   {RESULTS_DIR}")
    
    print_section("✅ EXPERIMENT COMPLETE! ✅")
    
    return {
        'df': df_features,
        'rankings': rankings_df,
        'phase1': phase1_results,
        'phase2': phase2_results,
        'leaderboard': leaderboard_df
    }


if __name__ == '__main__':
    print("""
    ╔════════════════════════════════════════════════════════════════════════════╗
    ║                                                                            ║
    ║   🌟 BTTS NORTHERN STAR INDICATOR DISCOVERY + MODEL TOURNAMENT 🌟         ║
    ║                                                                            ║
    ║   Comprehensive research pipeline to identify the strongest BTTS          ║
    ║   predictors and train state-of-the-art models.                           ║
    ║                                                                            ║
    ║   Pipeline:                                                                ║
    ║   1. Load & merge EPL data (API-Football + FPL + Baseline)                ║
    ║   2. Engineer L5/L10 rolling features                                     ║
    ║   3. Discover feature importance (MI + RF + SHAP)                         ║
    ║   4. Train Phase 1 baselines (Logistic, Poisson, RF)                      ║
    ║   5. Train Phase 2 modern ML (LightGBM, XGBoost, CatBoost)                ║
    ║   6. Generate master leaderboard                                           ║
    ║                                                                            ║
    ║   Expected duration: 20-30 minutes                                         ║
    ║                                                                            ║
    ╚════════════════════════════════════════════════════════════════════════════╝
    """)
    
    # Check if data fetchers have been run
    data_dir = Path(__file__).parent.parent.parent / 'scripts' / 'data' / 'premier_league'
    api_file = data_dir / 'api_football_statistics.csv'
    fpl_file = data_dir / 'fpl_player_context.csv'
    
    if not api_file.exists() or not fpl_file.exists():
        print("⚠️  WARNING: External data not found!")
        print(f"   Expected files:")
        print(f"   - {api_file}")
        print(f"   - {fpl_file}")
        print()
        print("   Please run the data fetchers first:")
        print("   1. python3 scripts/soccer/fetchers/fetch_api_football.py")
        print("   2. python3 scripts/soccer/fetchers/fetch_fpl_data.py")
        print()
        response = input("Continue anyway? (y/n): ")
        if response.lower() != 'y':
            print("Exiting...")
            sys.exit(0)
    
    try:
        results = run_complete_pipeline()
        
        print("\n" + "=" * 80)
        print("🎉 All results saved to: research/btts_option_c/results/")
        print("=" * 80)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Experiment interrupted by user.")
        print("Partial results may be saved in: research/btts_option_c/results/")
        
    except Exception as e:
        print(f"\n\n❌ Experiment failed with error: {e}")
        import traceback
        traceback.print_exc()
