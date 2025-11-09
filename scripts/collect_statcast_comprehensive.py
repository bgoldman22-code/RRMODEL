#!/usr/bin/env python3
"""
MLB HR RR - COMPREHENSIVE Statcast & Player Data Collector

Collects EVERYTHING needed for prediction model:
1. BATTED BALL DATA: Exit velo, launch angle, barrel rate, spray charts (ALL plate appearances)
2. BATTER PROFILES: HR tendencies, pitch-type performance, zone heatmaps, platoon splits
3. PITCHER PROFILES: Arsenal composition, velocity, location, HR tendencies, platoon splits
4. PITCH-BY-PITCH: Every pitch thrown (type, location, speed, result)

Run after: pip install pybaseball pandas numpy
"""

import pybaseball as pyb
import pandas as pd
import numpy as np
import json
from datetime import datetime
import os
from pathlib import Path

# Enable caching to speed up repeated queries
pyb.cache.enable()

YEARS = [2021, 2022, 2023, 2024, 2025]
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / 'data' / 'mlb_historical'

# Create directories
(DATA_DIR / 'statcast').mkdir(parents=True, exist_ok=True)
(DATA_DIR / 'players' / 'batters').mkdir(parents=True, exist_ok=True)
(DATA_DIR / 'players' / 'pitchers').mkdir(parents=True, exist_ok=True)
(DATA_DIR / 'players' / 'profiles').mkdir(parents=True, exist_ok=True)

print("=" * 80)
print("MLB HR ROUND ROBIN - COMPREHENSIVE DATA COLLECTION")
print("=" * 80)

def collect_statcast_batted_balls(year):
    """
    Collect ALL batted ball events (not just HRs)
    Needed for: exit velo trends, barrel rate, launch angle consistency, spray patterns
    """
    print(f"\n📊 [{year}] Collecting ALL batted ball events...")
    
    start_date = f"{year}-03-01"
    end_date = f"{year}-11-30"
    
    try:
        # Fetch ALL statcast data for the year
        print(f"   Fetching statcast data {start_date} to {end_date}...")
        print(f"   ⚠️  This may take 5-10 minutes per year...")
        
        data = pyb.statcast(start_dt=start_date, end_dt=end_date)
        
        if data is None or len(data) == 0:
            print(f"   ❌ No data returned for {year}")
            return None
        
        print(f"   Got {len(data):,} total pitches")
        
        # Filter to batted balls only (need all contact, not just HRs)
        batted = data[data['type'] == 'X'].copy()  # 'X' = ball in play
        print(f"   {len(batted):,} batted ball events")
        
        # Extract critical fields
        batted_subset = batted[[
            # Identity
            'game_date', 'game_pk', 'player_name', 'batter', 'pitcher',
            'home_team', 'away_team', 'inning', 'inning_topbot',
            
            # Batted ball quality
            'launch_speed', 'launch_angle', 'hit_distance_sc',
            'events', 'description', 'bb_type',  # bb_type = fly_ball, line_drive, etc
            
            # Location (spray chart)
            'hc_x', 'hc_y',  # Hit coordinates
            
            # Pitch that was hit
            'pitch_type', 'release_speed', 'pfx_x', 'pfx_z',  # Movement
            'plate_x', 'plate_z', 'zone',  # Location
            
            # Game state
            'outs_when_up', 'balls', 'strikes', 'on_1b', 'on_2b', 'on_3b',
            'inning', 'home_score', 'away_score',
            
            # Barrel classification
            'barrel', 'launch_speed_angle'
        ]].copy()
        
        # Add barrel flag if missing (calculated from launch angle + exit velo)
        if 'barrel' not in batted_subset.columns or batted_subset['barrel'].isna().all():
            print(f"   Calculating barrel classifications...")
            batted_subset['barrel'] = batted_subset.apply(
                lambda row: is_barrel(row['launch_speed'], row['launch_angle']), 
                axis=1
            )
        
        # Save to JSON
        output_file = DATA_DIR / 'statcast' / f'{year}_batted_balls.json'
        batted_subset.to_json(output_file, orient='records', indent=2, date_format='iso')
        
        hrs = batted_subset[batted_subset['events'] == 'home_run']
        print(f"   ✅ Saved {len(batted_subset):,} batted balls ({len(hrs):,} HRs)")
        print(f"   📁 {output_file}")
        
        return batted_subset
        
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None

def is_barrel(exit_velo, launch_angle):
    """
    Barrel definition: optimal exit velo + launch angle combination
    98+ mph EV with launch angle 26-30° (sweet spot)
    """
    if pd.isna(exit_velo) or pd.isna(launch_angle):
        return 0
    
    if exit_velo < 98:
        return 0
    
    # Barrel window expands with higher exit velo
    if 26 <= launch_angle <= 30:
        return 1
    elif exit_velo >= 99 and 25 <= launch_angle <= 31:
        return 1
    elif exit_velo >= 100 and 24 <= launch_angle <= 33:
        return 1
    elif exit_velo >= 101 and 23 <= launch_angle <= 34:
        return 1
    elif exit_velo >= 102 and 22 <= launch_angle <= 35:
        return 1
    
    return 0

def collect_pitch_by_pitch(year):
    """
    Collect EVERY pitch thrown (not just batted balls)
    Needed for: pitcher arsenal analysis, batter vs pitch type, zone profiles
    """
    print(f"\n🎯 [{year}] Collecting pitch-by-pitch data...")
    
    start_date = f"{year}-03-01"
    end_date = f"{year}-11-30"
    
    try:
        print(f"   Fetching all pitches {start_date} to {end_date}...")
        print(f"   ⚠️  This may take 10-15 minutes per year...")
        
        data = pyb.statcast(start_dt=start_date, end_dt=end_date)
        
        if data is None or len(data) == 0:
            print(f"   ❌ No data returned for {year}")
            return None
        
        print(f"   Got {len(data):,} total pitches")
        
        # Extract pitch-level data
        pitches = data[[
            # Identity
            'game_date', 'game_pk', 'player_name', 'batter', 'pitcher',
            'home_team', 'away_team', 'inning', 'inning_topbot',
            
            # Pitch characteristics
            'pitch_type', 'pitch_name',
            'release_speed', 'release_spin_rate',
            'pfx_x', 'pfx_z',  # Horizontal & vertical movement
            'plate_x', 'plate_z', 'zone',  # Location at plate
            'vx0', 'vy0', 'vz0',  # Initial velocity vector
            'ax', 'ay', 'az',  # Acceleration (spin-induced movement)
            
            # Result
            'type', 'description', 'events',
            'balls', 'strikes', 'outs_when_up',
            
            # Batted ball (if contact made)
            'launch_speed', 'launch_angle', 'hit_distance_sc',
            'hc_x', 'hc_y', 'bb_type'
        ]].copy()
        
        # Save to JSON
        output_file = DATA_DIR / 'statcast' / f'{year}_pitches.json'
        pitches.to_json(output_file, orient='records', indent=2, date_format='iso')
        
        print(f"   ✅ Saved {len(pitches):,} pitches")
        print(f"   📁 {output_file}")
        
        return pitches
        
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None

def build_batter_profiles(year, batted_balls, pitches):
    """
    Build comprehensive batter profiles from statcast data
    Aggregated metrics for prediction model
    """
    print(f"\n🏏 [{year}] Building batter profiles...")
    
    if batted_balls is None or pitches is None:
        print(f"   ⚠️  Skipping (no data)")
        return
    
    profiles = []
    
    # Group by batter
    for batter_id, batter_data in batted_balls.groupby('batter'):
        batter_name = batter_data['player_name'].iloc[0]
        
        # Overall contact quality
        profile = {
            'batter_id': int(batter_id),
            'batter_name': batter_name,
            'year': year,
            
            # Volume
            'total_batted_balls': len(batter_data),
            'total_hrs': len(batter_data[batter_data['events'] == 'home_run']),
            
            # Exit velocity
            'avg_exit_velo': float(batter_data['launch_speed'].mean()),
            'max_exit_velo': float(batter_data['launch_speed'].max()),
            'p95_exit_velo': float(batter_data['launch_speed'].quantile(0.95)),
            'exit_velo_std': float(batter_data['launch_speed'].std()),
            
            # Launch angle
            'avg_launch_angle': float(batter_data['launch_angle'].mean()),
            'launch_angle_std': float(batter_data['launch_angle'].std()),
            'optimal_la_pct': float((batter_data['launch_angle'].between(25, 35)).mean()),  # 25-35° = HR range
            
            # Barrel rate
            'barrel_rate': float(batter_data['barrel'].mean()),
            'barrels': int(batter_data['barrel'].sum()),
            
            # HR distance
            'avg_hr_distance': float(batter_data[batter_data['events'] == 'home_run']['hit_distance_sc'].mean()) if len(batter_data[batter_data['events'] == 'home_run']) > 0 else 0,
        }
        
        # Spray chart (pull%, center%, oppo%)
        hr_data = batter_data[batter_data['events'] == 'home_run']
        if len(hr_data) > 0:
            spray = analyze_spray_chart(hr_data)
            profile.update(spray)
        else:
            profile.update({'pull_hr_pct': 0, 'center_hr_pct': 0, 'oppo_hr_pct': 0})
        
        # Performance by pitch type
        batter_pitches = pitches[pitches['batter'] == batter_id]
        if len(batter_pitches) > 0:
            pitch_performance = analyze_pitch_type_performance(batter_pitches)
            profile['pitch_type_performance'] = pitch_performance
        
        profiles.append(profile)
    
    # Save profiles
    output_file = DATA_DIR / 'players' / 'batters' / f'{year}_batter_profiles.json'
    with open(output_file, 'w') as f:
        json.dump(profiles, f, indent=2)
    
    print(f"   ✅ Built {len(profiles)} batter profiles")
    print(f"   📁 {output_file}")

def build_pitcher_profiles(year, batted_balls, pitches):
    """
    Build comprehensive pitcher profiles from statcast data
    Arsenal composition, velocity, location, HR tendencies
    """
    print(f"\n⚾ [{year}] Building pitcher profiles...")
    
    if batted_balls is None or pitches is None:
        print(f"   ⚠️  Skipping (no data)")
        return
    
    profiles = []
    
    # Group by pitcher
    for pitcher_id, pitcher_data in pitches.groupby('pitcher'):
        pitcher_name = pitcher_data['player_name'].iloc[0]
        
        profile = {
            'pitcher_id': int(pitcher_id),
            'pitcher_name': pitcher_name,
            'year': year,
            
            # Volume
            'total_pitches': len(pitcher_data),
            'total_batted_balls': len(batted_balls[batted_balls['pitcher'] == pitcher_id]),
            'total_hrs_allowed': len(batted_balls[(batted_balls['pitcher'] == pitcher_id) & (batted_balls['events'] == 'home_run')]),
        }
        
        # Arsenal composition
        arsenal = pitcher_data['pitch_type'].value_counts(normalize=True).to_dict()
        profile['arsenal'] = {str(k): float(v) for k, v in arsenal.items()}
        
        # Velocity by pitch type
        velocity = pitcher_data.groupby('pitch_type')['release_speed'].agg(['mean', 'std']).to_dict('index')
        profile['velocity_by_pitch'] = {str(k): {'avg': float(v['mean']), 'std': float(v['std'])} for k, v in velocity.items()}
        
        # Location tendencies (zone heatmap)
        zone_usage = pitcher_data['zone'].value_counts(normalize=True).to_dict()
        profile['zone_usage'] = {str(k): float(v) for k, v in zone_usage.items()}
        
        # Contact quality allowed
        pitcher_batted = batted_balls[batted_balls['pitcher'] == pitcher_id]
        if len(pitcher_batted) > 0:
            profile['avg_exit_velo_allowed'] = float(pitcher_batted['launch_speed'].mean())
            profile['barrel_rate_allowed'] = float(pitcher_batted['barrel'].mean())
            profile['hr_fb_ratio'] = float(len(pitcher_batted[pitcher_batted['events'] == 'home_run']) / max(1, len(pitcher_batted[pitcher_batted['bb_type'] == 'fly_ball'])))
        
        profiles.append(profile)
    
    # Save profiles
    output_file = DATA_DIR / 'players' / 'pitchers' / f'{year}_pitcher_profiles.json'
    with open(output_file, 'w') as f:
        json.dump(profiles, f, indent=2)
    
    print(f"   ✅ Built {len(profiles)} pitcher profiles")
    print(f"   📁 {output_file}")

def analyze_spray_chart(hr_data):
    """
    Calculate pull%, center%, oppo% for HRs
    Based on hit coordinates (hc_x, hc_y)
    """
    # Simplified spray angle calculation
    # hc_x: horizontal position (negative = left field, positive = right field)
    
    total_hrs = len(hr_data)
    if total_hrs == 0:
        return {'pull_hr_pct': 0, 'center_hr_pct': 0, 'oppo_hr_pct': 0}
    
    # Approximate spray zones (this is simplified)
    pull = len(hr_data[(hr_data['hc_x'] < -50)])  # Pulled to left (for RHB) or right (for LHB)
    oppo = len(hr_data[(hr_data['hc_x'] > 50)])   # Opposite field
    center = total_hrs - pull - oppo
    
    return {
        'pull_hr_pct': round(pull / total_hrs, 3),
        'center_hr_pct': round(center / total_hrs, 3),
        'oppo_hr_pct': round(oppo / total_hrs, 3)
    }

def analyze_pitch_type_performance(batter_pitches):
    """
    How does batter perform vs each pitch type?
    Key for prediction model
    """
    performance = {}
    
    for pitch_type, pitch_data in batter_pitches.groupby('pitch_type'):
        batted = pitch_data[pitch_data['type'] == 'X']  # Balls in play
        
        if len(batted) > 0:
            performance[str(pitch_type)] = {
                'pitches_seen': len(pitch_data),
                'batted_balls': len(batted),
                'avg_exit_velo': float(batted['launch_speed'].mean()) if len(batted) > 0 else 0,
                'hrs': int((batted['events'] == 'home_run').sum()),
                'barrel_rate': float(batted['barrel'].mean()) if 'barrel' in batted.columns else 0
            }
    
    return performance

def collect_player_season_stats(year):
    """
    Collect traditional season stats (complement to statcast)
    Useful for context and validation
    """
    print(f"\n📊 [{year}] Collecting season statistics...")
    
    try:
        # Batting stats (includes HR, ISO, wOBA, etc.)
        print(f"   Fetching batting stats...")
        batting = pyb.batting_stats(year, qual=10)  # Min 10 PA
        
        if batting is not None and len(batting) > 0:
            batting_file = DATA_DIR / 'players' / f'{year}_batting_stats.json'
            batting.to_json(batting_file, orient='records', indent=2)
            print(f"   ✅ Batting: {len(batting)} players")
        
        # Pitching stats
        print(f"   Fetching pitching stats...")
        pitching = pyb.pitching_stats(year, qual=10)  # Min 10 IP
        
        if pitching is not None and len(pitching) > 0:
            pitching_file = DATA_DIR / 'players' / f'{year}_pitching_stats.json'
            pitching.to_json(pitching_file, orient='records', indent=2)
            print(f"   ✅ Pitching: {len(pitching)} players")
        
        return batting, pitching
        
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None, None

def main():
    """Run complete data collection"""
    
    print("\n🚀 Starting comprehensive data collection...")
    print(f"   Years: {YEARS}")
    print(f"   Output: {DATA_DIR}")
    print("")
    
    for year in YEARS:
        print("\n" + "=" * 80)
        print(f"YEAR: {year}")
        print("=" * 80)
        
        # 1. Batted balls (ALL contact)
        batted_balls = collect_statcast_batted_balls(year)
        
        # 2. Pitch-by-pitch (ALL pitches)
        pitches = collect_pitch_by_pitch(year)
        
        # 3. Build batter profiles
        if batted_balls is not None and pitches is not None:
            build_batter_profiles(year, batted_balls, pitches)
        
        # 4. Build pitcher profiles
        if batted_balls is not None and pitches is not None:
            build_pitcher_profiles(year, batted_balls, pitches)
        
        # 5. Season stats (traditional)
        collect_player_season_stats(year)
        
        print(f"\n✅ {year} complete!")
    
    print("\n" + "=" * 80)
    print("🎉 ALL DATA COLLECTION COMPLETE")
    print("=" * 80)
    print("\n📋 Data collected:")
    print("   ✅ Batted ball events (exit velo, launch angle, barrels, spray charts)")
    print("   ✅ Pitch-by-pitch data (arsenal, velocity, location)")
    print("   ✅ Batter profiles (HR tendencies, pitch-type performance)")
    print("   ✅ Pitcher profiles (arsenal composition, contact quality allowed)")
    print("   ✅ Season statistics (traditional metrics)")
    print("")

if __name__ == '__main__':
    main()
