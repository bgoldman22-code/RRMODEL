# Phase 3.5 Kelly Sizing Analysis

**Generated:** 2025-11-25 14:05:59

## Overview

This analysis examines backtest results for the three production models:
- **Assists:** Logistic PRA @ 0.55+ threshold
- **Points:** LightGBM @ 0.60+ threshold
- **Rebounds:** LightGBM @ 0.52+ threshold

The goal is to establish a **tiered Kelly staking system** with a **5U maximum** per wager.

## Methodology

1. **Data:** Historical backtest results (per-bet level)
2. **Buckets:** Probability × Edge grid
   - Probability ranges: [0.50, 0.53), [0.53, 0.55), [0.55, 0.57), [0.57, 0.60), [0.60, 0.63), [0.63, 0.66), [0.66, 0.70), [0.70, 1.00)
   - Edge ranges: [0.00, 0.03), [0.03, 0.05), [0.05, 0.08), [0.08, 0.10), [0.10, 1.00)
3. **Kelly Calculation:** Full Kelly = (b·p - q) / b, where b = decimal_odds - 1
4. **Fractional Kelly:** Using **25% Kelly** for conservatism
5. **Unit Mapping:** 1U = 1.0% of bankroll
6. **Minimum Sample:** 30 bets per bucket
7. **Minimum ROI:** 3.0% (filters out marginal edges)
8. **Minimum Stake:** 0.5U (filters out tiny bets)
9. **Hard Cap:** Maximum 5U per wager

## Results by Market

### Assists (Logistic PRA)

**Threshold:** 0.55
**Total Qualifying Bets:** 351

#### Bucket Performance

| Prob Bucket | Edge Bucket | N Bets | Win% | ROI% | Avg Edge | Median Kelly | Recommended Units |
|-------------|-------------|--------|------|------|----------|--------------|-------------------|
| [0.55, 0.57) | [0.05, 0.08) | 50 | 58.0% | +18.0% | 6.5pp | 0.1262 | **3.2U** |
| [0.55, 0.57) | [0.00, 0.03) | 65 | 75.4% | +39.5% | 1.7pp | 0.0422 | **1.1U** |


### Assists (Logistic PRA) Sizing Rules

**3.2U Tier:**
- Win Rate: 58.0%
- ROI: +18.0%
- Sample Size: 50 bets
- Probability Ranges: [0.55, 0.57)
- Edge Ranges: [0.05, 0.08)

**1.1U Tier:**
- Win Rate: 75.4%
- ROI: +39.5%
- Sample Size: 65 bets
- Probability Ranges: [0.55, 0.57)
- Edge Ranges: [0.00, 0.03)

### Points (LightGBM)

**Threshold:** 0.60
**Total Qualifying Bets:** 121

*No qualifying buckets found.*

### Rebounds (LightGBM)

**Threshold:** 0.52
**Total Qualifying Bets:** 875

#### Bucket Performance

| Prob Bucket | Edge Bucket | N Bets | Win% | ROI% | Avg Edge | Median Kelly | Recommended Units |
|-------------|-------------|--------|------|------|----------|--------------|-------------------|
| [0.50, 0.53) | [0.00, 0.03) | 32 | 53.1% | +4.5% | 1.8pp | 0.0422 | **1.1U** |
| [0.55, 0.57) | [0.00, 0.03) | 33 | 57.6% | +6.1% | 1.5pp | 0.0371 | **0.9U** |
| [0.53, 0.55) | [0.00, 0.03) | 52 | 57.7% | +9.9% | 1.6pp | 0.0328 | **0.8U** |


### Rebounds (LightGBM) Sizing Rules

**1.1U Tier:**
- Win Rate: 53.1%
- ROI: +4.5%
- Sample Size: 32 bets
- Probability Ranges: [0.50, 0.53)
- Edge Ranges: [0.00, 0.03)

**0.9U Tier:**
- Win Rate: 57.6%
- ROI: +6.1%
- Sample Size: 33 bets
- Probability Ranges: [0.55, 0.57)
- Edge Ranges: [0.00, 0.03)

**0.8U Tier:**
- Win Rate: 57.7%
- ROI: +9.9%
- Sample Size: 52 bets
- Probability Ranges: [0.53, 0.55)
- Edge Ranges: [0.00, 0.03)

---

## Recommended Staking System

### Quick Reference

**Assists (Logistic PRA):**
- 2 active betting tiers
- Maximum stake: 3.2U
- Threshold: 0.55+

**Points (LightGBM):** No qualifying tiers
**Rebounds (LightGBM):**
- 3 active betting tiers
- Maximum stake: 1.1U
- Threshold: 0.52+

---

## Implementation Notes

### In Production

When generating predictions with `generate-predictions-phase3.5.mjs`:

1. Each prediction includes `modelProbability` (p̂) and `edge` fields
2. Look up the appropriate tier based on:
   - Model type (assists/points/rebounds)
   - Predicted probability bucket
   - Edge bucket
3. Assign `kellyStake` based on the tier
4. Never exceed 5U per bet

### Caveats & Overfitting Risks

⚠️ **Important Limitations:**

1. **Historical Bias:** These tiers are derived from backtest data and may not generalize perfectly to future bets.
2. **Small Samples:** Some buckets may have limited sample sizes despite our minimum threshold.
3. **Market Changes:** Sportsbook lines and market efficiency evolve over time.
4. **Fractional Kelly:** We use 1/4 Kelly to reduce risk, but even fractional Kelly can be aggressive.
5. **Correlation:** Multiple props on the same player/game are correlated; adjust position sizing accordingly.

### Monitoring & Adjustment

**Recommended practices:**

- Track actual performance vs. predicted for each tier
- Re-run this analysis quarterly with fresh data
- Consider reducing stakes if realized performance diverges from backtest
- Use bankroll management: never risk >20% of total bankroll across all open positions

---

**Analysis Script:** `scripts/nba/analyze_phase3.5_kelly_sizing.py`
**Kelly Scaling Factor:** 0.25 (fractional Kelly)
**Minimum Sample Size:** 30 bets per bucket
