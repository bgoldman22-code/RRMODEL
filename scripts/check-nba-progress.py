#!/usr/bin/env python3
"""
Quick status checker for NBA advanced stats collection
"""

import json
from pathlib import Path

# Paths
DATA_DIR = Path(__file__).parent.parent / 'data' / 'nba'
CHECKPOINTS_DIR = DATA_DIR / 'checkpoints'
AGGREGATES_DIR = DATA_DIR / 'aggregates'

def check_progress(season):
    """Check collection progress for a season"""
    
    checkpoint_files = list(CHECKPOINTS_DIR.glob(f"{season}_*.json"))
    total_teams = 30
    collected_teams = len(checkpoint_files)
    
    print(f"\n📊 {season} Collection Progress")
    print(f"="*50)
    print(f"Collected: {collected_teams}/{total_teams} teams ({collected_teams/total_teams*100:.1f}%)")
    print(f"Remaining: {total_teams - collected_teams} teams")
    
    if collected_teams > 0:
        print(f"\nCheckpoint files:")
        for f in sorted(checkpoint_files)[:5]:
            print(f"  ✅ {f.name}")
        if len(checkpoint_files) > 5:
            print(f"  ... and {len(checkpoint_files) - 5} more")
    
    # Check if aggregate file exists
    aggregate_file = AGGREGATES_DIR / f'aggregates_{season}.json'
    if aggregate_file.exists():
        with open(aggregate_file, 'r') as f:
            data = json.load(f)
        print(f"\n✅ Aggregate file complete: {len(data)} teams")
    else:
        print(f"\n⏳ Aggregate file not yet created")
    
    print()

if __name__ == '__main__':
    import sys
    seasons = sys.argv[1:] if len(sys.argv) > 1 else ['2023-24', '2024-25']
    
    for season in seasons:
        check_progress(season)
