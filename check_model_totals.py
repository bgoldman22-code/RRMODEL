#!/usr/bin/env python3
"""Check if model total predictions clustering around 228.5 is concerning"""

import requests
import json

url = "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite-v2"

print("Fetching predictions...")
response = requests.get(url, timeout=30)
data = response.json()

print("\n" + "="*70)
print("MODEL TOTAL PREDICTIONS ANALYSIS")
print("="*70 + "\n")

model_totals = []
vegas_totals = []

for pred in data.get('predictions', []):
    game = pred.get('game', 'Unknown')
    
    # Get model's total prediction from the prediction object
    prediction_obj = pred.get('prediction', {})
    total_pred = prediction_obj.get('total')
    
    # Get Vegas total from vegasLines
    vegas_lines = pred.get('vegasLines', {})
    total_line = vegas_lines.get('total', {}).get('fair', {}).get('line')
    
    if total_pred and total_line:
        model_totals.append(total_pred)
        vegas_totals.append(total_line)
        
        diff = total_pred - total_line
        print(f"Game: {game}")
        print(f"  Model: {total_pred:.1f}")
        print(f"  Vegas: {total_line}")
        print(f"  Diff: {diff:+.1f}")
        print()

if model_totals:
    print("="*70)
    print("SUMMARY STATISTICS")
    print("="*70)
    print(f"\nModel Predictions:")
    print(f"  Range: {min(model_totals):.1f} - {max(model_totals):.1f}")
    print(f"  Average: {sum(model_totals)/len(model_totals):.1f}")
    print(f"  Std Dev: {(sum((x - sum(model_totals)/len(model_totals))**2 for x in model_totals) / len(model_totals))**0.5:.1f}")
    
    print(f"\nVegas Lines:")
    print(f"  Range: {min(vegas_totals):.1f} - {max(vegas_totals):.1f}")
    print(f"  Average: {sum(vegas_totals)/len(vegas_totals):.1f}")
    print(f"  Std Dev: {(sum((x - sum(vegas_totals)/len(vegas_totals))**2 for x in vegas_totals) / len(vegas_totals))**0.5:.1f}")
    
    print(f"\nDifferences:")
    diffs = [m - v for m, v in zip(model_totals, vegas_totals)]
    print(f"  Average: {sum(diffs)/len(diffs):+.1f}")
    print(f"  Std Dev: {(sum((x - sum(diffs)/len(diffs))**2 for x in diffs) / len(diffs))**0.5:.1f}")
    
    print("\n" + "="*70)
    print("VERDICT:")
    print("="*70)
    
    model_std = (sum((x - sum(model_totals)/len(model_totals))**2 for x in model_totals) / len(model_totals))**0.5
    vegas_std = (sum((x - sum(vegas_totals)/len(vegas_totals))**2 for x in vegas_totals) / len(vegas_totals))**0.5
    
    if model_std < 3:
        print("\n⚠️  WARNING: Model predictions are clustering!")
        print(f"   Standard deviation: {model_std:.1f} (very low)")
        print("   This suggests the model may be regressing to the mean")
        print("   Expected std dev: 8-12 points for NBA totals")
    elif model_std < vegas_std * 0.5:
        print("\n⚠️  CAUTION: Model less variable than Vegas")
        print(f"   Model std: {model_std:.1f}, Vegas std: {vegas_std:.1f}")
        print("   Model may be overly conservative")
    else:
        print("\n✅ Model variability looks normal")
        print(f"   Model std: {model_std:.1f}, Vegas std: {vegas_std:.1f}")
        print("   Model is showing appropriate variation")
    
    # Check if today's games just happen to be similar
    if vegas_std < 5:
        print("\n📊 NOTE: Today's Vegas lines are also clustered")
        print(f"   Vegas std dev: {vegas_std:.1f}")
        print("   Games today may just have similar expected totals")
        print("   This is NOT a model problem - it's the matchups")
