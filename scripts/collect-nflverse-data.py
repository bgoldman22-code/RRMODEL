#!/usr/bin/env python3
"""
NFL Player Data Collection using NFLVerse
Fixed version - corrects API parameter errors
"""

import os
import sys
import json
import pandas as pd
from datetime import datetime

# Optional: import requests for ESPN or other APIs if needed
try:
    import requests
except ImportError:
    requests = None

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    import nfl_data_py as nfl
    print("✅ NFLVerse library loaded successfully")
except ImportError as e:
    print(f"❌ Failed to import nfl_data_py: {e}")
    print("Installing nfl_data_py...")
    os.system("pip install nfl_data_py")
    import nfl_data_py as nfl


# Configuration from environment variables
CURRENT_WEEK = int(os.getenv('NFL_WEEK', '4'))  # Week to PREDICT
CURRENT_SEASON = int(os.getenv('NFL_SEASON', '2025'))

# Historical seasons for context (3 years)
HISTORICAL_SEASONS = [2022, 2023, 2024]

# Output path for committed JSON file (now matches JS pipeline)
OUTPUT_PATH = os.getenv('NFL_TD_PLAYER_DATA_PATH', 'public/nfl-anytime-td-player-data.json')

# Path to existing injury/news pipeline output (if available)
INJURY_NEWS_PATH = os.getenv('NFL_INJURY_NEWS_PATH', 'public/nfl-injury-news.json')

def main():
    """Main execution function"""
    print(f"🏈 Collecting INPUT data for NFL Week {CURRENT_WEEK} PREDICTIONS")
    print(f"📊 Historical seasons: {HISTORICAL_SEASONS} (3 years of data)")
    print(f"📈 Current season: Weeks 1-{CURRENT_WEEK-1} (games already played)")
    print(f"🎯 Target: Generate predictions for Week {CURRENT_WEEK}, {CURRENT_SEASON}")

    try:
        # Collect historical player statistics
        print("📊 Collecting historical player statistics...")
        historical_stats = collect_historical_stats()

        # Collect recent performance data
        print("📈 Collecting recent performance trends...")
        recent_performance = collect_recent_performance()

        # Collect team data for context
        print("🏟️ Collecting team context data...")
        team_context = collect_team_context()

        # Load injury/news info from existing pipeline or ESPN (if available)
        print("🩺 Loading injury/news info from supplemental sources...")
        injury_news = load_injury_news()

        # Combine all data
        print("🔄 Processing comprehensive dataset...")
        comprehensive_data = process_comprehensive_data(
            historical_stats, recent_performance, team_context, injury_news
        )

        # Write output to committed JSON file
        print(f"💾 Writing output to {OUTPUT_PATH} ...")
        with open(OUTPUT_PATH, 'w') as f:
            json.dump(comprehensive_data, f, indent=2)
        print(f"✅ NFLVerse + news data written to {OUTPUT_PATH}")

    except Exception as e:
        print(f"❌ NFLVerse data collection failed: {e}")
        print("This is optional - JavaScript data collection should be sufficient for TD props")
        sys.exit(0)  # Exit gracefully, don't fail the entire action

def collect_historical_stats():
    """Collect historical player statistics from NFLVerse"""
    print("Downloading 3 years of historical player stats from NFLVerse...")
    try:
        # Fix: Use correct parameter names for latest nfl_data_py
        all_stats = nfl.import_seasonal_data(seasons=HISTORICAL_SEASONS, stat_type='players', s_type='REG')

        # Filter for relevant positions and stats
        td_relevant_stats = all_stats[
            (all_stats['position'].isin(['QB', 'RB', 'WR', 'TE'])) &
            (all_stats['games'] >= 8)  # Players with significant playing time
        ].copy()

        # Calculate TD rates and efficiency metrics
        td_relevant_stats['td_rate'] = (
            td_relevant_stats['rushing_tds'].fillna(0) +
            td_relevant_stats['receiving_tds'].fillna(0)
        ) / td_relevant_stats['games']

        td_relevant_stats['red_zone_efficiency'] = (
            td_relevant_stats.get('red_zone_targets', 0).fillna(0) +
            td_relevant_stats.get('red_zone_carries', 0).fillna(0)
        )

        print(f"✅ Collected stats for {len(td_relevant_stats)} players across {len(HISTORICAL_SEASONS)} seasons")
        return td_relevant_stats

    except Exception as e:
        print(f"⚠️ NFLVerse historical stats failed: {e}")
        # Return empty DataFrame with expected structure
        return pd.DataFrame(columns=['player_id', 'player_name', 'position', 'team', 'season', 'td_rate'])

def collect_recent_performance():
    """Collect recent performance trends"""
    print("Collecting recent game-level performance data...")
    
    try:
        # Get recent games data
        recent_games = nfl.import_weekly_data([CURRENT_SEASON-1, CURRENT_SEASON])
        
        # Filter for TD-relevant positions and recent weeks
        recent_td_data = recent_games[
            (recent_games['position'].isin(['QB', 'RB', 'WR', 'TE'])) &
            (recent_games['week'] >= 15)  # Last few weeks of previous season + current
        ].copy()
        
        # Calculate recent form metrics
        recent_form = recent_td_data.groupby(['player_id', 'player_name']).agg({
            'rushing_tds': 'mean',
            'receiving_tds': 'mean',
            'targets': 'mean',
            'carries': 'mean',
            'week': 'count'
        }).reset_index()
        
        recent_form['recent_td_rate'] = (
            recent_form['rushing_tds'].fillna(0) + 
            recent_form['receiving_tds'].fillna(0)
        )
        
        print(f"✅ Analyzed recent performance for {len(recent_form)} players")
        return recent_form
        
    except Exception as e:
        print(f"⚠️ Recent performance collection failed: {e}")
        return pd.DataFrame(columns=['player_id', 'recent_td_rate'])

def collect_team_context():
    """Collect team-level context data"""
    print("Collecting team offensive and red zone efficiency data...")
    
    try:
    # Get team stats for context (latest nfl_data_py: no arguments allowed)
    team_stats = nfl.import_team_desc()
    # Filter for relevant seasons
    team_stats = team_stats[team_stats['season'].isin(HISTORICAL_SEASONS + [CURRENT_SEASON])]
        
        # Calculate team offensive efficiency
        team_efficiency = team_stats.groupby('team').agg({
            'points_scored': 'mean',
            'total_yards': 'mean',
            'red_zone_attempts': 'mean',
            'red_zone_scores': 'mean'
        }).reset_index()
        
        team_efficiency['red_zone_efficiency'] = (
            team_efficiency['red_zone_scores'] / 
            team_efficiency['red_zone_attempts'].replace(0, 1)
        ).fillna(0.5)
        
        print(f"✅ Collected team context for {len(team_efficiency)} teams")
        return team_efficiency
        
    except Exception as e:
        print(f"⚠️ Team context collection failed: {e}")
        # Return basic team efficiency estimates
        teams = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 
                'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA', 
                'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS']
        
        return pd.DataFrame({
            'team': teams,
            'red_zone_efficiency': [0.5] * len(teams),
            'offensive_rating': [1.0] * len(teams)
        })

def process_comprehensive_data(historical_stats, recent_performance, team_context, injury_news):
    """Process and combine all collected data, including injury/news info"""
    print("Processing comprehensive player analysis with historical context and news...")

    # Create comprehensive dataset
    comprehensive = {
        'metadata': {
            'season': CURRENT_SEASON,
            'week': CURRENT_WEEK,
            'generated_at': datetime.now().isoformat(),
            'data_source': 'nflverse_historical+news',
            'historical_seasons': HISTORICAL_SEASONS,
            'total_players': len(historical_stats)
        },
        'players': {},
        'team_context': team_context.to_dict('records') if not team_context.empty else []
    }

    # Process each player's historical data
    if not historical_stats.empty:
        for idx, player in historical_stats.iterrows():
            player_id = str(player.get('player_id', f"player_{idx}"))

            # Get recent performance for this player
            recent_data = recent_performance[
                recent_performance['player_id'] == player.get('player_id')
            ] if not recent_performance.empty else pd.DataFrame()

            # Get injury/news info for this player (if available)
            news = injury_news.get(player_id, {}) if injury_news else {}

            comprehensive['players'][player_id] = {
                'name': player.get('player_name', 'Unknown'),
                'position': player.get('position', 'UNK'),
                'team': player.get('recent_team', player.get('team', 'UNK')),

                'historical_performance': {
                    'career_td_rate': float(player.get('td_rate', 0)),
                    'career_games': int(player.get('games', 0)),
                    'career_tds': int(player.get('rushing_tds', 0) + player.get('receiving_tds', 0)),
                    'seasons_analyzed': len(HISTORICAL_SEASONS)
                },

                'recent_form': {
                    'recent_td_rate': float(recent_data['recent_td_rate'].iloc[0]) if not recent_data.empty else 0,
                    'recent_targets': float(recent_data['targets'].iloc[0]) if not recent_data.empty else 0,
                    'recent_carries': float(recent_data['carries'].iloc[0]) if not recent_data.empty else 0,
                    'games_analyzed': int(recent_data['week'].iloc[0]) if not recent_data.empty else 0
                },

                'prediction_factors': {
                    'historical_consistency': calculate_consistency(player),
                    'position_modifier': get_position_modifier(player.get('position', 'UNK')),
                    'team_context': get_team_context(player.get('team'), team_context)
                },

                'news': news  # Add injury/news info if available
            }

    print(f"✅ Processed comprehensive data for {len(comprehensive['players'])} players")
    return comprehensive

def calculate_consistency(player):
    """Calculate player consistency score"""
    # Simple consistency calculation based on available data
    games = player.get('games', 0)
    tds = player.get('rushing_tds', 0) + player.get('receiving_tds', 0)
    
    if games == 0:
        return 0.5
    
    # Higher consistency for players with steady TD production
    td_per_game = tds / games
    if td_per_game > 0.8:
        return 0.9
    elif td_per_game > 0.5:
        return 0.7
    elif td_per_game > 0.2:
        return 0.6
    else:
        return 0.4

def get_position_modifier(position):
    """Get position-specific modifier"""
    modifiers = {
        'QB': 0.8,
        'RB': 1.2,
        'WR': 1.0,
        'TE': 0.9
    }
    return modifiers.get(position, 1.0)

def get_team_context(team, team_context):
    """Get team context data"""
    if team_context.empty:
        return {'red_zone_efficiency': 0.5, 'offensive_rating': 1.0}
    
    team_data = team_context[team_context['team'] == team]
    if team_data.empty:
        return {'red_zone_efficiency': 0.5, 'offensive_rating': 1.0}
    
    return {
        'red_zone_efficiency': float(team_data['red_zone_efficiency'].iloc[0]),
        'offensive_rating': 1.0  # Default
    }


# Remove Netlify Blobs storage logic; output is now written to a committed JSON file in main()
def load_injury_news():
    """Load injury/news info from existing pipeline output or ESPN (placeholder)"""
    # Try to load from local file (output of NFL Predictions pipeline)
    if os.path.exists(INJURY_NEWS_PATH):
        try:
            with open(INJURY_NEWS_PATH, 'r') as f:
                news_data = json.load(f)
            # Expecting a dict keyed by player_id
            print(f"✅ Loaded injury/news info from {INJURY_NEWS_PATH}")
            return news_data
        except Exception as e:
            print(f"⚠️ Failed to load injury/news info: {e}")
            return {}
    # Placeholder: Optionally fetch from ESPN or other free APIs here
    # Example: requests.get('https://site/api/players/injuries')
    print("ℹ️ No local injury/news info found; skipping supplemental news fetch.")
    return {}

if __name__ == "__main__":
    main()
