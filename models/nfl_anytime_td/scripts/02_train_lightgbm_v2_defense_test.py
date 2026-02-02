#!/usr/bin/env python3
"""
NFL Anytime TD Model Training - V2 WITH OPPONENT DEFENSE FEATURES
==================================================================
This is a TEST version to compare accuracy WITH defense features
vs the baseline v1 (player-only features).

Baseline v1 AUC: 0.78
Target: See if defense features improve AUC
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, classification_report, confusion_matrix
import lightgbm as lgb
import joblib
import json
from pathlib import Path

print("=" * 70)
print("NFL ANYTIME TD MODEL V2 - WITH DEFENSE FEATURES (TEST)")
print("=" * 70)

# ----------------------------------------------------------------------------
# 1. Load data
# ----------------------------------------------------------------------------
data_path = Path(__file__).parent.parent / "data" / "player_td_core_v3_defense.csv"
print(f"\nLoading data from: {data_path}")

df = pd.read_csv(data_path)
print(f"Total records: {len(df):,}")
print(f"TD rate: {df['scored_td'].mean():.1%}")

# ----------------------------------------------------------------------------
# 2. Define features - V1 (baseline) vs V2 (with defense)
# ----------------------------------------------------------------------------

# V1 Features (baseline - player only)
features_v1 = [
    # Position dummies
    'feat_is_rb', 'feat_is_wr', 'feat_is_te', 'feat_is_qb',
    # Game context
    'feat_is_home',
    # Usage L5
    'feat_carries_L5', 'feat_targets_L5', 'feat_touches_L5',
    # Red zone L5
    'feat_rz_touches_L5', 'feat_rz_touches_i10_L5', 'feat_rz_opp_share_L5',
    # Performance
    'feat_exp_plays_L5', 'feat_snap_pct_L5',
    # TD history
    'feat_td_rate_L5', 'feat_td_rate_L10',
]

# V2 Features (with defense)
features_v2 = features_v1 + [
    # NEW: Opponent defense features
    'feat_opp_tds_allowed_L5',
    'feat_opp_tds_to_pos_L5',
    'feat_opp_rz_td_rate_L5',
]

# ----------------------------------------------------------------------------
# 3. Feature engineering
# ----------------------------------------------------------------------------
print("\nEngineering features...")

# Position dummies
df['feat_is_rb'] = (df['position'] == 'RB').astype(int)
df['feat_is_wr'] = (df['position'] == 'WR').astype(int)
df['feat_is_te'] = (df['position'] == 'TE').astype(int)
df['feat_is_qb'] = (df['position'] == 'QB').astype(int)

# Game context
df['feat_is_home'] = df['is_home'].astype(int)

# Usage features
df['feat_carries_L5'] = df['use_carries_L5'].fillna(0)
df['feat_targets_L5'] = df['use_targets_L5'].fillna(0)
df['feat_touches_L5'] = df['use_touches_L5'].fillna(0)

# Red zone features
df['feat_rz_touches_L5'] = df['rz_touches_L5'].fillna(0)
df['feat_rz_touches_i10_L5'] = df['rz_touches_inside10_L5'].fillna(0)
df['feat_rz_opp_share_L5'] = df['rz_opportunity_share_L5'].fillna(0)

# Performance features
df['feat_exp_plays_L5'] = df['use_explosive_plays_L5'].fillna(0)
df['feat_snap_pct_L5'] = df['snap_offense_pct_L5'].fillna(0.5)

# TD history
df['feat_td_rate_L5'] = df['ply_scored_td_L5'].fillna(0)
df['feat_td_rate_L10'] = df['ply_scored_td_L10'].fillna(0)

# NEW: Defense features
df['feat_opp_tds_allowed_L5'] = df['opp_tds_allowed_L5'].fillna(2.5)
df['feat_opp_tds_to_pos_L5'] = df['opp_tds_allowed_to_pos_L5'].fillna(0.6)
df['feat_opp_rz_td_rate_L5'] = df['opp_rz_td_rate_L5'].fillna(0.55)

# Target
y = df['scored_td']

print(f"Features V1 (baseline): {len(features_v1)}")
print(f"Features V2 (with defense): {len(features_v2)}")

# ----------------------------------------------------------------------------
# 4. Train/test split (time-based: train on 2022-2024, test on 2025)
# ----------------------------------------------------------------------------
print("\nSplitting data (time-based)...")

train_mask = df['season'] < 2025
test_mask = df['season'] == 2025

X_train_v1, X_test_v1 = df.loc[train_mask, features_v1], df.loc[test_mask, features_v1]
X_train_v2, X_test_v2 = df.loc[train_mask, features_v2], df.loc[test_mask, features_v2]
y_train, y_test = y[train_mask], y[test_mask]

print(f"Training set: {len(X_train_v1):,} records (2022-2024)")
print(f"Test set: {len(X_test_v1):,} records (2025)")
print(f"Train TD rate: {y_train.mean():.1%}")
print(f"Test TD rate: {y_test.mean():.1%}")

# ----------------------------------------------------------------------------
# 5. Train V1 model (baseline - no defense)
# ----------------------------------------------------------------------------
print("\n" + "=" * 70)
print("TRAINING V1 MODEL (BASELINE - NO DEFENSE)")
print("=" * 70)

model_v1 = lgb.LGBMClassifier(
    n_estimators=200,
    max_depth=6,
    learning_rate=0.05,
    num_leaves=31,
    min_child_samples=50,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42,
    verbose=-1
)

model_v1.fit(X_train_v1, y_train)

# Evaluate V1
y_pred_v1_train = model_v1.predict_proba(X_train_v1)[:, 1]
y_pred_v1_test = model_v1.predict_proba(X_test_v1)[:, 1]

auc_v1_train = roc_auc_score(y_train, y_pred_v1_train)
auc_v1_test = roc_auc_score(y_test, y_pred_v1_test)

print(f"\nV1 (NO DEFENSE) Results:")
print(f"  Training AUC: {auc_v1_train:.4f}")
print(f"  Test AUC:     {auc_v1_test:.4f}")

# ----------------------------------------------------------------------------
# 6. Train V2 model (with defense)
# ----------------------------------------------------------------------------
print("\n" + "=" * 70)
print("TRAINING V2 MODEL (WITH DEFENSE FEATURES)")
print("=" * 70)

model_v2 = lgb.LGBMClassifier(
    n_estimators=200,
    max_depth=6,
    learning_rate=0.05,
    num_leaves=31,
    min_child_samples=50,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42,
    verbose=-1
)

model_v2.fit(X_train_v2, y_train)

# Evaluate V2
y_pred_v2_train = model_v2.predict_proba(X_train_v2)[:, 1]
y_pred_v2_test = model_v2.predict_proba(X_test_v2)[:, 1]

auc_v2_train = roc_auc_score(y_train, y_pred_v2_train)
auc_v2_test = roc_auc_score(y_test, y_pred_v2_test)

print(f"\nV2 (WITH DEFENSE) Results:")
print(f"  Training AUC: {auc_v2_train:.4f}")
print(f"  Test AUC:     {auc_v2_test:.4f}")

# ----------------------------------------------------------------------------
# 7. Compare results
# ----------------------------------------------------------------------------
print("\n" + "=" * 70)
print("COMPARISON: V1 (NO DEFENSE) vs V2 (WITH DEFENSE)")
print("=" * 70)

auc_improvement = auc_v2_test - auc_v1_test
pct_improvement = (auc_improvement / auc_v1_test) * 100

print(f"\n{'Metric':<25} {'V1 (baseline)':<15} {'V2 (defense)':<15} {'Change':<15}")
print("-" * 70)
print(f"{'Training AUC':<25} {auc_v1_train:<15.4f} {auc_v2_train:<15.4f} {auc_v2_train - auc_v1_train:+.4f}")
print(f"{'Test AUC':<25} {auc_v1_test:<15.4f} {auc_v2_test:<15.4f} {auc_improvement:+.4f} ({pct_improvement:+.2f}%)")

# Feature importance for V2
print("\n" + "=" * 70)
print("V2 FEATURE IMPORTANCE (WITH DEFENSE)")
print("=" * 70)

importance = pd.DataFrame({
    'feature': features_v2,
    'importance': model_v2.feature_importances_
}).sort_values('importance', ascending=False)

print("\nTop 10 features:")
for i, row in importance.head(10).iterrows():
    # Mark defense features
    is_defense = "🛡️ " if "opp_" in row['feature'] else "   "
    print(f"{is_defense}{row['feature']:<30} {row['importance']:>6.0f}")

# Show where defense features rank
print("\nDefense features ranking:")
for feat in ['feat_opp_tds_allowed_L5', 'feat_opp_tds_to_pos_L5', 'feat_opp_rz_td_rate_L5']:
    rank = importance[importance['feature'] == feat].index[0] + 1
    imp = importance[importance['feature'] == feat]['importance'].values[0]
    print(f"  {feat}: Rank #{rank} (importance: {imp:.0f})")

# ----------------------------------------------------------------------------
# 8. Save V2 model (if it's better)
# ----------------------------------------------------------------------------
if auc_v2_test > auc_v1_test:
    print("\n" + "=" * 70)
    print("✅ V2 (WITH DEFENSE) IS BETTER - Saving model artifacts")
    print("=" * 70)
    
    output_dir = Path(__file__).parent.parent / "data" / "v2_defense_test"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Save model
    joblib.dump(model_v2, output_dir / "lightgbm_v2_defense.pkl")
    
    # Save feature list
    with open(output_dir / "feature_list_v2.json", "w") as f:
        json.dump({"features": features_v2}, f, indent=2)
    
    # Save comparison results
    results = {
        "v1_baseline": {
            "features": len(features_v1),
            "train_auc": round(auc_v1_train, 4),
            "test_auc": round(auc_v1_test, 4)
        },
        "v2_with_defense": {
            "features": len(features_v2),
            "train_auc": round(auc_v2_train, 4),
            "test_auc": round(auc_v2_test, 4)
        },
        "improvement": {
            "auc_gain": round(auc_improvement, 4),
            "pct_gain": round(pct_improvement, 2)
        },
        "defense_features": [
            "opp_tds_allowed_L5",
            "opp_tds_allowed_to_pos_L5",
            "opp_rz_td_rate_L5"
        ]
    }
    
    with open(output_dir / "comparison_results.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"Saved to: {output_dir}")
else:
    print("\n" + "=" * 70)
    print("❌ V2 (WITH DEFENSE) IS NOT BETTER - Not saving")
    print("=" * 70)

print("\n✅ Training comparison complete!")
