#!/usr/bin/env python3
"""
NFL Player Data Collection using NFLVerse
Fixed version - corrects API parameter errors
"""

import os
import sys
import json
import requests
import pandas as pd
from datetime import datetime

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
NETLIFY_TOKEN = os.getenv('NETLIFY_TOKEN')
NETLIFY_SITE_ID = os.getenv('NETLIFY_SITE_ID')

# Historical seasons for context (3 years)
HISTORICAL_SEASONS = [2022, 2023, 2024]

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
        
        # Combine all data
        print("🔄 Processing comprehensive dataset...")
        comprehensive_data = process_comprehensive_data(
            historical_stats, recent_performance, team_context
        )
        
        # Store in Netlify Blobs
        print("💾 Storing historical data in Netlify Blobs...")
        store_results = store_nflverse_data(comprehensive_data)
        
        if store_results:
            print("✅ NFLVerse historical data collection completed successfully!")
            print(f"📊 Processed {len(comprehensive_data.get('players', {}))} players with historical context")
        else:
            print("⚠️ Data collected but storage failed - check Netlify credentials")
            
    except Exception as e:
        print(f"❌ NFLVerse data collection failed: {e}")
        print("This is optional - JavaScript data collection should be sufficient for TD props")
        sys.exit(0)  # Exit gracefully, don't fail the entire action

def collect_historical_stats():
    """Collect historical player statistics from NFLVerse"""
    print("Downloading 3 years of historical player stats from NFLVerse...")
    
    try:
        # Fix: Use correct parameter name and values
        all_stats = nfl.import_seasonal_data(HISTORICAL_SEASONS, 'players', s_type='REG')
        
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
        # Get team stats for context
        team_stats = nfl.import_team_desc(HISTORICAL_SEASONS + [CURRENT_SEASON])
        
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

def process_comprehensive_data(historical_stats, recent_performance, team_context):
    """Process and combine all collected data"""
    print("Processing comprehensive player analysis with historical context...")
    
    # Create comprehensive dataset
    comprehensive = {
        'metadata': {
            'season': CURRENT_SEASON,
            'week': CURRENT_WEEK,
            'generated_at': datetime.now().isoformat(),
            'data_source': 'nflverse_historical',
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
                }
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

def store_nflverse_data(comprehensive_data):
    """Store NFLVerse data in Netlify Blobs"""
    if not NETLIFY_TOKEN or not NETLIFY_SITE_ID:
        print("⚠️ Cannot store NFLVerse data: Missing Netlify credentials")
        return False
    
    try:
        # Store historical analysis data
        blob_key = f"nfl/historical/nflverse-analysis-{CURRENT_SEASON}-week{CURRENT_WEEK}.json"
        
        response = requests.put(
            f"https://api.netlify.com/api/v1/sites/{NETLIFY_SITE_ID}/blobs/{blob_key}",
            headers={
                'Authorization': f'Bearer {NETLIFY_TOKEN}',
                'Content-Type': 'application/json'
            },
            json=comprehensive_data
        )
        
        if response.status_code == 200:
            print(f"✅ Stored NFLVerse data: {blob_key}")
            
            # Also store as latest for easy access
            latest_response = requests.put(
                f"https://api.netlify.com/api/v1/sites/{NETLIFY_SITE_ID}/blobs/nfl/historical/latest.json",
                headers={
                    'Authorization': f'Bearer {NETLIFY_TOKEN}',
                    'Content-Type': 'application/json'
                },
                json=comprehensive_data
            )
            
            if latest_response.status_code == 200:
                print("✅ Stored latest NFLVerse data")
                return True
            else:
                print(f"⚠️ Failed to store latest NFLVerse data: {latest_response.status_code}")
                return False
        else:
            print(f"❌ Failed to store NFLVerse data: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error storing NFLVerse data: {e}")
        return False

if __name__ == "__main__":
    main()
