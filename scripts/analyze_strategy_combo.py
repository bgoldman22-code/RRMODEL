import json

with open('/Users/brentgoldman/Desktop/REPO33/RRMODEL/data/nba/models/totals_v3_comparison_results.json') as f:
    data = json.load(f)

new_roi = data['roiComparison']['new']

# Reconstruct per-bet data from the comparison results
# We need to go back to the raw backtest results
# Let's use the model directly

import csv, re, os

# Load V3 model
with open('/Users/brentgoldman/Desktop/REPO33/RRMODEL/data/nba/models/totals_model_v3_multiwindow.json') as f:
    v3_model = json.load(f)

# We need the actual backtest results - let's read from comparison
# Actually, let's just use the summary data we already have

# From the ROI analysis output we already ran:
# edge_5: overs 237 bets, unders 215 bets  
# edge_6: overs 172 bets, unders 150 bets
# edge_7: overs 125 bets, unders 109 bets
# edge_8: overs 89 bets, unders 77 bets

# Your strategy: UNDERS >= 5 edge + OVERS >= 7.5 edge
# Unders >= 5 = 215 bets (from data)
# Overs >= 7.5 = roughly between edge_7 (125) and edge_8 (89), so ~107 overs
# But we need exact numbers. Let me interpolate from what we have.

# Actually let's just compute it properly from the data
# edge_7 overs: 125 bets, +3.85% ROI, 54.4% WR
# edge_8 overs: 89 bets, +5.11% ROI, 55.1% WR
# So overs between 7 and 8 edge = 125 - 89 = 36 bets at some ROI
# Overs >= 7.5 is approximately midpoint: ~107 bets

# Better: use the stored results directly
print("=" * 65)
print("  YOUR STRATEGY: UNDERS >= 5 edge + OVERS >= 7.5 edge")
print("  Test period: 1,375 games (Oct 2024 - Nov 2025)")
print("=" * 65)
print()

# Get exact numbers from stored data
e5 = new_roi['edge_5']
e6 = new_roi['edge_6']
e7 = new_roi['edge_7']
e8 = new_roi['edge_8']

# UNDERS >= 5
u5_bets = int(e5['unders']['count'])
u5_roi = float(e5['unders']['roi'])
u5_wr = float(e5['unders']['winRate'])
u5_wins = int(e5['unders']['wins'])
u5_losses = u5_bets - u5_wins
u5_profit = u5_wins * 100 - u5_losses * 110

# OVERS >= 8 (closest clean threshold we have data for)
o8_bets = int(e8['overs']['count'])
o8_roi = float(e8['overs']['roi'])
o8_wr = float(e8['overs']['winRate'])
o8_wins = int(e8['overs']['wins'])
o8_losses = o8_bets - o8_wins
o8_profit = o8_wins * 100 - o8_losses * 110

# OVERS >= 7 
o7_bets = int(e7['overs']['count'])
o7_roi = float(e7['overs']['roi'])
o7_wr = float(e7['overs']['winRate'])
o7_wins = int(e7['overs']['wins'])
o7_losses = o7_bets - o7_wins
o7_profit = o7_wins * 100 - o7_losses * 110

# Approximate >= 7.5: midpoint between 7 and 8
o75_bets = (o7_bets + o8_bets) // 2
o75_wins = (o7_wins + o8_wins) // 2
o75_losses = o75_bets - o75_wins
o75_profit = o75_wins * 100 - o75_losses * 110
o75_roi = (o75_profit / (o75_bets * 110)) * 100 if o75_bets > 0 else 0
o75_wr = (o75_wins / o75_bets * 100) if o75_bets > 0 else 0

print("  COMPONENT BREAKDOWN:")
print("  " + "-" * 55)
print(f"  UNDERS >= 5 edge:")
print(f"    Bets: {u5_bets}")
print(f"    W-L:  {u5_wins}-{u5_losses}")
print(f"    ROI:  +{u5_roi:.1f}%")
print(f"    WR:   {u5_wr:.1f}%")
print(f"    P/L:  +${u5_profit}")
print()
print(f"  OVERS >= 7.5 edge (interpolated from 7 and 8):")
print(f"    Bets: ~{o75_bets}")
print(f"    W-L:  ~{o75_wins}-{o75_losses}")
print(f"    ROI:  +{o75_roi:.1f}%")  
print(f"    WR:   {o75_wr:.1f}%")
print(f"    P/L:  ~+${o75_profit}")
print()

# Combined
total_bets = u5_bets + o75_bets
total_profit = u5_profit + o75_profit
total_wagered = total_bets * 110
total_roi = (total_profit / total_wagered) * 100 if total_wagered > 0 else 0
total_wins = u5_wins + o75_wins
total_losses = u5_losses + o75_losses
total_wr = (total_wins / total_bets * 100) if total_bets > 0 else 0

print("  " + "=" * 55)
print(f"  COMBINED STRATEGY:")
print(f"  " + "=" * 55)
print(f"    Total bets: {total_bets}")
print(f"    W-L:  {total_wins}-{total_losses}")
print(f"    ROI:  +{total_roi:.1f}%")
print(f"    WR:   {total_wr:.1f}%")
print(f"    P/L:  +${total_profit} (at $110/bet)")
print()

# Bets per week
# Test period: Oct 22 2024 → Nov 22 2025 = ~56 weeks
weeks = 56
bets_per_week = total_bets / weeks
unders_per_week = u5_bets / weeks
overs_per_week = o75_bets / weeks
profit_per_week = total_profit / weeks

print(f"  WEEKLY VOLUME (over {weeks}-week test period):")
print(f"  " + "-" * 55)
print(f"    Unders/week: {unders_per_week:.1f}")
print(f"    Overs/week:  {overs_per_week:.1f}")
print(f"    TOTAL/week:  {bets_per_week:.1f}")
print(f"    Profit/week: +${profit_per_week:.0f} (at $110/bet)")
print()

# Per game rate
games_in_period = 1375
print(f"  PER-GAME RATE:")
print(f"  " + "-" * 55)
print(f"    {total_bets} picks from {games_in_period} games = pick on {total_bets/games_in_period*100:.0f}% of games")
print(f"    ~{total_bets/games_in_period:.1f} totals picks per game on avg")
print()

# For comparison: what about overs >= 7 instead of 7.5?
total2_bets = u5_bets + o7_bets
total2_profit = u5_profit + o7_profit
total2_wagered = total2_bets * 110
total2_roi = (total2_profit / total2_wagered) * 100
total2_bpw = total2_bets / weeks

# And overs >= 8 (tighter)
total3_bets = u5_bets + o8_bets
total3_profit = u5_profit + o8_profit
total3_wagered = total3_bets * 110
total3_roi = (total3_profit / total3_wagered) * 100
total3_bpw = total3_bets / weeks

print(f"  SENSITIVITY ANALYSIS:")
print(f"  " + "-" * 55)
print(f"  {'Strategy':<35} {'Bets':>5} {'ROI':>7} {'$/wk':>7} {'Bets/wk':>8}")
print(f"  " + "-" * 55)
print(f"  {'Unders>=5 only':<35} {u5_bets:>5} {u5_roi:>+6.1f}% {u5_profit/weeks:>+6.0f} {u5_bets/weeks:>7.1f}")
print(f"  {'Unders>=5 + Overs>=8':<35} {total3_bets:>5} {total3_roi:>+6.1f}% {total3_profit/weeks:>+6.0f} {total3_bpw:>7.1f}")
print(f"  {'Unders>=5 + Overs>=7.5':<35} {total_bets:>5} {total_roi:>+6.1f}% {total_profit/weeks:>+6.0f} {bets_per_week:>7.1f}")
print(f"  {'Unders>=5 + Overs>=7':<35} {total2_bets:>5} {total2_roi:>+6.1f}% {total2_profit/weeks:>+6.0f} {total2_bpw:>7.1f}")
