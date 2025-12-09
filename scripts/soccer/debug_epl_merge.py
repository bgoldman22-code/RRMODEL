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
# STEP 3: NORMALIZE DATES AND PROVE A SINGLE MATCH MERGES
# ============================================================================

print("=" * 80)
print("STEP 3: Normalize Dates and Test Single Match Merge")
print("=" * 80)
print()

print("Normalizing dates to date-only format...")

# Normalize dates (strip time, timezone)
results['match_date'] = pd.to_datetime(results['date']).dt.date
odds['match_date'] = pd.to_datetime(odds['date']).dt.date

print(f"✅ Results match_date range: {results['match_date'].min()} to {results['match_date'].max()}")
print(f"✅ Odds match_date range: {odds['match_date'].min()} to {odds['match_date'].max()}")
print()

# Test broader range of candidates to find overlapping matches
print("--- TESTING CANDIDATE MATCHES (from odds file) ---")
print()

golden_odds = None
golden_result = None

# Try first 100 matches to find overlap
candidates = odds.head(100)
for i, (idx, odds_row) in enumerate(candidates.iterrows(), 1):
    # Search for matching result
    matching_results = results[
        (results['home_norm'] == odds_row['home_norm']) &
        (results['away_norm'] == odds_row['away_norm']) &
        (results['match_date'] == odds_row['match_date'])
    ]
    
    if len(matching_results) > 0:
        result_row = matching_results.iloc[0]
        print(f"✅ GOLDEN MATCH FOUND (candidate #{i})!")
        print(f"  Odds row: {odds_row['match_date']} | {odds_row['home']} vs {odds_row['away']}")
        print(f"  Results row: {result_row['date']} | {result_row['home']} vs {result_row['away']}")
        print(f"  Normalized: {odds_row['home_norm']} vs {odds_row['away_norm']}")
        print(f"  Score: {result_row['home_score']}-{result_row['away_score']} | BTTS: {result_row['btts']}")
        print(f"  Odds: BTTS YES={odds_row['btts_yes_odds']:.2f}, NO={odds_row['btts_no_odds']:.2f}")
        print()
        
        # Save first match as golden
        golden_odds = odds_row
        golden_result = result_row
        break

if golden_odds is None:
    print("❌ No overlapping matches found in first 100 odds rows")
    print("   Checking date overlap...")
    print()
    
    # Analyze date overlap
    results_dates = set(results['match_date'])
    odds_dates = set(odds['match_date'])
    common_dates = results_dates & odds_dates
    
    print(f"   Results date range: {min(results_dates)} to {max(results_dates)}")
    print(f"   Odds date range: {min(odds_dates)} to {max(odds_dates)}")
    print(f"   Common dates: {len(common_dates)}")
    
    if len(common_dates) > 0:
        print(f"   Common date range: {min(common_dates)} to {max(common_dates)}")
        print()
        
        # Try to find a match on a common date (middle of range)
        common_date = sorted(common_dates)[len(common_dates)//2]
        print(f"   Testing matches on common date: {common_date}")
        
        results_on_date = results[results['match_date'] == common_date]
        odds_on_date = odds[odds['match_date'] == common_date]
        
        print(f"     Results on this date: {len(results_on_date)} matches")
        print(f"     Odds on this date: {len(odds_on_date)} matches")
        
        # Try to find aligned match
        for _, odds_row in odds_on_date.iterrows():
            matching = results_on_date[
                (results_on_date['home_norm'] == odds_row['home_norm']) &
                (results_on_date['away_norm'] == odds_row['away_norm'])
            ]
            if len(matching) > 0:
                golden_odds = odds_row
                golden_result = matching.iloc[0]
                print(f"     ✅ Found match: {golden_odds['home_norm']} vs {golden_odds['away_norm']}")
                break
        print()

if golden_odds is not None:
    print()
    print("--- GOLDEN MATCH DETAILS ---")
    print()
    print("Join keys used:")
    print("  - season (string)")
    print("  - match_date (date object)")
    print("  - home_norm (string)")
    print("  - away_norm (string)")
    print()
    
    print("Golden match - ODDS side:")
    print(f"  Date: {golden_odds['match_date']}")
    print(f"  Season: {golden_odds['season']}")
    print(f"  Home (orig): {golden_odds['home']} → (norm): {golden_odds['home_norm']}")
    print(f"  Away (orig): {golden_odds['away']} → (norm): {golden_odds['away_norm']}")
    print(f"  BTTS YES odds: {golden_odds['btts_yes_odds']}")
    print(f"  BTTS NO odds: {golden_odds['btts_no_odds']}")
    print()
    
    print("Golden match - RESULTS side:")
    print(f"  Date: {golden_result['match_date']}")
    print(f"  Season: {golden_result['season']}")
    print(f"  Home (orig): {golden_result['home']} → (norm): {golden_result['home_norm']}")
    print(f"  Away (orig): {golden_result['away']} → (norm): {golden_result['away_norm']}")
    print(f"  Score: {golden_result['home_score']}-{golden_result['away_score']}")
    print(f"  BTTS: {golden_result['btts']}")
    print()
else:
    print("⚠️ Could not find overlapping matches - date ranges may not overlap")
    print()

# Mini merge test
print("--- MINI MERGE TEST (5 matches from each file) ---")
print()

results_subset = results.head(100)
odds_subset = odds.head(100)

merged_mini = results_subset.merge(
    odds_subset,
    on=['season', 'match_date', 'home_norm', 'away_norm'],
    how='inner',
    suffixes=('_res', '_odds')
)

print(f"Results subset: {len(results_subset)} rows")
print(f"Odds subset: {len(odds_subset)} rows")
print(f"✅ Merged rows (inner join): {len(merged_mini)}")
print()

if len(merged_mini) > 0:
    print("✅ Merge successful!")
    print()
    print("Sample merged row (first match):")
    first_merged = merged_mini.iloc[0]
    print(f"  Date: {first_merged['match_date']}")
    print(f"  Season: {first_merged['season']}")
    print(f"  Home: {first_merged['home_res']} (results) | {first_merged['home_odds']} (odds)")
    print(f"  Away: {first_merged['away_res']} (results) | {first_merged['away_odds']} (odds)")
    print(f"  Home (norm): {first_merged['home_norm']}")
    print(f"  Away (norm): {first_merged['away_norm']}")
    print(f"  Score: {first_merged['home_score']}-{first_merged['away_score']}")
    print(f"  BTTS: {first_merged['btts']}")
    print(f"  BTTS YES odds: {first_merged['btts_yes_odds']}")
    print(f"  BTTS NO odds: {first_merged['btts_no_odds']}")
else:
    print("⚠️ No matches in first 100 rows of each file")
    print("   Date ranges likely don't overlap - trying full merge in Step 4...")

print()
print("=" * 80)
if len(merged_mini) > 0:
    print("✅ STEP 3 COMPLETE - Merge logic verified with normalized team names")
else:
    print("⚠️ STEP 3 NEEDS FULL DATASET TEST - Move to Step 4 for full merge")
print("=" * 80)
