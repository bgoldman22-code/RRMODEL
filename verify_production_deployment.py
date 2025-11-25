#!/usr/bin/env python3
"""
Verify NBA Totals Production Deployment
Checks if new model (OVERS + high-edge UNDERS only) is deployed
"""

import requests
import json
from datetime import datetime

def verify_deployment():
    print("🎯 NBA TOTALS PRODUCTION DEPLOYMENT VERIFICATION")
    print("=" * 70)
    
    url = "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite-v2"
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        print(f"✅ API Response: {response.status_code}")
        print(f"📅 Generated: {data.get('generated', 'Unknown')}")
        print(f"🎮 Games analyzed: {len(data.get('predictions', []))}")
        print()
        
        # Extract total bets
        total_bets = []
        all_picks = []
        
        for pred in data.get('predictions', []):
            game_str = pred.get('game', 'Unknown Game')
            opps = pred.get('opportunities', [])
            
            for opp in opps:
                market = opp.get('market', 'Unknown')
                all_picks.append(market)
                
                if market == 'Total':
                    total_bets.append({
                        'game': game_str,
                        'pick': opp.get('pick'),
                        'edge': float(opp.get('edge', 0)),
                        'modelLine': opp.get('modelLine'),
                        'vegasLine': opp.get('vegasLine')
                    })
        
        print("📊 BETTING OPPORTUNITIES:")
        print(f"   Total bets: {sum(1 for p in all_picks if p == 'Total')}")
        print(f"   Spread bets: {sum(1 for p in all_picks if p == 'Spread')}")
        print(f"   ML bets: {sum(1 for p in all_picks if p == 'Moneyline')}")
        print()
        
        if total_bets:
            print("🔍 TOTAL BETS ANALYSIS:")
            print()
            
            overs = [b for b in total_bets if 'Over' in b['pick']]
            unders = [b for b in total_bets if 'Under' in b['pick']]
            
            print(f"   OVERS: {len(overs)}")
            print(f"   UNDERS: {len(unders)}")
            print()
            
            # Check UNDERS for edge threshold
            if unders:
                print("   📋 UNDER BETS DETAIL:")
                for bet in unders:
                    print(f"      Game: {bet['game']}")
                    print(f"      Pick: {bet['pick']}")
                    print(f"      Edge: {bet['edge']:.1f} points")
                    print(f"      Model: {bet['modelLine']}, Vegas: {bet['vegasLine']}")
                    
                    if bet['edge'] >= 6.5:
                        print(f"      ✅ HIGH-EDGE UNDER (≥6.5) - NEW MODEL!")
                    else:
                        print(f"      ❌ LOW-EDGE UNDER (<6.5) - OLD MODEL!")
                    print()
            
            if overs:
                print("   📋 OVER BETS DETAIL:")
                for bet in overs:
                    print(f"      Game: {bet['game']}")
                    print(f"      Pick: {bet['pick']}")
                    print(f"      Edge: {bet['edge']:.1f} points")
                    print()
            
            # Verdict
            print()
            print("=" * 70)
            print("DEPLOYMENT VERDICT:")
            print()
            
            low_edge_unders = [b for b in unders if b['edge'] < 6.5]
            high_edge_unders = [b for b in unders if b['edge'] >= 6.5]
            
            if low_edge_unders:
                print("❌ OLD MODEL STILL ACTIVE")
                print("   Found UNDER(s) with edge < 6.5 (should be filtered)")
                print("   Check Netlify deployment status!")
            elif high_edge_unders:
                print("✅ NEW MODEL SUCCESSFULLY DEPLOYED!")
                print(f"   Found {len(high_edge_unders)} high-edge UNDER(s) with edge ≥ 6.5")
                print("   Filter is working correctly!")
            elif overs and not unders:
                print("✅ NEW MODEL LIKELY DEPLOYED")
                print("   Only OVERS found (no UNDERS = filter working)")
                print("   This is expected behavior!")
            else:
                print("⚠️ INCONCLUSIVE")
                print("   No characteristic bets found to verify")
        else:
            print("ℹ️ NO TOTAL BETS TODAY")
            print()
            print("This is normal if:")
            print("  • No games have 4+ point edge on totals")
            print("  • All UNDERS have edge < 6.5 (filtered out)")
            print()
            print("To verify deployment, check:")
            print("  1. Netlify deployment logs (should show recent deploy)")
            print("  2. Wait for games with strong total edges")
            print("  3. Look for HIGH-EDGE UNDERS (6.5+) when they appear")
        
    except requests.RequestException as e:
        print(f"❌ Error fetching predictions: {e}")
        return False
    
    print()
    print("=" * 70)
    print(f"Verification completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    return True

if __name__ == "__main__":
    verify_deployment()
