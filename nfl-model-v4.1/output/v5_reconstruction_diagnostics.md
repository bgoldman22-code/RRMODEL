# NFL V5 Multi-Season Reconstruction Diagnostics

**Generated:** 2025-11-14T16:35:17.562Z

---

## Training Data Summary

- **Training Window:** 2020-2024 regular season (weeks 1-18)
- **Training Games:** 1349
- **Validation:** 2025 weeks 1-9 (135 games)
- **Spot-Check:** 2025 Week 10 (0 games)
- **Time-Causal:** Yes (rolling windows, no future leakage)

## Spread Model Results

**Model:** V3 Multi-Feature EPA

**Coefficients:**
- Intercept: -2.4230
- epa_diff: 38.4471
- success_diff: 0.6525
- explosive_diff: 1.1110
- hfa: 1.9436

**Training Metrics:**
- R² = 0.1126
- MAE = 10.34 points
- RMSE = 13.38 points

**Validation Metrics (2025):**
- MAE = 10.62 points
- RMSE = 13.81 points

## Total Model Results

**Model:** V5 Quantile Blend

**Coefficients (p50):**
- Intercept: 10.0409
- pace_combined: 0.1753
- epa_off_sum: 31.3401
- epa_def_sum: 13.8928
- success_sum: 0.0252
- explosive_sum: 0.9899

**Quantile Offsets:**
- p25: -9.23 points
- p75: 8.45 points
- Spread (p75-p25): 17.68 points

**Training Metrics:**
- R² = 0.0435
- MAE = 10.64 points
- RMSE = 13.47 points

**Validation Metrics (2025):**
- MAE = 10.61 points
- RMSE = 13.58 points

---

## Data Integrity Notes

1. **Time-Causality:** All features use rolling windows computed from prior games only
2. **Regular Season Focus:** Training uses weeks 1-18 (no playoffs)
3. **V1 Compatibility:** Features match V1's conceptual space (EPA, success, explosive, pace)
4. **Multi-Season:** 1,408 games across 5 complete seasons (2020-2024)
