# Phase 3.8 Market Classifier: Points

**Generated:** 2025-12-02 15:22:18
**Model:** LightGBM binary classifier with isotonic calibration

---

## Dataset

- Total rows: 18,598
- Train: 10,948 (58.9%)
- Val: 3,488 (18.8%)
- Test: 4,162 (22.4%)
- Train date range: 2023-10-24 → 2024-11-19
- Val date range: 2024-11-22 → 2025-01-28
- Test date range: 2025-01-31 → 2025-04-11

---

## Test Metrics

### Raw Model (before calibration)

- **AUC:** 0.4975
- **Brier:** 0.2500
- **LogLoss:** 0.6932
- **Calibration Error:** +0.0001

### Calibrated Model (isotonic on validation set)

- **AUC:** 0.5075 (unchanged, calibration preserves ranking)
- **Brier:** 0.2501 (worse than raw)
- **LogLoss:** 0.6933 (worse than raw)
- **Calibration Error:** +0.0003

---

## Calibration Analysis (Calibrated Probabilities)

| Bucket | Bets | Avg Pred | Hit Rate | Calib Error |
|--------|------|----------|----------|-------------|
| [0.50, 0.55) | 1,068 | 0.513 | 0.512 | +0.001 |
| [0.60, 0.65) | 33 | 0.615 | 0.485 | +0.131 |

---

## Flat-Stake Backtest (Test Set, -110 odds)

### Raw Probabilities

| Threshold | Bets | Wins | Win% | ROI |
|-----------|------|------|------|-----|
| p≥0.55 | 0 | 0 | N/A | N/A |
| p≥0.60 | 0 | 0 | N/A | N/A |
| p≥0.65 | 0 | 0 | N/A | N/A |
| p≥0.70 | 0 | 0 | N/A | N/A |

### Calibrated Probabilities

| Threshold | Bets | Wins | Win% | ROI |
|-----------|------|------|------|-----|
| p≥0.55 | 33 | 16 | 48.5% | -7.4% |
| p≥0.60 | 33 | 16 | 48.5% | -7.4% |
| p≥0.65 | 0 | 0 | N/A | N/A |
| p≥0.70 | 0 | 0 | N/A | N/A |

---

## Summary

**Test AUC:** 0.5075
**Calibrated Brier:** 0.2501

**Key Findings:**
- Best calibrated ROI: **-7.4%** at p≥0.55 (33 bets)
- ⚠️ Maximum calibration error: 0.131 (>10pp in at least one bucket)
- 🚨 **No signal:** AUC 0.5075 ≈ random

---

**Next Steps:**
- If AUC < 0.55: Consider feature engineering (line-relative features, interaction terms)
- If calibration poor: Investigate specific probability ranges or side-specific patterns
- If promising: Proceed to Block 3 (separate Over/Under models)
