#!/usr/bin/env python3
"""
EPL Merge Debug Script - Steps 1-4
Inspect team names and dates from both files to understand merge failures
"""

import pandas as pd
from pathlib import Path
import sys

# Add current directory to path for imports
sys.path.append(str(Path(__file__).parent))
from team_name_utils import standardize_team_name

# Data paths
DATA_DIR = Path(__file__).parent.parent.parent.parent / "data" / "premier_league"
RESULTS_FILE = DATA_DIR / "historical_results.csv"
ODDS_FILE = DATA_DIR / "historical_completed_with_odds.csv"

print("=" * 80)
print("EPL MERGE DEBUG - STEP 1: Inspect Raw Data")
print("=" * 80)
print()

# Load data
print("Loading data files...")
results = pd.read_csv(RESULTS_FILE)
odds = pd.read_csv(ODDS_FILE)

print(f"✅ Results loaded: {len(results):,} rows")
print(f"✅ Odds loaded: {len(odds):,} rows")
print()

# ============================================================================
# DATE COVERAGE & SPOT CHECK
# ============================================================================

print("=" * 80)
print("DATE COVERAGE CHECK")
print("=" * 80)
print()

# Convert to datetime if not already
results['date_dt'] = pd.to_datetime(results['date'])
odds['date_dt'] = pd.to_datetime(odds['date'])

print("RESULTS date range:", results['date_dt'].min(), "to", results['date_dt'].max())
print("ODDS    date range:", odds['date_dt'].min(), "to", odds['date_dt'].max())
print()

# Check how many results exist on and around 2023-05-03
probe_date = pd.to_datetime("2023-05-03")

print("Checking results around 2023-05-03 (first date in odds):")
for delta in [-2, -1, 0, 1, 2]:
    d = probe_date + pd.Timedelta(days=delta)
    count = (results['date_dt'].dt.date == d.date()).sum()
    print(f"  Results on {d.date()}: {count} matches")

print()

# ============================================================================
# TEAM EXISTENCE CHECK
# ============================================================================

print("=" * 80)
print("TEAM EXISTENCE CHECK")
print("=" * 80)
print()

probe_home = standardize_team_name("mancity")
probe_away = standardize_team_name("westham")

# Normalize names in results
if 'home_norm' not in results.columns:
    results['home_norm'] = results['home'].apply(standardize_team_name)
    results['away_norm'] = results['away'].apply(standardize_team_name)

home_exists = (results['home_norm'] == probe_home).any() or (results['away_norm'] == probe_home).any()
away_exists = (results['home_norm'] == probe_away).any() or (results['away_norm'] == probe_away).any()

print(f"Does '{probe_home}' appear anywhere in results? {home_exists}")
print(f"Does '{probe_away}' appear anywhere in results? {away_exists}")

# Show a few rows where these teams appear
print()
print("Sample results rows with mancity or westham:")
sample_mask = (
    (results['home_norm'].isin([probe_home, probe_away])) |
    (results['away_norm'].isin([probe_home, probe_away]))
)
sample_df = results.loc[sample_mask, ['date', 'season', 'home', 'away', 'home_norm', 'away_norm']].head(20)
print(sample_df.to_string(index=False))
print()

# Check if the specific mancity vs westham match exists on 2023-05-03
print("Looking for specific match: mancity vs westham on 2023-05-03:")
specific_match = results[
    (results['home_norm'] == probe_home) &
    (results['away_norm'] == probe_away) &
    (results['date_dt'].dt.date == probe_date.date())
]
if len(specific_match) > 0:
    print(f"  ✅ FOUND! {len(specific_match)} match(es)")
    print(specific_match[['date', 'season', 'home', 'away', 'home_score', 'away_score']].to_string(index=False))
else:
    print(f"  ❌ NOT FOUND on that exact date")
    # Check nearby dates
    print(f"  Checking ±3 days:")
    for delta in range(-3, 4):
        d = probe_date + pd.Timedelta(days=delta)
        nearby = results[
            (results['home_norm'] == probe_home) &
            (results['away_norm'] == probe_away) &
            (results['date_dt'].dt.date == d.date())
        ]
        if len(nearby) > 0:
            print(f"    → Found on {d.date()}: {nearby.iloc[0]['home']} vs {nearby.iloc[0]['away']}")

print()

# ============================================================================
# TEAM NAMES INSPECTION
# ============================================================================

print("=" * 80)
print("TEAM NAMES ANALYSIS")
print("=" * 80)
print()

print("--- RESULTS FILE: Sample home team names (first 50 unique, sorted) ---")
results_home_teams = sorted(results['home'].unique())[:50]
for i, team in enumerate(results_home_teams, 1):
    print(f"{i:2d}. {team}")

print()
print("--- ODDS FILE: Sample home team names (first 50 unique, sorted) ---")
odds_home_teams = sorted(odds['home'].unique())[:50]
for i, team in enumerate(odds_home_teams, 1):
    print(f"{i:2d}. {team}")

print()
print("--- COMPARISON: Do any names match exactly? ---")
results_home_set = set(results['home'].unique())
odds_home_set = set(odds['home'].unique())
exact_matches = results_home_set & odds_home_set
print(f"Exact name matches: {len(exact_matches)}")
if exact_matches:
    print(f"Examples: {sorted(exact_matches)[:10]}")
else:
    print("❌ NO EXACT MATCHES - This is why merge is failing!")

print()
print("--- CHARACTER ANALYSIS ---")
print(f"Results home teams - sample formats:")
for team in results_home_teams[:5]:
    print(f"  '{team}' (len={len(team)}, has 'FC'={' FC' in team})")

print(f"\nOdds home teams - sample formats:")
for team in odds_home_teams[:5]:
    print(f"  '{team}' (len={len(team)}, lowercase={team.islower()})")

# ============================================================================
# DATE INSPECTION
# ============================================================================

print()
print("=" * 80)
print("DATE COLUMNS ANALYSIS")
print("=" * 80)
print()

print("--- RESULTS FILE: date column ---")
print(f"Column name: 'date'")
print(f"Data type: {results['date'].dtype}")
print(f"Sample values (first 10):")
for i, date_val in enumerate(results['date'].head(10), 1):
    print(f"  {i:2d}. {date_val}")
results['date_parsed'] = pd.to_datetime(results['date'])
print(f"\nDate range:")
print(f"  Min: {results['date_parsed'].min()}")
print(f"  Max: {results['date_parsed'].max()}")

print()
print("--- ODDS FILE: date column ---")
date_col = 'date' if 'date' in odds.columns else 'commence_time'
print(f"Column name: '{date_col}'")
print(f"Data type: {odds[date_col].dtype}")
print(f"Sample values (first 10):")
for i, date_val in enumerate(odds[date_col].head(10), 1):
    print(f"  {i:2d}. {date_val}")
odds['date_parsed'] = pd.to_datetime(odds[date_col])
print(f"\nDate range:")
print(f"  Min: {odds['date_parsed'].min()}")
print(f"  Max: {odds['date_parsed'].max()}")

print()
print("--- DATE OVERLAP ---")
# Strip timezone for comparison
results_date_range = (results['date_parsed'].min().tz_localize(None), results['date_parsed'].max().tz_localize(None))
odds_date_range = (odds['date_parsed'].min().tz_localize(None), odds['date_parsed'].max().tz_localize(None))
print(f"Results: {results_date_range[0].date()} to {results_date_range[1].date()}")
print(f"Odds:    {odds_date_range[0].date()} to {odds_date_range[1].date()}")

if odds_date_range[0] > results_date_range[0]:
    print(f"⚠️  Odds start {(odds_date_range[0] - results_date_range[0]).days} days after results")
if odds_date_range[1] < results_date_range[1]:
    print(f"⚠️  Odds end {(results_date_range[1] - odds_date_range[1]).days} days before results")

# ============================================================================
# SEASON INSPECTION
# ============================================================================

print()
print("=" * 80)
print("SEASON COLUMNS ANALYSIS")
print("=" * 80)
print()

if 'season' in results.columns:
    print("--- RESULTS FILE: seasons ---")
    season_counts = results['season'].value_counts().sort_index()
    for season, count in season_counts.items():
        print(f"  {season}: {count:,} matches")

print()
if 'season' in odds.columns:
    print("--- ODDS FILE: seasons ---")
    season_counts_odds = odds['season'].value_counts().sort_index()
    for season, count in season_counts_odds.items():
        print(f"  {season}: {count:,} matches")
    
    # Check overlap
    results_seasons = set(results['season'].unique()) if 'season' in results.columns else set()
    odds_seasons = set(odds['season'].unique())
    common_seasons = results_seasons & odds_seasons
    print(f"\n✅ Common seasons: {sorted(common_seasons)}")

# ============================================================================
# SUMMARY
# ============================================================================

print()
print("=" * 80)
print("STEP 1 SUMMARY & HYPOTHESIS")
print("=" * 80)
print()

print("KEY FINDINGS:")
print()
print("1. TEAM NAME MISMATCH:")
print(f"   - Results use long names: '{results_home_teams[0]}'")
print(f"   - Odds use short names: '{odds_home_teams[0]}'")
print(f"   - Exact matches: {len(exact_matches)} (expected: 0)")
print()
print("2. DATE FORMATS:")
print(f"   - Results dates: {results['date'].dtype}")
print(f"   - Odds dates: {odds[date_col].dtype}")
print(f"   - Both can be parsed to datetime ✅")
print()
print("3. COVERAGE:")
print(f"   - Results: {len(results):,} matches from {results_date_range[0].date()}")
print(f"   - Odds: {len(odds):,} matches from {odds_date_range[0].date()}")
print(f"   - Odds coverage starts ~{(odds_date_range[0] - results_date_range[0]).days} days later")
print()

print("HYPOTHESIS ON WHY MERGE FAILS:")
print("  ❌ Team names don't match at all:")
print(f"     Results: 'Manchester City FC', 'Arsenal FC', 'Brighton & Hove Albion FC'")
print(f"     Odds:    'mancity', 'arsenal', 'brighton'")
print()
print("  ✅ Dates CAN be normalized (both parseable to datetime)")
print("  ✅ Seasons overlap (both have 2023-24, 2024-25, etc.)")
print()
print("SOLUTION NEEDED:")
print("  Create a normalization function that maps:")
print("    'Manchester City FC' → 'mancity'")
print("    'Arsenal FC' → 'arsenal'")
print("    'Brighton & Hove Albion FC' → 'brighton'")
print("    etc. for all 20 EPL teams")
print()

print("=" * 80)
print("STEP 1 COMPLETE")
print("=" * 80)
print()

# ============================================================================
# STEP 2: TEST TEAM NAME NORMALIZATION
# ============================================================================

print("=" * 80)
print("STEP 2: Test Team Name Normalization")
print("=" * 80)
print()

print("Applying standardize_team_name() to both files...")
print()

# Normalize results
results['home_norm'] = results['home'].apply(standardize_team_name)
results['away_norm'] = results['away'].apply(standardize_team_name)

# Normalize odds
odds['home_norm'] = odds['home'].apply(standardize_team_name)
odds['away_norm'] = odds['away'].apply(standardize_team_name)

print("--- NORMALIZED TEAM NAMES: Results file ---")
print("Sample mappings (first 15):")
for i, (orig, norm) in enumerate(zip(results['home'].unique()[:15], 
                                       results['home'].apply(standardize_team_name).unique()[:15]), 1):
    print(f"{i:2d}. '{orig}' → '{norm}'")

print()
print("--- NORMALIZED TEAM NAMES: Odds file ---")
print("Sample mappings (first 15):")
for i, (orig, norm) in enumerate(zip(odds['home'].unique()[:15],
                                       odds['home'].apply(standardize_team_name).unique()[:15]), 1):
    print(f"{i:2d}. '{orig}' → '{norm}'")

print()
print("--- VERIFICATION: Do normalized names match? ---")
results_norm_set = set(results['home_norm'].unique()) | set(results['away_norm'].unique())
odds_norm_set = set(odds['home_norm'].unique()) | set(odds['away_norm'].unique())
common_teams = results_norm_set & odds_norm_set

print(f"✅ Unique teams in results (normalized): {len(results_norm_set)}")
print(f"✅ Unique teams in odds (normalized): {len(odds_norm_set)}")
print(f"✅ Common teams (should merge): {len(common_teams)}")
print(f"   {sorted(common_teams)}")

print()
print("--- FREQUENCY ANALYSIS: Top 20 teams (normalized) ---")
print("\nResults file:")
results_team_freq = pd.concat([results['home_norm'], results['away_norm']]).value_counts().head(20)
for team, count in results_team_freq.items():
    print(f"  {team:15s}: {count:3d} appearances")

print("\nOdds file:")
odds_team_freq = pd.concat([odds['home_norm'], odds['away_norm']]).value_counts().head(20)
for team, count in odds_team_freq.items():
    print(f"  {team:15s}: {count:3d} appearances")

print()
print("=" * 80)
print("STEP 2 COMPLETE")
print("=" * 80)
print()

# ============================================================================
# STEP 3: 3-KEY MERGE TEST (season, home_norm, away_norm)
# ============================================================================
# After discovering that results file has fake dates (YYYY-08-01 placeholders),
# we cannot merge on date. Instead, we merge on 3 keys only:
# (season, home_norm, away_norm)

print("=" * 80)
print("STEP 3 - 3-KEY MERGE TEST (season, home_norm, away_norm)")
print("=" * 80)
print()

print("BACKGROUND: Results file has fake dates (one YYYY-08-01 per season)")
print("Cannot merge on date - using 3 keys only: (season, home_norm, away_norm)")
print()

# Prepare separate date columns for display (to avoid suffix collision)
results_for_merge = results.copy()
odds_for_merge = odds.copy()

# Rename date columns before merge to avoid conflicts
results_for_merge = results_for_merge.rename(columns={'date': 'date_res'})
odds_for_merge = odds_for_merge.rename(columns={'date': 'date_odds'})

# Inner join on season + normalized team names (NO DATE)
merged = results_for_merge.merge(
    odds_for_merge,
    on=['season', 'home_norm', 'away_norm'],
    how='inner',
    suffixes=('_res', '_odds')
)

print(f"Total rows in results: {len(results):,}")
print(f"Total rows in odds:    {len(odds):,}")
print(f"Total rows in merged (3-key join): {len(merged):,}")
print()

# How many distinct matches by key
key_counts = merged.groupby(['season', 'home_norm', 'away_norm']).size()
dup_keys = key_counts[key_counts > 1]

print(f"Distinct (season, home_norm, away_norm) keys in merged: {len(key_counts):,}")
print(f"Keys with duplicates (>1 row): {len(dup_keys):,}")

if len(dup_keys) > 0:
    print()
    print("⚠️ Sample duplicate keys (teams that matched multiple times):")
    print("   This can happen if same teams play twice in a season (home/away)")
    print()
    for (season, home, away), count in dup_keys.head(10).items():
        print(f"   {season}: {home} vs {away} → {count} merged rows")

print()
print("--- SAMPLE MERGED ROWS ---")
print()

# Show a few merged rows to visually confirm correctness
cols_to_show = [
    'season',
    'date_res', 'home_res', 'away_res',
    'date_odds', 'home_odds', 'away_odds',
    'home_norm', 'away_norm',
    'btts_yes_odds', 'btts_no_odds'
]

# Add score columns if they exist
if 'home_score' in merged.columns:
    cols_to_show.insert(3, 'home_score')
    cols_to_show.insert(4, 'away_score')
    cols_to_show.insert(5, 'btts')

# Only show columns that actually exist
cols_to_show = [c for c in cols_to_show if c in merged.columns]

print("Showing first 20 merged rows:")
print(merged[cols_to_show].head(20).to_string(index=False))

print()
print("=" * 80)
if len(merged) > 0:
    coverage_pct = (len(merged) / len(odds)) * 100
    print(f"✅ STEP 3 COMPLETE - 3-key merge successful!")
    print(f"   Merged {len(merged):,} matches ({coverage_pct:.1f}% of odds file)")
else:
    print("❌ STEP 3 FAILED - No matches merged")
print("=" * 80)
print()

# ============================================================================
# STEP 4: SUMMARY SANITY CHECKS
# ============================================================================

print("=" * 80)
print("STEP 4 - SUMMARY SANITY CHECKS")
print("=" * 80)
print()

# 1) Coverage by season: how many merged matches per season?
print("--- MERGED MATCHES BY SEASON ---")
print()
season_counts = merged['season'].value_counts().sort_index()
print("Merged (results + odds):")
for season, count in season_counts.items():
    print(f"  {season}: {count:3d} matches")

print()
print("Odds-only (before merge):")
odds_season_counts = odds['season'].value_counts().sort_index()
for season, count in odds_season_counts.items():
    merged_count = season_counts.get(season, 0)
    coverage = (merged_count / count * 100) if count > 0 else 0
    print(f"  {season}: {count:3d} matches → {merged_count:3d} merged ({coverage:.1f}% coverage)")

print()

# 2) BTTS rate sanity check
if 'btts' in merged.columns:
    btts_merged = merged['btts'].mean()
    print(f"--- BTTS RATE IN MERGED DATA ---")
    print(f"Merged BTTS rate (using results.btts): {btts_merged:.3f}")
    print(f"Expected EPL BTTS rate: ~0.556 (55.6%)")
    
    diff = abs(btts_merged - 0.556)
    if diff < 0.05:
        print(f"✅ Within expected range (diff: {diff:.3f})")
    else:
        print(f"⚠️ Outside expected range (diff: {diff:.3f})")
    print()

# 3) Duplicate analysis
if len(dup_keys) > 0:
    print("--- DUPLICATE KEY ANALYSIS ---")
    print()
    print(f"Total duplicate keys: {len(dup_keys)}")
    print(f"Total duplicate rows: {dup_keys.sum()}")
    print()
    
    # Show distribution of duplicate counts
    dup_dist = dup_keys.value_counts().sort_index()
    print("Distribution of duplicate counts:")
    for count, freq in dup_dist.items():
        print(f"  {count} matches: {freq} team pairs")
    print()
    
    # Show a sample duplicate to understand the pattern
    if len(dup_keys) > 0:
        sample_key = dup_keys.index[0]
        season_sample, home_sample, away_sample = sample_key
        sample_rows = merged[
            (merged['season'] == season_sample) &
            (merged['home_norm'] == home_sample) &
            (merged['away_norm'] == away_sample)
        ]
        print(f"Sample duplicate: {season_sample} {home_sample} vs {away_sample}")
        print(f"  Found {len(sample_rows)} rows for this key")
        print()
        sample_cols = ['date_res', 'date_odds', 'home_res', 'away_res']
        sample_cols = [c for c in sample_cols if c in sample_rows.columns]
        print(sample_rows[sample_cols].to_string(index=False))

print()
print("=" * 80)
print("STEP 4 COMPLETE - Sanity checks finished")
print("=" * 80)

