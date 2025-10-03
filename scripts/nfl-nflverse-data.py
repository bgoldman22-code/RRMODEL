#!/usr/bin/env python3
"""
NFL NFLVERSE DATA FETCHER FOR BACKTESTING
Companion to nfl-backtest-system.js

Fetches real historical data from NFLVerse with proper time constraints
"""

import nfl_data_py as nfl
import pandas as pd
import json
import sys
from datetime import datetime, timedelta
import os

class NFLVerseBacktestData:
    def __init__(self):
        self.output_dir = os.path.join(os.path.dirname(__file__), '..', 'backtest-data')
        os.makedirs(self.output_dir, exist_ok=True)
    
    def fetch_historical_games(self, weeks, season=2025):
        """
        Fetch completed games for backtesting
        Only returns games that have final scores
        """
        print(f"📊 Fetching historical games for {season} weeks {weeks}...")
        
        try:
            # Get schedule with results
            schedule_df = nfl.import_schedules([season])
            
            # Filter to requested weeks with completed games
            completed_games = schedule_df[
                (schedule_df['week'].isin(weeks)) & 
                (schedule_df['home_score'].notna()) & 
                (schedule_df['away_score'].notna()) &
                (schedule_df['game_type'] == 'REG')  # Regular season only
            ].copy()
            
            print(f"✅ Found {len(completed_games)} completed games")
            
            games = []
            for _, game in completed_games.iterrows():
                game_data = {
                    "gameId": f"{game['away_team']}_{game['home_team']}_{season}_W{int(game['week'])}",
                    "homeTeam": game['home_team'],
                    "awayTeam": game['away_team'],
                    "homeScore": int(game['home_score']),
                    "awayScore": int(game['away_score']),
                    "week": int(game['week']),
                    "season": season,
                    "gameday": game['gameday'].strftime('%Y-%m-%d') if pd.notna(game['gameday']) else None,
                    
                    # Calculated values
                    "margin": int(game['home_score'] - game['away_score']),
                    "total": int(game['home_score'] + game['away_score']),
                    "winner": game['home_team'] if game['home_score'] > game['away_score'] else game['away_team'],
                    
                    # Betting lines (if available)
                    "spread_line": float(game['spread_line']) if pd.notna(game['spread_line']) else None,
                    "total_line": float(game['total_line']) if pd.notna(game['total_line']) else None,
                    "home_moneyline": int(game['home_moneyline']) if pd.notna(game['home_moneyline']) else None,
                    "away_moneyline": int(game['away_moneyline']) if pd.notna(game['away_moneyline']) else None
                }
                games.append(game_data)
            
            return games
            
        except Exception as e:
            print(f"❌ Error fetching games: {e}")
            return []
    
    def get_available_player_data(self, target_week, season):
        """
        Get player data that would have been available BEFORE the target week
        This enforces time constraints for realistic backtesting
        """
        print(f"📈 Fetching player data available before Week {target_week}, {season}...")
        
        # Calculate data cutoff - only use data from weeks BEFORE target week
        max_week = target_week - 1
        
        if max_week < 1:
            print(f"⚠️ No historical data available for Week {target_week} predictions")
            return {}
        
        try:
            # Get weekly stats for previous weeks only
            weekly_stats = nfl.import_weekly_data(
                years=[season], 
                columns=[
                    'player_name', 'recent_team', 'position', 'week',
                    'passing_yards', 'passing_tds', 'rushing_yards', 'rushing_tds',
                    'receiving_yards', 'receiving_tds', 'targets', 'receptions',
                    'carries', 'fantasy_points'
                ]
            )
            
            # Filter to only data available before target week
            available_data = weekly_stats[weekly_stats['week'] < target_week].copy()
            
            print(f"✅ Player data available through Week {max_week}")
            
            # Group by player and calculate season totals up to this point
            player_totals = available_data.groupby(['player_name', 'recent_team', 'position']).agg({
                'passing_yards': 'sum',
                'passing_tds': 'sum',
                'rushing_yards': 'sum',
                'rushing_tds': 'sum',
                'receiving_yards': 'sum',
                'receiving_tds': 'sum',
                'targets': 'sum',
                'receptions': 'sum',
                'carries': 'sum',
                'fantasy_points': 'sum',
                'week': 'count'  # Games played
            }).reset_index()
            
            player_totals.rename(columns={'week': 'games_played'}, inplace=True)
            
            # Calculate per-game averages
            for stat in ['passing_yards', 'rushing_yards', 'receiving_yards', 'fantasy_points']:
                player_totals[f'{stat}_per_game'] = player_totals[stat] / player_totals['games_played']
            
            return {
                'weekly_data': available_data.to_dict('records'),
                'season_totals': player_totals.to_dict('records'),
                'data_through_week': max_week,
                'players_with_data': len(player_totals)
            }
            
        except Exception as e:
            print(f"❌ Error fetching player data: {e}")
            return {}
    
    def get_team_data(self, target_week, season):
        """
        Get team-level data available before target week
        """
        print(f"🏟️ Fetching team data available before Week {target_week}, {season}...")
        
        max_week = target_week - 1
        if max_week < 1:
            return {}
        
        try:
            # Get team stats
            weekly_data = nfl.import_weekly_data(years=[season])
            
            # Filter to available weeks
            available_data = weekly_data[weekly_data['week'] < target_week].copy()
            
            # Aggregate by team
            team_stats = available_data.groupby('recent_team').agg({
                'fantasy_points': ['sum', 'mean'],
                'passing_yards': ['sum', 'mean'],
                'rushing_yards': ['sum', 'mean'],
                'receiving_yards': ['sum', 'mean'],
                'week': 'count'
            }).reset_index()
            
            # Flatten column names
            team_stats.columns = ['team'] + [f"{col[0]}_{col[1]}" if col[1] else col[0] 
                                           for col in team_stats.columns[1:]]
            
            return {
                'team_stats': team_stats.to_dict('records'),
                'data_through_week': max_week
            }
            
        except Exception as e:
            print(f"❌ Error fetching team data: {e}")
            return {}
    
    def save_backtest_data(self, weeks, season=2025):
        """
        Save all data needed for backtesting to JSON files
        """
        all_data = {
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'season': season,
                'weeks': weeks,
                'data_source': 'NFLVerse',
                'constraints': 'Time-aware (only past data used for predictions)'
            },
            'games': {},
            'player_data': {},
            'team_data': {}
        }
        
        # Get historical games
        games = self.fetch_historical_games(weeks, season)
        all_data['games'] = games
        
        # For each week, get the data that would have been available
        for week in weeks:
            print(f"\n🔄 Processing data constraints for Week {week}...")
            
            player_data = self.get_available_player_data(week, season)
            team_data = self.get_team_data(week, season)
            
            all_data['player_data'][f'week_{week}'] = player_data
            all_data['team_data'][f'week_{week}'] = team_data
        
        # Save to file
        filename = f'nflverse_backtest_data_{season}_weeks_{"_".join(map(str, weeks))}.json'
        filepath = os.path.join(self.output_dir, filename)
        
        with open(filepath, 'w') as f:
            json.dump(all_data, f, indent=2, default=str)
        
        print(f"\n💾 Backtest data saved to: {filepath}")
        print(f"📊 Total games: {len(games)}")
        print(f"📈 Data constraints applied for {len(weeks)} weeks")
        
        return filepath

def main():
    """CLI interface"""
    if len(sys.argv) < 2:
        print("Usage: python nfl-nflverse-data.py --weeks 1,2,3 --season 2025")
        sys.exit(1)
    
    args = sys.argv[1:]
    options = {}
    
    # Parse arguments
    for i in range(0, len(args), 2):
        if i + 1 < len(args):
            key = args[i].replace('--', '')
            value = args[i + 1]
            
            if key == 'weeks':
                options['weeks'] = [int(w.strip()) for w in value.split(',')]
            elif key == 'week':
                options['weeks'] = [int(value)]
            elif key == 'season':
                options['season'] = int(value)
    
    # Default values
    weeks = options.get('weeks', [1, 2, 3])
    season = options.get('season', 2025)
    
    print(f"🏈 NFLVerse Backtest Data Fetcher")
    print(f"📅 Season: {season}, Weeks: {weeks}")
    print("=" * 50)
    
    # Create fetcher and run
    fetcher = NFLVerseBacktestData()
    result_path = fetcher.save_backtest_data(weeks, season)
    
    print("\n✅ Data fetch complete!")
    print(f"📁 Use this data file with: node scripts/nfl-backtest-system.js --data {result_path}")

if __name__ == "__main__":
    main()