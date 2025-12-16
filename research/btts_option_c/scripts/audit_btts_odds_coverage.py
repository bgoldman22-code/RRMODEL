#!/usr/bin/env python3
"""
BTTS Odds Coverage Audit Script

Analyzes the availability and completeness of BTTS Yes and BTTS No odds
in the unified matches dataset.

Usage:
    python scripts/audit_btts_odds_coverage.py
"""

import sys
from pathlib import Path
import pandas as pd
import numpy as np

# Add src to path
SCRIPT_DIR = Path(__file__).parent
RESEARCH_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(RESEARCH_DIR / 'src'))

from load_data import load_unified_data


def audit_btts_odds_coverage():
    """
    Audit BTTS odds coverage in the unified dataset.
    
    Reports:
    - Total matches
    - Matches with both Yes and No odds
    - Matches with only Yes odds
    - Matches with only No odds
    - Matches with neither
    - Summary statistics for each odds type
    """
    print("=" * 80)
    print("BTTS ODDS COVERAGE AUDIT".center(80))
    print("=" * 80)
    print()
    
    # Load unified data
    print("📥 Loading unified matches dataset...")
    df = load_unified_data()
    print(f"   ✅ Loaded {len(df)} matches")
    print()
    
    # Total matches
    total_matches = len(df)
    
    # Check availability of each odds type
    has_yes_odds = df['btts_yes_odds'].notna()
    has_no_odds = df['btts_no_odds'].notna()
    
    # Coverage categories
    both_odds_count = (has_yes_odds & has_no_odds).sum()
    yes_only_count = (has_yes_odds & ~has_no_odds).sum()
    no_only_count = (~has_yes_odds & has_no_odds).sum()
    neither_count = (~has_yes_odds & ~has_no_odds).sum()
    
    # Calculate percentages
    both_odds_pct = (both_odds_count / total_matches) * 100
    yes_only_pct = (yes_only_count / total_matches) * 100
    no_only_pct = (no_only_count / total_matches) * 100
    neither_pct = (neither_count / total_matches) * 100
    
    # Print coverage summary
    print("=" * 80)
    print("ODDS COVERAGE SUMMARY".center(80))
    print("=" * 80)
    print()
    print(f"Total matches: {total_matches}")
    print()
    print(f"Both Yes & No odds present:  {both_odds_count:4d} ({both_odds_pct:5.1f}%)")
    print(f"Only Yes odds present:       {yes_only_count:4d} ({yes_only_pct:5.1f}%)")
    print(f"Only No odds present:        {no_only_count:4d} ({no_only_pct:5.1f}%)")
    print(f"Neither present:             {neither_count:4d} ({neither_pct:5.1f}%)")
    print()
    
    # Sanity check
    total_check = both_odds_count + yes_only_count + no_only_count + neither_count
    assert total_check == total_matches, f"Coverage counts don't add up: {total_check} != {total_matches}"
    
    # Summary statistics for each odds type
    print("=" * 80)
    print("BTTS YES ODDS STATISTICS".center(80))
    print("=" * 80)
    print()
    
    if has_yes_odds.sum() > 0:
        yes_odds = df.loc[has_yes_odds, 'btts_yes_odds']
        print(f"Available:  {len(yes_odds):4d} matches ({(len(yes_odds)/total_matches)*100:.1f}%)")
        print(f"Min:        {yes_odds.min():.2f}")
        print(f"Max:        {yes_odds.max():.2f}")
        print(f"Mean:       {yes_odds.mean():.2f}")
        print(f"Median:     {yes_odds.median():.2f}")
        print(f"Std Dev:    {yes_odds.std():.2f}")
    else:
        print("⚠️  No BTTS Yes odds available")
    
    print()
    print("=" * 80)
    print("BTTS NO ODDS STATISTICS".center(80))
    print("=" * 80)
    print()
    
    if has_no_odds.sum() > 0:
        no_odds = df.loc[has_no_odds, 'btts_no_odds']
        print(f"Available:  {len(no_odds):4d} matches ({(len(no_odds)/total_matches)*100:.1f}%)")
        print(f"Min:        {no_odds.min():.2f}")
        print(f"Max:        {no_odds.max():.2f}")
        print(f"Mean:       {no_odds.mean():.2f}")
        print(f"Median:     {no_odds.median():.2f}")
        print(f"Std Dev:    {no_odds.std():.2f}")
    else:
        print("⚠️  No BTTS No odds available")
    
    print()
    print("=" * 80)
    print("VIG ANALYSIS (When Both Odds Available)".center(80))
    print("=" * 80)
    print()
    
    if both_odds_count > 0:
        # Calculate implied probabilities and vig
        both_mask = has_yes_odds & has_no_odds
        yes_implied = 1.0 / df.loc[both_mask, 'btts_yes_odds']
        no_implied = 1.0 / df.loc[both_mask, 'btts_no_odds']
        total_implied = yes_implied + no_implied
        vig = total_implied - 1.0
        
        print(f"Matches with both odds: {both_odds_count}")
        print()
        print(f"Average Yes implied prob: {yes_implied.mean():.3f} ({yes_implied.mean()*100:.1f}%)")
        print(f"Average No implied prob:  {no_implied.mean():.3f} ({no_implied.mean()*100:.1f}%)")
        print(f"Average total probability: {total_implied.mean():.3f}")
        print(f"Average vig (overround):  {vig.mean():.3f} ({vig.mean()*100:.1f}%)")
        print(f"Min vig:                  {vig.min():.3f} ({vig.min()*100:.1f}%)")
        print(f"Max vig:                  {vig.max():.3f} ({vig.max()*100:.1f}%)")
    else:
        print("⚠️  No matches with both Yes and No odds available for vig analysis")
    
    print()
    print("=" * 80)
    print("AUDIT COMPLETE".center(80))
    print("=" * 80)
    print()
    
    # Return summary dict for programmatic use
    return {
        'total_matches': total_matches,
        'both_odds': both_odds_count,
        'both_odds_pct': both_odds_pct,
        'yes_only': yes_only_count,
        'yes_only_pct': yes_only_pct,
        'no_only': no_only_count,
        'no_only_pct': no_only_pct,
        'neither': neither_count,
        'neither_pct': neither_pct,
        'yes_odds_stats': {
            'count': has_yes_odds.sum(),
            'min': df.loc[has_yes_odds, 'btts_yes_odds'].min() if has_yes_odds.sum() > 0 else None,
            'max': df.loc[has_yes_odds, 'btts_yes_odds'].max() if has_yes_odds.sum() > 0 else None,
            'mean': df.loc[has_yes_odds, 'btts_yes_odds'].mean() if has_yes_odds.sum() > 0 else None,
        },
        'no_odds_stats': {
            'count': has_no_odds.sum(),
            'min': df.loc[has_no_odds, 'btts_no_odds'].min() if has_no_odds.sum() > 0 else None,
            'max': df.loc[has_no_odds, 'btts_no_odds'].max() if has_no_odds.sum() > 0 else None,
            'mean': df.loc[has_no_odds, 'btts_no_odds'].mean() if has_no_odds.sum() > 0 else None,
        }
    }


if __name__ == '__main__':
    try:
        summary = audit_btts_odds_coverage()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
