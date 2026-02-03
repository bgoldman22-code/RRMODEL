#!/usr/bin/env python3
"""
BTTS NO Betting Backtest
========================
Quick sanity check to see if betting on BTTS NO with edge thresholds is profitable.

Uses Poisson probability calculation directly (no model loading needed).
"""

import pandas as pd
import numpy as np
from pathlib import Path
from scipy.stats import poisson


def calculate_btts_probability(home_xg: float, away_xg: float) -> float:
    """
    Calculate BTTS YES probability using bivariate Poisson.
    
    P(BTTS) = 1 - P(home=0) - P(away=0) + P(home=0)*P(away=0)
    """
    # Poisson probability of scoring 0 goals
    p_home_zero = poisson.pmf(0, home_xg)
    p_away_zero = poisson.pmf(0, away_xg)
    
    # Independence assumption for bivariate Poisson
    p_both_zero = p_home_zero * p_away_zero
    
    # P(BTTS YES) = 1 - P(at least one clean sheet)
    p_btts_yes = 1 - p_home_zero - p_away_zero + p_both_zero
    
    return p_btts_yes


def shin_devig(odds_yes: float, odds_no: float) -> tuple:
    """Shin de-vig for two-way market"""
    if odds_yes <= 1.0 or odds_no <= 1.0:
        return 0.5, 0.5, 0.0
    
    inv_yes = 1 / odds_yes
    inv_no = 1 / odds_no
    margin = inv_yes + inv_no - 1.0
    
    if margin < 0.001:
        total = inv_yes + inv_no
        return inv_yes / total, inv_no / total, margin
    
    # Shin additive
    p_yes = inv_yes - (margin * inv_yes / (inv_yes + inv_no))
    p_no = inv_no - (margin * inv_no / (inv_yes + inv_no))
    total = p_yes + p_no
    
    return p_yes / total, p_no / total, margin


def run_backtest():
    print("=" * 70)
    print("BTTS NO BETTING BACKTEST")
    print("=" * 70)
    
    # Load data
    data_path = Path(__file__).parent.parent / "data" / "btts_leakfree_features.parquet"
    df = pd.read_parquet(data_path)
    print(f"\n📊 Loaded {len(df)} matches")
    print(f"   Seasons: {df['season'].unique().tolist()}")
    
    # Filter to matches with odds
    df_with_odds = df.dropna(subset=['btts_yes_odds', 'btts_no_odds'])
    print(f"\n📊 Matches with odds: {len(df_with_odds)}")
    
    # Prepare features for prediction
    # The model expects home_xg and away_xg
    feature_cols = ['home_xg', 'away_xg']
    
    # Check if we have the features
    if 'home_xg' not in df_with_odds.columns:
        print("❌ Missing home_xg column")
        print(f"   Available columns: {list(df_with_odds.columns)}")
        return
    
    # Drop rows with missing xG
    df_valid = df_with_odds.dropna(subset=feature_cols).copy()
    print(f"   Matches with xG data: {len(df_valid)}")
    
    # Generate predictions using Poisson directly
    print("\n🔮 Generating BTTS predictions using Poisson model...")
    df_valid['p_yes'] = df_valid.apply(
        lambda row: calculate_btts_probability(row['home_xg'], row['away_xg']),
        axis=1
    )
    df_valid['p_no'] = 1 - df_valid['p_yes']
    print(f"✅ Generated predictions for {len(df_valid)} matches")
    
    # Calculate implied probabilities and edges
    results = []
    
    for idx, row in df_valid.iterrows():
        odds_yes = row['btts_yes_odds']
        odds_no = row['btts_no_odds']
        
        # Shin de-vig
        imp_yes, imp_no, margin = shin_devig(odds_yes, odds_no)
        
        # Model probabilities
        model_p_yes = row['p_yes']
        model_p_no = row['p_no']
        
        # Edges
        edge_yes = model_p_yes - imp_yes
        edge_no = model_p_no - imp_no
        
        # Actual result
        btts_actual = row['btts']  # 1 = BTTS Yes, 0 = BTTS No
        
        results.append({
            'date': row['date'],
            'home': row['home'],
            'away': row['away'],
            'odds_yes': odds_yes,
            'odds_no': odds_no,
            'imp_yes': imp_yes,
            'imp_no': imp_no,
            'margin': margin,
            'model_p_yes': model_p_yes,
            'model_p_no': model_p_no,
            'edge_yes': edge_yes,
            'edge_no': edge_no,
            'btts_actual': btts_actual
        })
    
    results_df = pd.DataFrame(results)
    print(f"\n✅ Generated predictions for {len(results_df)} matches")
    
    # =========================================
    # BACKTEST BTTS NO BETS
    # =========================================
    print("\n" + "=" * 70)
    print("BTTS NO BETTING ANALYSIS")
    print("=" * 70)
    
    # Test different edge thresholds
    thresholds = [0.02, 0.03, 0.05, 0.07, 0.10, 0.15]
    
    print("\n📊 Results by Edge Threshold:")
    print("-" * 70)
    print(f"{'Threshold':<12} {'Bets':<8} {'Wins':<8} {'Win%':<10} {'Profit':<12} {'ROI':<10}")
    print("-" * 70)
    
    for thresh in thresholds:
        # Filter to NO bets with sufficient edge
        no_bets = results_df[results_df['edge_no'] >= thresh].copy()
        
        if len(no_bets) == 0:
            print(f"{thresh*100:.0f}%{'':<9} {'0':<8} {'-':<8} {'-':<10} {'-':<12} {'-':<10}")
            continue
        
        # Calculate results (NO wins when btts_actual == 0)
        no_bets['won'] = no_bets['btts_actual'] == 0
        no_bets['profit'] = no_bets.apply(
            lambda x: (x['odds_no'] - 1) if x['won'] else -1, axis=1
        )
        
        total_bets = len(no_bets)
        wins = no_bets['won'].sum()
        win_rate = wins / total_bets * 100
        total_profit = no_bets['profit'].sum()
        roi = total_profit / total_bets * 100
        
        print(f"{thresh*100:.0f}%{'':<9} {total_bets:<8} {wins:<8} {win_rate:.1f}%{'':<6} {total_profit:+.2f}u{'':<6} {roi:+.1f}%")
    
    # =========================================
    # COMPARE TO YES BETS
    # =========================================
    print("\n" + "=" * 70)
    print("BTTS YES BETTING ANALYSIS (for comparison)")
    print("=" * 70)
    
    print("\n📊 Results by Edge Threshold:")
    print("-" * 70)
    print(f"{'Threshold':<12} {'Bets':<8} {'Wins':<8} {'Win%':<10} {'Profit':<12} {'ROI':<10}")
    print("-" * 70)
    
    for thresh in thresholds:
        # Filter to YES bets with sufficient edge
        yes_bets = results_df[results_df['edge_yes'] >= thresh].copy()
        
        if len(yes_bets) == 0:
            print(f"{thresh*100:.0f}%{'':<9} {'0':<8} {'-':<8} {'-':<10} {'-':<12} {'-':<10}")
            continue
        
        # Calculate results (YES wins when btts_actual == 1)
        yes_bets['won'] = yes_bets['btts_actual'] == 1
        yes_bets['profit'] = yes_bets.apply(
            lambda x: (x['odds_yes'] - 1) if x['won'] else -1, axis=1
        )
        
        total_bets = len(yes_bets)
        wins = yes_bets['won'].sum()
        win_rate = wins / total_bets * 100
        total_profit = yes_bets['profit'].sum()
        roi = total_profit / total_bets * 100
        
        print(f"{thresh*100:.0f}%{'':<9} {total_bets:<8} {wins:<8} {win_rate:.1f}%{'':<6} {total_profit:+.2f}u{'':<6} {roi:+.1f}%")
    
    # =========================================
    # DETAILED NO ANALYSIS BY PROBABILITY BAND
    # =========================================
    print("\n" + "=" * 70)
    print("BTTS NO BY PROBABILITY BAND (5% edge minimum)")
    print("=" * 70)
    
    min_edge = 0.05
    no_bets = results_df[results_df['edge_no'] >= min_edge].copy()
    
    if len(no_bets) > 0:
        # Define probability bands for NO
        bands = [
            (0.50, 0.55, "50-55%"),
            (0.55, 0.60, "55-60%"),
            (0.60, 0.65, "60-65%"),
            (0.65, 0.70, "65-70%"),
            (0.70, 0.75, "70-75%"),
            (0.75, 1.00, "75%+"),
        ]
        
        print("\n📊 Results by Model NO Probability:")
        print("-" * 70)
        print(f"{'Band':<12} {'Bets':<8} {'Wins':<8} {'Win%':<10} {'Profit':<12} {'ROI':<10}")
        print("-" * 70)
        
        for low, high, label in bands:
            band_bets = no_bets[
                (no_bets['model_p_no'] >= low) & 
                (no_bets['model_p_no'] < high)
            ].copy()
            
            if len(band_bets) == 0:
                continue
            
            band_bets['won'] = band_bets['btts_actual'] == 0
            band_bets['profit'] = band_bets.apply(
                lambda x: (x['odds_no'] - 1) if x['won'] else -1, axis=1
            )
            
            total_bets = len(band_bets)
            wins = band_bets['won'].sum()
            win_rate = wins / total_bets * 100
            total_profit = band_bets['profit'].sum()
            roi = total_profit / total_bets * 100
            
            print(f"{label:<12} {total_bets:<8} {wins:<8} {win_rate:.1f}%{'':<6} {total_profit:+.2f}u{'':<6} {roi:+.1f}%")
    
    # =========================================
    # RECOMMENDATIONS
    # =========================================
    print("\n" + "=" * 70)
    print("RECOMMENDATIONS")
    print("=" * 70)
    
    # Find best threshold for NO
    best_roi = -100
    best_thresh = None
    best_bets = 0
    
    for thresh in thresholds:
        no_bets = results_df[results_df['edge_no'] >= thresh].copy()
        if len(no_bets) < 10:  # Minimum sample
            continue
        
        no_bets['won'] = no_bets['btts_actual'] == 0
        no_bets['profit'] = no_bets.apply(
            lambda x: (x['odds_no'] - 1) if x['won'] else -1, axis=1
        )
        
        roi = no_bets['profit'].sum() / len(no_bets) * 100
        
        if roi > best_roi:
            best_roi = roi
            best_thresh = thresh
            best_bets = len(no_bets)
    
    if best_thresh:
        print(f"\n✅ Best NO threshold: {best_thresh*100:.0f}% edge")
        print(f"   Bets: {best_bets}, ROI: {best_roi:+.1f}%")
        
        if best_roi > 5:
            print("\n🎯 BTTS NO betting appears PROFITABLE!")
            print("   Recommend running full walkforward validation.")
        elif best_roi > 0:
            print("\n⚠️ BTTS NO betting is marginally profitable.")
            print("   More analysis needed before deploying.")
        else:
            print("\n❌ BTTS NO betting is NOT profitable with current model.")
    else:
        print("\n❌ Insufficient data for analysis")


if __name__ == "__main__":
    run_backtest()
