# Phase 3.8 Market Classifier: Rebounds

**Generated:** 2025-12-02 15:22:08
**Model:** LightGBM binary classifier with isotonic calibration

---

## Dataset

- Total rows: 17,849
- Train: 10,685 (59.9%)
- Val: 3,316 (18.6%)
- Test: 3,848 (21.6%)
- Train date range: 2023-10-24 → 2024-11-19
- Val date range: 2024-11-22 → 2025-01-28
- Test date range: 2025-01-31 → 2025-04-11

---

## Test Metrics

### Raw Model (before calibration)

- **AUC:** 0.5387
- **Brier:** 0.2487
- **LogLoss:** 0.6905
- **Calibration Error:** +0.0012

### Calibrated Model (isotonic on validation set)

- **AUC:** 0.5381 (unchanged, calibration preserves ranking)
- **Brier:** 0.2496 (worse than raw)
- **LogLoss:** 0.6980 (worse than raw)
- **Calibration Error:** +0.0034

---

## Calibration Analysis (Calibrated Probabilities)

| Bucket | Bets | Avg Pred | Hit Rate | Calib Error |
|--------|------|----------|----------|-------------|
| [0.50, 0.55) | 1,047 | 0.530 | 0.507 | +0.023 |
| [0.55, 0.60) | 1,147 | 0.563 | 0.531 | +0.032 |
| [0.60, 0.65) | 72 | 0.647 | 0.528 | +0.119 |
| [0.75, 0.80) | 20 | 0.762 | 0.900 | -0.138 |

---

## Flat-Stake Backtest (Test Set, -110 odds)

### Raw Probabilities

| Threshold | Bets | Wins | Win% | ROI |
|-----------|------|------|------|-----|
| p≥0.55 | 209 | 122 | 58.4% | +11.4% |
| p≥0.60 | 6 | 6 | 100.0% | +90.9% |
| p≥0.65 | 0 | 0 | N/A | N/A |
| p≥0.70 | 0 | 0 | N/A | N/A |

### Calibrated Probabilities

| Threshold | Bets | Wins | Win% | ROI |
|-----------|------|------|------|-----|
| p≥0.55 | 1,239 | 665 | 53.7% | +2.5% |
| p≥0.60 | 92 | 56 | 60.9% | +16.2% |
| p≥0.65 | 20 | 18 | 90.0% | +71.8% |
| p≥0.70 | 20 | 18 | 90.0% | +71.8% |

---

## Summary

**Test AUC:** 0.5381
**Calibrated Brier:** 0.2496

**Key Findings:**
- Best calibrated ROI: **+71.8%** at p≥0.65 (20 bets)
- ⚠️ Maximum calibration error: 0.138 (>10pp in at least one bucket)
- ⚠️ **Weak signal:** AUC 0.5381 (target: 0.55+)

---

**Next Steps:**
- If AUC < 0.55: Consider feature engineering (line-relative features, interaction terms)
- If calibration poor: Investigate specific probability ranges or side-specific patterns
- If promising: Proceed to Block 3 (separate Over/Under models)
