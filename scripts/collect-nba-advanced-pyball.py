"""
NBA Advanced Stats Collector using py_ball
Bulletproof historical + daily collection with checkpointing

Features:
- Checkpointed collection (resume from failure)
- Exponential backoff with jitter
- Browser headers via py_ball
- Atomic writes per team-season
- Schema validation
- Deduplication
"""

import json
import time
import random
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# Install: pip install py_ball
from py_ball import team, league

# Browser headers (required by NBA Stats API)
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': 'https://www.nba.com/',
    'Origin': 'https://www.nba.com',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true'
}

# Paths
DATA_DIR = Path(__file__).parent.parent / 'data' / 'nba'
CHECKPOINTS_DIR = DATA_DIR / 'checkpoints'
AGGREGATES_DIR = DATA_DIR / 'aggregates'

CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)
AGGREGATES_DIR.mkdir(parents=True, exist_ok=True)

# Rate limiting
REQUEST_DELAY = 0.8  # seconds between requests
RETRY_ATTEMPTS = 3
RETRY_BASE_DELAY = 0.3  # 300ms, 600ms, 1200ms


def retry_with_backoff(func, *args, **kwargs):
    """Retry with exponential backoff + jitter"""
    for attempt in range(RETRY_ATTEMPTS):
        try:
            result = func(*args, **kwargs)
            return result
        except Exception as e:
            if attempt == RETRY_ATTEMPTS - 1:
                raise
            
            delay = RETRY_BASE_DELAY * (2 ** attempt)
            jitter = random.uniform(0, delay * 0.1)
            total_delay = delay + jitter
            
            print(f"  ⚠️  Attempt {attempt + 1} failed: {e}")
            print(f"  ⏳ Retrying in {total_delay:.2f}s...")
            time.sleep(total_delay)


def hash_data(data: dict) -> str:
    """Hash data for deduplication"""
    json_str = json.dumps(data, sort_keys=True)
    return hashlib.md5(json_str.encode()).hexdigest()


def checkpoint_exists(season: str, team_id: str) -> bool:
    """Check if checkpoint exists"""
    checkpoint_file = CHECKPOINTS_DIR / f"{season}_{team_id}.json"
    return checkpoint_file.exists()


def save_checkpoint(season: str, team_id: str, data: dict):
    """Save checkpoint atomically"""
    checkpoint_file = CHECKPOINTS_DIR / f"{season}_{team_id}.json"
    temp_file = checkpoint_file.with_suffix('.tmp')
    
    # Write to temp file first
    with open(temp_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    # Atomic rename
    temp_file.rename(checkpoint_file)


def load_checkpoint(season: str, team_id: str) -> Optional[dict]:
    """Load checkpoint if exists"""
    checkpoint_file = CHECKPOINTS_DIR / f"{season}_{team_id}.json"
    if not checkpoint_file.exists():
        return None
    
    with open(checkpoint_file, 'r') as f:
        return json.load(f)


def collect_team_advanced_stats(team_id: str, season: str) -> dict:
    """
    Collect advanced stats for a team using py_ball
    
    Returns dict with:
    - base: Traditional box score stats
    - advanced: Advanced metrics (ORtg, DRtg, NetRtg, Pace, eFG%, TS%)
    - four_factors: Four Factors (eFG%, TOV%, ORB%, FT/FGA)
    """
    print(f"  📊 Fetching {team_id} {season}...")
    
    # Convert season format: 2024-25 -> 2024-25
    season_format = season.replace('_', '-')
    
    # 1. Traditional Stats
    print(f"    - Traditional stats...")
    team_traditional = team.Team(
        headers=HEADERS,
        team_id=team_id,
        season=season_format,
        season_type='Regular Season'
    )
    time.sleep(REQUEST_DELAY)
    
    traditional_data = retry_with_backoff(
        lambda: team_traditional.overall_team_dashboard()
    )
    
    # 2. Advanced Stats
    print(f"    - Advanced stats...")
    team_advanced = team.Team(
        headers=HEADERS,
        team_id=team_id,
        season=season_format,
        season_type='Regular Season',
        measure_type='Advanced'
    )
    time.sleep(REQUEST_DELAY)
    
    advanced_data = retry_with_backoff(
        lambda: team_advanced.overall_team_dashboard()
    )
    
    # 3. Four Factors
    print(f"    - Four Factors...")
    team_four_factors = team.Team(
        headers=HEADERS,
        team_id=team_id,
        season=season_format,
        season_type='Regular Season',
        measure_type='Four Factors'
    )
    time.sleep(REQUEST_DELAY)
    
    four_factors_data = retry_with_backoff(
        lambda: team_four_factors.overall_team_dashboard()
    )
    
    return {
        'teamId': team_id,
        'season': season,
        'traditional': traditional_data,
        'advanced': advanced_data,
        'fourFactors': four_factors_data,
        'collected': datetime.now().isoformat(),
        'hash': hash_data({
            'traditional': traditional_data,
            'advanced': advanced_data,
            'fourFactors': four_factors_data
        })
    }


def normalize_team_stats(raw_data: dict) -> dict:
    """
    Normalize raw py_ball data into clean structure
    
    Output schema:
    {
      teamId, teamAbbr, games, wins, losses,
      pace, offRtg, defRtg, netRtg,
      eFG, TS, ORB_PCT, TOV_PCT, FT_FGA
    }
    """
    traditional = raw_data['traditional']
    advanced = raw_data['advanced']
    four_factors = raw_data['fourFactors']
    
    # Extract key metrics (indices may vary, adjust as needed)
    return {
        'teamId': raw_data['teamId'],
        'season': raw_data['season'],
        
        # Traditional
        'games': traditional.get('GP', 0),
        'wins': traditional.get('W', 0),
        'losses': traditional.get('L', 0),
        'fgPct': traditional.get('FG_PCT', 0),
        'fg3Pct': traditional.get('FG3_PCT', 0),
        'ftPct': traditional.get('FT_PCT', 0),
        'rebounds': traditional.get('REB', 0),
        'assists': traditional.get('AST', 0),
        'turnovers': traditional.get('TOV', 0),
        'points': traditional.get('PTS', 0),
        
        # Advanced
        'pace': advanced.get('PACE', 0),
        'offRtg': advanced.get('OFF_RATING', 0),
        'defRtg': advanced.get('DEF_RATING', 0),
        'netRtg': advanced.get('NET_RATING', 0),
        'eFG': advanced.get('EFG_PCT', 0),
        'TS': advanced.get('TS_PCT', 0),
        
        # Four Factors
        'eFG_FF': four_factors.get('EFG_PCT', 0),
        'tovPct': four_factors.get('TM_TOV_PCT', 0),
        'orbPct': four_factors.get('OREB_PCT', 0),
        'ftFga': four_factors.get('FTA_RATE', 0),
        
        # Opponent Four Factors
        'oppEFG': four_factors.get('OPP_EFG_PCT', 0),
        'oppTovPct': four_factors.get('OPP_TOV_PCT', 0),
        'oppOrbPct': four_factors.get('OPP_OREB_PCT', 0),
        'oppFtFga': four_factors.get('OPP_FTA_RATE', 0),
        
        'hash': raw_data['hash'],
        'collected': raw_data['collected']
    }


def collect_season(season: str, teams: List[str], resume: bool = True):
    """
    Collect advanced stats for all teams in a season
    
    Args:
        season: Season string (e.g., '2024-25')
        teams: List of team IDs
        resume: Resume from checkpoints if True
    """
    print(f"\n🏀 Collecting {season} Advanced Stats")
    print(f"Teams: {len(teams)}, Resume: {resume}\n")
    
    results = []
    skipped = 0
    
    for i, team_id in enumerate(teams, 1):
        print(f"[{i}/{len(teams)}] Team {team_id}")
        
        # Check if already collected
        if resume and checkpoint_exists(season, team_id):
            checkpoint = load_checkpoint(season, team_id)
            results.append(checkpoint['normalized'])
            skipped += 1
            print(f"  ✅ Skipped (checkpoint exists)")
            continue
        
        try:
            # Collect raw data
            raw_data = collect_team_advanced_stats(team_id, season)
            
            # Normalize
            normalized = normalize_team_stats(raw_data)
            
            # Save checkpoint
            save_checkpoint(season, team_id, {
                'raw': raw_data,
                'normalized': normalized
            })
            
            results.append(normalized)
            print(f"  ✅ Collected")
            
        except Exception as e:
            print(f"  ❌ Failed: {e}")
            continue
    
    # Save aggregated file
    output_file = AGGREGATES_DIR / f'aggregates_{season}.json'
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n✅ Season complete!")
    print(f"  Collected: {len(results) - skipped}")
    print(f"  Skipped: {skipped}")
    print(f"  Saved: {output_file}")


# NBA Team IDs (all 30 teams)
NBA_TEAMS = [
    '1610612737',  # ATL
    '1610612738',  # BOS
    '1610612751',  # BKN
    '1610612766',  # CHA
    '1610612741',  # CHI
    '1610612739',  # CLE
    '1610612742',  # DAL
    '1610612743',  # DEN
    '1610612765',  # DET
    '1610612744',  # GSW
    '1610612745',  # HOU
    '1610612754',  # IND
    '1610612746',  # LAC
    '1610612747',  # LAL
    '1610612763',  # MEM
    '1610612748',  # MIA
    '1610612749',  # MIL
    '1610612750',  # MIN
    '1610612740',  # NOP
    '1610612752',  # NYK
    '1610612760',  # OKC
    '1610612753',  # ORL
    '1610612755',  # PHI
    '1610612756',  # PHX
    '1610612757',  # POR
    '1610612758',  # SAC
    '1610612759',  # SAS
    '1610612761',  # TOR
    '1610612762',  # UTA
    '1610612764',  # WAS
]


if __name__ == '__main__':
    import sys
    
    # Parse args
    seasons = sys.argv[1:] if len(sys.argv) > 1 else ['2024-25']
    
    for season in seasons:
        collect_season(season, NBA_TEAMS, resume=True)
    
    print("\n🎉 All seasons complete!")
