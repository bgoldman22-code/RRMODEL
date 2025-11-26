#!/usr/bin/env python3
"""
Build multi-season boxscore file locally using NBA API
Fetches: 2024-25 (full) + 2025-26 (current)
Output: data/nba/player-history-2024-2026.json
"""
import json
from nba_api.stats.endpoints import playergamelog
from nba_api.stats.static import players
import pandas as pd
import time
from datetime import datetime

print("=" * 60)
print("🏀 NBA Multi-Season Boxscore Builder")
print("=" * 60)
print()

# Configuration
SEASONS = ["2024-25", "2025-26"]
OUTPUT_PATH = 'data/nba/player-history-2024-2026.json'
RATE_LIMIT_DELAY = 0.6  # seconds between API calls

# Get all active players
print("📋 Step 1: Getting active player list...")
all_players = players.get_active_players()
print(f"   ✅ Found {len(all_players)} active players")
print()

# Track progress
all_boxscores = []
errors = []
players_with_data = 0

for season in SEASONS:
    print(f"📅 Step 2: Fetching {season} season data...")
    print(f"   Rate limit: {RATE_LIMIT_DELAY}s per player (~{int(len(all_players) * RATE_LIMIT_DELAY / 60)} min total)")
    print()
    
    season_games = 0
    
    for i, player in enumerate(all_players):
        player_id = player['id']
        player_name = player['full_name']
        
        # Progress updates
        if (i + 1) % 25 == 0:
            print(f"   Progress: {i+1}/{len(all_players)} players | {season_games} games | {len(errors)} errors")
        
        try:
            # Fetch game logs
            gamelog = playergamelog.PlayerGameLog(
                player_id=player_id,
                season=season,
                season_type_all_star='Regular Season'
            )
            
            games_df = gamelog.get_data_frames()[0]
            
            if len(games_df) > 0:
                players_with_data += 1
                
                for _, game in games_df.iterrows():
                    # Normalize data to consistent format
                    boxscore = {
                        # Identifiers
                        'playerName': player_name,
                        'playerId': str(player_id),
                        'gameDate': game['GAME_DATE'],  # Format: 'NOV 25, 2025'
                        'season': season,
                        
                        # Team info
                        'teamTricode': game['MATCHUP'].split()[0] if pd.notna(game['MATCHUP']) else None,
                        'opponentTricode': game['MATCHUP'].split()[-1] if pd.notna(game['MATCHUP']) else None,
                        'isHome': '@' not in game['MATCHUP'] if pd.notna(game['MATCHUP']) else None,
                        
                        # Core stats (what Phase 3.5 needs)
                        'minutes': float(game['MIN']) if pd.notna(game['MIN']) else 0.0,
                        'points': int(game['PTS']) if pd.notna(game['PTS']) else 0,
                        'rebounds': int(game['REB']) if pd.notna(game['REB']) else 0,
                        'assists': int(game['AST']) if pd.notna(game['AST']) else 0,
                        
                        # Additional stats
                        'steals': int(game['STL']) if pd.notna(game['STL']) else 0,
                        'blocks': int(game['BLK']) if pd.notna(game['BLK']) else 0,
                        'turnovers': int(game['TOV']) if pd.notna(game['TOV']) else 0,
                        'fouls': int(game['PF']) if pd.notna(game['PF']) else 0,
                        
                        # Shooting stats
                        'fgMade': int(game['FGM']) if pd.notna(game['FGM']) else 0,
                        'fgAtt': int(game['FGA']) if pd.notna(game['FGA']) else 0,
                        'fg3Made': int(game['FG3M']) if pd.notna(game['FG3M']) else 0,
                        'fg3Att': int(game['FG3A']) if pd.notna(game['FG3A']) else 0,
                        'ftMade': int(game['FTM']) if pd.notna(game['FTM']) else 0,
                        'ftAtt': int(game['FTA']) if pd.notna(game['FTA']) else 0,
                        
                        # Rebounds breakdown
                        'oreb': int(game['OREB']) if pd.notna(game['OREB']) else 0,
                        'dreb': int(game['DREB']) if pd.notna(game['DREB']) else 0,
                        
                        # Plus/minus
                        'plusMinus': int(game['PLUS_MINUS']) if pd.notna(game['PLUS_MINUS']) else 0,
                    }
                    
                    all_boxscores.append(boxscore)
                    season_games += 1
            
            # Rate limit
            time.sleep(RATE_LIMIT_DELAY)
            
        except Exception as e:
            error_msg = f"{player_name} ({season}): {str(e)}"
            errors.append(error_msg)
            if len(errors) <= 10:  # Show first 10 errors
                print(f"   ⚠️  {error_msg}")
            continue
    
    print(f"   ✅ {season}: {season_games} games collected")
    print()

print("=" * 60)
print("📊 Collection Complete!")
print("=" * 60)
print(f"Total games collected: {len(all_boxscores)}")
print(f"Players with data: {players_with_data}")
print(f"Errors encountered: {len(errors)}")
print()

# Sort by date (newest first for easy verification)
print("📋 Sorting by date...")
all_boxscores.sort(key=lambda x: x['gameDate'], reverse=True)

# Get date range
if all_boxscores:
    dates = [b['gameDate'] for b in all_boxscores]
    print(f"   Date range: {dates[-1]} → {dates[0]}")
print()

# Save to file
print(f"💾 Saving to {OUTPUT_PATH}...")
with open(OUTPUT_PATH, 'w') as f:
    json.dump(all_boxscores, f, indent=2)

file_size_mb = len(json.dumps(all_boxscores)) / (1024 * 1024)
print(f"   ✅ Saved {len(all_boxscores)} games ({file_size_mb:.1f} MB)")
print()

# Show sample data for verification
if all_boxscores:
    print("🔍 Sample record (most recent game):")
    sample = all_boxscores[0]
    print(f"   Player: {sample['playerName']}")
    print(f"   Date: {sample['gameDate']}")
    print(f"   Stats: {sample['points']}p / {sample['rebounds']}r / {sample['assists']}a")
    print(f"   Minutes: {sample['minutes']}")
    print()

# Show any errors
if errors:
    print("⚠️  Errors (first 20):")
    for error in errors[:20]:
        print(f"   • {error}")
    if len(errors) > 20:
        print(f"   ... and {len(errors) - 20} more")
    print()

print("=" * 60)
print("✅ COMPLETE - Ready to use for predictions!")
print("=" * 60)
