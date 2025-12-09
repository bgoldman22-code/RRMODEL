#!/usr/bin/env python3
"""
Clean EPL data files to fix parsing issues from openfootball
Removes time prefixes and score suffixes from team names
Also fixes malformed rows where 'home' contains "Team1 v Team2"
"""

import pandas as pd
import re
from pathlib import Path
import numpy as np

def clean_team_name(name):
    """Remove time prefix and score suffix from team name"""
    # Remove time prefix (e.g., '20.00  ')
    name = re.sub(r'^[\d:.]+\s+', '', str(name))
    # Remove score suffix (e.g., '(1-0)  ')
    name = re.sub(r'\s*\(\d+-\d+\)\s*', '', name)
    return name.strip()

def split_match_string(match_str):
    """
    Split malformed match strings like "Southampton FC v Brighton & Hove Albion FC"
    into home and away teams
    """
    if pd.isna(match_str) or ' v ' not in str(match_str):
        return None, None
    
    # Split on ' v '
    parts = str(match_str).split(' v ')
    if len(parts) != 2:
        return None, None
    
    home = clean_team_name(parts[0])
    away = clean_team_name(parts[1])
    return home, away

def main():
    data_dir = Path('data/premier_league')
    
    # 1. Clean historical_results.csv
    print("Cleaning historical_results.csv...")
    results_path = data_dir / 'historical_results.csv'
    df = pd.read_csv(results_path)
    
    print(f"  Original shape: {df.shape}")
    print(f"  Sample home (before): {df['home'].iloc[0]}")
    
    # First, clean normal entries
    df['home'] = df['home'].apply(clean_team_name)
    df['away'] = df['away'].apply(clean_team_name)
    
    # Find malformed rows (where away is NaN and home contains " v ")
    malformed = df['away'].isna() & df['home'].str.contains(' v ', na=False)
    print(f"  Found {malformed.sum()} malformed rows with 'Team1 v Team2' format")
    
    # Fix malformed rows
    for idx in df[malformed].index:
        home, away = split_match_string(df.loc[idx, 'home'])
        if home and away:
            df.loc[idx, 'home'] = home
            df.loc[idx, 'away'] = away
            print(f"    Fixed row {idx}: {home} vs {away}")
    
    # Remove any remaining rows with NaN away teams
    before = len(df)
    df = df.dropna(subset=['home', 'away'])
    after = len(df)
    if before != after:
        print(f"  Removed {before - after} rows with remaining NaN values")
    
    print(f"  Sample home (after): {df['home'].iloc[0]}")
    print(f"  Sample away (after): {df['away'].iloc[0]}")
    print(f"  Unique teams: {pd.concat([df['home'], df['away']]).nunique()}")
    print(f"  Final shape: {df.shape}")
    
    df.to_csv(results_path, index=False)
    print(f"✓ Saved cleaned results to {results_path}")
    
    # 2. Clean team_stats_by_season.csv
    print("\nCleaning team_stats_by_season.csv...")
    stats_path = data_dir / 'team_stats_by_season.csv'
    stats = pd.read_csv(stats_path)
    
    print(f"  Original shape: {stats.shape}")
    print(f"  Sample team (before): {stats['team'].iloc[0]}")
    
    stats['team'] = stats['team'].apply(clean_team_name)
    
    print(f"  Sample team (after): {stats['team'].iloc[0]}")
    print(f"  Unique teams: {stats['team'].nunique()}")
    
    stats.to_csv(stats_path, index=False)
    print(f"✓ Saved cleaned stats to {stats_path}")
    
    # 3. Check odds file (should already be clean)
    print("\nChecking historical_completed_with_odds.csv...")
    odds_path = data_dir / 'historical_completed_with_odds.csv'
    odds = pd.read_csv(odds_path)
    
    print(f"  Shape: {odds.shape}")
    print(f"  Sample home: {odds['home'].iloc[0]}")
    print(f"  Sample away: {odds['away'].iloc[0]}")
    print(f"  Unique teams: {pd.concat([odds['home'], odds['away']]).nunique()}")
    
    print("\n✓ All data files cleaned and ready for backtest!")

if __name__ == '__main__':
    main()
