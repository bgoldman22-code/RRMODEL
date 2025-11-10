#!/bin/bash

# Grade all NBA player props from November 9, 2025

# Download all box scores
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401810046" -o /tmp/hou_mil.json
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401810047" -o /tmp/bkn_ny.json
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401810048" -o /tmp/bos_orl.json
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401810049" -o /tmp/okc_mem.json
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401810050" -o /tmp/det_phi.json
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401810051" -o /tmp/ind_gs.json
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401810052" -o /tmp/min_sac.json

python3 << 'PYTHON_EOF'
import json

# All player props from the image
props = [
    {'player': 'Anunoby', 'prop': 'ASSISTS', 'line': 2.5, 'pick': 'OVER', 'file': '/tmp/bkn_ny.json'},
    {'player': 'Grimes', 'prop': 'REBOUNDS', 'line': 3.5, 'pick': 'OVER', 'file': '/tmp/det_phi.json'},
    {'player': 'LeVert', 'prop': 'REBOUNDS', 'line': 2.5, 'pick': 'OVER', 'file': '/tmp/det_phi.json'},
    {'player': 'Mann', 'prop': 'REBOUNDS', 'line': 3.5, 'pick': 'OVER', 'file': '/tmp/bkn_ny.json'},
    {'player': 'Towns', 'prop': 'ASSISTS', 'line': 2.5, 'pick': 'UNDER', 'file': '/tmp/bkn_ny.json'},
    {'player': 'Pritchard', 'prop': 'REBOUNDS', 'line': 4.5, 'pick': 'OVER', 'file': '/tmp/bos_orl.json'},
    {'player': 'Sabonis', 'prop': 'ASSISTS', 'line': 4.5, 'pick': 'OVER', 'file': '/tmp/min_sac.json'},
    {'player': 'White', 'prop': 'REBOUNDS', 'line': 4.5, 'pick': 'OVER', 'file': '/tmp/bos_orl.json'},
    {'player': 'Siakam', 'prop': 'REBOUNDS', 'line': 6.5, 'pick': 'UNDER', 'file': '/tmp/ind_gs.json'},
    {'player': 'Bane', 'prop': 'REBOUNDS', 'line': 4.5, 'pick': 'OVER', 'file': '/tmp/okc_mem.json'},
    {'player': 'Podziemski', 'prop': 'ASSISTS', 'line': 3.5, 'pick': 'OVER', 'file': '/tmp/ind_gs.json'},
    {'player': 'Curry', 'prop': 'REBOUNDS', 'line': 4.5, 'pick': 'OVER', 'file': '/tmp/ind_gs.json'},
    {'player': 'Towns', 'prop': 'REBOUNDS', 'line': 11.5, 'pick': 'OVER', 'file': '/tmp/bkn_ny.json'},
    {'player': 'Hartenstein', 'prop': 'REBOUNDS', 'line': 9.5, 'pick': 'UNDER', 'file': '/tmp/okc_mem.json'},
    {'player': 'Gilgeous-Alexander', 'prop': 'ASSISTS', 'line': 6.5, 'pick': 'OVER', 'file': '/tmp/okc_mem.json'},
    {'player': 'Sengun', 'prop': 'REBOUNDS', 'line': 9.5, 'pick': 'UNDER', 'file': '/tmp/hou_mil.json'},
    {'player': 'Thompson', 'prop': 'ASSISTS', 'line': 5.5, 'pick': 'OVER', 'file': '/tmp/hou_mil.json'},
    {'player': 'DeRozan', 'prop': 'ASSISTS', 'line': 3.5, 'pick': 'OVER', 'file': '/tmp/min_sac.json'},
    {'player': 'Sengun', 'prop': 'ASSISTS', 'line': 6.5, 'pick': 'UNDER', 'file': '/tmp/hou_mil.json'},
    {'player': 'Banchero', 'prop': 'ASSISTS', 'line': 4.5, 'pick': 'OVER', 'file': '/tmp/bos_orl.json'}
]

def find_player_stats(file_path, last_name):
    try:
        with open(file_path) as f:
            data = json.load(f)
        
        players = data.get('boxscore', {}).get('players', [])
        
        for team in players:
            for stat_group in team.get('statistics', []):
                for athlete in stat_group.get('athletes', []):
                    name = athlete['athlete']['displayName']
                    if last_name.lower() in name.lower():
                        stats = athlete.get('stats', [])
                        if len(stats) >= 17:
                            return {
                                'name': name,
                                'ast': int(stats[3]),
                                'reb': int(stats[4]),
                                'pts': int(stats[1])
                            }
        return None
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return None

print('\n' + '='*100)
print('NBA PLAYER PROPS GRADING - NOVEMBER 9, 2025')
print('='*100 + '\n')

results = []
for prop in props:
    stats = find_player_stats(prop['file'], prop['player'])
    
    if stats:
        actual = stats['ast'] if prop['prop'] == 'ASSISTS' else stats['reb']
        hit = (prop['pick'] == 'OVER' and actual > prop['line']) or \
              (prop['pick'] == 'UNDER' and actual < prop['line'])
        
        icon = '✅' if hit else '❌'
        status = 'HIT' if hit else 'MISS'
        
        results.append(hit)
        
        print(f"{icon} {stats['name']:<25} {prop['prop']:<10} {prop['pick']:<6} {prop['line']:<4} → {actual:<2} ({status})")
    else:
        print(f"⚠️  {prop['player']:<25} NOT FOUND in box score")

print('\n' + '='*100)
hits = sum(results)
total = len(results)
print(f"OVERALL RECORD: {hits}-{total-hits} ({hits/total*100:.1f}%)")
print('='*100)

# Breakdown by prop type
rebounds_props = [r for i, r in enumerate(results) if props[i]['prop'] == 'REBOUNDS']
assists_props = [r for i, r in enumerate(results) if props[i]['prop'] == 'ASSISTS']

print(f"\nREBOUNDS: {sum(rebounds_props)}-{len(rebounds_props)-sum(rebounds_props)} ({sum(rebounds_props)/len(rebounds_props)*100:.1f}%)")
print(f"ASSISTS: {sum(assists_props)}-{len(assists_props)-sum(assists_props)} ({sum(assists_props)/len(assists_props)*100:.1f}%)")

PYTHON_EOF
