#!/usr/bin/env python3
"""
API-Football Data Source Investigation Script

Tests the API-Football API to document:
1. Available endpoints and data fields
2. Coverage for our 904 baseline EPL matches
3. Data quality and completeness
4. Rate limits and performance

API Key: b17da7431a283fa284cd6dca23cf5af4
"""

import requests
import json
import pandas as pd
from datetime import datetime
import time

API_KEY = "b17da7431a283fa284cd6dca23cf5af4"
BASE_URL = "https://v3.football.api-sports.io"
HEADERS = {
    "x-rapidapi-host": "v3.football.api-sports.io",
    "x-rapidapi-key": API_KEY
}

EPL_LEAGUE_ID = 39  # Premier League


def test_api_connection():
    """Test basic API connectivity"""
    print("="*80)
    print("TEST 1: API Connection & Account Status")
    print("="*80)
    
    endpoint = f"{BASE_URL}/status"
    response = requests.get(endpoint, headers=HEADERS)
    
    if response.status_code == 200:
        data = response.json()
        print("\n✅ API Connection Successful")
        print(f"\nAccount Status:")
        print(json.dumps(data['response'], indent=2))
        return True
    else:
        print(f"\n❌ API Connection Failed: {response.status_code}")
        print(response.text)
        return False


def get_available_seasons():
    """Get available seasons for EPL"""
    print("\n" + "="*80)
    print("TEST 2: Available EPL Seasons")
    print("="*80)
    
    endpoint = f"{BASE_URL}/leagues"
    params = {
        "id": EPL_LEAGUE_ID
    }
    
    response = requests.get(endpoint, headers=HEADERS, params=params)
    
    if response.status_code == 200:
        data = response.json()
        seasons = data['response'][0]['seasons']
        
        print(f"\n✅ Found {len(seasons)} seasons")
        print("\nAvailable seasons:")
        for season in seasons[-10:]:  # Last 10 seasons
            print(f"  - {season['year']}: {season['start']} to {season['end']}")
        
        return [s['year'] for s in seasons]
    else:
        print(f"❌ Failed to get seasons: {response.status_code}")
        return []


def get_sample_fixtures(season=2023, limit=5):
    """Get sample fixtures to understand data structure"""
    print("\n" + "="*80)
    print(f"TEST 3: Sample Fixtures (Season {season}-{season+1})")
    print("="*80)
    
    endpoint = f"{BASE_URL}/fixtures"
    params = {
        "league": EPL_LEAGUE_ID,
        "season": season
    }
    
    response = requests.get(endpoint, headers=HEADERS, params=params)
    
    if response.status_code == 200:
        data = response.json()
        fixtures = data['response'][:limit]
        
        print(f"\n✅ Retrieved {len(data['response'])} total fixtures")
        print(f"\nSample fixture structure (showing first {limit}):\n")
        
        for i, fixture in enumerate(fixtures, 1):
            print(f"Fixture {i}:")
            print(f"  ID: {fixture['fixture']['id']}")
            print(f"  Date: {fixture['fixture']['date']}")
            print(f"  Venue: {fixture['fixture']['venue']['name']}")
            print(f"  Referee: {fixture['fixture']['referee']}")
            print(f"  Home: {fixture['teams']['home']['name']}")
            print(f"  Away: {fixture['teams']['away']['name']}")
            print(f"  Score: {fixture['goals']['home']} - {fixture['goals']['away']}")
            print(f"  Status: {fixture['fixture']['status']['long']}")
            print()
        
        # Save first fixture as sample
        with open('/Users/brentgoldman/Desktop/REPO33/RRMODEL/sample_api_football_fixture.json', 'w') as f:
            json.dump(fixtures[0], f, indent=2)
        print("✅ Saved sample fixture to: sample_api_football_fixture.json")
        
        return fixtures
    else:
        print(f"❌ Failed to get fixtures: {response.status_code}")
        return []


def get_fixture_statistics(fixture_id):
    """Get detailed statistics for a specific fixture"""
    print("\n" + "="*80)
    print(f"TEST 4: Fixture Statistics (ID: {fixture_id})")
    print("="*80)
    
    endpoint = f"{BASE_URL}/fixtures/statistics"
    params = {
        "fixture": fixture_id
    }
    
    response = requests.get(endpoint, headers=HEADERS, params=params)
    
    if response.status_code == 200:
        data = response.json()
        
        if len(data['response']) == 0:
            print(f"⚠️ No statistics available for fixture {fixture_id}")
            return None
        
        print(f"\n✅ Statistics Available")
        print("\nAvailable stat types:")
        
        stats_dict = {}
        for team_stats in data['response']:
            team_name = team_stats['team']['name']
            print(f"\n{team_name}:")
            
            team_dict = {}
            for stat in team_stats['statistics']:
                stat_type = stat['type']
                stat_value = stat['value']
                print(f"  - {stat_type}: {stat_value}")
                team_dict[stat_type] = stat_value
            
            stats_dict[team_name] = team_dict
        
        # Save sample statistics
        with open('/Users/brentgoldman/Desktop/REPO33/RRMODEL/sample_api_football_statistics.json', 'w') as f:
            json.dump(data['response'], f, indent=2)
        print("\n✅ Saved sample statistics to: sample_api_football_statistics.json")
        
        return stats_dict
    else:
        print(f"❌ Failed to get statistics: {response.status_code}")
        return None


def test_coverage_for_baseline():
    """Test coverage for our baseline 904 matches"""
    print("\n" + "="*80)
    print("TEST 5: Coverage vs Baseline 904 Matches")
    print("="*80)
    
    # Load our baseline matches
    try:
        baseline_path = '/Users/brentgoldman/Desktop/REPO33/data/premier_league/historical_completed_with_odds.csv'
        baseline_df = pd.read_csv(baseline_path)
        
        print(f"\n✅ Loaded baseline: {len(baseline_df)} odds records")
        print(f"Date range: {baseline_df['date'].min()} to {baseline_df['date'].max()}")
        
        # Get unique seasons in baseline
        seasons = baseline_df['season'].unique()
        print(f"\nSeasons in baseline: {list(seasons)}")
        
        # For each season, count API-Football fixtures
        coverage_results = []
        
        for season_str in seasons:
            # Convert '2023-24' to 2023
            year = int(season_str.split('-')[0])
            
            print(f"\nChecking season {season_str} (API year: {year})...")
            
            endpoint = f"{BASE_URL}/fixtures"
            params = {
                "league": EPL_LEAGUE_ID,
                "season": year
            }
            
            response = requests.get(endpoint, headers=HEADERS, params=params)
            
            if response.status_code == 200:
                data = response.json()
                api_fixtures = len(data['response'])
                
                baseline_season = baseline_df[baseline_df['season'] == season_str]
                baseline_count = len(baseline_season)
                
                coverage_results.append({
                    'season': season_str,
                    'baseline_matches': baseline_count,
                    'api_fixtures': api_fixtures,
                    'status': '✅' if api_fixtures > 0 else '❌'
                })
                
                print(f"  {coverage_results[-1]['status']} Baseline: {baseline_count} | API-Football: {api_fixtures}")
            else:
                print(f"  ❌ API request failed")
            
            time.sleep(0.5)  # Rate limiting
        
        # Summary
        print("\n" + "="*40)
        print("Coverage Summary:")
        print("="*40)
        for result in coverage_results:
            print(f"{result['season']}: {result['api_fixtures']} fixtures available")
        
        total_api = sum(r['api_fixtures'] for r in coverage_results)
        total_baseline = sum(r['baseline_matches'] for r in coverage_results)
        
        print(f"\nTotal: {total_api} API fixtures vs {total_baseline} baseline matches")
        print(f"Expected coverage: ~{100 * total_api / 977 if total_api > 0 else 0:.1f}%")
        
        return coverage_results
        
    except FileNotFoundError:
        print("⚠️ Baseline file not found, skipping coverage test")
        return []


def document_all_stat_types():
    """Get all available statistic types from multiple matches"""
    print("\n" + "="*80)
    print("TEST 6: Complete Stat Type Inventory")
    print("="*80)
    
    print("\nFetching statistics from multiple matches to catalog all available fields...")
    
    # Get recent season fixtures
    endpoint = f"{BASE_URL}/fixtures"
    params = {
        "league": EPL_LEAGUE_ID,
        "season": 2023,
        "status": "FT"  # Finished matches
    }
    
    response = requests.get(endpoint, headers=HEADERS, params=params)
    
    if response.status_code == 200:
        fixtures = response.json()['response'][:10]  # Test 10 matches
        
        all_stat_types = set()
        
        for fixture in fixtures:
            fixture_id = fixture['fixture']['id']
            
            # Get statistics for this fixture
            stats_endpoint = f"{BASE_URL}/fixtures/statistics"
            stats_response = requests.get(
                stats_endpoint, 
                headers=HEADERS, 
                params={"fixture": fixture_id}
            )
            
            if stats_response.status_code == 200:
                stats_data = stats_response.json()['response']
                
                if len(stats_data) > 0:
                    for team_stats in stats_data:
                        for stat in team_stats['statistics']:
                            all_stat_types.add(stat['type'])
            
            time.sleep(0.3)  # Rate limiting
        
        print(f"\n✅ Found {len(all_stat_types)} unique stat types:\n")
        
        stat_list = sorted(list(all_stat_types))
        for i, stat_type in enumerate(stat_list, 1):
            print(f"{i:2d}. {stat_type}")
        
        return stat_list
    else:
        print(f"❌ Failed to get fixtures")
        return []


def test_team_name_mapping():
    """Get team names from API to build mapping"""
    print("\n" + "="*80)
    print("TEST 7: Team Name Mapping")
    print("="*80)
    
    endpoint = f"{BASE_URL}/teams"
    params = {
        "league": EPL_LEAGUE_ID,
        "season": 2023
    }
    
    response = requests.get(endpoint, headers=HEADERS, params=params)
    
    if response.status_code == 200:
        data = response.json()
        teams = data['response']
        
        print(f"\n✅ Found {len(teams)} teams in EPL 2023-24\n")
        print("API Team Names:")
        print("-" * 40)
        
        team_mapping = {}
        for team in teams:
            team_id = team['team']['id']
            team_name = team['team']['name']
            team_code = team['team']['code']
            
            print(f"{team_name:30s} (ID: {team_id}, Code: {team_code})")
            team_mapping[team_id] = {
                'name': team_name,
                'code': team_code
            }
        
        # Save mapping
        with open('/Users/brentgoldman/Desktop/REPO33/RRMODEL/api_football_team_mapping.json', 'w') as f:
            json.dump(team_mapping, f, indent=2)
        print("\n✅ Saved team mapping to: api_football_team_mapping.json")
        
        return team_mapping
    else:
        print(f"❌ Failed to get teams")
        return {}


def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("API-FOOTBALL DATA SOURCE INVESTIGATION")
    print("="*80)
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"API Key: {API_KEY[:10]}...")
    print("="*80)
    
    # Test 1: Connection
    if not test_api_connection():
        print("\n❌ API connection failed. Stopping tests.")
        return
    
    time.sleep(1)
    
    # Test 2: Available seasons
    seasons = get_available_seasons()
    time.sleep(1)
    
    # Test 3: Sample fixtures
    fixtures = get_sample_fixtures(season=2023, limit=5)
    time.sleep(1)
    
    # Test 4: Statistics for first fixture
    if fixtures:
        first_fixture_id = fixtures[0]['fixture']['id']
        stats = get_fixture_statistics(first_fixture_id)
        time.sleep(1)
    
    # Test 5: Coverage vs baseline
    coverage = test_coverage_for_baseline()
    time.sleep(1)
    
    # Test 6: All stat types
    stat_types = document_all_stat_types()
    time.sleep(1)
    
    # Test 7: Team mapping
    team_mapping = test_team_name_mapping()
    
    print("\n" + "="*80)
    print("INVESTIGATION COMPLETE")
    print("="*80)
    print("\nGenerated files:")
    print("  - sample_api_football_fixture.json")
    print("  - sample_api_football_statistics.json")
    print("  - api_football_team_mapping.json")
    print("\nNext steps:")
    print("  1. Review generated JSON files")
    print("  2. Update comprehensive analysis document")
    print("  3. Build fetcher module")
    print("  4. Test coverage calculation")


if __name__ == '__main__':
    main()
