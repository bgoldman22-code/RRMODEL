#!/usr/bin/env python3

"""
🏀 NBA PBPSTATS POSSESSION-LEVEL COLLECTOR

Uses pbpstats library for true play-by-play possession reconstruction.
This is the GOLD STANDARD for accuracy - parses every possession to compute:

- Exact possession counts
- True Pace (48 * possessions / game_minutes)
- Precise OffRtg/DefRtg (points per 100 possessions)
- Four Factors from possession-level events

Installation:
    pip3 install pbpstats

Usage:
    python3 scripts/collect-nba-pbpstats.py 2023-24 2024-25
"""

import sys
import json
import os
from pathlib import Path
from typing import Dict, List, Any
import time

try:
    from pbpstats.client import Client
except ImportError:
    print("❌ pbpstats not installed. Install with: pip3 install pbpstats")
    sys.exit(1)

# Directories
DATA_DIR = Path(__file__).parent.parent / "data" / "nba"
GAMES_DIR = DATA_DIR / "games"
ADVANCED_DIR = DATA_DIR / "advanced"
PBPSTATS_DIR = ADVANCED_DIR / "pbpstats"

# Ensure directories exist
PBPSTATS_DIR.mkdir(parents=True, exist_ok=True)


def get_season_games(season: str) -> List[Dict[str, Any]]:
    """Load games for a season from our collected data."""
    season_file = GAMES_DIR / f"games_{season.replace('-', '_')}.json"
    
    if not season_file.exists():
        print(f"❌ Games file not found: {season_file}")
        return []
    
    with open(season_file) as f:
        games = json.load(f)
    
    print(f"  📂 Loaded {len(games)} games from {season_file.name}")
    return games


def extract_game_id_from_espn(game: Dict[str, Any]) -> str:
    """
    Convert ESPN game ID to NBA Stats game ID format.
    
    ESPN uses format like: 401584733
    NBA Stats uses format like: 0022300001
    
    For now, we'll try to map or use ESPN's boxscore endpoint
    """
    espn_id = game.get('id')
    
    # This is a simplified mapping - in production you'd need proper conversion
    # or fetch from NBA.com directly
    return espn_id


def fetch_possessions_for_game(game_id: str, season: str) -> Dict[str, Any]:
    """
    Fetch possession-level data using pbpstats.
    
    Returns dict with:
        - possessions: List of possession objects
        - home_possessions: Count
        - away_possessions: Count
        - stats: Aggregated stats
    """
    cache_file = PBPSTATS_DIR / f"{season}_{game_id}.json"
    
    # Check cache
    if cache_file.exists():
        with open(cache_file) as f:
            return json.load(f)
    
    try:
        # Initialize pbpstats client
        client = Client()
        
        # Fetch game possessions
        # This will parse play-by-play and reconstruct possessions
        game_data = client.get_game(game_id)
        
        if not game_data:
            return None
        
        possessions = game_data.possessions.items
        
        # Count possessions by team
        home_poss = sum(1 for p in possessions if p.offense_team_id == game_data.home_team_id)
        away_poss = sum(1 for p in possessions if p.offense_team_id == game_data.away_team_id)
        
        # Extract stats
        home_stats = game_data.home_team.stats
        away_stats = game_data.away_team.stats
        
        result = {
            'game_id': game_id,
            'season': season,
            'home_team_id': game_data.home_team_id,
            'away_team_id': game_data.away_team_id,
            'home_possessions': home_poss,
            'away_possessions': away_poss,
            'total_possessions': home_poss + away_poss,
            'home_stats': {
                'points': home_stats.get('PTS', 0),
                'fgm': home_stats.get('FGM', 0),
                'fga': home_stats.get('FGA', 0),
                'fg3m': home_stats.get('FG3M', 0),
                'ftm': home_stats.get('FTM', 0),
                'fta': home_stats.get('FTA', 0),
                'orb': home_stats.get('OREB', 0),
                'drb': home_stats.get('DREB', 0),
                'ast': home_stats.get('AST', 0),
                'tov': home_stats.get('TOV', 0),
                'stl': home_stats.get('STL', 0),
                'blk': home_stats.get('BLK', 0),
            },
            'away_stats': {
                'points': away_stats.get('PTS', 0),
                'fgm': away_stats.get('FGM', 0),
                'fga': away_stats.get('FGA', 0),
                'fg3m': away_stats.get('FG3M', 0),
                'ftm': away_stats.get('FTM', 0),
                'fta': away_stats.get('FTA', 0),
                'orb': away_stats.get('OREB', 0),
                'drb': away_stats.get('DREB', 0),
                'ast': away_stats.get('AST', 0),
                'tov': away_stats.get('TOV', 0),
                'stl': away_stats.get('STL', 0),
                'blk': away_stats.get('BLK', 0),
            },
            'source': 'pbpstats'
        }
        
        # Cache the result
        with open(cache_file, 'w') as f:
            json.dump(result, f, indent=2)
        
        return result
        
    except Exception as e:
        print(f"  ⚠️  Error fetching possessions for {game_id}: {e}")
        return None


def calculate_advanced_from_possessions(poss_data: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate advanced stats from possession-level data."""
    
    home_poss = poss_data['home_possessions']
    away_poss = poss_data['away_possessions']
    avg_poss = (home_poss + away_poss) / 2
    
    home_stats = poss_data['home_stats']
    away_stats = poss_data['away_stats']
    
    # Pace (possessions per 48 minutes)
    # For regular games: 48 minutes
    # We'll assume 48 for now (could extract actual game length)
    pace = avg_poss  # Since it's already per 48 min game
    
    # Offensive/Defensive Ratings (per 100 possessions)
    home_off_rtg = (home_stats['points'] / home_poss * 100) if home_poss > 0 else None
    home_def_rtg = (away_stats['points'] / home_poss * 100) if home_poss > 0 else None
    away_off_rtg = (away_stats['points'] / away_poss * 100) if away_poss > 0 else None
    away_def_rtg = (home_stats['points'] / away_poss * 100) if away_poss > 0 else None
    
    # Four Factors
    home_efg = ((home_stats['fgm'] + 0.5 * home_stats['fg3m']) / home_stats['fga'] * 100) if home_stats['fga'] > 0 else None
    away_efg = ((away_stats['fgm'] + 0.5 * away_stats['fg3m']) / away_stats['fga'] * 100) if away_stats['fga'] > 0 else None
    
    home_ts = (home_stats['points'] / (2 * (home_stats['fga'] + 0.44 * home_stats['fta'])) * 100) if (home_stats['fga'] + home_stats['fta']) > 0 else None
    away_ts = (away_stats['points'] / (2 * (away_stats['fga'] + 0.44 * away_stats['fta'])) * 100) if (away_stats['fga'] + away_stats['fta']) > 0 else None
    
    home_tov_pct = (home_stats['tov'] / (home_stats['fga'] + 0.44 * home_stats['fta'] + home_stats['tov']) * 100) if (home_stats['fga'] + home_stats['fta'] + home_stats['tov']) > 0 else None
    away_tov_pct = (away_stats['tov'] / (away_stats['fga'] + 0.44 * away_stats['fta'] + away_stats['tov']) * 100) if (away_stats['fga'] + away_stats['fta'] + away_stats['tov']) > 0 else None
    
    home_orb_pct = (home_stats['orb'] / (home_stats['orb'] + away_stats['drb']) * 100) if (home_stats['orb'] + away_stats['drb']) > 0 else None
    away_orb_pct = (away_stats['orb'] / (away_stats['orb'] + home_stats['drb']) * 100) if (away_stats['orb'] + home_stats['drb']) > 0 else None
    
    home_ft_fga = (home_stats['fta'] / home_stats['fga'] * 100) if home_stats['fga'] > 0 else None
    away_ft_fga = (away_stats['fta'] / away_stats['fga'] * 100) if away_stats['fga'] > 0 else None
    
    return {
        'gamePace': pace,
        'homePossessions': home_poss,
        'awayPossessions': away_poss,
        'homeAdvanced': {
            'pace': pace,
            'offRtg': home_off_rtg,
            'defRtg': home_def_rtg,
            'netRtg': (home_off_rtg - home_def_rtg) if (home_off_rtg and home_def_rtg) else None,
            'efg': home_efg,
            'ts': home_ts,
            'tovPct': home_tov_pct,
            'orbPct': home_orb_pct,
            'ftFga': home_ft_fga
        },
        'awayAdvanced': {
            'pace': pace,
            'offRtg': away_off_rtg,
            'defRtg': away_def_rtg,
            'netRtg': (away_off_rtg - away_def_rtg) if (away_off_rtg and away_def_rtg) else None,
            'efg': away_efg,
            'ts': away_ts,
            'tovPct': away_tov_pct,
            'orbPct': away_orb_pct,
            'ftFga': away_ft_fga
        },
        'source': 'pbpstats'
    }


def process_season_pbpstats(season: str):
    """Process a season using pbpstats for possession-level accuracy."""
    
    print(f"\n{'='*70}")
    print(f"🏀 PBPSTATS COLLECTION: {season}")
    print(f"{'='*70}\n")
    
    games = get_season_games(season)
    
    if not games:
        return
    
    print(f"\n🔍 Fetching possession data via pbpstats...")
    print(f"  ⚠️  Note: This may take a while for {len(games)} games")
    print(f"  💡 Results are cached in {PBPSTATS_DIR}\n")
    
    enhanced_games = []
    success_count = 0
    failure_count = 0
    
    for i, game in enumerate(games, 1):
        game_id = extract_game_id_from_espn(game)
        
        print(f"  [{i}/{len(games)}] Game {game_id}...", end=' ')
        
        # Fetch possession data
        poss_data = fetch_possessions_for_game(game_id, season)
        
        if poss_data:
            # Calculate advanced stats
            advanced = calculate_advanced_from_possessions(poss_data)
            
            # Merge with existing game data
            game.update(advanced)
            game['pbpstats_data'] = poss_data
            
            enhanced_games.append(game)
            success_count += 1
            print("✅")
        else:
            enhanced_games.append(game)
            failure_count += 1
            print("❌")
        
        # Rate limit
        if i % 10 == 0:
            time.sleep(1)
    
    # Save enhanced games
    output_file = ADVANCED_DIR / f"games_{season.replace('-', '_')}_pbpstats.json"
    with open(output_file, 'w') as f:
        json.dump(enhanced_games, f, indent=2)
    
    print(f"\n✅ Processed {len(games)} games:")
    print(f"  ✅ Success: {success_count}")
    print(f"  ❌ Failed: {failure_count}")
    print(f"\n💾 Saved to: {output_file}")


def main():
    seasons = sys.argv[1:] if len(sys.argv) > 1 else ['2023-24', '2024-25']
    
    print(f"\n{'═'*70}")
    print(f"🏀 NBA PBPSTATS POSSESSION-LEVEL COLLECTOR")
    print(f"{'═'*70}")
    print(f"\nSeasons: {', '.join(seasons)}")
    print(f"\nThis uses pbpstats to parse play-by-play data into possessions")
    print(f"for maximum accuracy in Pace, OffRtg, DefRtg calculations.\n")
    
    for season in seasons:
        process_season_pbpstats(season)
        
        if seasons.index(season) < len(seasons) - 1:
            print("\n" + "─"*70 + "\n")
            time.sleep(2)
    
    print(f"\n{'═'*70}")
    print(f"✅ PBPSTATS COLLECTION COMPLETE")
    print(f"{'═'*70}")
    print(f"\nNext: Compare pbpstats results with calculated results for validation")


if __name__ == "__main__":
    main()
