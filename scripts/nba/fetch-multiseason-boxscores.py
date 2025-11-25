#!/usr/bin/env python3
"""
Fetch multi-season NBA player boxscores using nba_api

This script collects player game logs for multiple NBA seasons using the official
NBA API via the nba_api Python library.

Usage:
    python scripts/nba/fetch-multiseason-boxscores.py --seasons 2022-23 2023-24 2024-25

Output:
    data/nba/raw/boxscores_2022_23.json
    data/nba/raw/boxscores_2023_24.json
    data/nba/raw/boxscores_2024_25.json

Data Safety:
    - Atomic writes (write to .tmp, then rename)
    - Skip existing files (idempotent)
    - Updates phase3_checkpoints.json
"""

import json
import os
import sys
import time
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

# Check if nba_api is installed
try:
    from nba_api.stats.endpoints import leaguegamelog
    from nba_api.stats.library.parameters import SeasonType
except ImportError:
    print("ERROR: nba_api not installed")
    print("Install with: pip install nba-api")
    sys.exit(1)


# Season mapping (season string -> NBA API season format)
SEASON_MAP = {
    "2022-23": "2022-23",
    "2023-24": "2023-24", 
    "2024-25": "2024-25",
    "2025-26": "2025-26"
}


def fetch_season_boxscores(season: str, player_or_team: str = "P") -> List[Dict[str, Any]]:
    """
    Fetch all player game logs for a given season using nba_api
    
    Args:
        season: Season string like "2022-23"
        player_or_team: "P" for player, "T" for team
        
    Returns:
        List of game log dictionaries
    """
    print(f"\n[fetch-multiseason-boxscores] Fetching {season} season...")
    
    try:
        # Fetch regular season game logs
        gamelog = leaguegamelog.LeagueGameLog(
            season=season,
            season_type_all_star=SeasonType.regular,
            player_or_team_abbreviation=player_or_team
        )
        
        # Get data as dictionary
        data = gamelog.get_dict()
        
        if 'resultSets' not in data or len(data['resultSets']) == 0:
            print(f"  ⚠️  No data returned for {season}")
            return []
        
        result_set = data['resultSets'][0]
        headers = result_set['headers']
        rows = result_set['rowSet']
        
        # Convert to list of dictionaries
        games = []
        for row in rows:
            game = dict(zip(headers, row))
            games.append(game)
        
        print(f"  ✅ Fetched {len(games)} player-games for {season}")
        return games
        
    except Exception as e:
        print(f"  ❌ Error fetching {season}: {e}")
        return []


def normalize_game_log(game: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize NBA API game log to our internal schema
    
    NBA API fields:
    - PLAYER_ID, PLAYER_NAME, TEAM_ABBREVIATION
    - GAME_DATE (format: MMM DD, YYYY like "NOV 15, 2023")
    - MATCHUP (format: "DAL vs. LAL" or "DAL @ LAL")
    - MIN (minutes as string like "35:24")
    - PTS, REB, AST, FGA, FTA, etc.
    """
    try:
        # Parse game date (format: "NOV 15, 2023" -> "2023-11-15")
        game_date_str = game.get('GAME_DATE', '')
        try:
            game_date = datetime.strptime(game_date_str, '%b %d, %Y').strftime('%Y-%m-%d')
        except:
            game_date = game_date_str  # Keep original if parsing fails
        
        # Parse matchup to get opponent and home/away
        matchup = game.get('MATCHUP', '')
        team = game.get('TEAM_ABBREVIATION', '')
        
        if ' vs. ' in matchup:
            # Home game (e.g., "DAL vs. LAL")
            opponent = matchup.split(' vs. ')[1] if ' vs. ' in matchup else ''
            home = 1
        elif ' @ ' in matchup:
            # Away game (e.g., "DAL @ LAL")
            opponent = matchup.split(' @ ')[1] if ' @ ' in matchup else ''
            home = 0
        else:
            opponent = ''
            home = 0
        
        # Parse minutes (format: "35:24" -> 35.4)
        minutes_str = game.get('MIN', '0')
        if minutes_str and isinstance(minutes_str, str) and ':' in minutes_str:
            try:
                parts = minutes_str.split(':')
                minutes = float(parts[0]) + float(parts[1]) / 60.0
            except:
                minutes = 0.0
        else:
            try:
                minutes = float(minutes_str) if minutes_str else 0.0
            except:
                minutes = 0.0
        
        # Build normalized record
        normalized = {
            'date': game_date,
            'player_id': str(game.get('PLAYER_ID', '')),
            'player_name': game.get('PLAYER_NAME', ''),
            'team': team,
            'opponent': opponent,
            'home': home,
            'minutes': round(minutes, 1),
            'points': game.get('PTS', 0) or 0,
            'rebounds': game.get('REB', 0) or 0,
            'assists': game.get('AST', 0) or 0,
            'pra': (game.get('PTS', 0) or 0) + (game.get('REB', 0) or 0) + (game.get('AST', 0) or 0),
            'fga': game.get('FGA', 0) or 0,
            'fgm': game.get('FGM', 0) or 0,
            'fg_pct': game.get('FG_PCT', 0) or 0,
            'fg3a': game.get('FG3A', 0) or 0,
            'fg3m': game.get('FG3M', 0) or 0,
            'fg3_pct': game.get('FG3_PCT', 0) or 0,
            'fta': game.get('FTA', 0) or 0,
            'ftm': game.get('FTM', 0) or 0,
            'ft_pct': game.get('FT_PCT', 0) or 0,
            'oreb': game.get('OREB', 0) or 0,
            'dreb': game.get('DREB', 0) or 0,
            'steals': game.get('STL', 0) or 0,
            'blocks': game.get('BLK', 0) or 0,
            'turnovers': game.get('TOV', 0) or 0,
            'fouls': game.get('PF', 0) or 0,
            'plus_minus': game.get('PLUS_MINUS', 0) or 0,
            'game_id': str(game.get('GAME_ID', ''))
        }
        
        return normalized
        
    except Exception as e:
        print(f"  ⚠️  Error normalizing game: {e}")
        return None


def save_season_data(season: str, games: List[Dict[str, Any]], output_dir: Path) -> str:
    """
    Save season data to JSON file with atomic write
    
    Returns:
        Path to saved file
    """
    # Create filename (e.g., "boxscores_2022_23.json")
    season_slug = season.replace('-', '_')
    filename = f"boxscores_{season_slug}.json"
    filepath = output_dir / filename
    tmp_filepath = output_dir / f".{filename}.tmp"
    
    # Check if file already exists (idempotent)
    if filepath.exists():
        print(f"\n  ℹ️  File already exists: {filepath}")
        print(f"  ℹ️  Skipping download (delete file to re-fetch)")
        return str(filepath)
    
    # Normalize all games
    print(f"\n[fetch-multiseason-boxscores] Normalizing {len(games)} games...")
    normalized_games = []
    for game in games:
        normalized = normalize_game_log(game)
        if normalized:
            normalized_games.append(normalized)
    
    print(f"  ✅ Normalized {len(normalized_games)} games")
    
    # Prepare data structure
    data = {
        'season': season,
        'fetched_at': datetime.utcnow().isoformat() + 'Z',
        'source': 'nba_api',
        'total_games': len(normalized_games),
        'games': normalized_games
    }
    
    # Atomic write: write to .tmp, then rename
    print(f"\n[fetch-multiseason-boxscores] Writing to {filepath}...")
    
    # Ensure directory exists
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Write to temp file
    with open(tmp_filepath, 'w') as f:
        json.dump(data, f, indent=2)
    
    # Rename to final file (atomic on POSIX systems)
    tmp_filepath.rename(filepath)
    
    print(f"  ✅ Saved: {filepath}")
    print(f"  📊 Total games: {len(normalized_games)}")
    
    return str(filepath)


def update_checkpoint(artifacts: List[str], seasons: List[str]):
    """
    Update phase3_checkpoints.json with new artifacts
    """
    checkpoint_path = Path(__file__).parent.parent.parent / 'data' / 'nba' / 'phase3_checkpoints.json'
    
    try:
        # Read existing checkpoints
        if checkpoint_path.exists():
            with open(checkpoint_path, 'r') as f:
                checkpoint_data = json.load(f)
        else:
            checkpoint_data = {'checkpoints': []}
        
        # Add new checkpoint
        new_checkpoint = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'step': 'fetch_multiseason_boxscores',
            'artifacts': artifacts,
            'notes': f"Fetched {len(seasons)} seasons: {', '.join(seasons)}"
        }
        
        checkpoint_data['checkpoints'].append(new_checkpoint)
        
        # Atomic write
        tmp_path = checkpoint_path.parent / '.phase3_checkpoints.json.tmp'
        with open(tmp_path, 'w') as f:
            json.dump(checkpoint_data, f, indent=2)
        
        tmp_path.rename(checkpoint_path)
        
        print(f"\n✅ Updated checkpoint: {checkpoint_path}")
        
    except Exception as e:
        print(f"\n⚠️  Failed to update checkpoint: {e}")


def main():
    parser = argparse.ArgumentParser(description='Fetch multi-season NBA boxscores')
    parser.add_argument(
        '--seasons',
        nargs='+',
        default=['2022-23', '2023-24', '2024-25'],
        help='Seasons to fetch (e.g., 2022-23 2023-24)'
    )
    parser.add_argument(
        '--output-dir',
        type=str,
        default='data/nba/raw',
        help='Output directory for raw JSON files'
    )
    
    args = parser.parse_args()
    
    # Resolve output directory
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent.parent
    output_dir = repo_root / args.output_dir
    
    print(f"[fetch-multiseason-boxscores] NBA Multi-Season Boxscores Fetcher")
    print(f"[fetch-multiseason-boxscores] Output directory: {output_dir}")
    print(f"[fetch-multiseason-boxscores] Seasons: {args.seasons}")
    
    artifacts = []
    
    for season in args.seasons:
        if season not in SEASON_MAP:
            print(f"\n⚠️  Unknown season: {season}")
            print(f"    Valid seasons: {list(SEASON_MAP.keys())}")
            continue
        
        print(f"\n{'='*60}")
        print(f"Processing season: {season}")
        print(f"{'='*60}")
        
        # Fetch data
        games = fetch_season_boxscores(season)
        
        if not games:
            print(f"  ⚠️  No games fetched for {season}")
            continue
        
        # Save to disk
        filepath = save_season_data(season, games, output_dir)
        artifacts.append(filepath)
        
        # Rate limiting: wait between API calls
        if season != args.seasons[-1]:  # Don't wait after last season
            print(f"\n  ⏳ Waiting 2 seconds before next season...")
            time.sleep(2)
    
    print(f"\n{'='*60}")
    print(f"✅ COMPLETE: Fetched {len(artifacts)} seasons")
    print(f"{'='*60}")
    
    for artifact in artifacts:
        print(f"  📁 {artifact}")
    
    # Update checkpoint
    if artifacts:
        update_checkpoint(artifacts, args.seasons)
    
    print(f"\n🎯 Next step: Run normalize-boxscores.mjs to combine seasons")


if __name__ == '__main__':
    main()
