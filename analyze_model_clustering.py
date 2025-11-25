#!/usr/bin/env python3
"""Analyze model total predictions for clustering issues"""

import requests
import json

url = "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite-v2"
response = requests.get(url, timeout=30)
data = response.json()

print('🎯 COMPLETE TOTAL ANALYSIS')
print('=' * 70)
print()

all_games = []

for pred in data.get('predictions', []):
    game = pred.get('game', 'Unknown')
    
    # Get model prediction
    pred_obj = pred.get('prediction', {})
    model_total = None
    if 'total' in pred_obj and isinstance(pred_obj['total'], dict):
        model_total = pred_obj['total'].get('prediction')
    
    # Get vegas line
    vegas = pred.get('vegasLines', {})
    vegas_total = None
    if vegas and 'total' in vegas:
        total_obj = vegas['total']
        if 'fair' in total_obj:
            vegas_total = total_obj['fair'].get('line')
    
    # Check if bet was made
    has_bet = any(o.get('market') == 'Total' for o in pred.get('opportunities', []))
    bet_details = None
    if has_bet:
        for opp in pred.get('opportunities', []):
            if opp.get('market') == 'Total':
                bet_details = {
                    'pick': opp.get('pick'),
                    'edge': float(opp.get('edge', 0))
                }
    
    all_games.append({
        'game': game,
        'model': model_total,
        'vegas': vegas_total,
        'has_bet': has_bet,
        'bet_details': bet_details
    })

print('📊 ALL GAMES BREAKDOWN:')
print()

for i, g in enumerate(all_games, 1):
    print(f"{i}. {g['game']}")
    
    if g['model'] is not None:
        print(f"   Model: {g['model']:.1f}")
    
    if g['vegas'] is not None:
        print(f"   Vegas: {g['vegas']:.1f}")
    
    if g['model'] and g['vegas']:
        edge = abs(g['model'] - g['vegas'])
        print(f"   Edge:  {edge:.1f} points")
        
        # Determine direction
        if g['model'] > g['vegas']:
            direction = 'OVER'
        else:
            direction = 'UNDER'
        print(f"   Model says: {direction}")
        
        if g['has_bet']:
            print(f"   ✅ BET: {g['bet_details']['pick']} (edge {g['bet_details']['edge']:.1f})")
        else:
            if direction == 'UNDER' and edge >= 4.0:
                if edge < 6.5:
                    print(f"   ❌ FILTERED: UNDER edge {edge:.1f} < 6.5 (new model working!)")
                else:
                    print(f"   ⚠️  Should be bet? UNDER edge {edge:.1f} >= 6.5")
            else:
                print(f"   ❌ No bet: Edge {edge:.1f} < 4.0 threshold")
    print()

# Statistical analysis
print('=' * 70)
print('STATISTICAL ANALYSIS:')
print()

model_vals = [g['model'] for g in all_games if g['model'] is not None]
vegas_vals = [g['vegas'] for g in all_games if g['vegas'] is not None]

if model_vals:
    avg_model = sum(model_vals) / len(model_vals)
    min_model = min(model_vals)
    max_model = max(model_vals)
    range_model = max_model - min_model
    
    print(f'Model Predictions:')
    print(f'  Average: {avg_model:.1f}')
    print(f'  Range:   {min_model:.1f} - {max_model:.1f}')
    print(f'  Spread:  {range_model:.1f} points')
    print()

if vegas_vals:
    avg_vegas = sum(vegas_vals) / len(vegas_vals)
    min_vegas = min(vegas_vals)
    max_vegas = max(vegas_vals)
    range_vegas = max_vegas - min_vegas
    
    print(f'Vegas Lines:')
    print(f'  Average: {avg_vegas:.1f}')
    print(f'  Range:   {min_vegas:.1f} - {max_vegas:.1f}')
    print(f'  Spread:  {range_vegas:.1f} points')
    print()

if model_vals and vegas_vals:
    bias = avg_model - avg_vegas
    print(f'Model vs Market:')
    print(f'  Bias: {bias:+.1f} points')
    print()

print('=' * 70)
print('🤔 IS THIS CONCERNING?')
print()

if range_model < 1.0:
    print('⚠️  YES - VERY CONCERNING')
    print(f'   All predictions within {range_model:.1f} points')
    print('   Model appears stuck or features not varying')
    print()
    print('   Possible causes:')
    print('   • Feature calculation bug')
    print('   • Model not properly loaded')
    print('   • All teams have similar stats (unlikely)')
elif range_model < 5.0:
    print('⚠️  SOMEWHAT CONCERNING - But maybe OK')
    print(f'   Narrow range: {range_model:.1f} points')
    print()
    print('   However, consider:')
    print('   • Sample size: Only 3 games today')
    print('   • NBA totals DO cluster (most games 220-235)')
    print('   • Similar pace/style teams could yield similar totals')
    print('   • Model may be well-calibrated to league average')
    print()
    print('   ✅ NOT ALARMING if:')
    print('   • These specific teams have similar pace/efficiency')
    print('   • Model varies more across full season')
    print('   • Predictions are accurate vs actual outcomes')
    print()
    print('   ⚠️  INVESTIGATE if:')
    print('   • Pattern continues across multiple days')
    print('   • High-pace teams get same prediction as slow-pace')
    print('   • Model doesn\'t respond to team stat differences')
elif range_model < 15.0:
    print('✅ NORMAL CLUSTERING')
    print(f'   Range: {range_model:.1f} points')
    print('   This is expected for NBA totals')
    print('   Most games fall in 220-235 range')
else:
    print('✅ HEALTHY VARIANCE')
    print(f'   Range: {range_model:.1f} points')
    print('   Model showing good discrimination')

print()
print('=' * 70)
print('🔍 TODAY\'S GAMES CONTEXT:')
print()

# Show what makes sense
print('Expected Total Ranges by Team Type:')
print('  High-pace offense teams: 235-245')
print('  Average teams: 220-235')
print('  Slow-pace defense teams: 210-225')
print()

print(f'Today\'s predictions: {min_model:.1f} - {max_model:.1f}')
print(f'This suggests: {"All average-pace teams" if 225 <= avg_model <= 235 else "Mixed team types"}')
print()

print('🔬 RECOMMENDED CHECKS:')
print('  1. Monitor predictions over next 3-5 days')
print('  2. Check if high-pace teams (e.g., IND, SAC) get higher totals')
print('  3. Check if defensive teams (e.g., OKC, BOS) get lower totals')
print('  4. Compare model predictions to actual game results')
print('  5. Verify model features are calculating correctly')
