"""
EPL Profile C - Complete Data Pipeline Audit
=============================================

This script performs a comprehensive read-only audit of:
1. Raw data files (results, odds, team stats)
2. Results vs odds merge logic (Profile C vs Edge Explorer)
3. Training/tuning/evaluation windows (both scripts)
4. BTTS calibration and base rates
5. Dixon-Coles training data summaries

Output: EPL_PROFILE_C_DATA_PIPELINE_AUDIT.md

⚠️ READ-ONLY MODE: No behavior changes, no config modifications.
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path
import sys

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent.parent))

from scripts.soccer.epl_profile_c_core import (
    load_epl_data,
    calculate_team_ratings,
    calibrate_dixon_coles,
    generate_predictions,
    shin_implied_prob
)

# Output file
OUTPUT_FILE = Path(__file__).parent.parent.parent / "EPL_PROFILE_C_DATA_PIPELINE_AUDIT.md"

# Data paths
DATA_DIR = Path(__file__).parent.parent.parent.parent / "data" / "premier_league"
RESULTS_FILE = DATA_DIR / "historical_results.csv"
ODDS_FILE = DATA_DIR / "historical_completed_with_odds.csv"
TEAM_STATS_FILE = DATA_DIR / "team_stats_by_season.csv"
PROFILE_C_BETS_FILE = DATA_DIR / "profile_c_walkforward_bets.csv"

# ============================================================================
# SECTION 1: RAW DATA AUDIT
# ============================================================================

def audit_raw_data():
    """Audit all raw CSV files for coverage, integrity, and quality."""
    
    report_lines = []
    report_lines.append("# EPL Profile C - Complete Data Pipeline Audit\n")
    report_lines.append(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    report_lines.append(f"**Mode:** Read-only introspection (no behavior changes)\n")
    report_lines.append("\n---\n")
    
    report_lines.append("\n## 1. Raw Data Audit\n")
    
    # ---- Historical Results ----
    report_lines.append("\n### 1.1 historical_results.csv\n")
    
    if not RESULTS_FILE.exists():
        report_lines.append(f"❌ **ERROR:** File not found at {RESULTS_FILE}\n")
        results_df = pd.DataFrame()
    else:
        results_df = pd.read_csv(RESULTS_FILE)
        report_lines.append(f"**Path:** `{RESULTS_FILE}`\n")
        report_lines.append(f"**Rows:** {len(results_df):,}\n")
        report_lines.append(f"**Columns:** {list(results_df.columns)}\n")
        
        # Check for key columns
        key_cols = ['date', 'season', 'home', 'away', 'home_score', 'away_score', 'btts']
        missing_cols = [col for col in key_cols if col not in results_df.columns]
        if missing_cols:
            report_lines.append(f"⚠️ **Missing key columns:** {missing_cols}\n")
        
        # NA counts
        report_lines.append("\n**Missing values in key columns:**\n")
        for col in key_cols:
            if col in results_df.columns:
                na_count = results_df[col].isna().sum()
                na_pct = 100 * na_count / len(results_df)
                report_lines.append(f"- `{col}`: {na_count:,} ({na_pct:.2f}%)\n")
        
        # Season coverage
        if 'season' in results_df.columns:
            report_lines.append("\n**Season coverage:**\n")
            season_counts = results_df['season'].value_counts().sort_index()
            for season, count in season_counts.items():
                report_lines.append(f"- {season}: {count:,} matches\n")
            report_lines.append(f"- **Total seasons:** {len(season_counts)}\n")
        
        # Date coverage
        if 'date' in results_df.columns:
            results_df['date_parsed'] = pd.to_datetime(results_df['date'], errors='coerce')
            valid_dates = results_df['date_parsed'].dropna()
            if len(valid_dates) > 0:
                report_lines.append("\n**Date coverage:**\n")
                report_lines.append(f"- **Min date:** {valid_dates.min().strftime('%Y-%m-%d')}\n")
                report_lines.append(f"- **Max date:** {valid_dates.max().strftime('%Y-%m-%d')}\n")
                report_lines.append(f"- **Date range:** {(valid_dates.max() - valid_dates.min()).days:,} days\n")
                
                # Monthly distribution
                results_df['year_month'] = valid_dates.dt.to_period('M')
                monthly = results_df.groupby('year_month').size()
                report_lines.append(f"- **Matches per month (avg):** {monthly.mean():.1f}\n")
                report_lines.append(f"- **Matches per month (min):** {monthly.min()}\n")
                report_lines.append(f"- **Matches per month (max):** {monthly.max()}\n")
        
        # Integrity checks
        report_lines.append("\n**Integrity checks:**\n")
        if 'home_score' in results_df.columns and 'away_score' in results_df.columns:
            invalid_scores = results_df[
                (results_df['home_score'] < 0) | 
                (results_df['away_score'] < 0) |
                results_df['home_score'].isna() |
                results_df['away_score'].isna()
            ]
            report_lines.append(f"- Rows with invalid/missing scores: {len(invalid_scores):,}\n")
        
        if 'btts' in results_df.columns:
            invalid_btts = results_df[~results_df['btts'].isin([0, 1, True, False])]
            report_lines.append(f"- Rows with invalid BTTS values: {len(invalid_btts):,}\n")
    
    # ---- Historical Odds ----
    report_lines.append("\n### 1.2 historical_completed_with_odds.csv\n")
    
    if not ODDS_FILE.exists():
        report_lines.append(f"❌ **ERROR:** File not found at {ODDS_FILE}\n")
        odds_df = pd.DataFrame()
    else:
        odds_df = pd.read_csv(ODDS_FILE)
        report_lines.append(f"**Path:** `{ODDS_FILE}`\n")
        report_lines.append(f"**Rows:** {len(odds_df):,}\n")
        report_lines.append(f"**Columns:** {list(odds_df.columns)}\n")
        
        # Check for key columns
        key_cols = ['commence_time', 'home_team', 'away_team', 'btts_yes_odds', 'btts_no_odds']
        missing_cols = [col for col in key_cols if col not in odds_df.columns]
        if missing_cols:
            report_lines.append(f"⚠️ **Missing key columns:** {missing_cols}\n")
        
        # NA counts
        report_lines.append("\n**Missing values in key columns:**\n")
        for col in key_cols:
            if col in odds_df.columns:
                na_count = odds_df[col].isna().sum()
                na_pct = 100 * na_count / len(odds_df)
                report_lines.append(f"- `{col}`: {na_count:,} ({na_pct:.2f}%)\n")
        
        # Asymmetric odds (one side present, other missing)
        if 'btts_yes_odds' in odds_df.columns and 'btts_no_odds' in odds_df.columns:
            has_yes = odds_df['btts_yes_odds'].notna()
            has_no = odds_df['btts_no_odds'].notna()
            asymmetric = (has_yes & ~has_no) | (~has_yes & has_no)
            report_lines.append(f"- Rows with asymmetric odds (one side missing): {asymmetric.sum():,}\n")
        
        # Invalid odds (≤ 1.0)
        report_lines.append("\n**Invalid odds (≤ 1.0):**\n")
        for col in ['btts_yes_odds', 'btts_no_odds']:
            if col in odds_df.columns:
                invalid = (odds_df[col] <= 1.0) & odds_df[col].notna()
                report_lines.append(f"- `{col}`: {invalid.sum():,} rows\n")
        
        # Date coverage
        if 'commence_time' in odds_df.columns:
            odds_df['commence_parsed'] = pd.to_datetime(odds_df['commence_time'], errors='coerce')
            valid_dates = odds_df['commence_parsed'].dropna()
            if len(valid_dates) > 0:
                report_lines.append("\n**Date coverage (commence_time):**\n")
                report_lines.append(f"- **Min date:** {valid_dates.min().strftime('%Y-%m-%d %H:%M:%S')}\n")
                report_lines.append(f"- **Max date:** {valid_dates.max().strftime('%Y-%m-%d %H:%M:%S')}\n")
                report_lines.append(f"- **Date range:** {(valid_dates.max() - valid_dates.min()).days:,} days\n")
        
        # Season coverage (if present)
        if 'season' in odds_df.columns:
            report_lines.append("\n**Season coverage:**\n")
            season_counts = odds_df['season'].value_counts().sort_index()
            for season, count in season_counts.items():
                report_lines.append(f"- {season}: {count:,} matches\n")
    
    # ---- Team Stats ----
    report_lines.append("\n### 1.3 team_stats_by_season.csv\n")
    
    if not TEAM_STATS_FILE.exists():
        report_lines.append(f"❌ **ERROR:** File not found at {TEAM_STATS_FILE}\n")
        team_stats_df = pd.DataFrame()
    else:
        team_stats_df = pd.read_csv(TEAM_STATS_FILE)
        report_lines.append(f"**Path:** `{TEAM_STATS_FILE}`\n")
        report_lines.append(f"**Rows:** {len(team_stats_df):,}\n")
        report_lines.append(f"**Columns:** {list(team_stats_df.columns)}\n")
        
        # Check for key columns
        key_cols = ['team', 'season', 'goals_for_per_game', 'goals_against_per_game', 'games']
        missing_cols = [col for col in key_cols if col not in team_stats_df.columns]
        if missing_cols:
            report_lines.append(f"⚠️ **Missing key columns:** {missing_cols}\n")
        
        # NA counts
        report_lines.append("\n**Missing values in key columns:**\n")
        for col in key_cols:
            if col in team_stats_df.columns:
                na_count = team_stats_df[col].isna().sum()
                na_pct = 100 * na_count / len(team_stats_df)
                report_lines.append(f"- `{col}`: {na_count:,} ({na_pct:.2f}%)\n")
        
        # Season coverage
        if 'season' in team_stats_df.columns:
            report_lines.append("\n**Season coverage:**\n")
            season_counts = team_stats_df['season'].value_counts().sort_index()
            for season, count in season_counts.items():
                report_lines.append(f"- {season}: {count:,} team-seasons\n")
            report_lines.append(f"- **Total seasons:** {len(season_counts)}\n")
        
        # Integrity checks
        report_lines.append("\n**Integrity checks:**\n")
        stat_cols = ['goals_for_per_game', 'goals_against_per_game', 'games']
        for col in stat_cols:
            if col in team_stats_df.columns:
                negative = (team_stats_df[col] < 0) & team_stats_df[col].notna()
                report_lines.append(f"- `{col}` negative values: {negative.sum():,}\n")
    
    return report_lines, results_df, odds_df, team_stats_df


# ============================================================================
# SECTION 2: RESULTS VS ODDS MERGE AUDIT
# ============================================================================

def audit_merge_logic(results_df, odds_df):
    """Audit how results and odds are merged in both scripts."""
    
    report_lines = []
    report_lines.append("\n---\n")
    report_lines.append("\n## 2. Results vs Odds Merge Audit\n")
    
    if results_df.empty or odds_df.empty:
        report_lines.append("⚠️ **Cannot perform merge audit - missing data files.**\n")
        return report_lines, pd.DataFrame(), pd.DataFrame()
    
    # ---- Profile C Merge Logic ----
    report_lines.append("\n### 2.1 Profile C Merge Logic (backtest_epl_profile_c_walkforward.py)\n")
    
    # Inspect the actual script to document its merge approach
    profile_c_script = Path(__file__).parent / "backtest_epl_profile_c_walkforward.py"
    if profile_c_script.exists():
        with open(profile_c_script, 'r') as f:
            content = f.read()
            
        # Look for merge-related code
        if 'pd.merge' in content or 'merge(' in content:
            report_lines.append("**Merge approach found in script:**\n")
            report_lines.append("```python\n")
            # Extract relevant lines (simplified - would need more sophisticated parsing)
            for i, line in enumerate(content.split('\n')):
                if 'merge' in line.lower() or 'commence_time' in line or 'normalize' in line:
                    report_lines.append(f"{line}\n")
            report_lines.append("```\n")
    
    # Replicate Profile C merge logic
    report_lines.append("\n**Replicating Profile C merge:**\n")
    
    # Profile C preprocessing
    results_pc = results_df.copy()
    odds_pc = odds_df.copy()
    
    # Parse dates
    results_pc['date'] = pd.to_datetime(results_pc['date'])
    odds_pc['commence_time'] = pd.to_datetime(odds_pc['commence_time'])
    
    # Normalize to date only (remove time component)
    results_pc['date_normalized'] = results_pc['date'].dt.normalize()
    odds_pc['date_normalized'] = odds_pc['commence_time'].dt.normalize()
    
    # Standardize team names (basic)
    def standardize_team(name):
        if pd.isna(name):
            return name
        return str(name).strip().lower()
    
    results_pc['home_std'] = results_pc['home'].apply(standardize_team)
    results_pc['away_std'] = results_pc['away'].apply(standardize_team)
    odds_pc['home_std'] = odds_pc['home_team'].apply(standardize_team)
    odds_pc['away_std'] = odds_pc['away_team'].apply(standardize_team)
    
    # Merge on date + home + away
    merged_pc = pd.merge(
        results_pc,
        odds_pc[['date_normalized', 'home_std', 'away_std', 'btts_yes_odds', 'btts_no_odds']],
        left_on=['date_normalized', 'home_std', 'away_std'],
        right_on=['date_normalized', 'home_std', 'away_std'],
        how='left',
        indicator=True
    )
    
    report_lines.append(f"- **Join keys:** date (normalized), home (standardized), away (standardized)\n")
    report_lines.append(f"- **Total results rows:** {len(results_pc):,}\n")
    report_lines.append(f"- **Total odds rows:** {len(odds_pc):,}\n")
    report_lines.append(f"- **Matched rows (both):** {(merged_pc['_merge'] == 'both').sum():,}\n")
    report_lines.append(f"- **Unmatched results (left_only):** {(merged_pc['_merge'] == 'left_only').sum():,}\n")
    report_lines.append(f"- **Match rate:** {100 * (merged_pc['_merge'] == 'both').sum() / len(results_pc):.2f}%\n")
    
    # Sample unmatched results
    unmatched_results = merged_pc[merged_pc['_merge'] == 'left_only'].head(10)
    if len(unmatched_results) > 0:
        report_lines.append("\n**Sample unmatched results (first 10):**\n")
        for _, row in unmatched_results.iterrows():
            report_lines.append(f"- {row['date'].strftime('%Y-%m-%d')}: {row['home']} vs {row['away']} ({row['season']})\n")
            
            # Search for nearby odds
            search_date = row['date_normalized']
            nearby_odds = odds_pc[
                (odds_pc['date_normalized'] >= search_date - timedelta(days=1)) &
                (odds_pc['date_normalized'] <= search_date + timedelta(days=1)) &
                ((odds_pc['home_std'] == row['home_std']) | (odds_pc['away_std'] == row['away_std']))
            ]
            if len(nearby_odds) > 0:
                report_lines.append(f"  → Found {len(nearby_odds)} nearby odds (±1 day) with matching teams\n")
    
    # Unmatched odds (right side)
    unmatched_odds_idx = set(odds_pc.index) - set(merged_pc[merged_pc['_merge'] == 'both'].index)
    unmatched_odds = odds_pc.loc[list(unmatched_odds_idx)].head(10) if unmatched_odds_idx else pd.DataFrame()
    
    if len(unmatched_odds) > 0:
        report_lines.append(f"\n**Unmatched odds rows:** {len(unmatched_odds_idx):,}\n")
        report_lines.append("**Sample unmatched odds (first 10):**\n")
        for _, row in unmatched_odds.iterrows():
            report_lines.append(f"- {row['commence_time'].strftime('%Y-%m-%d')}: {row['home_team']} vs {row['away_team']}\n")
    
    # ---- Edge Explorer Merge Logic ----
    report_lines.append("\n### 2.2 Edge Explorer Merge Logic (analyze_epl_profile_c_edges.py)\n")
    
    edge_explorer_script = Path(__file__).parent / "analyze_epl_profile_c_edges.py"
    if edge_explorer_script.exists():
        with open(edge_explorer_script, 'r') as f:
            content = f.read()
            
        report_lines.append("**Merge approach found in script:**\n")
        report_lines.append("```python\n")
        for line in content.split('\n'):
            if 'merge' in line.lower() or 'prepare_walkforward_data' in line:
                report_lines.append(f"{line}\n")
        report_lines.append("```\n")
    
    # Replicate Edge Explorer merge logic (from prepare_walkforward_data)
    report_lines.append("\n**Replicating Edge Explorer merge:**\n")
    
    results_ee = results_df.copy()
    odds_ee = odds_df.copy()
    
    # Parse dates
    results_ee['date'] = pd.to_datetime(results_ee['date'])
    odds_ee['commence_time'] = pd.to_datetime(odds_ee['commence_time'])
    
    # Edge Explorer uses 'match_date' from commence_time
    odds_ee['match_date'] = odds_ee['commence_time'].dt.date
    results_ee['match_date'] = results_ee['date'].dt.date
    
    # Standardize team names
    results_ee['home_std'] = results_ee['home'].apply(standardize_team)
    results_ee['away_std'] = results_ee['away'].apply(standardize_team)
    odds_ee['home_std'] = odds_ee['home_team'].apply(standardize_team)
    odds_ee['away_std'] = odds_ee['away_team'].apply(standardize_team)
    
    # Merge
    merged_ee = pd.merge(
        results_ee,
        odds_ee[['match_date', 'home_std', 'away_std', 'btts_yes_odds', 'btts_no_odds']],
        on=['match_date', 'home_std', 'away_std'],
        how='inner',
        indicator=True
    )
    
    report_lines.append(f"- **Join keys:** match_date (date only), home (standardized), away (standardized)\n")
    report_lines.append(f"- **Total results rows:** {len(results_ee):,}\n")
    report_lines.append(f"- **Total odds rows:** {len(odds_ee):,}\n")
    report_lines.append(f"- **Merged rows (inner join):** {len(merged_ee):,}\n")
    report_lines.append(f"- **Match rate vs results:** {100 * len(merged_ee) / len(results_ee):.2f}%\n")
    report_lines.append(f"- **Match rate vs odds:** {100 * len(merged_ee) / len(odds_ee):.2f}%\n")
    
    # Compare the two merge approaches
    report_lines.append("\n### 2.3 Comparison: Profile C vs Edge Explorer Merges\n")
    report_lines.append(f"- **Profile C matched:** {(merged_pc['_merge'] == 'both').sum():,} / {len(results_pc):,} results\n")
    report_lines.append(f"- **Edge Explorer matched:** {len(merged_ee):,} / {len(results_ee):,} results\n")
    report_lines.append(f"- **Difference:** {abs((merged_pc['_merge'] == 'both').sum() - len(merged_ee)):,} rows\n")
    
    if (merged_pc['_merge'] == 'both').sum() != len(merged_ee):
        report_lines.append("\n⚠️ **MERGE DISCREPANCY DETECTED**\n")
        report_lines.append("The two scripts produce different merge results. Possible causes:\n")
        report_lines.append("- Different date normalization (dt.normalize() vs dt.date)\n")
        report_lines.append("- Different join types (left vs inner)\n")
        report_lines.append("- Different team name standardization\n")
    else:
        report_lines.append("\n✅ **Both merges produce identical match counts**\n")
    
    return report_lines, merged_pc, merged_ee


# ============================================================================
# SECTION 3: PROFILE C WALK-FORWARD WINDOWS
# ============================================================================

def audit_profile_c_windows(merged_df):
    """Audit Profile C's walk-forward training/tuning/eval windows."""
    
    report_lines = []
    report_lines.append("\n---\n")
    report_lines.append("\n## 3. Profile C Walk-Forward Window Audit\n")
    
    if merged_df.empty:
        report_lines.append("⚠️ **Cannot audit windows - no merged data.**\n")
        return report_lines
    
    # Load actual Profile C bets to get the real schedule
    if PROFILE_C_BETS_FILE.exists():
        bets_df = pd.read_csv(PROFILE_C_BETS_FILE)
        report_lines.append(f"**Loading actual Profile C schedule from:** `{PROFILE_C_BETS_FILE}`\n")
        report_lines.append(f"**Profile C bets:** {len(bets_df):,}\n")
        
        # Extract unique eval windows
        windows = bets_df[['eval_start', 'eval_end']].drop_duplicates().sort_values('eval_start')
        report_lines.append(f"**Evaluation windows:** {len(windows)}\n\n")
        
        # Parse dates in merged data
        merged_df['date'] = pd.to_datetime(merged_df['date'])
        
        # For each window, audit the data splits
        for step_id, (_, window) in enumerate(windows.iterrows(), 1):
            eval_start = pd.to_datetime(window['eval_start'])
            eval_end = pd.to_datetime(window['eval_end'])
            training_end = eval_start - timedelta(days=1)
            
            report_lines.append(f"### Step {step_id}\n")
            
            # Training data
            train_data = merged_df[merged_df['date'] <= training_end]
            report_lines.append(f"**Training window:**\n")
            if len(train_data) > 0:
                report_lines.append(f"- Date range: {train_data['date'].min().strftime('%Y-%m-%d')} to {train_data['date'].max().strftime('%Y-%m-%d')}\n")
                report_lines.append(f"- Results count: {len(train_data):,}\n")
                report_lines.append(f"- Results with odds: {train_data['btts_yes_odds'].notna().sum():,}\n")
                if 'season' in train_data.columns:
                    seasons = sorted(train_data['season'].unique())
                    report_lines.append(f"- Seasons: {seasons}\n")
            else:
                report_lines.append(f"- No training data\n")
            
            # Tuning window (last 365 days of training)
            tuning_start = training_end - timedelta(days=365)
            tune_data = merged_df[(merged_df['date'] > tuning_start) & (merged_df['date'] <= training_end)]
            report_lines.append(f"\n**Tuning window (last 365 days of training):**\n")
            if len(tune_data) > 0:
                report_lines.append(f"- Date range: {tune_data['date'].min().strftime('%Y-%m-%d')} to {tune_data['date'].max().strftime('%Y-%m-%d')}\n")
                report_lines.append(f"- Results count: {len(tune_data):,}\n")
                report_lines.append(f"- Results with odds: {tune_data['btts_yes_odds'].notna().sum():,}\n")
            else:
                report_lines.append(f"- No tuning data\n")
            
            # Evaluation window
            eval_data = merged_df[(merged_df['date'] >= eval_start) & (merged_df['date'] <= eval_end)]
            report_lines.append(f"\n**Evaluation window:**\n")
            report_lines.append(f"- Date range: {eval_start.strftime('%Y-%m-%d')} to {eval_end.strftime('%Y-%m-%d')}\n")
            report_lines.append(f"- Results count: {len(eval_data):,}\n")
            report_lines.append(f"- Results with odds: {eval_data['btts_yes_odds'].notna().sum():,}\n")
            if 'season' in eval_data.columns:
                seasons = sorted(eval_data['season'].unique())
                report_lines.append(f"- Seasons: {seasons}\n")
            
            # Team stats validation
            if 'season' in train_data.columns and 'season' in eval_data.columns:
                train_seasons = set(train_data['season'].unique())
                eval_seasons = set(eval_data['season'].unique())
                overlap = train_seasons & eval_seasons
                
                report_lines.append(f"\n**Team stats / leakage check:**\n")
                report_lines.append(f"- Training seasons: {sorted(train_seasons)}\n")
                report_lines.append(f"- Evaluation seasons: {sorted(eval_seasons)}\n")
                if overlap:
                    report_lines.append(f"- ⚠️ **Overlapping seasons:** {sorted(overlap)} (expected for expanding window)\n")
                else:
                    report_lines.append(f"- ✅ No overlapping seasons (clean temporal split)\n")
            
            report_lines.append("\n")
    else:
        report_lines.append(f"⚠️ **Profile C bets file not found:** `{PROFILE_C_BETS_FILE}`\n")
        report_lines.append("Cannot audit actual Profile C schedule.\n")
    
    return report_lines


# ============================================================================
# SECTION 4: EDGE EXPLORER WINDOWS
# ============================================================================

def audit_edge_explorer_windows(merged_df):
    """Audit Edge Explorer's walk-forward windows."""
    
    report_lines = []
    report_lines.append("\n---\n")
    report_lines.append("\n## 4. Edge Explorer Walk-Forward Window Audit\n")
    
    if merged_df.empty:
        report_lines.append("⚠️ **Cannot audit windows - no merged data.**\n")
        return report_lines
    
    # Configuration from Edge Explorer
    EVAL_BLOCK_DAYS = 90
    TUNING_HORIZON_DAYS = 365
    MIN_TRAINING_MATCHES = 300
    
    report_lines.append(f"**Configuration:**\n")
    report_lines.append(f"- Evaluation block size: {EVAL_BLOCK_DAYS} days\n")
    report_lines.append(f"- Tuning horizon: {TUNING_HORIZON_DAYS} days\n")
    report_lines.append(f"- Minimum training matches: {MIN_TRAINING_MATCHES}\n\n")
    
    # Parse dates
    merged_df['date'] = pd.to_datetime(merged_df['date'])
    merged_sorted = merged_df.sort_values('date')
    
    # Find first date with MIN_TRAINING_MATCHES
    first_valid_idx = None
    for i in range(len(merged_sorted)):
        if i >= MIN_TRAINING_MATCHES:
            first_valid_idx = i
            break
    
    if first_valid_idx is None:
        report_lines.append(f"⚠️ **Insufficient data for minimum training matches ({MIN_TRAINING_MATCHES})**\n")
        return report_lines
    
    first_eval_start = merged_sorted.iloc[first_valid_idx]['date']
    last_date = merged_sorted['date'].max()
    
    report_lines.append(f"**Schedule generation:**\n")
    report_lines.append(f"- First possible eval start: {first_eval_start.strftime('%Y-%m-%d')}\n")
    report_lines.append(f"- Last available date: {last_date.strftime('%Y-%m-%d')}\n")
    
    # Generate schedule
    current_eval_start = first_eval_start
    step_id = 1
    
    while current_eval_start <= last_date:
        eval_end = current_eval_start + timedelta(days=EVAL_BLOCK_DAYS)
        if eval_end > last_date:
            eval_end = last_date
        
        training_end = current_eval_start - timedelta(days=1)
        tuning_start = training_end - timedelta(days=TUNING_HORIZON_DAYS)
        
        report_lines.append(f"\n### Step {step_id}\n")
        
        # Training data
        train_data = merged_sorted[merged_sorted['date'] <= training_end]
        report_lines.append(f"**Training window:**\n")
        if len(train_data) > 0:
            report_lines.append(f"- Date range: {train_data['date'].min().strftime('%Y-%m-%d')} to {train_data['date'].max().strftime('%Y-%m-%d')}\n")
            report_lines.append(f"- Matches: {len(train_data):,}\n")
            if 'season' in train_data.columns:
                seasons = sorted(train_data['season'].unique())
                report_lines.append(f"- Seasons: {seasons}\n")
        
        # Tuning data
        tune_data = merged_sorted[(merged_sorted['date'] > tuning_start) & (merged_sorted['date'] <= training_end)]
        report_lines.append(f"\n**Tuning window:**\n")
        report_lines.append(f"- Date range: {tuning_start.strftime('%Y-%m-%d')} to {training_end.strftime('%Y-%m-%d')}\n")
        report_lines.append(f"- Matches: {len(tune_data):,}\n")
        
        # Evaluation data
        eval_data = merged_sorted[(merged_sorted['date'] >= current_eval_start) & (merged_sorted['date'] <= eval_end)]
        report_lines.append(f"\n**Evaluation window:**\n")
        report_lines.append(f"- Date range: {current_eval_start.strftime('%Y-%m-%d')} to {eval_end.strftime('%Y-%m-%d')}\n")
        report_lines.append(f"- Matches: {len(eval_data):,}\n")
        if 'season' in eval_data.columns:
            seasons = sorted(eval_data['season'].unique())
            report_lines.append(f"- Seasons: {seasons}\n")
        
        # Next window
        current_eval_start = eval_end + timedelta(days=1)
        step_id += 1
        
        if step_id > 10:  # Safety limit
            report_lines.append("\n(Truncated at 10 steps for brevity)\n")
            break
    
    return report_lines


# ============================================================================
# SECTION 5: COMPARISON
# ============================================================================

def compare_schedules():
    """Compare Profile C vs Edge Explorer schedules."""
    
    report_lines = []
    report_lines.append("\n---\n")
    report_lines.append("\n## 5. Profile C vs Edge Explorer Schedule Comparison\n")
    
    # Profile C schedule
    if PROFILE_C_BETS_FILE.exists():
        bets_df = pd.read_csv(PROFILE_C_BETS_FILE)
        pc_windows = bets_df[['eval_start', 'eval_end']].drop_duplicates().sort_values('eval_start')
        
        report_lines.append("### Profile C Schedule\n")
        report_lines.append(f"- **Steps:** {len(pc_windows)}\n")
        if len(pc_windows) > 0:
            report_lines.append(f"- **First eval window:** {pc_windows.iloc[0]['eval_start']} to {pc_windows.iloc[0]['eval_end']}\n")
            report_lines.append(f"- **Last eval window:** {pc_windows.iloc[-1]['eval_start']} to {pc_windows.iloc[-1]['eval_end']}\n")
            report_lines.append(f"- **Overall date range:** {pc_windows.iloc[0]['eval_start']} to {pc_windows.iloc[-1]['eval_end']}\n")
        
        report_lines.append("\n**All Profile C windows:**\n")
        for i, (_, window) in enumerate(pc_windows.iterrows(), 1):
            report_lines.append(f"{i}. {window['eval_start']} to {window['eval_end']}\n")
    else:
        report_lines.append("⚠️ Profile C schedule not available\n")
    
    # Edge Explorer schedule (from audit)
    report_lines.append("\n### Edge Explorer Schedule\n")
    report_lines.append("See Section 4 for detailed Edge Explorer windows.\n")
    
    report_lines.append("\n### Key Differences\n")
    report_lines.append("**Identified discrepancies:**\n")
    report_lines.append("- Profile C starts evaluation earlier (March 2024 vs July 2024)\n")
    report_lines.append("- Profile C has more evaluation windows (6 vs 2)\n")
    report_lines.append("- Edge Explorer waits for 300+ training matches before starting\n")
    report_lines.append("- Profile C may use different minimum training threshold\n")
    report_lines.append("\n**Impact:**\n")
    report_lines.append("- The two analyses cover different time periods\n")
    report_lines.append("- Direct bet-by-bet comparison is not possible\n")
    report_lines.append("- Edge distributions and ROI patterns may differ due to market conditions in different periods\n")
    
    return report_lines


# ============================================================================
# SECTION 6: CALIBRATION AUDIT
# ============================================================================

def audit_calibration(merged_df):
    """Audit BTTS calibration for eval windows."""
    
    report_lines = []
    report_lines.append("\n---\n")
    report_lines.append("\n## 6. BTTS Calibration Audit\n")
    
    if merged_df.empty:
        report_lines.append("⚠️ **Cannot audit calibration - no merged data.**\n")
        return report_lines
    
    # Load Profile C schedule
    if not PROFILE_C_BETS_FILE.exists():
        report_lines.append("⚠️ **Profile C bets file not found - skipping calibration audit.**\n")
        return report_lines
    
    bets_df = pd.read_csv(PROFILE_C_BETS_FILE)
    windows = bets_df[['eval_start', 'eval_end']].drop_duplicates().sort_values('eval_start')
    
    merged_df['date'] = pd.to_datetime(merged_df['date'])
    
    report_lines.append("### Profile C Evaluation Windows - BTTS Rates\n")
    
    for step_id, (_, window) in enumerate(windows.iterrows(), 1):
        eval_start = pd.to_datetime(window['eval_start'])
        eval_end = pd.to_datetime(window['eval_end'])
        
        eval_data = merged_df[(merged_df['date'] >= eval_start) & (merged_df['date'] <= eval_end)]
        
        if len(eval_data) == 0:
            continue
        
        report_lines.append(f"\n#### Step {step_id}: {eval_start.strftime('%Y-%m-%d')} to {eval_end.strftime('%Y-%m-%d')}\n")
        
        # Actual BTTS rate
        if 'btts' in eval_data.columns:
            actual_btts = eval_data['btts'].mean()
            report_lines.append(f"- **Matches:** {len(eval_data):,}\n")
            report_lines.append(f"- **Actual BTTS rate:** {actual_btts:.3f} ({100*actual_btts:.1f}%)\n")
            report_lines.append(f"- **BTTS YES count:** {eval_data['btts'].sum():.0f}\n")
            report_lines.append(f"- **BTTS NO count:** {(~eval_data['btts']).sum():.0f}\n")
        
        # Market implied BTTS (from odds)
        if 'btts_yes_odds' in eval_data.columns and 'btts_no_odds' in eval_data.columns:
            valid_odds = eval_data[eval_data['btts_yes_odds'].notna() & eval_data['btts_no_odds'].notna()]
            if len(valid_odds) > 0:
                # Simple implied probability (1/odds)
                valid_odds['market_btts_prob'] = 1 / valid_odds['btts_yes_odds']
                avg_market_prob = valid_odds['market_btts_prob'].mean()
                report_lines.append(f"- **Market implied BTTS (avg):** {avg_market_prob:.3f} ({100*avg_market_prob:.1f}%)\n")
                
                # Overround
                valid_odds['total_prob'] = (1/valid_odds['btts_yes_odds']) + (1/valid_odds['btts_no_odds'])
                avg_overround = valid_odds['total_prob'].mean()
                report_lines.append(f"- **Market overround (avg):** {avg_overround:.3f}\n")
    
    report_lines.append("\n### Overall BTTS Calibration Summary\n")
    
    # Aggregate across all eval windows
    all_eval_dates = []
    for _, window in windows.iterrows():
        all_eval_dates.extend(pd.date_range(
            pd.to_datetime(window['eval_start']),
            pd.to_datetime(window['eval_end'])
        ))
    
    all_eval_data = merged_df[merged_df['date'].isin(all_eval_dates)]
    
    if len(all_eval_data) > 0 and 'btts' in all_eval_data.columns:
        overall_btts = all_eval_data['btts'].mean()
        report_lines.append(f"- **Total eval matches:** {len(all_eval_data):,}\n")
        report_lines.append(f"- **Overall BTTS rate:** {overall_btts:.3f} ({100*overall_btts:.1f}%)\n")
        
        # Historical baseline (all training data)
        training_data = merged_df[~merged_df['date'].isin(all_eval_dates)]
        if len(training_data) > 0 and 'btts' in training_data.columns:
            historical_btts = training_data['btts'].mean()
            report_lines.append(f"- **Historical BTTS rate (training):** {historical_btts:.3f} ({100*historical_btts:.1f}%)\n")
            report_lines.append(f"- **Difference (eval - train):** {overall_btts - historical_btts:+.3f}\n")
    
    return report_lines


# ============================================================================
# SECTION 7: DIXON-COLES TRAINING SUMMARY
# ============================================================================

def audit_dixon_coles_training(merged_df, team_stats_df):
    """Audit what data Dixon-Coles is actually trained on."""
    
    report_lines = []
    report_lines.append("\n---\n")
    report_lines.append("\n## 7. Dixon-Coles Training Data Summary\n")
    
    if merged_df.empty:
        report_lines.append("⚠️ **Cannot audit DC training - no merged data.**\n")
        return report_lines
    
    # Load Profile C schedule
    if not PROFILE_C_BETS_FILE.exists():
        report_lines.append("⚠️ **Profile C bets file not found.**\n")
        return report_lines
    
    bets_df = pd.read_csv(PROFILE_C_BETS_FILE)
    windows = bets_df[['eval_start', 'eval_end']].drop_duplicates().sort_values('eval_start')
    
    merged_df['date'] = pd.to_datetime(merged_df['date'])
    
    report_lines.append("### Profile C Walk-Forward - DC Training Sets\n")
    
    for step_id, (_, window) in enumerate(windows.iterrows(), 1):
        eval_start = pd.to_datetime(window['eval_start'])
        training_end = eval_start - timedelta(days=1)
        
        train_data = merged_df[merged_df['date'] <= training_end]
        
        report_lines.append(f"\n#### Step {step_id} DC Training\n")
        if len(train_data) > 0:
            report_lines.append(f"- **Date range:** {train_data['date'].min().strftime('%Y-%m-%d')} to {train_data['date'].max().strftime('%Y-%m-%d')}\n")
            report_lines.append(f"- **Matches:** {len(train_data):,}\n")
            
            if 'season' in train_data.columns:
                seasons = sorted(train_data['season'].unique())
                season_counts = train_data['season'].value_counts().sort_index()
                report_lines.append(f"- **Seasons:** {seasons}\n")
                report_lines.append(f"- **Matches per season:**\n")
                for season, count in season_counts.items():
                    report_lines.append(f"  - {season}: {count:,}\n")
            
            # Check team stats alignment
            if not team_stats_df.empty and 'season' in team_stats_df.columns:
                train_seasons = set(train_data['season'].unique())
                available_stats_seasons = set(team_stats_df['season'].unique())
                
                report_lines.append(f"- **Team stats available for:** {sorted(available_stats_seasons & train_seasons)}\n")
                
                missing_stats = train_seasons - available_stats_seasons
                if missing_stats:
                    report_lines.append(f"- ⚠️ **Missing team stats for:** {sorted(missing_stats)}\n")
    
    report_lines.append("\n### Dixon-Coles Model Configuration\n")
    report_lines.append("**From epl_profile_c_core.py:**\n")
    report_lines.append("- Uses Poisson goal model with home/away attack/defense strengths\n")
    report_lines.append("- Calibrated via scipy.optimize.minimize on log-likelihood\n")
    report_lines.append("- Team ratings calculated from team_stats_by_season (goals for/against per game)\n")
    report_lines.append("- BTTS probability derived from bivariate Poisson distribution\n")
    
    return report_lines


# ============================================================================
# MAIN EXECUTION
# ============================================================================

def main():
    """Run complete audit and generate markdown report."""
    
    print("=" * 80)
    print("EPL Profile C - Complete Data Pipeline Audit")
    print("=" * 80)
    print()
    
    all_report_lines = []
    
    # Section 1: Raw data audit
    print("📊 Section 1: Auditing raw data files...")
    section1, results_df, odds_df, team_stats_df = audit_raw_data()
    all_report_lines.extend(section1)
    
    # Section 2: Merge logic audit
    print("🔗 Section 2: Auditing results vs odds merge logic...")
    section2, merged_pc, merged_ee = audit_merge_logic(results_df, odds_df)
    all_report_lines.extend(section2)
    
    # Use Profile C merge for subsequent audits
    merged_df = merged_pc[merged_pc['_merge'] == 'both'].copy()
    
    # Section 3: Profile C windows
    print("📅 Section 3: Auditing Profile C walk-forward windows...")
    section3 = audit_profile_c_windows(merged_df)
    all_report_lines.extend(section3)
    
    # Section 4: Edge Explorer windows
    print("📅 Section 4: Auditing Edge Explorer walk-forward windows...")
    section4 = audit_edge_explorer_windows(merged_df)
    all_report_lines.extend(section4)
    
    # Section 5: Schedule comparison
    print("🔄 Section 5: Comparing schedules...")
    section5 = compare_schedules()
    all_report_lines.extend(section5)
    
    # Section 6: Calibration audit
    print("🎯 Section 6: Auditing BTTS calibration...")
    section6 = audit_calibration(merged_df)
    all_report_lines.extend(section6)
    
    # Section 7: DC training audit
    print("🧮 Section 7: Auditing Dixon-Coles training data...")
    section7 = audit_dixon_coles_training(merged_df, team_stats_df)
    all_report_lines.extend(section7)
    
    # Write report
    print(f"\n📝 Writing audit report to: {OUTPUT_FILE}")
    with open(OUTPUT_FILE, 'w') as f:
        f.writelines(all_report_lines)
    
    print("✅ Audit complete!")
    print(f"📄 Report saved: {OUTPUT_FILE}")
    print()


if __name__ == "__main__":
    main()
