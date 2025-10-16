# Noise Filtering Guide - NFL Receiving Props

## 🎯 Problem: What is "Noise"?

**Noise = Bets we would never actually make in real life**

### Examples of Noise:
- **3rd down backs**: RB who only plays passing downs (2-3 targets/game)
- **Gadget players**: QB who throws 1 pass per game, Rondale Moore on jet sweeps
- **Rarely-used backups**: WR5 who only plays when starter injured
- **Garbage time heroes**: WR3 who gets all targets when down 30 points
- **Extreme lines**: Betting Kelce under 0.5 receptions (99.9% probability)

### Why Filter Noise?
1. **Overestimates volume**: Raw backtest shows 42k predictions, but only ~3k are bettable
2. **Pollutes performance**: Low-usage players have unreliable stats (small sample bias)
3. **Not offered by books**: Sportsbooks only list props for ~15-20 players per game
4. **Wastes research time**: Don't want to analyze players who won't have lines

## 🔍 Filtering Criteria

### 1️⃣ **Minimum Usage Thresholds** (Most Important)

**Purpose**: Only bet on players with consistent playing time

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| **Targets (L5)** | 3.0+ per game | Below 3 = backup/gadget player |
| **Receptions (L5)** | 2.0+ per game | Below 2 = not reliable target |
| **Yards (L5)** | 25+ per game | Below 25 = minimal role |

**Example Filtered Players**:
- ❌ James White (RB, 2022): 1.8 targets/game → Too low, 3rd down back
- ❌ Lynn Bowden (WR, 2022): 0.4 receptions/game → Too low, practice squad callup
- ✅ Stefon Diggs (WR, 2022): 9.2 targets/game → Well above threshold
- ✅ Mark Andrews (TE, 2022): 7.1 targets/game → Well above threshold

### 2️⃣ **Edge Threshold**

**Purpose**: Only bet when model has significant advantage

| Threshold | Use Case |
|-----------|----------|
| **5%+** | Standard threshold (balance volume + accuracy) |
| **7%+** | Conservative (fewer bets, higher win rate) |
| **10%+** | Very conservative (best bets only) |

**Example**:
- Model probability: 62%
- Market probability: 54% (implied from odds)
- Edge: 62% - 54% = **8%** → ✅ Bet (exceeds 5% threshold)

### 3️⃣ **Probability Range**

**Purpose**: Avoid extreme probabilities (either too unlikely or too short odds)

- **Minimum**: 25% → Don't bet on <25% events (too unlikely, need huge odds)
- **Maximum**: 75% → Don't bet on >75% events (odds too short, -300 or worse)

**Examples**:
- ❌ Tyreek Hill under 0.5 receptions: 99% probability → Too extreme
- ❌ Practice squad WR over 5.5 receptions: 2% probability → Too unlikely
- ✅ CeeDee Lamb over 5.5 receptions: 58% probability → Good range

### 4️⃣ **Minimum Games History**

**Purpose**: Need sufficient data for reliable rolling averages

- **Threshold**: 4+ games
- **Rationale**: L5 rolling average needs at least 4 games (ideally 5, but allow 4 for rookies/early season)

**Examples**:
- ❌ Week 1-3: Most players have <4 games → Wait until Week 5
- ✅ Week 5+: All players have 4+ games → Full dataset

### 5️⃣ **Realistic Lines Only**

**Purpose**: Only lines that sportsbooks actually offer

**Receptions**: 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5
- ❌ 0.5, 1.5 → Too low (everyone hits)
- ❌ 9.5, 10.5 → Too high (rare, usually only Tyreek/Jefferson)

**Yards**: 25.5 to 95.5 (increments of 10)
- ❌ 15.5 → Too low
- ❌ 105.5, 115.5 → Too high (only elite WR1s)

## 📊 Expected Results After Filtering

### Volume Reduction

| Stage | Predictions | % of Total |
|-------|-------------|------------|
| **Raw backtest** | ~42,000 | 100% |
| **After edge filter** | ~8,000 | 19% |
| **After probability filter** | ~6,000 | 14% |
| **After usage filter** | ~3,500 | 8% |
| **After line filter** | ~3,000 | 7% |

**Typical: 93% reduction in volume, focusing on the 7% of actionable bets**

### Performance Improvement

Filtered results typically show **BETTER** performance because:

1. **Less noise**: Low-usage players have unreliable stats
2. **Market liquidity**: Books price high-usage players more accurately
3. **Sample size**: More data = better predictions

**Expected improvement**: +2-4% ROI after filtering

## 🎯 Real-World Example

### 2022 Week 10: Chiefs vs Jaguars

**Raw Backtest Output** (100+ predictions):
- ❌ Mecole Hardman over 2.5 receptions (1.2 targets/game L5) → FILTERED
- ❌ Jerick McKinnon over 3.5 receptions (2.4 targets/game L5) → FILTERED
- ❌ Skyy Moore over 1.5 receptions (0.8 targets/game L5) → FILTERED
- ✅ Travis Kelce over 5.5 receptions (8.2 targets/game L5, 7% edge) → **ACTIONABLE**
- ✅ JuJu Smith-Schuster over 4.5 receptions (6.8 targets/game L5, 5.2% edge) → **ACTIONABLE**
- ✅ Christian Kirk over 4.5 receptions (7.1 targets/game L5, 6.1% edge) → **ACTIONABLE**

**Result**: 3 actionable bets instead of 100+ noise predictions

## 🛠️ Usage

After backtest completes, run:

```r
Rscript scripts/nfl-receiving-props/06_filter_actionable_bets.R
```

**Input**: `backtest_3season_2022_2024.rds` (raw results)
**Output**: `backtest_3season_ACTIONABLE.rds` (filtered results)

## 📈 Interpretation

### Success Metrics (Actionable Bets Only)

| Metric | Target | Good | Needs Work |
|--------|--------|------|------------|
| **Win Rate** | 54%+ | 52-54% | <52% |
| **ROI** | +5%+ | +3-5% | <+3% |
| **Volume** | 1,500+ bets/season | 1,000-1,500 | <1,000 |
| **Consistency** | 2/3 seasons profitable | - | <2/3 seasons |

### Decision Tree

```
Actionable Bets ROI > +5%?
├─ YES → ✅ Proceed to Phase 2 (real odds, injury impact)
└─ NO → Is ROI +3-5%?
    ├─ YES → ⚠️ Marginal, consider tighter edge threshold
    └─ NO → Is ROI positive?
        ├─ YES → 🔧 Needs feature improvement
        └─ NO → ❌ Model has fundamental issues
```

## 💡 Key Insight

**Most predictions in raw backtest are unusable noise.**

The filtering step is critical because:
- Sportsbooks only list props for high-usage players
- Low-usage players have unreliable rolling averages (small sample)
- Model performs better on players with consistent roles

**This is expected and good!** We want quality over quantity. 3,000 actionable bets at 55% win rate is worth far more than 42,000 bets at 51% win rate.
