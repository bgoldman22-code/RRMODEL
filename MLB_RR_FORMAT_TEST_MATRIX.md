# MLB HR Round Robin - Comprehensive Format Test Matrix

**Purpose:** Test EVERY possible RR configuration to find optimal strategy  
**Goal:** Leave NO blind spots - exhaustive backtest across 5 years (2021-2025)

---

## Test Dimensions

### 1. Pool Size (legs in RR)
```
Test values: 4, 6, 8, 10, 12, 14, 15, 17, 20, 22, 25
Rationale: User's real slips show 17-22 legs, but we test smaller/larger too
```

### 2. RR Format (parlay size)
```
x2: 2-leg parlays
x3: 3-leg parlays  
x4: 4-leg parlays
x5: 5-leg parlays
x6: 6-leg parlays
x7: 7-leg parlays (extreme test)
```

### 3. Stake Allocation (bankroll split across formats)
```
Single format (100%):
  - 100% x2
  - 100% x3
  - 100% x4
  - 100% x5
  - 100% x6

Dual format mixes:
  - 50/50: x2/x3, x2/x4, x3/x4, x4/x5
  - 60/40: x2/x3, x3/x4
  - 70/30: x2/x3, x3/x4
  - 80/20: x2/x3

Triple format mixes:
  - 50/35/15: x2/x3/x4 (user's current)
  - 40/40/20: x2/x3/x4
  - 33/33/34: x2/x3/x4 (equal split)
  - 60/30/10: x2/x3/x4
  - 20/60/20: x2/x3/x4 (x3 heavy)
  - 50/40/10: x3/x4/x5

Quad format mixes:
  - 25/25/25/25: x2/x3/x4/x5
  - 40/30/20/10: x2/x3/x4/x5
```

### 4. Game Diversity Constraint
```
1-per-game: Strict - max 1 player per game (100% valid combos)
2-per-game: User's current - allows stacking 2 per game
3-per-game: Aggressive stacking
unlimited: No constraint (heavy stacking allowed)
```

### 5. Selection Method
```
Current: EV ranking + variance controls (anchors, mid-range quotas)
Pure EV: Sort by probability only, no variance engineering
Game-First: Prioritize game diversity, then EV within games
Odds-First: Sort by edge (market inefficiency) over raw probability
Correlation-Aware: Penalize same-game picks in ranking
Kelly: Use Kelly Criterion for optimal stake sizing per pick
```

### 6. Pool Size Strategy
```
Fixed: Always same size (e.g., always 12 legs)
Dynamic-Quality: Adjust based on slate quality (6-22 legs)
Dynamic-Games: Based on number of games (1 pick per 2 games)
Adaptive: ML-based sizing using historical performance
```

---

## Test Matrix Size

**Total combinations:**
```
Pool sizes: 11 options
RR formats: 6 options (x2 through x7)
Stake allocations: ~25 meaningful splits
Game constraints: 4 options
Selection methods: 6 options
Pool strategies: 4 options

Conservative estimate: 11 × 6 × 25 × 4 × 6 × 4 = ~158,400 combinations
```

**Feasibility:** Test top combinations per category, ~5,000 total runs

---

## Prioritized Testing Phases

### Phase 1: Core Matrix (High Priority)
Test user's current approach variants:
```
Pool: 10, 12, 15, 17, 20
Format: x2, x3, x4
Stakes: 100% single, 50/50 dual, 50/35/15 triple
Games: 1-per, 2-per
Selection: Current, Pure EV
Strategy: Fixed

= 5 × 3 × 6 × 2 × 2 × 1 = 360 combinations
```

### Phase 2: Format Exploration (Medium Priority)
Explore unusual formats:
```
Pool: 4, 6, 8, 12, 15
Format: x2, x3, x4, x5, x6
Stakes: Pure (100% single format)
Games: 1-per, unlimited
Selection: Pure EV, Game-First
Strategy: Fixed

= 5 × 5 × 1 × 2 × 2 × 1 = 100 combinations
```

### Phase 3: Advanced Optimization (Low Priority)
Test sophisticated approaches:
```
Pool: 12, 15, 17
Format: x3, x4, x5
Stakes: All dual/triple mixes
Games: All options
Selection: All options
Strategy: Dynamic-Quality, Adaptive

= 3 × 3 × 15 × 4 × 6 × 2 = 6,480 combinations
```

---

## Metrics to Track (Per Strategy)

### Profitability
- **Total ROI** (primary optimization target)
- **Annualized ROI** (per year breakdown)
- **ROI by year** (2021, 2022, 2023, 2024, 2025)
- **Profit in dollars** (assuming $450/day bankroll)
- **Win rate** (% of days profitable)

### Risk-Adjusted Returns
- **Sharpe Ratio** (return / volatility)
- **Sortino Ratio** (return / downside volatility)
- **Calmar Ratio** (return / max drawdown)
- **Max drawdown** (largest losing streak)
- **Average drawdown** (typical losses)
- **Recovery time** (days to break even after drawdown)

### Hit Frequency
- **Combo hit rate** (% of combos that win)
- **Daily hit rate** (% of days with at least 1 win)
- **Multi-hit days** (days with 2+ winning combos)
- **Dry spells** (longest streak without win)

### Variance Analysis
- **Standard deviation** (of daily P&L)
- **95th percentile win** (typical big day)
- **5th percentile loss** (typical bad day)
- **Skewness** (tail distribution)
- **Kurtosis** (fat tails?)

### Combo Efficiency
- **Valid combo %** (vs theoretical)
- **Average stake per combo**
- **Cost per win** (total staked / wins)
- **Wasted stakes** (on invalid combos)

### Consistency
- **Year-to-year correlation** (does it work every year?)
- **Monthly performance** (seasonal effects?)
- **Slate size sensitivity** (better on big slates?)

---

## Blind Spot Analysis

Specifically test counterintuitive strategies:

### 1. Tiny Pools (4-6 legs)
**Hypothesis:** Smaller = tighter selection = better quality  
**Test:** 4x2, 4x3, 6x2, 6x3 with 1-per-game strict

### 2. Huge Pools (20-25 legs)
**Hypothesis:** More legs = more combo coverage = better hit rate  
**Test:** 20x2, 22x3, 25x2 with unlimited stacking

### 3. Extreme Formats (x5, x6, x7)
**Hypothesis:** Rare massive wins > frequent small wins  
**Test:** 12x5, 15x6 with 100% allocation

### 4. Anti-Variance (no controls)
**Hypothesis:** Variance engineering hurts RR (RR already has variance)  
**Test:** Pure EV ranking vs Current method across all formats

### 5. Heavy Stacking (3+ per game)
**Hypothesis:** Best games have multiple good spots, stack them  
**Test:** 12-leg unlimited vs 1-per-game across formats

### 6. Unequal Stakes
**Hypothesis:** Optimal split isn't 50/35/15  
**Test:** 70/20/10, 40/40/20, 60/30/10, 80/15/5

### 7. Dynamic Sizing
**Hypothesis:** Bad slates = fewer legs, good slates = more legs  
**Test:** Dynamic (6-20 legs) vs Fixed (12 always)

### 8. Correlation Penalty
**Hypothesis:** Same-game picks reduce diversity, should be penalized in selection  
**Test:** Correlation-aware ranking vs standard EV ranking

---

## Validation Against Real Slips

**Ground Truth:** User's 3 slips from Sept 2025

### Validation Tests:
1. **Replay 9/24, 9/25, 9/26:** Run model for these exact dates, compare:
   - Pool composition (did we pick same players?)
   - Valid combo count (did we predict right number?)
   - Simulated payout (close to actual $442, $73, $7?)

2. **Calibration Check:** If simulated payouts differ:
   - Adjust probability calibration
   - Re-test model modifications
   - Iterate until match

3. **Format Detection:** Reverse-engineer which format hit:
   - 9/24: $442 from 7 wins = likely x3 or x4
   - 9/25: $73 from 5 wins = likely x3
   - 9/26: $7 from 5 wins = likely x2 or void-heavy

---

## Output: Strategy Comparison Report

### Top 20 Strategies Table
```
Rank | Pool | Format | Stakes    | Games | Selection | 5Y ROI | Sharpe | MaxDD | Wins/Year
-----|------|--------|-----------|-------|-----------|--------|--------|-------|----------
1    | 15   | x3     | 100%      | 1-per | Pure EV   | +47%   | 1.8    | -12%  | 38
2    | 12   | x3     | 50/35/15  | 2-per | Current   | +42%   | 1.6    | -15%  | 42
3    | 17   | x3/x4  | 60/40     | 2-per | Game-First| +40%   | 1.7    | -13%  | 35
...
```

### Format Heatmap (Pool Size vs Format)
```
        x2    x3    x4    x5    x6
4-leg   +5%   +12%  +8%   -2%   -15%
6-leg   +8%   +18%  +15%  +5%   -8%
8-leg   +12%  +25%  +20%  +10%  -2%
10-leg  +15%  +30%  +25%  +15%  +3%
12-leg  +18%  +35%  +28%  +18%  +5%
15-leg  +20%  +42%  +32%  +20%  +8%
17-leg  +18%  +40%  +30%  +18%  +5%
20-leg  +12%  +30%  +22%  +10%  0%
```

### Stake Allocation Heatmap
```
         100% x2  100% x3  50/50   50/35/15  60/40   70/30
8-leg    +12%     +25%     +20%    +18%      +22%    +15%
12-leg   +18%     +35%     +28%    +32%      +30%    +24%
15-leg   +20%     +42%     +38%    +40%      +38%    +30%
```

### Game Constraint Impact
```
Pool Size | 1-per-game | 2-per-game | 3-per-game | Unlimited
----------|------------|------------|------------|-----------
8-leg     | +25%       | +22%       | +18%       | +15%
12-leg    | +35%       | +32%       | +28%       | +22%
17-leg    | +40%       | +38%       | +35%       | +28%
```

### Blind Spot Findings
```
🔍 Unexpected Results:
  ✅ 4-leg x3 with 1-per-game: +18% ROI (tiny pool performed well!)
  ✅ 15-leg x6 pure: +8% ROI (extreme format had edge)
  ❌ 22-leg x2: -5% ROI (too large, too conservative)
  ❌ Variance controls: -3% vs pure EV (engineering hurt)
  ✅ Dynamic sizing: +5% over fixed (adapt to slate quality)
```

---

## Implementation Priority

**After backtest completes, implement:**
1. **Top 3 strategies** (user can toggle between them)
2. **Combo validator** (show valid/invalid counts)
3. **Expected ROI display** (based on backtest results)
4. **Format optimizer** (suggest best stake split for today's slate)
5. **Risk dashboard** (show current drawdown, win streak, etc)

---

**Next:** Start data collection in background, await odds plan
