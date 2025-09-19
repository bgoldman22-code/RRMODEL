#!/usr/bin/env python3
"""
Quick NFLVerse TD Data Collection
Focuses only on TD-relevant stats for current predictions
"""

import os
import json
import pandas as pd
from datetime import datetime

try:
    import nfl_data_py as nfl
    print("✅ NFLVerse library loaded")
except ImportError:
    print("❌ Installing nfl_data_py...")
    os.system("pip install nfl_data_py")
    import nfl_data_py as nfl

def collect_td_focused_data():
    """Collect only TD-relevant historical data"""
    print("📊 Collecting TD-focused NFLVerse data...")
    
    try:
        # Get last 2 seasons of weekly data
        seasons = [2023, 2024]
        print(f"📈 Loading seasons: {seasons}")
        
        weekly_data = nfl.import_weekly_data(seasons, columns=[
            'player_id', 'player_name', 'recent_team', 'position', 'week', 'season',
            'rushing_tds', 'receiving_tds', 'targets', 'carries', 'receptions',
            'red_zone_targets', 'red_zone_carries', 'goal_line_targets', 'goal_line_carries'
        ])
        
        print(f"✅ Loaded {len(weekly_data)} weekly records")
        
        # Focus on TD-scoring positions
        td_players = weekly_data[
            weekly_data['position'].isin(['QB', 'RB', 'WR', 'TE']) &
            ((weekly_data['rushing_tds'] > 0) | (weekly_data['receiving_tds'] > 0) | 
             (weekly_data['targets'] > 0) | (weekly_data['carries'] > 0))
        ].copy()
        
        print(f"📈 Filtered to {len(td_players)} TD-relevant records")
        
        # Calculate player TD rates
        player_td_rates = td_players.groupby(['player_name', 'position']).agg({
            'rushing_tds': 'mean',
            'receiving_tds': 'mean', 
            'targets': 'mean',
            'carries': 'mean',
            'red_zone_targets': 'mean',
            'red_zone_carries': 'mean',
            'week': 'count'  # Games played
        }).reset_index()
        
        # Calculate combined TD rate
        player_td_rates['total_td_per_game'] = (
            player_td_rates['rushing_tds'].fillna(0) + 
            player_td_rates['receiving_tds'].fillna(0)
        )
        
        # Filter to players with meaningful sample size
        meaningful_players = player_td_rates[
            (player_td_rates['week'] >= 8) &  # At least 8 games
            (player_td_rates['total_td_per_game'] > 0.05)  # Some TD production
        ].copy()
        
        print(f"🎯 {len(meaningful_players)} players with meaningful TD history")
        
        # Export for use in predictions
        output_data = {
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'seasons': seasons,
                'total_players': len(meaningful_players),
                'min_games': 8
            },
            'player_td_rates': meaningful_players.to_dict('records')
        }
        
        output_path = 'public/data/nfl-historical-td-rates.json'
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        print(f"✅ Exported historical TD rates to {output_path}")
        
        # Show sample of top TD producers
        top_producers = meaningful_players.nlargest(10, 'total_td_per_game')
        print("\n🏆 Top 10 Historical TD Producers:")
        for _, player in top_producers.iterrows():
            print(f"  {player['player_name']} ({player['position']}): {player['total_td_per_game']:.3f} TD/game")
        
        return output_data
        
    except Exception as e:
        print(f"❌ NFLVerse collection failed: {e}")
        return None

if __name__ == "__main__":
    collect_td_focused_data()