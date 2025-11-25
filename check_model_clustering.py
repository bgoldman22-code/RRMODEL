#!/usr/bin/env python3
"""
Check if model predictions clustering around 228.5 is normal
"""

import requests
import json

url = "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite-v2"

try:
    response = requests.get(url, timeout=30)
    data = response.json()
    
    print("=" * 70)
    print("MODEL PREDICTION CLUSTERING ANALYSIS")
    print("=" * 70)
    print()
    
    predictions = []
    
    for pred in data.get('predictions', []):
        game = pred.get('game', 'Unknown')
        
        # Get model prediction from opportunities
        model_total = None
        vegas_total = None
        
        for opp in pred.get('opportunities', []):
            if opp.get('market') == 'Total':
                model_total = float(opp.get('modelLine', 0))
                vegas_total = float(opp.get('vegasLine', 0))
                break
        
        # If no total bet, try to get from vegas lines
        if model_total is None:
            vegas_lines = pred.get('vegasLines', {})
            total_line = vegas_lines.get('total', {})
            if total_line:
                vegas_total = total_line.get('fair', {}).get('line')
                # We'd need to calculate model prediction - check prediction object
                pred_obj = pred.get('prediction', {})
                home_pts = pred_obj.get('home', {}).get('points')
                away_pts = pred_obj.get('away', {}).get('points')
                if home_pts and away_pts:
                    model_total = home_pts + away_pts
        
        if model_total:
            predictions.append({
                'game': game,
                'model': model_total,
                'vegas': vegas_total
            })
    
    if predictions:
        print(f"Games analyzed: {len(predictions)}")
        print()
        
        model_preds = [p['model'] for p in predictions]
        avg_model = sum(model_preds) / len(model_preds)
        min_model = min(model_preds)
        max_model = max(model_preds)
        range_model = max_model - min_model
        
        print("MODEL PREDICTIONS:")
        for p in predictions:
            vegas_str = f" (Vegas: {p['vegas']})" if p['vegas'] else ""
            print(f"  {p['game']}: {p['model']:.1f}{vegas_str}")
        
        print()
        print(f"Average: {avg_model:.1f}")
        print(f"Range: {min_model:.1f} - {max_model:.1f} (spread: {range_model:.1f} points)")
        print()
        
        # Check if clustering is concerning
        print("=" * 70)
        print("ANALYSIS:")
        print()
        
        if range_model < 5:
            print("⚠️ VERY TIGHT CLUSTERING (<5 point range)")
            print("   This could indicate:")
            print("   • Model is regressing to mean too much")
            print("   • Features aren't differentiating between games")
            print("   • Possible bug in feature calculation")
        elif range_model < 10:
            print("⚠️ MODERATE CLUSTERING (5-10 point range)")
            print("   This is somewhat unusual but could be due to:")
            print("   • Similar team strengths today")
            print("   • League-wide offensive/defensive balance")
            print("   • Model working as designed for these matchups")
        else:
            print("✅ NORMAL VARIANCE (>10 point range)")
            print("   Model is differentiating between games appropriately")
        
        print()
        print("CONTEXT:")
        print(f"  NBA average total: ~225-230 points")
        print(f"  Today's model average: {avg_model:.1f}")
        print(f"  This is {'NORMAL' if 220 < avg_model < 235 else 'UNUSUAL'}")
        
        # Check if Vegas also clustering
        vegas_preds = [p['vegas'] for p in predictions if p['vegas']]
        if vegas_preds:
            avg_vegas = sum(vegas_preds) / len(vegas_preds)
            range_vegas = max(vegas_preds) - min(vegas_preds)
            print()
            print(f"  Vegas average: {avg_vegas:.1f}")
            print(f"  Vegas range: {range_vegas:.1f} points")
            print()
            
            if range_vegas < 10 and range_model < 10:
                print("📊 Both model AND Vegas are clustering")
                print("   → This suggests the GAMES today are similar")
                print("   → NOT a model problem, just today's slate")
            elif range_model < range_vegas / 2:
                print("⚠️ Model clustering MORE than Vegas")
                print("   → Model may not be sensitive enough to matchups")
                print("   → Worth investigating feature importance")
            else:
                print("✅ Model variance similar to market")
                print("   → Model is appropriately sensitive")
        
    else:
        print("❌ Could not extract model predictions")
        print("   Check API response structure")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
