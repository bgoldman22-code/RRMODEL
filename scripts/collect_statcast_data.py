
# MLB HR RR - Statcast Data Collector
# Run this after installing: pip install pybaseball

import pybaseball as pyb
import pandas as pd
import json
from datetime import datetime, timedelta
import os

pyb.cache.enable()

YEARS = [2021, 2022, 2023, 2024, 2025]
OUTPUT_DIR = '/Users/brentgoldman/RRMODEL/data/mlb_historical/statcast'

def collect_statcast_hrs(year):
    """Collect all HR batted ball events for a year"""
    print(f"\n📊 Collecting Statcast HRs for {year}...")
    
    start_date = f"{year}-03-01"
    end_date = f"{year}-11-30"
    
    # Fetch all statcast data (this takes a while!)
    print(f"   Fetching statcast data {start_date} to {end_date}...")
    data = pyb.statcast(start_dt=start_date, end_dt=end_date)
    
    # Filter to HRs only
    hrs = data[data['events'] == 'home_run'].copy()
    
    print(f"   Found {len(hrs)} HRs")
    
    # Select relevant columns
    hr_data = hrs[[
        'game_date', 'player_name', 'batter', 'pitcher', 
        'launch_speed', 'launch_angle', 'hit_distance_sc',
        'hc_x', 'hc_y', 'pitch_type', 'release_speed',
        'home_team', 'away_team', 'inning', 'outs_when_up',
        'description', 'zone', 'balls', 'strikes'
    ]].copy()
    
    # Save to JSON
    output_file = os.path.join(OUTPUT_DIR, f'{year}_statcast_hrs.json')
    hr_data.to_json(output_file, orient='records', indent=2)
    
    print(f"   ✅ Saved {len(hr_data)} HRs to {output_file}")
    
    return len(hr_data)

def collect_player_stats(year):
    """Collect player season stats"""
    print(f"\n📈 Collecting player stats for {year}...")
    
    # Batting stats
    batting = pyb.batting_stats(year)
    batting_file = os.path.join('/Users/brentgoldman/RRMODEL/data/mlb_historical/players', f'{year}_batting.json')
    batting.to_json(batting_file, orient='records', indent=2)
    print(f"   ✅ Batting: {len(batting)} players")
    
    # Pitching stats
    pitching = pyb.pitching_stats(year)
    pitching_file = os.path.join('/Users/brentgoldman/RRMODEL/data/mlb_historical/players', f'{year}_pitching.json')
    pitching.to_json(pitching_file, orient='records', indent=2)
    print(f"   ✅ Pitching: {len(pitching)} players")
    
    return len(batting), len(pitching)

if __name__ == '__main__':
    print("=" * 60)
    print("MLB HR Round Robin - Statcast Data Collection")
    print("=" * 60)
    
    total_hrs = 0
    
    for year in YEARS:
        try:
            hrs = collect_statcast_hrs(year)
            total_hrs += hrs
            
            batting_count, pitching_count = collect_player_stats(year)
            
        except Exception as e:
            print(f"❌ Error with {year}: {e}")
    
    print(f"\n✅ COMPLETE: {total_hrs} total HRs collected across {len(YEARS)} years")
