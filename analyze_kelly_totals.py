#!/usr/bin/env python3
"""
Analyze why Kelly is near-zero for high-edge totals picks
"""

print('🔬 KELLY CALCULATION ANALYSIS')
print('=' * 70)
print()

# WSH Total UNDER 236.5 at -107 odds
print('PICK: Total UNDER 236.5')
print('  Model prediction: 228.4')
print('  Vegas line: 236.5')
print('  Edge: 8.1 points')
print('  Odds: -107')
print()

# Current code's probability estimation
total_edge = 8.1
fair_line = 236.5
prob_estimate = 0.5 + (total_edge / fair_line) * 0.5

print('CURRENT CODE CALCULATION:')
print(f'  totalModelProb = 0.5 + ({total_edge} / {fair_line}) * 0.5')
print(f'                 = 0.5 + {total_edge/fair_line:.4f} * 0.5')
print(f'                 = 0.5 + {(total_edge/fair_line)*0.5:.4f}')
print(f'                 = {prob_estimate:.4f} ({prob_estimate*100:.2f}%)')
print()

# Kelly calculation
american_odds = -107
decimal_odds = 100 / 107 + 1  # = 1.9346
b = decimal_odds - 1  # = 0.9346
p = prob_estimate  # = 0.5171
q = 1 - p  # = 0.4829

kelly = (b * p - q) / b
quarter_kelly = kelly * 0.25
capped_kelly = min(quarter_kelly, 0.05)

print(f'Kelly Calculation:')
print(f'  Kelly = (b*p - q) / b')
print(f'        = ({b:.4f} * {p:.4f} - {q:.4f}) / {b:.4f}')
print(f'        = {kelly:.6f} ({kelly*100:.4f}%)')
print()
print(f'  Quarter Kelly (0.25x): {quarter_kelly:.6f} ({quarter_kelly*100:.4f}%)')
print(f'  Capped at 5%: {capped_kelly:.6f} ({capped_kelly*100:.4f}%)')
print()

bankroll = 5000
bet_size = bankroll * capped_kelly
units = bet_size / 10

print(f'Bet Sizing:')
print(f'  Bankroll: ${bankroll}')
print(f'  Bet size: ${bet_size:.2f}')
print(f'  Units ($10/unit): {units:.2f}U')
print()
print('=' * 70)
print()
print('ROOT CAUSE IDENTIFIED:')
print()
print('The totals probability estimation formula is BROKEN!')
print()
print('Current formula for an UNDER bet:')
print('  totalModelProb = 0.5 + (totalEdge / fairLine) * 0.5')
print()
print('For our pick:')
print(f'  totalModelProb = 0.5 + (8.1 / 236.5) * 0.5 = {prob_estimate:.4f} = 51.7%')
print()
print('This says an 8-point edge is only 51.7% to win!')
print('But 8 points on a 236 total is a 3.4% difference - should be much higher!')
print()
print('The formula has TWO problems:')
print('1. It treats OVER and UNDER identically (same formula)')
print('2. It scales linearly with edge/line ratio (too conservative)')
print()
print('Expected Win Probability for 8-Point Edge:')
print('  A model predicting 228.4 when line is 236.5')
print('  Should have ~58-62% probability of going under')
print('  Not 51.7%!')
