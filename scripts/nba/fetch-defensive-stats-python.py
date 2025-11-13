#!/usr/bin/env python3
"""
Fetch REAL NBA defensive stats using the nba_api Python library
This will get actual data from stats.nba.com for both 2024-25 and 2025-26 seasons
"""

import json
import sys
from datetime import datetime

try:
    from nba_api.stats.endpoints import leaguedashteamstats
    print("✅ nba_api library loaded successfully\n")
except ImportError:
    print("❌ nba_api not installed. Installing now...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "nba_api"])
    from nba_api.stats.endpoints import leaguedashteamstats
    print("✅ nba_api installed and loaded\n")

def fetch_defensive_stats(season):
    """
    Fetch defensive stats for a given season
    season format: '2024-25' or '2025-26'
    """
    print(f"🏀 Fetching {season} defensive stats...")
    print(f"   Endpoint: leaguedashteamstats")
    print(f"   MeasureType: Opponent")
    print(f"   PerMode: Per100Possessions\n")
    
    try:
        # Fetch opponent stats (how teams defend opponents)
        stats = leaguedashteamstats.LeagueDashTeamStats(
            season=season,
            season_type_all_star='Regular Season',
            measure_type_detailed_defense='Opponent',
            per_mode_detailed='Per100Possessions',
            pace_adjust='N',
            plus_minus='N',
            rank='N'
        )
        
        # Get the data as a dictionary
        data = stats.get_normalized_dict()
        df = stats.get_data_frames()[0]
        
        print(f"✅ SUCCESS! Fetched {len(df)} teams")
        print(f"   Columns: {list(df.columns)[:10]}...\n")
        
        # Parse the data
        teams = {}
        all_ratings = []
        
        # Only the 30 actual NBA teams
        valid_nba_teams = {
            'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
            'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
            'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
            'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
            'LA Clippers': 'LAC', 'Los Angeles Clippers': 'LAC',
            'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM', 'Miami Heat': 'MIA',
            'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
            'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK',
            'Oklahoma City Thunder': 'OKC', 'Orlando Magic': 'ORL',
            'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX',
            'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC',
            'San Antonio Spurs': 'SAS', 'Toronto Raptors': 'TOR',
            'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS',
        }
        
        for _, row in df.iterrows():
            team_name = row['TEAM_NAME']
            
            # Skip if not a valid NBA team
            if team_name not in valid_nba_teams:
                continue
            
            abbrev = valid_nba_teams[team_name]
            
            # Column names have OPP_ prefix for opponent stats
            teams[abbrev] = {
                'team': team_name,
                'abbrev': abbrev,
                'oppREB': round(float(row['OPP_REB']), 1),
                'oppAST': round(float(row['OPP_AST']), 1),
                'oppPTS': round(float(row['OPP_PTS']), 1),
                'oppFG_PCT': round(float(row['OPP_FG_PCT']) * 100, 1),
                'opp3P_PCT': round(float(row['OPP_FG3_PCT']) * 100, 1),
                'oppFT_PCT': round(float(row['OPP_FT_PCT']) * 100, 1),
                'oppTOV': round(float(row['OPP_TOV']), 1),
                'games': int(row['GP']),
                'defRating': round(float(row['OPP_PTS']), 1),  # Points allowed per 100 poss
            }
            
            all_ratings.append({
                'abbrev': abbrev,
                'rating': float(row['OPP_PTS'])
            })
        
        # Sort by defensive rating (lower is better)
        all_ratings.sort(key=lambda x: x['rating'])
        
        # Calculate league averages
        total_teams = len(teams)
        avg_reb = sum(t['oppREB'] for t in teams.values()) / total_teams
        avg_ast = sum(t['oppAST'] for t in teams.values()) / total_teams
        avg_pts = sum(t['oppPTS'] for t in teams.values()) / total_teams
        
        return {
            'season': season,
            'source': 'NBA Stats API (via nba_api Python library)',
            'lastUpdated': datetime.now().isoformat() + 'Z',
            'sampleSize': f'{total_teams} teams, {int(df["GP"].mean())} games average',
            'teams': teams,
            'leagueAverages': {
                'oppREB': round(avg_reb, 1),
                'oppAST': round(avg_ast, 1),
                'oppPTS': round(avg_pts, 1),
                'defRating': round(avg_pts, 1),
            },
            'rankings': {
                'topDefenses': [f"{r['abbrev']} ({r['rating']:.1f})" for r in all_ratings[:5]],
                'worstDefenses': [f"{r['abbrev']} ({r['rating']:.1f})" for r in all_ratings[-5:]],
            }
        }
        
    except Exception as e:
        print(f"❌ ERROR fetching {season}: {str(e)}\n")
        return None

def save_data(data, season):
    """Save data to JSON file"""
    if not data:
        return False
        
    output = {
        '_metadata': {
            'season': data['season'],
            'lastUpdated': data['lastUpdated'],
            'source': data['source'],
            'sampleSize': data['sampleSize'],
            'per100Possessions': True,
            'schemaVersion': '1.0',
        },
        'teams': data['teams'],
        'leagueAverages': data['leagueAverages'],
        'notes': {
            'topDefenses': data['rankings']['topDefenses'],
            'worstDefenses': data['rankings']['worstDefenses'],
            'methodology': f"Real data from {data['source']}",
            'autoUpdate': 'System automatically refreshes this data every 24 hours',
        }
    }
    
    filepath = f'data/nba/opponent-defense/{season}.json'
    
    try:
        import os
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        with open(filepath, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"✅ Saved to: {filepath}\n")
        return True
        
    except Exception as e:
        print(f"❌ Failed to save {season}: {str(e)}\n")
        return False

def main():
    print("=" * 60)
    print("🏀 NBA DEFENSIVE STATS FETCHER")
    print("=" * 60)
    print(f"📅 Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"📦 Using: nba_api Python library")
    print(f"🎯 Seasons: 2024-25 and 2025-26")
    print("=" * 60)
    print()
    
    results = {}
    
    # Fetch 2024-25 season
    print("🏀 SEASON: 2024-25 (Last Season)")
    print("-" * 60)
    data_2024 = fetch_defensive_stats('2024-25')
    
    if data_2024:
        results['2024-25'] = data_2024
        print(f"📊 {len(data_2024['teams'])} teams fetched")
        print(f"🛡️  Top Defense: {data_2024['rankings']['topDefenses'][0]}")
        print(f"🚨 Worst Defense: {data_2024['rankings']['worstDefenses'][-1]}")
        print(f"📈 League Avg: {data_2024['leagueAverages']['oppPTS']} pts/100\n")
        
        if save_data(data_2024, '2024-25'):
            print("✅ 2024-25 data saved successfully!\n")
    
    print()
    
    # Fetch 2025-26 season
    print("🏀 SEASON: 2025-26 (Current Season)")
    print("-" * 60)
    data_2025 = fetch_defensive_stats('2025-26')
    
    if data_2025:
        results['2025-26'] = data_2025
        print(f"📊 {len(data_2025['teams'])} teams fetched")
        print(f"🛡️  Top Defense: {data_2025['rankings']['topDefenses'][0]}")
        print(f"🚨 Worst Defense: {data_2025['rankings']['worstDefenses'][-1]}")
        print(f"📈 League Avg: {data_2025['leagueAverages']['oppPTS']} pts/100\n")
        
        if save_data(data_2025, '2025-26'):
            print("✅ 2025-26 data saved successfully!\n")
    
    # Final summary
    print()
    print("=" * 60)
    print("📊 FINAL SUMMARY")
    print("=" * 60)
    
    if results:
        for season, data in results.items():
            print(f"✅ {season}: {len(data['teams'])} teams")
            print(f"   Source: {data['source']}")
            print(f"   Games: {data['sampleSize']}")
            print()
        
        print("🎉 SUCCESS! Real defensive stats acquired!")
        return 0
    else:
        print("❌ FAILED: Could not fetch any data")
        print("   The NBA Stats API may be temporarily unavailable")
        return 1

if __name__ == '__main__':
    sys.exit(main())
