#!/usr/bin/env python3
"""
NBA Totals Backtest Dataset Builder

Joins:
1. Model features + actuals (from nba_totals_training_dataset.parquet)
2. Historical market totals lines (from data/nba/historical_odds/game_totals/)

Output:
- data/nba/backtests/nba_totals_backtest_dataset.parquet
- data/nba/backtests/nba_totals_backtest_dataset_metadata.json
"""

import json
import os
from pathlib import Path
from datetime import datetime

import pandas as pd
import numpy as np

# Paths
REPO_ROOT = Path(__file__).parent.parent
DATASET_PATH = REPO_ROOT / "data/nba/datasets/nba_totals_training_dataset.parquet"
METADATA_PATH = REPO_ROOT / "data/nba/datasets/nba_totals_training_metadata.json"
ODDS_DIR = REPO_ROOT / "data/nba/historical_odds/game_totals"
MANIFEST_PATH = ODDS_DIR / "game_totals_manifest_v1.json"

OUTPUT_DIR = REPO_ROOT / "data/nba/backtests"
OUTPUT_PARQUET = OUTPUT_DIR / "nba_totals_backtest_dataset.parquet"
OUTPUT_CSV = OUTPUT_DIR / "nba_totals_backtest_dataset.csv"
OUTPUT_METADATA = OUTPUT_DIR / "nba_totals_backtest_dataset_metadata.json"

# Team name normalization mapping (odds API uses full names, dataset uses abbreviations)
ABBREV_TO_FULL = {
    'ATL': 'Atlanta Hawks',
    'BOS': 'Boston Celtics',
    'BKN': 'Brooklyn Nets',
    'CHA': 'Charlotte Hornets',
    'CHI': 'Chicago Bulls',
    'CLE': 'Cleveland Cavaliers',
    'DAL': 'Dallas Mavericks',
    'DEN': 'Denver Nuggets',
    'DET': 'Detroit Pistons',
    'GSW': 'Golden State Warriors',
    'HOU': 'Houston Rockets',
    'IND': 'Indiana Pacers',
    'LAC': 'LA Clippers',
    'LAL': 'Los Angeles Lakers',
    'MEM': 'Memphis Grizzlies',
    'MIA': 'Miami Heat',
    'MIL': 'Milwaukee Bucks',
    'MIN': 'Minnesota Timberwolves',
    'NOP': 'New Orleans Pelicans',
    'NYK': 'New York Knicks',
    'OKC': 'Oklahoma City Thunder',
    'ORL': 'Orlando Magic',
    'PHI': 'Philadelphia 76ers',
    'PHX': 'Phoenix Suns',
    'POR': 'Portland Trail Blazers',
    'SAC': 'Sacramento Kings',
    'SAS': 'San Antonio Spurs',
    'TOR': 'Toronto Raptors',
    'UTA': 'Utah Jazz',
    'WAS': 'Washington Wizards',
}

FULL_TO_FULL = {
    # Map full names (normalize LA Clippers variations)
    'Atlanta Hawks': 'Atlanta Hawks',
    'Boston Celtics': 'Boston Celtics',
    'Brooklyn Nets': 'Brooklyn Nets',
    'Charlotte Hornets': 'Charlotte Hornets',
    'Chicago Bulls': 'Chicago Bulls',
    'Cleveland Cavaliers': 'Cleveland Cavaliers',
    'Dallas Mavericks': 'Dallas Mavericks',
    'Denver Nuggets': 'Denver Nuggets',
    'Detroit Pistons': 'Detroit Pistons',
    'Golden State Warriors': 'Golden State Warriors',
    'Houston Rockets': 'Houston Rockets',
    'Indiana Pacers': 'Indiana Pacers',
    'LA Clippers': 'LA Clippers',
    'Los Angeles Clippers': 'LA Clippers',  # Normalize this variation
    'Los Angeles Lakers': 'Los Angeles Lakers',
    'Memphis Grizzlies': 'Memphis Grizzlies',
    'Miami Heat': 'Miami Heat',
    'Milwaukee Bucks': 'Milwaukee Bucks',
    'Minnesota Timberwolves': 'Minnesota Timberwolves',
    'New Orleans Pelicans': 'New Orleans Pelicans',
    'New York Knicks': 'New York Knicks',
    'Oklahoma City Thunder': 'Oklahoma City Thunder',
    'Orlando Magic': 'Orlando Magic',
    'Philadelphia 76ers': 'Philadelphia 76ers',
    'Phoenix Suns': 'Phoenix Suns',
    'Portland Trail Blazers': 'Portland Trail Blazers',
    'Sacramento Kings': 'Sacramento Kings',
    'San Antonio Spurs': 'San Antonio Spurs',
    'Toronto Raptors': 'Toronto Raptors',
    'Utah Jazz': 'Utah Jazz',
    'Washington Wizards': 'Washington Wizards',
}

def normalize_team_name(name):
    """Normalize team name for joining."""
    # Try abbreviation first
    if name in ABBREV_TO_FULL:
        return ABBREV_TO_FULL[name]
    # Then full name
    return FULL_TO_FULL.get(name, name)

def load_model_dataset():
    """Load model features + actuals dataset."""
    print("\n📂 Loading model dataset...")
    
    # Load parquet
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Model dataset not found: {DATASET_PATH}")
    
    df = pd.read_parquet(DATASET_PATH)
    print(f"  ✅ Loaded {len(df):,} rows from {DATASET_PATH.name}")
    
    # Load metadata
    if not METADATA_PATH.exists():
        raise FileNotFoundError(f"Metadata not found: {METADATA_PATH}")
    
    with open(METADATA_PATH) as f:
        metadata = json.load(f)
    
    print(f"  ✅ Features: {len(metadata.get('features', metadata.get('feature_columns', [])))} columns")
    print(f"  ✅ Seasons: {len(metadata.get('seasons', []))}")
    
    # Ensure date column is datetime and extract date only
    if 'date' in df.columns:
        df['date'] = pd.to_datetime(df['date']).dt.date
        df['date_str'] = df['date'].astype(str)
    elif 'game_date' in df.columns:
        df['date'] = pd.to_datetime(df['game_date']).dt.date
        df['date_str'] = df['date'].astype(str)
    else:
        raise ValueError("No date column found in dataset")
    
    # Normalize team names
    if 'home_team' in df.columns:
        df['home_team'] = df['home_team'].apply(normalize_team_name)
    if 'away_team' in df.columns:
        df['away_team'] = df['away_team'].apply(normalize_team_name)
    
    # Check for required columns
    required = ['date', 'home_team', 'away_team', 'actual_total']
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    
    print(f"  ✅ Date range: {df['date'].min()} to {df['date'].max()}")
    print(f"  ✅ Unique teams: {df['home_team'].nunique()}")
    
    return df, metadata

def load_historical_odds():
    """Load historical odds from game_totals files."""
    print("\n📂 Loading historical market totals...")
    
    if not MANIFEST_PATH.exists():
        raise FileNotFoundError(f"Manifest not found: {MANIFEST_PATH}")
    
    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)
    
    print(f"  ✅ Manifest: {manifest['total_dates']} dates, {manifest['total_games']} games")
    
    # Load all daily odds files
    all_odds = []
    
    for file_info in manifest['files']:
        date_str = file_info['date']
        date_slug = date_str.replace('-', '')
        odds_file = ODDS_DIR / f"game_totals_{date_slug}_v1.json"
        
        if not odds_file.exists():
            print(f"  ⚠️  Missing file: {odds_file.name}")
            continue
        
        with open(odds_file) as f:
            odds_data = json.load(f)
        
        for game in odds_data.get('games', []):
            # Extract date from file (already in YYYY-MM-DD format)
            game_date = date_str
            
            # Extract teams
            home_team = normalize_team_name(game['home_team'])
            away_team = normalize_team_name(game['away_team'])
            
            # Extract totals lines
            bookmakers = game.get('bookmakers', {})
            totals = bookmakers.get('totals', {})
            
            # Get per-book lines
            fanduel = totals.get('fanduel', {})
            draftkings = totals.get('draftkings', {})
            betmgm = totals.get('betmgm', {})
            
            # Get consensus
            consensus = game.get('consensus', {}).get('totals', {})
            consensus_line = consensus.get('line')
            
            # Skip if no totals data
            if not consensus_line and not any([fanduel, draftkings, betmgm]):
                continue
            
            odds_row = {
                'date': game_date,
                'home_team': home_team,
                'away_team': away_team,
                'event_id': game['event_id'],
                'commence_time': game['commence_time'],
                'market_total_line_consensus': consensus_line,
                # FanDuel
                'fanduel_total_line': fanduel.get('line'),
                'fanduel_over_price': fanduel.get('over_price'),
                'fanduel_under_price': fanduel.get('under_price'),
                # DraftKings
                'draftkings_total_line': draftkings.get('line'),
                'draftkings_over_price': draftkings.get('over_price'),
                'draftkings_under_price': draftkings.get('under_price'),
                # BetMGM
                'betmgm_total_line': betmgm.get('line'),
                'betmgm_over_price': betmgm.get('over_price'),
                'betmgm_under_price': betmgm.get('under_price'),
            }
            
            all_odds.append(odds_row)
    
    odds_df = pd.DataFrame(all_odds)
    print(f"  ✅ Loaded {len(odds_df):,} games with totals lines")
    print(f"  ✅ Date range: {odds_df['date'].min()} to {odds_df['date'].max()}")
    print(f"  ✅ Unique teams: {odds_df['home_team'].nunique()}")
    
    # Check for consensus line coverage
    has_consensus = odds_df['market_total_line_consensus'].notna().sum()
    print(f"  ✅ Games with consensus line: {has_consensus:,} ({100*has_consensus/len(odds_df):.1f}%)")
    
    return odds_df

def join_datasets(model_df, odds_df):
    """Join model features with market odds."""
    print("\n🔗 Joining datasets...")
    
    # DEBUG: Check sample dates/teams before join
    print(f"\n  DEBUG - Model sample:")
    model_sample = model_df[['date', 'home_team', 'away_team']].head(3)
    for _, row in model_sample.iterrows():
        print(f"    {row['date']} | {row['home_team']} vs {row['away_team']}")
    
    print(f"\n  DEBUG - Odds sample:")
    odds_sample = odds_df[['date', 'home_team', 'away_team']].head(3)
    for _, row in odds_sample.iterrows():
        print(f"    {row['date']} | {row['home_team']} vs {row['away_team']}")
    
    # Check for overlapping dates
    model_dates = set(model_df['date'].astype(str))
    odds_dates = set(odds_df['date'].astype(str))
    overlap = model_dates & odds_dates
    print(f"\n  DEBUG - Date overlap: {len(overlap)} dates")
    if len(overlap) > 0:
        print(f"    Sample overlapping dates: {sorted(list(overlap))[:5]}")
    
    # Join on (date, home_team, away_team)
    # Convert dates to strings for matching
    model_df['date_str'] = model_df['date'].astype(str)
    odds_df['date_str'] = odds_df['date'].astype(str)
    
    joined = model_df.merge(
        odds_df,
        left_on=['date_str', 'home_team', 'away_team'],
        right_on=['date_str', 'home_team', 'away_team'],
        how='inner',
        suffixes=('', '_odds')
    )
    
    print(f"  ✅ Matched {len(joined):,} games")
    print(f"  ⚠️  Unmatched model rows: {len(model_df) - len(joined):,}")
    print(f"  ⚠️  Unmatched odds rows: {len(odds_df) - len(joined):,}")
    
    # Filter to games with valid data
    before = len(joined)
    joined = joined[
        joined['actual_total'].notna() &
        (joined['market_total_line_consensus'].notna() | 
         joined['fanduel_total_line'].notna() |
         joined['draftkings_total_line'].notna() |
         joined['betmgm_total_line'].notna())
    ]
    after = len(joined)
    
    if before > after:
        print(f"  ⚠️  Filtered {before - after:,} rows missing actual_total or market lines")
    
    print(f"  ✅ Final dataset: {len(joined):,} games")
    
    return joined

def save_backtest_dataset(df, original_metadata):
    """Save joined backtest dataset."""
    print("\n💾 Saving backtest dataset...")
    
    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Save parquet
    df.to_parquet(OUTPUT_PARQUET, index=False)
    print(f"  ✅ Saved: {OUTPUT_PARQUET}")
    print(f"     Size: {OUTPUT_PARQUET.stat().st_size / 1024 / 1024:.2f} MB")
    
    # Save CSV (optional, may be large)
    if len(df) < 50000:  # Only save CSV if reasonable size
        df.to_csv(OUTPUT_CSV, index=False)
        print(f"  ✅ Saved: {OUTPUT_CSV}")
    
    # Create metadata
    metadata = {
        'created_at': datetime.now().isoformat(),
        'source_files': {
            'model_dataset': str(DATASET_PATH.relative_to(REPO_ROOT)),
            'odds_directory': str(ODDS_DIR.relative_to(REPO_ROOT)),
        },
        'num_games': len(df),
        'date_range': {
            'start': str(df['date'].min()),
            'end': str(df['date'].max()),
        },
        'seasons': sorted(df['season'].unique().tolist()) if 'season' in df.columns else [],
        'columns': df.columns.tolist(),
        'feature_columns': original_metadata.get('features', original_metadata.get('feature_columns', [])),
        'odds_columns': [col for col in df.columns if 'fanduel' in col or 'draftkings' in col or 'betmgm' in col or 'market_' in col],
        'data_quality': {
            'has_consensus_line': int(df['market_total_line_consensus'].notna().sum()),
            'has_fanduel': int(df['fanduel_total_line'].notna().sum()),
            'has_draftkings': int(df['draftkings_total_line'].notna().sum()),
            'has_betmgm': int(df['betmgm_total_line'].notna().sum()),
        }
    }
    
    with open(OUTPUT_METADATA, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"  ✅ Saved: {OUTPUT_METADATA}")
    
    return metadata

def main():
    """Main execution."""
    print("=" * 60)
    print("NBA TOTALS BACKTEST DATASET BUILDER")
    print("=" * 60)
    
    # Load model dataset
    model_df, metadata = load_model_dataset()
    
    # Load historical odds
    odds_df = load_historical_odds()
    
    # Join datasets
    joined_df = join_datasets(model_df, odds_df)
    
    # Save
    output_metadata = save_backtest_dataset(joined_df, metadata)
    
    # Summary
    print("\n" + "=" * 60)
    print("✅ BACKTEST DATASET BUILD COMPLETE")
    print("=" * 60)
    print(f"Total games: {output_metadata['num_games']:,}")
    print(f"Date range: {output_metadata['date_range']['start']} → {output_metadata['date_range']['end']}")
    if output_metadata['seasons']:
        print(f"Seasons: {', '.join(output_metadata['seasons'])}")
    print(f"Feature columns: {len(output_metadata['feature_columns'])}")
    print(f"Odds columns: {len(output_metadata['odds_columns'])}")
    print(f"\nData quality:")
    print(f"  Consensus lines: {output_metadata['data_quality']['has_consensus_line']:,}")
    print(f"  FanDuel lines:   {output_metadata['data_quality']['has_fanduel']:,}")
    print(f"  DraftKings lines: {output_metadata['data_quality']['has_draftkings']:,}")
    print(f"  BetMGM lines:    {output_metadata['data_quality']['has_betmgm']:,}")
    print(f"\n📁 Output: {OUTPUT_PARQUET.relative_to(REPO_ROOT)}")
    print(f"📄 Metadata: {OUTPUT_METADATA.relative_to(REPO_ROOT)}")

if __name__ == '__main__':
    main()
