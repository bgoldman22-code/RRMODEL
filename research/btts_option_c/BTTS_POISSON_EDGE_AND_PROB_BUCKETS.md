# BTTS Poisson Edge & Probability Bucket Analysis

**Date:** 2025-01-14
**Model:** Poisson BTTS
**Data:** Walk-forward 6-fold backtest (490 test matches, 1179 total bets across all thresholds)

---

## Executive Summary

This analysis examines how **edge** (model probability - implied probability) and **model probability** relate to betting performance for the Poisson BTTS model.

**Key Findings:**

- **YES side edge monotonicity:** ⚠️ NO - ROI not strictly increasing with edge
- **NO side edge monotonicity:** ⚠️ NO - ROI not strictly increasing with edge
- **YES side prob monotonicity:** ⚠️ NO - ROI not strictly increasing with probability
- **NO side prob monotonicity:** ⚠️ NO - ROI not strictly increasing with probability

---

## Part A1: Edge Bucket Analysis

**Definition:** Edge = model probability - implied probability (from fair odds)

### YES Side (BTTS Occurred)

| Edge Bucket | n_bets | n_wins | Win Rate | Avg Edge | ROI Raw | ROI Fair |
|-------------|--------|--------|----------|----------|---------|----------|
| [0.00, 0.02) | 30 | 25 | 83.3% | +0.011 | +22.40% | +26.52% |
| [0.02, 0.04) | 28 | 24 | 85.7% | +0.024 | +30.18% | +34.53% |
| [0.04, 0.06) | 17 | 13 | 76.5% | +0.049 | +23.35% | +27.68% |
| [0.06, 0.08) | 61 | 46 | 75.4% | +0.072 | +21.87% | +26.13% |
| [0.08, 0.10) | 23 | 23 | 100.0% | +0.084 | +52.26% | +57.36% |
| [0.10, +∞) | 240 | 198 | 82.5% | +0.171 | +38.72% | +43.53% |

### NO Side (BTTS Did NOT Occur)

| Edge Bucket | n_bets | n_wins | Win Rate | Avg Edge | ROI Raw | ROI Fair |
|-------------|--------|--------|----------|----------|---------|----------|
| [0.00, 0.02) | 2 | 0 | 0.0% | +0.003 | -100.00% | -100.00% |
| [0.02, 0.04) | 2 | 1 | 50.0% | +0.033 | -3.50% | +0.26% |
| [0.04, 0.06) | 4 | 0 | 0.0% | +0.049 | -100.00% | -100.00% |
| [0.06, 0.08) | 6 | 0 | 0.0% | +0.070 | -100.00% | -100.00% |
| [0.08, 0.10) | 6 | 1 | 16.7% | +0.094 | -63.17% | -61.92% |
| [0.10, +∞) | 660 | 406 | 61.5% | +0.282 | +32.17% | +36.75% |

**Interpretation:**
- Higher edge buckets should show higher ROI (if model is well-calibrated)
- Non-monotonic trends may indicate calibration issues or small sample noise

---

## Part A2: Probability Bucket Analysis

**Definition:** Bucketed by model's chosen-side probability (p_yes for YES, p_no for NO)

### YES Side (BTTS Occurred)

| Prob Bucket | n_bets | n_wins | Win Rate | Avg Prob | ROI Raw | ROI Fair |
|-------------|--------|--------|----------|----------|---------|----------|
| [0.50, 0.55) | 35 | 23 | 65.7% | 0.519 | +8.71% | +12.43% |
| [0.55, 0.60) | 62 | 46 | 74.2% | 0.574 | +24.61% | +28.92% |
| [0.60, 0.65) | 69 | 54 | 78.3% | 0.627 | +33.22% | +38.00% |
| [0.65, 0.70) | 64 | 56 | 87.5% | 0.683 | +35.12% | +39.69% |
| [0.70, +∞) | 268 | 215 | 80.2% | 0.762 | +28.45% | +32.85% |

### NO Side (BTTS Did NOT Occur)

| Prob Bucket | n_bets | n_wins | Win Rate | Avg Prob | ROI Raw | ROI Fair |
|-------------|--------|--------|----------|----------|---------|----------|
| [0.50, 0.55) | 35 | 11 | 31.4% | 0.528 | -23.54% | -20.90% |
| [0.55, 0.60) | 68 | 20 | 29.4% | 0.574 | -33.00% | -30.68% |
| [0.60, 0.65) | 87 | 48 | 55.2% | 0.625 | +25.03% | +29.25% |
| [0.65, 0.70) | 108 | 52 | 48.1% | 0.671 | +11.67% | +15.38% |
| [0.70, +∞) | 383 | 278 | 72.6% | 0.808 | +50.49% | +55.79% |

**Interpretation:**
- Higher probability buckets should show higher win rates (model calibration)
- ROI trend may differ from win rate trend due to odds movements

---

## Suspicious Buckets & Anomalies

- **[0.04, 0.06)**: Positive edge (+0.049) but negative ROI fair (-100.00%) - 4 bets
- **[0.06, 0.08)**: Positive edge (+0.070) but negative ROI fair (-100.00%) - 6 bets
- **[0.08, 0.10)**: Positive edge (+0.094) but negative ROI fair (-61.92%) - 6 bets
- **[0.04, 0.06)**: Small sample (17 bets) - results may be noisy
- **[0.00, 0.02)**: Small sample (2 bets) - results may be noisy
- **[0.02, 0.04)**: Small sample (2 bets) - results may be noisy
- **[0.04, 0.06)**: Small sample (4 bets) - results may be noisy
- **[0.06, 0.08)**: Small sample (6 bets) - results may be noisy
- **[0.08, 0.10)**: Small sample (6 bets) - results may be noisy

---

## Recommendations

Based on bucket analysis:

1. **Minimum edge threshold:** Consider filtering to edge ≥ 0.02 or 0.04
2. **Probability thresholds:** Current thresholds (0.55-0.65) align well with high-ROI buckets
3. **Combined strategy:** Use both edge AND probability filters (see Part B)

---

## Methodology Notes

- **Data source:** `results/walkforward_poisson_per_bet.csv`
- **Bet granularity:** All threshold combinations (0.50-0.75) across 6 folds
- **Fair odds:** Two-way vig removal (proportional scaling)
- **Edge calculation:** `model_prob - implied_prob_from_fair_odds`

This is a **diagnostic analysis** only - no model training or evaluation logic was modified.