# MLB HR Round Robin System - Complete Audit

**Date:** November 4, 2025 (Offseason Review)  
**Purpose:** Evaluate existing RR system, identify improvements, optimize for 2025 season

---

## 1. CURRENT SYSTEM OVERVIEW

### What You Have
- **Pool Size:** 12 picks
- **Game Constraint:** Max 2 picks per game (MAX_PER_GAME = 2)
- **Formats Used:** 12-leg RR by 2s, 3s, and 4s (manual entry on FanDuel)
- **Selection Logic:** EV-based ranking with variance controls
- **No Automated:** Combo display, stake calculation, or backtest validation

### Current Workflow
1. Model generates probabilities (pitcher, park, weather, hot/cold, BvP, protection)
2. Fetches FanDuel odds via OddsAPI
3. Ranks by: `rankScore = p_model + 0.3 × edge`
4. Selects top 12 honoring max 2 per game
5. **You manually:** create RR tickets on FanDuel (by 2s, 3s, 4s)
6. **No visibility into:** valid combo count, expected ROI, optimal format

---

## 2. SELECTION LOGIC BREAKDOWN

### Probability Generation
```
Final Probability = baseProb 
  × hotColdMultiplier (14-day HR rate, capped at ±6%)
  × calibration (global scale factor, λ=0.25)
  × pitchTypeEdgeMultiplier (hitter vs pitcher pitch-type matchup)
  × (1 + BvP modifier if ≥10 AB, capped at ±6%)
  × (1 + protection modifier from 2 best teammates, capped at +5%)
```

**Features:**
- ✅ Pitcher HR/FB rate (via learning system)
- ✅ Park factor (per venue)
- ✅ Weather HR multiplier (wind, temp, rain)
- ✅ Batter vs Pitcher history (10+ AB threshold)
- ✅ Lineup protection (top 2 teammates)
- ✅ Hot/cold streaks (14-day window)
- ✅ Pitch-type matchups
- ✅ Calibration (global scale adjustment)

**Missing:**
- ❌ Bullpen HR rate vs starter
- ❌ Game script indicators (blowout risk)
- ❌ Platoon splits (L/R more sophisticated)
- ❌ Batter spray chart × park dimensions

### EV Calculation
```
modelOdds = americanFromProb(p_model)
actualOdds = from FanDuel (or model as fallback)
EV = (p_model × decimal_odds) - 1
edge = p_model - implied_prob(actualOdds)
rankScore = p_model + 0.3 × edge
```

**Ranking:** Prioritizes probability + modest edge bonus (30% weight)

### Variance Controls
```javascript
ANCHOR_CAP = 3              // Max high-prob "anchors"
MIDRANGE_MIN_REQUIRED = 3   // At least 3 mid-range picks (13-25% prob)
MIDRANGE_P_MIN = 0.13       // ~+650 odds
MIDRANGE_P_MAX = 0.25       // ~+300 odds
MAX_CONSECUTIVE_REPEATS = 2 // No player 3+ days in a row
```

**Purpose:** Balance between favorites and value, avoid repeat fatigue

### Game Diversity
```javascript
MAX_PER_GAME = 2
```
- Enforced during selection
- Ensures some game spread
- **Question:** Is 2 optimal for RR? Or should it be 1?

---

## 3. ROUND ROBIN MATH

### 12-Leg Pool Scenarios

**Scenario A: 12 picks across 6 games (2 per game)**
```
Total possible 2-leg combos: C(12,2) = 66
Total possible 3-leg combos: C(12,3) = 220
Total possible 4-leg combos: C(12,4) = 495

But how many are VALID (no same-game legs)?
```

Let's calculate assuming perfect 2-per-game distribution:
- 6 games × 2 picks = 12 picks
- For 2-leg combos: must pick from different games
  - Valid = 6 × 5 / 2 = 15 cross-game pairs × 4 (pick combos) = **~45 valid** (68% of 66)
  
- For 3-leg combos: must pick from 3 different games
  - Valid ≈ **~140 valid** (64% of 220) - rough estimate
  
- For 4-leg combos: must pick from 4 different games
  - Valid ≈ **~290 valid** (59% of 495) - rough estimate

**Scenario B: 12 picks across 8 games (uneven distribution)**
- More games = higher valid % but fewer picks per game
- Trade-off: game coverage vs pick quality

**Scenario C: 12 picks across 4 games (3 per game)**
- Lower valid % (more same-game conflicts)
- Higher pick quality (stacking best spots)

### Smaller Pool Comparisons

**6-leg RR:**
```
6x2: C(6,2) = 15 possible
  → Assuming 1 per game: all 15 valid (100%)
  → Assuming 2+2+2: ~9 valid (60%)

6x3: C(6,3) = 20 possible
  → Assuming 1 per game: all 20 valid (100%)
  → Assuming 2+2+2: ~12 valid (60%)
```

**8-leg RR:**
```
8x2: C(8,2) = 28 possible
  → Assuming 1 per game: all 28 valid (100%)
  → Assuming 4×2: ~21 valid (75%)

8x3: C(8,3) = 56 possible
  → Assuming 1 per game: all 56 valid (100%)
  → Assuming 4×2: ~38 valid (68%)
```

**10-leg RR:**
```
10x2: C(10,2) = 45 possible
10x3: C(10,3) = 120 possible
10x4: C(10,4) = 210 possible
```

**KEY INSIGHT:** Smaller pools with 1 pick per game = 100% valid combos = optimal stake efficiency

---

## 4. FORMAT COMPARISON

### Breakeven Analysis

**2-leg parlays (by 2s):**
- Typical odds: ~+250 to +600 per leg
- Parlay odds: ~9x to 36x
- Breakeven: need ~11-22% hit rate
- **Pro:** Frequent hits, lower variance
- **Con:** Lower payouts

**3-leg parlays (by 3s):**
- Typical parlay odds: ~25x to 150x
- Breakeven: need ~4-8% hit rate
- **Pro:** Balance of hits and payouts
- **Con:** Moderate variance

**4-leg parlays (by 4s):**
- Typical parlay odds: ~80x to 500x+
- Breakeven: need ~1.2-2.5% hit rate
- **Pro:** Massive payouts
- **Con:** Rare hits, high variance

### Your Current Approach: 12-leg by 2s/3s/4s

**Bankroll allocation example:**
- 12x2 = 66 combos (but only ~45 valid) → $2.22 per combo on $100
- 12x3 = 220 combos (but only ~140 valid) → $0.71 per combo on $100
- 12x4 = 495 combos (but only ~290 valid) → $0.34 per combo on $100

**Total staked:** $300 if you do all three formats

**Questions:**
1. Is spreading across 3 formats better than focusing on one?
2. Are you overpaying for invalid combos? (FanDuel doesn't charge, but it affects your bankroll math)
3. Would a smaller, tighter pool (8 legs × 3s) be more profitable?

---

## 5. HYPOTHETICAL OPTIMIZATION

### Proposed Test: 8-Leg RR by 3s (1 per game)

**Setup:**
- Select top 8 picks, max 1 per game
- Ensures 8 different games
- C(8,3) = 56 combos, ALL VALID (100%)

**Advantages:**
- Zero invalid combos = perfect stake efficiency
- Simpler to manage (56 vs 140 combos)
- Forces best game diversification
- Still covers 8 games (vs 6 with current 12-pick approach)

**Trade-offs:**
- Lose 4 picks (potentially +EV plays)
- Miss "stacking" same game (Judge + Stanton both good)

### Alternative: 12-Leg RR by 3s (1 per game priority)

**Setup:**
- Select 12 picks prioritizing game spread
- Change selection logic: prefer 1 per game, allow 2 only if needed
- Target: 12 picks across 10+ games

**Result:**
- Higher valid combo % (80-90% vs current 60-65%)
- Better game coverage
- Still get 12 picks

---

## 6. BACKTEST REQUIREMENTS

To determine optimal strategy, we need:

### Data Pipeline
1. **Historical games:** MLB StatsAPI (2024 season = ~2,500 games)
2. **HR results:** Parse play-by-play for actual HRs
3. **Odds snapshots:** Check if stored, else use model odds
4. **Weather data:** Archive available?

### Simulation Process
```
For each date in 2024 season:
  1. Fetch schedule
  2. Run model → generate probabilities
  3. Fetch/estimate odds
  4. Select RR pool (current logic)
  5. Generate all combos
  6. Filter valid combos (same-game rule)
  7. Simulate outcomes (which combos hit?)
  8. Calculate P&L
  
Aggregate:
  - ROI by format (2s vs 3s vs 4s)
  - ROI by pool size (6 vs 8 vs 10 vs 12)
  - Hit rate vs expected
  - Sharpe ratio (return/volatility)
  - Max drawdown
```

### Key Questions to Answer
1. **Optimal pool size:** 6, 8, 10, or 12 legs?
2. **Optimal format:** by 2s, 3s, 4s, or mixed?
3. **Game diversity:** 1 per game vs 2 per game?
4. **Selection method:** pure EV vs variance controls?
5. **Constraint impact:** How much does same-game rule hurt?

---

## 7. EXPECTED FINDINGS (Hypotheses)

### Hypothesis 1: Smaller is Better
**Prediction:** 8-leg by 3s will outperform 12-leg by 3s
**Reason:** Higher valid %, better stake efficiency, less noise

### Hypothesis 2: Game Spread Matters More Than Stacking
**Prediction:** 1 per game > 2 per game for RR
**Reason:** Maximize valid combos, reduce correlation risk

### Hypothesis 3: 3-Leg Sweet Spot
**Prediction:** by 3s will have best ROI (vs 2s or 4s)
**Reason:** Balance of hit frequency and payout size

### Hypothesis 4: Variance Controls Hurt RR Performance
**Prediction:** Pure EV ranking > forced variance controls
**Reason:** RR already provides variance through format, no need to engineer it in pool

### Hypothesis 5: Current Constraint Cost is High
**Prediction:** 30-40% of "theoretical combos" are invalid
**Reason:** 12 picks with 2 per game creates many same-game conflicts

---

## 8. IMMEDIATE ACTION ITEMS

### Phase 1: Measurement (1-2 days)
1. ✅ **Audit current logic** (this document)
2. ⏳ **Build combo validator** (count valid vs invalid for real pools)
3. ⏳ **Calculate theoretical valid %** for different scenarios
4. ⏳ **Create visualization** of game distribution in typical 12-pick pool

### Phase 2: Backtest Engine (2-3 days)
1. ⏳ **Build data fetcher** (2024 games + results)
2. ⏳ **Create RR simulator** (generate pools, combos, outcomes)
3. ⏳ **Run full season backtest** (all formats and pool sizes)
4. ⏳ **Generate comparison report** (tables, charts, ROI by strategy)

### Phase 3: Optimization (1-2 days)
1. ⏳ **Analyze results** (which strategy performed best?)
2. ⏳ **Test alternative selection methods** (pure EV, game-first, etc)
3. ⏳ **Optimize pool size** (test 4, 6, 8, 10, 12, 15 legs)
4. ⏳ **Finalize recommendation** (pool size, format, selection logic)

### Phase 4: Implementation (1 day)
1. ⏳ **Update selection logic** (if changes needed)
2. ⏳ **Add RR display section** (show combos, stakes, validation)
3. ⏳ **Create format toggle** (let you switch between 2s/3s/4s)
4. ⏳ **Deploy for 2025 season** (with monitoring)

---

## 9. PRELIMINARY RECOMMENDATIONS (Before Backtest)

Based on theory and constraint analysis:

### Recommendation A: Conservative Optimization
- **Pool size:** 8 legs
- **Game constraint:** 1 per game (strict)
- **Format:** by 3s only
- **Selection:** Pure EV ranking (remove variance controls for RR)
- **Expected:** 56 combos, 100% valid, simplified management

### Recommendation B: Balanced Approach
- **Pool size:** 10 legs
- **Game constraint:** 1 per game preferred, 2 allowed
- **Format:** by 3s + by 4s (split bankroll)
- **Selection:** EV with game diversity bonus
- **Expected:** ~90% valid combos, good coverage

### Recommendation C: Keep Current, Improve Display
- **Pool size:** 12 legs (keep)
- **Game constraint:** 2 per game (keep)
- **Format:** all 3 (2s, 3s, 4s)
- **Selection:** current logic (keep)
- **Change:** Add validation display so you KNOW valid combo count

---

## 10. QUESTIONS FOR YOU

Before I proceed with backtest build:

1. **Historical data:** Do you have any saved RR results from 2024 season? (actual bets placed, outcomes?)

2. **Format preference:** Do you like running all 3 formats (2s/3s/4s) or would you prefer to focus on one?

3. **Bankroll:** Typical daily budget for MLB HR RR?

4. **Risk tolerance:** Prefer frequent small hits (2s/3s) or rare big hits (4s/5s)?

5. **Pool size:** Open to reducing from 12 to 8-10 if backtest shows it's better?

6. **Automation:** Want the UI to show all combos, or just summary stats + top recommendations?

---

## 11. NEXT STEPS

**YOUR INPUT NEEDED:**
Answer the questions above so I can tailor the backtest and recommendations.

**MY NEXT TASK:**
Build the backtest engine and run it on 2024 season data to get empirical answers to all these questions.

**TIMELINE:**
- Backtest build: 2-3 days
- Analysis: 1 day
- Recommendations: 1 day
- Implementation: 1 day
- **Total:** ~5-7 days of work (offseason perfect timing!)

---

**Let's use this offseason to scientifically optimize your RR strategy for 2025! 🎯⚾**
