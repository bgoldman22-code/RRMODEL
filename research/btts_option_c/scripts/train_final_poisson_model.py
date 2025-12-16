#!/usr/bin/env python3
"""
Train Final Production Poisson BTTS Model - Hardened V2

Trains a production-ready Poisson BTTS model using 100% of cleaned historical data
with all Hardened V2 safety guarantees:
- 25-feature prediction-safe allowlist
- Runtime banned feature assertions
- Vig-aware methodology
- No target leakage

Usage:
    cd research/btts_option_c
    python scripts/train_final_poisson_model.py
"""

import sys
import json
import pickle
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

import pandas as pd
import numpy as np

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from load_data import load_unified_data
from build_features import (
    add_rolling_form_features,
    add_match_level_features,
    add_form_trend_features
)
from model_baselines import PoissonBTTSModel, LogisticBTTSModel, prepare_features

# Paths
RESEARCH_DIR = Path(__file__).parent.parent
MODELS_DIR = RESEARCH_DIR / 'models'
MODELS_DIR.mkdir(exist_ok=True)


def train_production_model() -> Dict[str, Any]:
    """
    Train final production Poisson BTTS model on all available data.
    
    Returns:
        Dictionary with training metadata
    """
    print("=" * 80)
    print("TRAINING FINAL PRODUCTION POISSON BTTS MODEL - HARDENED V2")
    print("=" * 80)
    print()
    
    # Step 1: Load data
    print("📥 STEP 1: Loading unified historical data...")
    df = load_unified_data(force_rebuild=False)
    print(f"   ✅ Loaded {len(df)} matches with {len(df.columns)} base features")
    print(f"   📅 Date range: {df['date'].min()} to {df['date'].max()}")
    print()
    
    # Step 2: Engineer features
    print("🔧 STEP 2: Engineering features (rolling, match-level, trends)...")
    df = add_rolling_form_features(df)
    df = add_match_level_features(df)
    df = add_form_trend_features(df)
    print(f"   ✅ Total features after engineering: {len(df.columns)}")
    print()
    
    # Step 3: Prepare features with safety checks
    print("🔒 STEP 3: Preparing prediction-safe features...")
    print("   (Runtime safety assertions will be triggered if banned features detected)")
    X, y, feature_names = prepare_features(df, test_df=None)
    print(f"   ✅ Feature matrix: {X.shape[0]} matches × {X.shape[1]} features")
    print(f"   ✅ BTTS rate: {y.mean():.2%}")
    print(f"   ✅ Prediction-safe allowlist enforced: {len(feature_names)} features")
    print()
    
    # Print feature list
    print("📋 Final feature list:")
    for i, feat in enumerate(feature_names, 1):
        print(f"   {i:2d}. {feat}")
    print()
    
    # Step 4: Train Poisson model
    print("🚀 STEP 4: Training Poisson BTTS model...")
    poisson_model = PoissonBTTSModel()
    poisson_model.fit(df)
    print(f"   ✅ Poisson model fitted")
    print(f"      Home λ (avg xG): {poisson_model.home_lambda:.3f}")
    print(f"      Away λ (avg xG): {poisson_model.away_lambda:.3f}")
    print()
    
    # Step 5: Train Logistic model (optional backup)
    print("🚀 STEP 5: Training Logistic BTTS model (backup)...")
    logistic_model = LogisticBTTSModel()
    logistic_model.fit(X, y, feature_names=feature_names)
    print(f"   ✅ Logistic model fitted")
    print()
    
    # Step 6: Save models
    print("💾 STEP 6: Saving production models...")
    
    # Poisson model
    poisson_path = MODELS_DIR / 'poisson_btts_hardened_v2_prod.pkl'
    with open(poisson_path, 'wb') as f:
        pickle.dump(poisson_model, f)
    print(f"   ✅ Saved: {poisson_path}")
    
    # Logistic model
    logistic_path = MODELS_DIR / 'logistic_btts_hardened_v2_prod.pkl'
    with open(logistic_path, 'wb') as f:
        pickle.dump(logistic_model, f)
    print(f"   ✅ Saved: {logistic_path}")
    
    # Metadata
    metadata = {
        'version': 'Hardened_V2',
        'model_type': 'Poisson_BTTS',
        'trained_on_n_matches': int(len(df)),
        'date_range': {
            'min_date': str(df['date'].min()),
            'max_date': str(df['date'].max())
        },
        'btts_rate': float(y.mean()),
        'feature_list': feature_names,
        'n_features': len(feature_names),
        'poisson_params': {
            'home_lambda': float(poisson_model.home_lambda),
            'away_lambda': float(poisson_model.away_lambda)
        },
        'safety_guarantees': [
            'No banned features (home_goals, away_goals, *_goals_fpl)',
            '25-feature prediction-safe allowlist enforced',
            'Runtime assertions active',
            'All rolling features use shift(1)',
            'No target leakage'
        ],
        'generated_at': datetime.now().isoformat()
    }
    
    metadata_path = MODELS_DIR / 'poisson_btts_hardened_v2_prod_metadata.json'
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"   ✅ Saved: {metadata_path}")
    print()
    
    # Step 7: Summary
    print("=" * 80)
    print("✅ PRODUCTION MODEL TRAINING COMPLETE")
    print("=" * 80)
    print()
    print("📊 Summary:")
    print(f"   Matches trained: {metadata['trained_on_n_matches']}")
    print(f"   Date range: {metadata['date_range']['min_date']} to {metadata['date_range']['max_date']}")
    print(f"   Features used: {metadata['n_features']} (prediction-safe allowlist)")
    print(f"   BTTS rate: {metadata['btts_rate']:.2%}")
    print(f"   Poisson λ_home: {metadata['poisson_params']['home_lambda']:.3f}")
    print(f"   Poisson λ_away: {metadata['poisson_params']['away_lambda']:.3f}")
    print()
    print("📁 Model files saved to:")
    print(f"   {poisson_path}")
    print(f"   {logistic_path}")
    print(f"   {metadata_path}")
    print()
    print("🎯 Next step: Use RUN_PREDICT_LIVE.py to generate predictions for upcoming matches")
    print("=" * 80)
    
    return metadata


if __name__ == '__main__':
    try:
        metadata = train_production_model()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
