#!/usr/bin/env python3
"""
Fetch 2025-26 NBA Season (Current Season - Through Today)
"""
import json
import time
from nba_api.stats.endpoints import playergamelog
from nba_api.stats.static import players

print("=" * 70)
print("🏀 Fetching 2025-26 NBA Season (Current)")
print("=" * 70)

SEASON = "2025-26"
OUTPUT = "data/nba/boxscores-2025-26.json"
RATE_LIMIT = 0.6

all_players = players.get_active_players()
print(f"✅ {len(all_players)} players | Output: {OUTPUT}\n")

boxscores = []
for idx, player in enumerate(all_players, 1):
    if idx % 50 == 0:
        print(f"Progress: {idx}/{len(all_players)} players | {len(boxscores)} games")
    
    try:
        gamelog = playergamelog.PlayerGameLog(
            player_id=player['id'],
            season=SEASON,
            season_type_all_star='Regular Season'
        )
        
        df = gamelog.get_data_frames()[0]
        
        for _, game in df.iterrows():
            matchup = str(game['MATCHUP'])
            is_home = '@' not in matchup
            parts = matchup.split(' @ ') if '@' in matchup else matchup.split(' vs. ')
            
            boxscores.append({
                'playerName': player['full_name'],
                'playerId': str(player['id']),
                'gameDate': game['GAME_DATE'],
                'season': SEASON,
                'teamTricode': parts[0] if len(parts) > 0 else 'UNK',
                'opponentTricode': parts[1] if len(parts) > 1 else 'UNK',
                'isHome': is_home,
                'minutes': float(game['MIN']) if game['MIN'] else 0.0,
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
                'fouls': int(game['PF']) if game['PF'] else 0,
                'plusMinus': int(game['PLUS_MINUS']) if game['PLUS_MINUS'] else 0
            })
        
        time.sleep(RATE_LIMIT)
    except Exception as e:
        print(f"⚠️  {player['full_name']}: {e}")
        continue

print(f"\n✅ Collected {len(boxscores)} games")

# Save
with open(OUTPUT, 'w') as f:
    json.dump(boxscores, f, indent=2)

print(f"💾 Saved to {OUTPUT}")
print("=" * 70)
