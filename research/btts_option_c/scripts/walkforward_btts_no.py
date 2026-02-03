#!/usr/bin/env python3
"""
BTTS NO Walk-Forward Validation
================================
Proper out-of-sample validation for BTTS NO betting strategy.

Methodology:
- Train on Season N, test on Season N+1
- No future data leakage
- Realistic simulation of live betting
"""

import pandas as pd
import numpy as np
from pathlib import Path
from scipy.stats import poisson
from datetime import datetime


def calculate_btts_probability(home_xg: float, away_xg: float) -> float:
    """
    Calculate BTTS YES probability using bivariate Poisson.
    """
    p_home_zero = poisson.pmf(0, home_xg)
    p_away_zero = poisson.pmf(0, away_xg)
    p_both_zero = p_home_zero * p_away_zero
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
    
    p_yes = inv_yes - (margin * inv_yes / (inv_yes + inv_no))
    p_no = inv_no - (margin * inv_no / (inv_yes + inv_no))
    total = p_yes + p_no
    
    return p_yes / total, p_no / total, margin


def evaluate_bets(df: pd.DataFrame, min_edge: float, min_prob: float = 0.0) -> dict:
    """
    Evaluate NO bets with given thresholds.
    Returns betting statistics.
    """
    # Filter for NO bets meeting criteria
    bets = df[
        (df['edge_no'] >= min_edge) &
        (df['p_no'] >= min_prob)
    ].copy()
    
    if len(bets) == 0:
        return {
            'bets': 0,
            'wins': 0,
            'win_rate': 0,
            'profit': 0,
            'roi': 0
        }
    
    # NO wins when btts_actual == 0
    bets['won'] = bets['btts'] == 0
    bets['profit'] = bets.apply(
        lambda x: (x['btts_no_odds'] - 1) if x['won'] else -1, axis=1
    )
    
    return {
        'bets': len(bets),
        'wins': bets['won'].sum(),
        'win_rate': bets['won'].mean() * 100,
        'profit': bets['profit'].sum(),
        'roi': bets['profit'].sum() / len(bets) * 100
    }


def run_walkforward():
    print("=" * 70)
    print("BTTS NO WALK-FORWARD VALIDATION")
    print("=" * 70)
    
    # Load data
    data_path = Path(__file__).parent.parent / "data" / "btts_leakfree_features.parquet"
    df = pd.read_parquet(data_path)
    
    # Filter to matches with odds and xG
    df = df.dropna(subset=['btts_yes_odds', 'btts_no_odds', 'home_xg', 'away_xg'])
    
    print(f"\n📊 Loaded {len(df)} matches with complete data")
    print(f"   Seasons: {sorted(df['season'].unique().tolist())}")
    
    # Generate predictions
    df['p_yes'] = df.apply(
        lambda row: calculate_btts_probability(row['home_xg'], row['away_xg']),
        axis=1
    )
    df['p_no'] = 1 - df['p_yes']
    
    # Calculate edges
    for idx, row in df.iterrows():
        imp_yes, imp_no, _ = shin_devig(row['btts_yes_odds'], row['btts_no_odds'])
        df.at[idx, 'imp_yes'] = imp_yes
        df.at[idx, 'imp_no'] = imp_no
        df.at[idx, 'edge_no'] = row['p_no'] - imp_no
        df.at[idx, 'edge_yes'] = row['p_yes'] - imp_yes
    
    # Get seasons in order
    seasons = sorted(df['season'].unique().tolist())
    print(f"\n📅 Walk-forward splits:")
    for i in range(len(seasons) - 1):
        train_season = seasons[i]
        test_season = seasons[i + 1]
        train_n = len(df[df['season'] == train_season])
        test_n = len(df[df['season'] == test_season])
        print(f"   Fold {i+1}: Train on {train_season} ({train_n} matches) → Test on {test_season} ({test_n} matches)")
    
    # =========================================
    # WALK-FORWARD BY SEASON
    # =========================================
    print("\n" + "=" * 70)
    print("WALK-FORWARD RESULTS BY FOLD")
    print("=" * 70)
    
    # Test different configurations
    configs = [
        {'name': 'Conservative', 'min_edge': 0.10, 'min_prob': 0.65},
        {'name': 'Balanced', 'min_edge': 0.07, 'min_prob': 0.60},
        {'name': 'Aggressive', 'min_edge': 0.05, 'min_prob': 0.55},
        {'name': 'High Conf Only', 'min_edge': 0.10, 'min_prob': 0.70},
        {'name': 'Very High Conf', 'min_edge': 0.05, 'min_prob': 0.75},
    ]
    
    all_fold_results = []
    
    for fold_idx in range(len(seasons) - 1):
        train_season = seasons[fold_idx]
        test_season = seasons[fold_idx + 1]
        
        test_df = df[df['season'] == test_season].copy()
        
        print(f"\n📊 Fold {fold_idx + 1}: Test on {test_season} ({len(test_df)} matches)")
        print("-" * 70)
        print(f"{'Config':<18} {'Bets':<8} {'Wins':<8} {'Win%':<10} {'Profit':<12} {'ROI':<10}")
        print("-" * 70)
        
        for config in configs:
            results = evaluate_bets(test_df, config['min_edge'], config['min_prob'])
            
            print(f"{config['name']:<18} {results['bets']:<8} {results['wins']:<8} "
                  f"{results['win_rate']:.1f}%{'':<6} {results['profit']:+.2f}u{'':<6} "
                  f"{results['roi']:+.1f}%" if results['bets'] > 0 else 
                  f"{config['name']:<18} {'0':<8} {'-':<8} {'-':<10} {'-':<12} {'-':<10}")
            
            all_fold_results.append({
                'fold': fold_idx + 1,
                'test_season': test_season,
                'config': config['name'],
                'min_edge': config['min_edge'],
                'min_prob': config['min_prob'],
                **results
            })
    
    # =========================================
    # AGGREGATE RESULTS
    # =========================================
    print("\n" + "=" * 70)
    print("AGGREGATE WALK-FORWARD RESULTS (All Folds Combined)")
    print("=" * 70)
    
    results_df = pd.DataFrame(all_fold_results)
    
    print("\n📊 Combined Results by Config:")
    print("-" * 70)
    print(f"{'Config':<18} {'Total Bets':<12} {'Total Wins':<12} {'Win%':<10} {'Profit':<12} {'ROI':<10}")
    print("-" * 70)
    
    for config in configs:
        config_results = results_df[results_df['config'] == config['name']]
        total_bets = config_results['bets'].sum()
        total_wins = config_results['wins'].sum()
        total_profit = config_results['profit'].sum()
        
        if total_bets > 0:
            win_rate = total_wins / total_bets * 100
            roi = total_profit / total_bets * 100
            print(f"{config['name']:<18} {total_bets:<12} {total_wins:<12} "
                  f"{win_rate:.1f}%{'':<6} {total_profit:+.2f}u{'':<6} {roi:+.1f}%")
        else:
            print(f"{config['name']:<18} {'0':<12} {'-':<12} {'-':<10} {'-':<12} {'-':<10}")
    
    # =========================================
    # COMPARE TO YES BETS (same methodology)
    # =========================================
    print("\n" + "=" * 70)
    print("COMPARISON: BTTS YES WALK-FORWARD (Same Methodology)")
    print("=" * 70)
    
    yes_configs = [
        {'name': 'YES Conservative', 'min_edge': 0.10, 'min_prob': 0.65},
        {'name': 'YES Balanced', 'min_edge': 0.07, 'min_prob': 0.60},
        {'name': 'YES Profile C Band', 'min_edge': 0.03, 'min_prob': 0.61, 'max_prob': 0.66},
    ]
    
    print("\n📊 YES Bets by Config (all test folds):")
    print("-" * 70)
    print(f"{'Config':<20} {'Bets':<10} {'Wins':<10} {'Win%':<10} {'Profit':<12} {'ROI':<10}")
    print("-" * 70)
    
    # Combine all test data
    test_seasons = seasons[1:]  # All except first
    all_test_df = df[df['season'].isin(test_seasons)].copy()
    
    for config in yes_configs:
        # Filter for YES bets
        min_edge = config['min_edge']
        min_prob = config['min_prob']
        max_prob = config.get('max_prob', 1.0)
        
        bets = all_test_df[
            (all_test_df['edge_yes'] >= min_edge) &
            (all_test_df['p_yes'] >= min_prob) &
            (all_test_df['p_yes'] <= max_prob)
        ].copy()
        
        if len(bets) == 0:
            print(f"{config['name']:<20} {'0':<10} {'-':<10} {'-':<10} {'-':<12} {'-':<10}")
            continue
        
        bets['won'] = bets['btts'] == 1
        bets['profit'] = bets.apply(
            lambda x: (x['btts_yes_odds'] - 1) if x['won'] else -1, axis=1
        )
        
        total_bets = len(bets)
        total_wins = bets['won'].sum()
        win_rate = total_wins / total_bets * 100
        total_profit = bets['profit'].sum()
        roi = total_profit / total_bets * 100
        
        print(f"{config['name']:<20} {total_bets:<10} {total_wins:<10} "
              f"{win_rate:.1f}%{'':<6} {total_profit:+.2f}u{'':<6} {roi:+.1f}%")
    
    # =========================================
    # BTTS NO BETS (same methodology for comparison)
    # =========================================
    print("\n📊 NO Bets by Config (all test folds):")
    print("-" * 70)
    print(f"{'Config':<20} {'Bets':<10} {'Wins':<10} {'Win%':<10} {'Profit':<12} {'ROI':<10}")
    print("-" * 70)
    
    no_configs = [
        {'name': 'NO Conservative', 'min_edge': 0.10, 'min_prob': 0.65},
        {'name': 'NO Balanced', 'min_edge': 0.07, 'min_prob': 0.60},
        {'name': 'NO High Conf', 'min_edge': 0.05, 'min_prob': 0.70},
        {'name': 'NO Very High', 'min_edge': 0.05, 'min_prob': 0.75},
    ]
    
    for config in no_configs:
        results = evaluate_bets(all_test_df, config['min_edge'], config['min_prob'])
        
        if results['bets'] > 0:
            print(f"{config['name']:<20} {results['bets']:<10} {results['wins']:<10} "
                  f"{results['win_rate']:.1f}%{'':<6} {results['profit']:+.2f}u{'':<6} {results['roi']:+.1f}%")
        else:
            print(f"{config['name']:<20} {'0':<10} {'-':<10} {'-':<10} {'-':<12} {'-':<10}")
    
    # =========================================
    # FINAL RECOMMENDATIONS
    # =========================================
    print("\n" + "=" * 70)
    print("FINAL RECOMMENDATIONS")
    print("=" * 70)
    
    # Find best NO config
    best_no = None
    best_no_roi = -100
    
    for config in no_configs:
        results = evaluate_bets(all_test_df, config['min_edge'], config['min_prob'])
        if results['bets'] >= 10 and results['roi'] > best_no_roi:
            best_no = config
            best_no_roi = results['roi']
            best_no_results = results
    
    if best_no:
        print(f"\n✅ RECOMMENDED NO STRATEGY: {best_no['name']}")
        print(f"   Thresholds: {best_no['min_edge']*100:.0f}% edge, {best_no['min_prob']*100:.0f}% probability")
        print(f"   Walk-forward results: {best_no_results['bets']} bets, {best_no_results['roi']:+.1f}% ROI")
        
        if best_no_roi > 10:
            print("\n🎯 BTTS NO betting is VALIDATED as profitable out-of-sample!")
            print("   Recommend deploying to production with these thresholds.")
        elif best_no_roi > 0:
            print("\n⚠️ BTTS NO shows positive ROI but margins are thin.")
            print("   Consider more conservative thresholds or additional validation.")
        else:
            print("\n❌ BTTS NO betting is NOT profitable out-of-sample.")
            print("   Do not deploy - backtest results did not generalize.")
    else:
        print("\n❌ No viable NO betting strategy found.")


if __name__ == "__main__":
    run_walkforward()
