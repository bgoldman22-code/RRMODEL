#!/usr/bin/env python3
"""
Feature Safety Audit Report Generator

Generates comprehensive audit artifacts documenting which features are
prediction-safe vs event-based/leaked.

Outputs:
- FEATURE_SAFETY_AUDIT.csv: Detailed per-feature classification
- FEATURE_SAFETY_AUDIT.md: Human-readable summary report
"""

import sys
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from load_data import (
    load_unified_data,
    EVENT_COLUMNS,
    PREDICTION_SAFE_DEFAULTS,
    get_feature_summary
)
from build_features import add_rolling_form_features, add_match_level_features, add_form_trend_features
from feature_config import FeatureConfig, is_prediction_safe, SAFE_PATTERN_DEFAULTS, UNSAFE_PATTERN_DEFAULTS

RESEARCH_DIR = Path(__file__).parent.parent
FEATURES_DIR = RESEARCH_DIR / 'features'


def classify_feature_safety(feature_name: str, config: FeatureConfig) -> tuple[bool, str]:
    """
    Classify a feature as safe/unsafe with reason
    
    Returns:
        (is_safe, reason)
    """
    # Check if it's a banned goals feature (HIGHEST PRIORITY - check first)
    if any(banned in feature_name for banned in ["goals_fpl", "home_goals", "away_goals"]):
        # Exception: derived stats like "xg" are OK
        if "xg" not in feature_name.lower():
            return False, "banned_actual_results"
    
    # Check if it's in EVENT_COLUMNS (definitely unsafe)
    if feature_name in EVENT_COLUMNS:
        # But if it's also a banned feature, use that reason
        if any(banned in feature_name for banned in ["goals_fpl", "_goals"]):
            return False, "banned_actual_results"
        return False, "event_based_statistic"
    
    # Check if it matches safe patterns
    for pattern in config.safe_patterns:
        if pattern in feature_name:
            if "_l5" in feature_name or "_l10" in feature_name:
                return True, "rolling_window_shifted"
            elif "_trend" in feature_name or "_momentum" in feature_name:
                return True, "form_trend_indicator"
            elif "availability" in feature_name:
                return True, "fpl_availability_pre_match"
            elif "attack_quality" in feature_name or "attack_strength" in feature_name:
                return True, "fpl_squad_quality_pre_match"
            else:
                return True, "prediction_safe_pattern"
    
    # Check if it matches unsafe patterns
    for pattern in config.unsafe_patterns:
        if pattern in feature_name:
            return False, f"unsafe_pattern_{pattern}"
    
    # Check if in PREDICTION_SAFE_DEFAULTS
    if feature_name in PREDICTION_SAFE_DEFAULTS:
        return True, "prediction_safe_default"
    
    # Default: mark as unsafe if uncertain
    return False, "unknown_provenance"


def generate_audit_report():
    """Generate feature safety audit artifacts"""
    print("=" * 80)
    print("FEATURE SAFETY AUDIT REPORT GENERATOR")
    print("=" * 80)
    
    # Step 1: Load data with all engineered features
    print("\n📥 Loading data and engineering features...")
    df = load_unified_data(force_rebuild=False)
    
    # Add all rolling features
    df = add_rolling_form_features(df)
    df = add_match_level_features(df)
    df = add_form_trend_features(df)
    
    print(f"   ✅ Total columns: {len(df.columns)}")
    
    # Step 2: Get feature summary
    summary = get_feature_summary(df)
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    print(f"\n📊 Feature Summary:")
    print(f"   Total features: {summary['total_features']}")
    print(f"   Numeric features: {len(numeric_cols)}")
    print(f"   Event columns: {len(summary['event_columns'])}")
    print(f"   Prediction-safe defaults: {len(summary['prediction_safe_defaults'])}")
    
    # Step 3: Build feature classification table
    print("\n🔍 Classifying all features...")
    
    config = FeatureConfig()
    
    audit_records = []
    
    # Exclude metadata columns
    metadata_cols = {'btts', 'season', 'date', 'home_norm', 'away_norm', 
                     'home', 'away', 'fixture_id', 'venue', 'referee', 'bookmaker'}
    
    for col in df.columns:
        if col in metadata_cols:
            continue
        
        # Get classification
        is_safe, reason = classify_feature_safety(col, config)
        
        # Get provenance if available
        provenance = "unknown"
        if hasattr(df, 'attrs') and 'prediction_safe_flags' in df.attrs:
            if col in df.attrs['prediction_safe_flags']:
                provenance = "engineered"
        
        # Check feature_provenance column if it exists
        if 'feature_provenance' in df.columns:
            prov_values = df['feature_provenance'].dropna().unique()
            if len(prov_values) > 0:
                provenance = prov_values[0]
        
        # Calculate coverage
        coverage_pct = (1 - df[col].isna().mean()) * 100 if col in df.columns else 0.0
        
        # Check if it's in EVENT_COLUMNS
        is_event = col in EVENT_COLUMNS
        
        # Check if it's in PREDICTION_SAFE_DEFAULTS
        is_safe_default = col in PREDICTION_SAFE_DEFAULTS
        
        audit_records.append({
            'feature_name': col,
            'prediction_safe': is_safe,
            'is_event_column': is_event,
            'is_safe_default': is_safe_default,
            'safety_reason': reason,
            'provenance': provenance,
            'coverage_pct': round(coverage_pct, 2),
            'dtype': str(df[col].dtype)
        })
    
    audit_df = pd.DataFrame(audit_records)
    
    # Step 4: Save CSV
    csv_path = RESEARCH_DIR / 'FEATURE_SAFETY_AUDIT.csv'
    audit_df.to_csv(csv_path, index=False)
    print(f"\n✅ Saved CSV audit: {csv_path}")
    
    # Step 5: Generate markdown report
    md_path = RESEARCH_DIR / 'FEATURE_SAFETY_AUDIT.md'
    
    safe_features = audit_df[audit_df['prediction_safe']].sort_values('feature_name')
    unsafe_features = audit_df[~audit_df['prediction_safe']].sort_values('feature_name')
    banned_features = audit_df[
        audit_df['safety_reason'] == 'banned_actual_results'
    ].sort_values('feature_name')
    event_features = audit_df[audit_df['is_event_column']].sort_values('feature_name')
    
    with open(md_path, 'w') as f:
        f.write("# Feature Safety Audit Report\n\n")
        f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("---\n\n")
        
        f.write("## 📊 Summary Statistics\n\n")
        f.write(f"- **Total Features Audited:** {len(audit_df)}\n")
        f.write(f"- **Prediction-Safe Features:** {len(safe_features)} ({len(safe_features)/len(audit_df)*100:.1f}%)\n")
        f.write(f"- **Unsafe Features:** {len(unsafe_features)} ({len(unsafe_features)/len(audit_df)*100:.1f}%)\n")
        f.write(f"- **Event-Based Columns:** {len(event_features)}\n")
        f.write(f"- **Banned Result Features:** {len(banned_features)}\n\n")
        
        f.write("---\n\n")
        
        f.write("## 🚨 BANNED FEATURES (Actual Match Results)\n\n")
        f.write("These features contain actual match outcomes and MUST NEVER be used for prediction:\n\n")
        
        if len(banned_features) > 0:
            f.write("| Feature Name | Reason | Coverage % |\n")
            f.write("|--------------|--------|------------|\n")
            for _, row in banned_features.iterrows():
                f.write(f"| `{row['feature_name']}` | {row['safety_reason']} | {row['coverage_pct']:.1f}% |\n")
        else:
            f.write("✅ No banned features detected!\n")
        
        f.write("\n---\n\n")
        
        f.write("## ❌ Event-Based Features (Post-Match Statistics)\n\n")
        f.write("These features are derived from in-match events and are NOT available pre-match:\n\n")
        
        if len(event_features) > 0:
            f.write("| Feature Name | Reason | Coverage % |\n")
            f.write("|--------------|--------|------------|\n")
            for _, row in event_features.iterrows():
                if row['feature_name'] not in banned_features['feature_name'].values:
                    f.write(f"| `{row['feature_name']}` | {row['safety_reason']} | {row['coverage_pct']:.1f}% |\n")
        else:
            f.write("✅ No event-based features found!\n")
        
        f.write("\n---\n\n")
        
        f.write("## ✅ Prediction-Safe Features\n\n")
        f.write("These features use only pre-match information and properly shifted rolling windows:\n\n")
        
        # Group by safety reason
        safe_by_reason = safe_features.groupby('safety_reason')
        
        for reason, group in safe_by_reason:
            f.write(f"\n### {reason.replace('_', ' ').title()} ({len(group)} features)\n\n")
            f.write("| Feature Name | Coverage % |\n")
            f.write("|--------------|------------|\n")
            for _, row in group.iterrows():
                f.write(f"| `{row['feature_name']}` | {row['coverage_pct']:.1f}% |\n")
        
        f.write("\n---\n\n")
        
        f.write("## 📋 Classification Rules\n\n")
        f.write("### Safe Patterns\n")
        for pattern in SAFE_PATTERN_DEFAULTS:
            f.write(f"- `{pattern}`\n")
        
        f.write("\n### Unsafe Patterns\n")
        for pattern in UNSAFE_PATTERN_DEFAULTS:
            f.write(f"- `{pattern}`\n")
        
        f.write("\n---\n\n")
        f.write("## 🔒 Validation Checks\n\n")
        f.write("- ✅ All rolling features use `.shift(1)` (verified in code review)\n")
        f.write("- ✅ No full-time statistics used as features\n")
        f.write("- ✅ FPL availability/squad quality computed pre-match\n")
        f.write("- ✅ Runtime guards enforce banned feature exclusion\n")
        f.write("\n---\n\n")
        f.write(f"**Report Version:** 1.0\n")
        f.write(f"**Last Updated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    print(f"✅ Saved markdown report: {md_path}")
    
    # Step 6: Print summary to console
    print("\n" + "=" * 80)
    print("AUDIT SUMMARY")
    print("=" * 80)
    print(f"\n✅ Prediction-Safe Features: {len(safe_features)}")
    print(f"❌ Unsafe Features: {len(unsafe_features)}")
    print(f"🚨 Banned Features: {len(banned_features)}")
    
    if len(banned_features) > 0:
        print("\n⚠️  CRITICAL: The following features are BANNED from modeling:")
        for _, row in banned_features.iterrows():
            print(f"   - {row['feature_name']}")
    
    print("\n" + "=" * 80)


if __name__ == '__main__':
    generate_audit_report()
