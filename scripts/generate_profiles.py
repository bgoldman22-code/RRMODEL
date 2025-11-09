#!/usr/bin/env python3
"""
Generate batter & pitcher profiles from existing Statcast data

Run this AFTER pitch data is already collected.
Processes 3.0GB of pitch data to create elite player profiles.
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path
from datetime import datetime

YEARS = [2021, 2022, 2023, 2024, 2025]
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / 'data' / 'mlb_historical'

print("=" * 80)
print("MLB HR RR - PLAYER PROFILE GENERATION")
print("=" * 80)
print()

def is_barrel(exit_velo, launch_angle):
    """
    Barrel = Hard contact (98+ mph) in ideal launch angle window (26-30°)
    MLB definition varies by exit velo, but simplified here
    """
    if pd.isna(exit_velo) or pd.isna(launch_angle):
        return False
    
    if exit_velo >= 98:
        if 26 <= launch_angle <= 30:
            return True
        elif exit_velo >= 100 and 24 <= launch_angle <= 32:
            return True
        elif exit_velo >= 102 and 22 <= launch_angle <= 34:
            return True
    
    return False

def build_batter_profiles(year):
    """Build comprehensive batter profiles from Statcast data"""
    
    print(f"\n🏏 [{year}] Building batter profiles...")
    
    # Load pitch data
    pitch_file = DATA_DIR / 'statcast' / f'{year}_pitches.json'
    if not pitch_file.exists():
        print(f"   ❌ Missing {pitch_file}")
        return
    
    print(f"   📂 Loading pitch data... (this may take a minute)")
    try:
        # Load in chunks to handle large files
        pitches = pd.read_json(pitch_file, lines=False)
        print(f"   ✅ Loaded {len(pitches):,} pitches")
    except Exception as e:
        print(f"   ❌ Error loading file: {e}")
        return
    
    # Get unique batters
    batters = pitches['batter'].dropna().unique()
    print(f"   👥 {len(batters)} unique batters")
    
    profiles = []
    
    for i, batter_id in enumerate(batters):
        if (i + 1) % 50 == 0:
            print(f"      Processing {i+1}/{len(batters)}...")
        
        batter_pitches = pitches[pitches['batter'] == batter_id].copy()
        
        # Basic counts
        total_pa = len(batter_pitches)
        if total_pa < 20:  # Minimum threshold
            continue
        
        # Batted ball metrics
        batted = batter_pitches[batter_pitches['type'] == 'X'].copy()
        hrs = batter_pitches[batter_pitches['events'] == 'home_run']
        
        # Exit velocity & launch angle
        ev_data = batted[['launch_speed', 'launch_angle']].dropna()
        
        if len(ev_data) == 0:
            avg_ev = None
            avg_la = None
            max_ev = None
            barrel_rate = 0
        else:
            avg_ev = ev_data['launch_speed'].mean()
            avg_la = ev_data['launch_angle'].mean()
            max_ev = ev_data['launch_speed'].max()
            
            # Calculate barrels
            barrels = ev_data.apply(
                lambda row: is_barrel(row['launch_speed'], row['launch_angle']),
                axis=1
            ).sum()
            barrel_rate = barrels / len(batted) if len(batted) > 0 else 0
        
        # Hard contact rate (95+ mph)
        hard_contact = ev_data[ev_data['launch_speed'] >= 95].shape[0] if len(ev_data) > 0 else 0
        hard_contact_rate = hard_contact / len(batted) if len(batted) > 0 else 0
        
        # HR rate
        hr_count = len(hrs)
        hr_rate = hr_count / total_pa
        
        # Performance by pitch type
        pitch_type_counts = batter_pitches['pitch_type'].value_counts().to_dict()
        pitch_type_hrs = batter_pitches[batter_pitches['events'] == 'home_run']['pitch_type'].value_counts().to_dict()
        
        # Platoon splits (if available)
        if 'p_throws' in batter_pitches.columns:
            vs_rhp = batter_pitches[batter_pitches['p_throws'] == 'R']
            vs_lhp = batter_pitches[batter_pitches['p_throws'] == 'L']
        else:
            vs_rhp = pd.DataFrame()
            vs_lhp = pd.DataFrame()
        
        profile = {
            'batter_id': int(batter_id),
            'year': year,
            'player_name': batter_pitches['player_name'].iloc[0] if 'player_name' in batter_pitches else None,
            
            # Volume
            'total_pa': int(total_pa),
            'batted_balls': int(len(batted)),
            
            # HR metrics
            'hr_count': int(hr_count),
            'hr_rate': float(hr_rate),
            
            # Contact quality
            'avg_exit_velo': float(avg_ev) if avg_ev else None,
            'max_exit_velo': float(max_ev) if max_ev else None,
            'avg_launch_angle': float(avg_la) if avg_la else None,
            'barrel_rate': float(barrel_rate),
            'hard_contact_rate': float(hard_contact_rate),
            
            # Platoon
            'pa_vs_rhp': int(len(vs_rhp)) if len(vs_rhp) > 0 else 0,
            'pa_vs_lhp': int(len(vs_lhp)) if len(vs_lhp) > 0 else 0,
            'hr_vs_rhp': int((vs_rhp['events'] == 'home_run').sum()) if len(vs_rhp) > 0 else 0,
            'hr_vs_lhp': int((vs_lhp['events'] == 'home_run').sum()) if len(vs_lhp) > 0 else 0,
            
            # Chase rate (swings outside zone)
            'total_pitches': int(len(batter_pitches)),
            'swings': int((batter_pitches['description'].str.contains('swing', case=False, na=False)).sum()),
        }
        
        profiles.append(profile)
    
    # Save profiles
    output_file = DATA_DIR / 'players' / 'profiles' / f'{year}_batter_profiles.json'
    with open(output_file, 'w') as f:
        json.dump(profiles, f, indent=2)
    
    print(f"   ✅ Saved {len(profiles)} batter profiles to {output_file.name}")
    return profiles

def build_pitcher_profiles(year):
    """Build comprehensive pitcher profiles from Statcast data"""
    
    print(f"\n⚾ [{year}] Building pitcher profiles...")
    
    # Load pitch data
    pitch_file = DATA_DIR / 'statcast' / f'{year}_pitches.json'
    if not pitch_file.exists():
        print(f"   ❌ Missing {pitch_file}")
        return
    
    print(f"   📂 Loading pitch data...")
    try:
        pitches = pd.read_json(pitch_file, lines=False)
        print(f"   ✅ Loaded {len(pitches):,} pitches")
    except Exception as e:
        print(f"   ❌ Error loading file: {e}")
        return
    
    # Get unique pitchers
    pitchers = pitches['pitcher'].dropna().unique()
    print(f"   👥 {len(pitchers)} unique pitchers")
    
    profiles = []
    
    for i, pitcher_id in enumerate(pitchers):
        if (i + 1) % 50 == 0:
            print(f"      Processing {i+1}/{len(pitchers)}...")
        
        pitcher_pitches = pitches[pitches['pitcher'] == pitcher_id].copy()
        
        # Basic counts
        total_pitches = len(pitcher_pitches)
        if total_pitches < 100:  # Minimum threshold
            continue
        
        # Batted ball metrics AGAINST
        batted_against = pitcher_pitches[pitcher_pitches['type'] == 'X'].copy()
        hrs_allowed = pitcher_pitches[pitcher_pitches['events'] == 'home_run']
        
        # Exit velocity ALLOWED
        ev_data = batted_against[['launch_speed', 'launch_angle']].dropna()
        
        if len(ev_data) == 0:
            avg_ev_against = None
            barrel_rate_against = 0
        else:
            avg_ev_against = ev_data['launch_speed'].mean()
            
            # Barrels allowed
            barrels = ev_data.apply(
                lambda row: is_barrel(row['launch_speed'], row['launch_angle']),
                axis=1
            ).sum()
            barrel_rate_against = barrels / len(batted_against) if len(batted_against) > 0 else 0
        
        # Hard contact allowed (95+ mph)
        hard_contact_against = ev_data[ev_data['launch_speed'] >= 95].shape[0] if len(ev_data) > 0 else 0
        hard_contact_rate_against = hard_contact_against / len(batted_against) if len(batted_against) > 0 else 0
        
        # HR rate
        hr_allowed_count = len(hrs_allowed)
        hr_rate_against = hr_allowed_count / total_pitches
        
        # Arsenal composition
        pitch_mix = pitcher_pitches['pitch_type'].value_counts().to_dict()
        
        # Average velocity by pitch type
        velo_by_type = pitcher_pitches.groupby('pitch_type')['release_speed'].mean().to_dict()
        
        # Platoon splits (if available)
        if 'stand' in pitcher_pitches.columns:
            vs_rhb = pitcher_pitches[pitcher_pitches['stand'] == 'R']
            vs_lhb = pitcher_pitches[pitcher_pitches['stand'] == 'L']
        else:
            vs_rhb = pd.DataFrame()
            vs_lhb = pd.DataFrame()
        
        profile = {
            'pitcher_id': int(pitcher_id),
            'year': year,
            'player_name': pitcher_pitches['player_name'].iloc[0] if 'player_name' in pitcher_pitches else None,
            
            # Volume
            'total_pitches': int(total_pitches),
            'batted_balls_against': int(len(batted_against)),
            
            # HR metrics
            'hr_allowed': int(hr_allowed_count),
            'hr_rate_against': float(hr_rate_against),
            
            # Contact quality ALLOWED
            'avg_exit_velo_against': float(avg_ev_against) if avg_ev_against else None,
            'barrel_rate_against': float(barrel_rate_against),
            'hard_contact_rate_against': float(hard_contact_rate_against),
            
            # Arsenal
            'pitch_mix': {k: int(v) for k, v in pitch_mix.items()},
            'avg_velocity': float(pitcher_pitches['release_speed'].mean()) if 'release_speed' in pitcher_pitches else None,
            
            # Platoon
            'pitches_vs_rhb': int(len(vs_rhb)) if len(vs_rhb) > 0 else 0,
            'pitches_vs_lhb': int(len(vs_lhb)) if len(vs_lhb) > 0 else 0,
            'hr_vs_rhb': int((vs_rhb['events'] == 'home_run').sum()) if len(vs_rhb) > 0 else 0,
            'hr_vs_lhb': int((vs_lhb['events'] == 'home_run').sum()) if len(vs_lhb) > 0 else 0,
        }
        
        profiles.append(profile)
    
    # Save profiles
    output_file = DATA_DIR / 'players' / 'profiles' / f'{year}_pitcher_profiles.json'
    with open(output_file, 'w') as f:
        json.dump(profiles, f, indent=2)
    
    print(f"   ✅ Saved {len(profiles)} pitcher profiles to {output_file.name}")
    return profiles

def main():
    """Generate all profiles"""
    
    start_time = datetime.now()
    
    print(f"📅 Years to process: {YEARS}")
    print(f"📂 Data directory: {DATA_DIR}")
    print()
    
    for year in YEARS:
        print("\n" + "=" * 80)
        print(f"YEAR: {year}")
        print("=" * 80)
        
        # Build profiles
        build_batter_profiles(year)
        build_pitcher_profiles(year)
        
        print(f"\n✅ {year} complete!")
    
    elapsed = (datetime.now() - start_time).total_seconds()
    
    print("\n" + "=" * 80)
    print("🎉 PROFILE GENERATION COMPLETE")
    print("=" * 80)
    print(f"⏱️  Total time: {elapsed/60:.1f} minutes")
    print(f"📁 Output: {DATA_DIR / 'players' / 'profiles'}")
    print()

if __name__ == '__main__':
    main()
