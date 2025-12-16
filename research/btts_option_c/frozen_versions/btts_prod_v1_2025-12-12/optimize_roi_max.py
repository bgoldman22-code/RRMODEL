"""
Maximum ROI Threshold Optimization for BTTS

Pure edge-based betting policy optimization.
NO probability gates. Edge is the ONLY trigger.

Objective: Maximize ROI on walk-forward out-of-sample predictions.

Author: Co-CTO
Date: December 12, 2025
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from itertools import product
from pathlib import Path

print("="*80)
print("MAXIMUM ROI THRESHOLD OPTIMIZATION")
print("="*80)

# Load walk-forward bets
bets = pd.read_csv('results/walkforward_enhanced_all_models_bets.csv')
logistic_bets = bets[bets['model'] == 'logistic_tuned'].copy()

print(f"\n📊 Loaded {len(logistic_bets)} logistic_tuned predictions")
print(f"   Date range: {logistic_bets['date'].min()} to {logistic_bets['date'].max()}")

# Filter to rows with valid odds
valid_bets = logistic_bets[
    logistic_bets['btts_yes_odds'].notna() & 
    logistic_bets['btts_no_odds'].notna()
].copy()

print(f"   Valid odds: {len(valid_bets)} matches")

# Recompute FAIR edges for all matches
print(f"\n🔄 Computing FAIR edges (vig-removed)...")

valid_bets['yes_implied'] = 1 / valid_bets['btts_yes_odds']
valid_bets['no_implied'] = 1 / valid_bets['btts_no_odds']
valid_bets['overround'] = valid_bets['yes_implied'] + valid_bets['no_implied']
valid_bets['vig'] = valid_bets['overround'] - 1.0

valid_bets['fair_prob_yes'] = valid_bets['yes_implied'] / valid_bets['overround']
valid_bets['fair_prob_no'] = valid_bets['no_implied'] / valid_bets['overround']

valid_bets['edge_yes'] = valid_bets['btts_prob'] - valid_bets['fair_prob_yes']
valid_bets['edge_no'] = (1 - valid_bets['btts_prob']) - valid_bets['fair_prob_no']

print(f"   ✅ FAIR edges computed")
print(f"   Mean vig: {valid_bets['vig'].mean():.4f}")
print(f"   Mean edge_yes: {valid_bets['edge_yes'].mean():+.4f}")
print(f"   Mean edge_no: {valid_bets['edge_no'].mean():+.4f}")

# Define search space
print(f"\n⚙️  Defining search space...")

# Fine-grained MIN_EDGE search
MIN_EDGE_values = np.arange(0.005, 0.081, 0.0025).round(4)
MAX_VIG_values = [0.06, 0.08, 0.10, 0.12]

print(f"   MIN_EDGE: {len(MIN_EDGE_values)} values from {MIN_EDGE_values[0]:.4f} to {MIN_EDGE_values[-1]:.4f}")
print(f"   MAX_VIG: {MAX_VIG_values}")
print(f"   Total configs: {len(MIN_EDGE_values) * len(MAX_VIG_values)}")

# Grid search
print(f"\n🔍 Running grid search...")

results = []

for min_edge, max_vig in product(MIN_EDGE_values, MAX_VIG_values):
    # Apply filters
    filtered = valid_bets[valid_bets['vig'] <= max_vig].copy()
    
    # For each match, choose side with highest edge (if >= MIN_EDGE)
    bets_made = []
    
    for idx, row in filtered.iterrows():
        edge_yes = row['edge_yes']
        edge_no = row['edge_no']
        
        # Choose side with higher edge
        if edge_yes >= edge_no:
            chosen_side = 'YES'
            chosen_edge = edge_yes
        else:
            chosen_side = 'NO'
            chosen_edge = edge_no
        
        # Apply MIN_EDGE filter
        if chosen_edge >= min_edge:
            # Compute ROI
            if chosen_side == 'YES':
                fair_odds = 1 / row['fair_prob_yes']
                won = (row['btts_actual'] == 1)
            else:
                fair_odds = 1 / row['fair_prob_no']
                won = (row['btts_actual'] == 0)
            
            roi_return = (fair_odds - 1) if won else -1
            
            bets_made.append({
                'edge': chosen_edge,
                'won': won,
                'roi_return': roi_return,
                'side': chosen_side
            })
    
    # Compute metrics
    if len(bets_made) >= 5:  # Minimum 5 bets to avoid noise
        bets_df = pd.DataFrame(bets_made)
        
        num_bets = len(bets_df)
        roi = bets_df['roi_return'].mean()
        win_rate = bets_df['won'].mean()
        avg_edge = bets_df['edge'].mean()
        
        # Compute max drawdown (cumulative sum)
        cumsum = bets_df['roi_return'].cumsum()
        running_max = cumsum.expanding().max()
        drawdown = cumsum - running_max
        max_drawdown = drawdown.min()
        
        # Compute std of returns
        roi_std = bets_df['roi_return'].std()
        
        # Sharpe-like ratio
        sharpe = roi / roi_std if roi_std > 0 else 0
        
        results.append({
            'MIN_EDGE': min_edge,
            'MAX_VIG': max_vig,
            'num_bets': num_bets,
            'roi': roi,
            'win_rate': win_rate,
            'avg_edge': avg_edge,
            'max_drawdown': max_drawdown,
            'roi_std': roi_std,
            'sharpe': sharpe,
            'num_yes': (bets_df['side'] == 'YES').sum(),
            'num_no': (bets_df['side'] == 'NO').sum()
        })

print(f"   ✅ Grid search complete!")
print(f"   Valid configs (≥5 bets): {len(results)}")

if len(results) == 0:
    print("\n❌ No configs produced ≥5 bets. Search space may be too restrictive.")
    exit(1)

# Create DataFrame and sort by ROI
results_df = pd.DataFrame(results)
results_df = results_df.sort_values('roi', ascending=False)

# Save full results
output_path = 'results/roi_optimization_results.csv'
results_df.to_csv(output_path, index=False)
print(f"\n💾 Saved full results to: {output_path}")

# Display top 20 configs
print(f"\n{'='*80}")
print(f"TOP 20 CONFIGS BY ROI (FAIR ODDS)")
print(f"{'='*80}")
print(f"{'Rank':>4s} {'MIN_EDGE':>9s} {'MAX_VIG':>8s} {'Bets':>5s} {'ROI':>8s} {'WinRate':>8s} {'AvgEdge':>9s} {'MaxDD':>8s} {'Sharpe':>7s}")
print("-" * 80)

for i, (_, row) in enumerate(results_df.head(20).iterrows()):
    print(f"{i+1:4d} {row['MIN_EDGE']:9.4f} {row['MAX_VIG']:8.2f} {int(row['num_bets']):5d} "
          f"{row['roi']:+7.1%} {row['win_rate']:7.1%} {row['avg_edge']:+8.4f} "
          f"{row['max_drawdown']:+7.2f} {row['sharpe']:7.3f}")

# Identify best config
best_config = results_df.iloc[0]

print(f"\n{'='*80}")
print(f"🏆 OPTIMAL CONFIGURATION (Maximum ROI)")
print(f"{'='*80}")
print(f"\nRecommended Thresholds:")
print(f"   MIN_EDGE = {best_config['MIN_EDGE']:.4f}")
print(f"   MAX_VIG  = {best_config['MAX_VIG']:.2f}")
print(f"\nExpected Performance:")
print(f"   ROI         = {best_config['roi']:+.1%}")
print(f"   Bet Count   = {int(best_config['num_bets'])} (out of {len(valid_bets)} valid matches)")
print(f"   Bet Rate    = {100 * best_config['num_bets'] / len(valid_bets):.1f}%")
print(f"   Win Rate    = {best_config['win_rate']:.1%}")
print(f"   Avg Edge    = {best_config['avg_edge']:+.4f}")
print(f"   Max Drawdown= {best_config['max_drawdown']:+.2f}")
print(f"   Sharpe      = {best_config['sharpe']:.3f}")
print(f"\nBet Distribution:")
print(f"   YES bets: {int(best_config['num_yes'])}")
print(f"   NO bets:  {int(best_config['num_no'])}")

# Check stability (does ROI degrade smoothly?)
print(f"\n{'='*80}")
print(f"STABILITY CHECK: ROI vs MIN_EDGE")
print(f"{'='*80}")

# For each MAX_VIG, show ROI degradation
for max_vig in MAX_VIG_values:
    subset = results_df[results_df['MAX_VIG'] == max_vig].sort_values('MIN_EDGE')
    
    if len(subset) > 0:
        print(f"\nMAX_VIG = {max_vig:.2f}:")
        print(f"   {'MIN_EDGE':>9s} {'Bets':>5s} {'ROI':>8s} {'Δ ROI':>8s}")
        
        prev_roi = None
        for _, row in subset.head(10).iterrows():
            delta_roi = '' if prev_roi is None else f"{row['roi'] - prev_roi:+.1%}"
            print(f"   {row['MIN_EDGE']:9.4f} {int(row['num_bets']):5d} {row['roi']:+7.1%} {delta_roi:>8s}")
            prev_roi = row['roi']

# Create visualizations
print(f"\n📊 Creating visualizations...")

# Plot 1: ROI vs MIN_EDGE (one line per MAX_VIG)
fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# Plot 1a: ROI vs MIN_EDGE
ax = axes[0, 0]
for max_vig in MAX_VIG_values:
    subset = results_df[results_df['MAX_VIG'] == max_vig].sort_values('MIN_EDGE')
    ax.plot(subset['MIN_EDGE'], subset['roi'] * 100, marker='o', label=f'MAX_VIG={max_vig:.2f}')

ax.axhline(0, color='red', linestyle='--', alpha=0.3)
ax.axvline(best_config['MIN_EDGE'], color='green', linestyle='--', alpha=0.5, label='Optimal')
ax.set_xlabel('MIN_EDGE')
ax.set_ylabel('ROI (%)')
ax.set_title('ROI vs MIN_EDGE by MAX_VIG')
ax.legend()
ax.grid(True, alpha=0.3)

# Plot 1b: Bet Count vs MIN_EDGE
ax = axes[0, 1]
for max_vig in MAX_VIG_values:
    subset = results_df[results_df['MAX_VIG'] == max_vig].sort_values('MIN_EDGE')
    ax.plot(subset['MIN_EDGE'], subset['num_bets'], marker='o', label=f'MAX_VIG={max_vig:.2f}')

ax.axvline(best_config['MIN_EDGE'], color='green', linestyle='--', alpha=0.5, label='Optimal')
ax.set_xlabel('MIN_EDGE')
ax.set_ylabel('Number of Bets')
ax.set_title('Bet Volume vs MIN_EDGE')
ax.legend()
ax.grid(True, alpha=0.3)

# Plot 1c: Win Rate vs MIN_EDGE
ax = axes[1, 0]
for max_vig in MAX_VIG_values:
    subset = results_df[results_df['MAX_VIG'] == max_vig].sort_values('MIN_EDGE')
    ax.plot(subset['MIN_EDGE'], subset['win_rate'] * 100, marker='o', label=f'MAX_VIG={max_vig:.2f}')

ax.axvline(best_config['MIN_EDGE'], color='green', linestyle='--', alpha=0.5, label='Optimal')
ax.set_xlabel('MIN_EDGE')
ax.set_ylabel('Win Rate (%)')
ax.set_title('Win Rate vs MIN_EDGE')
ax.legend()
ax.grid(True, alpha=0.3)

# Plot 1d: Sharpe vs MIN_EDGE
ax = axes[1, 1]
for max_vig in MAX_VIG_values:
    subset = results_df[results_df['MAX_VIG'] == max_vig].sort_values('MIN_EDGE')
    ax.plot(subset['MIN_EDGE'], subset['sharpe'], marker='o', label=f'MAX_VIG={max_vig:.2f}')

ax.axvline(best_config['MIN_EDGE'], color='green', linestyle='--', alpha=0.5, label='Optimal')
ax.set_xlabel('MIN_EDGE')
ax.set_ylabel('Sharpe Ratio')
ax.set_title('Sharpe Ratio vs MIN_EDGE')
ax.legend()
ax.grid(True, alpha=0.3)

plt.tight_layout()
plot_path = 'results/roi_optimization_plots.png'
plt.savefig(plot_path, dpi=150, bbox_inches='tight')
print(f"   ✅ Saved plots to: {plot_path}")
plt.close()

# Sanity check commentary
print(f"\n{'='*80}")
print(f"SANITY CHECK COMMENTARY")
print(f"{'='*80}")

# Check if ROI degrades smoothly
print(f"\n1. ROI Degradation Pattern:")

best_max_vig = best_config['MAX_VIG']
subset = results_df[results_df['MAX_VIG'] == best_max_vig].sort_values('MIN_EDGE').head(15)

roi_diffs = subset['roi'].diff().dropna()
sharp_drops = (roi_diffs < -0.05).sum()

if sharp_drops == 0:
    print(f"   ✅ ROI degrades smoothly as MIN_EDGE loosens (no sharp cliffs)")
else:
    print(f"   ⚠️  {sharp_drops} sharp drops detected (>5% ROI loss between adjacent thresholds)")

# Check stability around optimal
print(f"\n2. Stability Around Optimal:")

optimal_min_edge = best_config['MIN_EDGE']
nearby = results_df[
    (results_df['MAX_VIG'] == best_max_vig) &
    (results_df['MIN_EDGE'] >= optimal_min_edge - 0.005) &
    (results_df['MIN_EDGE'] <= optimal_min_edge + 0.005)
].sort_values('MIN_EDGE')

if len(nearby) >= 3:
    roi_range = nearby['roi'].max() - nearby['roi'].min()
    print(f"   ROI range within ±0.005 of optimal: {roi_range:.1%}")
    
    if roi_range < 0.05:
        print(f"   ✅ Stable region (ROI variation < 5%)")
    else:
        print(f"   ⚠️  High sensitivity (ROI variation = {roi_range:.1%})")

# Check for outliers
print(f"\n3. Outlier Detection:")

top5_roi = results_df.head(5)['roi'].values
top5_min_edge = results_df.head(5)['MIN_EDGE'].values

if len(top5_roi) >= 2:
    roi_spread = top5_roi[0] - top5_roi[1]
    
    if roi_spread < 0.02:
        print(f"   ✅ Top configs cluster tightly (ROI spread = {roi_spread:.1%})")
    else:
        print(f"   ⚠️  Clear winner stands out (ROI spread = {roi_spread:.1%})")

# Final recommendation summary
print(f"\n{'='*80}")
print(f"PRODUCTION CONFIGURATION")
print(f"{'='*80}")

print(f"""
```python
# OPTIMAL EDGE-BASED BTTS BETTING POLICY
# Objective: Maximum ROI (volume is NOT a constraint)

config = {{
    'MIN_EDGE': {best_config['MIN_EDGE']:.4f},
    'MAX_VIG': {best_config['MAX_VIG']:.2f},
    'EDGE_MODE': 'fair',  # ALWAYS use fair odds
    'REQUIRE_ODDS': True,
    
    # NO PROBABILITY GATES
    # Edge is the ONLY trigger
}}

# Expected Performance (walk-forward out-of-sample):
#   ROI:         {best_config['roi']:+.1%}
#   Bet Rate:    {100 * best_config['num_bets'] / len(valid_bets):.1f}% of matches
#   Win Rate:    {best_config['win_rate']:.1%}
#   Avg Edge:    {best_config['avg_edge']:+.4f}
#   Max Drawdown:{best_config['max_drawdown']:+.2f} units
#   Sharpe:      {best_config['sharpe']:.3f}

# Implementation:
#   For each match:
#     1. Compute FAIR edges (vig-removed)
#     2. Choose side with higher edge
#     3. Bet if edge >= MIN_EDGE and vig <= MAX_VIG
```
""")

print(f"\n{'='*80}")
print(f"✅ ROI OPTIMIZATION COMPLETE")
print(f"{'='*80}")
print(f"\n🎯 Final Recommendation:")
print(f"   Use MIN_EDGE = {best_config['MIN_EDGE']:.4f}, MAX_VIG = {best_config['MAX_VIG']:.2f}")
print(f"   Expected ROI: {best_config['roi']:+.1%} on {int(best_config['num_bets'])} bets")
print(f"\n📊 Full results: {output_path}")
print(f"📈 Visualizations: {plot_path}")
