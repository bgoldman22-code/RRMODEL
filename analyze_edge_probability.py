"""
Calculate the correct probability for different edge sizes based on backtest data.

From DEPLOYMENT_TOTALS_FIX.md:
- High-edge UNDERS (6.5+): 57.1% win rate, +9.09% ROI

We need to figure out what probability an 8.1 edge should have.
"""

print("=" * 70)
print("EDGE TO PROBABILITY MAPPING ANALYSIS")
print("=" * 70)
print()

# Known data point from backtest
known_edge = 6.5  # minimum edge for high-edge UNDERS
known_win_rate = 0.571  # 57.1% win rate

print(f"Known Data Point:")
print(f"  Edge threshold: {known_edge}+ points")
print(f"  Win rate: {known_win_rate * 100:.1f}%")
print()

# Current broken formula
def current_formula(edge, line):
    return 0.5 + (edge / line) * 0.5

# Test current formula
test_edges = [6.5, 7.0, 8.0, 8.1, 9.0, 10.0]
test_line = 236.5

print("Current Formula Results (BROKEN):")
print("-" * 70)
for edge in test_edges:
    prob = current_formula(edge, test_line)
    print(f"  Edge {edge:4.1f}: {prob:.1%} probability")
print()

# The current formula gives 51.4% for 6.5 edge, but actual is 57.1%
# That's a 5.7 percentage point difference!

print("Problem:")
print(f"  Current formula for 6.5 edge: {current_formula(6.5, test_line):.1%}")
print(f"  Actual backtest win rate: {known_win_rate:.1%}")
print(f"  Difference: {(known_win_rate - current_formula(6.5, test_line)) * 100:.1f} percentage points")
print()

# We need a better formula. Let's try different scaling factors
print("Testing Different Scaling Factors:")
print("-" * 70)

def formula_with_scaling(edge, line, scale):
    return 0.5 + (edge / line) * scale

# Find the scale that gives us 57.1% at 6.5 edge
target_prob = 0.571
target_edge = 6.5
required_scale = (target_prob - 0.5) / (target_edge / test_line)

print(f"To get {target_prob:.1%} at {target_edge} edge on {test_line} line:")
print(f"  Required scale factor: {required_scale:.2f}")
print()

print(f"New Formula: 0.5 + (edge / line) * {required_scale:.2f}")
print()

print("New Formula Results:")
print("-" * 70)
for edge in test_edges:
    prob = formula_with_scaling(edge, test_line, required_scale)
    print(f"  Edge {edge:4.1f}: {prob:.1%} probability")
print()

# Calculate Kelly for 8.1 edge with new formula
edge_8_1 = 8.1
prob_8_1 = formula_with_scaling(edge_8_1, test_line, required_scale)
odds_american = -107
odds_decimal = 1 + (100 / 107)  # 1.9346

kelly = (odds_decimal - 1) * prob_8_1 - (1 - prob_8_1)
kelly = kelly / (odds_decimal - 1)
kelly_quarter = kelly * 0.25

print("Kelly Calculation for 8.1 Edge with NEW Formula:")
print("-" * 70)
print(f"  Edge: {edge_8_1} points")
print(f"  Probability: {prob_8_1:.1%}")
print(f"  Odds: {odds_american} ({odds_decimal:.4f} decimal)")
print(f"  Kelly: {kelly:.4f} ({kelly * 100:.2f}%)")
print(f"  Quarter Kelly: {kelly_quarter:.4f} ({kelly_quarter * 100:.2f}%)")
print(f"  Bet size ($5000 bankroll): ${kelly_quarter * 5000:.2f}")
print(f"  Units ($10/unit): {(kelly_quarter * 5000) / 10:.2f}U")
print()

print("=" * 70)
print("RECOMMENDATION:")
print("=" * 70)
print(f"Replace current formula with: 0.5 + (edge / fairLine) * {required_scale:.2f}")
print()
print("This is calibrated to your actual backtest performance:")
print(f"  - 6.5+ edge UNDERS achieved 57.1% win rate")
print(f"  - New formula produces probabilities matching this data")
print(f"  - 8.1 edge will now bet at {(kelly_quarter * 5000) / 10:.2f}U instead of 0.0U")

