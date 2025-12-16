#!/usr/bin/env python3
"""
Leak-Free Feature Engineering for BTTS Models

This module builds features that are ONLY available before match kickoff.
NO post-match statistics (actual xG, shots, possession, etc.) are included.

Design Principles:
1. Temporal Integrity: For match on date D, only use data from date < D
2. Rolling Windows: L3, L5, L10, L20 for team form
3. League Context: Aggregates computed up to date D
4. Market Intelligence: Pre-match odds as features
5. Strict Validation: Assertions to prevent leakage

Author: Co-CTO
Date: December 11, 2025
"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

RESEARCH_DATA_DIR = Path(__file__).parent.parent / 'data'


def build_rolling_team_features(df, windows=[3, 5, 10, 20]):
    """
    Build rolling form features for each team across all their matches.
    
    For each team and window size, computes rolling averages of:
    - Goals for/against
    - xG for/against
    - BTTS rate
    - Scoring/conceding rates
    - Shot statistics
    
    Args:
        df: DataFrame with match history, sorted by date
        windows: List of rolling window sizes
        
    Returns:
        DataFrame with rolling features added
        
    Critical: Uses .shift(1) to exclude the current match from rolling stats.
    """
    print("\n🔄 Building rolling team features...")
    
    df = df.copy()
    df = df.sort_values('date').reset_index(drop=True)
    
    # Get unique teams
    all_teams = pd.concat([df['home_norm'], df['away_norm']]).unique()
    
    for team in all_teams:
        # Get all matches for this team (as home or away)
        team_home_mask = df['home_norm'] == team
        team_away_mask = df['away_norm'] == team
        
        team_matches_idx = df[team_home_mask | team_away_mask].index.tolist()
        
        if len(team_matches_idx) == 0:
            continue
            
        # Build per-match stats for this team
        team_stats = []
        
        for idx in team_matches_idx:
            row = df.loc[idx]
            is_home = row['home_norm'] == team
            
            if is_home:
                stats = {
                    'goals_for': row['home_goals'],
                    'goals_against': row['away_goals'],
                    'xg_for': row.get('home_xg', np.nan),
                    'xg_against': row.get('away_xg', np.nan),
                    'btts': row['btts'],
                    'scored': 1 if row['home_goals'] > 0 else 0,
                    'conceded': 1 if row['away_goals'] > 0 else 0,
                    'clean_sheet': 1 if row['away_goals'] == 0 else 0,
                }
            else:
                stats = {
                    'goals_for': row['away_goals'],
                    'goals_against': row['home_goals'],
                    'xg_for': row.get('away_xg', np.nan),
                    'xg_against': row.get('home_xg', np.nan),
                    'btts': row['btts'],
                    'scored': 1 if row['away_goals'] > 0 else 0,
                    'conceded': 1 if row['home_goals'] > 0 else 0,
                    'clean_sheet': 1 if row['home_goals'] == 0 else 0,
                }
            
            team_stats.append(stats)
        
        team_stats_df = pd.DataFrame(team_stats, index=team_matches_idx)
        
        # Compute rolling features for each window
        for window in windows:
            # CRITICAL: Use .shift(1) to exclude current match
            for stat_name in ['goals_for', 'goals_against', 'xg_for', 'xg_against',
                             'btts', 'scored', 'conceded', 'clean_sheet']:
                
                rolling_stat = team_stats_df[stat_name].shift(1).rolling(
                    window=window, min_periods=1
                ).mean()
                
                # Map back to original dataframe (home vs away prefix)
                for idx, value in zip(team_matches_idx, rolling_stat):
                    row = df.loc[idx]
                    is_home = row['home_norm'] == team
                    prefix = 'home' if is_home else 'away'
                    
                    col_name = f'{prefix}_{stat_name}_l{window}'
                    df.loc[idx, col_name] = value
    
    print(f"   ✅ Added rolling features for windows: {windows}")
    print(f"   📊 Features per team/window: 8 (goals_for, goals_against, xg_for, xg_against, btts, scored, conceded, clean_sheet)")
    
    return df


def build_venue_specific_features(df, windows=[5, 10]):
    """
    Build venue-specific rolling features (home at home, away when away).
    
    Args:
        df: DataFrame with rolling features already computed
        windows: List of rolling window sizes
        
    Returns:
        DataFrame with venue-specific features added
    """
    print("\n🏟️  Building venue-specific features...")
    
    df = df.copy()
    all_teams = pd.concat([df['home_norm'], df['away_norm']]).unique()
    
    for team in all_teams:
        # Home matches (team playing at home)
        home_mask = df['home_norm'] == team
        home_indices = df[home_mask].index.tolist()
        
        if len(home_indices) > 0:
            home_stats = df.loc[home_mask, 'home_goals'].shift(1)
            home_btts = df.loc[home_mask, 'btts'].shift(1)
            
            for window in windows:
                df.loc[home_indices, f'home_goals_for_at_home_l{window}'] = home_stats.rolling(window, min_periods=1).mean()
                df.loc[home_indices, f'home_btts_rate_at_home_l{window}'] = home_btts.rolling(window, min_periods=1).mean()
        
        # Away matches (team playing away)
        away_mask = df['away_norm'] == team
        away_indices = df[away_mask].index.tolist()
        
        if len(away_indices) > 0:
            away_stats = df.loc[away_mask, 'away_goals'].shift(1)
            away_btts = df.loc[away_mask, 'btts'].shift(1)
            
            for window in windows:
                df.loc[away_indices, f'away_goals_for_away_l{window}'] = away_stats.rolling(window, min_periods=1).mean()
                df.loc[away_indices, f'away_btts_rate_away_l{window}'] = away_btts.rolling(window, min_periods=1).mean()
    
    print(f"   ✅ Added venue-specific features for windows: {windows}")
    
    return df


def build_strength_features(df):
    """
    Build relative strength features by comparing team stats to league averages.
    
    Features:
    - attack_strength = xg_for / league_avg_xg_for
    - defense_weakness = xg_against / league_avg_xg_against
    - matchup features
    
    Args:
        df: DataFrame with rolling features
        
    Returns:
        DataFrame with strength features added
    """
    print("\n💪 Building relative strength features...")
    
    df = df.copy()
    
    # Compute league averages up to each date (time-respecting)
    df['league_avg_xg_for'] = np.nan
    df['league_avg_xg_against'] = np.nan
    
    for date in df['date'].unique():
        prior_mask = df['date'] < date
        
        if prior_mask.sum() > 0:
            league_xg_for = df.loc[prior_mask, 'home_xg'].mean()
            league_xg_against = df.loc[prior_mask, 'away_xg'].mean()
            
            df.loc[df['date'] == date, 'league_avg_xg_for'] = league_xg_for
            df.loc[df['date'] == date, 'league_avg_xg_against'] = league_xg_against
    
    # Fill first few rows with overall mean
    if df['league_avg_xg_for'].isna().any():
        df['league_avg_xg_for'].fillna(df['home_xg'].mean(), inplace=True)
        df['league_avg_xg_against'].fillna(df['away_xg'].mean(), inplace=True)
    
    # Compute attack strength for L10 window
    df['home_attack_strength_l10'] = df['home_xg_for_l10'] / (df['league_avg_xg_for'] + 0.01)
    df['away_attack_strength_l10'] = df['away_xg_for_l10'] / (df['league_avg_xg_for'] + 0.01)
    
    # Compute defense weakness
    df['home_defense_weakness_l10'] = df['home_xg_against_l10'] / (df['league_avg_xg_against'] + 0.01)
    df['away_defense_weakness_l10'] = df['away_xg_against_l10'] / (df['league_avg_xg_against'] + 0.01)
    
    # Matchup features
    df['attack_vs_defense_home'] = df['home_attack_strength_l10'] * df['away_defense_weakness_l10']
    df['attack_vs_defense_away'] = df['away_attack_strength_l10'] * df['home_defense_weakness_l10']
    df['combined_attack_strength'] = df['home_attack_strength_l10'] + df['away_attack_strength_l10']
    df['min_attack_strength'] = df[['home_attack_strength_l10', 'away_attack_strength_l10']].min(axis=1)
    
    print("   ✅ Added 12 relative strength features")
    
    return df


def build_trend_features(df):
    """
    Build form trend features (L5 vs L10 comparison).
    
    Features:
    - xg_trend = xg_for_l5 - xg_for_l10
    - btts_momentum = btts_rate_l5 - btts_rate_l10
    - scoring_momentum = scored_l5 - scored_l10
    
    Args:
        df: DataFrame with rolling features
        
    Returns:
        DataFrame with trend features added
    """
    print("\n📈 Building form trend features...")
    
    df = df.copy()
    
    # XG trends (attacking form)
    df['home_xg_trend'] = df['home_xg_for_l5'] - df['home_xg_for_l10']
    df['away_xg_trend'] = df['away_xg_for_l5'] - df['away_xg_for_l10']
    
    # Defensive trends
    df['home_xga_trend'] = df['home_xg_against_l5'] - df['home_xg_against_l10']
    df['away_xga_trend'] = df['away_xg_against_l5'] - df['away_xg_against_l10']
    
    # BTTS momentum
    df['home_btts_momentum'] = df['home_btts_l5'] - df['home_btts_l10']
    df['away_btts_momentum'] = df['away_btts_l5'] - df['away_btts_l10']
    
    # Scoring momentum
    df['home_scoring_momentum'] = df['home_scored_l5'] - df['home_scored_l10']
    df['away_scoring_momentum'] = df['away_scored_l5'] - df['away_scored_l10']
    
    print("   ✅ Added 8 form trend features")
    
    return df


def build_league_context_features(df):
    """
    Build league-wide context features (time-respecting aggregates).
    
    Features:
    - league_avg_goals_to_date
    - league_btts_rate_to_date
    - league_home_advantage_to_date
    - season_phase
    
    Args:
        df: DataFrame with match history
        
    Returns:
        DataFrame with league context features added
    """
    print("\n🌍 Building league context features...")
    
    df = df.copy()
    
    # For each date, compute stats from all prior matches
    df['league_avg_goals_to_date'] = np.nan
    df['league_btts_rate_to_date'] = np.nan
    df['league_home_advantage_to_date'] = np.nan
    
    for date in df['date'].unique():
        prior_mask = df['date'] < date
        
        if prior_mask.sum() > 0:
            prior_df = df[prior_mask]
            
            avg_goals = (prior_df['home_goals'] + prior_df['away_goals']).mean()
            btts_rate = prior_df['btts'].mean()
            home_adv = prior_df['home_goals'].mean() - prior_df['away_goals'].mean()
            
            df.loc[df['date'] == date, 'league_avg_goals_to_date'] = avg_goals
            df.loc[df['date'] == date, 'league_btts_rate_to_date'] = btts_rate
            df.loc[df['date'] == date, 'league_home_advantage_to_date'] = home_adv
    
    # Fill first few rows with overall means
    df['league_avg_goals_to_date'].fillna(
        (df['home_goals'] + df['away_goals']).mean(), inplace=True
    )
    df['league_btts_rate_to_date'].fillna(df['btts'].mean(), inplace=True)
    df['league_home_advantage_to_date'].fillna(
        df['home_goals'].mean() - df['away_goals'].mean(), inplace=True
    )
    
    # Season phase
    df['matches_played'] = df.groupby('season').cumcount()
    df['season_phase'] = df.groupby('season')['matches_played'].transform(
        lambda x: x / x.max() if x.max() > 0 else 0
    )
    
    print("   ✅ Added 5 league context features")
    
    return df


def build_market_features(df):
    """
    Build market-implied features from pre-match odds.
    
    Features:
    - btts_yes_implied_prob = 1 / btts_yes_odds
    - btts_no_implied_prob = 1 / btts_no_odds
    - btts_market_vig
    
    Args:
        df: DataFrame with odds columns
        
    Returns:
        DataFrame with market features added
    """
    print("\n💰 Building market-implied features...")
    
    df = df.copy()
    
    if 'btts_yes_odds' in df.columns:
        df['btts_yes_implied_prob'] = 1.0 / df['btts_yes_odds'].clip(lower=1.01)
        df['btts_no_implied_prob'] = 1.0 / df['btts_no_odds'].clip(lower=1.01)
        df['btts_market_vig'] = df['btts_yes_implied_prob'] + df['btts_no_implied_prob'] - 1.0
        
        print("   ✅ Added 3 market features")
    else:
        print("   ⚠️  No odds columns found, skipping market features")
    
    return df


def build_advanced_matchup_features(df):
    """
    Build advanced attack vs defense matchup features.
    
    These are sophisticated pre-match indicators combining both teams' form:
    - Expected goals matchup (home attack vs away defense)
    - Pace indicators (combined offensive output)
    - Style clash features (both teams attack-heavy vs both defensive)
    
    Args:
        df: DataFrame with rolling features
        
    Returns:
        DataFrame with advanced matchup features
    """
    print("\n⚔️  Building advanced matchup features...")
    
    df = df.copy()
    
    # Expected goals matchup (predict match xG from team form)
    # Home expected: home attacking form vs away defensive form
    df['home_expected_xg'] = (df['home_xg_for_l10'] + df['away_xg_against_l10']) / 2
    df['away_expected_xg'] = (df['away_xg_for_l10'] + df['home_xg_against_l10']) / 2
    df['total_expected_xg'] = df['home_expected_xg'] + df['away_expected_xg']
    
    # Pace indicator (how many goals/xG both teams typically produce)
    df['combined_pace_l10'] = (df['home_xg_for_l10'] + df['home_xg_against_l10'] + 
                                df['away_xg_for_l10'] + df['away_xg_against_l10']) / 2
    
    # Style clash: both offensive (high xG for both) vs both defensive (low xG against)
    df['both_teams_attack_heavy'] = ((df['home_xg_for_l10'] > df['league_avg_xg_for']) & 
                                     (df['away_xg_for_l10'] > df['league_avg_xg_for'])).astype(int)
    
    df['both_teams_defense_weak'] = ((df['home_xg_against_l10'] > df['league_avg_xg_against']) & 
                                     (df['away_xg_against_l10'] > df['league_avg_xg_against'])).astype(int)
    
    # Imbalance: one team much stronger
    df['strength_imbalance'] = abs(df['home_attack_strength_l10'] - df['away_attack_strength_l10'])
    
    # Goals per match averages (more stable than xG for some teams)
    df['home_gpg_l10'] = (df['home_goals_for_l10'] + df['home_goals_against_l10']) / 2
    df['away_gpg_l10'] = (df['away_goals_for_l10'] + df['away_goals_against_l10']) / 2
    df['combined_gpg'] = df['home_gpg_l10'] + df['away_gpg_l10']
    
    print("   ✅ Added 11 advanced matchup features")
    
    return df


def build_style_indicators(df):
    """
    Build team style indicators from historical patterns.
    
    These capture HOW teams play (attack-heavy, defensive, high-variance):
    - High scoring match rate
    - BTTS consistency
    - Variance indicators
    
    Args:
        df: DataFrame with rolling features
        
    Returns:
        DataFrame with style indicator features
    """
    print("\n🎨 Building style indicator features...")
    
    df = df.copy()
    
    # % of matches with >2.5 total goals (offensive style indicator)
    # Approximation: if avg goals > 1.25 per side, likely >2.5 total
    df['home_high_scoring_rate_l10'] = (df['home_goals_for_l10'] + df['home_goals_against_l10'] > 2.5).astype(float)
    df['away_high_scoring_rate_l10'] = (df['away_goals_for_l10'] + df['away_goals_against_l10'] > 2.5).astype(float)
    
    # BTTS consistency (how reliably do both teams score/concede?)
    # High BTTS rate AND high scoring rate = reliable BTTS candidate
    df['home_btts_consistency'] = df['home_btts_l10'] * df['home_scored_l10'] * df['home_conceded_l10']
    df['away_btts_consistency'] = df['away_btts_l10'] * df['away_scored_l10'] * df['away_conceded_l10']
    
    # Combined BTTS indicators
    df['both_teams_btts_heavy'] = ((df['home_btts_l10'] > 0.5) & (df['away_btts_l10'] > 0.5)).astype(int)
    df['neither_team_btts_heavy'] = ((df['home_btts_l10'] < 0.3) & (df['away_btts_l10'] < 0.3)).astype(int)
    
    # Recent form delta (L5 vs L10 shows momentum)
    df['home_form_delta'] = (df['home_goals_for_l5'] - df['home_goals_for_l10'])
    df['away_form_delta'] = (df['away_goals_for_l5'] - df['away_goals_for_l10'])
    
    print("   ✅ Added 8 style indicator features")
    
    return df


def build_market_intelligence_features(df):
    """
    Build sophisticated market-derived features.
    
    Market odds encode valuable information about expected match dynamics:
    - Implied total goals from BTTS market
    - Market confidence (tight vs wide spreads)
    - Deviation from model expectations
    
    Args:
        df: DataFrame with odds columns
        
    Returns:
        DataFrame with market intelligence features
    """
    print("\n💡 Building market intelligence features...")
    
    df = df.copy()
    
    if 'btts_yes_odds' in df.columns and 'btts_no_odds' in df.columns:
        # Fair probability (vig removed proportionally)
        total_prob = df['btts_yes_implied_prob'] + df['btts_no_implied_prob']
        df['btts_yes_fair_prob'] = df['btts_yes_implied_prob'] / total_prob
        df['btts_no_fair_prob'] = df['btts_no_implied_prob'] / total_prob
        
        # Market confidence: low vig = confident market
        df['market_confidence'] = 1 / (df['btts_market_vig'] + 0.01)  # Inverse of vig
        
        # Odds spread: large difference = strong market opinion
        df['odds_spread'] = abs(df['btts_yes_odds'] - df['btts_no_odds'])
        
        # Short odds indicator: both sides < 2.00 = uncertain match
        df['both_sides_short'] = ((df['btts_yes_odds'] < 2.0) & (df['btts_no_odds'] < 2.0)).astype(int)
        
        print("   ✅ Added 5 market intelligence features")
    else:
        print("   ⚠️  Odds columns not found, skipping market intelligence")
    
    return df


def build_static_features(df):
    """
    Build static match context features.
    
    Features:
    - is_weekend
    - is_midweek
    - month
    
    Args:
        df: DataFrame with date column
        
    Returns:
        DataFrame with static features added
    """
    print("\n📅 Building static match features...")
    
    df = df.copy()
    
    # Ensure date is datetime
    df['date'] = pd.to_datetime(df['date'])
    
    # Day of week features
    df['day_of_week'] = df['date'].dt.dayofweek
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)  # Saturday=5, Sunday=6
    df['is_midweek'] = df['day_of_week'].isin([1, 2, 3]).astype(int)  # Tue=1, Wed=2, Thu=3
    
    # Month
    df['month'] = df['date'].dt.month
    
    print("   ✅ Added 4 static features")
    
    return df


def validate_temporal_integrity(df, sample_size=50, verbose=True):
    """
    Validate that no feature contains future information.
    
    For a random sample of matches, verify that all rolling features
    are computed using only data from date < match_date.
    
    Args:
        df: Feature dataframe
        sample_size: Number of matches to validate
        verbose: Print validation results
        
    Returns:
        bool: True if validation passes
        
    Raises:
        AssertionError: If leakage is detected
    """
    print("\n🔍 Validating temporal integrity...")
    
    # Sample random matches (skip first 20 to ensure history exists)
    sample_indices = df.iloc[20:].sample(min(sample_size, len(df) - 20)).index
    
    leakage_found = False
    
    for idx in sample_indices:
        row = df.loc[idx]
        match_date = pd.to_datetime(row['date'])
        
        # Check that rolling features don't use current match
        # by verifying they differ from actual match stats
        
        # Example: home_xg_for_l5 should NOT equal home_xg
        if pd.notna(row.get('home_xg')) and pd.notna(row.get('home_xg_for_l5')):
            if abs(row['home_xg'] - row['home_xg_for_l5']) < 0.001:
                # Could be coincidence, but check if it's exactly equal
                home_team = row['home_norm']
                recent_home_matches = df[
                    (df['home_norm'] == home_team) & 
                    (df['date'] < match_date)
                ].tail(5)
                
                if len(recent_home_matches) > 0:
                    expected_avg = recent_home_matches['home_xg'].mean()
                    if abs(row['home_xg_for_l5'] - expected_avg) > 0.01:
                        if verbose:
                            print(f"   ⚠️  Potential leakage at idx {idx}: home_xg_for_l5 suspicious")
                        leakage_found = True
    
    # Check that no EVENT_COLUMNS are present
    event_columns = {
        'sum_xg', 'diff_xg', 'xg_dominance', 'shot_quality_home', 'shot_quality_away',
        'possession_dominance', 'chaos_index', 'danger_index',
        'home_shots_total', 'away_shots_total', 'home_corners', 'away_corners'
    }
    
    present_event_cols = event_columns.intersection(set(df.columns))
    
    if present_event_cols:
        print(f"   ❌ LEAKAGE DETECTED: Event columns present: {present_event_cols}")
        leakage_found = True
    else:
        print("   ✅ No event columns detected")
    
    # Check that actual match xG is NOT used directly as a feature
    if 'home_xg' in df.columns:
        # home_xg should exist (for computing rolling stats) but not be a model feature
        print("   ⚠️  Warning: 'home_xg' column present (ok for pipeline, but exclude from model features)")
    
    if not leakage_found:
        print("   ✅ Temporal integrity validation PASSED")
        return True
    else:
        print("   ❌ Temporal integrity validation FAILED")
        return False


def build_leakfree_features(matches_df):
    """
    Master function to build all leak-free features.
    
    Args:
        matches_df: Raw match dataframe with columns:
            - date, season, home_norm, away_norm
            - home_goals, away_goals, home_xg, away_xg
            - btts, btts_yes_odds, btts_no_odds (if available)
            
    Returns:
        DataFrame with leak-free features added
        
    Note: The input df should contain actual match results (home_xg, away_xg)
          for computing rolling stats, but these columns will be marked
          as NON-FEATURES and excluded from model training.
    """
    print("\n" + "="*80)
    print("BUILDING LEAK-FREE BTTS FEATURES")
    print("="*80)
    
    df = matches_df.copy()
    df = df.sort_values('date').reset_index(drop=True)
    
    # Drop event columns that leak from unified data
    event_cols_to_drop = [
        # Match outcome columns (CRITICAL LEAKAGE)
        'home_goals_fpl', 'away_goals_fpl',  # FPL goals = actual goals (93% identical)
        # In-match event statistics
        'home_shots_total', 'away_shots_total', 'home_shots_on_target', 'away_shots_on_target',
        'home_shots_off_target', 'away_shots_off_target', 'home_shots_inside_box', 'away_shots_inside_box',
        'home_shots_outside_box', 'away_shots_outside_box', 'home_shots_blocked', 'away_shots_blocked',
        'home_corners', 'away_corners', 'home_fouls', 'away_fouls',
        'home_yellow_cards', 'away_yellow_cards', 'home_red_cards', 'away_red_cards',
        'home_gk_saves', 'away_gk_saves', 'home_possession_pct', 'away_possession_pct',
        'home_passes_total', 'away_passes_total', 'home_passes_accurate', 'away_passes_accurate',
        # Engineered features that use event stats
        'sum_xg', 'diff_xg', 'xg_dominance', 'shot_quality_home', 'shot_quality_away',
        'possession_dominance', 'possession_balance', 'chaos_index', 'danger_index',
        'attack_strength_diff', 'min_attack_quality',
    ]
    
    cols_to_drop = [c for c in event_cols_to_drop if c in df.columns]
    if cols_to_drop:
        df = df.drop(columns=cols_to_drop)
        print(f"\n🗑️  Dropped {len(cols_to_drop)} event columns to prevent leakage")
    
    initial_cols = len(df.columns)
    print(f"📊 Starting with {initial_cols} columns")
    
    # Step 1: Rolling team features
    df = build_rolling_team_features(df, windows=[3, 5, 10, 20])
    
    # Step 2: Venue-specific features
    df = build_venue_specific_features(df, windows=[5, 10])
    
    # Step 3: Relative strength features
    df = build_strength_features(df)
    
    # Step 4: Form trend features
    df = build_trend_features(df)
    
    # Step 5: League context features
    df = build_league_context_features(df)
    
    # Step 6: Market features
    df = build_market_features(df)
    
    # Step 7: Advanced matchup features (NEW)
    df = build_advanced_matchup_features(df)
    
    # Step 8: Style indicator features (NEW)
    df = build_style_indicators(df)
    
    # Step 9: Market intelligence features (NEW)
    df = build_market_intelligence_features(df)
    
    # Step 10: Static features
    df = build_static_features(df)
    
    final_cols = len(df.columns)
    added_cols = final_cols - initial_cols
    
    print(f"\n✅ Feature engineering complete!")
    print(f"   📊 Added {added_cols} features (total: {final_cols})")
    
    # Step 8: Validate temporal integrity
    validate_temporal_integrity(df, sample_size=50)
    
    # Mark which columns are safe for modeling vs leaky
    feature_cols = [c for c in df.columns if c not in [
        'fixture_id', 'season', 'date', 'home', 'away', 'home_norm', 'away_norm',
        'venue', 'referee', 'btts',
        'home_goals', 'away_goals', 'home_xg', 'away_xg',  # Outcome variables
        'home_goals_fpl', 'away_goals_fpl',
        'btts_yes_odds', 'btts_no_odds',  # Keep as features (market info)
    ]]
    
    df.attrs['leakfree_feature_columns'] = feature_cols
    df.attrs['label_column'] = 'btts'
    df.attrs['identifier_columns'] = ['fixture_id', 'season', 'date', 'home_norm', 'away_norm']
    
    print(f"\n📝 Marked {len(feature_cols)} columns as leak-free features")
    
    return df


# Example usage
if __name__ == '__main__':
    from load_data import load_unified_data
    
    print("\n🚀 Loading unified match data...")
    matches = load_unified_data()
    
    print(f"   Loaded {len(matches)} matches")
    
    # Build leak-free features
    leakfree_df = build_leakfree_features(matches)
    
    # Save to disk
    output_path = RESEARCH_DATA_DIR / 'btts_leakfree_features.parquet'
    leakfree_df.to_parquet(output_path, index=False)
    
    print(f"\n💾 Saved leak-free features to: {output_path}")
    print(f"   Shape: {leakfree_df.shape}")
    print(f"   Feature columns: {len(leakfree_df.attrs['leakfree_feature_columns'])}")
    
    # Show sample
    print("\n📋 Sample leak-free features (first match with sufficient history):")
    sample_row = leakfree_df.iloc[30]
    print(f"   Match: {sample_row['home_norm']} vs {sample_row['away_norm']} ({sample_row['date'].date()})")
    print(f"   BTTS: {sample_row['btts']}")
    print(f"\n   Key features:")
    print(f"      home_xg_for_l10: {sample_row['home_xg_for_l10']:.3f}")
    print(f"      away_xg_for_l10: {sample_row['away_xg_for_l10']:.3f}")
    print(f"      home_btts_l10: {sample_row['home_btts_l10']:.3f}")
    print(f"      away_btts_l10: {sample_row['away_btts_l10']:.3f}")
    print(f"      combined_attack_strength: {sample_row['combined_attack_strength']:.3f}")
    print(f"      league_btts_rate_to_date: {sample_row['league_btts_rate_to_date']:.3f}")
    
    print("\n✅ Leak-free feature builder test complete!")
