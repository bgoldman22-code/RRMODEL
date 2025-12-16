#!/usr/bin/env python3
"""
Feature Importance Discovery Module

Uses three independent methods to rank BTTS indicators:
1. Mutual Information (MI)
2. Random Forest feature importance
3. LightGBM + SHAP values

Outputs comprehensive feature rankings and visualizations.
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from sklearn.feature_selection import mutual_info_classif
from sklearn.ensemble import RandomForestClassifier
import lightgbm as lgb
import shap

RESEARCH_DIR = Path(__file__).parent.parent
RESULTS_DIR = RESEARCH_DIR / 'results'
SHAP_DIR = RESULTS_DIR / 'shap'


def prepare_feature_matrix(df):
    """
    Prepare feature matrix for importance analysis
    
    Returns:
        X, y, feature_names
    """
    # Identify target
    y = df['btts'].values
    
    # Exclude non-feature columns
    exclude_cols = [
        'btts', 'season', 'date', 'home_norm', 'away_norm',
        'home_goals', 'away_goals', 'fixture_id',
        'home', 'away', 'venue', 'referee', 'bookmaker'  # Added bookmaker (string)
    ]
    
    feature_cols = [c for c in df.columns if c not in exclude_cols]
    
    # Select only numeric columns
    X = df[feature_cols].select_dtypes(include=[np.number])
    
    # Handle missing values
    X = X.fillna(X.median())
    
    # Drop columns with all NaN or zero variance
    valid_cols = []
    for col in X.columns:
        if X[col].std() > 0 and X[col].notna().sum() > len(X) * 0.1:
            valid_cols.append(col)
    
    X = X[valid_cols]
    
    print(f"📊 Feature matrix: {X.shape[0]} samples × {X.shape[1]} features")
    print(f"   Target distribution: BTTS={y.mean():.1%}")
    
    return X.values, y, X.columns.tolist()


def compute_mutual_information(X, y, feature_names):
    """
    Compute mutual information scores
    
    Returns:
        DataFrame with MI scores
    """
    print("\n🔍 Computing Mutual Information...")
    
    mi_scores = mutual_info_classif(X, y, random_state=42, n_neighbors=5)
    
    mi_df = pd.DataFrame({
        'feature': feature_names,
        'mi_score': mi_scores
    }).sort_values('mi_score', ascending=False)
    
    print(f"   ✅ Top 10 features by MI:")
    for idx, row in mi_df.head(10).iterrows():
        print(f"      {row['feature']}: {row['mi_score']:.4f}")
    
    return mi_df


def compute_rf_importance(X, y, feature_names):
    """
    Compute Random Forest feature importance (Gini-based)
    
    Returns:
        DataFrame with RF importance scores
    """
    print("\n🌲 Computing Random Forest Importance...")
    
    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=10,
        min_samples_leaf=20,
        random_state=42,
        n_jobs=-1
    )
    
    rf.fit(X, y)
    
    rf_df = pd.DataFrame({
        'feature': feature_names,
        'rf_importance': rf.feature_importances_
    }).sort_values('rf_importance', ascending=False)
    
    print(f"   ✅ Top 10 features by RF:")
    for idx, row in rf_df.head(10).iterrows():
        print(f"      {row['feature']}: {row['rf_importance']:.4f}")
    
    return rf_df


def compute_lgbm_shap_importance(X, y, feature_names):
    """
    Compute LightGBM importance + SHAP values
    
    Returns:
        DataFrame with LGBM and SHAP scores
    """
    print("\n⚡ Computing LightGBM + SHAP Importance...")
    
    # Train LightGBM
    train_data = lgb.Dataset(X, label=y)
    
    params = {
        'objective': 'binary',
        'metric': 'auc',
        'boosting_type': 'gbdt',
        'num_leaves': 31,
        'learning_rate': 0.05,
        'feature_fraction': 0.8,
        'bagging_fraction': 0.8,
        'bagging_freq': 5,
        'verbose': -1,
        'seed': 42
    }
    
    model = lgb.train(
        params,
        train_data,
        num_boost_round=200,
        valid_sets=[train_data],
        callbacks=[lgb.early_stopping(stopping_rounds=20, verbose=False)]
    )
    
    # LightGBM built-in importance
    lgbm_importance = model.feature_importance(importance_type='gain')
    
    # SHAP values
    print("   Computing SHAP values (this may take a minute)...")
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X)
    
    # Mean absolute SHAP value for each feature
    if isinstance(shap_values, list):
        shap_values = shap_values[1]  # For binary classification
    
    shap_importance = np.abs(shap_values).mean(axis=0)
    
    lgbm_df = pd.DataFrame({
        'feature': feature_names,
        'lgbm_gain': lgbm_importance,
        'shap_importance': shap_importance
    }).sort_values('shap_importance', ascending=False)
    
    print(f"   ✅ Top 10 features by SHAP:")
    for idx, row in lgbm_df.head(10).iterrows():
        print(f"      {row['feature']}: {row['shap_importance']:.4f}")
    
    # Save SHAP visualizations
    save_shap_plots(shap_values, X, feature_names)
    
    return lgbm_df, model, shap_values


def save_shap_plots(shap_values, X, feature_names):
    """
    Generate and save SHAP visualization plots
    """
    print("   Generating SHAP visualizations...")
    
    # Summary plot (bar)
    plt.figure(figsize=(10, 8))
    shap.summary_plot(shap_values, X, feature_names=feature_names, 
                      plot_type='bar', show=False, max_display=20)
    plt.tight_layout()
    plt.savefig(SHAP_DIR / 'shap_summary_bar.png', dpi=150, bbox_inches='tight')
    plt.close()
    
    # Summary plot (beeswarm)
    plt.figure(figsize=(10, 8))
    shap.summary_plot(shap_values, X, feature_names=feature_names, 
                      show=False, max_display=20)
    plt.tight_layout()
    plt.savefig(SHAP_DIR / 'shap_summary_beeswarm.png', dpi=150, bbox_inches='tight')
    plt.close()
    
    print(f"   ✅ SHAP plots saved to {SHAP_DIR}")


def merge_rankings(mi_df, rf_df, lgbm_df):
    """
    Merge all importance rankings into unified dataframe
    
    Returns:
        DataFrame with all scores + composite ranking
    """
    print("\n🔗 Merging all rankings...")
    
    # Merge on feature name
    merged = mi_df.merge(rf_df, on='feature', how='outer')
    merged = merged.merge(lgbm_df, on='feature', how='outer')
    
    # Fill NaN with 0
    merged = merged.fillna(0)
    
    # Normalize each score to 0-1 range
    for col in ['mi_score', 'rf_importance', 'lgbm_gain', 'shap_importance']:
        if col in merged.columns:
            max_val = merged[col].max()
            if max_val > 0:
                merged[f'{col}_norm'] = merged[col] / max_val
    
    # Compute composite score (average of normalized scores)
    norm_cols = [c for c in merged.columns if c.endswith('_norm')]
    merged['composite_score'] = merged[norm_cols].mean(axis=1)
    
    # Rank features
    merged['composite_rank'] = merged['composite_score'].rank(ascending=False)
    
    # Sort by composite score
    merged = merged.sort_values('composite_score', ascending=False)
    
    print(f"   ✅ Top 15 features by composite score:")
    for idx, row in merged.head(15).iterrows():
        print(f"      {row['composite_rank']:.0f}. {row['feature']}: {row['composite_score']:.4f}")
    
    return merged


def plot_top_features(rankings_df, top_n=20):
    """
    Create visualization of top N features
    """
    print(f"\n📊 Generating top {top_n} features plot...")
    
    top_features = rankings_df.head(top_n)
    
    # Create figure with subplots
    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    fig.suptitle(f'Top {top_n} BTTS Indicators - Multiple Methods', fontsize=16, fontweight='bold')
    
    # Plot 1: MI scores
    ax1 = axes[0, 0]
    top_mi = rankings_df.nlargest(top_n, 'mi_score')
    ax1.barh(range(len(top_mi)), top_mi['mi_score'].values)
    ax1.set_yticks(range(len(top_mi)))
    ax1.set_yticklabels(top_mi['feature'].values, fontsize=8)
    ax1.set_xlabel('Mutual Information Score')
    ax1.set_title('Mutual Information Rankings')
    ax1.invert_yaxis()
    
    # Plot 2: RF importance
    ax2 = axes[0, 1]
    top_rf = rankings_df.nlargest(top_n, 'rf_importance')
    ax2.barh(range(len(top_rf)), top_rf['rf_importance'].values)
    ax2.set_yticks(range(len(top_rf)))
    ax2.set_yticklabels(top_rf['feature'].values, fontsize=8)
    ax2.set_xlabel('RF Feature Importance')
    ax2.set_title('Random Forest Rankings')
    ax2.invert_yaxis()
    
    # Plot 3: SHAP importance
    ax3 = axes[1, 0]
    top_shap = rankings_df.nlargest(top_n, 'shap_importance')
    ax3.barh(range(len(top_shap)), top_shap['shap_importance'].values)
    ax3.set_yticks(range(len(top_shap)))
    ax3.set_yticklabels(top_shap['feature'].values, fontsize=8)
    ax3.set_xlabel('SHAP Importance')
    ax3.set_title('SHAP Value Rankings')
    ax3.invert_yaxis()
    
    # Plot 4: Composite score
    ax4 = axes[1, 1]
    ax4.barh(range(len(top_features)), top_features['composite_score'].values)
    ax4.set_yticks(range(len(top_features)))
    ax4.set_yticklabels(top_features['feature'].values, fontsize=8)
    ax4.set_xlabel('Composite Score')
    ax4.set_title('Composite Rankings (All Methods)')
    ax4.invert_yaxis()
    
    plt.tight_layout()
    output_file = RESULTS_DIR / 'top_features_comparison.png'
    plt.savefig(output_file, dpi=150, bbox_inches='tight')
    plt.close()
    
    print(f"   ✅ Plot saved to {output_file}")


def run_feature_importance_analysis(df):
    """
    Run complete feature importance analysis
    
    Returns:
        rankings_df, lgbm_model, shap_values
    """
    print("=" * 80)
    print("FEATURE IMPORTANCE DISCOVERY")
    print("=" * 80)
    
    # Prepare data
    X, y, feature_names = prepare_feature_matrix(df)
    
    # Method 1: Mutual Information
    mi_df = compute_mutual_information(X, y, feature_names)
    
    # Method 2: Random Forest
    rf_df = compute_rf_importance(X, y, feature_names)
    
    # Method 3: LightGBM + SHAP
    lgbm_df, lgbm_model, shap_values = compute_lgbm_shap_importance(X, y, feature_names)
    
    # Merge rankings
    rankings_df = merge_rankings(mi_df, rf_df, lgbm_df)
    
    # Save rankings
    output_file = RESULTS_DIR / 'feature_ranking.csv'
    rankings_df.to_csv(output_file, index=False)
    print(f"\n💾 Feature rankings saved to: {output_file}")
    
    # Generate plots
    plot_top_features(rankings_df, top_n=20)
    
    print("\n✅ Feature importance analysis complete!")
    
    return rankings_df, lgbm_model, shap_values


if __name__ == '__main__':
    import sys
    sys.path.append(str(Path(__file__).parent))
    
    from load_data import load_unified_data
    from build_features import build_all_features
    
    print("=" * 80)
    print("BTTS RESEARCH PIPELINE - FEATURE IMPORTANCE")
    print("=" * 80)
    
    # Load and engineer features
    print("\n📥 Loading data...")
    df = load_unified_data()
    
    print("\n🔧 Engineering features...")
    df = build_all_features(df)
    
    # Run analysis
    rankings_df, model, shap_values = run_feature_importance_analysis(df)
    
    print("\n" + "=" * 80)
    print("TOP 15 BTTS INDICATORS (COMPOSITE RANKING)")
    print("=" * 80)
    
    for idx, row in rankings_df.head(15).iterrows():
        print(f"{row['composite_rank']:.0f}. {row['feature']}")
        print(f"   MI: {row['mi_score']:.4f} | "
              f"RF: {row['rf_importance']:.4f} | "
              f"SHAP: {row['shap_importance']:.4f} | "
              f"Composite: {row['composite_score']:.4f}")
        print()
