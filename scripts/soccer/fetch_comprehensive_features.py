#!/usr/bin/env python3
"""
Comprehensive feature extraction for BTTS modeling
Fetches: match results + team stats + advanced metrics + form + head-to-head

Usage:
    python scripts/soccer/fetch_comprehensive_features.py

Output:
    data/bundesliga/matches_with_features.csv
    data/serie_a/matches_with_features.csv
"""

import pandas as pd
from pathlib import Path
import subprocess
import re
from datetime import datetime, timedelta
from collections import defaultdict
import numpy as np

def fetch_matches_from_git(league_name, repo_url, file_pattern):
    """
    Clone openfootball repo and extract match data
    """
    print(f"\n{'='*60}")
    print(f"FETCHING {league_name.upper()} MATCHES")
    print(f"{'='*60}")
    
    # Clone repo
    temp_dir = Path(f'/tmp/{league_name}')
    if temp_dir.exists():
        subprocess.run(['rm', '-rf', str(temp_dir)], check=True)
    
    print(f"Cloning repository...")
    result = subprocess.run(
        ['git', 'clone', repo_url, str(temp_dir)],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"✗ Clone failed: {result.stderr}")
        return None
    
    print(f"✓ Repository cloned")
    
    # Parse matches
    all_matches = []
    
    seasons = [
        ('2020-21', file_pattern.format('2020-21')),
        ('2021-22', file_pattern.format('2021-22')),
        ('2022-23', file_pattern.format('2022-23')),
        ('2023-24', file_pattern.format('2023-24')),
    ]
    
    for season_label, filename in seasons:
        match_file = temp_dir / filename
        
        if not match_file.exists():
            print(f"\n✗ File not found: {match_file}")
            continue
        
        print(f"\nParsing {season_label}...")
        
        with open(match_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        current_date = None
        current_matchday = None
        matches_in_season = 0
        
        for line in lines:
            line = line.strip()
            
            if not line or line.startswith('#'):
                continue
            
            # Matchday line (e.g., "Matchday 1" or "1. Spieltag")
            matchday_match = re.match(r'.*?(\d+)\.?\s+(Spieltag|Matchday|Giornata)', line, re.IGNORECASE)
            if matchday_match:
                current_matchday = int(matchday_match.group(1))
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
                
                all_matches.append({
                    'date': current_date,
                    'matchday': current_matchday,
                    'home': home_team,
                    'away': away_team,
                    'home_score': home_score,
                    'away_score': away_score,
                    'season': season_label
                })
                
                matches_in_season += 1
        
        print(f"  ✓ Found {matches_in_season} matches")
    
    # Cleanup
    subprocess.run(['rm', '-rf', str(temp_dir)])
    
    if not all_matches:
        print("\n✗ No matches found")
        return None
    
    df = pd.DataFrame(all_matches)
    df = df.sort_values('date').reset_index(drop=True)
    
    print(f"\n✓ Total matches: {len(df)}")
    
    return df

def calculate_team_form(df, team, date, n_games=5):
    """
    Calculate recent form (goals scored/conceded in last N games)
    """
    # Get team's matches before this date
    team_matches = df[
        ((df['home'] == team) | (df['away'] == team)) & 
        (df['date'] < date)
    ].tail(n_games)
    
    if len(team_matches) == 0:
        return {
            'games_played': 0,
            'goals_scored': 0,
            'goals_conceded': 0,
            'btts_rate': 0,
            'avg_total_goals': 0
        }
    
    goals_scored = 0
    goals_conceded = 0
    btts_count = 0
    total_goals = 0
    
    for _, match in team_matches.iterrows():
        if match['home'] == team:
            goals_scored += match['home_score']
            goals_conceded += match['away_score']
        else:
            goals_scored += match['away_score']
            goals_conceded += match['home_score']
        
        if match['home_score'] > 0 and match['away_score'] > 0:
            btts_count += 1
        
        total_goals += match['home_score'] + match['away_score']
    
    return {
        'games_played': len(team_matches),
        'goals_scored': goals_scored,
        'goals_conceded': goals_conceded,
        'btts_rate': btts_count / len(team_matches),
        'avg_total_goals': total_goals / len(team_matches)
    }

def calculate_h2h_stats(df, home_team, away_team, date, n_games=5):
    """
    Head-to-head statistics
    """
    h2h = df[
        (((df['home'] == home_team) & (df['away'] == away_team)) |
         ((df['home'] == away_team) & (df['away'] == home_team))) &
        (df['date'] < date)
    ].tail(n_games)
    
    if len(h2h) == 0:
        return {
            'h2h_games': 0,
            'h2h_btts_rate': 0,
            'h2h_avg_goals': 0
        }
    
    btts_count = sum(1 for _, m in h2h.iterrows() if m['home_score'] > 0 and m['away_score'] > 0)
    avg_goals = h2h[['home_score', 'away_score']].sum().sum() / len(h2h)
    
    return {
        'h2h_games': len(h2h),
        'h2h_btts_rate': btts_count / len(h2h),
        'h2h_avg_goals': avg_goals
    }

def calculate_season_stats(df, team, date, season):
    """
    Season-to-date statistics
    """
    season_matches = df[
        ((df['home'] == team) | (df['away'] == team)) & 
        (df['season'] == season) &
        (df['date'] < date)
    ]
    
    if len(season_matches) == 0:
        return {
            'season_games': 0,
            'season_goals_scored': 0,
            'season_goals_conceded': 0,
            'season_btts_rate': 0,
            'season_win_rate': 0,
            'season_clean_sheets': 0,
            'season_failed_to_score': 0
        }
    
    goals_scored = 0
    goals_conceded = 0
    wins = 0
    btts_count = 0
    clean_sheets = 0
    failed_to_score = 0
    
    for _, match in season_matches.iterrows():
        is_home = match['home'] == team
        
        team_score = match['home_score'] if is_home else match['away_score']
        opp_score = match['away_score'] if is_home else match['home_score']
        
        goals_scored += team_score
        goals_conceded += opp_score
        
        if team_score > opp_score:
            wins += 1
        
        if team_score > 0 and opp_score > 0:
            btts_count += 1
        
        if opp_score == 0:
            clean_sheets += 1
        
        if team_score == 0:
            failed_to_score += 1
    
    n = len(season_matches)
    
    return {
        'season_games': n,
        'season_goals_scored': goals_scored,
        'season_goals_conceded': goals_conceded,
        'season_btts_rate': btts_count / n,
        'season_win_rate': wins / n,
        'season_clean_sheets': clean_sheets,
        'season_failed_to_score': failed_to_score,
        'season_avg_goals_for': goals_scored / n,
        'season_avg_goals_against': goals_conceded / n
    }

def add_comprehensive_features(df):
    """
    Add all features to each match
    """
    print(f"\nCalculating features for {len(df)} matches...")
    
    features_list = []
    
    for idx, match in df.iterrows():
        if idx % 100 == 0:
            print(f"  Progress: {idx}/{len(df)} matches")
        
        # Basic match info
        features = {
            'date': match['date'],
            'matchday': match['matchday'],
            'home': match['home'],
            'away': match['away'],
            'home_score': match['home_score'],
            'away_score': match['away_score'],
            'btts': 1 if (match['home_score'] > 0 and match['away_score'] > 0) else 0,
            'total_goals': match['home_score'] + match['away_score'],
            'season': match['season']
        }
        
        # Home team form (last 5 games)
        home_form = calculate_team_form(df, match['home'], match['date'], n_games=5)
        for key, val in home_form.items():
            features[f'home_form_{key}'] = val
        
        # Away team form (last 5 games)
        away_form = calculate_team_form(df, match['away'], match['date'], n_games=5)
        for key, val in away_form.items():
            features[f'away_form_{key}'] = val
        
        # Head-to-head
        h2h = calculate_h2h_stats(df, match['home'], match['away'], match['date'])
        for key, val in h2h.items():
            features[key] = val
        
        # Season stats for home team
        home_season = calculate_season_stats(df, match['home'], match['date'], match['season'])
        for key, val in home_season.items():
            features[f'home_{key}'] = val
        
        # Away season stats
        away_season = calculate_season_stats(df, match['away'], match['date'], match['season'])
        for key, val in away_season.items():
            features[f'away_{key}'] = val
        
        # Combined features
        features['combined_form_btts_rate'] = (home_form['btts_rate'] + away_form['btts_rate']) / 2
        features['combined_form_goals'] = home_form['goals_scored'] + away_form['goals_scored']
        features['defense_strength_diff'] = home_form['goals_conceded'] - away_form['goals_conceded']
        features['attack_strength_diff'] = home_form['goals_scored'] - away_form['goals_scored']
        
        features_list.append(features)
    
    print(f"✓ Features calculated")
    
    return pd.DataFrame(features_list)

def main():
    print("="*60)
    print("COMPREHENSIVE FEATURE EXTRACTION")
    print("="*60)
    
    # Bundesliga
    df_bundesliga = fetch_matches_from_git(
        'bundesliga',
        'https://github.com/openfootball/deutschland.git',
        '{}/1-bundesliga.txt'
    )
    
    if df_bundesliga is not None:
        df_bundesliga_features = add_comprehensive_features(df_bundesliga)
        
        output_dir = Path('data/bundesliga/')
        output_dir.mkdir(parents=True, exist_ok=True)
        output_file = output_dir / 'matches_with_features.csv'
        df_bundesliga_features.to_csv(output_file, index=False)
        
        print(f"\n{'='*60}")
        print("BUNDESLIGA SUMMARY")
        print(f"{'='*60}")
        print(f"Total matches: {len(df_bundesliga_features)}")
        print(f"BTTS rate: {df_bundesliga_features['btts'].mean():.1%}")
        print(f"Avg goals/game: {df_bundesliga_features['total_goals'].mean():.2f}")
        print(f"Features per match: {len(df_bundesliga_features.columns)}")
        print(f"\n✓ Saved to: {output_file}")
    
    # Serie A
    df_serie_a = fetch_matches_from_git(
        'serie_a',
        'https://github.com/openfootball/italy.git',
        '{}/1-seriea.txt'
    )
    
    if df_serie_a is not None:
        df_serie_a_features = add_comprehensive_features(df_serie_a)
        
        output_dir = Path('data/serie_a/')
        output_dir.mkdir(parents=True, exist_ok=True)
        output_file = output_dir / 'matches_with_features.csv'
        df_serie_a_features.to_csv(output_file, index=False)
        
        print(f"\n{'='*60}")
        print("SERIE A SUMMARY")
        print(f"{'='*60}")
        print(f"Total matches: {len(df_serie_a_features)}")
        print(f"BTTS rate: {df_serie_a_features['btts'].mean():.1%}")
        print(f"Avg goals/game: {df_serie_a_features['total_goals'].mean():.2f}")
        print(f"Features per match: {len(df_serie_a_features.columns)}")
        print(f"\n✓ Saved to: {output_file}")
    
    print("\n" + "="*60)
    print("FEATURE EXTRACTION COMPLETE")
    print("="*60)
    print("\nFeatures calculated:")
    print("  - Form (last 5 games): goals, conceded, BTTS rate")
    print("  - Season stats: goals, win rate, clean sheets, failed to score")
    print("  - Head-to-head: recent meetings, BTTS rate, avg goals")
    print("  - Combined metrics: attack/defense differentials")
    print("\nNext steps:")
    print("  1. Fetch historical odds (optional for testing multiple models)")
    print("  2. Run training: python scripts/soccer/train_comprehensive_model.py")

if __name__ == '__main__':
    main()
