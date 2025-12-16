#!/usr/bin/env python3
"""
predict_upcoming_matchweek.py

Generate BTTS predictions for upcoming match week (12/12/25 - 12/15/25)
using the validated Poisson model from walk-forward audit.

Based on audit results:
  YES @ 0.60: 81% win rate, +38% fair ROI ⭐ OPTIMAL
  YES @ 0.65: 82% win rate, +37% fair ROI
  NO @ 0.60: 63% win rate, +28% fair ROI
  NO @ 0.65: 65% win rate, +29% fair ROI ⭐ OPTIMAL
"""

import sys
from pathlib import Path
import pandas as pd
import numpy as np
from datetime import datetime

# Add src to path
RESEARCH_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(RESEARCH_DIR))

from src.load_data import load_unified_data
from src.build_features import add_rolling_form_features, add_match_level_features, add_form_trend_features
from src.model_baselines import fit_poisson, predict_poisson


def build_features(df):
    """Apply feature engineering"""
    df = add_rolling_form_features(df, windows=[5, 10])
    df = add_match_level_features(df)
    df = add_form_trend_features(df)
    return df


def generate_predictions():
    """Generate BTTS predictions for upcoming matches"""
    
    print("\n" + "="*80)
    print("BTTS PREDICTIONS - MATCH WEEK 12/12/25 - 12/15/25".center(80))
    print("="*80)
    print("\nModel: Poisson (validated in walk-forward audit)")
    print("Optimal Thresholds:")
    print("  • YES bets: P(BTTS) ≥ 0.60 (81% win rate, +38% fair ROI)")
    print("  • NO bets: P(NO BTTS) ≥ 0.65 (65% win rate, +29% fair ROI)")
    
    # Load data
    print("\n" + "="*80)
    print("STEP 1: LOADING DATA")
    print("="*80)
    df = load_unified_data()
    print(f"✅ Loaded {len(df)} historical matches")
    
    # Build features
    print("\n" + "="*80)
    print("STEP 2: BUILDING FEATURES")
    print("="*80)
    df = build_features(df)
    df = df.dropna(subset=['btts', 'home_xg', 'away_xg'])
    print(f"✅ Feature engineering complete: {len(df)} matches ready")
    
    # Train model on all available data
    print("\n" + "="*80)
    print("STEP 3: TRAINING POISSON MODEL")
    print("="*80)
    print("Training on full dataset (most recent data for best predictions)...")
    model = fit_poisson(df)
    print("✅ Model trained")
    
    # Filter to upcoming matches (12/12/25 - 12/15/25)
    print("\n" + "="*80)
    print("STEP 4: IDENTIFYING UPCOMING MATCHES")
    print("="*80)
    
    df['date'] = pd.to_datetime(df['date'])
    target_start = pd.to_datetime('2025-12-12')
    target_end = pd.to_datetime('2025-12-15')
    
    upcoming = df[(df['date'] >= target_start) & (df['date'] <= target_end)].copy()
    
    if len(upcoming) == 0:
        print(f"⚠️  No matches found in date range {target_start.date()} to {target_end.date()}")
        print(f"\nLatest match in dataset: {df['date'].max().date()}")
        print(f"Note: Dataset may not include future fixtures yet.")
        print(f"\nTo get predictions for future matches:")
        print(f"  1. Update data collection to include scheduled fixtures")
        print(f"  2. Ensure fixtures have team names and expected xG estimates")
        print(f"  3. Re-run this script")
        return
    
    print(f"✅ Found {len(upcoming)} matches in target window")
    print(f"   Date range: {upcoming['date'].min().date()} to {upcoming['date'].max().date()}")
    
    # Generate predictions
    print("\n" + "="*80)
    print("STEP 5: GENERATING PREDICTIONS")
    print("="*80)
    
    y_proba = predict_poisson(model, upcoming)
    upcoming['p_btts_yes'] = y_proba
    upcoming['p_btts_no'] = 1.0 - y_proba
    
    # Apply optimal thresholds from audit
    upcoming['bet_yes'] = upcoming['p_btts_yes'] >= 0.60
    upcoming['bet_no'] = upcoming['p_btts_no'] >= 0.65
    
    # Confidence levels
    def get_confidence(prob, threshold):
        """Convert probability to confidence level"""
        if prob < threshold:
            return "NO BET"
        elif prob < threshold + 0.05:
            return "LOW"
        elif prob < threshold + 0.10:
            return "MEDIUM"
        elif prob < threshold + 0.15:
            return "HIGH"
        else:
            return "VERY HIGH"
    
    upcoming['yes_confidence'] = upcoming.apply(
        lambda r: get_confidence(r['p_btts_yes'], 0.60) if r['bet_yes'] else "NO BET",
        axis=1
    )
    
    upcoming['no_confidence'] = upcoming.apply(
        lambda r: get_confidence(r['p_btts_no'], 0.65) if r['bet_no'] else "NO BET",
        axis=1
    )
    
    # Display results
    print("\n" + "="*80)
    print("PREDICTIONS FOR MATCH WEEK 12/12/25 - 12/15/25".center(80))
    print("="*80)
    
    # YES bets
    yes_bets = upcoming[upcoming['bet_yes']].copy()
    if len(yes_bets) > 0:
        print("\n🟢 BTTS YES BETS (Bet on BOTH teams to score)")
        print("-" * 80)
        yes_bets = yes_bets.sort_values('p_btts_yes', ascending=False)
        
        for idx, row in yes_bets.iterrows():
            print(f"\n📅 {row['date'].strftime('%Y-%m-%d')} | {row['league'] if 'league' in row else 'N/A'}")
            print(f"   {row['home_norm']} vs {row['away_norm']}")
            print(f"   P(BTTS YES): {row['p_btts_yes']:.1%}")
            print(f"   Confidence: {row['yes_confidence']}")
            if 'btts_yes_odds' in row and not pd.isna(row['btts_yes_odds']):
                print(f"   Market odds: {row['btts_yes_odds']:.2f}")
                implied_prob = 1.0 / row['btts_yes_odds']
                edge = row['p_btts_yes'] - implied_prob
                print(f"   Estimated edge: {edge:+.1%}")
    else:
        print("\n⚠️  No BTTS YES bets meet threshold (P(BTTS) ≥ 0.60)")
    
    # NO bets
    no_bets = upcoming[upcoming['bet_no']].copy()
    if len(no_bets) > 0:
        print("\n\n🔴 BTTS NO BETS (Bet on at least ONE team NOT to score)")
        print("-" * 80)
        no_bets = no_bets.sort_values('p_btts_no', ascending=False)
        
        for idx, row in no_bets.iterrows():
            print(f"\n📅 {row['date'].strftime('%Y-%m-%d')} | {row['league'] if 'league' in row else 'N/A'}")
            print(f"   {row['home_norm']} vs {row['away_norm']}")
            print(f"   P(BTTS NO): {row['p_btts_no']:.1%}")
            print(f"   Confidence: {row['no_confidence']}")
            if 'btts_no_odds' in row and not pd.isna(row['btts_no_odds']):
                print(f"   Market odds: {row['btts_no_odds']:.2f}")
                implied_prob = 1.0 / row['btts_no_odds']
                edge = row['p_btts_no'] - implied_prob
                print(f"   Estimated edge: {edge:+.1%}")
    else:
        print("\n⚠️  No BTTS NO bets meet threshold (P(NO BTTS) ≥ 0.65)")
    
    # Summary
    print("\n\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Total matches analyzed: {len(upcoming)}")
    print(f"BTTS YES bets: {len(yes_bets)}")
    print(f"BTTS NO bets: {len(no_bets)}")
    print(f"No bet: {len(upcoming) - len(yes_bets) - len(no_bets)}")
    
    if len(yes_bets) > 0 or len(no_bets) > 0:
        print("\n📊 Expected Performance (based on walk-forward audit):")
        if len(yes_bets) > 0:
            print(f"  • YES bets: ~81% win rate, ~+38% fair ROI")
        if len(no_bets) > 0:
            print(f"  • NO bets: ~65% win rate, ~+29% fair ROI")
    
    print("\n" + "="*80)
    print("CONFIDENCE LEVEL GUIDE")
    print("="*80)
    print("NO BET     : Below threshold, skip")
    print("LOW        : Just above threshold (0.60-0.65 for YES, 0.65-0.70 for NO)")
    print("MEDIUM     : Moderate confidence (0.65-0.70 for YES, 0.70-0.75 for NO)")
    print("HIGH       : Strong confidence (0.70-0.75 for YES, 0.75-0.80 for NO)")
    print("VERY HIGH  : Very strong confidence (0.75+ for YES, 0.80+ for NO)")
    
    print("\n" + "="*80)
    print("DISCLAIMER")
    print("="*80)
    print("These predictions are for informational purposes only.")
    print("Past performance (81% YES, 65% NO) does not guarantee future results.")
    print("Always bet responsibly and within your means.")
    print("="*80)
    
    # Save to CSV
    results_dir = RESEARCH_DIR / 'results'
    results_dir.mkdir(exist_ok=True)
    
    output_file = results_dir / 'upcoming_matchweek_predictions.csv'
    upcoming[['date', 'league', 'home_norm', 'away_norm', 
              'p_btts_yes', 'p_btts_no', 'bet_yes', 'bet_no',
              'yes_confidence', 'no_confidence']].to_csv(output_file, index=False)
    
    print(f"\n✅ Predictions saved to: {output_file}")


if __name__ == '__main__':
    generate_predictions()
