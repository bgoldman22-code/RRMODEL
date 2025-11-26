# Kelly Sizing Implementation Guide

**For Phase 3.5 NBA Props Production System**

---

## Quick Start

The analysis script `scripts/nba/analyze_phase3.5_kelly_sizing.py` has determined optimal unit sizing for your three production models based on 22,246 historical bets.

### Results Summary

| Market | Model | Threshold | Active Tiers | Max Stake | Status |
|--------|-------|-----------|--------------|-----------|---------|
| **Assists** | Logistic PRA | 0.55+ | 2 tiers | **3.2U** | ✅ Profitable |
| **Points** | LightGBM | 0.60+ | 0 tiers | - | ⚠️ No qualifying buckets |
| **Rebounds** | LightGBM | 0.52+ | 3 tiers | **1.1U** | ✅ Profitable |

---

## Recommended Sizing Rules

### 🎯 Assists (Logistic PRA @ 0.55+)

**HIGH CONFIDENCE (3.2U):**
- Predicted probability: 0.55 - 0.57
- Edge: 5-8 percentage points
- Backtest: 58% WR, +18% ROI (50 bets)
- **Use case:** Strong model confidence with clear edge

**STANDARD (1.1U):**
- Predicted probability: 0.55 - 0.57
- Edge: 0-3 percentage points
- Backtest: 75.4% WR, +39.5% ROI (65 bets)
- **Use case:** Lower edge but very high win rate

### 🏀 Points (LightGBM @ 0.60+)

**Status:** No qualifying buckets found at 0.60 threshold with minimum 30 bets and 3% ROI.

**Recommendation:** 
- Do NOT bet points props with Phase 3.5 LightGBM model
- OR: Lower threshold to 0.55 and re-run analysis
- OR: Wait for more backtest data

### 🔄 Rebounds (LightGBM @ 0.52+)

**AGGRESSIVE (1.1U):**
- Predicted probability: 0.50 - 0.53
- Edge: 0-3 percentage points
- Backtest: 53.1% WR, +4.5% ROI (32 bets)
- **Use case:** Lower confidence but positive expected value

**MODERATE (0.9U):**
- Predicted probability: 0.55 - 0.57
- Edge: 0-3 percentage points
- Backtest: 57.6% WR, +6.1% ROI (33 bets)
- **Use case:** Better win rate, slightly lower Kelly

**CONSERVATIVE (0.8U):**
- Predicted probability: 0.53 - 0.55
- Edge: 0-3 percentage points
- Backtest: 57.7% WR, +9.9% ROI (52 bets)
- **Use case:** Best ROI, most samples, smallest stake

---

## Implementation in Code

### Current State

The prediction generator (`scripts/nba/generate-predictions-phase3.5.mjs`) currently sets:

```javascript
kellyStake: 0  // Placeholder
```

### Proposed Implementation

Add a function to compute Kelly stake based on bucket rules:

```javascript
function computeKellyStake(propType, modelProbability, edge) {
  // Assists (Logistic PRA)
  if (propType === 'assists') {
    if (modelProbability >= 0.55 && modelProbability < 0.57) {
      if (edge >= 0.05 && edge < 0.08) return 3.2;
      if (edge >= 0.00 && edge < 0.03) return 1.1;
    }
    return 0;  // No bet
  }
  
  // Points (LightGBM) - currently no qualifying tiers
  if (propType === 'points') {
    return 0;  // No bet until further analysis
  }
  
  // Rebounds (LightGBM)
  if (propType === 'rebounds') {
    if (modelProbability >= 0.50 && modelProbability < 0.53) {
      if (edge >= 0.00 && edge < 0.03) return 1.1;
    }
    if (modelProbability >= 0.55 && modelProbability < 0.57) {
      if (edge >= 0.00 && edge < 0.03) return 0.9;
    }
    if (modelProbability >= 0.53 && modelProbability < 0.55) {
      if (edge >= 0.00 && edge < 0.03) return 0.8;
    }
    return 0;  // No bet
  }
  
  return 0;
}

// Usage in prediction loop
predictions.push({
  // ... existing fields ...
  kellyStake: computeKellyStake(
    market.replace('player_', ''),
    result.prob_win,
    result.edge
  )
});
```

### Filtering Non-Bets

Consider filtering out predictions with `kellyStake === 0` before saving to JSON:

```javascript
// Filter to only predictions with positive Kelly stake
const actionablePredictions = predictions.filter(p => p.kellyStake > 0);

const output = {
  generated_at: new Date().toISOString(),
  total_picks: actionablePredictions.length,
  by_market: /* ... */,
  picks: actionablePredictions
};
```

This would ensure the frontend only shows bets you actually want to make.

---

## Bankroll Management

### Assumptions

- **1U = 1% of bankroll**
- Maximum risk per bet: 5U (5%)
- Fractional Kelly: 0.25 (1/4 Kelly for conservatism)

### Example with $10,000 Bankroll

| Stake | Dollar Amount | Example Scenario |
|-------|---------------|------------------|
| 3.2U | $320 | Assists high confidence bet |
| 1.1U | $110 | Standard assists or aggressive rebounds |
| 0.9U | $90 | Moderate rebounds bet |
| 0.8U | $80 | Conservative rebounds bet |

### Position Sizing Limits

⚠️ **CRITICAL:** Never exceed 20% of total bankroll across all open positions.

If you have 10 concurrent bets at 1U each, you're at 10% exposure (safe).

If you have 6 concurrent bets at 3.2U each, you're at 19.2% exposure (near limit).

**Recommendation:** Use a position tracking system to monitor total risk exposure in real-time.

---

## Re-calibration Schedule

### When to Re-run Analysis

1. **Quarterly (minimum):** Every 3 months, re-run with updated backtest data
2. **After major changes:** New model version, different data sources, etc.
3. **Performance divergence:** If live results differ significantly from backtest

### How to Re-run

```bash
cd ~/Desktop/REPO33/RRMODEL
python3 scripts/nba/analyze_phase3.5_kelly_sizing.py
```

Output: `docs/NBA_PHASE3.5_KELLY_TIERS.md`

### Monitoring Metrics

Track these weekly:

- **Actual ROI vs. Predicted:** Are live bets matching backtest?
- **Win Rate vs. Expected:** Is 58% WR holding up?
- **Kelly Sizing Accuracy:** Are recommended stakes too aggressive/conservative?

---

## Risk Warnings

### ⚠️ Small Sample Sizes

Some buckets have only 30-65 bets. Statistical noise is high. Be skeptical of outliers.

### ⚠️ Overfitting Risk

These tiers are derived from historical data. Markets evolve. Sportsbooks adjust.

**Past performance does NOT guarantee future results.**

### ⚠️ Correlation

Multiple props on the same player/game are correlated:
- Giannis Over Points + Over Rebounds = correlated
- Same game assists props = correlated

**Reduce effective stake size when taking correlated positions.**

### ⚠️ Fractional Kelly Can Still Be Aggressive

Even at 1/4 Kelly, a bad run can hurt. Consider:
- Starting with 1/8 Kelly (half the recommended stakes)
- Ramping up as you gain confidence
- Never betting more than 5U on a single prop

---

## Next Steps

1. ✅ **Analysis Complete:** Kelly tiers calculated and documented
2. ⬜ **Implement in Generator:** Add `computeKellyStake()` function to `generate-predictions-phase3.5.mjs`
3. ⬜ **Test Locally:** Generate predictions and verify Kelly stakes are assigned correctly
4. ⬜ **Deploy:** Push to production and monitor
5. ⬜ **Track Performance:** Log actual results vs. predicted for each tier
6. ⬜ **Re-calibrate Quarterly:** Re-run analysis with fresh data

---

## Questions to Consider

### Should you bet Points props at all?

The LightGBM Points model at 0.60 threshold has no qualifying buckets. Options:

1. **Skip points entirely** (safest)
2. **Lower threshold to 0.55-0.58** and re-run analysis
3. **Wait for more data** (current backtest only has 121 samples above 0.60)

### Should you implement dynamic Kelly?

Instead of fixed bucket-based sizing, compute Kelly per-bet using:
- Individual predicted probability
- Individual odds
- Live Kelly fraction

**Trade-off:** More precise but also more complex and riskier.

### Should you use a Kelly scale < 0.25?

Current system uses 1/4 Kelly. Consider:
- **1/8 Kelly (0.125):** Ultra-conservative, halves all stakes
- **1/2 Kelly (0.50):** More aggressive, doubles all stakes (not recommended)

---

**Generated:** 2025-11-25  
**Backtest Data:** 22,246 bets (12,414 logistic PRA + 9,832 LightGBM)  
**Analysis Script:** `scripts/nba/analyze_phase3.5_kelly_sizing.py`  
**Full Report:** `docs/NBA_PHASE3.5_KELLY_TIERS.md`
