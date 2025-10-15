#!/usr/bin/env python3
"""
NBA Player Historical Data Scraper (nba_api)

Uses the nba_api library for reliable NBA Stats API access
Scrapes 5 seasons (2020-21 through 2024-25) for ALL 30 teams

Usage:
    python3 scripts/nba/local/scrape-players-nba-api.py

Runtime: ~5-10 minutes
"""

import json
import time
from pathlib import Path
from nba_api.stats.endpoints import leaguedashplayerstats
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
DELAY_BETWEEN_REQUESTS = 1.5  # seconds
DELAY_BETWEEN_SEASONS = 3.0   # seconds

def scrape_season_players(season):
    """Scrape player stats for a single season"""
    print(f"\n🏀 Scraping {season['label']}...")
    
    try:
        # Fetch traditional stats
        print(f"  📥 Fetching traditional stats...")
        trad_stats = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season['api'],
            season_type_all_star=SeasonTypeAllStar.regular,
            per_mode_detailed='Totals',
            measure_type_detailed_defense='Base'
        )
        trad_df = trad_stats.get_data_frames()[0]
        
        time.sleep(DELAY_BETWEEN_REQUESTS)
        
        # Fetch advanced stats
        print(f"  📥 Fetching advanced stats...")
        adv_stats = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season['api'],
            season_type_all_star=SeasonTypeAllStar.regular,
            per_mode_detailed='Totals',
            measure_type_detailed_defense='Advanced'
        )
        adv_df = adv_stats.get_data_frames()[0]
        
        # Merge dataframes on PLAYER_ID
        merged_df = trad_df.merge(
            adv_df,
            on='PLAYER_ID',
            suffixes=('', '_adv')
        )
        
        # Convert to our schema
        players = []
        for _, row in merged_df.iterrows():
            player = {
                'player': row['PLAYER_NAME'],
                'team': row['TEAM_ABBREVIATION'],
                'season': season['label'],
                
                # Games
                'games_played': int(row['GP']) if row['GP'] else 0,
                'games_started': int(row.get('GS', 0)) if row.get('GS') else 0,
                'minutes_played': float(row['MIN']) if row['MIN'] else 0.0,
                
                # Shooting
                'fgm': float(row['FGM']) if row['FGM'] else 0.0,
                'fga': float(row['FGA']) if row['FGA'] else 0.0,
                'fg_pct': float(row['FG_PCT']) if row['FG_PCT'] else 0.0,
                'fg3m': float(row['FG3M']) if row['FG3M'] else 0.0,
                'fg3a': float(row['FG3A']) if row['FG3A'] else 0.0,
                'fg3_pct': float(row['FG3_PCT']) if row['FG3_PCT'] else 0.0,
                'ftm': float(row['FTM']) if row['FTM'] else 0.0,
                'fta': float(row['FTA']) if row['FTA'] else 0.0,
                'ft_pct': float(row['FT_PCT']) if row['FT_PCT'] else 0.0,
                
                # Rebounds
                'oreb': float(row['OREB']) if row['OREB'] else 0.0,
                'dreb': float(row['DREB']) if row['DREB'] else 0.0,
                'reb': float(row['REB']) if row['REB'] else 0.0,
                
                # Other stats
                'ast': float(row['AST']) if row['AST'] else 0.0,
                'stl': float(row['STL']) if row['STL'] else 0.0,
                'blk': float(row['BLK']) if row['BLK'] else 0.0,
                'tov': float(row['TOV']) if row['TOV'] else 0.0,
                'pf': float(row['PF']) if row['PF'] else 0.0,
                'pts': float(row['PTS']) if row['PTS'] else 0.0,
                'plus_minus': float(row['PLUS_MINUS']) if row['PLUS_MINUS'] else 0.0,
                
                # Advanced metrics
                'off_rating': float(row['OFF_RATING']) if row.get('OFF_RATING') else None,
                'def_rating': float(row['DEF_RATING']) if row.get('DEF_RATING') else None,
                'net_rating': float(row['NET_RATING']) if row.get('NET_RATING') else None,
                'ast_pct': float(row['AST_PCT']) if row.get('AST_PCT') else None,
                'ast_ratio': float(row['AST_RATIO']) if row.get('AST_RATIO') else None,
                'oreb_pct': float(row['OREB_PCT']) if row.get('OREB_PCT') else None,
                'dreb_pct': float(row['DREB_PCT']) if row.get('DREB_PCT') else None,
                'reb_pct': float(row['REB_PCT']) if row.get('REB_PCT') else None,
                'tov_pct': float(row.get('TM_TOV_PCT', 0)) if row.get('TM_TOV_PCT') else None,
                'efg_pct': float(row['EFG_PCT']) if row.get('EFG_PCT') else None,
                'ts_pct': float(row['TS_PCT']) if row.get('TS_PCT') else None,
                'usg_pct': float(row['USG_PCT']) if row.get('USG_PCT') else None,
                'pace': float(row.get('PACE', 0)) if row.get('PACE') else None,
                'pie': float(row.get('PIE', 0)) if row.get('PIE') else None,
                
                # Note: BPM and VORP not available in NBA Stats API
                # These would need to be calculated or scraped from Basketball-Reference
                'bpm': None,
                'vorp': None
            }
            players.append(player)
        
        # Filter to significant players
        filtered_players = [
            p for p in players 
            if p['games_played'] >= 5 or p['minutes_played'] >= 50
        ]
        
        print(f"  ✅ Scraped {len(players)} players")
        print(f"  ✅ Filtered to {len(filtered_players)} significant players")
        
        return filtered_players
        
    except Exception as e:
        print(f"  ❌ Failed to scrape {season['label']}: {e}")
        return []

def main():
    """Main scraper function"""
    print("🏀 NBA Player Historical Data Scraper (nba_api)")
    print("=" * 60)
    print(f"Seasons: {', '.join([s['label'] for s in SEASONS])}")
    print("=" * 60)
    
    all_players = []
    
    # Create output directory
    output_dir = Path(__file__).parent.parent.parent.parent / 'data' / 'nba' / 'players' / 'archive'
    output_dir.mkdir(parents=True, exist_ok=True)
    
    for i, season in enumerate(SEASONS):
        players = scrape_season_players(season)
        all_players.extend(players)
        
        # Save individual season file
        season_file = output_dir / f"player_seasons_{season['label'].replace('-', '_')}.json"
        season_data = {
            'schema_version': 1,
            'scraped_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'season': season['label'],
            'source': 'nba-stats-api-via-nba_api-library',
            'player_count': len(players),
            'players': players
        }
        
        with open(season_file, 'w') as f:
            json.dump(season_data, f, indent=2)
        
        print(f"  💾 Saved: {season_file}\n")
        
        # Delay before next season
        if i < len(SEASONS) - 1:
            print(f"  ⏱️  Waiting {DELAY_BETWEEN_SEASONS}s...\n")
            time.sleep(DELAY_BETWEEN_SEASONS)
    
    # Save combined archive
    combined_file = output_dir / 'player_seasons_combined.json'
    combined_data = {
        'schema_version': 1,
        'scraped_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'seasons': [s['label'] for s in SEASONS],
        'source': 'nba-stats-api-via-nba_api-library',
        'total_player_seasons': len(all_players),
        'players': all_players
    }
    
    with open(combined_file, 'w') as f:
        json.dump(combined_data, f, indent=2)
    
    print("\n" + "=" * 60)
    print("✅ SCRAPING COMPLETE")
    print("=" * 60)
    print(f"📁 Combined file: {combined_file}")
    print(f"📊 Total player-seasons: {len(all_players)}")
    print(f"🏀 Average per season: {len(all_players) // len(SEASONS)}")
    print("\n💡 Next steps:")
    print("  1. Run team scraper: python3 scripts/nba/local/scrape-teams-nba-api.py")
    print("  2. Calculate RCI: node scripts/nba/local/build-rosters-with-rci.js")
    print("  3. Validate: node scripts/nba/local/validate-data.js")

if __name__ == '__main__':
    main()
