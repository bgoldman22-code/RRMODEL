#!/usr/bin/env python3
"""
Phase 3.5 Kelly Sizing Analysis
================================

Analyzes backtest results for the three production models:
  - Assists: Logistic PRA @ 0.55+ threshold
  - Points: LightGBM @ 0.60+ threshold
  - Rebounds: LightGBM @ 0.52+ threshold

Computes:
  1. Performance by predicted probability & edge buckets
  2. Theoretical Kelly fractions per bucket
  3. Practical tiered unit sizing (0-5U) using fractional Kelly
  4. Markdown report with recommended staking rules

Usage:
  python3 scripts/nba/a        "",
        "**Analysis Script:** `scripts/nba/analyze_phase3.5_kelly_sizing.py`",
        f"**Kelly Scaling Factor:** {KELLY_SCALE} (fractional Kelly)",
        f"**Minimum Sample Size:** {MIN_SAMPLE_SIZE} bets per bucket",
        f"**Minimum ROI Threshold:** {MIN_ROI_THRESHOLD}%",
        f"**Minimum Recommended Stake:** {MIN_RECOMMENDED_UNITS}U",
        "",e_phase3.5_kelly_sizing.py
"""

import json
import pandas as pd
import numpy as np
from pathlib import Path
from collections import defaultdict
from datetime import datetime


# Configuration
REPO_ROOT = Path(__file__).parent.parent.parent
BACKTEST_DIR = REPO_ROOT / "data" / "nba" / "backtests"
DOCS_DIR = REPO_ROOT / "docs"
OUTPUT_FILE = DOCS_DIR / "NBA_PHASE3.5_KELLY_TIERS.md"

# Kelly scaling parameters
KELLY_SCALE = 0.25  # Use 1/4 Kelly for conservatism
MIN_SAMPLE_SIZE = 30  # Minimum bets per bucket to recommend (lowered for smaller datasets)
MIN_ROI_THRESHOLD = 3.0  # Minimum ROI% to recommend betting (avoid marginal edges)
MIN_RECOMMENDED_UNITS = 0.5  # Minimum stake to recommend (filter out tiny bets)
BANKROLL_UNIT_PERCENT = 1.0  # 1U = 1% of bankroll

# Bucket definitions
PROB_BUCKETS = [
    (0.50, 0.53),
    (0.53, 0.55),
    (0.55, 0.57),
    (0.57, 0.60),
    (0.60, 0.63),
    (0.63, 0.66),
    (0.66, 0.70),
    (0.70, 1.00),
]

EDGE_BUCKETS = [
    (0.00, 0.03),
    (0.03, 0.05),
    (0.05, 0.08),
    (0.08, 0.10),
    (0.10, 1.00),
]

# Production model configuration
PRODUCTION_MODELS = {
    'assists': {
        'name': 'Assists (Logistic PRA)',
        'model_type': 'logistic_pra',
        'market': 'player_assists',
        'threshold': 0.55,
    },
    'points': {
        'name': 'Points (LightGBM)',
        'model_type': 'lgbm',
        'market': 'player_points',
        'threshold': 0.60,
    },
    'rebounds': {
        'name': 'Rebounds (LightGBM)',
        'model_type': 'lgbm',
        'market': 'player_rebounds',
        'threshold': 0.52,
    },
}


def american_to_decimal(american_odds):
    """Convert American odds to decimal odds."""
    if american_odds >= 0:
        return 1 + (american_odds / 100)
    else:
        return 1 + (100 / abs(american_odds))


def decimal_to_implied_prob(decimal_odds):
    """Convert decimal odds to implied probability."""
    return 1 / decimal_odds


def compute_kelly_fraction(predicted_prob, decimal_odds):
    """
    Compute full Kelly fraction.
    
    Formula: kelly = (b*p - q) / b
    where:
      b = decimal_odds - 1 (net odds)
      p = predicted_prob
      q = 1 - p
    
    Returns 0 if Kelly is negative (no bet territory).
    """
    b = decimal_odds - 1
    p = predicted_prob
    q = 1 - p
    
    if b <= 0:
        return 0.0
    
    kelly = (b * p - q) / b
    return max(0.0, kelly)


def kelly_to_units(kelly_full, kelly_scale=KELLY_SCALE, bankroll_unit_pct=BANKROLL_UNIT_PERCENT, max_units=5):
    """
    Convert full Kelly fraction to unit sizing.
    
    Args:
      kelly_full: Full Kelly fraction (e.g., 0.05 = 5% of bankroll)
      kelly_scale: Scaling factor for conservatism (e.g., 0.25 = quarter Kelly)
      bankroll_unit_pct: What percentage of bankroll is 1 unit (default 1%)
      max_units: Maximum units to bet (hard cap)
    
    Returns:
      Recommended units (0-max_units)
    """
    # Apply fractional Kelly
    kelly_fraction = kelly_full * kelly_scale
    
    # Convert to units (if 1U = 1% BR, then 5% of BR = 5U)
    units_raw = (kelly_fraction * 100) / bankroll_unit_pct
    
    # Clamp to [0, max_units]
    units = max(0, min(max_units, units_raw))
    
    return units


def load_logistic_backtest():
    """Load Phase 3 logistic PRA backtest data."""
    file_path = BACKTEST_DIR / "phase3_backtest_v1_20251124.json"
    
    if not file_path.exists():
        print(f"Warning: {file_path} not found, skipping logistic backtest")
        return pd.DataFrame()
    
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    # Handle nested structure with 'results' array
    entries = data.get('results', [])
    
    rows = []
    for entry in entries:
        # Extract relevant fields
        # Use phase3_probability for the logistic model prediction
        predicted_prob = entry.get('phase3_probability')
        
        row = {
            'date': entry.get('date'),
            'market': entry.get('market'),
            'side': entry.get('side'),
            'model_type': 'logistic_pra',
            'predicted_prob': predicted_prob,
            'odds_american': entry.get('odds'),
            'actual_result': 1 if entry.get('won') is True else 0,
            'player': entry.get('player'),
            'line': entry.get('line'),
        }
        
        # Only include if we have required fields
        if row['predicted_prob'] is not None and row['odds_american'] is not None:
            rows.append(row)
    
    df = pd.DataFrame(rows)
    print(f"Loaded {len(df)} logistic PRA bets from {file_path.name}")
    return df


def load_lgbm_backtest():
    """Load Phase 3 LightGBM backtest data."""
    file_path = BACKTEST_DIR / "phase3_lgbm_thresholds_raw_v1_20251125.json"
    
    if not file_path.exists():
        print(f"Warning: {file_path} not found, skipping LightGBM backtest")
        return pd.DataFrame()
    
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    # Handle nested structure with 'examples' array
    entries = data.get('examples', [])
    
    rows = []
    for entry in entries:
        # Extract relevant fields
        # Use p_win_lgbm for the model prediction
        predicted_prob = entry.get('p_win_lgbm')
        
        row = {
            'date': entry.get('date'),
            'market': entry.get('market'),
            'side': entry.get('side'),
            'model_type': 'lgbm',
            'predicted_prob': predicted_prob,
            'odds_american': entry.get('odds'),
            'actual_result': entry.get('result', 0),
            'player': entry.get('player'),
            'line': entry.get('line'),
        }
        
        # Only include if we have required fields
        if row['predicted_prob'] is not None and row['odds_american'] is not None:
            rows.append(row)
    
    df = pd.DataFrame(rows)
    print(f"Loaded {len(df)} LightGBM bets from {file_path.name}")
    return df


def compute_derived_fields(df):
    """Add decimal odds, implied prob, edge, and Kelly fraction to dataframe."""
    # Convert odds
    df['decimal_odds'] = df['odds_american'].apply(american_to_decimal)
    df['implied_prob'] = df['decimal_odds'].apply(decimal_to_implied_prob)
    
    # Compute edge
    df['edge'] = df['predicted_prob'] - df['implied_prob']
    
    # Compute full Kelly fraction
    df['kelly_full'] = df.apply(
        lambda row: compute_kelly_fraction(row['predicted_prob'], row['decimal_odds']),
        axis=1
    )
    
    # Compute profit per bet (assuming 1U flat stake)
    df['profit'] = df.apply(
        lambda row: (row['decimal_odds'] - 1) if row['actual_result'] == 1 else -1,
        axis=1
    )
    
    return df


def get_bucket_label(value, buckets, is_prob=False):
    """Assign a value to a bucket and return label."""
    for low, high in buckets:
        if low <= value < high:
            if is_prob:
                return f"[{low:.2f}, {high:.2f})"
            else:
                return f"[{low:.2f}, {high:.2f})"
    return None


def analyze_model_buckets(df, model_config):
    """
    Analyze performance by probability and edge buckets for a single model.
    
    Returns: List of bucket stats dicts
    """
    market = model_config['market']
    model_type = model_config['model_type']
    threshold = model_config['threshold']
    
    # Filter to this model and above threshold
    model_df = df[
        (df['market'] == market) & 
        (df['model_type'] == model_type) &
        (df['predicted_prob'] >= threshold)
    ].copy()
    
    if len(model_df) == 0:
        print(f"  No data for {model_config['name']}")
        return []
    
    # Assign buckets
    model_df['prob_bucket'] = model_df['predicted_prob'].apply(
        lambda x: get_bucket_label(x, PROB_BUCKETS, is_prob=True)
    )
    model_df['edge_bucket'] = model_df['edge'].apply(
        lambda x: get_bucket_label(x, EDGE_BUCKETS, is_prob=False)
    )
    
    # Remove rows without valid buckets
    model_df = model_df[model_df['prob_bucket'].notna() & model_df['edge_bucket'].notna()]
    
    # Group by both buckets
    bucket_stats = []
    
    for (prob_bucket, edge_bucket), group in model_df.groupby(['prob_bucket', 'edge_bucket']):
        n_bets = len(group)
        
        if n_bets < MIN_SAMPLE_SIZE:
            continue  # Skip small samples
        
        wins = group['actual_result'].sum()
        win_rate = wins / n_bets
        
        total_profit = group['profit'].sum()
        roi = (total_profit / n_bets) * 100
        
        # CRITICAL: Only include buckets with positive ROI above threshold
        if roi < MIN_ROI_THRESHOLD:
            continue
        
        avg_prob = group['predicted_prob'].mean()
        avg_edge = group['edge'].mean()
        avg_odds = group['decimal_odds'].mean()
        
        median_kelly = group['kelly_full'].median()
        mean_kelly = group['kelly_full'].mean()
        
        # Compute recommended units
        recommended_units = kelly_to_units(median_kelly)
        
        # Filter out stakes that are too small
        if recommended_units < MIN_RECOMMENDED_UNITS:
            continue
        
        bucket_stats.append({
            'prob_bucket': prob_bucket,
            'edge_bucket': edge_bucket,
            'n_bets': n_bets,
            'win_rate': win_rate,
            'roi': roi,
            'avg_prob': avg_prob,
            'avg_edge': avg_edge,
            'avg_decimal_odds': avg_odds,
            'median_kelly': median_kelly,
            'mean_kelly': mean_kelly,
            'recommended_units': recommended_units,
        })
    
    return bucket_stats


def format_bucket_table(bucket_stats):
    """Format bucket stats as a markdown table."""
    if not bucket_stats:
        return "No qualifying buckets found.\n"
    
    lines = [
        "| Prob Bucket | Edge Bucket | N Bets | Win% | ROI% | Avg Edge | Median Kelly | Recommended Units |",
        "|-------------|-------------|--------|------|------|----------|--------------|-------------------|",
    ]
    
    # Sort by recommended units (descending), then by win rate
    sorted_stats = sorted(
        bucket_stats, 
        key=lambda x: (x['recommended_units'], x['win_rate']),
        reverse=True
    )
    
    for stat in sorted_stats:
        lines.append(
            f"| {stat['prob_bucket']} | {stat['edge_bucket']} | "
            f"{stat['n_bets']:,} | {stat['win_rate']*100:.1f}% | "
            f"{stat['roi']:+.1f}% | {stat['avg_edge']*100:.1f}pp | "
            f"{stat['median_kelly']:.4f} | **{stat['recommended_units']:.1f}U** |"
        )
    
    return "\n".join(lines) + "\n"


def generate_sizing_rules(bucket_stats, model_name):
    """Generate human-readable sizing rules from bucket stats."""
    if not bucket_stats:
        return f"No qualifying betting tiers found for {model_name}.\n"
    
    # Group by recommended units
    units_groups = defaultdict(list)
    for stat in bucket_stats:
        units = round(stat['recommended_units'], 1)
        if units >= 0.5:  # Only include meaningful stakes
            units_groups[units].append(stat)
    
    if not units_groups:
        return f"No qualifying betting tiers found for {model_name}.\n"
    
    lines = [f"### {model_name} Sizing Rules\n"]
    
    # Sort by units descending
    for units in sorted(units_groups.keys(), reverse=True):
        stats = units_groups[units]
        
        # Summarize this tier
        avg_win_rate = np.mean([s['win_rate'] for s in stats])
        avg_roi = np.mean([s['roi'] for s in stats])
        total_bets = sum([s['n_bets'] for s in stats])
        
        # Get probability and edge ranges
        prob_ranges = set([s['prob_bucket'] for s in stats])
        edge_ranges = set([s['edge_bucket'] for s in stats])
        
        lines.append(f"**{units}U Tier:**")
        lines.append(f"- Win Rate: {avg_win_rate*100:.1f}%")
        lines.append(f"- ROI: {avg_roi:+.1f}%")
        lines.append(f"- Sample Size: {total_bets:,} bets")
        lines.append(f"- Probability Ranges: {', '.join(sorted(prob_ranges))}")
        lines.append(f"- Edge Ranges: {', '.join(sorted(edge_ranges))}")
        lines.append("")
    
    return "\n".join(lines)


def generate_markdown_report(results):
    """Generate comprehensive markdown report."""
    lines = [
        "# Phase 3.5 Kelly Sizing Analysis",
        "",
        f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "## Overview",
        "",
        "This analysis examines backtest results for the three production models:",
        "- **Assists:** Logistic PRA @ 0.55+ threshold",
        "- **Points:** LightGBM @ 0.60+ threshold",
        "- **Rebounds:** LightGBM @ 0.52+ threshold",
        "",
        "The goal is to establish a **tiered Kelly staking system** with a **5U maximum** per wager.",
        "",
        "## Methodology",
        "",
        f"1. **Data:** Historical backtest results (per-bet level)",
        f"2. **Buckets:** Probability × Edge grid",
        f"   - Probability ranges: {', '.join([f'[{low:.2f}, {high:.2f})' for low, high in PROB_BUCKETS])}",
        f"   - Edge ranges: {', '.join([f'[{low:.2f}, {high:.2f})' for low, high in EDGE_BUCKETS])}",
        f"3. **Kelly Calculation:** Full Kelly = (b·p - q) / b, where b = decimal_odds - 1",
        f"4. **Fractional Kelly:** Using **{KELLY_SCALE:.0%} Kelly** for conservatism",
        f"5. **Unit Mapping:** 1U = {BANKROLL_UNIT_PERCENT}% of bankroll",
        f"6. **Minimum Sample:** {MIN_SAMPLE_SIZE} bets per bucket",
        f"7. **Minimum ROI:** {MIN_ROI_THRESHOLD}% (filters out marginal edges)",
        f"8. **Minimum Stake:** {MIN_RECOMMENDED_UNITS}U (filters out tiny bets)",
        f"9. **Hard Cap:** Maximum 5U per wager",
        "",
        "## Results by Market",
        "",
    ]
    
    # Add each model's results
    for model_key, model_results in results.items():
        model_config = PRODUCTION_MODELS[model_key]
        model_name = model_config['name']
        bucket_stats = model_results['bucket_stats']
        
        lines.append(f"### {model_name}")
        lines.append("")
        lines.append(f"**Threshold:** {model_config['threshold']:.2f}")
        lines.append(f"**Total Qualifying Bets:** {model_results['total_bets']:,}")
        lines.append("")
        
        if bucket_stats:
            lines.append("#### Bucket Performance")
            lines.append("")
            lines.append(format_bucket_table(bucket_stats))
            lines.append("")
            lines.append(generate_sizing_rules(bucket_stats, model_name))
        else:
            lines.append("*No qualifying buckets found.*")
            lines.append("")
    
    # Add summary and caveats
    lines.extend([
        "---",
        "",
        "## Recommended Staking System",
        "",
        "### Quick Reference",
        "",
    ])
    
    for model_key in ['assists', 'points', 'rebounds']:
        model_config = PRODUCTION_MODELS[model_key]
        model_results = results[model_key]
        bucket_stats = model_results['bucket_stats']
        
        if not bucket_stats:
            lines.append(f"**{model_config['name']}:** No qualifying tiers")
            continue
        
        # Get max recommended units
        max_units = max([s['recommended_units'] for s in bucket_stats])
        n_tiers = len(set([round(s['recommended_units'], 1) for s in bucket_stats if s['recommended_units'] >= 0.5]))
        
        lines.append(f"**{model_config['name']}:**")
        lines.append(f"- {n_tiers} active betting tiers")
        lines.append(f"- Maximum stake: {max_units:.1f}U")
        lines.append(f"- Threshold: {model_config['threshold']:.2f}+")
        lines.append("")
    
    lines.extend([
        "---",
        "",
        "## Implementation Notes",
        "",
        "### In Production",
        "",
        "When generating predictions with `generate-predictions-phase3.5.mjs`:",
        "",
        "1. Each prediction includes `modelProbability` (p̂) and `edge` fields",
        "2. Look up the appropriate tier based on:",
        "   - Model type (assists/points/rebounds)",
        "   - Predicted probability bucket",
        "   - Edge bucket",
        "3. Assign `kellyStake` based on the tier",
        "4. Never exceed 5U per bet",
        "",
        "### Caveats & Overfitting Risks",
        "",
        "⚠️ **Important Limitations:**",
        "",
        "1. **Historical Bias:** These tiers are derived from backtest data and may not generalize perfectly to future bets.",
        "2. **Small Samples:** Some buckets may have limited sample sizes despite our minimum threshold.",
        "3. **Market Changes:** Sportsbook lines and market efficiency evolve over time.",
        "4. **Fractional Kelly:** We use 1/4 Kelly to reduce risk, but even fractional Kelly can be aggressive.",
        "5. **Correlation:** Multiple props on the same player/game are correlated; adjust position sizing accordingly.",
        "",
        "### Monitoring & Adjustment",
        "",
        "**Recommended practices:**",
        "",
        "- Track actual performance vs. predicted for each tier",
        "- Re-run this analysis quarterly with fresh data",
        "- Consider reducing stakes if realized performance diverges from backtest",
        "- Use bankroll management: never risk >20% of total bankroll across all open positions",
        "",
        "---",
        "",
        f"**Analysis Script:** `scripts/nba/analyze_phase3.5_kelly_sizing.py`",
        f"**Kelly Scaling Factor:** {KELLY_SCALE} (fractional Kelly)",
        f"**Minimum Sample Size:** {MIN_SAMPLE_SIZE} bets per bucket",
        "",
    ])
    
    return "\n".join(lines)


def main():
    """Main analysis pipeline."""
    print("=" * 60)
    print("Phase 3.5 Kelly Sizing Analysis")
    print("=" * 60)
    print()
    
    # Load data
    print("Loading backtest data...")
    logistic_df = load_logistic_backtest()
    lgbm_df = load_lgbm_backtest()
    
    # Combine
    all_df = pd.concat([logistic_df, lgbm_df], ignore_index=True)
    print(f"\nTotal bets loaded: {len(all_df):,}")
    
    if len(all_df) == 0:
        print("ERROR: No backtest data found. Exiting.")
        return
    
    # Compute derived fields
    print("\nComputing edge, implied probability, and Kelly fractions...")
    all_df = compute_derived_fields(all_df)
    
    # Analyze each production model
    print("\nAnalyzing production models...")
    results = {}
    
    for model_key, model_config in PRODUCTION_MODELS.items():
        print(f"\n{model_config['name']}:")
        bucket_stats = analyze_model_buckets(all_df, model_config)
        
        # Count total qualifying bets
        market = model_config['market']
        model_type = model_config['model_type']
        threshold = model_config['threshold']
        
        total_bets = len(all_df[
            (all_df['market'] == market) & 
            (all_df['model_type'] == model_type) &
            (all_df['predicted_prob'] >= threshold)
        ])
        
        print(f"  Total bets above threshold: {total_bets:,}")
        print(f"  Qualifying buckets: {len(bucket_stats)}")
        
        if bucket_stats:
            max_units = max([s['recommended_units'] for s in bucket_stats])
            print(f"  Max recommended stake: {max_units:.1f}U")
        
        results[model_key] = {
            'bucket_stats': bucket_stats,
            'total_bets': total_bets,
        }
    
    # Generate markdown report
    print("\n" + "=" * 60)
    print("Generating markdown report...")
    
    DOCS_DIR.mkdir(exist_ok=True)
    report = generate_markdown_report(results)
    
    with open(OUTPUT_FILE, 'w') as f:
        f.write(report)
    
    print(f"✅ Report written to: {OUTPUT_FILE}")
    print()
    
    # Print summary
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    for model_key in ['assists', 'points', 'rebounds']:
        model_config = PRODUCTION_MODELS[model_key]
        model_results = results[model_key]
        bucket_stats = model_results['bucket_stats']
        
        print(f"\n{model_config['name']}:")
        print(f"  Threshold: {model_config['threshold']:.2f}+")
        print(f"  Total bets: {model_results['total_bets']:,}")
        
        if bucket_stats:
            tiers = sorted(set([round(s['recommended_units'], 1) for s in bucket_stats if s['recommended_units'] >= 0.5]))
            print(f"  Active tiers: {len(tiers)} ({', '.join([f'{t}U' for t in tiers])})")
            
            max_units = max([s['recommended_units'] for s in bucket_stats])
            print(f"  Max stake: {max_units:.1f}U")
        else:
            print("  No qualifying tiers")
    
    print("\n" + "=" * 60)
    print(f"✅ Analysis complete!")
    print(f"📄 Review: {OUTPUT_FILE}")
    print("=" * 60)


if __name__ == "__main__":
    main()
