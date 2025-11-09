#!/usr/bin/env python3
"""
Create list of position players (non-pitchers) for HR model
Uses FanGraphs batting stats - anyone with 200+ AB is a position player
"""

import json

years = [2024, 2025]

all_position_players = set()

for year in years:
    batting_file = f'/Users/brentgoldman/RRMODEL/data/mlb_historical/players/{year}_batting_stats.json'
    
    with open(batting_file) as f:
        batting_stats = json.load(f)
    
    # Anyone with 200+ AB is clearly a position player
    position_players = [
        p['Name'] for p in batting_stats 
        if p.get('AB', 0) >= 200
    ]
    
    all_position_players.update(position_players)
    print(f'{year}: {len(position_players)} position players with 200+ AB')

print(f'\nTotal unique position players: {len(all_position_players)}')

# Save to JSON
output = {
    'position_players': sorted(list(all_position_players)),
    'count': len(all_position_players),
    'years': years,
    'criteria': '200+ AB in batting stats'
}

with open('/Users/brentgoldman/RRMODEL/data/mlb_historical/position_players_list.json', 'w') as f:
    json.dump(output, f, indent=2)

print('\n✅ Saved to data/mlb_historical/position_players_list.json')
