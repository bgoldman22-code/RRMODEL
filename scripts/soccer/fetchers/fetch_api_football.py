#!/usr/bin/env python3
"""
API-Football Historical Data Fetcher

Fetches match statistics for EPL seasons 2023-24, 2024-25, 2025-26
to match Profile C training and validation data.

Coverage target:
- 2023-24: 380 matches (complete season)
- 2024-25: 380 matches (complete season)
- 2025-26: ~160 matches (in progress as of Dec 2025)
- Total: ~920 matches

Features extracted:
- xG (expected_goals)
- 6 shot types (total, on target, off target, inside box, outside box, blocked)
- Ball possession %
- Passes (total, accurate, %)
- Corners
- Goalkeeper saves
- Referee name (for BTTS rate calculation)

Output: data/premier_league/api_football_statistics.csv
"""

import requests
import pandas as pd
import json
import time
import os
from datetime import datetime
from pathlib import Path

# API Configuration
API_KEY = os.getenv('API_FOOTBALL_KEY')
if not API_KEY:
    raise ValueError("API_FOOTBALL_KEY environment variable not set. Check .env.local")

BASE_URL = "https://v3.football.api-sports.io"
HEADERS = {
    "x-rapidapi-host": "v3.football.api-sports.io",
    "x-rapidapi-key": API_KEY
}

# EPL Configuration
EPL_LEAGUE_ID = 39
SEASONS = [2023, 2024, 2025]  # API uses starting year (2023 = 2023-24 season)

# Output path
OUTPUT_DIR = Path(__file__).parent.parent.parent / 'data' / 'premier_league'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_FILE = OUTPUT_DIR / 'api_football_statistics.csv'

# Team name mapping (API-Football → Profile C normalized names)
TEAM_MAPPING = {
    'Manchester City': 'mancity',
    'Manchester United': 'manutd',
    'Liverpool': 'liverpool',
    'Arsenal': 'arsenal',
    'Chelsea': 'chelsea',
    'Tottenham': 'tottenham',
    'Newcastle United': 'newcastle',
    'Brighton': 'brighton',
    'Aston Villa': 'astonvilla',
    'West Ham': 'westham',
    'Fulham': 'fulham',
    'Brentford': 'brentford',
    'Crystal Palace': 'crystalpalace',
    'Everton': 'everton',
    'Nottingham Forest': 'nottmforest',
    'Wolverhampton Wanderers': 'wolves',
    'Wolves': 'wolves',
    'Bournemouth': 'bournemouth',
    'Luton': 'luton',
    'Burnley': 'burnley',
    'Sheffield United': 'sheffutd',
    'Sheffield Utd': 'sheffutd',
    'Leicester': 'leicester',
    'Leeds': 'leeds',
    'Southampton': 'southampton',
    'Ipswich': 'ipswich'
}


def fetch_season_fixtures(season):
    """
    Fetch all EPL fixtures for a season
    
    Args:
        season: int (e.g., 2023 for 2023-24 season)
    
    Returns:
        list of fixture dicts
    """
    print(f"\n📅 Fetching fixtures for EPL {season}-{season+1}...")
    
    endpoint = f"{BASE_URL}/fixtures"
    params = {
        'league': EPL_LEAGUE_ID,
        'season': season
    }
    
    response = requests.get(endpoint, headers=HEADERS, params=params)
    
    if response.status_code != 200:
        print(f"❌ Error fetching fixtures: {response.status_code}")
        print(response.text)
        return []
    
    data = response.json()
    
    if data.get('errors'):
        print(f"❌ API Error: {data['errors']}")
        return []
    
    fixtures = data.get('response', [])
    print(f"✅ Found {len(fixtures)} fixtures")
    
    # Filter to finished matches only
    finished_fixtures = [f for f in fixtures if f['fixture']['status']['short'] == 'FT']
    print(f"   {len(finished_fixtures)} completed matches")
    
    return finished_fixtures


def fetch_match_statistics(fixture_id):
    """
    Fetch detailed statistics for a single match
    
    Returns:
        dict with home and away team stats, or None if unavailable
    """
    endpoint = f"{BASE_URL}/fixtures/statistics"
    params = {'fixture': fixture_id}
    
    response = requests.get(endpoint, headers=HEADERS, params=params)
    
    if response.status_code != 200:
        return None
    
    data = response.json()
    
    if data.get('errors') or not data.get('response'):
        return None
    
    return data['response']


def parse_stat_value(stat_dict, stat_name):
    """
    Extract stat value from statistics array
    
    Args:
        stat_dict: team statistics dict
        stat_name: name of statistic (e.g., 'expected_goals', 'Shots on Goal')
    
    Returns:
        parsed value (float/int) or None
    """
    for stat in stat_dict.get('statistics', []):
        if stat['type'] == stat_name:
            value = stat['value']
            
            if value is None:
                return None
            
            # Handle percentage strings
            if isinstance(value, str) and '%' in value:
                try:
                    return float(value.replace('%', ''))
                except:
                    return None
            
            # Handle numeric strings
            if isinstance(value, str):
                try:
                    return float(value)
                except:
                    return None
            
            return value
    
    return None


def process_fixture(fixture):
    """
    Extract all relevant features from a fixture
    
    Returns:
        dict with match info and statistics, or None if stats unavailable
    """
    fixture_id = fixture['fixture']['id']
    fixture_info = fixture['fixture']
    teams = fixture['teams']
    goals = fixture['goals']
    
    # Get detailed statistics
    stats = fetch_match_statistics(fixture_id)
    
    if not stats or len(stats) != 2:
        return None
    
    # Identify home/away teams in stats response
    home_stats = stats[0] if stats[0]['team']['id'] == teams['home']['id'] else stats[1]
    away_stats = stats[1] if stats[1]['team']['id'] == teams['away']['id'] else stats[0]
    
    # Normalize team names
    home_name = teams['home']['name']
    away_name = teams['away']['name']
    home_norm = TEAM_MAPPING.get(home_name, home_name.lower().replace(' ', ''))
    away_norm = TEAM_MAPPING.get(away_name, away_name.lower().replace(' ', ''))
    
    # Parse date
    match_date = fixture_info['date'].split('T')[0]  # YYYY-MM-DD
    
    # Determine season (Aug-May spans calendar years)
    year = int(match_date[:4])
    month = int(match_date[5:7])
    if month >= 8:  # Aug-Dec = start of season
        season_start = year
    else:  # Jan-May = end of season
        season_start = year - 1
    season = f"{season_start}-{str(season_start + 1)[2:]}"
    
    # Extract all statistics
    match_data = {
        # Identifiers
        'fixture_id': fixture_id,
        'season': season,
        'date': match_date,
        'home': home_name,
        'away': away_name,
        'home_norm': home_norm,
        'away_norm': away_norm,
        
        # Match outcome
        'home_goals': goals['home'],
        'away_goals': goals['away'],
        
        # Venue and referee
        'venue': fixture_info.get('venue', {}).get('name'),
        'referee': fixture_info.get('referee'),
        
        # Home team statistics
        'home_xg': parse_stat_value(home_stats, 'expected_goals'),
        'home_shots_total': parse_stat_value(home_stats, 'Total Shots'),
        'home_shots_on_target': parse_stat_value(home_stats, 'Shots on Goal'),
        'home_shots_off_target': parse_stat_value(home_stats, 'Shots off Goal'),
        'home_shots_inside_box': parse_stat_value(home_stats, 'Shots insidebox'),
        'home_shots_outside_box': parse_stat_value(home_stats, 'Shots outsidebox'),
        'home_shots_blocked': parse_stat_value(home_stats, 'Blocked Shots'),
        'home_possession_pct': parse_stat_value(home_stats, 'Ball Possession'),
        'home_passes_total': parse_stat_value(home_stats, 'Total passes'),
        'home_passes_accurate': parse_stat_value(home_stats, 'Passes accurate'),
        'home_pass_accuracy_pct': parse_stat_value(home_stats, 'Passes %'),
        'home_corners': parse_stat_value(home_stats, 'Corner Kicks'),
        'home_gk_saves': parse_stat_value(home_stats, 'Goalkeeper Saves'),
        'home_fouls': parse_stat_value(home_stats, 'Fouls'),
        'home_yellow_cards': parse_stat_value(home_stats, 'Yellow Cards'),
        'home_red_cards': parse_stat_value(home_stats, 'Red Cards'),
        
        # Away team statistics
        'away_xg': parse_stat_value(away_stats, 'expected_goals'),
        'away_shots_total': parse_stat_value(away_stats, 'Total Shots'),
        'away_shots_on_target': parse_stat_value(away_stats, 'Shots on Goal'),
        'away_shots_off_target': parse_stat_value(away_stats, 'Shots off Goal'),
        'away_shots_inside_box': parse_stat_value(away_stats, 'Shots insidebox'),
        'away_shots_outside_box': parse_stat_value(away_stats, 'Shots outsidebox'),
        'away_shots_blocked': parse_stat_value(away_stats, 'Blocked Shots'),
        'away_possession_pct': parse_stat_value(away_stats, 'Ball Possession'),
        'away_passes_total': parse_stat_value(away_stats, 'Total passes'),
        'away_passes_accurate': parse_stat_value(away_stats, 'Passes accurate'),
        'away_pass_accuracy_pct': parse_stat_value(away_stats, 'Passes %'),
        'away_corners': parse_stat_value(away_stats, 'Corner Kicks'),
        'away_gk_saves': parse_stat_value(away_stats, 'Goalkeeper Saves'),
        'away_fouls': parse_stat_value(away_stats, 'Fouls'),
        'away_yellow_cards': parse_stat_value(away_stats, 'Yellow Cards'),
        'away_red_cards': parse_stat_value(away_stats, 'Red Cards')
    }
    
    return match_data


def main():
    """
    Fetch and process EPL statistics for all target seasons
    """
    print("=" * 80)
    print("API-FOOTBALL HISTORICAL DATA FETCHER")
    print("=" * 80)
    print(f"\nTarget seasons: {[f'{s}-{s+1}' for s in SEASONS]}")
    print(f"Output file: {OUTPUT_FILE}")
    
    all_match_data = []
    total_fixtures = 0
    total_with_stats = 0
    
    for season in SEASONS:
        # Fetch all fixtures for season
        fixtures = fetch_season_fixtures(season)
        total_fixtures += len(fixtures)
        
        if not fixtures:
            print(f"⚠️  No fixtures found for {season}-{season+1}")
            continue
        
        # Process each fixture
        print(f"\n📊 Processing {len(fixtures)} matches...")
        
        for i, fixture in enumerate(fixtures, 1):
            if i % 10 == 0:
                print(f"   Progress: {i}/{len(fixtures)} matches processed...")
            
            match_data = process_fixture(fixture)
            
            if match_data:
                all_match_data.append(match_data)
                total_with_stats += 1
            else:
                print(f"   ⚠️  No stats for fixture {fixture['fixture']['id']}")
            
            # Rate limiting (Ultra plan = 75K/day, but be respectful)
            time.sleep(0.5)  # 2 requests per second max
        
        print(f"✅ {season}-{season+1}: {total_with_stats - len(all_match_data) + len([m for m in all_match_data if m['season'] == f'{season}-{str(season+1)[2:]}'])} matches with stats")
    
    # Convert to DataFrame
    if not all_match_data:
        print("\n❌ No match data collected!")
        return
    
    df = pd.DataFrame(all_match_data)
    
    # Summary statistics
    print("\n" + "=" * 80)
    print("DATA COLLECTION SUMMARY")
    print("=" * 80)
    print(f"\nTotal fixtures found: {total_fixtures}")
    print(f"Matches with stats: {len(df)}")
    print(f"Coverage: {len(df)/total_fixtures*100:.1f}%")
    
    print("\n📊 Breakdown by season:")
    for season_label in df['season'].unique():
        season_df = df[df['season'] == season_label]
        print(f"   {season_label}: {len(season_df)} matches")
    
    print("\n📊 Data completeness:")
    key_stats = ['home_xg', 'away_xg', 'home_shots_total', 'home_possession_pct']
    for stat in key_stats:
        null_count = df[stat].isna().sum()
        print(f"   {stat}: {len(df) - null_count}/{len(df)} ({(len(df)-null_count)/len(df)*100:.1f}%)")
    
    # Save to CSV
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\n✅ Data saved to: {OUTPUT_FILE}")
    print(f"   {len(df)} rows × {len(df.columns)} columns")
    
    # Save metadata
    metadata = {
        'generated_at': datetime.now().isoformat(),
        'seasons': sorted(df['season'].unique().tolist()),
        'total_matches': len(df),
        'date_range': {
            'min': df['date'].min(),
            'max': df['date'].max()
        },
        'features': df.columns.tolist(),
        'coverage_by_season': df['season'].value_counts().to_dict()
    }
    
    metadata_file = OUTPUT_DIR / 'api_football_metadata.json'
    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"✅ Metadata saved to: {metadata_file}")
    
    # Sample output
    print("\n📋 Sample data (first match):")
    print(df.iloc[0].to_dict())


if __name__ == '__main__':
    main()
