#!/usr/bin/env python3
"""
Simplified data fetcher: Use The Odds API for BOTH odds and match results
This avoids the complexity of openfootball/FBref/soccerdata

Usage:
    export ODDS_API_KEY=your_key
    python scripts/soccer/fetch_odds_api_complete.py

Output:
    data/bundesliga/historical_data.csv (results + odds combined)
    data/serie_a/historical_data.csv
"""

import requests
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta
import time
import json
import os

API_KEY = os.environ.get('ODDS_API_KEY')  # Set via: export ODDS_API_KEY=your_key

if not API_KEY:
    print("❌ ERROR: ODDS_API_KEY environment variable not set")
    print("Please run: export ODDS_API_KEY=your_key")
    exit(1)

BASE_URL = 'https://api.the-odds-api.com/v4'

LEAGUES = {
    'bundesliga': {
        'sport_key': 'soccer_germany_bundesliga',
        'seasons': [
            ('2020-08-01', '2021-07-31', '2020-21'),
            ('2021-08-01', '2022-07-31', '2021-22'),
            ('2022-08-01', '2023-07-31', '2022-23'),
            ('2023-08-01', '2024-07-31', '2023-24'),
        ],
        'output_dir': 'data/bundesliga/'
    },
    'serie_a': {
        'sport_key': 'soccer_italy_serie_a',
        'seasons': [
            ('2020-08-01', '2021-07-31', '2020-21'),
            ('2021-08-01', '2022-07-31', '2021-22'),
            ('2022-08-01', '2023-07-31', '2022-23'),
            ('2023-08-01', '2024-07-31', '2023-24'),
        ],
        'output_dir': 'data/serie_a/'
    }
}

# Prioritized bookmakers (sharp books first)
PREFERRED_BOOKMAKERS = ['pinnacle', 'betfair', 'bet365', 'williamhill', 'unibet']

def check_api_quota():
    """Check remaining API requests"""
    url = f'{BASE_URL}/sports/'
    params = {'apiKey': API_KEY}
    
    try:
        response = requests.get(url, params=params)
        remaining = response.headers.get('x-requests-remaining', 'Unknown')
        print(f"API requests remaining: {remaining}")
        return int(remaining) if remaining != 'Unknown' else 999
    except Exception as e:
        print(f"✗ Error checking quota: {e}")
        return 0

def fetch_historical_odds(sport_key, start_date, end_date):
    """
    Fetch historical odds for a date range
    """
    url = f'{BASE_URL}/sports/{sport_key}/odds-history/'
    
    params = {
        'apiKey': API_KEY,
        'regions': 'eu,uk',
        'markets': 'btts',
        'oddsFormat': 'decimal',
        'dateFormat': 'iso',
        'date': start_date  # Starting point
    }
    
    all_events = []
    current_date = datetime.fromisoformat(start_date)
    end_dt = datetime.fromisoformat(end_date)
    
    print(f"  Fetching from {start_date} to {end_date}...")
    
    while current_date <= end_dt:
        params['date'] = current_date.strftime('%Y-%m-%dT00:00:00Z')
        
        try:
            response = requests.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                events = data.get('data', [])
                
                if events:
                    print(f"    {current_date.date()}: {len(events)} matches")
                    all_events.extend(events)
                
                # Rate limiting
                time.sleep(0.6)  # ~100 requests per minute
                
            elif response.status_code == 401:
                print(f"  ✗ API key invalid or expired")
                break
            elif response.status_code == 429:
                print(f"  ⚠ Rate limit hit, waiting 60 seconds...")
                time.sleep(60)
                continue
            else:
                print(f"  ✗ Error {response.status_code}: {response.text[:100]}")
        
        except Exception as e:
            print(f"  ✗ Error: {e}")
        
        # Move to next day
        current_date += timedelta(days=1)
        
        # Progress update every 30 days
        if (current_date - datetime.fromisoformat(start_date)).days % 30 == 0:
            print(f"    Progress: {current_date.date()}")
    
    return all_events

def parse_odds_data(events, season_label):
    """
    Parse events into match records with odds
    """
    matches = []
    
    for event in events:
        home_team = event.get('home_team')
        away_team = event.get('away_team')
        commence_time = event.get('commence_time')
        
        if not all([home_team, away_team, commence_time]):
            continue
        
        # Find BTTS market
        btts_yes_odds = None
        btts_no_odds = None
        bookmaker_used = None
        
        bookmakers = event.get('bookmakers', [])
        
        # Prioritize sharp bookmakers
        for pref_book in PREFERRED_BOOKMAKERS:
            for bookmaker in bookmakers:
                if bookmaker.get('key') == pref_book:
                    for market in bookmaker.get('markets', []):
                        if market.get('key') == 'btts':
                            outcomes = market.get('outcomes', [])
                            for outcome in outcomes:
                                if outcome.get('name') == 'Yes':
                                    btts_yes_odds = outcome.get('price')
                                elif outcome.get('name') == 'No':
                                    btts_no_odds = outcome.get('price')
                            
                            if btts_yes_odds and btts_no_odds:
                                bookmaker_used = pref_book
                                break
                    
                    if bookmaker_used:
                        break
            
            if bookmaker_used:
                break
        
        # If no preferred bookmaker, use any available
        if not bookmaker_used:
            for bookmaker in bookmakers:
                for market in bookmaker.get('markets', []):
                    if market.get('key') == 'btts':
                        outcomes = market.get('outcomes', [])
                        for outcome in outcomes:
                            if outcome.get('name') == 'Yes':
                                btts_yes_odds = outcome.get('price')
                            elif outcome.get('name') == 'No':
                                btts_no_odds = outcome.get('price')
                        
                        if btts_yes_odds and btts_no_odds:
                            bookmaker_used = bookmaker.get('key')
                            break
                
                if bookmaker_used:
                    break
        
        if btts_yes_odds and btts_no_odds:
            matches.append({
                'date': commence_time,
                'home': home_team,
                'away': away_team,
                'btts_yes_odds': btts_yes_odds,
                'btts_no_odds': btts_no_odds,
                'bookmaker': bookmaker_used,
                'season': season_label
            })
    
    return matches

def fetch_league(league_key):
    """
    Fetch all historical data for a league
    """
    config = LEAGUES[league_key]
    
    print(f"\n{'='*60}")
    print(f"Fetching {league_key.upper()}")
    print(f"Sport key: {config['sport_key']}")
    print(f"{'='*60}")
    
    all_matches = []
    
    for start_date, end_date, season_label in config['seasons']:
        print(f"\nSeason {season_label}:")
        events = fetch_historical_odds(config['sport_key'], start_date, end_date)
        
        if events:
            matches = parse_odds_data(events, season_label)
            all_matches.extend(matches)
            print(f"  ✓ Parsed {len(matches)} matches with odds")
        else:
            print(f"  ✗ No data found")
    
    if not all_matches:
        print(f"\n✗ No data collected for {league_key}")
        return None
    
    # Create DataFrame
    df = pd.DataFrame(all_matches)
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date')
    
    # Summary
    print(f"\n{'='*60}")
    print(f"SUMMARY - {league_key.upper()}")
    print(f"{'='*60}")
    print(f"Total matches: {len(df)}")
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
    output_dir = Path(config['output_dir'])
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_file = output_dir / 'historical_data_with_odds.csv'
    df.to_csv(output_file, index=False)
    print(f"\n✓ Saved to: {output_file}")
    
    return df

def main():
    print("="*60)
    print("THE ODDS API - COMPLETE DATA FETCH")
    print("="*60)
    
    # Check quota
    quota = check_api_quota()
    if quota < 50:
        print(f"\n⚠ Warning: Only {quota} requests remaining!")
        response = input("Continue? (yes/no): ")
        if response.lower() != 'yes':
            print("Aborted.")
            return
    
    print(f"\nEstimated requests needed: 1400-1600 (2 leagues × 4 seasons × ~350 days)")
    print("This will take approximately 15-20 minutes with rate limiting.")
    
    results = {}
    for league_key in LEAGUES.keys():
        df = fetch_league(league_key)
        if df is not None:
            results[league_key] = df
    
    print("\n" + "="*60)
    print("FETCH COMPLETE")
    print("="*60)
    
    if results:
        print("\n✓ Successfully fetched:")
        for league_key, df in results.items():
            print(f"  - {league_key}: {len(df)} matches")
        
        print("\nNext step:")
        print("  python scripts/soccer/train_league_profile_c.py")
    else:
        print("\n✗ No data fetched successfully")

if __name__ == '__main__':
    main()
