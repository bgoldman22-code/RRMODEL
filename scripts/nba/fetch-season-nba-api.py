#!/usr/bin/env python3
"""
Fetch complete 2025-26 season boxscores using nba_api (official NBA.com API)
More reliable than ESPN scraping
"""
import json
from nba_api.stats.endpoints import playergamelog
from nba_api.stats.static import players
from datetime import datetime
import time

print("🏀 Fetching 2025-26 Season via NBA API")
print("=" * 50)

# Get all active players
all_players = players.get_active_players()
print(f"✅ Found {len(all_players)} active players")

boxscores = []
season = "2025-26"

for i, player in enumerate(all_players):
    player_id = player['id']
    player_name = player['full_name']
    
    if (i + 1) % 50 == 0:
        print(f"Progress: {i+1}/{len(all_players)} players...")
    
    try:
        # Fetch game logs for this player
        gamelog = playergamelog.PlayerGameLog(
            player_id=player_id,
            season=season,
            season_type_all_star='Regular Season'
        )
        
        games = gamelog.get_data_frames()[0]
        
        if len(games) > 0:
            for _, game in games.iterrows():
                boxscores.append({
                    'gameDate': game['GAME_DATE'],
                    'playerName': player_name,
                    'playerId': str(player_id),
                    'teamTricode': game['MATCHUP'].split()[0],
                    'opponentTricode': game['MATCHUP'].split()[-1],
                    'isHome': '@' not in game['MATCHUP'],
                    'minutes': float(game['MIN']) if game['MIN'] else 0,
                    'points': int(game['PTS']) if game['PTS'] else 0,
                    'rebounds': int(game['REB']) if game['REB'] else 0,
                    'assists': int(game['AST']) if game['AST'] else 0,
                    'steals': int(game['STL']) if game['STL'] else 0,
                    'blocks': int(game['BLK']) if game['BLK'] else 0,
                    'turnovers': int(game['TOV']) if game['TOV'] else 0,
                    'fgMade': int(game['FGM']) if game['FGM'] else 0,
                    'fgAtt': int(game['FGA']) if game['FGA'] else 0,
                    'fg3Made': int(game['FG3M']) if game['FG3M'] else 0,
                    'fg3Att': int(game['FG3A']) if game['FG3A'] else 0,
                    'ftMade': int(game['FTM']) if game['FTM'] else 0,
                    'ftAtt': int(game['FTA']) if game['FTA'] else 0,
                    'oreb': int(game['OREB']) if game['OREB'] else 0,
                    'dreb': int(game['DREB']) if game['DREB'] else 0,
                    'fouls': int(game['PF']) if game['PF'] else 0
                })
        
        time.sleep(0.6)  # Rate limit: ~100 requests/minute
        
    except Exception as e:
        print(f"⚠️  Error fetching {player_name}: {e}")
        continue

print(f"\n✅ Collected {len(boxscores)} player-game records")

# Save to file
output_path = 'data/nba/player-boxscores-2025-26.json'
with open(output_path, 'w') as f:
    json.dump(boxscores, f)

print(f"💾 Saved to {output_path}")
print("✅ Complete!")
