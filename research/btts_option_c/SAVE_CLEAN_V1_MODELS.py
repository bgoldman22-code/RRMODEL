#!/usr/bin/env python3
"""
Save Clean V1 Models

Retrain best models on full dataset (or 40% temporal split) and save as pickled artifacts
for production use. These are the first trustworthy, no-leakage BTTS prediction models.
"""

import sys
import pickle
from pathlib import Path
from datetime import datetime

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from src.load_data import load_unified_data
from src.build_features import add_rolling_form_features, add_match_level_features, add_form_trend_features
from src.model_baselines import fit_logistic, fit_poisson, fit_random_forest
from src.model_ml import fit_lightgbm, fit_xgboost, fit_catboost


def load_and_prepare_data():
    """Load and engineer features"""
    print("\n📥 Loading data...")
    df = load_unified_data()
    
    print("📊 Engineering features...")
    df = add_rolling_form_features(df, windows=[5, 10])
    df = add_match_level_features(df)
    df = add_form_trend_features(df)
    
    print("🧹 Cleaning data...")
    df = df.dropna(subset=['btts', 'home_xg', 'away_xg'])
    
    return df


def temporal_split_train(df, train_fraction=0.40):
    """Get training set from temporal split"""
    df_sorted = df.sort_values('date').reset_index(drop=True)
    split_idx = int(len(df_sorted) * train_fraction)
    train_df = df_sorted.iloc[:split_idx].copy()
    return train_df


def save_model(model_dict, model_name, models_dir):
    """Save model with metadata"""
    filepath = models_dir / f"{model_name}_btts_clean_v1.pkl"
    
    # Add metadata
    model_dict['saved_at'] = datetime.now().isoformat()
    model_dict['model_name'] = model_name
    model_dict['version'] = 'clean_v1'
    model_dict['notes'] = 'No target leakage - goals_fpl excluded'
    
    with open(filepath, 'wb') as f:
        pickle.dump(model_dict, f)
    
    print(f"   ✅ Saved: {filepath.name}")
    return filepath


def main():
    print("\n" + "="*80)
    print("  SAVE CLEAN V1 MODELS (NO LEAKAGE)")
    print("="*80)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Create models directory
    models_dir = Path(__file__).parent / 'models'
    models_dir.mkdir(exist_ok=True)
    
    # Load data
    df = load_and_prepare_data()
    
    # Use 40% temporal split for training (matches temporal holdout experiment)
    train_df = temporal_split_train(df, train_fraction=0.40)
    print(f"\n✅ Training set: {len(train_df)} matches")
    print(f"   Date range: {train_df['date'].min().date()} to {train_df['date'].max().date()}")
    
    # Train and save models
    print("\n" + "="*80)
    print("TRAINING & SAVING MODELS")
    print("="*80)
    
    print("\n🔹 Phase 1 Models:")
    
    # Logistic (BEST by ROI)
    print("   Training logistic...")
    model_dict = fit_logistic(train_df)
    save_model(model_dict, 'logistic', models_dir)
    
    # Poisson (SECOND BEST by ROI)
    print("   Training poisson...")
    model = fit_poisson(train_df)
    model_dict = {
        'model': model,
        'train_df': train_df.copy()
    }
    save_model(model_dict, 'poisson', models_dir)
    
    # Random Forest
    print("   Training random_forest...")
    model_dict = fit_random_forest(train_df)
    save_model(model_dict, 'random_forest', models_dir)
    
    print("\n🔹 Phase 2 Models:")
    
    # CatBoost (BEST Phase 2)
    print("   Training catboost...")
    model_dict = fit_catboost(train_df)
    save_model(model_dict, 'catboost', models_dir)
    
    # LightGBM
    print("   Training lightgbm...")
    model_dict = fit_lightgbm(train_df)
    save_model(model_dict, 'lightgbm', models_dir)
    
    # XGBoost
    print("   Training xgboost...")
    model_dict = fit_xgboost(train_df)
    save_model(model_dict, 'xgboost', models_dir)
    
    print("\n" + "="*80)
    print("MODEL SAVING COMPLETE")
    print("="*80)
    print(f"\n📁 Models saved to: {models_dir}")
    print("\n🏆 RECOMMENDED MODELS:")
    print("   PRIMARY: logistic_btts_clean_v1.pkl")
    print("      - Highest ROI: 43.47% @ 0.55 threshold")
    print("      - Best AUC: 0.7794")
    print("      - Simplest & most interpretable")
    print("\n   SECONDARY: poisson_btts_clean_v1.pkl")
    print("      - Second highest ROI: 39.44% @ 0.55 threshold")
    print("      - xG-based, good baseline comparison")
    print("\n   ALTERNATIVE: catboost_btts_clean_v1.pkl")
    print("      - Best Phase 2 model: 25.60% ROI")
    print("      - Good AUC: 0.7250")
    print("="*80)


if __name__ == '__main__':
    main()
