#!/usr/bin/env python3
import requests
import json

data = requests.get("https://bgroundrobin.com/.netlify/functions/nba-predictions-elite-v2").json()

print('📊 ALL MODEL TOTAL PREDICTIONS (Today\'s Games)')
print('=' * 70)
print()

all_predictions = []

for pred in data.get('predictions', []):
    game = pred.get('game', 'Unknown')
    
    # Get prediction object
    pred_obj = pred.get('prediction', {})
    model_total = pred_obj.get('total') or pred_obj.get('totalPrediction')
    
    # Handle if it's a dict
    if isinstance(model_total, dict):
        model_total = model_total.get('prediction') or model_total.get('value')
    
    # Get vegas lines
    vegas_lines = pred.get('vegasLines', {})
    total_obj = vegas_lines.get('total', {})
    
    # Try different places for vegas line
    vegas_total = None
    if isinstance(total_obj, dict):
        vegas_total = total_obj.get('line') or total_obj.get('fair', {}).get('line')
    
    # Also check opportunities for model line
    for opp in pred.get('opportunities', []):
        if opp.get('market') == 'Total':
            model_total = float(opp.get('modelLine', model_total or 0))
            vegas_total = float(opp.get('vegasLine', vegas_total or 0))
            break
    
    if model_total and model_total != 0:
        try:
            all_predictions.append({
                'game': game,
                'model': float(model_total),
                'vegas': float(vegas_total) if vegas_total else None,
                'has_opportunity': any(o.get('market') == 'Total' for o in pred.get('opportunities', []))
            })
        except (ValueError, TypeError):
            pass  # Skip if can't convert to float

print(f'Total games analyzed: {len(all_predictions)}')
print()

if all_predictions:
    print('COMPLETE BREAKDOWN:')
    print()
    for p in all_predictions:
        print(f"  {p['game']}")
        print(f"    Model prediction: {p['model']:.1f}")
        if p['vegas']:
            print(f"    Vegas line: {p['vegas']:.1f}")
            print(f"    Difference: {p['model'] - p['vegas']:+.1f}")
        else:
            print(f"    Vegas line: Not available")
        print(f"    Betting opportunity: {'YES' if p['has_opportunity'] else 'NO (edge too small or filtered)'}")
        print()
    
    model_preds = [p['model'] for p in all_predictions]
    vegas_preds = [p['vegas'] for p in all_predictions if p['vegas']]
    
    print('=' * 70)
    print('STATISTICAL ANALYSIS:')
    print()
    print(f"Model Predictions ({len(model_preds)} games):")
    print(f"   Minimum: {min(model_preds):.1f}")
    print(f"   Maximum: {max(model_preds):.1f}")
    print(f"   Average: {sum(model_preds)/len(model_preds):.1f}")
    print(f"   Range: {max(model_preds) - min(model_preds):.1f} points")
    print(f"   Std Dev: {(sum((x - sum(model_preds)/len(model_preds))**2 for x in model_preds)/len(model_preds))**0.5:.1f}")
    print()
    
    if vegas_preds:
        print(f"Vegas Lines ({len(vegas_preds)} games):")
        print(f"   Minimum: {min(vegas_preds):.1f}")
        print(f"   Maximum: {max(vegas_preds):.1f}")
        print(f"   Average: {sum(vegas_preds)/len(vegas_preds):.1f}")
        print(f"   Range: {max(vegas_preds) - min(vegas_preds):.1f} points")
        print()
    
    # Check for clustering
    avg = sum(model_preds) / len(model_preds)
    within_5 = sum(1 for p in model_preds if abs(p - avg) <= 5)
    within_3 = sum(1 for p in model_preds if abs(p - avg) <= 3)
    
    print(f"Clustering Analysis:")
    print(f"   Within 3 points of average: {within_3}/{len(model_preds)} ({100*within_3/len(model_preds):.0f}%)")
    print(f"   Within 5 points of average: {within_5}/{len(model_preds)} ({100*within_5/len(model_preds):.0f}%)")
    
    if within_5 == len(model_preds) and len(model_preds) >= 3:
        print()
        print("   WARNING: ALL predictions within 5 points - potential issue!")
    
else:
    print('No predictions found')
