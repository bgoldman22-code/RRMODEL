#!/usr/bin/env python3
"""
Update NBA Opponent Defense Stats
Fetches defensive metrics from NBA Stats API and saves to Git repo

Updated: November 12, 2025
Includes: User-Agent, exponential backoff, deterministic output
"""

from nba_api.stats.endpoints import LeagueDashTeamStats
import pandas as pd
import json
import os
import time
import sys
from typing import Dict, List

# ============================================================================
# CONSTANTS
# ============================================================================

SEASON = '2025-26'
OUTPUT_DIR = 'data/nba/opponent-defense'
OUTPUT_FILE = f'{OUTPUT_DIR}/{SEASON}.json'

# Custom headers to avoid 429s
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nba.com/',
    'Origin': 'https://www.nba.com'
}

# Retry configuration
MAX_RETRIES = 3
BACKOFF_BASE = 2  # seconds (2s, 4s, 8s)
REQUEST_DELAY = 1.5  # seconds between requests

# ============================================================================
# FETCH WITH RETRIES
# ============================================================================

def fetch_defensive_stats(attempt: int = 1) -> pd.DataFrame:
    """
    Fetch team defensive stats with exponential backoff
    
    Args:
        attempt: Current attempt number (1-indexed)
        
    Returns:
        DataFrame with defensive stats
        
    Raises:
        Exception: If all retries exhausted
    """
    try:
        print(f"📊 Fetching opponent defensive stats (attempt {attempt}/{MAX_RETRIES})...")
        
        # Add delay between attempts (not on first attempt)
        if attempt > 1:
            delay = BACKOFF_BASE ** (attempt - 1)
            print(f"   ⏱️  Waiting {delay}s before retry...")
            time.sleep(delay)
        
        # Fetch defensive stats
        defense = LeagueDashTeamStats(
            season=SEASON,
            measure_type_detailed_defense='Defense',
            per_mode_detailed='PerGame',
            headers=HEADERS,
            timeout=30
        )
        
        # Add small delay to avoid rate limiting
        time.sleep(REQUEST_DELAY)
        
        df = defense.get_data_frames()[0]
        
        if df.empty:
            raise ValueError("Received empty DataFrame from API")
        
        print(f"   ✅ Successfully fetched {len(df)} teams")
        return df
        
    except Exception as e:
        print(f"   ❌ Error fetching stats: {e}")
        
        if attempt >= MAX_RETRIES:
            print(f"   💀 All {MAX_RETRIES} attempts exhausted")
            raise
        
        print(f"   🔄 Retrying...")
        return fetch_defensive_stats(attempt + 1)

# ============================================================================
# PROCESS DATA
# ============================================================================

def process_defensive_data(df: pd.DataFrame) -> List[Dict]:
    """
    Process DataFrame into clean output format
    
    Args:
        df: Raw DataFrame from NBA API
        
    Returns:
        List of team defensive stats dicts
    """
    output = []
    
    for _, row in df.iterrows():
        try:
            team_data = {
                # Team identification
                'teamId': int(row['TEAM_ID']),
                'team': str(row['TEAM_ABBREVIATION']),
                
                # Defensive metrics (rounded to 2 decimal places)
                'defRating': round(float(row['DEF_RATING']), 2),
                'rebsAllowedPer100': round(float(row['OPP_REB']), 2),
                'astsAllowedPer100': round(float(row['OPP_AST']), 2),
                'pace': round(float(row['PACE']), 2),
                
                # Additional useful metrics
                'oppPtsPer100': round(float(row.get('OPP_PTS', 0)), 2) if 'OPP_PTS' in row else None,
                'oppFG%': round(float(row.get('OPP_FG_PCT', 0)) * 100, 2) if 'OPP_FG_PCT' in row else None,
                'oppFG3%': round(float(row.get('OPP_FG3_PCT', 0)) * 100, 2) if 'OPP_FG3_PCT' in row else None,
                
                # Metadata
                'lastUpdated': pd.Timestamp.now().isoformat(),
                'season': SEASON
            }
            
            # Remove None values
            team_data = {k: v for k, v in team_data.items() if v is not None}
            
            output.append(team_data)
            
        except (KeyError, ValueError) as e:
            print(f"   ⚠️  Warning: Skipping team due to error: {e}")
            continue
    
    # Sort by team abbreviation for deterministic output
    output.sort(key=lambda x: x['team'])
    
    return output

# ============================================================================
# SAVE TO FILE
# ============================================================================

def save_to_file(data: List[Dict], filepath: str) -> None:
    """
    Save data to JSON file with deterministic formatting
    
    Args:
        data: List of team stats dicts
        filepath: Output file path
    """
    # Create directory if it doesn't exist
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    # Write with sorted keys and 2-space indent for clean diffs
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2, sort_keys=True)
    
    print(f"✅ Saved {len(data)} teams to {filepath}")

# ============================================================================
# VALIDATION
# ============================================================================

def validate_output(data: List[Dict]) -> bool:
    """
    Validate output data quality
    
    Args:
        data: List of team stats dicts
        
    Returns:
        True if valid, False otherwise
    """
    if not data:
        print("❌ Validation failed: Empty data")
        return False
    
    if len(data) != 30:
        print(f"⚠️  Warning: Expected 30 teams, got {len(data)}")
    
    required_fields = ['teamId', 'team', 'defRating', 'rebsAllowedPer100', 'astsAllowedPer100', 'pace']
    
    for team in data:
        for field in required_fields:
            if field not in team:
                print(f"❌ Validation failed: Missing field '{field}' for team {team.get('team', 'UNKNOWN')}")
                return False
            
            # Check for NaN or invalid values
            value = team[field]
            if isinstance(value, float) and (pd.isna(value) or value < 0):
                print(f"❌ Validation failed: Invalid value for '{field}' in team {team['team']}: {value}")
                return False
    
    print(f"✅ Validation passed: {len(data)} teams with all required fields")
    return True

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Main execution function"""
    try:
        print("\n" + "="*60)
        print("🏀 NBA Opponent Defense Stats Update")
        print("="*60 + "\n")
        
        # Fetch data
        df = fetch_defensive_stats()
        
        # Process data
        print("\n📊 Processing data...")
        data = process_defensive_data(df)
        
        # Validate
        print("\n🔍 Validating output...")
        if not validate_output(data):
            sys.exit(1)
        
        # Save
        print(f"\n💾 Saving to {OUTPUT_FILE}...")
        save_to_file(data, OUTPUT_FILE)
        
        # Print sample
        print("\n📋 Sample output (first team):")
        if data:
            print(json.dumps(data[0], indent=2, sort_keys=True))
        
        print("\n" + "="*60)
        print("✅ SUCCESS")
        print("="*60 + "\n")
        
    except Exception as e:
        print("\n" + "="*60)
        print(f"❌ FAILED: {e}")
        print("="*60 + "\n")
        sys.exit(1)

if __name__ == '__main__':
    main()
