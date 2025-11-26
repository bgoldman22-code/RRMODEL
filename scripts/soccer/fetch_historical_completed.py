#!/usr/bin/env python3
"""
Fetch COMPLETED historical matches from past 2 seasons with odds
Uses The Odds API historical endpoint similar to NFL model

Usage:
    python scripts/soccer/fetch_historical_completed.py

Output:
    data/bundesliga/historical_completed_with_odds.csv (2023-24, 2024-25 completed)
    data/serie_a/historical_completed_with_odds.csv
"""

import pandas as pd
import requests
import time
from pathlib import Path
from datetime import datetime, timedelta
import re

API_KEY = 'c5d3fe15e6c5be83b2acd8695cff012b'  # WILL BE REMOVED AFTER RUN

LEAGUES = {
    'bundesliga': {
        'sport_key': 'soccer_germany_bundesliga',
        'features_file': 'data/bundesliga/matches_with_features.csv',
        'seasons': [
            ('2023-08-01', '2024-06-01', '2023-24'),  # Last season
            ('2024-08-01', '2024-11-26', '2024-25'),  # Current season completed matches
        ]
    },
    'serie_a': {
        'sport_key': 'soccer_italy_serie_a',
        'features_file': 'data/serie_a/matches_with_features.csv',
        'seasons': [
            ('2023-08-01', '2024-06-01', '2023-24'),
            ('2024-08-01', '2024-11-26', '2024-25'),
        ]
    }
}

PREFERRED_BOOKMAKERS = ['pinnacle', 'betfair', 'bet365', 'williamhill', 'unibet']

def normalize_team_name(name):
    """Normalize team names"""
    name = name.lower().strip()
    name = re.sub(r'\s+(fc|sc|sv|ssc|1\.|bv|asd|calcio)\s*', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    
    replacements = {
        'bayern munich': 'bayern', 'bayern münchen': 'bayern',
        'borussia dortmund': 'dortmund', 'bvb': 'dortmund',
        'rb leipzig': 'leipzig', '1. fc köln': 'koln',
        'vfl wolfsburg': 'wolfsburg', 'eintracht frankfurt': 'frankfurt',
        'tsg hoffenheim': 'hoffenheim', 'borussia monchengladbach': 'monchengladbach',
        'vfb stuttgart': 'stuttgart', 'werder bremen': 'bremen',
        'mainz 05': 'mainz', 'fsv mainz 05': 'mainz',
        'bayer leverkusen': 'leverkusen', 'hertha berlin': 'hertha',
        'union berlin': 'union', 'internazionale': 'inter',
        'inter milan': 'inter', 'ac milan': 'milan',
        'hellas verona': 'verona', 'atalanta bergamo': 'atalanta',
        'as roma': 'roma', 'ss lazio': 'lazio',
        'juventus': 'juventus', 'ssc napoli': 'napoli',
        'acf fiorentina': 'fiorentina',
    }
    
    for old, new in replacements.items():
        if old in name:
            return new
    
    return name.split()[0] if name else name

def fetch_btts_odds_for_event(sport_key, event_id, event_commence_time):
    """
    Fetch BTTS odds for a specific event
    Use timestamp BEFORE match starts to get closing lines
    """
    # Get timestamp 30 minutes before match
    match_time = pd.to_datetime(event_commence_time)
    closing_time = (match_time - timedelta(minutes=30)).strftime('%Y-%m-%dT%H:%M:%SZ')
    
    url = f'{BASE_URL}/historical/sports/{sport_key}/events/{event_id}/odds'
    
    params = {
        'apiKey': API_KEY,
        'regions': 'eu,uk',
        'markets': 'btts',
        'oddsFormat': 'decimal',
        'date': closing_time
    }
    
    try:
        response = requests.get(url, params=params, timeout=20)
        
        if response.status_code != 200:
            return None, None, None
        
        event_data = response.json()
        bookmakers = event_data.get('data', {}).get('bookmakers', [])
        
        if not bookmakers:
            return None, None, None
        
        # Find BTTS odds from preferred bookmaker
        btts_yes = None
        btts_no = None
        bookmaker_used = None
        
        for pref in PREFERRED_BOOKMAKERS:
            for bm in bookmakers:
                if bm.get('key') == pref:
                    for market in bm.get('markets', []):
                        if market.get('key') == 'btts':
                            for outcome in market.get('outcomes', []):
                                if outcome.get('name') == 'Yes':
                                    btts_yes = outcome.get('price')
                                elif outcome.get('name') == 'No':
                                    btts_no = outcome.get('price')
                            
                            if btts_yes and btts_no:
                                bookmaker_used = pref
                                return btts_yes, btts_no, bookmaker_used
        
        # Fallback to any bookmaker
        for bm in bookmakers:
            for market in bm.get('markets', []):
                if market.get('key') == 'btts':
                    for outcome in market.get('outcomes', []):
                        if outcome.get('name') == 'Yes':
                            btts_yes = outcome.get('price')
                        elif outcome.get('name') == 'No':
                            btts_no = outcome.get('price')
                    
                    if btts_yes and btts_no:
                        bookmaker_used = bm.get('key')
                        return btts_yes, btts_no, bookmaker_used
        
        return None, None, None
        
    except Exception as e:
        return None, None, None

def fetch_historical_snapshot(sport_key, date):
    """
    Two-step process:
    1. Get events with h2h market
    2. For each event, get BTTS odds separately
    """
    url = f'{BASE_URL}/historical/sports/{sport_key}/odds'
    
    # Format date as ISO 8601 timestamp
    timestamp = f'{date}T12:00:00Z'
    
    params = {
        'apiKey': API_KEY,
        'regions': 'eu,uk',
        'markets': 'h2h',  # Only h2h available in main endpoint
        'oddsFormat': 'decimal',
        'date': timestamp
    }
    
    try:
        response = requests.get(url, params=params, timeout=20)
        
        if response.status_code != 200:
            return None
        
        snapshot = response.json()
        events = snapshot.get('data', [])
        
        if not events:
            return None
        
        # Now fetch BTTS odds for each event
        matches = []
        for i, event in enumerate(events):
            event_id = event.get('id')
            event_commence_time = event.get('commence_time')
            
            if not event_id or not event_commence_time:
                continue
            
            # Fetch BTTS odds
            btts_yes, btts_no, bookmaker = fetch_btts_odds_for_event(
                sport_key, event_id, event_commence_time
            )
            
            if btts_yes and btts_no:
                matches.append({
                    'date': pd.to_datetime(event_commence_time),
                    'home': normalize_team_name(event.get('home_team', '')),
                    'away': normalize_team_name(event.get('away_team', '')),
                    'btts_yes_odds': btts_yes,
                    'btts_no_odds': btts_no,
                    'bookmaker': bookmaker,
                    'snapshot_date': date
                })
            
            # Rate limiting between event requests
            time.sleep(0.8)
        
        return matches
        
    except Exception as e:
        print(f"    ✗ Error: {e}")
        return None

BASE_URL = 'https://api.the-odds-api.com/v4'

def fetch_season_odds(sport_key, start_date, end_date, season_label):
    """
    Fetch historical odds for an entire season
    Sample weekly to capture closing lines
    """
    print(f"\n  Season {season_label}: {start_date} to {end_date}")
    
    all_matches = []
    current_date = datetime.strptime(start_date, '%Y-%m-%d')
    end_dt = datetime.strptime(end_date, '%Y-%m-%d')
    
    snapshots_fetched = 0
    
    while current_date <= end_dt:
        date_str = current_date.strftime('%Y-%m-%d')
        
        matches = fetch_historical_snapshot(sport_key, date_str)
        
        if matches:
            all_matches.extend(matches)
            snapshots_fetched += 1
            
            if snapshots_fetched % 5 == 0:
                print(f"    Progress: {date_str}, {len(all_matches)} odds collected")
        
        # Move forward by 7 days (weekly snapshots)
        current_date += timedelta(days=7)
        
        # Rate limiting
        time.sleep(1.0)
    
    print(f"    ✓ {snapshots_fetched} snapshots, {len(all_matches)} matches with odds")
    
    return all_matches

def process_league(league_key):
    """
    Process a single league
    """
    config = LEAGUES[league_key]
    
    print(f"\n{'='*60}")
    print(f"FETCHING {league_key.upper()} HISTORICAL ODDS")
    print(f"{'='*60}")
    
    all_matches = []
    
    # Fetch each season
    for start_date, end_date, season_label in config['seasons']:
        matches = fetch_season_odds(config['sport_key'], start_date, end_date, season_label)
        
        if matches:
            # Add season label
            for match in matches:
                match['season'] = season_label
            
            all_matches.extend(matches)
    
    if not all_matches:
        print(f"\n✗ No historical odds found for {league_key}")
        return None
    
    # Create DataFrame
    df = pd.DataFrame(all_matches)
    
    # Remove duplicates (keep most recent snapshot per match)
    df = df.sort_values('snapshot_date', ascending=False)
    df = df.drop_duplicates(subset=['home', 'away', 'date'], keep='first')
    df = df.drop(columns=['snapshot_date'])
    df = df.sort_values('date')
    
    # Summary
    print(f"\n{'='*60}")
    print(f"{league_key.upper()} SUMMARY")
    print(f"{'='*60}")
    print(f"Total matches with odds: {len(df)}")
    print(f"Date range: {df['date'].min().date()} to {df['date'].max().date()}")
    print(f"Avg BTTS YES odds: {df['btts_yes_odds'].mean():.2f}")
    print(f"Avg BTTS NO odds: {df['btts_no_odds'].mean():.2f}")
    print(f"\nBookmaker distribution:")
    print(df['bookmaker'].value_counts())
    print(f"\nBy season:")
    for season in df['season'].unique():
        season_data = df[df['season'] == season]
        print(f"  {season}: {len(season_data)} matches")
    
    # Save
    output_dir = Path(f'data/{league_key}/')
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_file = output_dir / 'historical_completed_with_odds.csv'
    df.to_csv(output_file, index=False)
    print(f"\n✓ Saved to: {output_file}")
    
    return df

def main():
    print("="*60)
    print("FETCH HISTORICAL COMPLETED MATCHES WITH ODDS")
    print("="*60)
    print("\nFocusing on 2023-24 and 2024-25 seasons (completed matches)")
    print("Using TheOddsAPI historical endpoint (same as NFL model)")
    print()
    
    # Check API
    try:
        response = requests.get(
            'https://api.the-odds-api.com/v4/sports/',
            params={'apiKey': API_KEY},
            timeout=10
        )
        remaining = response.headers.get('x-requests-remaining', 'Unknown')
        print(f"API requests remaining: {remaining}\n")
    except:
        print("⚠ Could not check API quota\n")
    
    # Process leagues
    results = {}
    for league_key in LEAGUES.keys():
        df = process_league(league_key)
        if df is not None:
            results[league_key] = df
    
    print("\n" + "="*60)
    print("COMPLETE")
    print("="*60)
    
    if results:
        print("\n✓ Historical odds collected:")
        for league_key, df in results.items():
            print(f"  {league_key}: {len(df)} matches with odds")
        
        print("\nNext steps:")
        print("  1. Merge with features data")
        print("  2. Train models on 2020-23 (features only)")
        print("  3. Validate on 2023-24 and 2024-25 (features + odds)")
        print("\nRun: python scripts/soccer/train_comprehensive_model.py")
    else:
        print("\n✗ No data collected")

if __name__ == '__main__':
    main()
