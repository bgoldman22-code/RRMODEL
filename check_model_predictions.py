#!/usr/bin/env python3
"""Check if model predictions are clustering around same value"""

import requests
import json

url = "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite-v2"

try:
    response = requests.get(url, timeout=30)
    data = response.json()
    
    print("=" * 70)
    print("MODEL PREDICTION ANALYSIS")
    print("=" * 70)
    print()
    
    model_totals = []
    vegas_totals = []
    
    for pred in data.get('predictions', []):
        game = pred.get('game', 'Unknown')
        
        # Get model total from opportunities if it exists
        for opp in pred.get('opportunities', []):
            if opp.get('market') == 'Total':
                model_line = float(opp.get('modelLine', 0))
                vegas_line = float(opp.get('vegasLine', 0))
                model_totals.append(model_line)
                vegas_totals.append(vegas_line)
                
                print(f"Game: {game}")
                print(f"  Model: {model_line:.1f}")
                print(f"  Vegas: {vegas_line:.1f}")
                print(f"  Diff:  {abs(model_line - vegas_line):.1f}")
                print()
        
        # Also check prediction object for total prediction
        prediction = pred.get('prediction', {})
        if 'total' in prediction:
            total_pred = prediction.get('total')
            if total_pred and game not in [g for g in model_totals]:
                print(f"Game: {game}")
                print(f"  Model Total: {total_pred:.1f}")
                print()
    
    if model_totals:
        print("=" * 70)
        print("SUMMARY:")
        print(f"  Games analyzed: {len(model_totals)}")
        print(f"  Model predictions: {[f'{x:.1f}' for x in model_totals]}")
        print(f"  Vegas lines:       {[f'{x:.1f}' for x in vegas_totals]}")
        print()
        print(f"  Model average: {sum(model_totals)/len(model_totals):.1f}")
        print(f"  Model range: {min(model_totals):.1f} - {max(model_totals):.1f}")
        print(f"  Model std dev: {(sum([(x-sum(model_totals)/len(model_totals))**2 for x in model_totals])/len(model_totals))**0.5:.1f}")
        print()
        print(f"  Vegas average: {sum(vegas_totals)/len(vegas_totals):.1f}")
        print(f"  Vegas range: {min(vegas_totals):.1f} - {max(vegas_totals):.1f}")
        print()
        
        if max(model_totals) - min(model_totals) < 5:
            print("⚠️  WARNING: Model predictions are very clustered!")
            print("   Range is < 5 points - this is unusual")
            print()
            print("   Possible causes:")
            print("   1. All teams have similar offensive/defensive ratings today")
            print("   2. Model is stuck/not updating properly")
            print("   3. Small sample (only 3 games)")
        else:
            print("✅ Model predictions show normal variance")
    
except Exception as e:
    print(f"Error: {e}")
