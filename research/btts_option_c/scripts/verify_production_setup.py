#!/usr/bin/env python3
"""
EPL BTTS Production System - Setup Verification

Checks that all required files and dependencies are in place.

Usage:
    python3 scripts/verify_production_setup.py
"""

import sys
from pathlib import Path
import importlib

def check_file(path_str, description):
    """Check if file exists"""
    path = Path(path_str)
    if path.exists():
        print(f"✅ {description}: {path}")
        return True
    else:
        print(f"❌ {description}: {path} (NOT FOUND)")
        return False

def check_module(module_name):
    """Check if Python module can be imported"""
    try:
        importlib.import_module(module_name)
        print(f"✅ Python module: {module_name}")
        return True
    except ImportError as e:
        print(f"❌ Python module: {module_name} (IMPORT ERROR: {e})")
        return False

def main():
    print("=" * 80)
    print("EPL BTTS PRODUCTION SYSTEM - SETUP VERIFICATION")
    print("=" * 80)
    
    checks = []
    
    # Check source files
    print("\n📁 Checking source files...")
    checks.append(check_file(
        "src/production/__init__.py",
        "Production module init"
    ))
    checks.append(check_file(
        "src/production/btts_poisson_strategy.py",
        "Production strategy module"
    ))
    checks.append(check_file(
        "src/model_baselines.py",
        "Baseline models"
    ))
    checks.append(check_file(
        "src/load_data.py",
        "Data loading"
    ))
    checks.append(check_file(
        "src/build_features.py",
        "Feature engineering"
    ))
    
    # Check scripts
    print("\n📜 Checking scripts...")
    checks.append(check_file(
        "scripts/train_btts_poisson_production_model.py",
        "Training script"
    ))
    checks.append(check_file(
        "scripts/generate_epl_btts_production_predictions.py",
        "Prediction generation script"
    ))
    
    # Check Netlify function
    print("\n🌐 Checking Netlify function...")
    checks.append(check_file(
        "../../netlify/functions/epl-btts-poisson.mjs",
        "Netlify function"
    ))
    
    # Check model artifacts (may not exist yet)
    print("\n🤖 Checking model artifacts...")
    model_exists = check_file(
        "models/btts_poisson_production.joblib",
        "Production model"
    )
    meta_exists = check_file(
        "models/btts_poisson_production_meta.json",
        "Model metadata"
    )
    
    if not model_exists:
        print("   ℹ️  Run training script to create model:")
        print("      PYTHONPATH=src:$PYTHONPATH python3 scripts/train_btts_poisson_production_model.py")
    
    # Check Python dependencies
    print("\n🐍 Checking Python dependencies...")
    checks.append(check_module("pandas"))
    checks.append(check_module("numpy"))
    checks.append(check_module("joblib"))
    checks.append(check_module("requests"))
    checks.append(check_module("sklearn"))
    
    # Summary
    print("\n" + "=" * 80)
    print("VERIFICATION SUMMARY")
    print("=" * 80)
    
    passed = sum(checks)
    total = len(checks)
    
    print(f"\nCore files: {passed}/{total} passed")
    
    if model_exists and meta_exists:
        print("Model artifacts: ✅ Ready")
    else:
        print("Model artifacts: ⚠️  Need training")
    
    if passed == total and model_exists:
        print("\n✅ System is FULLY OPERATIONAL!")
        print("\nNext step: Generate predictions")
        print("  THEODDSAPI_KEY=xxx PYTHONPATH=src:$PYTHONPATH \\")
        print("  python3 scripts/generate_epl_btts_production_predictions.py")
    elif passed == total:
        print("\n⚠️  System core is ready, but model needs training")
        print("\nNext step: Train model")
        print("  PYTHONPATH=src:$PYTHONPATH \\")
        print("  python3 scripts/train_btts_poisson_production_model.py")
    else:
        print("\n❌ System has missing components")
        print("\nPlease fix the issues above before proceeding.")
        sys.exit(1)

if __name__ == '__main__':
    main()
