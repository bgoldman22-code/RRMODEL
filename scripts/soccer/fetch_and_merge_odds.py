#!/usr/bin/env python3
"""
Fetch historical BTTS odds and merge with feature data

Usage:
    python scripts/soccer/fetch_and_merge_odds.py

Output:
    data/bundesliga/complete_dataset.csv (features + odds)
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
    # Remove common variations
    name = name.lower().strip()
    name = re.sub(r'\s+(fc|sc|sv|ssc|1\.|bv|asd|calcio)\s*', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    
    # Common substitutions
    replacements = {
        'bayern munich': 'bayern',
        'bayern münchen': 'bayern',
        'borussia dortmund': 'dortmund',
        'rb leipzig': 'leipzig',
        '1. fc köln': 'koln',
        'fc köln': 'koln',
        'vfl wolfsburg': 'wolfsburg',
        'eintracht frankfurt': 'frankfurt',
        'tsg hoffenheim': 'hoffenheim',
        'internazionale': 'inter',
        'inter milan': 'inter',
        'ac milan': 'milan',
        'hellas verona': 'verona',
    }
    
    for old, new in replacements.items():
        if old in name:
            return new
    
    return name

def fetch_odds_for_date_range(sport_key, start_date, end_date):
    """
    Fetch historical odds for a specific date range
    """
    url = f'https://api.the-odds-api.com/v4/sports/{sport_key}/odds-history/'
    
    all_odds = []
    current_date = start_date
    
    print(f"  Fetching odds from {start_date.date()} to {end_date.date()}...")
    
    requests_made = 0
    while current_date <= end_date:
        params = {
            'apiKey': API_KEY,
            'regions': 'eu,uk',
            'markets': 'btts',
            'oddsFormat': 'decimal',
            'date': current_date.strftime('%Y-%m-%dT12:00:00Z')
        }
        
        try:
            response = requests.get(url, params=params, timeout=15)
            requests_made += 1
            
            if response.status_code == 200:
                data = response.json()
                events = data.get('data', [])
                
                for event in events:
                    # Find best BTTS odds
                    btts_yes = None
                    btts_no = None
                    bookmaker_used = None
                    
                    bookmakers = event.get('bookmakers', [])
                    
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
                                            break
                                if bookmaker_used:
                                    break
                        if bookmaker_used:
                            break
                    
                    # If no preferred bookmaker, use any available
                    if not bookmaker_used:
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
                                        break
                            if bookmaker_used:
                                break
                    
                    if btts_yes and btts_no:
                        all_odds.append({
                            'date': pd.to_datetime(event.get('commence_time')),
                            'home': normalize_team_name(event.get('home_team', '')),
                            'away': normalize_team_name(event.get('away_team', '')),
                            'btts_yes_odds': btts_yes,
                            'btts_no_odds': btts_no,
                            'bookmaker': bookmaker_used
                        })
                
                if events and requests_made % 20 == 0:
                    print(f"    Progress: {current_date.date()}, {len(all_odds)} odds collected")
            
            elif response.status_code == 401:
                print(f"  ✗ API key invalid")
                break
            elif response.status_code == 429:
                print(f"  ⚠ Rate limit hit, waiting...")
                time.sleep(60)
                continue
            
            # Rate limiting
            time.sleep(0.7)  # ~85 requests per minute
            
        except Exception as e:
            print(f"  ✗ Error on {current_date.date()}: {e}")
        
        current_date += timedelta(days=1)
    
    print(f"  ✓ Collected {len(all_odds)} odds records ({requests_made} API requests)")
    
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
    
    # Normalize team names in features
    df_features['home_normalized'] = df_features['home'].apply(normalize_team_name)
    df_features['away_normalized'] = df_features['away'].apply(normalize_team_name)
    
    # Determine date range
    min_date = df_features['date'].min()
    max_date = df_features['date'].max()
    
    print(f"Date range: {min_date.date()} to {max_date.date()}")
    
    # Fetch odds
    print(f"\nFetching odds from The Odds API...")
    df_odds = fetch_odds_for_date_range(config['sport_key'], min_date, max_date)
    
    if df_odds is None or len(df_odds) == 0:
        print("⚠ No odds data fetched - creating dataset without odds")
        df_complete = df_features.copy()
        df_complete['btts_yes_odds'] = None
        df_complete['btts_no_odds'] = None
        df_complete['bookmaker'] = None
    else:
        # Merge odds with features
        print(f"\nMerging odds with features...")
        
        df_merged = pd.merge(
            df_features,
            df_odds,
            left_on=['home_normalized', 'away_normalized', df_features['date'].dt.date],
            right_on=['home', 'away', df_odds['date'].dt.date],
            how='left',
            suffixes=('', '_odds')
        )
        
        # Drop duplicate columns
        cols_to_drop = [c for c in df_merged.columns if c.endswith('_odds') and c != 'btts_yes_odds' and c != 'btts_no_odds']
        df_complete = df_merged.drop(columns=cols_to_drop + ['home_normalized', 'away_normalized'])
        
        matches_with_odds = df_complete['btts_yes_odds'].notna().sum()
        print(f"✓ Matched {matches_with_odds}/{len(df_complete)} matches with odds ({matches_with_odds/len(df_complete)*100:.1f}%)")
    
    # Save complete dataset
    output_file = Path(config['output_file'])
    df_complete.to_csv(output_file, index=False)
    print(f"\n✓ Saved complete dataset to: {output_file}")
    
    # Summary
    print(f"\nDataset summary:")
    print(f"  Total matches: {len(df_complete)}")
    print(f"  Features: {len([c for c in df_complete.columns if c not in ['date', 'home', 'away', 'season', 'btts_yes_odds', 'btts_no_odds', 'bookmaker']])}")
    print(f"  Matches with odds: {df_complete['btts_yes_odds'].notna().sum()}")
    if df_complete['btts_yes_odds'].notna().any():
        print(f"  Avg BTTS YES odds: {df_complete['btts_yes_odds'].mean():.2f}")
        print(f"  Avg BTTS NO odds: {df_complete['btts_no_odds'].mean():.2f}")
    
    return df_complete

def main():
    print("="*60)
    print("FETCH AND MERGE HISTORICAL ODDS")
    print("="*60)
    
    # Check API quota
    try:
        response = requests.get(
            'https://api.the-odds-api.com/v4/sports/',
            params={'apiKey': API_KEY},
            timeout=10
        )
        remaining = response.headers.get('x-requests-remaining', 'Unknown')
        print(f"API requests remaining: {remaining}")
        
        if remaining != 'Unknown' and int(remaining) < 100:
            print(f"\n⚠ Warning: Only {remaining} requests left!")
            print("Estimated needs: ~1400 requests for both leagues")
    except:
        print("⚠ Could not check API quota")
    
    # Process each league
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
            odds_coverage = df['btts_yes_odds'].notna().sum() / len(df) * 100
            print(f"  {league_key}: {len(df)} matches, {odds_coverage:.1f}% with odds")
        
        print("\nNext step:")
        print("  python scripts/soccer/train_comprehensive_model.py")
    else:
        print("\n✗ No datasets created")

if __name__ == '__main__':
    main()
