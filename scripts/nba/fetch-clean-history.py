#!/usr/bin/env python3
"""
Clean NBA Boxscore Fetcher - Fresh Start
Uses official NBA Stats API via nba_api package
Fetches 2024-25 + 2025-26 seasons
Output: Simple, clean JSON with exactly what Phase 3.5 needs
"""

import json
import time
from datetime import datetime
from nba_api.stats.endpoints import playergamelog
from nba_api.stats.static import players

print("=" * 70)
print("🏀 Clean NBA Boxscore Fetcher")
print("=" * 70)
print()

# Configuration
SEASONS_TO_FETCH = ["2025-26"]  # ONLY 2025-26 season
OUTPUT_FILE = "data/nba/player-boxscores-2025-26.json"
RATE_LIMIT = 0.6  # seconds between requests

print("📋 Configuration:")
print(f"   Seasons: {', '.join(SEASONS_TO_FETCH)}")
print(f"   Output: {OUTPUT_FILE}")
print(f"   Rate limit: {RATE_LIMIT}s per player")
print()

# Get active players
print("Step 1: Loading active player list...")
all_players = players.get_active_players()
print(f"   ✅ Found {len(all_players)} active NBA players")
print()

# Storage
all_boxscores = []
total_games = 0
players_processed = 0
errors = []

# Fetch each season
for season in SEASONS_TO_FETCH:
    print(f"Step 2: Fetching {season} season...")
    season_games = 0
    season_start = time.time()
    
    for idx, player in enumerate(all_players, 1):
        player_id = player['id']
        player_name = player['full_name']
        
        # Progress every 50 players
        if idx % 50 == 0:
            elapsed = time.time() - season_start
            rate = idx / elapsed if elapsed > 0 else 0
            remaining = (len(all_players) - idx) / rate if rate > 0 else 0
            print(f"   Progress: {idx}/{len(all_players)} players | "
                  f"{season_games} games | "
                  f"~{int(remaining/60)}m remaining")
        
        try:
            # Fetch player's game log for this season
            gamelog = playergamelog.PlayerGameLog(
                player_id=player_id,
                season=season,
                season_type_all_star='Regular Season'
            )
            
            df = gamelog.get_data_frames()[0]
            
            # Process each game
            for _, game in df.iterrows():
                # Parse matchup (e.g., "LAL vs. BOS" or "LAL @ BOS")
                matchup = str(game['MATCHUP'])
                is_home = '@' not in matchup
                parts = matchup.split(' @ ') if '@' in matchup else matchup.split(' vs. ')
                team = parts[0] if len(parts) > 0 else 'UNK'
                opponent = parts[1] if len(parts) > 1 else 'UNK'
                
                # Create clean boxscore record
                boxscore = {
                    # Identity
                    'playerName': player_name,
                    'playerId': str(player_id),
                    'gameDate': game['GAME_DATE'],
                    'gameId': str(game['Game_ID']),
                    'season': season,
                    
                    # Teams
                    'teamTricode': team,
                    'opponentTricode': opponent,
                    'isHome': is_home,
                    
                    # Core stats (what Phase 3.5 needs)
                    'minutes': float(game['MIN']) if game['MIN'] else 0.0,
                    'points': int(game['PTS']) if game['PTS'] else 0,
                    'rebounds': int(game['REB']) if game['REB'] else 0,
                    'assists': int(game['AST']) if game['AST'] else 0,
                    
                    # Additional stats
                    'steals': int(game['STL']) if game['STL'] else 0,
                    'blocks': int(game['BLK']) if game['BLK'] else 0,
                    'turnovers': int(game['TOV']) if game['TOV'] else 0,
                    'fouls': int(game['PF']) if game['PF'] else 0,
                    
                    # Shooting
                    'fgMade': int(game['FGM']) if game['FGM'] else 0,
                    'fgAtt': int(game['FGA']) if game['FGA'] else 0,
                    'fg3Made': int(game['FG3M']) if game['FG3M'] else 0,
                    'fg3Att': int(game['FG3A']) if game['FG3A'] else 0,
                    'ftMade': int(game['FTM']) if game['FTM'] else 0,
                    'ftAtt': int(game['FTA']) if game['FTA'] else 0,
                    
                    # Rebounds detail
                    'oreb': int(game['OREB']) if game['OREB'] else 0,
                    'dreb': int(game['DREB']) if game['DREB'] else 0,
                    
                    # Plus/minus
                    'plusMinus': int(game['PLUS_MINUS']) if game['PLUS_MINUS'] else 0
                }
                
                all_boxscores.append(boxscore)
                season_games += 1
                total_games += 1
            
            players_processed += 1
            
            # Rate limit
            time.sleep(RATE_LIMIT)
            
        except Exception as e:
            error_msg = f"{player_name} ({season}): {str(e)}"
            errors.append(error_msg)
            # Show first 5 errors only
            if len(errors) <= 5:
                print(f"   ⚠️  {error_msg}")
            continue
    
    print(f"   ✅ {season}: {season_games} games collected")
    print()

# Summary
print("=" * 70)
print("📊 Collection Complete")
print("=" * 70)
print(f"Total games: {total_games}")
print(f"Total records: {len(all_boxscores)}")
print(f"Players processed: {players_processed}/{len(all_players)}")
print(f"Errors: {len(errors)}")
print()

# Sort by date (newest first)
print("Step 3: Sorting data...")
all_boxscores.sort(key=lambda x: x['gameDate'], reverse=True)

# Get date range
if all_boxscores:
    dates = sorted([b['gameDate'] for b in all_boxscores])
    print(f"   Date range: {dates[0]} → {dates[-1]}")
print()

# Verify with sample
if all_boxscores:
    print("Step 4: Data quality check...")
    sample = all_boxscores[0]
    print(f"   Most recent game:")
    print(f"      Player: {sample['playerName']}")
    print(f"      Date: {sample['gameDate']}")
    print(f"      Stats: {sample['points']}pts / {sample['rebounds']}reb / {sample['assists']}ast")
    print(f"      Minutes: {sample['minutes']}")
    
    # Check for reasonable data
    games_with_points = sum(1 for b in all_boxscores if b['points'] > 0)
    pct_with_points = (games_with_points / len(all_boxscores)) * 100
    print(f"   Games with points: {games_with_points}/{len(all_boxscores)} ({pct_with_points:.1f}%)")
    
    if pct_with_points < 50:
        print("   ⚠️  WARNING: Less than 50% of games have points scored - data may be incomplete")
    else:
        print("   ✅ Data quality looks good")
print()

# Save
print("Step 5: Saving to file...")
with open(OUTPUT_FILE, 'w') as f:
    json.dump(all_boxscores, f, indent=2)

file_size_mb = len(json.dumps(all_boxscores)) / (1024 * 1024)
print(f"   ✅ Saved to {OUTPUT_FILE}")
print(f"   File size: {file_size_mb:.1f} MB")
print()

# Error summary
if errors:
    print("⚠️  Errors encountered:")
    for error in errors[:10]:
        print(f"   • {error}")
    if len(errors) > 10:
        print(f"   ... and {len(errors) - 10} more")
    print()

print("=" * 70)
print("✅ SUCCESS - Ready for Phase 3.5!")
print("=" * 70)
print()
print("Next steps:")
print("  1. Update Phase 3.5 to load: data/nba/player-boxscores-clean.json")
print("  2. Run predictions with: ODDS_API_KEY=xxx node scripts/nba/generate-predictions-phase3.5.mjs")
