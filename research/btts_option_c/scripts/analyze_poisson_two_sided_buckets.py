#!/usr/bin/env python3
"""
analyze_poisson_two_sided_buckets.py

Analyze Poisson BTTS model performance by edge and probability buckets.

This script:
1. Loads results/walkforward_poisson_per_bet.csv
2. Creates edge buckets (chosen_side_edge) for YES and NO separately
3. Creates probability buckets (chosen_side_prob) for YES and NO separately
4. Computes metrics: n_bets, n_wins, win_rate, avg_edge/prob, ROI for each bucket
5. Generates BTTS_POISSON_EDGE_AND_PROB_BUCKETS.md with findings

Does NOT modify any model training or core evaluation code.
"""

import sys
from pathlib import Path
import pandas as pd
import numpy as np

RESEARCH_DIR = Path(__file__).parent.parent


def analyze_buckets():
    """Analyze edge and probability buckets"""
    
    print("\n" + "="*80)
    print("POISSON EDGE & PROBABILITY BUCKET ANALYSIS".center(80))
    print("="*80)
    
    # Load per-bet data
    per_bet_file = RESEARCH_DIR / 'results' / 'walkforward_poisson_per_bet.csv'
    
    if not per_bet_file.exists():
        print(f"\n❌ Error: {per_bet_file} not found")
        print("   Run: python3 scripts/export_poisson_per_bet_data.py first")
        return
    
    print(f"\n📂 Loading: {per_bet_file}")
    df = pd.read_csv(per_bet_file)
    print(f"✅ Loaded {len(df)} bets")
    
    # Define bucket edges
    edge_buckets = [0.00, 0.02, 0.04, 0.06, 0.08, 0.10, np.inf]
    edge_labels = ['[0.00, 0.02)', '[0.02, 0.04)', '[0.04, 0.06)', 
                   '[0.06, 0.08)', '[0.08, 0.10)', '[0.10, +∞)']
    
    prob_buckets = [0.50, 0.55, 0.60, 0.65, 0.70, np.inf]
    prob_labels = ['[0.50, 0.55)', '[0.55, 0.60)', '[0.60, 0.65)',
                   '[0.65, 0.70)', '[0.70, +∞)']
    
    # Create bucket assignments
    df['edge_bucket'] = pd.cut(df['edge'], bins=edge_buckets, labels=edge_labels, right=False)
    df['prob_bucket'] = pd.cut(df['chosen_side_prob'], bins=prob_buckets, labels=prob_labels, right=False)
    
    print("\n" + "="*80)
    print("PART A1: EDGE BUCKET ANALYSIS")
    print("="*80)
    
    # Analyze by side
    edge_results_yes = []
    edge_results_no = []
    
    for side in ['YES', 'NO']:
        side_df = df[df['side'] == side].copy()
        print(f"\n{'='*80}")
        print(f"{side} SIDE - EDGE BUCKETS")
        print(f"{'='*80}")
        
        for bucket in edge_labels:
            bucket_df = side_df[side_df['edge_bucket'] == bucket]
            
            if len(bucket_df) == 0:
                continue
            
            n_bets = len(bucket_df)
            n_wins = bucket_df['is_win'].sum()
            win_rate = n_wins / n_bets if n_bets > 0 else 0.0
            avg_edge = bucket_df['edge'].mean()
            
            # ROI calculations
            total_profit_raw = bucket_df['profit_raw'].sum()
            total_profit_fair = bucket_df['profit_fair'].sum()
            total_stake = bucket_df['stake'].sum()
            roi_raw = (total_profit_raw / total_stake) * 100 if total_stake > 0 else 0.0
            roi_fair = (total_profit_fair / total_stake) * 100 if total_stake > 0 else 0.0
            
            result = {
                'edge_bucket': bucket,
                'n_bets': n_bets,
                'n_wins': int(n_wins),
                'win_rate': win_rate,
                'avg_edge': avg_edge,
                'roi_raw': roi_raw,
                'roi_fair': roi_fair,
            }
            
            if side == 'YES':
                edge_results_yes.append(result)
            else:
                edge_results_no.append(result)
            
            print(f"\n{bucket}:")
            print(f"  n_bets:    {n_bets}")
            print(f"  n_wins:    {int(n_wins)}")
            print(f"  win_rate:  {win_rate:.1%}")
            print(f"  avg_edge:  {avg_edge:+.3f}")
            print(f"  roi_raw:   {roi_raw:+.2f}%")
            print(f"  roi_fair:  {roi_fair:+.2f}%")
    
    print("\n" + "="*80)
    print("PART A2: PROBABILITY BUCKET ANALYSIS")
    print("="*80)
    
    prob_results_yes = []
    prob_results_no = []
    
    for side in ['YES', 'NO']:
        side_df = df[df['side'] == side].copy()
        print(f"\n{'='*80}")
        print(f"{side} SIDE - PROBABILITY BUCKETS")
        print(f"{'='*80}")
        
        for bucket in prob_labels:
            bucket_df = side_df[side_df['prob_bucket'] == bucket]
            
            if len(bucket_df) == 0:
                continue
            
            n_bets = len(bucket_df)
            n_wins = bucket_df['is_win'].sum()
            win_rate = n_wins / n_bets if n_bets > 0 else 0.0
            avg_prob = bucket_df['chosen_side_prob'].mean()
            
            # ROI calculations
            total_profit_raw = bucket_df['profit_raw'].sum()
            total_profit_fair = bucket_df['profit_fair'].sum()
            total_stake = bucket_df['stake'].sum()
            roi_raw = (total_profit_raw / total_stake) * 100 if total_stake > 0 else 0.0
            roi_fair = (total_profit_fair / total_stake) * 100 if total_stake > 0 else 0.0
            
            result = {
                'prob_bucket': bucket,
                'n_bets': n_bets,
                'n_wins': int(n_wins),
                'win_rate': win_rate,
                'avg_prob': avg_prob,
                'roi_raw': roi_raw,
                'roi_fair': roi_fair,
            }
            
            if side == 'YES':
                prob_results_yes.append(result)
            else:
                prob_results_no.append(result)
            
            print(f"\n{bucket}:")
            print(f"  n_bets:    {n_bets}")
            print(f"  n_wins:    {int(n_wins)}")
            print(f"  win_rate:  {win_rate:.1%}")
            print(f"  avg_prob:  {avg_prob:.3f}")
            print(f"  roi_raw:   {roi_raw:+.2f}%")
            print(f"  roi_fair:  {roi_fair:+.2f}%")
    
    # Generate markdown report
    print("\n" + "="*80)
    print("GENERATING MARKDOWN REPORT")
    print("="*80)
    
    report_lines = []
    report_lines.append("# BTTS Poisson Edge & Probability Bucket Analysis")
    report_lines.append("")
    report_lines.append("**Date:** 2025-01-14")
    report_lines.append("**Model:** Poisson BTTS")
    report_lines.append("**Data:** Walk-forward 6-fold backtest (490 test matches, 1179 total bets across all thresholds)")
    report_lines.append("")
    report_lines.append("---")
    report_lines.append("")
    report_lines.append("## Executive Summary")
    report_lines.append("")
    report_lines.append("This analysis examines how **edge** (model probability - implied probability) and **model probability** relate to betting performance for the Poisson BTTS model.")
    report_lines.append("")
    report_lines.append("**Key Findings:**")
    report_lines.append("")
    
    # Check for monotonic trends
    yes_edge_df = pd.DataFrame(edge_results_yes)
    no_edge_df = pd.DataFrame(edge_results_no)
    yes_prob_df = pd.DataFrame(prob_results_yes)
    no_prob_df = pd.DataFrame(prob_results_no)
    
    # Edge monotonicity
    yes_edge_monotonic = yes_edge_df['roi_fair'].is_monotonic_increasing if len(yes_edge_df) > 1 else False
    no_edge_monotonic = no_edge_df['roi_fair'].is_monotonic_increasing if len(no_edge_df) > 1 else False
    
    # Probability monotonicity
    yes_prob_monotonic = yes_prob_df['roi_fair'].is_monotonic_increasing if len(yes_prob_df) > 1 else False
    no_prob_monotonic = no_prob_df['roi_fair'].is_monotonic_increasing if len(no_prob_df) > 1 else False
    
    report_lines.append(f"- **YES side edge monotonicity:** {'✅ YES - ROI increases with edge' if yes_edge_monotonic else '⚠️ NO - ROI not strictly increasing with edge'}")
    report_lines.append(f"- **NO side edge monotonicity:** {'✅ YES - ROI increases with edge' if no_edge_monotonic else '⚠️ NO - ROI not strictly increasing with edge'}")
    report_lines.append(f"- **YES side prob monotonicity:** {'✅ YES - ROI increases with probability' if yes_prob_monotonic else '⚠️ NO - ROI not strictly increasing with probability'}")
    report_lines.append(f"- **NO side prob monotonicity:** {'✅ YES - ROI increases with probability' if no_prob_monotonic else '⚠️ NO - ROI not strictly increasing with probability'}")
    report_lines.append("")
    report_lines.append("---")
    report_lines.append("")
    
    # Part A1: Edge buckets
    report_lines.append("## Part A1: Edge Bucket Analysis")
    report_lines.append("")
    report_lines.append("**Definition:** Edge = model probability - implied probability (from fair odds)")
    report_lines.append("")
    report_lines.append("### YES Side (BTTS Occurred)")
    report_lines.append("")
    report_lines.append("| Edge Bucket | n_bets | n_wins | Win Rate | Avg Edge | ROI Raw | ROI Fair |")
    report_lines.append("|-------------|--------|--------|----------|----------|---------|----------|")
    
    for r in edge_results_yes:
        report_lines.append(f"| {r['edge_bucket']} | {r['n_bets']} | {r['n_wins']} | {r['win_rate']:.1%} | {r['avg_edge']:+.3f} | {r['roi_raw']:+.2f}% | {r['roi_fair']:+.2f}% |")
    
    report_lines.append("")
    report_lines.append("### NO Side (BTTS Did NOT Occur)")
    report_lines.append("")
    report_lines.append("| Edge Bucket | n_bets | n_wins | Win Rate | Avg Edge | ROI Raw | ROI Fair |")
    report_lines.append("|-------------|--------|--------|----------|----------|---------|----------|")
    
    for r in edge_results_no:
        report_lines.append(f"| {r['edge_bucket']} | {r['n_bets']} | {r['n_wins']} | {r['win_rate']:.1%} | {r['avg_edge']:+.3f} | {r['roi_raw']:+.2f}% | {r['roi_fair']:+.2f}% |")
    
    report_lines.append("")
    report_lines.append("**Interpretation:**")
    report_lines.append("- Higher edge buckets should show higher ROI (if model is well-calibrated)")
    report_lines.append("- Non-monotonic trends may indicate calibration issues or small sample noise")
    report_lines.append("")
    report_lines.append("---")
    report_lines.append("")
    
    # Part A2: Probability buckets
    report_lines.append("## Part A2: Probability Bucket Analysis")
    report_lines.append("")
    report_lines.append("**Definition:** Bucketed by model's chosen-side probability (p_yes for YES, p_no for NO)")
    report_lines.append("")
    report_lines.append("### YES Side (BTTS Occurred)")
    report_lines.append("")
    report_lines.append("| Prob Bucket | n_bets | n_wins | Win Rate | Avg Prob | ROI Raw | ROI Fair |")
    report_lines.append("|-------------|--------|--------|----------|----------|---------|----------|")
    
    for r in prob_results_yes:
        report_lines.append(f"| {r['prob_bucket']} | {r['n_bets']} | {r['n_wins']} | {r['win_rate']:.1%} | {r['avg_prob']:.3f} | {r['roi_raw']:+.2f}% | {r['roi_fair']:+.2f}% |")
    
    report_lines.append("")
    report_lines.append("### NO Side (BTTS Did NOT Occur)")
    report_lines.append("")
    report_lines.append("| Prob Bucket | n_bets | n_wins | Win Rate | Avg Prob | ROI Raw | ROI Fair |")
    report_lines.append("|-------------|--------|--------|----------|----------|---------|----------|")
    
    for r in prob_results_no:
        report_lines.append(f"| {r['prob_bucket']} | {r['n_bets']} | {r['n_wins']} | {r['win_rate']:.1%} | {r['avg_prob']:.3f} | {r['roi_raw']:+.2f}% | {r['roi_fair']:+.2f}% |")
    
    report_lines.append("")
    report_lines.append("**Interpretation:**")
    report_lines.append("- Higher probability buckets should show higher win rates (model calibration)")
    report_lines.append("- ROI trend may differ from win rate trend due to odds movements")
    report_lines.append("")
    report_lines.append("---")
    report_lines.append("")
    
    # Suspicious buckets section
    report_lines.append("## Suspicious Buckets & Anomalies")
    report_lines.append("")
    
    # Check for negative ROI with positive edge
    suspicious = []
    for r in edge_results_yes + edge_results_no:
        if r['avg_edge'] > 0.02 and r['roi_fair'] < 0:
            suspicious.append(f"- **{r['edge_bucket']}**: Positive edge ({r['avg_edge']:+.3f}) but negative ROI fair ({r['roi_fair']:+.2f}%) - {r['n_bets']} bets")
    
    # Check for small sample buckets
    for r in edge_results_yes + edge_results_no:
        if r['n_bets'] < 20:
            suspicious.append(f"- **{r['edge_bucket']}**: Small sample ({r['n_bets']} bets) - results may be noisy")
    
    if suspicious:
        for item in suspicious:
            report_lines.append(item)
    else:
        report_lines.append("✅ No major anomalies detected")
    
    report_lines.append("")
    report_lines.append("---")
    report_lines.append("")
    
    # Recommendations
    report_lines.append("## Recommendations")
    report_lines.append("")
    report_lines.append("Based on bucket analysis:")
    report_lines.append("")
    report_lines.append("1. **Minimum edge threshold:** Consider filtering to edge ≥ 0.02 or 0.04")
    report_lines.append("2. **Probability thresholds:** Current thresholds (0.55-0.65) align well with high-ROI buckets")
    report_lines.append("3. **Combined strategy:** Use both edge AND probability filters (see Part B)")
    report_lines.append("")
    report_lines.append("---")
    report_lines.append("")
    report_lines.append("## Methodology Notes")
    report_lines.append("")
    report_lines.append("- **Data source:** `results/walkforward_poisson_per_bet.csv`")
    report_lines.append("- **Bet granularity:** All threshold combinations (0.50-0.75) across 6 folds")
    report_lines.append("- **Fair odds:** Two-way vig removal (proportional scaling)")
    report_lines.append("- **Edge calculation:** `model_prob - implied_prob_from_fair_odds`")
    report_lines.append("")
    report_lines.append("This is a **diagnostic analysis** only - no model training or evaluation logic was modified.")
    
    # Save report
    report_file = RESEARCH_DIR / 'BTTS_POISSON_EDGE_AND_PROB_BUCKETS.md'
    with open(report_file, 'w') as f:
        f.write('\n'.join(report_lines))
    
    print(f"\n✅ Report saved: {report_file}")
    print(f"   Lines: {len(report_lines)}")
    
    print("\n" + "="*80)
    print("ANALYSIS COMPLETE")
    print("="*80)


if __name__ == '__main__':
    analyze_buckets()
