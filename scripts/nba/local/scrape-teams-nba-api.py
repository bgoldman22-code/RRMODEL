#!/usr/bin/env python3
"""
NBA Team Historical Data Scraper (nba_api)

Uses the nba_api library for reliable NBA Stats API access
Scrapes 5 seasons (2020-21 through 2024-25) for ALL 30 teams

Usage:
    python3 scripts/nba/local/scrape-teams-nba-api.py

Runtime: ~2-3 minutes
"""

import json
import time
from pathlib import Path
from nba_api.stats.endpoints import leaguedashteamstats
from nba_api.stats.library.parameters import SeasonTypeAllStar

# Seasons to scrape (last 5 seasons + current)
SEASONS = [
    {'label': '2021-22', 'api': '2021-22'},
    {'label': '2022-23', 'api': '2022-23'},
    {'label': '2023-24', 'api': '2023-24'},
    {'label': '2024-25', 'api': '2024-25'},
    {'label': '2025-26', 'api': '2025-26'}
]

# Rate limiting
DELAY_BETWEEN_SEASONS = 2.0  # seconds

def scrape_season_teams(season):
    """Scrape team stats for a single season"""
    print(f"\n🏀 Scraping {season['label']}...")
    
    try:
        # Fetch advanced team stats
        print(f"  📥 Fetching advanced team stats...")
        team_stats = leaguedashteamstats.LeagueDashTeamStats(
            season=season['api'],
            season_type_all_star=SeasonTypeAllStar.regular,
            per_mode_detailed='PerGame',
            measure_type_detailed_defense='Advanced'
        )
        df = team_stats.get_data_frames()[0]
        
        # Convert to our schema
        teams = []
        for _, row in df.iterrows():
            team = {
                'team': str(row['TEAM_NAME']),
                'season': season['label'],
                
                # Record
                'wins': int(row['W']) if row['W'] else 0,
                'losses': int(row['L']) if row['L'] else 0,
                'win_pct': float(row['W_PCT']) if row['W_PCT'] else 0.0,
                
                # Team ratings
                'off_rtg': float(row['OFF_RATING']) if row.get('OFF_RATING') else None,
                'def_rtg': float(row['DEF_RATING']) if row.get('DEF_RATING') else None,
                'net_rtg': float(row['NET_RATING']) if row.get('NET_RATING') else None,
                'pace': float(row['PACE']) if row.get('PACE') else None,
                
                # Four Factors - Offense
                'efg_pct': float(row['EFG_PCT']) if row.get('EFG_PCT') else None,
                'tov_pct': float(row['TM_TOV_PCT']) if row.get('TM_TOV_PCT') else None,
                'orb_pct': float(row['OREB_PCT']) if row.get('OREB_PCT') else None,
                'ft_rate': float(row.get('FTA_RATE', 0)) if row.get('FTA_RATE') else None,
                
                # Four Factors - Defense
                'opp_efg_pct': float(row['OPP_EFG_PCT']) if row.get('OPP_EFG_PCT') else None,
                'opp_tov_pct': float(row['OPP_TOV_PCT']) if row.get('OPP_TOV_PCT') else None,
                'drb_pct': float(row['DREB_PCT']) if row.get('DREB_PCT') else None,
                'opp_ft_rate': float(row.get('OPP_FTA_RATE', 0)) if row.get('OPP_FTA_RATE') else None,
                
                # Additional metrics
                'ast_pct': float(row['AST_PCT']) if row.get('AST_PCT') else None,
                'ast_ratio': float(row['AST_RATIO']) if row.get('AST_RATIO') else None,
                'pie': float(row.get('PIE', 0)) if row.get('PIE') else None
            }
            teams.append(team)
        
        print(f"  ✅ Scraped {len(teams)} teams")
        
        return teams
        
    except Exception as e:
        print(f"  ❌ Failed to scrape {season['label']}: {e}")
        return []

def main():
    """Main scraper function"""
    print("🏀 NBA Team Historical Data Scraper (nba_api)")
    print("=" * 60)
    print(f"Seasons: {', '.join([s['label'] for s in SEASONS])}")
    print("=" * 60)
    
    all_teams = []
    
    # Create output directory
    output_dir = Path(__file__).parent.parent.parent.parent / 'data' / 'nba' / 'aggregates' / 'archive'
    output_dir.mkdir(parents=True, exist_ok=True)
    
    for i, season in enumerate(SEASONS):
        teams = scrape_season_teams(season)
        all_teams.extend(teams)
        
        # Save individual season file
        season_file = output_dir / f"team_seasons_{season['label'].replace('-', '_')}.json"
        season_data = {
            'schema_version': 1,
            'scraped_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'season': season['label'],
            'source': 'nba-stats-api-via-nba_api-library',
            'team_count': len(teams),
            'teams': teams
        }
        
        with open(season_file, 'w') as f:
            json.dump(season_data, f, indent=2)
        
        print(f"  💾 Saved: {season_file}\n")
        
        # Delay before next season
        if i < len(SEASONS) - 1:
            print(f"  ⏱️  Waiting {DELAY_BETWEEN_SEASONS}s...\n")
            time.sleep(DELAY_BETWEEN_SEASONS)
    
    # Save combined archive
    combined_file = output_dir / 'team_seasons_combined.json'
    combined_data = {
        'schema_version': 1,
        'scraped_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'seasons': [s['label'] for s in SEASONS],
        'source': 'nba-stats-api-via-nba_api-library',
        'total_team_seasons': len(all_teams),
        'teams': all_teams
    }
    
    with open(combined_file, 'w') as f:
        json.dump(combined_data, f, indent=2)
    
    print("\n" + "=" * 60)
    print("✅ SCRAPING COMPLETE")
    print("=" * 60)
    print(f"📁 Combined file: {combined_file}")
    print(f"📊 Total team-seasons: {len(all_teams)}")
    print(f"🏀 Average per season: {len(all_teams) // len(SEASONS)}")
    print("\n💡 Next steps:")
    print("  1. Calculate RCI: node scripts/nba/local/build-rosters-with-rci.js")
    print("  2. Validate: node scripts/nba/local/validate-data.js")

if __name__ == '__main__':
    main()
