#!/usr/bin/env python3
"""
Fetch Bundesliga data from openfootball GitHub repo
Then fetch Serie A from The Odds API

Usage:
    python scripts/soccer/fetch_simple.py

Output:
    data/bundesliga/historical_results.csv
    data/serie_a/historical_data.csv (with odds)
"""

import pandas as pd
from pathlib import Path
import subprocess
import re
from datetime import datetime
import requests
import time
import os

API_KEY = os.environ.get('ODDS_API_KEY')  # Set via: export ODDS_API_KEY=your_key

if not API_KEY:
    print("❌ ERROR: ODDS_API_KEY environment variable not set")
    print("Please run: export ODDS_API_KEY=your_key")
    exit(1)

def fetch_bundesliga_from_git():
    """
    Clone openfootball/deutschland repo and extract match data
    """
    print("="*60)
    print("FETCHING BUNDESLIGA FROM OPENFOOTBALL")
    print("="*60)
    
    # Clone repo to temp location
    temp_dir = Path('/tmp/deutschland')
    if temp_dir.exists():
        print(f"Removing existing temp directory...")
        subprocess.run(['rm', '-rf', str(temp_dir)], check=True)
    
    print(f"\nCloning repository...")
    result = subprocess.run(
        ['git', 'clone', 'https://github.com/openfootball/deutschland.git', str(temp_dir)],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"✗ Clone failed: {result.stderr}")
        return None
    
    print(f"✓ Repository cloned")
    
    # Parse match files for each season
    all_matches = []
    
    seasons = [
        ('2020-21', '1-bundesliga.txt'),
        ('2021-22', '1-bundesliga.txt'),
        ('2022-23', '1-bundesliga.txt'),
        ('2023-24', '1-bundesliga.txt'),
    ]
    
    for season_label, filename in seasons:
        season_dir = temp_dir / season_label
        match_file = season_dir / filename
        
        if not match_file.exists():
            print(f"\n✗ File not found: {match_file}")
            continue
        
        print(f"\nParsing {season_label}...")
        
        with open(match_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        current_date = None
        matches_in_season = 0
        
        for line in lines:
            line = line.strip()
            
            # Skip empty lines and comments
            if not line or line.startswith('#') or line.startswith('##'):
                continue
            
            # Check for date line (format: "[Fri Aug/20]" or similar)
            date_match = re.match(r'\[.*?(\w+)\s+(\w+)/(\d+)\]', line)
            if date_match:
                month_str = date_match.group(2)
                day = int(date_match.group(3))
                
                # Convert month abbreviation to number
                month_map = {
                    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
                    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
                }
                month = month_map.get(month_str[:3], 1)
                
                # Determine year based on season and month
                start_year = int(season_label.split('-')[0])
                if month >= 8:  # Aug-Dec
                    year = start_year
                else:  # Jan-Jul
                    year = start_year + 1
                
                try:
                    current_date = datetime(year, month, day)
                except:
                    current_date = None
                
                continue
            
            # Check for match line (format: "Team1 Score1-Score2 Team2")
            match_line = re.match(r'^(.+?)\s+(\d+)-(\d+)\s+(.+?)(?:\s+\[.*\])?$', line)
            
            if match_line and current_date:
                home_team = match_line.group(1).strip()
                home_score = int(match_line.group(2))
                away_score = int(match_line.group(3))
                away_team = match_line.group(4).strip()
                
                # Clean up team names (remove extra info)
                home_team = re.sub(r'\s+\[.*?\]$', '', home_team)
                away_team = re.sub(r'\s+\[.*?\]$', '', away_team)
                
                btts = 1 if (home_score > 0 and away_score > 0) else 0
                total_goals = home_score + away_score
                
                all_matches.append({
                    'date': current_date,
                    'home': home_team,
                    'away': away_team,
                    'home_score': home_score,
                    'away_score': away_score,
                    'btts': btts,
                    'total_goals': total_goals,
                    'season': season_label
                })
                
                matches_in_season += 1
        
        print(f"  ✓ Found {matches_in_season} matches")
    
    # Cleanup
    subprocess.run(['rm', '-rf', str(temp_dir)])
    
    if not all_matches:
        print("\n✗ No matches found")
        return None
    
    # Create DataFrame
    df = pd.DataFrame(all_matches)
    df = df.sort_values('date')
    
    # Summary
    print(f"\n{'='*60}")
    print(f"BUNDESLIGA SUMMARY")
    print(f"{'='*60}")
    print(f"Total matches: {len(df)}")
    print(f"Date range: {df['date'].min().date()} to {df['date'].max().date()}")
    print(f"BTTS rate: {df['btts'].mean():.1%}")
    print(f"Avg goals/game: {df['total_goals'].mean():.2f}")
    print(f"\nBy season:")
    for season in df['season'].unique():
        season_data = df[df['season'] == season]
        print(f"  {season}: {len(season_data)} matches, BTTS: {season_data['btts'].mean():.1%}")
    
    # Save
    output_dir = Path('data/bundesliga/')
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_file = output_dir / 'historical_results.csv'
    df.to_csv(output_file, index=False)
    print(f"\n✓ Saved to: {output_file}")
    
    return df

def fetch_bundesliga_odds():
    """
    Fetch BTTS odds for Bundesliga matches
    """
    print("\n" + "="*60)
    print("FETCHING BUNDESLIGA ODDS FROM THE ODDS API")
    print("="*60)
    
    # Load match results
    results_file = Path('data/bundesliga/historical_results.csv')
    if not results_file.exists():
        print("✗ No results file found")
        return None
    
    df_results = pd.read_csv(results_file)
    df_results['date'] = pd.to_datetime(df_results['date'])
    
    # Fetch odds from API
    url = 'https://api.the-odds-api.com/v4/sports/soccer_germany_bundesliga/odds-history/'
    
    all_odds = []
    dates_to_fetch = df_results['date'].dt.date.unique()
    
    print(f"\nFetching odds for {len(dates_to_fetch)} match dates...")
    
    for i, match_date in enumerate(dates_to_fetch[:10]):  # Limit to first 10 for testing
        params = {
            'apiKey': API_KEY,
            'regions': 'eu,uk',
            'markets': 'btts',
            'oddsFormat': 'decimal',
            'date': f'{match_date}T12:00:00Z'
        }
        
        try:
            response = requests.get(url, params=params)
            if response.status_code == 200:
                data = response.json()
                events = data.get('data', [])
                
                for event in events:
                    bookmakers = event.get('bookmakers', [])
                    for bookmaker in bookmakers:
                        if bookmaker.get('key') in ['pinnacle', 'betfair', 'bet365']:
                            markets = bookmaker.get('markets', [])
                            for market in markets:
                                if market.get('key') == 'btts':
                                    outcomes = {o['name']: o['price'] for o in market.get('outcomes', [])}
                                    
                                    all_odds.append({
                                        'date': event.get('commence_time'),
                                        'home': event.get('home_team'),
                                        'away': event.get('away_team'),
                                        'btts_yes_odds': outcomes.get('Yes'),
                                        'btts_no_odds': outcomes.get('No'),
                                        'bookmaker': bookmaker.get('key')
                                    })
                                    break
                            break
                
                if (i + 1) % 10 == 0:
                    print(f"  Progress: {i+1}/{len(dates_to_fetch)} dates")
            
            time.sleep(0.6)  # Rate limiting
            
        except Exception as e:
            print(f"  ✗ Error for {match_date}: {e}")
    
    if not all_odds:
        print("\n⚠ No odds data found - will use placeholder odds for training")
        return None
    
    # Save odds
    df_odds = pd.DataFrame(all_odds)
    odds_file = Path('data/bundesliga/closing_odds.csv')
    df_odds.to_csv(odds_file, index=False)
    print(f"\n✓ Saved {len(df_odds)} odds records to: {odds_file}")
    
    return df_odds

def fetch_serie_a():
    """
    Fetch Serie A data from openfootball (similar structure)
    """
    print("\n" + "="*60)
    print("FETCHING SERIE A FROM OPENFOOTBALL")
    print("="*60)
    
    # Clone repo
    temp_dir = Path('/tmp/italy')
    if temp_dir.exists():
        subprocess.run(['rm', '-rf', str(temp_dir)], check=True)
    
    print(f"\nCloning repository...")
    result = subprocess.run(
        ['git', 'clone', 'https://github.com/openfootball/italy.git', str(temp_dir)],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"✗ Clone failed: {result.stderr}")
        return None
    
    print(f"✓ Repository cloned")
    
    # Parse match files
    all_matches = []
    
    seasons = [
        ('2020-21', '1-seriea.txt'),
        ('2021-22', '1-seriea.txt'),
        ('2022-23', '1-seriea.txt'),
        ('2023-24', '1-seriea.txt'),
    ]
    
    for season_label, filename in seasons:
        season_dir = temp_dir / season_label
        match_file = season_dir / filename
        
        if not match_file.exists():
            print(f"\n✗ File not found: {match_file}")
            continue
        
        print(f"\nParsing {season_label}...")
        
        with open(match_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        current_date = None
        matches_in_season = 0
        
        for line in lines:
            line = line.strip()
            
            if not line or line.startswith('#') or line.startswith('##'):
                continue
            
            # Date line
            date_match = re.match(r'\[.*?(\w+)\s+(\w+)/(\d+)\]', line)
            if date_match:
                month_str = date_match.group(2)
                day = int(date_match.group(3))
                
                month_map = {
                    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
                    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
                }
                month = month_map.get(month_str[:3], 1)
                
                start_year = int(season_label.split('-')[0])
                year = start_year if month >= 8 else start_year + 1
                
                try:
                    current_date = datetime(year, month, day)
                except:
                    current_date = None
                
                continue
            
            # Match line
            match_line = re.match(r'^(.+?)\s+(\d+)-(\d+)\s+(.+?)(?:\s+\[.*\])?$', line)
            
            if match_line and current_date:
                home_team = match_line.group(1).strip()
                home_score = int(match_line.group(2))
                away_score = int(match_line.group(3))
                away_team = match_line.group(4).strip()
                
                home_team = re.sub(r'\s+\[.*?\]$', '', home_team)
                away_team = re.sub(r'\s+\[.*?\]$', '', away_team)
                
                btts = 1 if (home_score > 0 and away_score > 0) else 0
                total_goals = home_score + away_score
                
                all_matches.append({
                    'date': current_date,
                    'home': home_team,
                    'away': away_team,
                    'home_score': home_score,
                    'away_score': away_score,
                    'btts': btts,
                    'total_goals': total_goals,
                    'season': season_label
                })
                
                matches_in_season += 1
        
        print(f"  ✓ Found {matches_in_season} matches")
    
    # Cleanup
    subprocess.run(['rm', '-rf', str(temp_dir)])
    
    if not all_matches:
        print("\n✗ No matches found")
        return None
    
    # Create DataFrame
    df = pd.DataFrame(all_matches)
    df = df.sort_values('date')
    
    # Summary
    print(f"\n{'='*60}")
    print(f"SERIE A SUMMARY")
    print(f"{'='*60}")
    print(f"Total matches: {len(df)}")
    print(f"Date range: {df['date'].min().date()} to {df['date'].max().date()}")
    print(f"BTTS rate: {df['btts'].mean():.1%}")
    print(f"Avg goals/game: {df['total_goals'].mean():.2f}")
    print(f"\nBy season:")
    for season in df['season'].unique():
        season_data = df[df['season'] == season]
        print(f"  {season}: {len(season_data)} matches, BTTS: {season_data['btts'].mean():.1%}")
    
    # Save
    output_dir = Path('data/serie_a/')
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_file = output_dir / 'historical_results.csv'
    df.to_csv(output_file, index=False)
    print(f"\n✓ Saved to: {output_file}")
    
    return df

def main():
    print("="*60)
    print("SOCCER DATA FETCHER - OPENFOOTBALL + THE ODDS API")
    print("="*60)
    
    # Fetch Bundesliga
    df_bundesliga = fetch_bundesliga_from_git()
    
    if df_bundesliga is not None:
        # Try to fetch odds (optional)
        fetch_bundesliga_odds()
    
    # Fetch Serie A
    df_serie_a = fetch_serie_a()
    
    print("\n" + "="*60)
    print("FETCH COMPLETE")
    print("="*60)
    
    if df_bundesliga is not None or df_serie_a is not None:
        print("\nNext step:")
        print("  python scripts/soccer/train_league_profile_c.py")
    else:
        print("\n✗ No data fetched successfully")

if __name__ == '__main__':
    main()
