#!/usr/bin/env python3
"""
NBA Current Season Roster Scraper

Gets current rosters for 2025-26 season (even without game stats yet)
Uses roster endpoint instead of stats endpoint

Usage:
    python3 scripts/nba/local/scrape-current-rosters.py
"""

import json
import time
from pathlib import Path
from nba_api.stats.endpoints import commonteamroster
from nba_api.stats.static import teams

# Current season
CURRENT_SEASON = '2025-26'

# Previous season stats for comparison
PREVIOUS_SEASON = '2024-25'

def get_all_team_rosters(season):
    """Get rosters for all NBA teams"""
    print(f"\n🏀 Fetching {season} rosters for ALL 30 teams...")
    
    all_teams = teams.get_teams()
    team_rosters = {}
    
    for i, team in enumerate(all_teams):
        team_id = team['id']
        team_abbr = team['abbreviation']
        team_name = team['full_name']
        
        try:
            print(f"  [{i+1}/30] {team_abbr}...", end='', flush=True)
            
            roster = commonteamroster.CommonTeamRoster(
                team_id=team_id,
                season=season
            )
            df = roster.get_data_frames()[0]
            
            players = []
            for _, row in df.iterrows():
                players.append({
                    'player': row['PLAYER'],
                    'position': row['POSITION'],
                    'number': str(row['NUM']) if row['NUM'] else None,
                    'height': row['HEIGHT'],
                    'weight': row['WEIGHT'],
                    'birth_date': row['BIRTH_DATE'],
                    'age': int(row['AGE']) if row['AGE'] else None,
                    'exp': row['EXP'],
                    'school': row['SCHOOL']
                })
            
            team_rosters[team_abbr] = {
                'team': team_name,
                'abbreviation': team_abbr,
                'team_id': team_id,
                'roster': players,
                'roster_count': len(players)
            }
            
            print(f" ✅ {len(players)} players")
            
            # Rate limiting
            if i < len(all_teams) - 1:
                time.sleep(0.6)  # 600ms between requests
                
        except Exception as e:
            print(f" ❌ Error: {e}")
            team_rosters[team_abbr] = {
                'team': team_name,
                'abbreviation': team_abbr,
                'team_id': team_id,
                'roster': [],
                'roster_count': 0,
                'error': str(e)
            }
    
    return team_rosters

def main():
    print("🏀 NBA Current Season Roster Scraper")
    print("=" * 60)
    print(f"Current Season: {CURRENT_SEASON}")
    print("=" * 60)
    
    # Get current season rosters
    current_rosters = get_all_team_rosters(CURRENT_SEASON)
    
    # Create output directory
    output_dir = Path(__file__).parent.parent.parent.parent / 'data' / 'nba' / 'rosters'
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Save current rosters
    output_file = output_dir / f'rosters_{CURRENT_SEASON.replace("-", "_")}.json'
    output_data = {
        'schema_version': 1,
        'scraped_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'season': CURRENT_SEASON,
        'source': 'nba-stats-api-commonteamroster',
        'team_count': len(current_rosters),
        'teams': current_rosters
    }
    
    with open(output_file, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print("\n" + "=" * 60)
    print("✅ ROSTER SCRAPING COMPLETE")
    print("=" * 60)
    print(f"📁 Saved: {output_file}")
    print(f"📊 Total teams: {len(current_rosters)}")
    
    total_players = sum(team['roster_count'] for team in current_rosters.values())
    print(f"👥 Total players: {total_players}")
    print(f"🏀 Average roster size: {total_players / len(current_rosters):.1f}")
    
    print("\n💡 Now you can calculate RCI with current rosters!")
    print("   Note: RCI will be based on roster presence (not stats yet)")

if __name__ == '__main__':
    main()
