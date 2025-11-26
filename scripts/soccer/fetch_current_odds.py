#!/usr/bin/env python3
"""
Fetch CURRENT season (2024-25) BTTS odds for validation
We'll train models on 2020-24 WITHOUT odds, then validate on 2024-25 WITH odds

Usage:
    python scripts/soccer/fetch_current_odds.py

Output:
    data/bundesliga/season_2024_25_with_odds.csv
    data/serie_a/season_2024_25_with_odds.csv
"""

import pandas as pd
import requests
import time
from pathlib import Path
from datetime import datetime
import re

API_KEY = 'c5d3fe15e6c5be83b2acd8695cff012b'  # WILL BE REMOVED AFTER RUN

LEAGUES = {
    'bundesliga': {
        'sport_key': 'soccer_germany_bundesliga',
        'features_file': 'data/bundesliga/matches_with_features.csv'
    },
    'serie_a': {
        'sport_key': 'soccer_italy_serie_a',
        'features_file': 'data/serie_a/matches_with_features.csv'
    }
}

PREFERRED_BOOKMAKERS = ['pinnacle', 'betfair', 'bet365', 'williamhill', 'unibet']

def normalize_team_name(name):
    """Normalize team names for matching"""
    name = name.lower().strip()
    name = re.sub(r'\s+(fc|sc|sv|ssc|1\.|bv|asd|calcio)\s*', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    
    replacements = {
        'bayern munich': 'bayern', 'bayern münchen': 'bayern',
        'borussia dortmund': 'dortmund', 'bvb': 'dortmund',
        'rb leipzig': 'leipzig', 'rasenballsport leipzig': 'leipzig',
        '1. fc köln': 'koln', 'fc köln': 'koln', 'cologne': 'koln',
        'vfl wolfsburg': 'wolfsburg', 'eintracht frankfurt': 'frankfurt',
        'tsg hoffenheim': 'hoffenheim', 'borussia monchengladbach': 'monchengladbach',
        'vfb stuttgart': 'stuttgart', 'werder bremen': 'bremen',
        'mainz 05': 'mainz', 'fsv mainz 05': 'mainz',
        'bayer leverkusen': 'leverkusen', 'bayer 04 leverkusen': 'leverkusen',
        'hertha berlin': 'hertha', 'union berlin': 'union',
        'internazionale': 'inter', 'inter milan': 'inter',
        'ac milan': 'milan', 'hellas verona': 'verona',
        'atalanta bergamo': 'atalanta', 'as roma': 'roma',
        'ss lazio': 'lazio', 'juventus': 'juventus',
        'ssc napoli': 'napoli', 'acf fiorentina': 'fiorentina',
    }
    
    for old, new in replacements.items():
        if old in name:
            return new
    
    # Return first word if no match
    return name.split()[0] if name else name

def fetch_current_odds(sport_key):
    """
    Fetch current and upcoming matches with BTTS odds
    """
    print(f"  Fetching current/upcoming matches...")
    
    # Step 1: Get events
    url = f'https://api.the-odds-api.com/v4/sports/{sport_key}/odds/'
    
    params = {
        'apiKey': API_KEY,
        'regions': 'eu,uk',
        'markets': 'h2h',
        'oddsFormat': 'decimal'
    }
    
    try:
        response = requests.get(url, params=params, timeout=15)
        
        if response.status_code != 200:
            print(f"  ✗ Error fetching events: {response.status_code}")
            return None
        
        events = response.json()
        print(f"  Found {len(events)} upcoming matches")
        
        if not events:
            return None
        
        all_matches = []
        
        # Step 2: Get BTTS odds for each event
        for i, event in enumerate(events):
            event_id = event['id']
            
            # Get BTTS odds
            btts_url = f'https://api.the-odds-api.com/v4/sports/{sport_key}/events/{event_id}/odds/'
            btts_params = {
                'apiKey': API_KEY,
                'regions': 'eu,uk',
                'markets': 'btts',
                'oddsFormat': 'decimal'
            }
            
            try:
                btts_response = requests.get(btts_url, params=btts_params, timeout=15)
                
                if btts_response.status_code == 200:
                    btts_data = btts_response.json()
                    
                    # Extract best odds
                    btts_yes = None
                    btts_no = None
                    bookmaker_used = None
                    
                    bookmakers = btts_data.get('bookmakers', [])
                    
                    # Try preferred bookmakers
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
                                            break
                                if bookmaker_used:
                                    break
                        if bookmaker_used:
                            break
                    
                    # Use any bookmaker if no preferred found
                    if not bookmaker_used and bookmakers:
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
                                        break
                            if bookmaker_used:
                                break
                    
                    if btts_yes and btts_no:
                        all_matches.append({
                            'date': pd.to_datetime(event['commence_time']),
                            'home': normalize_team_name(event['home_team']),
                            'away': normalize_team_name(event['away_team']),
                            'home_original': event['home_team'],
                            'away_original': event['away_team'],
                            'btts_yes_odds': btts_yes,
                            'btts_no_odds': btts_no,
                            'bookmaker': bookmaker_used
                        })
                
                # Rate limiting
                time.sleep(0.7)
                
                if (i + 1) % 10 == 0:
                    print(f"    Progress: {i+1}/{len(events)} events, {len(all_matches)} with odds")
                    
            except Exception as e:
                print(f"    ✗ Error fetching odds for event {event_id}: {e}")
        
        print(f"  ✓ Collected {len(all_matches)} matches with BTTS odds")
        
        return pd.DataFrame(all_matches) if all_matches else None
        
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return None

def process_league(league_key):
    """
    Process a single league
    """
    config = LEAGUES[league_key]
    
    print(f"\n{'='*60}")
    print(f"PROCESSING {league_key.upper()}")
    print(f"{'='*60}")
    
    # Fetch current odds
    df_odds = fetch_current_odds(config['sport_key'])
    
    if df_odds is None or len(df_odds) == 0:
        print(f"\n✗ No odds data available for {league_key}")
        return None
    
    # Save
    output_dir = Path(f'data/{league_key}/')
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_file = output_dir / 'season_2024_25_upcoming_odds.csv'
    df_odds.to_csv(output_file, index=False)
    
    # Summary
    print(f"\n✓ Saved {len(df_odds)} upcoming matches to: {output_file}")
    print(f"\nSummary:")
    print(f"  Date range: {df_odds['date'].min().date()} to {df_odds['date'].max().date()}")
    print(f"  Avg BTTS YES odds: {df_odds['btts_yes_odds'].mean():.2f}")
    print(f"  Avg BTTS NO odds: {df_odds['btts_no_odds'].mean():.2f}")
    print(f"  Bookmakers: {df_odds['bookmaker'].value_counts().to_dict()}")
    
    print(f"\nSample matches:")
    for _, row in df_odds.head(5).iterrows():
        print(f"  {row['home_original']} vs {row['away_original']}")
        print(f"    BTTS YES: {row['btts_yes_odds']:.2f} | NO: {row['btts_no_odds']:.2f} ({row['bookmaker']})")
    
    return df_odds

def main():
    print("="*60)
    print("FETCH CURRENT SEASON (2024-25) BTTS ODDS")
    print("="*60)
    print("\nStrategy:")
    print("  - Train on 2020-24 seasons WITHOUT odds (features only)")
    print("  - Validate on 2024-25 WITH odds (live testing)")
    print("  - Compare model predictions to sharp market prices")
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
        print("\n✓ Upcoming matches with odds collected:")
        for league_key, df in results.items():
            print(f"  {league_key}: {len(df)} matches")
        
        print("\nNext steps:")
        print("  1. Train models on historical data (2020-24)")
        print("  2. Make predictions for upcoming matches")
        print("  3. Compare predictions to market odds")
        print("  4. Identify profitable opportunities")
        print("\nRun: python scripts/soccer/train_comprehensive_model.py")
    else:
        print("\n✗ No data collected")

if __name__ == '__main__':
    main()
