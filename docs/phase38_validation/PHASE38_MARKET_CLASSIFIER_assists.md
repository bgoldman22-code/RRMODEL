# Phase 3.8 Market Classifier: Assists

**Generated:** 2025-12-02 15:24:05
**Model:** LightGBM binary classifier with isotonic calibration

---

## Dataset

- Total rows: 12,711
- Train: 7,781 (61.2%)
- Val: 2,254 (17.7%)
- Test: 2,676 (21.1%)
- Train date range: 2023-10-24 → 2024-11-19
- Val date range: 2024-11-22 → 2025-01-28
- Test date range: 2025-01-31 → 2025-04-11

---

## Test Metrics

### Raw Model (before calibration)

- **AUC:** 0.5242
- **Brier:** 0.2497
- **LogLoss:** 0.6926
- **Calibration Error:** -0.0003

### Calibrated Model (isotonic on validation set)

- **AUC:** 0.5139 (unchanged, calibration preserves ranking)
- **Brier:** 0.2518 (worse than raw)
- **LogLoss:** 0.7095 (worse than raw)
- **Calibration Error:** -0.0009

---

## Calibration Analysis (Calibrated Probabilities)

| Bucket | Bets | Avg Pred | Hit Rate | Calib Error |
|--------|------|----------|----------|-------------|
| [0.50, 0.55) | 1,317 | 0.509 | 0.513 | -0.004 |
| [0.55, 0.60) | 41 | 0.592 | 0.585 | +0.006 |
| [0.60, 0.65) | 182 | 0.638 | 0.505 | +0.132 |

---

## Flat-Stake Backtest (Test Set, -110 odds)

### Raw Probabilities

| Threshold | Bets | Wins | Win% | ROI |
|-----------|------|------|------|-----|
| p≥0.55 | 164 | 85 | 51.8% | -1.1% |
| p≥0.60 | 2 | 2 | 100.0% | +90.9% |
| p≥0.65 | 0 | 0 | N/A | N/A |
| p≥0.70 | 0 | 0 | N/A | N/A |

### Calibrated Probabilities

| Threshold | Bets | Wins | Win% | ROI |
|-----------|------|------|------|-----|
| p≥0.55 | 223 | 116 | 52.0% | -0.7% |
| p≥0.60 | 182 | 92 | 50.5% | -3.5% |
| p≥0.65 | 0 | 0 | N/A | N/A |
| p≥0.70 | 0 | 0 | N/A | N/A |

---

## Summary

**Test AUC:** 0.5139
**Calibrated Brier:** 0.2518

**Key Findings:**
- Best calibrated ROI: **-0.7%** at p≥0.55 (223 bets)
- ⚠️ Maximum calibration error: 0.132 (>10pp in at least one bucket)
- 🚨 **No signal:** AUC 0.5139 ≈ random

---

**Next Steps:**
- If AUC < 0.55: Consider feature engineering (line-relative features, interaction terms)
- If calibration poor: Investigate specific probability ranges or side-specific patterns
- If promising: Proceed to Block 3 (separate Over/Under models)
