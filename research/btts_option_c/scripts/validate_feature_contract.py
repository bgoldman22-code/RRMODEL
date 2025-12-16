#!/usr/bin/env python3
"""
Feature Contract / Drift Guard

Validates that the leak-free feature set matches the frozen Option A baseline.
Run this before any training or production inference to catch drift.

Checks:
1. btts_yes_odds NOT in feature list
2. btts_no_odds NOT in feature list
3. All feature columns are numeric
4. Feature count == expected baseline (148)

Usage:
    python3 scripts/validate_feature_contract.py

Author: Co-CTO
Date: December 16, 2025
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

import pandas as pd
import numpy as np

# Paths
RESEARCH_DIR = Path(__file__).parent.parent
DATA_DIR = RESEARCH_DIR / 'data'

# ============================================================================
# FROZEN BASELINE — DO NOT MODIFY
# ============================================================================
EXPECTED_FEATURE_COUNT = 148

# Canonical exclusion list (must match features_leakfree.py)
EXCLUDE_COLS = [
    'fixture_id', 'season', 'date', 'home', 'away', 'home_norm', 'away_norm',
    'venue', 'referee', 'bookmaker', 'btts',
    'home_goals', 'away_goals', 'home_xg', 'away_xg',
    'home_goals_fpl', 'away_goals_fpl',
    'btts_yes_odds', 'btts_no_odds',
]


def validate_feature_contract(verbose=True):
    """
    Validate feature contract against frozen baseline.
    
    Returns:
        bool: True if all checks pass, False otherwise
    """
    print("=" * 70)
    print("  FEATURE CONTRACT VALIDATION — OPTION A BASELINE")
    print("=" * 70)
    
    features_path = DATA_DIR / 'btts_leakfree_features.parquet'
    
    if not features_path.exists():
        print(f"FAIL: Features not found at: {features_path}")
        return False
    
    df = pd.read_parquet(features_path)
    print(f"\nLoaded {len(df)} matches from {features_path.name}")
    
    # Reconstruct feature list
    feature_cols = [c for c in df.columns if c not in EXCLUDE_COLS]
    
    all_passed = True
    
    # CHECK 1: btts_yes_odds not in features
    print("\n[CHECK 1] btts_yes_odds NOT in feature list...")
    if 'btts_yes_odds' in feature_cols:
        print("  FAIL: btts_yes_odds found in feature list!")
        all_passed = False
    else:
        print("  PASS")
    
    # CHECK 2: btts_no_odds not in features
    print("\n[CHECK 2] btts_no_odds NOT in feature list...")
    if 'btts_no_odds' in feature_cols:
        print("  FAIL: btts_no_odds found in feature list!")
        all_passed = False
    else:
        print("  PASS")
    
    # CHECK 3: All features are numeric
    print("\n[CHECK 3] All feature columns are numeric...")
    X = df[feature_cols]
    non_numeric = X.select_dtypes(exclude=[np.number]).columns.tolist()
    if non_numeric:
        print(f"  FAIL: Non-numeric columns found: {non_numeric}")
        all_passed = False
    else:
        print("  PASS")
    
    # CHECK 4: Feature count matches baseline
    print(f"\n[CHECK 4] Feature count == {EXPECTED_FEATURE_COUNT}...")
    if len(feature_cols) != EXPECTED_FEATURE_COUNT:
        print(f"  FAIL: Expected {EXPECTED_FEATURE_COUNT}, got {len(feature_cols)}")
        if verbose:
            print(f"  Current features: {sorted(feature_cols)[:10]}... (showing first 10)")
        all_passed = False
    else:
        print(f"  PASS: {len(feature_cols)} features")
    
    # Summary
    print("\n" + "=" * 70)
    if all_passed:
        print("  ALL CHECKS PASSED — Feature contract validated")
        print("=" * 70)
        return True
    else:
        print("  FAILED — Feature contract violated!")
        print("  DO NOT proceed with training or production.")
        print("=" * 70)
        return False


if __name__ == '__main__':
    success = validate_feature_contract(verbose=True)
    sys.exit(0 if success else 1)
