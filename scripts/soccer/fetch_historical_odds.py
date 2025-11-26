#!/usr/bin/env python3
"""
Fetch historical BTTS odds from The Odds API
Supports Bundesliga and Serie A

Requirements:
    - The Odds API key (paid historical access required)
    - Set environment variable: ODDS_API_KEY=your_key_here

Usage:
    export ODDS_API_KEY=your_key_here
    python scripts/soccer/fetch_historical_odds.py

Output:
    data/bundesliga/closing_odds_by_match.csv
    data/serie_a/closing_odds_by_match.csv

The Odds API Docs:
    https://the-odds-api.com/historical-odds-data/
"""

import requests
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta
import time
import os
import json

# API Configuration
API_BASE_URL = 'https://api.the-odds-api.com/v4'
API_KEY = os.environ.get('ODDS_API_KEY')

if not API_KEY:
    print("⚠ WARNING: ODDS_API_KEY environment variable not set!")
    print("   Set with: export ODDS_API_KEY=your_key_here")
    print("   Get key from: https://the-odds-api.com/")

# League configurations for The Odds API
LEAGUES = {
    'bundesliga': {
        'name': 'German Bundesliga',
        'odds_api_sport': 'soccer_germany_bundesliga',
        'output_dir': 'data/bundesliga/',
        'seasons': [
            {'start': '2020-08-01', 'end': '2021-05-31', 'season': '2020-21'},
            {'start': '2021-08-01', 'end': '2022-05-31', 'season': '2021-22'},
            {'start': '2022-08-01', 'end': '2023-05-31', 'season': '2022-23'},
            {'start': '2023-08-01', 'end': '2024-05-31', 'season': '2023-24'},
        ]
    },
    'serie_a': {
        'name': 'Italian Serie A',
        'odds_api_sport': 'soccer_italy_serie_a',
        'output_dir': 'data/serie_a/',
        'seasons': [
            {'start': '2020-08-01', 'end': '2021-05-31', 'season': '2020-21'},
            {'start': '2021-08-01', 'end': '2022-05-31', 'season': '2021-22'},
            {'start': '2022-08-01', 'end': '2023-05-31', 'season': '2022-23'},
            {'start': '2023-08-01', 'end': '2024-05-31', 'season': '2023-24'},
        ]
    }
}

# Preferred bookmakers (in priority order)
PREFERRED_BOOKMAKERS = [
    'pinnacle',      # Gold standard (sharp)
    'betfair',       # Exchange (no margin on liquidity side)
    'bet365',        # High liquidity
    'williamhill',   # Reputable
    'unibet'         # Good European coverage
]

def check_api_quota():
    """Check remaining API quota"""
    if not API_KEY:
        return None
    
    url = f'{API_BASE_URL}/sports/'
    params = {'apiKey': API_KEY}
    
    try:
        response = requests.get(url, params=params, timeout=10)
        remaining = response.headers.get('x-requests-remaining')
        used = response.headers.get('x-requests-used')
        
        if remaining:
            print(f"\nAPI Quota: {remaining} requests remaining ({used} used)")
            return int(remaining)
    except Exception as e:
        print(f"⚠ Could not check quota: {str(e)}")
    
    return None

def fetch_historical_events(sport, date_from, date_to):
    """
    Fetch list of historical events (matches) for a sport and date range
    """
    if not API_KEY:
        raise ValueError("ODDS_API_KEY not set")
    
    # Note: Historical events endpoint (if available)
    # For now, we'll use the regular odds endpoint with date filtering
    url = f'{API_BASE_URL}/sports/{sport}/odds/'
    
    params = {
        'apiKey': API_KEY,
        'regions': 'eu,uk',  # European bookmakers
        'markets': 'btts',   # Both Teams To Score market
        'oddsFormat': 'decimal',
        'dateFormat': 'iso',
        'date': date_from  # This might work for historical data
    }
    
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        return data
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            print("✗ API Authentication failed - check your API key")
        elif e.response.status_code == 422:
            print(f"✗ Invalid request parameters for {sport}")
        else:
            print(f"✗ HTTP Error {e.response.status_code}: {str(e)}")
        return []
    except Exception as e:
        print(f"✗ Error fetching events: {str(e)}")
        return []

def fetch_event_odds(event_id, sport):
    """
    Fetch odds for a specific event/match
    Uses the /events/{eventId}/odds endpoint for additional markets
    """
    if not API_KEY:
        raise ValueError("ODDS_API_KEY not set")
    
    url = f'{API_BASE_URL}/sports/{sport}/events/{event_id}/odds/'
    
    params = {
        'apiKey': API_KEY,
        'regions': 'eu,uk',
        'markets': 'btts',
        'oddsFormat': 'decimal',
        'dateFormat': 'iso'
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        return data
    except Exception as e:
        print(f"  ✗ Error fetching event {event_id}: {str(e)}")
        return None

def parse_btts_odds(event_data, preferred_bookmakers=PREFERRED_BOOKMAKERS):
    """
    Extract BTTS odds from event data
    Prioritizes bookmakers in order of preference
    """
    if not event_data or 'bookmakers' not in event_data:
        return None
    
    bookmakers = event_data.get('bookmakers', [])
    
    # Try preferred bookmakers first
    for preferred in preferred_bookmakers:
        for bookmaker in bookmakers:
            if bookmaker['key'] == preferred:
                markets = bookmaker.get('markets', [])
                for market in markets:
                    if market['key'] == 'btts':
                        outcomes = market.get('outcomes', [])
                        
                        yes_outcome = next((o for o in outcomes if o['name'] == 'Yes'), None)
                        no_outcome = next((o for o in outcomes if o['name'] == 'No'), None)
                        
                        if yes_outcome and no_outcome:
                            return {
                                'btts_yes_close': yes_outcome['price'],
                                'btts_no_close': no_outcome['price'],
                                'bookmaker': bookmaker['title'],
                                'bookmaker_key': bookmaker['key'],
                                'last_update': bookmaker.get('last_update')
                            }
    
    # Fallback: use any available bookmaker
    for bookmaker in bookmakers:
        markets = bookmaker.get('markets', [])
        for market in markets:
            if market['key'] == 'btts':
                outcomes = market.get('outcomes', [])
                
                yes_outcome = next((o for o in outcomes if o['name'] == 'Yes'), None)
                no_outcome = next((o for o in outcomes if o['name'] == 'No'), None)
                
                if yes_outcome and no_outcome:
                    return {
                        'btts_yes_close': yes_outcome['price'],
                        'btts_no_close': no_outcome['price'],
                        'bookmaker': bookmaker['title'],
                        'bookmaker_key': bookmaker['key'],
                        'last_update': bookmaker.get('last_update')
                    }
    
    return None

def normalize_team_name(name):
    """
    Normalize team names for matching with results data
    """
    # Remove common suffixes
    name = name.replace(' FC', '').replace(' CF', '').replace(' SC', '')
    name = name.replace(' United', '').replace(' City', '')
    
    # Handle common variations
    replacements = {
        'Bayern Munich': 'Bayern München',
        'Borussia Dortmund': 'Borussia Dortmund',
        'RB Leipzig': 'RB Leipzig',
        'Bayer Leverkusen': 'Bayer 04 Leverkusen',
        'Inter Milan': 'FC Internazionale Milano',
        'AC Milan': 'AC Milan',
        'AS Roma': 'AS Roma',
        'Lazio': 'SS Lazio'
    }
    
    return replacements.get(name, name)

def fetch_league_odds(league_key):
    """
    Fetch historical BTTS odds for an entire league
    """
    config = LEAGUES[league_key]
    sport = config['odds_api_sport']
    
    print(f"\n{'='*60}")
    print(f"Fetching {config['name']} odds...")
    print(f"{'='*60}")
    
    all_odds = []
    total_requests = 0
    
    for season_info in config['seasons']:
        season = season_info['season']
        date_from = season_info['start']
        date_to = season_info['end']
        
        print(f"\nSeason {season} ({date_from} to {date_to}):")
        
        # Note: The Odds API historical access might work differently
        # This is a template - adjust based on actual API behavior
        
        # For historical data, you might need to:
        # 1. Contact The Odds API for bulk historical data export
        # 2. Use their historical snapshot feature
        # 3. Query day-by-day (expensive in API calls)
        
        # Placeholder: Try to fetch events
        events = fetch_historical_events(sport, date_from, date_to)
        
        if not events:
            print(f"  ⚠ No events found (historical data may require special access)")
            continue
        
        print(f"  Found {len(events)} events")
        
        # Fetch odds for each event
        for i, event in enumerate(events, 1):
            if i % 10 == 0:
                print(f"  Processing {i}/{len(events)}...")
            
            event_id = event.get('id')
            home_team = normalize_team_name(event.get('home_team', ''))
            away_team = normalize_team_name(event.get('away_team', ''))
            commence_time = event.get('commence_time')
            
            # Parse BTTS odds directly from event data (if available)
            btts_odds = parse_btts_odds(event)
            
            # If not available, try fetching individual event
            if not btts_odds and event_id:
                time.sleep(0.5)  # Rate limiting
                event_detail = fetch_event_odds(event_id, sport)
                btts_odds = parse_btts_odds(event_detail)
                total_requests += 1
            
            if btts_odds:
                all_odds.append({
                    'date': pd.to_datetime(commence_time).date() if commence_time else None,
                    'home': home_team,
                    'away': away_team,
                    'season': season,
                    **btts_odds
                })
            
            # Rate limiting (max 500 requests/month on free tier)
            if total_requests % 10 == 0:
                time.sleep(1)
    
    print(f"\n✓ Collected odds for {len(all_odds)} matches")
    print(f"  API requests used: {total_requests}")
    
    return pd.DataFrame(all_odds)

def save_odds(odds_df, league_key):
    """Save odds to CSV"""
    config = LEAGUES[league_key]
    output_dir = Path(config['output_dir'])
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_path = output_dir / 'closing_odds_by_match.csv'
    odds_df.to_csv(output_path, index=False)
    
    print(f"\n✓ Saved to: {output_path}")
    
    # Summary stats
    if len(odds_df) > 0:
        print(f"\nSummary:")
        print(f"  Total matches: {len(odds_df)}")
        print(f"  Seasons: {odds_df['season'].unique().tolist()}")
        print(f"  Bookmakers: {odds_df['bookmaker'].value_counts().to_dict()}")
        print(f"  Avg BTTS YES odds: {odds_df['btts_yes_close'].mean():.2f}")
        print(f"  Avg BTTS NO odds: {odds_df['btts_no_close'].mean():.2f}")

def create_sample_odds_template(league_key):
    """
    Create a sample CSV template for manual odds entry
    (Use this if API access is too expensive or unavailable)
    """
    config = LEAGUES[league_key]
    output_dir = Path(config['output_dir'])
    results_path = output_dir / 'historical_results.csv'
    
    if not results_path.exists():
        print(f"⚠ No results file found at {results_path}")
        return
    
    # Load results
    results = pd.read_csv(results_path)
    
    # Create template with placeholder odds
    template = results[['date', 'home', 'away', 'season']].copy()
    template['btts_yes_close'] = 1.80  # Placeholder
    template['btts_no_close'] = 2.00   # Placeholder
    template['bookmaker'] = 'MANUAL_ENTRY_NEEDED'
    
    template_path = output_dir / 'closing_odds_TEMPLATE.csv'
    template.to_csv(template_path, index=False)
    
    print(f"\n✓ Created template: {template_path}")
    print(f"\nInstructions:")
    print(f"1. Open {template_path}")
    print(f"2. Replace placeholder odds with actual closing lines")
    print(f"3. Save as 'closing_odds_by_match.csv'")
    print(f"4. Run training script")

def main():
    """
    Main execution
    """
    print("="*60)
    print("THE ODDS API - HISTORICAL BTTS ODDS FETCHER")
    print("="*60)
    
    # Check API key
    if not API_KEY:
        print("\n✗ No API key found!")
        print("\nTo use The Odds API:")
        print("1. Sign up at: https://the-odds-api.com/")
        print("2. Get your API key")
        print("3. Set environment variable: export ODDS_API_KEY=your_key")
        print("\nOR")
        print("\nManually enter odds using template:")
        for league_key in LEAGUES.keys():
            create_sample_odds_template(league_key)
        return
    
    # Check quota
    remaining = check_api_quota()
    
    if remaining is not None and remaining < 100:
        print(f"\n⚠ WARNING: Only {remaining} API requests remaining!")
        print("  Fetching historical data for 2 leagues × 4 seasons may use 300-500 requests")
        response = input("  Continue? (y/n): ")
        if response.lower() != 'y':
            print("Aborted.")
            return
    
    # Fetch odds for each league
    for league_key in LEAGUES.keys():
        try:
            odds_df = fetch_league_odds(league_key)
            
            if len(odds_df) > 0:
                save_odds(odds_df, league_key)
            else:
                print(f"\n⚠ No odds data collected for {league_key}")
                print(f"  Creating template for manual entry...")
                create_sample_odds_template(league_key)
        
        except Exception as e:
            print(f"\n✗ Error processing {league_key}: {str(e)}")
            import traceback
            traceback.print_exc()
    
    print("\n" + "="*60)
    print("COMPLETE")
    print("="*60)
    print("\nNext steps:")
    print("1. Verify odds data in data/{league}/closing_odds_by_match.csv")
    print("2. Run training: python scripts/soccer/train_league_profile_c.py")
    print("="*60)

if __name__ == '__main__':
    main()
