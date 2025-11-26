#!/usr/bin/env python3
"""
Fetch historical match data for Bundesliga and Serie A simultaneously
Uses openfootball (match results) + soccerdata (team stats)

Usage:
    python scripts/soccer/fetch_all_leagues.py

Output:
    data/bundesliga/historical_results.csv
    data/bundesliga/team_stats_by_season.csv
    data/serie_a/historical_results.csv
    data/serie_a/team_stats_by_season.csv
"""

import requests
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path
import re
import time

# League configurations
LEAGUES = {
    'bundesliga': {
        'openfootball_repo': 'bundesliga',
        'openfootball_path': 'de-deutschland',
        'fbref_league': 'Bundesliga',
        'fbref_country': 'GER',
        'seasons': ['2020-21', '2021-22', '2022-23', '2023-24'],
        'output_dir': 'data/bundesliga/'
    },
    'serie_a': {
        'openfootball_repo': 'serie-a',
        'openfootball_path': 'it-italy',
        'fbref_league': 'Serie-A',
        'fbref_country': 'ITA',
        'seasons': ['2020-21', '2021-22', '2022-23', '2023-24'],
        'output_dir': 'data/serie_a/'
    }
}

def parse_openfootball_match_line(line):
    """
    Parse a single match line from openfootball format
    Example: "Bayern München 3-1 Borussia Dortmund"
    Returns: (home_team, away_team, home_score, away_score)
    """
    # Match format: "Team1 Score1-Score2 Team2"
    # Handle penalties, extra time, etc.
    match = re.match(r'^(.+?)\s+(\d+)-(\d+)\s+(.+?)(?:\s+\[|\s+aet|\s+pen)?$', line.strip())
    
    if match:
        home_team = match.group(1).strip()
        home_score = int(match.group(2))
        away_score = int(match.group(3))
        away_team = match.group(4).strip()
        return home_team, away_team, home_score, away_score
    
    return None

def fetch_openfootball_season(league_key, season):
    """
    Fetch match results from openfootball GitHub repo
    """
    config = LEAGUES[league_key]
    
    # Try multiple URL formats (openfootball structure varies)
    possible_urls = [
        f'https://raw.githubusercontent.com/openfootball/{config["openfootball_repo"]}/master/{season}/{config["openfootball_repo"]}.txt',
        f'https://raw.githubusercontent.com/openfootball/{config["openfootball_repo"]}/master/{season}/{config["openfootball_repo"]}-i.txt',
        f'https://raw.githubusercontent.com/openfootball/football.csv/master/{config["openfootball_path"]}/{season}/{config["openfootball_repo"]}.csv'
    ]
    
    matches = []
    current_date = None
    
    for url in possible_urls:
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                print(f"  ✓ Found data at: {url}")
                
                # Check if CSV format
                if url.endswith('.csv'):
                    df = pd.read_csv(url)
                    # Convert CSV to our format
                    for _, row in df.iterrows():
                        matches.append({
                            'date': pd.to_datetime(row.get('Date') or row.get('date')),
                            'home': row.get('Home') or row.get('home'),
                            'away': row.get('Away') or row.get('away'),
                            'home_score': int(row.get('FT') or row.get('home_score', 0)),
                            'away_score': int(row.get('FT') or row.get('away_score', 0)),
                            'season': season
                        })
                    break
                else:
                    # Parse custom text format
                    lines = response.text.split('\n')
                    for line in lines:
                        line = line.strip()
                        
                        # Skip comments and empty lines
                        if not line or line.startswith('#') or line.startswith('='):
                            continue
                        
                        # Check for date lines
                        date_match = re.match(r'(\w+ \w+/\d+|\d{4}-\d{2}-\d{2})', line)
                        if date_match:
                            try:
                                current_date = pd.to_datetime(date_match.group(1))
                            except:
                                pass
                            continue
                        
                        # Try to parse as match line
                        result = parse_openfootball_match_line(line)
                        if result:
                            home_team, away_team, home_score, away_score = result
                            matches.append({
                                'date': current_date or pd.to_datetime(f'{season.split("-")[0]}-08-01'),
                                'home': home_team,
                                'away': away_team,
                                'home_score': home_score,
                                'away_score': away_score,
                                'season': season
                            })
                    break
        except Exception as e:
            print(f"  ✗ Failed {url}: {str(e)}")
            continue
    
    return matches

def fetch_league_results(league_key):
    """
    Fetch all match results for a league
    """
    config = LEAGUES[league_key]
    print(f"\n{'='*60}")
    print(f"Fetching {league_key.upper()} match results...")
    print(f"{'='*60}")
    
    all_matches = []
    
    for season in config['seasons']:
        print(f"\nSeason {season}:")
        matches = fetch_openfootball_season(league_key, season)
        all_matches.extend(matches)
        print(f"  → Found {len(matches)} matches")
        time.sleep(0.5)  # Be nice to GitHub
    
    # Create DataFrame
    df = pd.DataFrame(all_matches)
    
    if len(df) > 0:
        # Calculate BTTS
        df['btts'] = ((df['home_score'] > 0) & (df['away_score'] > 0)).astype(int)
        
        # Calculate total goals
        df['total_goals'] = df['home_score'] + df['away_score']
        
        # Sort by date
        df = df.sort_values('date').reset_index(drop=True)
        
        # Summary stats
        btts_rate = df['btts'].mean()
        avg_goals = df['total_goals'].mean()
        
        print(f"\n{'='*60}")
        print(f"{league_key.upper()} Summary:")
        print(f"{'='*60}")
        print(f"Total matches: {len(df)}")
        print(f"BTTS rate: {btts_rate:.1%}")
        print(f"Avg goals/game: {avg_goals:.2f}")
        print(f"Date range: {df['date'].min()} to {df['date'].max()}")
    
    return df

def fetch_fbref_stats(league_key):
    """
    Fetch team stats from FBref using soccerdata library
    Note: Requires 'soccerdata' package: pip install soccerdata
    """
    config = LEAGUES[league_key]
    print(f"\n{'='*60}")
    print(f"Fetching {league_key.upper()} team stats from FBref...")
    print(f"{'='*60}")
    
    try:
        import soccerdata as sd
        
        # Initialize FBref scraper
        fbref = sd.FBref(
            leagues=f'{config["fbref_country"]}-{config["fbref_league"]}',
            seasons=[s.split('-')[0] for s in config['seasons']]
        )
        
        # Fetch team season stats
        print("Fetching team season stats...")
        team_stats = fbref.read_team_season_stats()
        
        # Save raw stats
        team_stats_df = team_stats.reset_index()
        
        print(f"  ✓ Found stats for {len(team_stats_df)} team-seasons")
        
        return team_stats_df
        
    except ImportError:
        print("  ✗ soccerdata library not installed")
        print("    Install with: pip install soccerdata")
        return pd.DataFrame()
    except Exception as e:
        print(f"  ✗ Error fetching FBref data: {str(e)}")
        return pd.DataFrame()

def create_placeholder_stats(league_key, results_df):
    """
    Create placeholder team stats from match results
    (Used when FBref data unavailable)
    """
    print(f"Creating placeholder stats from match results...")
    
    team_stats = []
    
    for season in results_df['season'].unique():
        season_matches = results_df[results_df['season'] == season]
        
        # Get unique teams
        teams = pd.concat([season_matches['home'], season_matches['away']]).unique()
        
        for team in teams:
            # Home stats
            home_matches = season_matches[season_matches['home'] == team]
            home_gf = home_matches['home_score'].sum()
            home_ga = home_matches['away_score'].sum()
            home_games = len(home_matches)
            
            # Away stats
            away_matches = season_matches[season_matches['away'] == team]
            away_gf = away_matches['away_score'].sum()
            away_ga = away_matches['home_score'].sum()
            away_games = len(away_matches)
            
            # Combined
            total_games = home_games + away_games
            total_gf = home_gf + away_gf
            total_ga = home_ga + away_ga
            
            team_stats.append({
                'season': season,
                'team': team,
                'games': total_games,
                'goals_for': total_gf,
                'goals_against': total_ga,
                'goals_for_per_game': total_gf / total_games if total_games > 0 else 0,
                'goals_against_per_game': total_ga / total_games if total_games > 0 else 0,
                'home_goals_for': home_gf,
                'home_goals_against': home_ga,
                'home_games': home_games,
                'away_goals_for': away_gf,
                'away_goals_against': away_ga,
                'away_games': away_games
            })
    
    return pd.DataFrame(team_stats)

def main():
    """
    Main execution: Fetch data for all leagues
    """
    print("="*60)
    print("SOCCER LEAGUE DATA FETCHER")
    print("="*60)
    print(f"Target leagues: {', '.join(LEAGUES.keys()).upper()}")
    print(f"Seasons: {LEAGUES['bundesliga']['seasons']}")
    print("="*60)
    
    for league_key in LEAGUES.keys():
        config = LEAGUES[league_key]
        output_dir = Path(config['output_dir'])
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Fetch match results
        results_df = fetch_league_results(league_key)
        
        if len(results_df) > 0:
            results_path = output_dir / 'historical_results.csv'
            results_df.to_csv(results_path, index=False)
            print(f"\n✓ Saved to: {results_path}")
        else:
            print(f"\n✗ No match data found for {league_key}")
            continue
        
        # Fetch team stats (FBref)
        team_stats_df = fetch_fbref_stats(league_key)
        
        # Fallback to placeholder stats if FBref unavailable
        if len(team_stats_df) == 0:
            team_stats_df = create_placeholder_stats(league_key, results_df)
        
        if len(team_stats_df) > 0:
            stats_path = output_dir / 'team_stats_by_season.csv'
            team_stats_df.to_csv(stats_path, index=False)
            print(f"✓ Saved to: {stats_path}")
        
        print(f"\n{'='*60}")
        print(f"{league_key.upper()} data collection complete!")
        print(f"{'='*60}\n")
    
    print("\n" + "="*60)
    print("ALL LEAGUES COMPLETE")
    print("="*60)
    print("\nNext steps:")
    print("1. Add historical BTTS odds to:")
    print("   - data/bundesliga/closing_odds_by_match.csv")
    print("   - data/serie_a/closing_odds_by_match.csv")
    print("2. Run training script:")
    print("   python scripts/soccer/train_league_profile_c.py")
    print("="*60)

if __name__ == '__main__':
    main()
