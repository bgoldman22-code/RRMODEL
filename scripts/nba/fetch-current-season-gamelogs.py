#!/usr/bin/env python3
"""
Fetch current 2025-26 NBA season game logs using nba_api package

This script fetches player game logs for the current season to ensure we have
up-to-date stats for generating predictions.

Usage:
    python3 scripts/nba/fetch-current-season-gamelogs.py
    
Output:
    data/nba/player-boxscores-2025-26.json (array format)
"""

import json
import time
from pathlib import Path
from datetime import datetime
from nba_api.stats.static import players as static_players
from nba_api.stats.endpoints import playergamelog

CURRENT_SEASON = "2025-26"


def fetch_all_players():
    """Fetch list of all active players"""
    print(f"Fetching all active players for {CURRENT_SEASON}...")
    players = static_players.get_active_players()
    print(f"  ✅ Found {len(players)} active players")
    return players


def fetch_player_game_log(player_id, player_name):
    """Fetch game log for a specific player"""
    try:
        gamelog = playergamelog.PlayerGameLog(
            player_id=player_id,
            season=CURRENT_SEASON,
            season_type_all_star='Regular Season'
        )
        
        df = gamelog.get_data_frames()[0]
        
        if df.empty:
            return []
        
        # Convert DataFrame to list of dicts with normalized field names
        games = []
        for _, row in df.iterrows():
            normalized = {
                'season': CURRENT_SEASON,
                'gameId': str(row.get('Game_ID', '')),
                'gameDate': str(row.get('GAME_DATE', '')),
                'playerName': player_name,
                'teamAbbreviation': str(row.get('TEAM_ABBREVIATION', '')),
                'matchup': str(row.get('MATCHUP', '')),
                'wl': str(row.get('WL', '')),
                'min': float(row.get('MIN', 0)) if row.get('MIN') else 0,
                'pts': int(row.get('PTS', 0)) if row.get('PTS') is not None else 0,
                'reb': int(row.get('REB', 0)) if row.get('REB') is not None else 0,
                'ast': int(row.get('AST', 0)) if row.get('AST') is not None else 0,
                'stl': int(row.get('STL', 0)) if row.get('STL') is not None else 0,
                'blk': int(row.get('BLK', 0)) if row.get('BLK') is not None else 0,
                'tov': int(row.get('TOV', 0)) if row.get('TOV') is not None else 0,
                'pf': int(row.get('PF', 0)) if row.get('PF') is not None else 0,
                'fgm': int(row.get('FGM', 0)) if row.get('FGM') is not None else 0,
                'fga': int(row.get('FGA', 0)) if row.get('FGA') is not None else 0,
                'fg_pct': float(row.get('FG_PCT', 0)) if row.get('FG_PCT') is not None else 0,
                'fg3m': int(row.get('FG3M', 0)) if row.get('FG3M') is not None else 0,
                'fg3a': int(row.get('FG3A', 0)) if row.get('FG3A') is not None else 0,
                'fg3_pct': float(row.get('FG3_PCT', 0)) if row.get('FG3_PCT') is not None else 0,
                'ftm': int(row.get('FTM', 0)) if row.get('FTM') is not None else 0,
                'fta': int(row.get('FTA', 0)) if row.get('FTA') is not None else 0,
                'ft_pct': float(row.get('FT_PCT', 0)) if row.get('FT_PCT') is not None else 0,
                'oreb': int(row.get('OREB', 0)) if row.get('OREB') is not None else 0,
                'dreb': int(row.get('DREB', 0)) if row.get('DREB') is not None else 0,
                'plus_minus': int(row.get('PLUS_MINUS', 0)) if row.get('PLUS_MINUS') is not None else 0,
            }
            games.append(normalized)
        
        return games
    
    except Exception as e:
        # Some players may not have games yet this season
        return []


def main():
    print("=" * 60)
    print(f"NBA {CURRENT_SEASON} Season Game Logs Fetcher")
    print("=" * 60)
    print()
    
    # Step 1: Get all active players
    players = fetch_all_players()
    
    # Step 2: Fetch game logs for each player
    print(f"\nFetching game logs for {len(players)} players...")
    all_games = []
    errors = 0
    
    for i, player in enumerate(players, 1):
        player_id = player['id']
        player_name = player['full_name']
        
        # Progress indicator every 25 players
        if i % 25 == 0:
            print(f"  [{i}/{len(players)}] {player_name}... ({len(all_games)} games so far)")
        
        try:
            games = fetch_player_game_log(player_id, player_name)
            all_games.extend(games)
            
            # Rate limiting - be respectful to NBA API
            time.sleep(0.6)  # ~100 requests per minute
            
        except Exception as e:
            errors += 1
            if errors < 10:  # Only show first 10 errors
                print(f"    ⚠️  Error fetching {player_name}: {e}")
    
    print(f"\n✅ Fetched {len(all_games)} total game logs ({errors} errors)")
    
    # Step 3: Save to file
    output_file = Path(__file__).parent.parent.parent / "data" / "nba" / "player-boxscores-2025-26.json"
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"\nSaving to {output_file}...")
    with open(output_file, 'w') as f:
        json.dump(all_games, f, indent=2)
    
    print(f"✅ Saved {len(all_games)} games to {output_file.name}")
    print()
    print("=" * 60)
    print("✅ COMPLETE")
    print("=" * 60)
    print(f"📊 Total games: {len(all_games)}")
    print(f"📁 Output: {output_file}")
    print()
    print("Next step: Run generate-predictions-phase3.5.mjs with ODDS_API_KEY")


if __name__ == "__main__":
    main()
