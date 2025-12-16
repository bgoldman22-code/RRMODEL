#!/usr/bin/env python3
"""
Train Production Poisson BTTS Model

Trains a frozen Poisson BTTS model on all available historical EPL data
and saves it for production use.

Usage:
    python3 scripts/train_btts_poisson_production_model.py \\
        --output-model models/btts_poisson_production.joblib \\
        --output-meta models/btts_poisson_production_meta.json

Environment:
    PYTHONPATH must include src/ directory
"""

import sys
import argparse
import json
import joblib
from pathlib import Path
from datetime import datetime
import pandas as pd
import hashlib

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from load_data import load_unified_data
from build_features import build_all_features
from model_baselines import PoissonBTTSModel


def compute_code_hash() -> str:
    """
    Compute simple hash of key source files for versioning
    
    Returns:
        8-character hash string
    """
    try:
        src_dir = Path(__file__).parent.parent / 'src'
        files_to_hash = [
            src_dir / 'model_baselines.py',
            src_dir / 'production' / 'btts_poisson_strategy.py',
            Path(__file__)
        ]
        
        content = ""
        for fpath in files_to_hash:
            if fpath.exists():
                content += fpath.read_text()
        
        hash_obj = hashlib.md5(content.encode())
        return hash_obj.hexdigest()[:8]
    except Exception as e:
        print(f"⚠️  Could not compute code hash: {e}")
        return "unknown"


def train_production_model(
    output_model_path: str = "models/btts_poisson_production.joblib",
    output_meta_path: str = "models/btts_poisson_production_meta.json"
):
    """
    Train and save production Poisson BTTS model
    
    Args:
        output_model_path: Where to save the model
        output_meta_path: Where to save metadata
    """
    print("=" * 80)
    print("TRAINING PRODUCTION POISSON BTTS MODEL")
    print("=" * 80)
    
    # Load data
    print("\n📥 Loading unified data...")
    df = load_unified_data()
    print(f"✅ Loaded {len(df)} matches")
    
    # Build features
    print("\n📊 Building features...")
    df = build_all_features(df)
    print(f"✅ Features ready: {len(df)} matches")
    
    # Filter to historical data only (up to "today" or last date in dataset)
    df = df.sort_values('date').reset_index(drop=True)
    
    # Get training cutoff (use all data)
    train_df = df.copy()
    
    min_date = train_df['date'].min()
    max_date = train_df['date'].max()
    n_matches = len(train_df)
    
    print(f"\n📅 Training window:")
    print(f"   Start: {min_date}")
    print(f"   End: {max_date}")
    print(f"   Total matches: {n_matches}")
    
    # Check xG availability
    xg_coverage = train_df['home_xg'].notna().sum()
    xg_pct = xg_coverage / n_matches * 100
    print(f"   xG coverage: {xg_coverage}/{n_matches} ({xg_pct:.1f}%)")
    
    # Train model
    print("\n🔧 Training Poisson BTTS model...")
    model = PoissonBTTSModel()
    model.fit(train_df)
    
    # Test prediction on a sample
    print("\n🧪 Testing model predictions...")
    sample_df = train_df.head(5)
    sample_preds = model.predict_proba(sample_df)
    
    print("   Sample predictions:")
    for i, (idx, row) in enumerate(sample_df.iterrows()):
        print(f"   {row['home_norm']} vs {row['away_norm']}: "
              f"P(BTTS) = {sample_preds[i]:.3f} (actual: {row['btts']})")
    
    # Save model
    output_model = Path(output_model_path)
    output_model.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"\n💾 Saving model to {output_model}...")
    joblib.dump(model, output_model)
    print(f"✅ Model saved")
    
    # Create metadata
    code_hash = compute_code_hash()
    
    metadata = {
        "model_name": "poisson_btts",
        "model_version": "1.0.0",
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "training_window": {
            "start_date": str(min_date),
            "end_date": str(max_date),
            "n_matches": int(n_matches),
            "xg_coverage": int(xg_coverage),
            "xg_coverage_pct": float(xg_pct)
        },
        "model_params": {
            "home_lambda": float(model.home_lambda),
            "away_lambda": float(model.away_lambda),
            "using_xg": bool(model.using_xg)
        },
        "feature_list": [
            "home_xg",
            "away_xg"
        ],
        "code_hash": code_hash,
        "output_paths": {
            "model": str(output_model),
            "metadata": str(output_meta_path)
        }
    }
    
    # Save metadata
    output_meta = Path(output_meta_path)
    output_meta.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"\n💾 Saving metadata to {output_meta}...")
    with open(output_meta, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"✅ Metadata saved")
    
    # Summary
    print("\n" + "=" * 80)
    print("TRAINING COMPLETE")
    print("=" * 80)
    print(f"\n📦 Model artifacts:")
    print(f"   Model: {output_model}")
    print(f"   Metadata: {output_meta}")
    print(f"\n🎯 Model details:")
    print(f"   Type: Poisson BTTS")
    print(f"   Version: {metadata['model_version']}")
    print(f"   Training matches: {n_matches}")
    print(f"   Date range: {min_date} to {max_date}")
    print(f"   Home λ: {model.home_lambda:.3f}")
    print(f"   Away λ: {model.away_lambda:.3f}")
    print(f"   Using xG: {model.using_xg}")
    print(f"   Code hash: {code_hash}")
    
    print("\n✅ Production model ready for use!")
    print("\nNext steps:")
    print("  1. Generate predictions:")
    print("     THEODDSAPI_KEY=... python3 scripts/generate_epl_btts_production_predictions.py")
    print("  2. Deploy to Netlify")
    
    return model, metadata


def main():
    """CLI entrypoint"""
    parser = argparse.ArgumentParser(
        description="Train production Poisson BTTS model",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Train with default paths
  python3 scripts/train_btts_poisson_production_model.py
  
  # Train with custom paths
  python3 scripts/train_btts_poisson_production_model.py \\
      --output-model models/custom_model.joblib \\
      --output-meta models/custom_meta.json
        """
    )
    
    parser.add_argument(
        '--output-model',
        type=str,
        default='models/btts_poisson_production.joblib',
        help='Path to save model (default: models/btts_poisson_production.joblib)'
    )
    
    parser.add_argument(
        '--output-meta',
        type=str,
        default='models/btts_poisson_production_meta.json',
        help='Path to save metadata (default: models/btts_poisson_production_meta.json)'
    )
    
    args = parser.parse_args()
    
    try:
        train_production_model(
            output_model_path=args.output_model,
            output_meta_path=args.output_meta
        )
    except Exception as e:
        print(f"\n❌ Error training model: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
