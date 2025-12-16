#!/usr/bin/env python3
"""
Data Loading Module for BTTS Research Pipeline

Loads and merges:
- Baseline EPL data (904 matches)
- API-Football statistics (xG, shots, possession, passes, referee)
- FPL player availability data (injuries, squad quality)

Creates a unified match-level dataframe for analysis.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime

# Paths
REPO_ROOT = Path(__file__).parent.parent.parent.parent
DATA_DIR = REPO_ROOT / 'scripts' / 'data' / 'premier_league'
RESEARCH_DATA_DIR = Path(__file__).parent.parent / 'data'


EVENT_COLUMNS = {
    'home_goals', 'away_goals', 'home_goals_fpl', 'away_goals_fpl',
    'home_shots_total', 'away_shots_total', 'home_shots_on_target', 'away_shots_on_target',
    'home_shots_off_target', 'away_shots_off_target', 'home_shots_inside_box', 'away_shots_inside_box',
    'home_shots_outside_box', 'away_shots_outside_box', 'home_shots_blocked', 'away_shots_blocked',
    'home_corners', 'away_corners', 'home_fouls', 'away_fouls', 'home_yellow_cards', 'away_yellow_cards',
    'home_red_cards', 'away_red_cards', 'home_gk_saves', 'away_gk_saves', 'danger_index', 'chaos_index',
    'sum_xg', 'diff_xg', 'xg_dominance', 'shot_quality_home', 'shot_quality_away'
}

PREDICTION_SAFE_DEFAULTS = {
    'home_availability_pct', 'away_availability_pct', 'home_btts_rate_L5', 'away_btts_rate_L5',
    'home_btts_rate_L10', 'away_btts_rate_L10', 'home_xg_L5', 'away_xg_L5', 'home_xga_L5', 'away_xga_L5',
    'home_xg_L10', 'away_xg_L10', 'home_xga_L10', 'away_xga_L10', 'home_xg_trend', 'away_xg_trend',
    'home_xga_trend', 'away_xga_trend', 'home_btts_momentum', 'away_btts_momentum'
}


def load_baseline_data():
    """
    Load the baseline 904 EPL matches with BTTS labels and odds
    
    This is the core audited EPL universe used by Profile C.
    All external features should be left-joined onto this base.
    
    Key columns expected:
    - season, date, home_norm, away_norm (the join key)
    - btts (target variable: 0 or 1)
    - btts_yes_odds, btts_no_odds (market odds)
    - home_goals, away_goals (actual results)
    
    Returns:
        pd.DataFrame with baseline matches
    """
    print("📥 Loading baseline EPL data (core 904-match universe)...")
    
    # Try multiple possible locations for baseline file
    possible_files = [
        DATA_DIR / 'epl_btts_baseline_odds.csv',
        REPO_ROOT / 'data' / 'epl_btts_baseline_odds.csv',
        REPO_ROOT / 'data' / 'premier_league' / 'historical_completed_with_odds.csv',
        Path('/Users/brentgoldman/Desktop/REPO33/data/premier_league/historical_completed_with_odds.csv')
    ]
    
    baseline_file = None
    for path in possible_files:
        if path.exists():
            baseline_file = path
            print(f"   Found baseline at: {path}")
            break
    
    if baseline_file is None:
        print("⚠️  Warning: Could not find baseline odds file")
        print("    Searched locations:")
        for path in possible_files:
            print(f"      - {path}")
        print("    Creating minimal baseline from API-Football data...")
        
        # Fallback: Use API-Football data to construct baseline
        api_df = load_api_football_data()
        
        if api_df.empty:
            raise FileNotFoundError(
                "Cannot create baseline: no API-Football data available. "
                "Please run the data fetchers first."
            )
        
        baseline_df = api_df[['season', 'date', 'home_norm', 'away_norm', 
                                'home_goals', 'away_goals']].copy()
        
        # Calculate BTTS
        baseline_df['btts'] = ((baseline_df['home_goals'] > 0) & 
                                (baseline_df['away_goals'] > 0)).astype(int)
        
        # Mock odds (will be replaced with actual if available)
        baseline_df['btts_yes_odds'] = 1.90
        baseline_df['btts_no_odds'] = 1.90
        
        print(f"   ⚠️  Created fallback baseline: {len(baseline_df)} matches")
        return baseline_df
    
    df = pd.read_csv(baseline_file)
    df['feature_provenance'] = 'baseline_odds'
    
    # Standardize column names
    df.columns = df.columns.str.lower().str.strip()
    
    # Rename home/away to home_norm/away_norm if needed
    if 'home' in df.columns and 'home_norm' not in df.columns:
        df = df.rename(columns={'home': 'home_norm', 'away': 'away_norm'})
        print("   ✓ Renamed 'home'/'away' → 'home_norm'/'away_norm'")
    
    # Ensure date is datetime (remove timezone for merge compatibility)
    if 'date' in df.columns:
        df['date'] = pd.to_datetime(df['date'])
        # Remove timezone if present to ensure clean merging
        if df['date'].dt.tz is not None:
            df['date'] = df['date'].dt.tz_localize(None)
    
    # Ensure we have the key columns for joining
    required_cols = ['season', 'date', 'home_norm', 'away_norm']
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise ValueError(f"Baseline file missing required columns: {missing_cols}")
    
    # Calculate BTTS from actual scores if not present
    # Try multiple possible column names for scores
    if 'btts' not in df.columns:
        score_cols = [
            ('home_goals', 'away_goals'),
            ('home_score', 'away_score'),
            ('fthg', 'ftag'),  # Full Time Home Goals, Full Time Away Goals
            ('hg', 'ag')
        ]
        
        btts_calculated = False
        for home_col, away_col in score_cols:
            if home_col in df.columns and away_col in df.columns:
                # BTTS = 1 if BOTH teams scored (score > 0), else 0
                df['btts'] = ((df[home_col] > 0) & (df[away_col] > 0)).astype(int)
                print(f"   ℹ️  Calculated BTTS from {home_col}/{away_col}")
                
                # Also create standardized goal columns if needed
                if 'home_goals' not in df.columns:
                    df['home_goals'] = df[home_col]
                if 'away_goals' not in df.columns:
                    df['away_goals'] = df[away_col]
                
                btts_calculated = True
                break
        
        if not btts_calculated:
            print("   ℹ️  Note: Baseline has odds only, BTTS labels will come from API-Football merge")
            print("           (This is expected - baseline defines universe, API-Football adds match results)")
    
    print(f"   ✅ Loaded {len(df)} baseline matches")
    if 'btts' in df.columns:
        print(f"   📊 BTTS rate: {df['btts'].mean():.1%}")
    print(f"   📅 Date range: {df['date'].min()} to {df['date'].max()}")
    
    # Log key statistics
    unique_combos = df.groupby(['season', 'home_norm', 'away_norm']).size()
    print(f"   📊 Unique (season, home, away) combos: {len(unique_combos)}")
    
    if len(df) < 900:
        print(f"   ⚠️  WARNING: Baseline has {len(df)} matches (expected ~904)")
    
    return df


def load_api_football_data():
    """
    Load API-Football statistics (xG, shots, possession, passes, referee)
    
    Returns:
        pd.DataFrame with 43 columns including xG, shots, possession, etc.
    """
    print("📥 Loading API-Football data...")
    
    api_file = DATA_DIR / 'api_football_statistics.csv'
    
    if not api_file.exists():
        print(f"⚠️  Warning: API-Football data not found at {api_file}")
        return pd.DataFrame()
    
    df = pd.read_csv(api_file)
    df['feature_provenance'] = 'api_football'
    
    # Parse string fields to numeric
    if 'home_xg' in df.columns:
        df['home_xg'] = pd.to_numeric(df['home_xg'], errors='coerce')
        df['away_xg'] = pd.to_numeric(df['away_xg'], errors='coerce')
    
    if 'home_possession_pct' in df.columns:
        # Remove '%' if present and convert to numeric
        if df['home_possession_pct'].dtype == object:
            df['home_possession_pct'] = df['home_possession_pct'].str.replace('%', '').astype(float)
            df['away_possession_pct'] = df['away_possession_pct'].str.replace('%', '').astype(float)
    
    # Ensure date is datetime (remove timezone to match baseline)
    if 'date' in df.columns:
        df['date'] = pd.to_datetime(df['date'])
        # Remove timezone if present to ensure merge compatibility
        if df['date'].dt.tz is not None:
            df['date'] = df['date'].dt.tz_localize(None)
    
    print(f"   ✅ Loaded {len(df)} matches from API-Football")
    print(f"   📊 xG coverage: {df['home_xg'].notna().sum()}/{len(df)} matches")
    
    return df


def load_fpl_data():
    """
    Load FPL player availability data (injuries, squad quality)
    
    Returns:
        pd.DataFrame with 27 columns including availability metrics
    """
    print("📥 Loading FPL player availability data...")
    
    fpl_file = DATA_DIR / 'fpl_player_context.csv'
    
    if not fpl_file.exists():
        print(f"⚠️  Warning: FPL data not found at {fpl_file}")
        return pd.DataFrame()
    
    df = pd.read_csv(fpl_file)
    df['feature_provenance'] = 'fpl_player_context'
    
    # Ensure date is datetime (remove timezone to match baseline)
    if 'date' in df.columns:
        df['date'] = pd.to_datetime(df['date'])
        # Remove timezone if present to ensure merge compatibility
        if df['date'].dt.tz is not None:
            df['date'] = df['date'].dt.tz_localize(None)
    
    print(f"   ✅ Loaded {len(df)} matches from FPL")
    print(f"   📊 Avg home availability: {df['home_availability_pct'].mean():.1f}%")
    print(f"   📊 Avg away availability: {df['away_availability_pct'].mean():.1f}%")
    
    return df


def merge_all_sources():
    """
    Merge API-Football (baseline), odds, and FPL data into unified dataframe
    
    UPDATED STRATEGY: Use API-Football as baseline (has match results).
    Then left-join baseline odds and FPL data using the key:
    (season, date, home_norm, away_norm)
    
    This ensures we have actual match outcomes for BTTS calculation.
    
    Returns:
        pd.DataFrame with all features merged
    """
    print("\n🔗 Merging all data sources...")
    print("   Join key: (season, date, home_norm, away_norm)")
    print("   📌 USING API-FOOTBALL AS BASELINE (has match results)")
    
    # Load all sources
    api_df = load_api_football_data()        # NEW BASELINE (has goals)
    baseline_df = load_baseline_data()       # Left-join odds
    fpl_df = load_fpl_data()                 # Left-join FPL
    
    # Start with API-Football (this defines our universe - has actual match results)
    unified_df = api_df.copy()
    print(f"\n   📌 API-Football baseline: {len(unified_df)} matches")
    print(f"      Date range: {unified_df['date'].min()} to {unified_df['date'].max()}")
    print(f"      Unique teams: {unified_df['home_norm'].nunique()} home, {unified_df['away_norm'].nunique()} away")
    print(f"      Unique (season, home, away): {unified_df.groupby(['season', 'home_norm', 'away_norm']).size().shape[0]}")
    
    # Calculate BTTS from API-Football goals (do this FIRST before merging)
    if 'home_goals' in unified_df.columns and 'away_goals' in unified_df.columns:
        unified_df['btts'] = ((unified_df['home_goals'] > 0) & 
                               (unified_df['away_goals'] > 0)).astype(int)
        btts_rate = unified_df['btts'].mean()
        print(f"\n   ✅ Calculated BTTS target from API-Football goals")
        print(f"      BTTS labels: {len(unified_df)}/{len(unified_df)} matches")
        print(f"      BTTS rate: {btts_rate:.1%}")
    else:
        print(f"\n   ❌ ERROR: API-Football missing home_goals/away_goals!")
        raise ValueError("Cannot calculate BTTS without goal data")
    
    # Merge baseline odds data
    if not baseline_df.empty:
        print("\n   🔗 Merging baseline odds...")
        print(f"      Baseline odds records: {len(baseline_df)}")
        
        # Create date_only column for matching (ignore time component)
        unified_df['date_only'] = unified_df['date'].dt.date
        baseline_df['date_only'] = baseline_df['date'].dt.date
        
        # Select only odds columns to avoid conflicts
        odds_cols = ['date_only', 'home_norm', 'away_norm', 'btts_yes_odds', 'btts_no_odds', 'bookmaker']
        odds_df = baseline_df[odds_cols].copy()
        
        # Merge on date_only (not full datetime) + teams (not season)
        # This handles timezone/timestamp differences and season label mismatches
        unified_df = pd.merge(
            unified_df,
            odds_df,
            on=['date_only', 'home_norm', 'away_norm'],
            how='left',
            suffixes=('', '_baseline')
        )

        unified_df.loc[unified_df['btts_yes_odds'].notna(), 'feature_provenance_odds'] = 'baseline_odds'
        
        # Drop temporary date_only column
        unified_df = unified_df.drop(columns=['date_only'])
        
        # Remove any duplicates created by date_only merge (keep first occurrence)
        before_dedup = len(unified_df)
        unified_df = unified_df.drop_duplicates(subset=['season', 'date', 'home_norm', 'away_norm'], keep='first')
        after_dedup = len(unified_df)
        if before_dedup > after_dedup:
            print(f"      ℹ️  Removed {before_dedup - after_dedup} duplicate matches from date_only merge")
        
        # Report coverage
        odds_coverage = unified_df['btts_yes_odds'].notna().sum()
        odds_pct = odds_coverage / len(unified_df)
        print(f"      ✅ Odds coverage: {odds_coverage}/{len(unified_df)} matches ({odds_pct:.1%})")
        
        if odds_pct < 0.50:
            print(f"      ⚠️  WARNING: Low odds coverage ({odds_pct:.1%} < 50%)")
    else:
        print("\n   ⚠️  Baseline odds data not available")
    
    # Merge FPL data
    if not fpl_df.empty:
        print("\n   🔗 Merging FPL data...")
        print(f"      FPL records: {len(fpl_df)}")
        
        unified_df = pd.merge(
            unified_df,
            fpl_df,
            on=['season', 'date', 'home_norm', 'away_norm'],
            how='left',
            suffixes=('', '_fpl')
        )

        unified_df.loc[unified_df['home_availability_pct'].notna(), 'feature_provenance_fpl'] = 'fpl_player_context'
        
        # Report coverage
        fpl_coverage = unified_df['home_availability_pct'].notna().sum()
        fpl_pct = fpl_coverage / len(unified_df)
        print(f"      ✅ FPL coverage: {fpl_coverage}/{len(unified_df)} matches ({fpl_pct:.1%})")
        
        if fpl_pct < 0.80:
            print(f"      ⚠️  WARNING: Low FPL coverage ({fpl_pct:.1%} < 80%)")
    else:
        print("\n   ⚠️  FPL data not available")
    
    # Sort by date (critical for time-series modeling)
    unified_df = unified_df.sort_values('date').reset_index(drop=True)
    
    print(f"\n✅ Unified dataset created:")
    print(f"   📊 Total matches: {len(unified_df)}")
    print(f"   📊 Total features: {len(unified_df.columns)}")
    if 'btts' in unified_df.columns:
        print(f"   📊 BTTS labels: {unified_df['btts'].notna().sum()}/{len(unified_df)} matches")
        print(f"   📊 BTTS rate: {unified_df['btts'].mean():.1%}")
    print(f"   📅 Date range: {unified_df['date'].min()} to {unified_df['date'].max()}")
    print(f"   📅 Min date: {unified_df['date'].min()}")
    print(f"   📅 Max date: {unified_df['date'].max()}")
    
    # Validate against expected 904-match universe
    if len(unified_df) >= 900 and len(unified_df) <= 920:
        print(f"   ✅ Match count in expected range (904 ± 16)")
    else:
        print(f"   ⚠️  WARNING: Match count {len(unified_df)} outside expected range (888-920)")
    
    # Save unified dataset
    output_file = RESEARCH_DATA_DIR / 'unified_matches.csv'
    unified_df.to_csv(output_file, index=False)
    print(f"   💾 Saved to: {output_file}")
    
    return unified_df
    print(f"   💾 Saved to: {output_file}")
    
    return unified_df


def load_unified_data(force_rebuild=False):
    """
    Load or build unified match dataset
    
    Args:
        force_rebuild: If True, rebuild from sources even if cached file exists
    
    Returns:
        pd.DataFrame with all features
    """
    cached_file = RESEARCH_DATA_DIR / 'unified_matches.csv'
    
    if cached_file.exists() and not force_rebuild:
        print(f"📥 Loading cached unified data from {cached_file}")
        df = pd.read_csv(cached_file)
        df['date'] = pd.to_datetime(df['date'])
        print(f"   ✅ Loaded {len(df)} matches with {len(df.columns)} features")
        return df
    
    # Build from sources
    return merge_all_sources()


def get_feature_summary(df):
    """
    Generate summary statistics for the dataset
    
    Args:
        df: Unified dataframe
    
    Returns:
        dict with summary statistics
    """
    summary = {
        'total_matches': len(df),
        'btts_rate': df['btts'].mean(),
        'date_range': (df['date'].min(), df['date'].max()),
        'seasons': df['season'].unique().tolist() if 'season' in df.columns else [],
        'total_features': len(df.columns),
        'missing_data': {
            col: df[col].isna().sum() / len(df)
            for col in df.columns
            if df[col].isna().sum() > 0
        },
        'event_columns': sorted(EVENT_COLUMNS & set(df.columns)),
        'prediction_safe_defaults': sorted(PREDICTION_SAFE_DEFAULTS & set(df.columns)),
    }
    
    # XG statistics if available
    if 'home_xg' in df.columns:
        summary['xg_stats'] = {
            'coverage': df['home_xg'].notna().sum() / len(df),
            'avg_home_xg': df['home_xg'].mean(),
            'avg_away_xg': df['away_xg'].mean(),
            'avg_total_xg': (df['home_xg'] + df['away_xg']).mean()
        }
    
    # FPL statistics if available
    if 'home_availability_pct' in df.columns:
        summary['fpl_stats'] = {
            'coverage': df['home_availability_pct'].notna().sum() / len(df),
            'avg_home_availability': df['home_availability_pct'].mean(),
            'avg_away_availability': df['away_availability_pct'].mean()
        }
    
    return summary


if __name__ == '__main__':
    print("=" * 80)
    print("BTTS RESEARCH PIPELINE - DATA LOADING")
    print("=" * 80)
    
    # Load unified data
    df = load_unified_data(force_rebuild=True)
    
    # Print summary
    summary = get_feature_summary(df)
    
    print("\n" + "=" * 80)
    print("DATASET SUMMARY")
    print("=" * 80)
    print(f"Total matches: {summary['total_matches']}")
    print(f"BTTS rate: {summary['btts_rate']:.1%}")
    print(f"Date range: {summary['date_range'][0]} to {summary['date_range'][1]}")
    print(f"Seasons: {', '.join(summary['seasons'])}")
    print(f"Total features: {summary['total_features']}")
    
    if 'xg_stats' in summary:
        print(f"\nxG Statistics:")
        print(f"  Coverage: {summary['xg_stats']['coverage']:.1%}")
        print(f"  Avg home xG: {summary['xg_stats']['avg_home_xg']:.2f}")
        print(f"  Avg away xG: {summary['xg_stats']['avg_away_xg']:.2f}")
        print(f"  Avg total xG: {summary['xg_stats']['avg_total_xg']:.2f}")
    
    if 'fpl_stats' in summary:
        print(f"\nFPL Statistics:")
        print(f"  Coverage: {summary['fpl_stats']['coverage']:.1%}")
        print(f"  Avg home availability: {summary['fpl_stats']['avg_home_availability']:.1f}%")
        print(f"  Avg away availability: {summary['fpl_stats']['avg_away_availability']:.1f}%")

    print("\nFeature Governance Preview:")
    print(f"  Event-based columns (should be excluded for modeling): {len(summary['event_columns'])}")
    print(f"  Prediction-safe defaults detected: {len(summary['prediction_safe_defaults'])}")
    
    if summary['missing_data']:
        print(f"\nMissing Data (top 10):")
        sorted_missing = sorted(summary['missing_data'].items(), 
                                 key=lambda x: x[1], reverse=True)[:10]
        for col, pct in sorted_missing:
            print(f"  {col}: {pct:.1%}")
    
    print("\n✅ Data loading complete!")


def get_btts_odds_coverage_summary():
    """
    Return human-readable summary of BTTS odds coverage.
    
    Useful for audit logging in experiment scripts to document
    label semantics and odds availability.
    
    Returns:
        str: Formatted summary text
    """
    df = load_unified_data()
    
    has_yes = df['btts_yes_odds'].notna().sum()
    has_no = df['btts_no_odds'].notna().sum()
    has_both = (df['btts_yes_odds'].notna() & df['btts_no_odds'].notna()).sum()
    total = len(df)
    
    summary = f"""
BTTS Odds Coverage:
  Total matches: {total}
  Both Yes & No odds: {has_both} ({has_both/total*100:.1f}%)
  Yes odds only: {has_yes - has_both}
  No odds only: {has_no - has_both}
  Neither: {total - has_both}
  
Label semantics: btts=1 (Yes), btts=0 (No)
Model predicts: P(BTTS = Yes)
Betting strategy: Bet 'Yes' when p >= threshold
"""
    return summary

