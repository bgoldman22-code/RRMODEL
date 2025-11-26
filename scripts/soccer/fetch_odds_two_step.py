#!/usr/bin/env python3
"""
Fetch historical BTTS odds using two-step approach:
1. Get historical events (match list)
2. Get BTTS odds for each event

Usage:
    python scripts/soccer/fetch_odds_two_step.py

Output:
    data/bundesliga/complete_dataset.csv
    data/serie_a/complete_dataset.csv
"""

import pandas as pd
import requests
import time
from pathlib import Path
from datetime import datetime, timedelta
import re
import os

API_KEY = os.environ.get('ODDS_API_KEY')  # Set via: export ODDS_API_KEY=your_key

if not API_KEY:
    print("❌ ERROR: ODDS_API_KEY environment variable not set")
    print("Please run: export ODDS_API_KEY=your_key")
    exit(1)

LEAGUES = {
    'bundesliga': {
        'sport_key': 'soccer_germany_bundesliga',
        'features_file': 'data/bundesliga/matches_with_features.csv',
        'output_file': 'data/bundesliga/complete_dataset.csv'
    },
    'serie_a': {
        'sport_key': 'soccer_italy_serie_a',
        'features_file': 'data/serie_a/matches_with_features.csv',
        'output_file': 'data/serie_a/complete_dataset.csv'
    }
}

PREFERRED_BOOKMAKERS = ['pinnacle', 'betfair', 'bet365', 'williamhill', 'unibet']

def normalize_team_name(name):
    """Normalize team names for matching"""
    name = name.lower().strip()
    name = re.sub(r'\s+(fc|sc|sv|ssc|1\.|bv|asd|calcio)\s*', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    
    replacements = {
        'bayern munich': 'bayern', 'bayern münchen': 'bayern', 'fc bayern': 'bayern',
        'borussia dortmund': 'dortmund', 'bvb': 'dortmund',
        'rb leipzig': 'leipzig', 'rasenballsport leipzig': 'leipzig',
        '1. fc köln': 'koln', 'fc köln': 'koln', 'cologne': 'koln',
        'vfl wolfsburg': 'wolfsburg', 'eintracht frankfurt': 'frankfurt',
        'tsg hoffenheim': 'hoffenheim', 'tsg 1899 hoffenheim': 'hoffenheim',
        'borussia monchengladbach': 'monchengladbach', 'gladbach': 'monchengladbach',
        'vfb stuttgart': 'stuttgart', 'werder bremen': 'bremen',
        'mainz 05': 'mainz', '1. fsv mainz 05': 'mainz',
        'bayer leverkusen': 'leverkusen', 'bayer 04 leverkusen': 'leverkusen',
        'hertha berlin': 'hertha', 'hertha bsc': 'hertha',
        'union berlin': 'union', '1. fc union berlin': 'union',
        'internazionale': 'inter', 'inter milan': 'inter', 'fc internazionale milano': 'inter',
        'ac milan': 'milan', 'associazione calcio milan': 'milan',
        'hellas verona': 'verona', 'atalanta bergamo': 'atalanta',
        'as roma': 'roma', 'ss lazio': 'lazio',
        'juventus': 'juventus', 'juventus fc': 'juventus',
        'ssc napoli': 'napoli', 'acf fiorentina': 'fiorentina',
    }
    
    for old, new in replacements.items():
        if old in name:
            return new
    
    return name.split()[0] if name else name

def fetch_historical_events_for_date(sport_key, date):
    """
    Step 1: Get historical events for a specific date
    """
    url = f'https://api.the-odds-api.com/v4/historical/sports/{sport_key}/events/'
    
    params = {
        'apiKey': API_KEY,
        'date': date.strftime('%Y-%m-%dT12:00:00Z'),
        'dateFormat': 'iso'
    }
    
    try:
        response = requests.get(url, params=params, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            return data.get('data', [])
        elif response.status_code == 422:
            # Try alternative format
            params['date'] = date.strftime('%Y-%m-%d')
            response = requests.get(url, params=params, timeout=15)
            if response.status_code == 200:
                data = response.json()
                return data.get('data', [])
        
        return []
    except Exception as e:
        print(f"    ✗ Error fetching events for {date.date()}: {e}")
        return []

def fetch_btts_odds_for_event(sport_key, event_id):
    """
    Step 2: Get BTTS odds for a specific event
    """
    url = f'https://api.the-odds-api.com/v4/historical/sports/{sport_key}/events/{event_id}/odds/'
    
    params = {
        'apiKey': API_KEY,
        'regions': 'eu,uk',
        'markets': 'btts',
        'oddsFormat': 'decimal',
        'dateFormat': 'iso'
    }
    
    try:
        response = requests.get(url, params=params, timeout=15)
        
        if response.status_code == 200:
            return response.json()
        
        return None
    except Exception as e:
        return None

def extract_btts_odds(event_data):
    """
    Extract best BTTS odds from event data
    """
    if not event_data or 'bookmakers' not in event_data:
        return None, None, None
    
    btts_yes = None
    btts_no = None
    bookmaker_used = None
    
    bookmakers = event_data.get('bookmakers', [])
    
    # Try preferred bookmakers first
    for pref in PREFERRED_BOOKMAKERS:
        for bm in bookmakers:
            if bm.get('key') == pref:
                for market in bm.get('markets', []):
                    if market.get('key') == 'btts':
                        outcomes = market.get('outcomes', [])
                        for outcome in outcomes:
                            if outcome.get('name') == 'Yes':
                                btts_yes = outcome.get('price')
                            elif outcome.get('name') == 'No':
                                btts_no = outcome.get('price')
                        
                        if btts_yes and btts_no:
                            bookmaker_used = pref
                            return btts_yes, btts_no, bookmaker_used
    
    # If no preferred bookmaker, use any available
    for bm in bookmakers:
        for market in bm.get('markets', []):
            if market.get('key') == 'btts':
                outcomes = market.get('outcomes', [])
                for outcome in outcomes:
                    if outcome.get('name') == 'Yes':
                        btts_yes = outcome.get('price')
                    elif outcome.get('name') == 'No':
                        btts_no = outcome.get('price')
                
                if btts_yes and btts_no:
                    bookmaker_used = bm.get('key')
                    return btts_yes, btts_no, bookmaker_used
    
    return None, None, None

def fetch_odds_for_league(sport_key, start_date, end_date):
    """
    Fetch historical BTTS odds for a league
    """
    print(f"  Fetching odds from {start_date.date()} to {end_date.date()}...")
    
    all_odds = []
    current_date = start_date
    dates_checked = 0
    events_found = 0
    odds_fetched = 0
    
    while current_date <= end_date:
        # Step 1: Get events for this date
        events = fetch_historical_events_for_date(sport_key, current_date)
        dates_checked += 1
        
        if events:
            events_found += len(events)
            
            for event in events:
                event_id = event.get('id')
                
                if not event_id:
                    continue
                
                # Step 2: Get BTTS odds for this event
                event_data = fetch_btts_odds_for_event(sport_key, event_id)
                
                if event_data:
                    btts_yes, btts_no, bookmaker = extract_btts_odds(event_data)
                    
                    if btts_yes and btts_no:
                        all_odds.append({
                            'date': pd.to_datetime(event.get('commence_time')),
                            'home': normalize_team_name(event.get('home_team', '')),
                            'away': normalize_team_name(event.get('away_team', '')),
                            'btts_yes_odds': btts_yes,
                            'btts_no_odds': btts_no,
                            'bookmaker': bookmaker
                        })
                        odds_fetched += 1
                
                # Rate limiting between event requests
                time.sleep(0.8)
        
        # Progress update every 30 days
        if dates_checked % 30 == 0:
            print(f"    Progress: {current_date.date()}, {odds_fetched} odds collected from {events_found} events")
        
        current_date += timedelta(days=7)  # Check weekly to save requests
        time.sleep(0.7)
    
    print(f"  ✓ Collected {odds_fetched} odds from {events_found} events ({dates_checked} dates checked)")
    
    return pd.DataFrame(all_odds) if all_odds else None

def merge_odds_with_features(league_key):
    """
    Merge odds data with feature data
    """
    config = LEAGUES[league_key]
    
    print(f"\n{'='*60}")
    print(f"PROCESSING {league_key.upper()}")
    print(f"{'='*60}")
    
    # Load features
    features_file = Path(config['features_file'])
    if not features_file.exists():
        print(f"✗ Features file not found: {features_file}")
        return None
    
    df_features = pd.read_csv(features_file)
    df_features['date'] = pd.to_datetime(df_features['date'])
    print(f"Loaded {len(df_features)} matches with features")
    
    # Normalize team names
    df_features['home_normalized'] = df_features['home'].apply(normalize_team_name)
    df_features['away_normalized'] = df_features['away'].apply(normalize_team_name)
    
    # Date range
    min_date = df_features['date'].min()
    max_date = df_features['date'].max()
    print(f"Date range: {min_date.date()} to {max_date.date()}")
    
    # Fetch odds
    print(f"\nFetching odds from The Odds API (two-step process)...")
    df_odds = fetch_odds_for_league(config['sport_key'], min_date, max_date)
    
    if df_odds is None or len(df_odds) == 0:
        print("⚠ No odds data fetched - creating dataset without odds")
        df_complete = df_features.copy()
        df_complete['btts_yes_odds'] = None
        df_complete['btts_no_odds'] = None
        df_complete['bookmaker'] = None
    else:
        # Merge
        print(f"\nMerging {len(df_odds)} odds with features...")
        
        df_odds['date_only'] = df_odds['date'].dt.date
        df_features['date_only'] = df_features['date'].dt.date
        
        df_merged = pd.merge(
            df_features,
            df_odds[['home', 'away', 'date_only', 'btts_yes_odds', 'btts_no_odds', 'bookmaker']],
            left_on=['home_normalized', 'away_normalized', 'date_only'],
            right_on=['home', 'away', 'date_only'],
            how='left',
            suffixes=('', '_odds')
        )
        
        # Cleanup
        df_complete = df_merged.drop(columns=['home_normalized', 'away_normalized', 'date_only', 'home_odds', 'away_odds', 'date_only_odds'], errors='ignore')
        
        matches_with_odds = df_complete['btts_yes_odds'].notna().sum()
        print(f"✓ Matched {matches_with_odds}/{len(df_complete)} matches with odds ({matches_with_odds/len(df_complete)*100:.1f}%)")
    
    # Save
    output_file = Path(config['output_file'])
    df_complete.to_csv(output_file, index=False)
    print(f"\n✓ Saved to: {output_file}")
    
    # Summary
    print(f"\nDataset summary:")
    print(f"  Total matches: {len(df_complete)}")
    print(f"  Features: {len([c for c in df_complete.columns if '_' in c and 'odds' not in c])}")
    print(f"  Matches with odds: {df_complete['btts_yes_odds'].notna().sum()}")
    if df_complete['btts_yes_odds'].notna().any():
        print(f"  Avg BTTS YES odds: {df_complete['btts_yes_odds'].mean():.2f}")
        print(f"  Avg BTTS NO odds: {df_complete['btts_no_odds'].mean():.2f}")
    
    return df_complete

def main():
    print("="*60)
    print("FETCH HISTORICAL BTTS ODDS (TWO-STEP APPROACH)")
    print("="*60)
    
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
        df = merge_odds_with_features(league_key)
        if df is not None:
            results[league_key] = df
    
    print("\n" + "="*60)
    print("COMPLETE")
    print("="*60)
    
    if results:
        print("\n✓ Datasets created:")
        for league_key, df in results.items():
            odds_pct = df['btts_yes_odds'].notna().sum() / len(df) * 100
            print(f"  {league_key}: {len(df)} matches, {odds_pct:.1f}% with odds")
        
        print("\nNext step:")
        print("  python scripts/soccer/train_comprehensive_model.py")

if __name__ == '__main__':
    main()
