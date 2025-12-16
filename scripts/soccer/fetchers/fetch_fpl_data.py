#!/usr/bin/env python3
"""
FPL (Fantasy Premier League) Historical Data Fetcher

Extracts player availability and performance data from the cloned
Fantasy-Premier-League GitHub repository for seasons 2023-24, 2024-25, 2025-26.

Data source: temp_fpl_data/ (vaastav/Fantasy-Premier-League repo)

Features extracted:
1. Player Availability (per gameweek):
   - chance_of_playing_next_round, chance_of_playing_this_round
   - status (available/doubtful/injured/unavailable)
   - news (injury descriptions)
   - minutes played

2. Squad Quality Metrics (aggregated to team-level):
   - % of squad available
   - % of expected minutes available
   - Missing attack quality (sum xG+xA of unavailable players)
   - Team rotation index
   - Injury count

3. Player Performance (for context):
   - expected_goals, expected_assists per player
   - form, total_points

Output: data/premier_league/fpl_player_context.csv
"""

import pandas as pd
import json
import os
from pathlib import Path
from datetime import datetime

# Paths
FPL_DATA_DIR = Path(__file__).parent.parent.parent.parent / 'temp_fpl_data' / 'data'
OUTPUT_DIR = Path(__file__).parent.parent.parent / 'data' / 'premier_league'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_FILE = OUTPUT_DIR / 'fpl_player_context.csv'

# Target seasons
SEASONS = ['2023-24', '2024-25', '2025-26']

# FPL team name to normalized name mapping
# Maps from FPL official names to our normalized codes
FPL_TEAM_NAME_MAPPING = {
    'Arsenal': 'arsenal',
    'Aston Villa': 'astonvilla',
    'Bournemouth': 'bournemouth',
    'Brentford': 'brentford',
    'Brighton': 'brighton',
    'Burnley': 'burnley',
    'Chelsea': 'chelsea',
    'Crystal Palace': 'crystalpalace',
    'Everton': 'everton',
    'Fulham': 'fulham',
    'Ipswich': 'ipswich',
    'Leicester': 'leicester',
    'Liverpool': 'liverpool',
    'Luton': 'luton',
    'Man City': 'mancity',
    'Man Utd': 'manutd',
    'Manchester City': 'mancity',
    'Manchester United': 'manutd',
    'Newcastle': 'newcastle',
    "Nott'm Forest": 'nottmforest',
    'Nottingham Forest': 'nottmforest',
    'Sheffield Utd': 'sheffutd',
    'Sheffield United': 'sheffutd',
    'Southampton': 'southampton',
    'Spurs': 'tottenham',
    'Tottenham': 'tottenham',
    'West Ham': 'westham',
    'Wolves': 'wolves',
    'Wolverhampton': 'wolves'
}

def load_team_mapping(season):
    """Load team ID to name mapping from teams.csv for a season"""
    teams_file = FPL_DATA_DIR / season / 'teams.csv'
    if not teams_file.exists():
        return {}
    
    teams_df = pd.read_csv(teams_file)
    # Create mapping from ID to normalized name
    id_to_norm = {}
    for _, row in teams_df.iterrows():
        team_id = row['id']
        team_name = row['name']
        # Use our name mapping to get normalized name
        norm_name = FPL_TEAM_NAME_MAPPING.get(team_name, team_name.lower().replace(' ', ''))
        id_to_norm[team_id] = norm_name
    
    return id_to_norm


def load_fpl_fixtures(season):
    """
    Load fixtures for a season
    
    Returns:
        DataFrame with columns: event (gameweek), team_h, team_a, team_h_score, team_a_score, kickoff_time
    """
    fixtures_file = FPL_DATA_DIR / season / 'fixtures.csv'
    
    if not fixtures_file.exists():
        print(f"⚠️  Fixtures file not found: {fixtures_file}")
        return None
    
    df = pd.read_csv(fixtures_file)
    
    # Filter to finished matches only (boolean True or string 'True')
    if 'finished' in df.columns:
        df = df[df['finished'].isin([True, 'True', 1])].copy()
    
    print(f"   Loaded {len(df)} fixtures for {season}")
    
    return df


def load_fpl_players_raw(season):
    """
    Load players_raw.csv which has availability status for all players
    
    Returns:
        DataFrame with player stats including status, chance_of_playing, etc.
    """
    players_file = FPL_DATA_DIR / season / 'players_raw.csv'
    
    if not players_file.exists():
        return None
    
    df = pd.read_csv(players_file)
    
    # This file uses team ID, so we'll need to map it later
    return df


def aggregate_team_availability(players_df, team_norm_name):
    """
    Aggregate player availability to team-level metrics
    
    Args:
        players_df: DataFrame with player data for a gameweek (with normalized team names)
        team_norm_name: Normalized team name (e.g., 'mancity')
    
    Returns:
        dict with team availability metrics
    """
    team_players = players_df[players_df['team_norm'] == team_norm_name].copy()
    
    if len(team_players) == 0:
        return None
    
    # Total squad size
    squad_size = len(team_players)
    
    # Chance of playing (0-100)
    # Use 'chance_of_playing_this_round' if available, else assume 100 for available, 0 for others
    if 'chance_of_playing_this_round' in team_players.columns:
        team_players['chance_pct'] = team_players['chance_of_playing_this_round'].fillna(
            team_players['status'].map({'a': 100, 'd': 50, 'i': 0, 'u': 0}).fillna(100)
        )
    else:
        team_players['chance_pct'] = team_players['status'].map({'a': 100, 'd': 50, 'i': 0, 'u': 0}).fillna(100)
    
    # Expected minutes available (rough proxy)
    team_players['expected_minutes'] = team_players['chance_pct'] / 100.0 * 90
    
    # Attack quality (xG + xA)
    if 'expected_goals' in team_players.columns and 'expected_assists' in team_players.columns:
        team_players['attack_quality'] = (
            team_players['expected_goals'].fillna(0) + 
            team_players['expected_assists'].fillna(0)
        )
    else:
        team_players['attack_quality'] = 0
    
    # Now create availability slices AFTER computing attack_quality
    available = team_players[team_players['status'] == 'a']
    doubtful = team_players[team_players['status'] == 'd']
    injured = team_players[team_players['status'] == 'i']
    unavailable = team_players[team_players['status'] == 'u']
    
    # Missing attack quality (unavailable or doubtful attackers)
    missing_players = team_players[team_players['status'].isin(['i', 'u', 'd'])]
    missing_attack_quality = missing_players['attack_quality'].sum()
    
    # Available attack quality
    available_attack_quality = available['attack_quality'].sum() if len(available) > 0 else 0
    
    # Team metrics
    metrics = {
        'squad_size': squad_size,
        'available_count': len(available),
        'doubtful_count': len(doubtful),
        'injured_count': len(injured),
        'unavailable_count': len(unavailable),
        'availability_pct': len(available) / squad_size * 100 if squad_size > 0 else 0,
        'avg_chance_of_playing': team_players['chance_pct'].mean(),
        'expected_minutes_available': team_players['expected_minutes'].sum(),
        'expected_minutes_pct': team_players['expected_minutes'].sum() / (squad_size * 90) * 100 if squad_size > 0 else 0,
        'missing_attack_quality': missing_attack_quality,
        'available_attack_quality': available_attack_quality,
        'attack_quality_available_pct': (
            available_attack_quality / (available_attack_quality + missing_attack_quality) * 100
            if (available_attack_quality + missing_attack_quality) > 0 else 100
        )
    }
    
    return metrics


def process_season(season):
    """
    Process all matches for a season
    
    Returns:
        DataFrame with match-level team availability metrics
    """
    print(f"\n📅 Processing season: {season}")
    
    # Load fixtures
    fixtures = load_fpl_fixtures(season)
    
    if fixtures is None or len(fixtures) == 0:
        print(f"   ⚠️  No fixtures to process for {season}")
        return None
    
    print(f"   {len(fixtures)} completed matches to process")
    
    # Load team ID to normalized name mapping
    team_id_mapping = load_team_mapping(season)
    
    # Load players_raw.csv with availability status
    players_raw = load_fpl_players_raw(season)
    
    if players_raw is None:
        print(f"   ⚠️  No players_raw.csv found for {season}")
        return None
    
    # Add normalized team names to players
    players_raw['team_norm'] = players_raw['team'].map(team_id_mapping)
    
    # Extract date from kickoff_time
    fixtures['date'] = pd.to_datetime(fixtures['kickoff_time']).dt.date.astype(str)
    
    all_match_data = []
    processed_gw_count = 0
    skipped_gw_count = 0
    
    # Group by gameweek
    for gameweek in sorted(fixtures['event'].unique()):
        gw_fixtures = fixtures[fixtures['event'] == gameweek]
        
        processed_gw_count += 1
        
        # Process each match
        for _, match in gw_fixtures.iterrows():
            home_team_id = match['team_h']
            away_team_id = match['team_a']
            
            # Normalize team names using loaded mapping
            home_norm = team_id_mapping.get(home_team_id, f'team_{home_team_id}')
            away_norm = team_id_mapping.get(away_team_id, f'team_{away_team_id}')
            
            # Get team availability metrics (using season-wide players_raw data)
            home_metrics = aggregate_team_availability(players_raw, home_norm)
            away_metrics = aggregate_team_availability(players_raw, away_norm)
            
            if home_metrics is None or away_metrics is None:
                continue
            
            # Combine match data
            match_data = {
                'season': season,
                'gameweek': gameweek,
                'date': match['date'],
                'home_norm': home_norm,
                'away_norm': away_norm,
                'home_goals': match['team_h_score'],
                'away_goals': match['team_a_score'],
                
                # Home team availability
                'home_squad_size': home_metrics['squad_size'],
                'home_available_count': home_metrics['available_count'],
                'home_injured_count': home_metrics['injured_count'],
                'home_doubtful_count': home_metrics['doubtful_count'],
                'home_availability_pct': home_metrics['availability_pct'],
                'home_avg_chance_of_playing': home_metrics['avg_chance_of_playing'],
                'home_expected_minutes_pct': home_metrics['expected_minutes_pct'],
                'home_missing_attack_quality': home_metrics['missing_attack_quality'],
                'home_available_attack_quality': home_metrics['available_attack_quality'],
                'home_attack_quality_pct': home_metrics['attack_quality_available_pct'],
                
                # Away team availability
                'away_squad_size': away_metrics['squad_size'],
                'away_available_count': away_metrics['available_count'],
                'away_injured_count': away_metrics['injured_count'],
                'away_doubtful_count': away_metrics['doubtful_count'],
                'away_availability_pct': away_metrics['availability_pct'],
                'away_avg_chance_of_playing': away_metrics['avg_chance_of_playing'],
                'away_expected_minutes_pct': away_metrics['expected_minutes_pct'],
                'away_missing_attack_quality': away_metrics['missing_attack_quality'],
                'away_available_attack_quality': away_metrics['available_attack_quality'],
                'away_attack_quality_pct': away_metrics['attack_quality_available_pct']
            }
            
            all_match_data.append(match_data)
    
    if not all_match_data:
        print(f"   ⚠️  No match data collected (processed {processed_gw_count} GWs, skipped {skipped_gw_count} GWs)")
        return None
    
    df = pd.DataFrame(all_match_data)
    print(f"✅ Processed {len(df)} matches from {processed_gw_count} gameweeks (skipped {skipped_gw_count} GWs)")
    
    return df


def main():
    """
    Fetch and process FPL player availability data for all target seasons
    """
    print("=" * 80)
    print("FPL PLAYER AVAILABILITY DATA FETCHER")
    print("=" * 80)
    print(f"\nData source: {FPL_DATA_DIR}")
    print(f"Target seasons: {SEASONS}")
    print(f"Output file: {OUTPUT_FILE}")
    
    all_season_data = []
    
    for season in SEASONS:
        season_df = process_season(season)
        
        if season_df is not None:
            all_season_data.append(season_df)
    
    if not all_season_data:
        print("\n❌ No data collected!")
        return
    
    # Combine all seasons
    df = pd.concat(all_season_data, ignore_index=True)
    
    # Summary statistics
    print("\n" + "=" * 80)
    print("DATA COLLECTION SUMMARY")
    print("=" * 80)
    print(f"\nTotal matches: {len(df)}")
    
    print("\n📊 Breakdown by season:")
    for season in df['season'].unique():
        season_df = df[df['season'] == season]
        print(f"   {season}: {len(season_df)} matches")
    
    print("\n📊 Availability metrics summary:")
    print(f"   Home team avg availability: {df['home_availability_pct'].mean():.1f}%")
    print(f"   Away team avg availability: {df['away_availability_pct'].mean():.1f}%")
    print(f"   Avg injuries per team per match: {df[['home_injured_count', 'away_injured_count']].mean().mean():.2f}")
    
    print("\n📊 Attack quality impact:")
    print(f"   Avg home attack quality available: {df['home_attack_quality_pct'].mean():.1f}%")
    print(f"   Avg away attack quality available: {df['away_attack_quality_pct'].mean():.1f}%")
    
    # Save to CSV
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\n✅ Data saved to: {OUTPUT_FILE}")
    print(f"   {len(df)} rows × {len(df.columns)} columns")
    
    # Save metadata
    metadata = {
        'generated_at': datetime.now().isoformat(),
        'source': 'vaastav/Fantasy-Premier-League GitHub repository',
        'seasons': sorted(df['season'].unique().tolist()),
        'total_matches': len(df),
        'date_range': {
            'min': df['date'].min(),
            'max': df['date'].max()
        },
        'features': df.columns.tolist(),
        'coverage_by_season': df['season'].value_counts().to_dict()
    }
    
    metadata_file = OUTPUT_DIR / 'fpl_player_metadata.json'
    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"✅ Metadata saved to: {metadata_file}")
    
    # Sample output
    print("\n📋 Sample data (first match):")
    sample = df.iloc[0].to_dict()
    for key, value in sample.items():
        print(f"   {key}: {value}")


if __name__ == '__main__':
    main()
