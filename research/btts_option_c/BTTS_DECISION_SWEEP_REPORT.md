# BTTS Decision Threshold Sweep Report

**Date:** December 12, 2025
**Model:** LogisticLeakFreeTuned
**Test matches:** 539
**Configs tested:** 240
**Valid configs:** 96 (≥10 bets)

## Summary Statistics

- **Best ROI:** +11.4% (74 bets)
- **Best Win Rate:** 63.6% (11 bets)
- **Highest Volume:** 22.3% (120 bets)
- **Median ROI:** +7.8%
- **Median Volume:** 12.9%

## Top 10 Configs by ROI

| Rank | T_YES | T_NO | MIN_EDGE | MAX_VIG | #Bets | Vol% | ROI | Win Rate | Avg Edge |
|------|-------|------|----------|---------|-------|------|-----|----------|----------|
| 10 | 0.60 | 0.25 | 0.04 | 0.06 | 74 | 13.7% | +11.4% | 59.5% | +0.094 |
| 56 | 0.60 | 0.40 | 0.04 | 0.08 | 74 | 13.7% | +11.4% | 59.5% | +0.094 |
| 26 | 0.60 | 0.30 | 0.04 | 0.08 | 74 | 13.7% | +11.4% | 59.5% | +0.094 |
| 27 | 0.60 | 0.30 | 0.04 | 0.10 | 74 | 13.7% | +11.4% | 59.5% | +0.094 |
| 57 | 0.60 | 0.40 | 0.04 | 0.10 | 74 | 13.7% | +11.4% | 59.5% | +0.094 |
| 12 | 0.60 | 0.25 | 0.04 | 0.10 | 74 | 13.7% | +11.4% | 59.5% | +0.094 |
| 11 | 0.60 | 0.25 | 0.04 | 0.08 | 74 | 13.7% | +11.4% | 59.5% | +0.094 |
| 25 | 0.60 | 0.30 | 0.04 | 0.06 | 74 | 13.7% | +11.4% | 59.5% | +0.094 |
| 55 | 0.60 | 0.40 | 0.04 | 0.06 | 74 | 13.7% | +11.4% | 59.5% | +0.094 |
| 40 | 0.60 | 0.35 | 0.04 | 0.06 | 74 | 13.7% | +11.4% | 59.5% | +0.094 |

## Recommended Configs

### 🎯 Best ROI (High Precision)

```python
config = {
    'T_YES': 0.60,
    'T_NO': 0.25,
    'MIN_EDGE': 0.04,
    'MAX_VIG': 0.06,
    'BOTH_SIDES_SHORT_MAX': 2.0,
    'REQUIRE_ODDS': True,
    'EDGE_MODE': 'fair'
}
```

**Performance:** ROI=+11.4%, Win Rate=59.5%, Volume=13.7% (74 bets)

### ⚖️ Balanced (ROI + Volume)

```python
config = {
    'T_YES': 0.60,
    'T_NO': 0.25,
    'MIN_EDGE': 0.04,
    'MAX_VIG': 0.06,
    'BOTH_SIDES_SHORT_MAX': 2.0,
    'REQUIRE_ODDS': True,
    'EDGE_MODE': 'fair'
}
```

**Performance:** ROI=+11.4%, Win Rate=59.5%, Volume=13.7% (74 bets)

## Notes

- All configs use FAIR IMPLIED edge (vig-removed)
- ROI computed using fair odds (no bookmaker vig)
- Walk-forward validation on 539 out-of-sample matches
- Higher thresholds → lower volume, higher precision
- Lower thresholds → higher volume, potentially lower ROI

## Full Results

See `results/decision_sweep_logistic_tuned.csv` for complete sweep results.