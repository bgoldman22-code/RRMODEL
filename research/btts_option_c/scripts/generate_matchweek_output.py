"""
Generate Matchweek Output with V2.0 Schema

Demonstrates the new production output schema that ALWAYS includes:
- Model belief (recommended side + confidence)
- Ranking signals (for sortability)
- Betting decision (pure edge-based)
- Suggested action (human-readable)

This script shows how to generate CSV/JSON outputs for match week predictions
that integrate seamlessly with UI dashboards and API endpoints.

Author: Co-CTO
Date: December 12, 2025
"""

import sys
import pandas as pd
import json
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from production_decision import select_btts_bet_for_match


def generate_example_matchweek_output():
    """
    Generate example matchweek output with V2.0 schema.
    
    Shows 5 synthetic matches with various scenarios:
    1. High confidence BET YES
    2. Model lean YES but NO_BET (insufficient edge)
    3. Model lean NO with BET NO
    4. Near 50/50 model but high edge opportunity
    5. No odds available (but model lean still returned)
    """
    
    print("\n" + "="*80)
    print("MATCHWEEK OUTPUT GENERATION - V2.0 SCHEMA DEMONSTRATION")
    print("="*80)
    
    # Example matches (synthetic data for demonstration)
    matches = [
        {
            'fixture_id': 12345,
            'date': '2025-12-15',
            'home': 'Arsenal',
            'away': 'Chelsea',
            'league': 'Premier League',
            'prob_yes': 0.72,
            'odds_yes': 2.50,
            'odds_no': 1.70
        },
        {
            'fixture_id': 12346,
            'date': '2025-12-15',
            'home': 'Liverpool',
            'away': 'Man City',
            'league': 'Premier League',
            'prob_yes': 0.68,
            'odds_yes': 1.90,
            'odds_no': 2.00
        },
        {
            'fixture_id': 12347,
            'date': '2025-12-15',
            'home': 'Brighton',
            'away': 'Everton',
            'league': 'Premier League',
            'prob_yes': 0.32,
            'odds_yes': 2.30,
            'odds_no': 1.70
        },
        {
            'fixture_id': 12348,
            'date': '2025-12-15',
            'home': 'Wolves',
            'away': 'Burnley',
            'league': 'Premier League',
            'prob_yes': 0.48,
            'odds_yes': 3.50,
            'odds_no': 1.35
        },
        {
            'fixture_id': 12349,
            'date': '2025-12-15',
            'home': 'Fulham',
            'away': 'Newcastle',
            'league': 'Premier League',
            'prob_yes': 0.65,
            'odds_yes': None,  # No odds available
            'odds_no': None
        }
    ]
    
    # Process each match
    results = []
    for match in matches:
        decision = select_btts_bet_for_match(
            prob_yes=match['prob_yes'],
            odds_yes=match['odds_yes'],
            odds_no=match['odds_no']
        )
        
        # Combine match info with decision output
        output_row = {
            # Match identification
            'fixture_id': match['fixture_id'],
            'date': match['date'],
            'home': match['home'],
            'away': match['away'],
            'league': match['league'],
            
            # Model belief (ALWAYS PRESENT)
            'prob_yes': decision['prob_yes'],
            'prob_no': decision['prob_no'],
            'model_recommended_side': decision['model_recommended_side'],
            'model_confidence': decision['model_confidence'],
            
            # Market data (if odds available)
            'odds_yes': match['odds_yes'],
            'odds_no': match['odds_no'],
            'fair_prob_yes': decision['fair_prob_yes'],
            'fair_prob_no': decision['fair_prob_no'],
            'edge_yes': decision['edge_yes'],
            'edge_no': decision['edge_no'],
            'vig': decision['vig'],
            
            # Ranking signals (ALWAYS PRESENT if odds available)
            'ranking_score': decision['ranking_score'],
            'ranking_edge_best': decision['ranking_edge_best'],
            'ranking_edge_abs': decision['ranking_edge_abs'],
            
            # Betting decision
            'bet_side': decision['side'],
            'chosen_edge': decision['chosen_edge'],
            'confidence': decision['confidence'],
            'bet_size_multiplier': decision['bet_size_multiplier'],
            'reason': decision['reason'],
            
            # Suggested action (ALWAYS PRESENT)
            'suggested_side': decision['suggested_side'],
            'suggested_reason': decision['suggested_reason']
        }
        
        results.append(output_row)
    
    # Convert to DataFrame
    df = pd.DataFrame(results)
    
    # Display results
    print("\n📊 MATCHWEEK PREDICTIONS (V2.0 Schema)")
    print("="*80)
    
    for i, row in df.iterrows():
        print(f"\n🏟  Match {i+1}: {row['home']} vs {row['away']}")
        print(f"   Date: {row['date']} | League: {row['league']}")
        print(f"   ---")
        print(f"   Model Belief:")
        print(f"      Recommended: {row['model_recommended_side']} (confidence: {row['model_confidence']:.1%})")
        print(f"      P(BTTS): {row['prob_yes']:.3f}")
        
        if row['odds_yes'] is not None:
            print(f"   Market Data:")
            print(f"      YES odds: {row['odds_yes']:.2f}, NO odds: {row['odds_no']:.2f}")
            print(f"      Vig: {row['vig']:.3f}")
            print(f"      Edge YES: {row['edge_yes']:+.3f}, Edge NO: {row['edge_no']:+.3f}")
            print(f"   Ranking:")
            print(f"      Score: {row['ranking_score']:+.4f}")
        else:
            print(f"   Market Data: No odds available")
        
        print(f"   Betting Decision:")
        print(f"      Action: {row['bet_side']}")
        if row['bet_side'] != 'NO_BET':
            print(f"      Edge: {row['chosen_edge']:+.3f}")
            print(f"      Bet size: {row['bet_size_multiplier']:.1f}x")
        else:
            print(f"      Reason: {row['reason']}")
        
        print(f"   Suggested:")
        print(f"      Side: {row['suggested_side']}")
        print(f"      Reason: {row['suggested_reason']}")
    
    # Save to CSV
    csv_path = Path(__file__).parent.parent / 'results' / 'matchweek_example_v2.csv'
    csv_path.parent.mkdir(exist_ok=True, parents=True)
    df.to_csv(csv_path, index=False)
    print(f"\n💾 Saved CSV: {csv_path}")
    
    # Save to JSON (for API)
    json_output = []
    for _, row in df.iterrows():
        match_json = {
            'fixture': {
                'id': int(row['fixture_id']),
                'date': row['date'],
                'home': row['home'],
                'away': row['away'],
                'league': row['league']
            },
            'model': {
                'prob_yes': round(float(row['prob_yes']), 4),
                'prob_no': round(float(row['prob_no']), 4),
                'recommended_side': row['model_recommended_side'],
                'confidence': round(float(row['model_confidence']), 4)
            },
            'market': {
                'odds_yes': float(row['odds_yes']) if pd.notna(row['odds_yes']) else None,
                'odds_no': float(row['odds_no']) if pd.notna(row['odds_no']) else None,
                'fair_prob_yes': float(row['fair_prob_yes']) if pd.notna(row['fair_prob_yes']) else None,
                'fair_prob_no': float(row['fair_prob_no']) if pd.notna(row['fair_prob_no']) else None,
                'edge_yes': float(row['edge_yes']) if pd.notna(row['edge_yes']) else None,
                'edge_no': float(row['edge_no']) if pd.notna(row['edge_no']) else None,
                'vig': float(row['vig']) if pd.notna(row['vig']) else None
            },
            'ranking': {
                'score': float(row['ranking_score']) if pd.notna(row['ranking_score']) else None,
                'edge_best': float(row['ranking_edge_best']) if pd.notna(row['ranking_edge_best']) else None,
                'edge_abs': float(row['ranking_edge_abs']) if pd.notna(row['ranking_edge_abs']) else None
            },
            'betting': {
                'side': row['bet_side'],
                'chosen_edge': float(row['chosen_edge']) if pd.notna(row['chosen_edge']) else None,
                'confidence': row['confidence'],
                'bet_size_multiplier': float(row['bet_size_multiplier']),
                'reason': row['reason']
            },
            'suggested': {
                'side': row['suggested_side'],
                'reason': row['suggested_reason']
            }
        }
        json_output.append(match_json)
    
    json_path = Path(__file__).parent.parent / 'results' / 'matchweek_example_v2.json'
    with open(json_path, 'w') as f:
        json.dump(json_output, f, indent=2)
    print(f"💾 Saved JSON: {json_path}")
    
    # Print schema summary
    print("\n" + "="*80)
    print("📋 OUTPUT SCHEMA SUMMARY")
    print("="*80)
    print("\nCSV Columns (26 total):")
    print("   Match Info: fixture_id, date, home, away, league")
    print("   Model Belief: prob_yes, prob_no, model_recommended_side, model_confidence")
    print("   Market Data: odds_yes, odds_no, fair_prob_yes, fair_prob_no, edge_yes, edge_no, vig")
    print("   Ranking: ranking_score, ranking_edge_best, ranking_edge_abs")
    print("   Betting: bet_side, chosen_edge, confidence, bet_size_multiplier, reason")
    print("   Suggested: suggested_side, suggested_reason")
    
    print("\nJSON Structure:")
    print("   • fixture{} - Match identification")
    print("   • model{} - Model belief (ALWAYS present)")
    print("   • market{} - Odds and edges (null if no odds)")
    print("   • ranking{} - Sortability scores (null if no odds)")
    print("   • betting{} - Bet decision (pure edge-based)")
    print("   • suggested{} - Human-readable suggestion (ALWAYS present)")
    
    print("\n" + "="*80)
    print("✅ MATCHWEEK OUTPUT GENERATION COMPLETE")
    print("="*80)
    print("\nKey Features:")
    print("   ✅ Model lean ALWAYS returned (even when NO_BET)")
    print("   ✅ Ranking signals enable sortability")
    print("   ✅ Pure edge-based betting (MIN_EDGE=0.0775)")
    print("   ✅ Suggested action with human-readable reason")
    print("   ✅ JSON format ready for API integration")
    print("   ✅ CSV format ready for dashboard consumption")
    
    return df, json_output


if __name__ == '__main__':
    df, json_output = generate_example_matchweek_output()
    
    print("\n📌 Example JSON Output (Match 1):")
    print(json.dumps(json_output[0], indent=2))
