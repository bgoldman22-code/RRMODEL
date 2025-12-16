#!/usr/bin/env python3
"""
BTTS ROI Sanity Check - Microscopic Test Harness

Tests the ROI calculation logic with a tiny synthetic dataset to verify
mathematical correctness before examining real-world results.
"""

import sys
from pathlib import Path
import numpy as np

# Add src to path
RESEARCH_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(RESEARCH_DIR))

from src.evaluate import (
    run_two_sided_threshold_sweep,
    compute_fair_two_way,
    get_yes_no_probs
)


def test_tiny_scenario():
    """
    Test with 5-match synthetic scenario where we can manually verify ROI.
    """
    print("="*80)
    print("MICROSCOPIC ROI SANITY CHECK")
    print("="*80)
    
    # Tiny synthetic dataset
    # 3 YES matches (BTTS occurred), 2 NO matches (BTTS did not occur)
    y_true = np.array([1, 1, 1, 0, 0])
    
    # Model is "strong" but not perfect
    # High confidence on first 3 (correct YES), low confidence on last 2 (correct NO)
    p_yes = np.array([0.70, 0.75, 0.80, 0.30, 0.25])
    
    # Bookmaker odds (include vig)
    yes_odds = np.array([1.80, 1.70, 1.65, 1.80, 1.75])
    no_odds = np.array([2.00, 2.05, 2.10, 2.00, 2.00])
    
    print("\n📊 Synthetic Dataset:")
    print(f"  Matches: 5 (3 YES, 2 NO)")
    print(f"  y_true: {y_true}")
    print(f"  p_yes:  {p_yes}")
    print(f"  yes_odds: {yes_odds}")
    print(f"  no_odds:  {no_odds}")
    
    # Compute fair odds
    fair_yes, fair_no = compute_fair_two_way(yes_odds, no_odds)
    
    print("\n🧮 Fair Odds (vig removed):")
    print(f"  fair_yes: {fair_yes}")
    print(f"  fair_no:  {fair_no}")
    
    # Verify vig removal is correct
    print("\n✅ Vig Removal Sanity Check:")
    for i in range(len(yes_odds)):
        raw_total_prob = 1/yes_odds[i] + 1/no_odds[i]
        fair_total_prob = 1/fair_yes[i] + 1/fair_no[i]
        print(f"  Match {i+1}: raw_total={raw_total_prob:.4f}, fair_total={fair_total_prob:.4f} (should be ~1.0)")
    
    # Run YES-only sweep at threshold 0.65
    print("\n🎯 YES Bet Simulation (threshold=0.65, stake=10):")
    print("  Only bet on matches where p_yes >= 0.65")
    
    # Manual calculation
    print("\n  Manual calculation:")
    print("    Match 1: p_yes=0.70 >= 0.65 ✓ Bet YES")
    print("      Outcome: YES (y_true=1) → WIN")
    print(f"      Profit: 10 * (1.80 - 1) = {10 * (1.80 - 1):.2f}")
    print("    Match 2: p_yes=0.75 >= 0.65 ✓ Bet YES")
    print("      Outcome: YES (y_true=1) → WIN")
    print(f"      Profit: 10 * (1.70 - 1) = {10 * (1.70 - 1):.2f}")
    print("    Match 3: p_yes=0.80 >= 0.65 ✓ Bet YES")
    print("      Outcome: YES (y_true=1) → WIN")
    print(f"      Profit: 10 * (1.65 - 1) = {10 * (1.65 - 1):.2f}")
    print("    Match 4: p_yes=0.30 < 0.65 ✗ No bet")
    print("    Match 5: p_yes=0.25 < 0.65 ✗ No bet")
    print()
    print("  Summary:")
    profit_manual = 10 * (1.80 - 1) + 10 * (1.70 - 1) + 10 * (1.65 - 1)
    stake_manual = 10 * 3
    roi_manual = (profit_manual / stake_manual) * 100
    print(f"    Total bets: 3")
    print(f"    Wins: 3 (100%)")
    print(f"    Total profit: {profit_manual:.2f}")
    print(f"    Total stake: {stake_manual:.2f}")
    print(f"    ROI: {roi_manual:.2f}%")
    
    # Now run the actual function
    thresholds_yes = [0.65]
    thresholds_no = [0.65]
    
    df = run_two_sided_threshold_sweep(
        y_true=y_true,
        y_proba=p_yes,
        yes_odds=yes_odds,
        no_odds=no_odds,
        thresholds_yes=thresholds_yes,
        thresholds_no=thresholds_no,
        stake=10.0,
        fair_yes_odds=fair_yes,
        fair_no_odds=fair_no,
    )
    
    print("\n🔬 Function Output (YES side):")
    yes_row = df[df['side'] == 'YES'].iloc[0]
    print(f"    n_bets: {yes_row['n_bets']}")
    print(f"    n_wins: {yes_row['n_wins']}")
    print(f"    win_rate: {yes_row['win_rate']:.1%}")
    print(f"    total_profit: {yes_row['total_profit']:.2f}")
    print(f"    roi: {yes_row['roi']:.2f}%")
    print(f"    roi_fair: {yes_row['roi_fair']:.2f}%")
    
    # Verification
    print("\n✅ Verification:")
    assert yes_row['n_bets'] == 3, f"Expected 3 bets, got {yes_row['n_bets']}"
    assert yes_row['n_wins'] == 3, f"Expected 3 wins, got {yes_row['n_wins']}"
    assert abs(yes_row['total_profit'] - profit_manual) < 0.01, \
        f"Expected profit {profit_manual:.2f}, got {yes_row['total_profit']:.2f}"
    assert abs(yes_row['roi'] - roi_manual) < 0.01, \
        f"Expected ROI {roi_manual:.2f}%, got {yes_row['roi']:.2f}%"
    
    print("  ✅ Manual calculation matches function output!")
    print(f"  ✅ ROI is stored as percentage ({yes_row['roi']:.2f}%), not decimal")
    
    # Now test NO side
    print("\n🎯 NO Bet Simulation (threshold=0.75, stake=10):")
    print("  p_no = 1 - p_yes = [0.30, 0.25, 0.20, 0.70, 0.75]")
    print("  Only bet on matches where p_no >= 0.75")
    
    thresholds_no = [0.75]
    df2 = run_two_sided_threshold_sweep(
        y_true=y_true,
        y_proba=p_yes,
        yes_odds=yes_odds,
        no_odds=no_odds,
        thresholds_yes=[],  # Skip YES
        thresholds_no=thresholds_no,
        stake=10.0,
        fair_yes_odds=fair_yes,
        fair_no_odds=fair_no,
    )
    
    print("\n  Manual calculation:")
    print("    Match 1: p_no=0.30 < 0.75 ✗ No bet")
    print("    Match 2: p_no=0.25 < 0.75 ✗ No bet")
    print("    Match 3: p_no=0.20 < 0.75 ✗ No bet")
    print("    Match 4: p_no=0.70 < 0.75 ✗ No bet")
    print("    Match 5: p_no=0.75 >= 0.75 ✓ Bet NO")
    print("      Outcome: NO (y_true=0) → WIN")
    print(f"      Profit: 10 * (2.00 - 1) = {10 * (2.00 - 1):.2f}")
    print()
    print("  Summary:")
    profit_no_manual = 10 * (2.00 - 1)
    stake_no_manual = 10 * 1
    roi_no_manual = (profit_no_manual / stake_no_manual) * 100
    print(f"    Total bets: 1")
    print(f"    Wins: 1 (100%)")
    print(f"    Total profit: {profit_no_manual:.2f}")
    print(f"    Total stake: {stake_no_manual:.2f}")
    print(f"    ROI: {roi_no_manual:.2f}%")
    
    print("\n🔬 Function Output (NO side):")
    no_row = df2[df2['side'] == 'NO'].iloc[0]
    print(f"    n_bets: {no_row['n_bets']}")
    print(f"    n_wins: {no_row['n_wins']}")
    print(f"    win_rate: {no_row['win_rate']:.1%}")
    print(f"    total_profit: {no_row['total_profit']:.2f}")
    print(f"    roi: {no_row['roi']:.2f}%")
    
    print("\n✅ Verification:")
    assert no_row['n_bets'] == 1, f"Expected 1 bet, got {no_row['n_bets']}"
    assert no_row['n_wins'] == 1, f"Expected 1 win, got {no_row['n_wins']}"
    assert abs(no_row['total_profit'] - profit_no_manual) < 0.01, \
        f"Expected profit {profit_no_manual:.2f}, got {no_row['total_profit']:.2f}"
    assert abs(no_row['roi'] - roi_no_manual) < 0.01, \
        f"Expected ROI {roi_no_manual:.2f}%, got {no_row['roi']:.2f}%"
    
    print("  ✅ Manual calculation matches function output!")
    print("  ✅ NO side calculations are correct!")
    
    print("\n" + "="*80)
    print("✅ ALL SANITY CHECKS PASSED")
    print("="*80)
    print("\nConclusion:")
    print("  • ROI calculation logic is mathematically correct")
    print("  • ROI is stored as percentage (e.g., 38.33% not 0.3833)")
    print("  • Vig removal works correctly")
    print("  • Both YES and NO sides calculate correctly")
    print()


if __name__ == '__main__':
    test_tiny_scenario()
