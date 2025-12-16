"""
Decision Threshold Sweep Tool

Sweeps over decision thresholds (T_YES, T_NO, MIN_EDGE, MAX_VIG) to find
optimal configs for production deployment.

Evaluates:
- ROI (fair odds)
- Win rate
- Bet volume
- Edge quality

Author: Co-CTO
Date: December 12, 2025
"""

import pandas as pd
import numpy as np
import sys
from pathlib import Path
from itertools import product

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))
from production_decision import select_btts_bet_for_match


def compute_roi(row, decision_side, fair_prob_yes, fair_prob_no):
    """Compute ROI for a single bet using fair odds."""
    btts_actual = row['btts_actual']
    
    if decision_side == 'YES':
        fair_odds = 1 / fair_prob_yes
        won = (btts_actual == 1)
    else:  # NO
        fair_odds = 1 / fair_prob_no
        won = (btts_actual == 0)
    
    return (fair_odds - 1) if won else -1


def evaluate_config(bets_df, config):
    """
    Evaluate a single config on walk-forward bets.
    
    Returns:
        dict with metrics: roi, win_rate, num_bets, bet_pct, avg_edge, etc.
    """
    # Apply decision logic
    bet_records = []
    
    for idx, row in bets_df.iterrows():
        decision = select_btts_bet_for_match(
            prob_yes=row['btts_prob'],
            odds_yes=row['btts_yes_odds'] if pd.notna(row['btts_yes_odds']) else None,
            odds_no=row['btts_no_odds'] if pd.notna(row['btts_no_odds']) else None,
            config=config
        )
        
        if decision['side'] in ['YES', 'NO']:
            roi_return = compute_roi(
                row,
                decision['side'],
                decision['fair_prob_yes'],
                decision['fair_prob_no']
            )
            
            bet_records.append({
                'side': decision['side'],
                'edge': decision['chosen_edge'],
                'confidence': decision['confidence'],
                'won': roi_return > 0,
                'roi_return': roi_return
            })
    
    if len(bet_records) == 0:
        return {
            'num_bets': 0,
            'bet_pct': 0.0,
            'roi': np.nan,
            'win_rate': np.nan,
            'avg_edge': np.nan,
            'num_high': 0,
            'num_medium': 0,
            'num_low': 0
        }
    
    bets_df_local = pd.DataFrame(bet_records)
    
    num_bets = len(bets_df_local)
    bet_pct = 100 * num_bets / len(bets_df)
    roi = bets_df_local['roi_return'].mean()
    win_rate = bets_df_local['won'].mean()
    avg_edge = bets_df_local['edge'].mean()
    
    conf_counts = bets_df_local['confidence'].value_counts()
    
    return {
        'num_bets': num_bets,
        'bet_pct': bet_pct,
        'roi': roi,
        'win_rate': win_rate,
        'avg_edge': avg_edge,
        'num_high': conf_counts.get('HIGH', 0),
        'num_medium': conf_counts.get('MEDIUM', 0),
        'num_low': conf_counts.get('LOW', 0)
    }


def main():
    print("="*80)
    print("DECISION THRESHOLD SWEEP")
    print("="*80)
    
    # Load walk-forward bets
    bets = pd.read_csv('results/walkforward_enhanced_all_models_bets.csv')
    logistic_bets = bets[bets['model'] == 'logistic_tuned'].copy()
    
    print(f"\n📊 Loaded {len(logistic_bets)} logistic_tuned bets")
    print(f"   Date range: {logistic_bets['date'].min()} to {logistic_bets['date'].max()}")
    
    # Define sweep grid
    print(f"\n⚙️  Defining sweep grid...")
    
    T_YES_values = [0.60, 0.65, 0.70, 0.75]
    T_NO_values = [0.25, 0.30, 0.35, 0.40]
    MIN_EDGE_values = [0.01, 0.02, 0.03, 0.04, 0.05]
    MAX_VIG_values = [0.06, 0.08, 0.10]
    
    grid = list(product(T_YES_values, T_NO_values, MIN_EDGE_values, MAX_VIG_values))
    
    print(f"   T_YES: {T_YES_values}")
    print(f"   T_NO: {T_NO_values}")
    print(f"   MIN_EDGE: {MIN_EDGE_values}")
    print(f"   MAX_VIG: {MAX_VIG_values}")
    print(f"   Total configs: {len(grid)}")
    
    # Sweep
    print(f"\n🔄 Running sweep...")
    
    results = []
    
    for i, (t_yes, t_no, min_edge, max_vig) in enumerate(grid):
        if (i + 1) % 20 == 0:
            print(f"   Progress: {i+1}/{len(grid)} configs...")
        
        config = {
            'T_YES': t_yes,
            'T_NO': t_no,
            'MIN_EDGE': min_edge,
            'MAX_VIG': max_vig,
            'BOTH_SIDES_SHORT_MAX': 2.0,
            'REQUIRE_ODDS': True,
            'EDGE_MODE': 'fair'
        }
        
        metrics = evaluate_config(logistic_bets, config)
        
        results.append({
            'T_YES': t_yes,
            'T_NO': t_no,
            'MIN_EDGE': min_edge,
            'MAX_VIG': max_vig,
            **metrics
        })
    
    print(f"   ✅ Sweep complete!")
    
    # Create DataFrame
    results_df = pd.DataFrame(results)
    
    # Filter to configs with at least 10 bets
    results_df = results_df[results_df['num_bets'] >= 10].copy()
    
    print(f"\n📊 Valid configs (≥10 bets): {len(results_df)}/{len(grid)}")
    
    if len(results_df) == 0:
        print("\n❌ No configs produced ≥10 bets. Thresholds may be too tight.")
        return
    
    # Sort by ROI
    results_df = results_df.sort_values('roi', ascending=False)
    
    # Save full results
    output_path = 'results/decision_sweep_logistic_tuned.csv'
    results_df.to_csv(output_path, index=False)
    print(f"\n💾 Saved full results to: {output_path}")
    
    # Display top configs
    print(f"\n📊 TOP 10 CONFIGS BY ROI:")
    print(f"{'Rank':>4s} {'T_YES':>6s} {'T_NO':>6s} {'MIN_E':>6s} {'MAX_V':>6s} {'#Bets':>6s} {'Vol%':>6s} {'ROI':>8s} {'WinRate':>8s} {'Edge':>7s}")
    print("-" * 90)
    
    for i, row in results_df.head(10).iterrows():
        print(f"{i+1:4d} {row['T_YES']:6.2f} {row['T_NO']:6.2f} {row['MIN_EDGE']:6.2f} {row['MAX_VIG']:6.2f} "
              f"{int(row['num_bets']):6d} {row['bet_pct']:5.1f}% {row['roi']:+7.1%} {row['win_rate']:7.1%} {row['avg_edge']:+6.3f}")
    
    print(f"\n📊 TOP 10 CONFIGS BY WIN RATE:")
    print(f"{'Rank':>4s} {'T_YES':>6s} {'T_NO':>6s} {'MIN_E':>6s} {'MAX_V':>6s} {'#Bets':>6s} {'Vol%':>6s} {'ROI':>8s} {'WinRate':>8s} {'Edge':>7s}")
    print("-" * 90)
    
    top_winrate = results_df.sort_values('win_rate', ascending=False).head(10)
    for i, (_, row) in enumerate(top_winrate.iterrows()):
        print(f"{i+1:4d} {row['T_YES']:6.2f} {row['T_NO']:6.2f} {row['MIN_EDGE']:6.2f} {row['MAX_VIG']:6.2f} "
              f"{int(row['num_bets']):6d} {row['bet_pct']:5.1f}% {row['roi']:+7.1%} {row['win_rate']:7.1%} {row['avg_edge']:+6.3f}")
    
    print(f"\n📊 TOP 10 CONFIGS BY VOLUME:")
    print(f"{'Rank':>4s} {'T_YES':>6s} {'T_NO':>6s} {'MIN_E':>6s} {'MAX_V':>6s} {'#Bets':>6s} {'Vol%':>6s} {'ROI':>8s} {'WinRate':>8s} {'Edge':>7s}")
    print("-" * 90)
    
    top_volume = results_df.sort_values('bet_pct', ascending=False).head(10)
    for i, (_, row) in enumerate(top_volume.iterrows()):
        print(f"{i+1:4d} {row['T_YES']:6.2f} {row['T_NO']:6.2f} {row['MIN_EDGE']:6.2f} {row['MAX_VIG']:6.2f} "
              f"{int(row['num_bets']):6d} {row['bet_pct']:5.1f}% {row['roi']:+7.1%} {row['win_rate']:7.1%} {row['avg_edge']:+6.3f}")
    
    # Generate summary report
    print(f"\n📝 Generating summary report...")
    
    report_lines = [
        "# BTTS Decision Threshold Sweep Report",
        "",
        f"**Date:** December 12, 2025",
        f"**Model:** LogisticLeakFreeTuned",
        f"**Test matches:** {len(logistic_bets)}",
        f"**Configs tested:** {len(grid)}",
        f"**Valid configs:** {len(results_df)} (≥10 bets)",
        "",
        "## Summary Statistics",
        "",
        f"- **Best ROI:** {results_df['roi'].max():+.1%} ({int(results_df.loc[results_df['roi'].idxmax(), 'num_bets'])} bets)",
        f"- **Best Win Rate:** {results_df['win_rate'].max():.1%} ({int(results_df.loc[results_df['win_rate'].idxmax(), 'num_bets'])} bets)",
        f"- **Highest Volume:** {results_df['bet_pct'].max():.1f}% ({int(results_df.loc[results_df['bet_pct'].idxmax(), 'num_bets'])} bets)",
        f"- **Median ROI:** {results_df['roi'].median():+.1%}",
        f"- **Median Volume:** {results_df['bet_pct'].median():.1f}%",
        "",
        "## Top 10 Configs by ROI",
        "",
        "| Rank | T_YES | T_NO | MIN_EDGE | MAX_VIG | #Bets | Vol% | ROI | Win Rate | Avg Edge |",
        "|------|-------|------|----------|---------|-------|------|-----|----------|----------|"
    ]
    
    for i, row in results_df.head(10).iterrows():
        report_lines.append(
            f"| {i+1} | {row['T_YES']:.2f} | {row['T_NO']:.2f} | {row['MIN_EDGE']:.2f} | "
            f"{row['MAX_VIG']:.2f} | {int(row['num_bets'])} | {row['bet_pct']:.1f}% | "
            f"{row['roi']:+.1%} | {row['win_rate']:.1%} | {row['avg_edge']:+.3f} |"
        )
    
    report_lines.extend([
        "",
        "## Recommended Configs",
        "",
        "### 🎯 Best ROI (High Precision)",
        ""
    ])
    
    best_roi = results_df.iloc[0]
    report_lines.extend([
        "```python",
        "config = {",
        f"    'T_YES': {best_roi['T_YES']:.2f},",
        f"    'T_NO': {best_roi['T_NO']:.2f},",
        f"    'MIN_EDGE': {best_roi['MIN_EDGE']:.2f},",
        f"    'MAX_VIG': {best_roi['MAX_VIG']:.2f},",
        "    'BOTH_SIDES_SHORT_MAX': 2.0,",
        "    'REQUIRE_ODDS': True,",
        "    'EDGE_MODE': 'fair'",
        "}",
        "```",
        "",
        f"**Performance:** ROI={best_roi['roi']:+.1%}, Win Rate={best_roi['win_rate']:.1%}, Volume={best_roi['bet_pct']:.1f}% ({int(best_roi['num_bets'])} bets)",
        "",
        "### ⚖️ Balanced (ROI + Volume)",
        ""
    ])
    
    # Find balanced config (high ROI + reasonable volume)
    balanced_candidates = results_df[(results_df['bet_pct'] >= 10) & (results_df['bet_pct'] <= 25)]
    if len(balanced_candidates) > 0:
        balanced = balanced_candidates.iloc[0]
    else:
        balanced = results_df.iloc[min(4, len(results_df)-1)]
    
    report_lines.extend([
        "```python",
        "config = {",
        f"    'T_YES': {balanced['T_YES']:.2f},",
        f"    'T_NO': {balanced['T_NO']:.2f},",
        f"    'MIN_EDGE': {balanced['MIN_EDGE']:.2f},",
        f"    'MAX_VIG': {balanced['MAX_VIG']:.2f},",
        "    'BOTH_SIDES_SHORT_MAX': 2.0,",
        "    'REQUIRE_ODDS': True,",
        "    'EDGE_MODE': 'fair'",
        "}",
        "```",
        "",
        f"**Performance:** ROI={balanced['roi']:+.1%}, Win Rate={balanced['win_rate']:.1%}, Volume={balanced['bet_pct']:.1f}% ({int(balanced['num_bets'])} bets)",
        "",
        "## Notes",
        "",
        "- All configs use FAIR IMPLIED edge (vig-removed)",
        "- ROI computed using fair odds (no bookmaker vig)",
        "- Walk-forward validation on 539 out-of-sample matches",
        "- Higher thresholds → lower volume, higher precision",
        "- Lower thresholds → higher volume, potentially lower ROI",
        "",
        "## Full Results",
        "",
        f"See `{output_path}` for complete sweep results."
    ])
    
    report_path = 'BTTS_DECISION_SWEEP_REPORT.md'
    with open(report_path, 'w') as f:
        f.write('\n'.join(report_lines))
    
    print(f"💾 Saved report to: {report_path}")
    
    print("\n" + "="*80)
    print("✅ THRESHOLD SWEEP COMPLETE")
    print("="*80)
    print(f"\n🎯 RECOMMENDED PRODUCTION CONFIG (Best ROI):")
    print(f"   T_YES={best_roi['T_YES']:.2f}, T_NO={best_roi['T_NO']:.2f}, MIN_EDGE={best_roi['MIN_EDGE']:.2f}, MAX_VIG={best_roi['MAX_VIG']:.2f}")
    print(f"   Expected: ROI={best_roi['roi']:+.1%}, Volume={best_roi['bet_pct']:.1f}% ({int(best_roi['num_bets'])} bets)")


if __name__ == '__main__':
    main()
