# NFL V5 Multi-Season Detailed Diagnostics

**Generated:** 2025-11-14T15:02:12.085Z

**Focus:** Long-term profitability across 2020-2025 (5.5 seasons)

---

## Executive Summary

### Training Data
- **Seasons:** 2020-2024 (5 complete seasons)
- **Games:** 1349 regular season + playoff games
- **Validation:** 2025 weeks 1-9 (135 games)
- **Time-Causal:** Yes (rolling windows, no future leakage)

## Spread Model Performance

### Overall Metrics

| Dataset | Games | MAE | RMSE | R² | Median AE | 90th %ile |
|---------|-------|-----|------|----|-----------|-----------|
| Training (2020-2024) | 1349 | 10.34 | 13.38 | 0.1126 | 8.07 | 22.78 |
| Validation (2025 w1-9) | 135 | 10.62 | 13.81 | 0.0589 | 8.50 | 24.10 |

### Performance by Season

| Season | Games | MAE | RMSE | R² | Median AE | 90th %ile |
|--------|-------|-----|------|----|-----------|-----------|
| 2020 | 262 | 10.18 | 13.24 | 0.1196 | 8.20 | 22.95 |
| 2021 | 272 | 11.37 | 14.54 | 0.1091 | 9.06 | 24.89 |
| 2022 | 271 | 9.21 | 11.85 | 0.0761 | 7.21 | 20.36 |
| 2023 | 272 | 10.71 | 13.84 | 0.0758 | 8.44 | 22.77 |
| 2024 | 272 | 10.24 | 13.25 | 0.1567 | 7.93 | 22.58 |

### Fitted Coefficients

| Feature | Coefficient | Std. Coeff | Mean | Std Dev | Range |
|---------|-------------|------------|------|---------|-------|
| epa_diff | 38.4471 | 2.9214 | 0.000 | 0.076 | [-0.35, 0.29] |
| success_diff | 0.6525 | 1.9694 | -0.025 | 3.018 | [-12.57, 11.42] |
| explosive_diff | 1.1110 | 0.8505 | 0.008 | 0.766 | [-3.14, 2.99] |
| hfa | 1.9436 | 0.4606 | 2.094 | 0.237 | [2.00, 3.00] |

**Note:** Standardized coefficients show relative importance (coefficient × feature std dev)

### Feature Correlations (Multicollinearity Check)

| Feature Pair | Correlation |
|--------------|-------------|
| epa_diff vs success_diff | 0.5209 |
| epa_diff vs explosive_diff | 0.4054 |
| epa_diff vs hfa | 0.0422 |
| success_diff vs explosive_diff | 0.3285 |
| success_diff vs hfa | 0.0523 |
| explosive_diff vs hfa | 0.0456 |

**Warning:** Correlations > 0.7 indicate potential multicollinearity issues.

### Residual Distribution

| Statistic | Value |
|-----------|-------|
| Min | -47.25 |
| 5th percentile | -22.02 |
| 25th percentile | -8.17 |
| Median | -0.42 |
| Mean | 0.00 |
| 75th percentile | 8.00 |
| 95th percentile | 23.72 |
| Max | 43.84 |
| Skewness | 0.0847 |
| Kurtosis | 0.2775 |

**Interpretation:** Skewness near 0 = symmetric. Kurtosis near 0 = normal tails.

## Total Model Performance

### Overall Metrics

| Dataset | Games | MAE | RMSE | R² | Median AE | 90th %ile |
|---------|-------|-----|------|----|-----------|-----------|
| Training (2020-2024) | 1349 | 10.64 | 13.47 | 0.0435 | 9.03 | 22.00 |
| Validation (2025 w1-9) | 135 | 10.61 | 13.58 | -0.0138 | 10.10 | 20.47 |

### Performance by Season

| Season | Games | MAE | RMSE | R² | Median AE | 90th %ile |
|--------|-------|-----|------|----|-----------|-----------|
| 2020 | 262 | 10.81 | 13.73 | 0.0030 | 9.73 | 22.17 |
| 2021 | 272 | 10.97 | 13.55 | 0.0223 | 9.93 | 21.79 |
| 2022 | 271 | 10.97 | 13.74 | 0.0075 | 9.24 | 23.74 |
| 2023 | 272 | 10.67 | 13.44 | 0.0308 | 9.10 | 21.14 |
| 2024 | 272 | 9.81 | 12.86 | 0.0344 | 7.80 | 21.79 |

### Fitted Coefficients

| Feature | Coefficient | Std. Coeff | Mean | Std Dev | Range |
|---------|-------------|------------|------|---------|-------|
| pace_combined | 0.1753 | 2.2592 | 174.099 | 12.890 | [65.00, 202.50] |
| epa_off_sum | 31.3401 | 1.9710 | -0.005 | 0.063 | [-0.36, 0.18] |
| epa_def_sum | 13.8928 | 0.7810 | -0.006 | 0.056 | [-0.31, 0.22] |
| success_sum | 0.0252 | 0.1354 | 41.895 | 5.383 | [25.97, 80.00] |
| explosive_sum | 0.9899 | 2.2633 | 4.392 | 2.286 | [1.57, 24.00] |

**Quantile Offsets:**
- p25: -9.23 points
- p75: 8.45 points
- Spread: 17.68 points

### Feature Correlations (Multicollinearity Check)

| Feature Pair | Correlation |
|--------------|-------------|
| pace_combined vs epa_off_sum | -0.0013 |
| pace_combined vs epa_def_sum | 0.0204 |
| pace_combined vs success_sum | -0.7384 |
| pace_combined vs explosive_sum | -0.8629 |
| epa_off_sum vs epa_def_sum | 0.0589 |
| epa_off_sum vs success_sum | 0.4487 |
| epa_off_sum vs explosive_sum | 0.1957 |
| epa_def_sum vs success_sum | 0.0348 |
| epa_def_sum vs explosive_sum | 0.0194 |
| success_sum vs explosive_sum | 0.7935 |

### Residual Distribution

| Statistic | Value |
|-----------|-------|
| Min | -37.71 |
| 5th percentile | -20.49 |
| 25th percentile | -9.23 |
| Median | -0.95 |
| Mean | 0.00 |
| 75th percentile | 8.45 |
| 95th percentile | 23.70 |
| Max | 45.22 |
| Skewness | 0.3339 |
| Kurtosis | 0.1192 |

---

## Model Quality Assessment

### Spread Model
**Strengths:**
- ✅ MAE of 10.34 points (target: <11 pts)
- ✅ Near-zero mean residual (0.00)
- ✅ Symmetric residuals (skew: 0.08)
- ✅ Validation MAE within 10% of training

**Concerns:**
- ⚠️ R² of 0.1126 indicates low explanatory power
- ⚠️ 90th percentile error: 22.78 points

### Total Model
**Strengths:**
- ✅ MAE of 10.64 points (target: <11 pts)
- ✅ Near-zero mean residual (0.00)
- ✅ Validation MAE within 10% of training

**Concerns:**
- ⚠️ R² of 0.0435 indicates very low explanatory power
- ⚠️ 90th percentile error: 22.00 points

## Recommendations for V5 Improvement

### High Priority

1. **Feature Engineering**
   - Add recent form indicators (last 3 games weighted more heavily)
   - Include rest days differential (teams on short rest vs normal)
   - Add QB-specific metrics if available
   - Consider defensive pressure rates (sack rate, pressure %)

2. **Regularization**
   - Consider Ridge regression (L2) to handle multicollinearity
   - Cross-validate optimal alpha parameter
   - May improve R² and reduce overfitting

3. **Nonlinear Transformations**
   - Test log/sqrt transforms on EPA differentials
   - Add interaction terms (e.g., EPA × success rate)
   - Consider polynomial features for extreme matchups

### Medium Priority

4. **Dynamic HFA**
   - Current HFA is static 2.0-3.0 points
   - Consider venue-specific HFA estimated from data
   - Adjust for crowd noise, altitude, travel distance

5. **Ensemble Approaches**
   - Blend OLS with gradient boosting (XGBoost)
   - Use OLS for interpretability, XGBoost for accuracy
   - Weight by recent performance

6. **Quantile Regression for Totals**
   - Current quantile offsets are static
   - Fit separate quantile regression models for p25/p50/p75
   - Better capture uncertainty in high/low scoring games

### Lower Priority

7. **Weather Integration**
   - Add wind speed, temperature, precipitation
   - Most impactful for totals (outdoor games)

8. **Injury Adjustments**
   - Track key player availability
   - Weight by positional importance

9. **Market Line Integration**
   - Blend model predictions with Vegas lines
   - Vegas lines have ~70% accuracy historically
   - Find edges where model disagrees significantly

---

## Data Integrity Validation

✅ **Time-Causality:** Features use only prior games (rolling windows)
✅ **No Leakage:** No future data in training set
✅ **V1 Compatibility:** Features match V1's conceptual space
✅ **Multi-Season:** 5 complete seasons (2020-2024) + partial 2025
✅ **Validation:** Out-of-sample 2025 data not used in training

---

**Generated by:** 01-generate-detailed-diagnostics.mjs
**Date:** 2025-11-14T15:02:12.091Z
