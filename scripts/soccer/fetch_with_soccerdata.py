#!/usr/bin/env python3
"""
Fetch historical match data using soccerdata library directly
Much simpler and more reliable than openfootball scraping

Usage:
    python scripts/soccer/fetch_with_soccerdata.py

Output:
    data/bundesliga/historical_results.csv
    data/serie_a/historical_results.csv
"""

import pandas as pd
from pathlib import Path
import soccerdata as sd

# League configurations
LEAGUES = {
    'bundesliga': {
        'fbref_name': 'Bundesliga',
        'seasons': ['20-21', '21-22', '22-23', '23-24'],  # FBref format
        'output_dir': 'data/bundesliga/'
    },
    'serie_a': {
        'fbref_name': 'Serie-A',
        'seasons': ['20-21', '21-22', '22-23', '23-24'],
        'output_dir': 'data/serie_a/'
    }
}

def fetch_league_data(league_key):
    """
    Fetch match results and team stats for a league
    """
    config = LEAGUES[league_key]
    
    print(f"\n{'='*60}")
    print(f"Fetching {league_key.upper()} data...")
    print(f"{'='*60}")
    
    # Initialize FBref scraper
    fbref = sd.FBref(leagues=config['fbref_name'], seasons=config['seasons'])
    
    # Fetch match results
    print("\nFetching match results...")
    try:
        schedule = fbref.read_schedule()
        print(f"✓ Found {len(schedule)} matches")
    except Exception as e:
        print(f"✗ Error fetching schedule: {e}")
        return None
    
    # Process match data
    matches = []
    for idx, row in schedule.iterrows():
        # Extract data from multi-index
        date = row.get('date') or row.name[0] if isinstance(row.name, tuple) else None
        home = row.get('home_team') or idx[1] if isinstance(idx, tuple) and len(idx) > 1 else None
        away = row.get('away_team') or idx[2] if isinstance(idx, tuple) and len(idx) > 2 else None
        
        home_score = row.get('home_goals')
        away_score = row.get('away_goals')
        
        # Skip if missing critical data
        if home_score is None or away_score is None or pd.isna(home_score) or pd.isna(away_score):
            continue
            
        # Determine season (Aug-Jul)
        if date:
            year = date.year
            month = date.month
            if month >= 8:
                season = f"{year}-{str(year+1)[-2:]}"
            else:
                season = f"{year-1}-{str(year)[-2:]}"
        else:
            season = "Unknown"
        
        btts = 1 if (home_score > 0 and away_score > 0) else 0
        total_goals = home_score + away_score
        
        matches.append({
            'date': date,
            'home': home,
            'away': away,
            'home_score': int(home_score),
            'away_score': int(away_score),
            'btts': btts,
            'total_goals': total_goals,
            'season': season
        })
    
    if not matches:
        print(f"✗ No valid match data found for {league_key}")
        return None
    
    # Create DataFrame
    df = pd.DataFrame(matches)
    
    # Summary statistics
    print(f"\n{'='*60}")
    print(f"SUMMARY - {league_key.upper()}")
    print(f"{'='*60}")
    print(f"Total matches: {len(df)}")
    print(f"Date range: {df['date'].min()} to {df['date'].max()}")
    print(f"BTTS rate: {df['btts'].mean():.1%}")
    print(f"Avg goals/game: {df['total_goals'].mean():.2f}")
    print(f"\nBy season:")
    for season in df['season'].unique():
        season_data = df[df['season'] == season]
        print(f"  {season}: {len(season_data)} matches, BTTS: {season_data['btts'].mean():.1%}")
    
    # Save to CSV
    output_dir = Path(config['output_dir'])
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_file = output_dir / 'historical_results.csv'
    df.to_csv(output_file, index=False)
    print(f"\n✓ Saved to: {output_file}")
    
    return df

def main():
    print("="*60)
    print("SOCCER DATA FETCHER (soccerdata library)")
    print("="*60)
    
    results = {}
    for league_key in LEAGUES.keys():
        df = fetch_league_data(league_key)
        if df is not None:
            results[league_key] = df
    
    print("\n" + "="*60)
    print("FETCH COMPLETE")
    print("="*60)
    
    if results:
        print("\nNext steps:")
        print("1. Run: export ODDS_API_KEY=your_key")
        print("2. Run: python scripts/soccer/fetch_historical_odds.py")
        print("3. Run: python scripts/soccer/train_league_profile_c.py")
    else:
        print("\n✗ No data fetched successfully")

if __name__ == '__main__':
    main()
