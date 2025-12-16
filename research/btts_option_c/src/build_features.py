#!/usr/bin/env python3
"""
Feature Engineering Module for BTTS Research Pipeline

Implements:
- L5/L10 rolling form features for both teams
- Team-level aggregations
- Match-level engineered features
- Style interaction features
"""

import pandas as pd
import numpy as np
from pathlib import Path

from load_data import EVENT_COLUMNS

RESEARCH_DATA_DIR = Path(__file__).parent.parent / 'data'


def calculate_rolling_team_stats(df, team_col, window, stat_cols):
    """
    Calculate rolling statistics for a team
    
    Args:
        df: Match dataframe sorted by date
        team_col: 'home_norm' or 'away_norm'
        window: Rolling window size (5 or 10)
        stat_cols: List of columns to calculate rolling stats for
    
    Returns:
        DataFrame with rolling stats added
    """
    df = df.copy()
    
    # Create team-specific views
    home_mask = df.index.isin(df.index)  # Placeholder for iteration
    away_mask = df.index.isin(df.index)
    
    for team in df[team_col].unique():
        # Get all matches for this team (as home or away)
        team_home = df[df['home_norm'] == team].copy()
        team_away = df[df['away_norm'] == team].copy()
        
        # Combine and sort by date
        team_matches = pd.concat([
            team_home.assign(is_home=True),
            team_away.assign(is_home=False)
        ]).sort_values('date')
        
        # Calculate rolling stats
        for stat in stat_cols:
            home_stat = f'home_{stat}'
            away_stat = f'away_{stat}'
            
            # Determine which stat to use based on home/away
            team_matches[f'{stat}_value'] = np.where(
                team_matches['is_home'],
                team_matches[home_stat] if home_stat in team_matches.columns else np.nan,
                team_matches[away_stat] if away_stat in team_matches.columns else np.nan
            )
            
            # Calculate rolling mean (shift to avoid lookahead bias)
            rolling_stat = team_matches[f'{stat}_value'].shift(1).rolling(
                window=window, min_periods=1
            ).mean()
            
            # Map back to original dataframe
            col_name = f'{team_col}_rolling_{stat}_L{window}'
            
            # Update for home matches
            home_idx = df[df['home_norm'] == team].index
            df.loc[home_idx, col_name] = rolling_stat[team_matches['is_home']].values[:len(home_idx)]
            
            # Update for away matches
            away_idx = df[df['away_norm'] == team].index
            df.loc[away_idx, col_name] = rolling_stat[~team_matches['is_home']].values[:len(away_idx)]
    
    return df


def add_rolling_form_features(df, windows=[5, 10]):
    """
    Add L5/L10 rolling form features for both home and away teams
    
    Features added:
    - rolling_xg_L5/L10
    - rolling_xga_L5/L10
    - rolling_scored_L5/L10
    - rolling_conceded_L5/L10
    - rolling_shots_L5/L10
    - rolling_sot_L5/L10
    - rolling_possession_L5/L10
    - rolling_btts_rate_L5/L10
    """
    print("\n🔄 Computing rolling form features...")
    
    df = df.copy()
    df = df.sort_values('date').reset_index(drop=True)
    
    # Define stats to roll
    base_stats = []
    
    # Add available stats
    if 'home_xg' in df.columns:
        base_stats.extend(['xg', 'xga'])
    
    if 'home_goals' in df.columns:
        base_stats.extend(['goals', 'goals_conceded'])
    
    if 'home_shots_total' in df.columns:
        base_stats.extend(['shots_total', 'shots_on_target'])
    
    if 'home_possession_pct' in df.columns:
        base_stats.append('possession_pct')
    
    # Calculate rolling stats for each team and window
    for window in windows:
        print(f"   Computing L{window} stats...")
        
        for team in df['home_norm'].unique():
            # Get all matches for this team
            team_home = df[df['home_norm'] == team].copy()
            team_away = df[df['away_norm'] == team].copy()
            
            # For home matches, compute rolling away stats (what they did before)
            if len(team_home) > 0:
                # BTTS rate
                if 'btts' in df.columns:
                    btts_rolling = df[
                        (df['home_norm'] == team) | (df['away_norm'] == team)
                    ].sort_values('date')['btts'].shift(1).rolling(
                        window=window, min_periods=1
                    ).mean()
                    
                    df.loc[df['home_norm'] == team, f'home_btts_rate_L{window}'] = btts_rolling.values[:len(team_home)]
                
                # XG scored
                if 'home_xg' in df.columns:
                    # Build sequence of xG for this team
                    team_xg_seq = []
                    team_xga_seq = []
                    
                    all_team = df[(df['home_norm'] == team) | (df['away_norm'] == team)].sort_values('date')
                    
                    for idx, row in all_team.iterrows():
                        if row['home_norm'] == team:
                            team_xg_seq.append(row.get('home_xg', np.nan))
                            team_xga_seq.append(row.get('away_xg', np.nan))
                        else:
                            team_xg_seq.append(row.get('away_xg', np.nan))
                            team_xga_seq.append(row.get('home_xg', np.nan))
                    
                    team_xg_series = pd.Series(team_xg_seq)
                    team_xga_series = pd.Series(team_xga_seq)
                    
                    rolling_xg = team_xg_series.shift(1).rolling(window=window, min_periods=1).mean()
                    rolling_xga = team_xga_series.shift(1).rolling(window=window, min_periods=1).mean()
                    
                    # Map to home matches
                    home_indices = df[df['home_norm'] == team].index
                    if len(home_indices) > 0:
                        df.loc[home_indices, f'home_xg_L{window}'] = rolling_xg.values[:len(home_indices)]
                        df.loc[home_indices, f'home_xga_L{window}'] = rolling_xga.values[:len(home_indices)]
            
            # For away matches
            if len(team_away) > 0:
                # BTTS rate
                if 'btts' in df.columns:
                    btts_rolling = df[
                        (df['home_norm'] == team) | (df['away_norm'] == team)
                    ].sort_values('date')['btts'].shift(1).rolling(
                        window=window, min_periods=1
                    ).mean()
                    
                    df.loc[df['away_norm'] == team, f'away_btts_rate_L{window}'] = btts_rolling.values[:len(team_away)]
                
                # XG
                if 'home_xg' in df.columns:
                    all_team = df[(df['home_norm'] == team) | (df['away_norm'] == team)].sort_values('date')
                    
                    team_xg_seq = []
                    team_xga_seq = []
                    
                    for idx, row in all_team.iterrows():
                        if row['home_norm'] == team:
                            team_xg_seq.append(row.get('home_xg', np.nan))
                            team_xga_seq.append(row.get('away_xg', np.nan))
                        else:
                            team_xg_seq.append(row.get('away_xg', np.nan))
                            team_xga_seq.append(row.get('home_xg', np.nan))
                    
                    team_xg_series = pd.Series(team_xg_seq)
                    team_xga_series = pd.Series(team_xga_seq)
                    
                    rolling_xg = team_xg_series.shift(1).rolling(window=window, min_periods=1).mean()
                    rolling_xga = team_xga_series.shift(1).rolling(window=window, min_periods=1).mean()
                    
                    away_indices = df[df['away_norm'] == team].index
                    if len(away_indices) > 0:
                        df.loc[away_indices, f'away_xg_L{window}'] = rolling_xg.values[:len(away_indices)]
                        df.loc[away_indices, f'away_xga_L{window}'] = rolling_xga.values[:len(away_indices)]
    
    rolling_cols = [c for c in df.columns if '_L5' in c or '_L10' in c]
    print(f"   ✅ Added {len(rolling_cols)} rolling features")
    
    return df


def add_match_level_features(df):
    """
    Add match-level engineered features
    
    Features:
    - sum_xg = home_xg + away_xg
    - diff_xg = abs(home_xg - away_xg)
    - xg_dominance = max(home_xg, away_xg) / (home_xg + away_xg)
    - shot_quality_home = home_xg / home_shots_total
    - shot_quality_away = away_xg / away_shots_total
    - possession_dominance = abs(home_possession - away_possession)
    - chaos_index = total_shots + (big_chances if available)
    """
    print("\n🎯 Adding match-level engineered features...")
    
    df = df.copy()
    
    # XG-based features
    if 'home_xg' in df.columns and 'away_xg' in df.columns:
        df['sum_xg'] = df['home_xg'] + df['away_xg']
        df['diff_xg'] = abs(df['home_xg'] - df['away_xg'])
        df['xg_dominance'] = df[['home_xg', 'away_xg']].max(axis=1) / (df['sum_xg'] + 0.01)
        
        print("   ✅ Added xG aggregation features")
    
    # Shot quality
    if 'home_xg' in df.columns and 'home_shots_total' in df.columns:
        df['shot_quality_home'] = df['home_xg'] / (df['home_shots_total'] + 1)
        df['shot_quality_away'] = df['away_xg'] / (df['away_shots_total'] + 1)
        
        print("   ✅ Added shot quality features")
    
    # Possession features
    if 'home_possession_pct' in df.columns:
        df['possession_dominance'] = abs(df['home_possession_pct'] - df['away_possession_pct'])
        df['possession_balance'] = 50 - abs(df['home_possession_pct'] - 50)
        
        print("   ✅ Added possession features")
    
    # Chaos index
    if 'home_shots_total' in df.columns:
        df['chaos_index'] = df['home_shots_total'] + df['away_shots_total']
        
        if 'home_shots_on_target' in df.columns:
            df['danger_index'] = (df['home_shots_on_target'] + df['away_shots_on_target'])
        
        print("   ✅ Added chaos/danger features")
    
    # Availability impact (if FPL data exists)
    if 'home_attack_quality_pct' in df.columns:
        df['attack_strength_diff'] = abs(
            df['home_attack_quality_pct'] - df['away_attack_quality_pct']
        )
        df['min_attack_quality'] = df[['home_attack_quality_pct', 'away_attack_quality_pct']].min(axis=1)
        
        print("   ✅ Added availability features")
    
    df.attrs.setdefault('prediction_safe_flags', {})
    for col in df.columns:
        if col in EVENT_COLUMNS:
            df.attrs['prediction_safe_flags'][col] = False
        elif col.endswith(('_L5', '_L10')) or 'trend' in col or 'momentum' in col:
            df.attrs['prediction_safe_flags'][col] = True

    new_cols = [c for c in df.columns if c not in df.columns[:50]]  # Approximate
    print(f"   ✅ Total engineered features added: {len(new_cols)}")
    
    return df


def add_form_trend_features(df):
    """
    Add form trend features (L5 vs L10 comparison)
    
    Features:
    - xg_trend = xg_L5 - xg_L10
    - xga_trend = xga_L5 - xga_L10
    - form_momentum = btts_rate_L5 - btts_rate_L10
    """
    print("\n📈 Adding form trend features...")
    
    df = df.copy()
    
    # XG trends
    if 'home_xg_L5' in df.columns and 'home_xg_L10' in df.columns:
        df['home_xg_trend'] = df['home_xg_L5'] - df['home_xg_L10']
        df['away_xg_trend'] = df['away_xg_L5'] - df['away_xg_L10']
        
        df['home_xga_trend'] = df['home_xga_L5'] - df['home_xga_L10']
        df['away_xga_trend'] = df['away_xga_L5'] - df['away_xga_L10']
        
        print("   ✅ Added xG trend features")
    
    # BTTS form momentum
    if 'home_btts_rate_L5' in df.columns and 'home_btts_rate_L10' in df.columns:
        df['home_btts_momentum'] = df['home_btts_rate_L5'] - df['home_btts_rate_L10']
        df['away_btts_momentum'] = df['away_btts_rate_L5'] - df['away_btts_rate_L10']
        
        print("   ✅ Added BTTS momentum features")
    
    return df


def build_all_features(df):
    """
    Build complete feature set
    
    Pipeline:
    1. Add rolling form features (L5/L10)
    2. Add match-level engineered features
    3. Add form trend features
    """
    print("=" * 80)
    print("FEATURE ENGINEERING PIPELINE")
    print("=" * 80)
    
    print(f"\n📊 Starting with {len(df.columns)} base features")
    
    # Step 1: Rolling features
    df = add_rolling_form_features(df, windows=[5, 10])
    print(f"   Current total: {len(df.columns)} features")
    
    # Step 2: Match-level features
    df = add_match_level_features(df)
    print(f"   Current total: {len(df.columns)} features")
    
    # Step 3: Trend features
    df = add_form_trend_features(df)
    print(f"   Current total: {len(df.columns)} features")
    
    print(f"\n✅ Feature engineering complete!")
    print(f"   📊 Final feature count: {len(df.columns)}")
    
    # Save engineered dataset
    output_file = RESEARCH_DATA_DIR / 'engineered_features.csv'
    df.to_csv(output_file, index=False)
    print(f"   💾 Saved to: {output_file}")
    
    return df


if __name__ == '__main__':
    from load_data import load_unified_data
    
    print("=" * 80)
    print("BTTS RESEARCH PIPELINE - FEATURE ENGINEERING")
    print("=" * 80)
    
    # Load data
    df = load_unified_data()
    
    # Build features
    df_features = build_all_features(df)
    
    # Print feature summary
    print("\n" + "=" * 80)
    print("FEATURE SUMMARY")
    print("=" * 80)
    
    feature_groups = {
        'Rolling L5': [c for c in df_features.columns if '_L5' in c],
        'Rolling L10': [c for c in df_features.columns if '_L10' in c],
        'Trend': [c for c in df_features.columns if 'trend' in c or 'momentum' in c],
        'XG-based': [c for c in df_features.columns if 'xg' in c.lower() and '_L' not in c],
        'Possession': [c for c in df_features.columns if 'possession' in c],
        'Shots': [c for c in df_features.columns if 'shot' in c],
        'Availability': [c for c in df_features.columns if 'availability' in c or 'attack_quality' in c]
    }
    
    for group, cols in feature_groups.items():
        if cols:
            print(f"\n{group} ({len(cols)} features):")
            for col in cols[:10]:  # Show first 10
                print(f"  - {col}")
            if len(cols) > 10:
                print(f"  ... and {len(cols) - 10} more")
    
    print("\n✅ Feature engineering complete!")
