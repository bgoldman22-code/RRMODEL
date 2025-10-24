# DATA LEAKAGE PREVENTION - CRITICAL DOCUMENTATION

## ⚠️ PROBLEM IDENTIFIED

**Date**: October 22, 2025  
**Issue**: Look-ahead bias in original backtest implementation  
**Severity**: CRITICAL - invalidates all backtest results

---

## What is Data Leakage?

**Data leakage** (or look-ahead bias) occurs when information from the future "leaks" into training or predictions, creating artificially inflated performance metrics.

### Example of Leakage:

```
❌ WRONG (Current Implementation):
1. Load ALL games (2021-2025)
2. Fit parameters using ALL games
3. "Backtest" by predicting games that were used in step 2

Result: Parameters learned from Game #50,000
        Then we "predict" Game #25,000 (which was in training)
        = Cheating! We already saw this game.
```

```
✅ CORRECT (Walk-Forward):
1. Load ALL games (2021-2025)
2. Sort chronologically
3. Fit parameters using games 1-1000
4. Predict games 1001-1500 (never seen before)
5. Re-fit using games 1-1500
6. Predict games 1501-2000 (never seen before)
7. Repeat...

Result: Every prediction uses ONLY past data
        = Valid simulation of real-world betting
```

---

## Current State of Codebase

### ❌ Files with Leakage Issues:

| File | Issue | Impact |
|------|-------|--------|
| `fit-parameters.mjs` | Fits on ALL games at once | Parameters use future data |
| `backtest-engine.mjs` | Uses leaked parameters | Overly optimistic metrics |
| `market-backtest.mjs` | Uses leaked parameters | Inflated ROI/edge estimates |

### ✅ Fixed Implementation:

| File | Fix | Status |
|------|-----|--------|
| `walkforward-backtest.mjs` | Expanding window, chronological order | ✅ CREATED |

---

## How Walk-Forward Works

### Expanding Window Approach

```
Timeline (60,000 games sorted chronologically):

Cycle 1:
├─ Train on: Games 1-1,000    (fit parameters v1)
└─ Test on:  Games 1,001-1,500 (make predictions)

Cycle 2:
├─ Train on: Games 1-1,500    (fit parameters v2)
└─ Test on:  Games 1,501-2,000 (make predictions)

Cycle 3:
├─ Train on: Games 1-2,000    (fit parameters v3)
└─ Test on:  Games 2,001-2,500 (make predictions)

...continue for all cycles
```

### Key Principles:

1. **Chronological Sorting**: All games sorted by date FIRST
2. **Past-Only Training**: Parameters fitted using ONLY games before test period
3. **Forward-Only Testing**: Never predict games that were in training set
4. **Periodic Re-fitting**: Update parameters every N games (e.g., 500)
5. **Player History**: Each prediction uses only player's games before target date

---

## Validation: Leakage vs No-Leakage

### Expected Metric Changes

| Metric | With Leakage | Without Leakage | Why? |
|--------|--------------|-----------------|------|
| **MAE** | 0.7-0.9 | 0.9-1.2 | Can't "memorize" test games |
| **Correlation** | 0.65-0.75 | 0.50-0.65 | Harder to predict unseen data |
| **ROI** | 5-10% | 2-5% | True market efficiency revealed |

**Rule of thumb**: If walk-forward results are MUCH worse, original backtest had leakage.

---

## Implementation Details

### Configuration (walkforward-backtest.mjs)

```javascript
const CONFIG = {
  MIN_TRAINING_GAMES: 1000,   // Min games before first prediction
  REFIT_INTERVAL: 500,        // Re-fit every N new games
  TEST_WINDOW: 500,           // Predict next N games per cycle
  MIN_PLAYER_HISTORY: 10      // Min player games before prediction
};
```

### Temporal Checks

```javascript
// CRITICAL: Sort chronologically
allGames.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));

// Training set: games BEFORE test period
const trainingGames = allGames.slice(0, trainEndIdx);

// Test set: games AFTER training period
const testGames = allGames.slice(trainEndIdx, testEndIdx);

// Ensure no overlap
assert(trainingGames[trainingGames.length - 1].gameDate < testGames[0].gameDate);
```

### Player-Level Temporal Safety

```javascript
// For each test game, use ONLY player's history from training period
const playerHistory = trainingGames.filter(g => g.playerId === playerId);

// Project shots using only past games
const projection = projectShots(playerHistory, gameContext, params);
```

---

## Action Items

### Immediate (Do NOW):

1. ✅ **Created walkforward-backtest.mjs** - No-leakage backtest engine
2. ⏳ **Run walk-forward backtest** - Get true metrics
3. ⏳ **Compare results** - Original vs walk-forward
4. ⏳ **Update auto-train script** - Replace leaky backtest with walk-forward

### Short-Term (Next 24 hours):

1. **Fix fit-parameters.mjs**:
   - Add temporal split option
   - Fit on train set only, not full dataset
   
2. **Fix backtest-engine.mjs**:
   - Add chronological sorting
   - Ensure walk-forward prediction order
   
3. **Fix market-backtest.mjs**:
   - Use walk-forward parameters
   - Test on future data only

### Long-Term (Before deployment):

1. **Cross-validation**:
   - Multiple walk-forward runs with different start dates
   - Ensure consistency across splits
   
2. **Out-of-sample testing**:
   - Hold out 2024-25 season entirely
   - Train on 2021-2023, test on 2024
   
3. **Live paper trading**:
   - Run model on current season without betting
   - Track real-time accuracy before using real money

---

## Testing for Leakage

### Red Flags (Leakage Present):

- ✗ MAE < 0.8 (suspiciously good)
- ✗ Correlation > 0.70 (too high for sports)
- ✗ ROI > 8% (unrealistic)
- ✗ Metrics degrade significantly in walk-forward

### Green Flags (No Leakage):

- ✓ MAE 0.9-1.2 (realistic)
- ✓ Correlation 0.50-0.65 (good but not perfect)
- ✓ ROI 2-5% (achievable with edge)
- ✓ Consistent metrics across temporal splits

---

## Usage

### Run Walk-Forward Backtest

```bash
# Ensure data is collected
ls -lh data/nhl/historical_game_data.json

# Run walk-forward validation (NO LEAKAGE)
node scripts/nhl/walkforward-backtest.mjs

# Output: data/nhl/walkforward_backtest_results.json
```

### Compare to Original

```bash
# Original (with leakage)
cat data/nhl/backtest_results.json | jq '.meanAbsoluteError, .correlation'

# Walk-forward (no leakage)
cat data/nhl/walkforward_backtest_results.json | jq '.metrics.mae, .metrics.correlation'

# If walk-forward is MUCH worse, original had leakage
```

---

## GPT Feedback Integration

**From GPT**: "are we ensuring there's no data leakage? we're only using previously available data from before each game was played?"

**Answer**: 
- ❌ Original implementation: NO - had look-ahead bias
- ✅ New walkforward-backtest.mjs: YES - strict temporal ordering
- ⏳ TODO: Update main pipeline to use walk-forward by default

---

## References

### Academic Papers:
- Pardo, Marcos (2018). "Walk-forward analysis in financial forecasting"
- Bailey, David H. (2014). "Backtest overfitting and pseudo-mathematics"

### Industry Best Practices:
- Always sort chronologically before any analysis
- Fit parameters on train set, evaluate on future test set
- Never use test set for any decision (hyperparameters, feature selection, etc.)
- Simulate live deployment: predict next day using only past data

---

## Summary

**CRITICAL FINDING**: Original backtest had data leakage (look-ahead bias).

**FIX**: Created `walkforward-backtest.mjs` with:
- ✅ Chronological sorting
- ✅ Expanding window training
- ✅ Future-only testing
- ✅ Periodic parameter re-fitting
- ✅ Player-level temporal safety

**NEXT STEP**: Run walk-forward backtest on full dataset to get TRUE validation metrics.

**DEPLOYMENT RULE**: NEVER deploy model until walk-forward validation passes all thresholds (MAE < 1.0, correlation > 0.55, ROI > 3%).

---

**Date**: October 22, 2025  
**Status**: Walk-forward engine created, awaiting full validation run  
**Priority**: CRITICAL - Run before any real money deployment
