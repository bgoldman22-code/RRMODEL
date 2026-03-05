# Pre-Odds Market Screen — Signal Assessment

**Generated:** 2026-02-10 13:56
**Method:** Walk-forward (train ≤ year N-1, test year N)
**Models:** LogReg + LightGBM (classification), Ridge + LightGBM (regression)
**Test Years:** [2023, 2024, 2025]
**Feature set:** 253 production features
**Metrics:** AUC, Brier, LogLoss, Calibration (classification); MAE, RMSE, R² (regression)

## Decision Gates

### Classification
- AUC ≥ 0.535 in ≥2/3 splits
- Brier improvement vs naive ≥ 0.003 in ≥2/3 splits
- Calibration slope ∈ [0.85, 1.15] in ≥2/3 splits
- Minimum N ≥ 800 across all years

### NRFI/YRFI (stricter)
- AUC ≥ 0.545
- Brier improvement ≥ 0.004

### Regression
- MAE improvement vs predict-mean ≥ 3.0% in ≥2/3 splits
- Stable error across months (no single-month blowup)

## Summary Verdicts

| Market | Threshold | Type | Best Model | Verdict |
|--------|-----------|------|------------|---------|
| F5_TeamTotals_away | over_1.5 | classification | LightGBM | 🟡 **COLLECT_IF_FEATURES_CHANGE** |
| F5_TeamTotals_away | over_3.0 | classification | LightGBM | 🟡 **COLLECT_IF_FEATURES_CHANGE** |
| F5_TeamTotals_home | over_1.5 | classification | LogReg | 🟡 **COLLECT_IF_FEATURES_CHANGE** |
| F5_TeamTotals_home | over_2.0 | classification | LogReg | 🟡 **COLLECT_IF_FEATURES_CHANGE** |
| F5_TeamTotals_home | over_2.5 | classification | LogReg | 🟡 **COLLECT_IF_FEATURES_CHANGE** |
| F5_TeamTotals_home | over_3.0 | classification | LogReg | 🟡 **COLLECT_IF_FEATURES_CHANGE** |
| F5_Totals | over_5.0 | classification | LightGBM | 🟡 **COLLECT_IF_FEATURES_CHANGE** |
| F5_Totals | over_5.5 | classification | LightGBM | 🟡 **COLLECT_IF_FEATURES_CHANGE** |
| F5_TeamTotals_away | continuous | regression | LightGBM | 🔴 **DO_NOT_COLLECT** |
| F5_TeamTotals_away | over_2.0 | classification | LogReg | 🔴 **DO_NOT_COLLECT** |
| F5_TeamTotals_away | over_2.5 | classification | LogReg | 🔴 **DO_NOT_COLLECT** |
| F5_TeamTotals_home | continuous | regression | LightGBM | 🔴 **DO_NOT_COLLECT** |
| F5_Totals | continuous | regression | LightGBM | 🔴 **DO_NOT_COLLECT** |
| F5_Totals | over_3.5 | classification | LogReg | 🔴 **DO_NOT_COLLECT** |
| F5_Totals | over_4.0 | classification | LogReg | 🔴 **DO_NOT_COLLECT** |
| F5_Totals | over_4.5 | classification | LogReg | 🔴 **DO_NOT_COLLECT** |
| NRFI | nrfi | classification | LogReg | 🔴 **DO_NOT_COLLECT** |
| YRFI | yrfi | classification | LogReg | 🔴 **DO_NOT_COLLECT** |

## Conclusion

### ✅ Collect odds for:

- *(none)*

### 🔴 Do NOT collect odds for:

- **F5_TeamTotals_away / over_2.0** (classification)
- **F5_TeamTotals_away / over_2.5** (classification)
- **F5_Totals / over_3.5** (classification)
- **F5_Totals / over_4.0** (classification)
- **F5_Totals / over_4.5** (classification)
- **NRFI / nrfi** (classification)
- **YRFI / yrfi** (classification)
- **F5_TeamTotals_away / continuous** (regression)
- **F5_TeamTotals_home / continuous** (regression)
- **F5_Totals / continuous** (regression)

### 🟡 Only collect odds if we change features/model:

- **F5_TeamTotals_away / over_1.5** (classification, LightGBM)
- **F5_TeamTotals_away / over_3.0** (classification, LightGBM)
- **F5_TeamTotals_home / over_1.5** (classification, LogReg)
- **F5_TeamTotals_home / over_2.0** (classification, LogReg)
- **F5_TeamTotals_home / over_2.5** (classification, LogReg)
- **F5_TeamTotals_home / over_3.0** (classification, LogReg)
- **F5_Totals / over_5.0** (classification, LightGBM)
- **F5_Totals / over_5.5** (classification, LightGBM)

## Classification Metrics by Threshold

| Market | Threshold | Model | Test Year | N | Base Rate | AUC | Brier | Brier Δ | LogLoss | LL Naive | Cal Slope | Mono |
|--------|-----------|-------|-----------|---|-----------|-----|-------|---------|---------|----------|-----------|------|
| F5_TeamTotals_away | over_1.5 | LightGBM | 2023 | 2430 | 0.582 | 0.5390 | 0.264359 | -0.021133 | 0.7289 | 0.6795 | 0.181 | ✓ |
| F5_TeamTotals_away | over_1.5 | LightGBM | 2024 | 2430 | 0.565 | 0.5367 | 0.253607 | -0.007834 | 0.7025 | 0.6847 | 0.250 | ✓ |
| F5_TeamTotals_away | over_1.5 | LightGBM | 2025 | 2430 | 0.552 | 0.5503 | 0.249726 | -0.002457 | 0.6938 | 0.6877 | 0.395 | ✓ |
| F5_TeamTotals_away | over_1.5 | LogReg | 2023 | 2430 | 0.582 | 0.5105 | 0.285161 | -0.041935 | 0.7888 | 0.6795 | 0.032 | ✗ |
| F5_TeamTotals_away | over_1.5 | LogReg | 2024 | 2430 | 0.565 | 0.5439 | 0.251002 | -0.005230 | 0.6981 | 0.6847 | 0.269 | ✗ |
| F5_TeamTotals_away | over_1.5 | LogReg | 2025 | 2430 | 0.552 | 0.5628 | 0.246964 | +0.000305 | 0.6884 | 0.6877 | 0.489 | ✓ |
| F5_TeamTotals_away | over_2.0 | LightGBM | 2023 | 2430 | 0.415 | 0.5304 | 0.264096 | -0.021283 | 0.7374 | 0.6787 | 0.139 | ✓ |
| F5_TeamTotals_away | over_2.0 | LightGBM | 2024 | 2430 | 0.386 | 0.5314 | 0.247130 | -0.010030 | 0.6903 | 0.6671 | 0.189 | ✓ |
| F5_TeamTotals_away | over_2.0 | LightGBM | 2025 | 2430 | 0.381 | 0.5490 | 0.239370 | -0.003612 | 0.6730 | 0.6644 | 0.336 | ✗ |
| F5_TeamTotals_away | over_2.0 | LogReg | 2023 | 2430 | 0.415 | 0.5337 | 0.264135 | -0.021322 | 0.7427 | 0.6787 | 0.151 | ✗ |
| F5_TeamTotals_away | over_2.0 | LogReg | 2024 | 2430 | 0.386 | 0.5295 | 0.247285 | -0.010185 | 0.6908 | 0.6671 | 0.183 | ✓ |
| F5_TeamTotals_away | over_2.0 | LogReg | 2025 | 2430 | 0.381 | 0.5606 | 0.235955 | -0.000197 | 0.6654 | 0.6644 | 0.476 | ✓ |
| F5_TeamTotals_away | over_2.5 | LightGBM | 2023 | 2430 | 0.415 | 0.5304 | 0.264096 | -0.021283 | 0.7374 | 0.6787 | 0.139 | ✓ |
| F5_TeamTotals_away | over_2.5 | LightGBM | 2024 | 2430 | 0.386 | 0.5314 | 0.247130 | -0.010030 | 0.6903 | 0.6671 | 0.189 | ✓ |
| F5_TeamTotals_away | over_2.5 | LightGBM | 2025 | 2430 | 0.381 | 0.5490 | 0.239370 | -0.003612 | 0.6730 | 0.6644 | 0.336 | ✗ |
| F5_TeamTotals_away | over_2.5 | LogReg | 2023 | 2430 | 0.415 | 0.5337 | 0.264135 | -0.021322 | 0.7427 | 0.6787 | 0.151 | ✗ |
| F5_TeamTotals_away | over_2.5 | LogReg | 2024 | 2430 | 0.386 | 0.5295 | 0.247285 | -0.010185 | 0.6908 | 0.6671 | 0.183 | ✓ |
| F5_TeamTotals_away | over_2.5 | LogReg | 2025 | 2430 | 0.381 | 0.5606 | 0.235955 | -0.000197 | 0.6654 | 0.6644 | 0.476 | ✓ |
| F5_TeamTotals_away | over_3.0 | LightGBM | 2023 | 2430 | 0.285 | 0.5493 | 0.218943 | -0.015089 | 0.6570 | 0.5978 | 0.215 | ✓ |
| F5_TeamTotals_away | over_3.0 | LightGBM | 2024 | 2430 | 0.254 | 0.5429 | 0.195547 | -0.005905 | 0.5835 | 0.5670 | 0.243 | ✓ |
| F5_TeamTotals_away | over_3.0 | LightGBM | 2025 | 2430 | 0.257 | 0.5568 | 0.192806 | -0.001958 | 0.5747 | 0.5697 | 0.396 | ✗ |
| F5_TeamTotals_away | over_3.0 | LogReg | 2023 | 2430 | 0.285 | 0.5394 | 0.218773 | -0.014918 | 0.6599 | 0.5978 | 0.169 | ✓ |
| F5_TeamTotals_away | over_3.0 | LogReg | 2024 | 2430 | 0.254 | 0.5410 | 0.198499 | -0.008857 | 0.5903 | 0.5670 | 0.210 | ✓ |
| F5_TeamTotals_away | over_3.0 | LogReg | 2025 | 2430 | 0.257 | 0.5573 | 0.192701 | -0.001852 | 0.5759 | 0.5697 | 0.370 | ✓ |
| F5_TeamTotals_home | over_1.5 | LightGBM | 2023 | 2430 | 0.608 | 0.5153 | 0.255986 | -0.017611 | 0.7099 | 0.6697 | 0.101 | ✓ |
| F5_TeamTotals_home | over_1.5 | LightGBM | 2024 | 2430 | 0.592 | 0.5404 | 0.247983 | -0.006404 | 0.6920 | 0.6762 | 0.264 | ✓ |
| F5_TeamTotals_home | over_1.5 | LightGBM | 2025 | 2430 | 0.603 | 0.5279 | 0.244900 | -0.005485 | 0.6845 | 0.6718 | 0.238 | ✓ |
| F5_TeamTotals_home | over_1.5 | LogReg | 2023 | 2430 | 0.608 | 0.5180 | 0.262599 | -0.024224 | 0.7324 | 0.6697 | 0.060 | ✓ |
| F5_TeamTotals_home | over_1.5 | LogReg | 2024 | 2430 | 0.592 | 0.5415 | 0.247330 | -0.005752 | 0.6922 | 0.6762 | 0.276 | ✓ |
| F5_TeamTotals_home | over_1.5 | LogReg | 2025 | 2430 | 0.603 | 0.5395 | 0.243239 | -0.003823 | 0.6815 | 0.6718 | 0.291 | ✓ |
| F5_TeamTotals_home | over_2.0 | LightGBM | 2023 | 2430 | 0.451 | 0.5244 | 0.265435 | -0.017873 | 0.7333 | 0.6883 | 0.139 | ✓ |
| F5_TeamTotals_home | over_2.0 | LightGBM | 2024 | 2430 | 0.416 | 0.5463 | 0.249321 | -0.006369 | 0.6944 | 0.6790 | 0.271 | ✗ |
| F5_TeamTotals_home | over_2.0 | LightGBM | 2025 | 2430 | 0.431 | 0.5355 | 0.250358 | -0.005081 | 0.6949 | 0.6837 | 0.280 | ✓ |
| F5_TeamTotals_home | over_2.0 | LogReg | 2023 | 2430 | 0.451 | 0.5249 | 0.272651 | -0.025089 | 0.7563 | 0.6883 | 0.112 | ✓ |
| F5_TeamTotals_home | over_2.0 | LogReg | 2024 | 2430 | 0.416 | 0.5486 | 0.248901 | -0.005949 | 0.6970 | 0.6790 | 0.240 | ✓ |
| F5_TeamTotals_home | over_2.0 | LogReg | 2025 | 2430 | 0.431 | 0.5372 | 0.249475 | -0.004198 | 0.6942 | 0.6837 | 0.273 | ✓ |
| F5_TeamTotals_home | over_2.5 | LightGBM | 2023 | 2430 | 0.451 | 0.5244 | 0.265435 | -0.017873 | 0.7333 | 0.6883 | 0.139 | ✓ |
| F5_TeamTotals_home | over_2.5 | LightGBM | 2024 | 2430 | 0.416 | 0.5463 | 0.249321 | -0.006369 | 0.6944 | 0.6790 | 0.271 | ✗ |
| F5_TeamTotals_home | over_2.5 | LightGBM | 2025 | 2430 | 0.431 | 0.5355 | 0.250358 | -0.005081 | 0.6949 | 0.6837 | 0.280 | ✓ |
| F5_TeamTotals_home | over_2.5 | LogReg | 2023 | 2430 | 0.451 | 0.5249 | 0.272651 | -0.025089 | 0.7563 | 0.6883 | 0.112 | ✓ |
| F5_TeamTotals_home | over_2.5 | LogReg | 2024 | 2430 | 0.416 | 0.5486 | 0.248901 | -0.005949 | 0.6970 | 0.6790 | 0.240 | ✓ |
| F5_TeamTotals_home | over_2.5 | LogReg | 2025 | 2430 | 0.431 | 0.5372 | 0.249475 | -0.004198 | 0.6942 | 0.6837 | 0.273 | ✓ |
| F5_TeamTotals_home | over_3.0 | LightGBM | 2023 | 2430 | 0.308 | 0.5179 | 0.229527 | -0.016461 | 0.6749 | 0.6173 | 0.093 | ✓ |
| F5_TeamTotals_home | over_3.0 | LightGBM | 2024 | 2430 | 0.290 | 0.5563 | 0.208167 | -0.002215 | 0.6098 | 0.6023 | 0.374 | ✓ |
| F5_TeamTotals_home | over_3.0 | LightGBM | 2025 | 2430 | 0.304 | 0.5281 | 0.216054 | -0.004586 | 0.6266 | 0.6140 | 0.254 | ✓ |
| F5_TeamTotals_home | over_3.0 | LogReg | 2023 | 2430 | 0.308 | 0.5171 | 0.231690 | -0.018624 | 0.6833 | 0.6173 | 0.064 | ✗ |
| F5_TeamTotals_home | over_3.0 | LogReg | 2024 | 2430 | 0.290 | 0.5553 | 0.210999 | -0.005047 | 0.6207 | 0.6023 | 0.240 | ✓ |
| F5_TeamTotals_home | over_3.0 | LogReg | 2025 | 2430 | 0.304 | 0.5547 | 0.212939 | -0.001471 | 0.6184 | 0.6140 | 0.409 | ✓ |
| F5_Totals | over_3.5 | LightGBM | 2023 | 2430 | 0.635 | 0.5100 | 0.249378 | -0.017598 | 0.6978 | 0.6563 | 0.059 | ✓ |
| F5_Totals | over_3.5 | LightGBM | 2024 | 2430 | 0.618 | 0.5227 | 0.243626 | -0.007576 | 0.6828 | 0.6650 | 0.161 | ✗ |
| F5_Totals | over_3.5 | LightGBM | 2025 | 2430 | 0.625 | 0.5215 | 0.240094 | -0.005848 | 0.6742 | 0.6613 | 0.190 | ✓ |
| F5_Totals | over_3.5 | LogReg | 2023 | 2430 | 0.635 | 0.5125 | 0.258241 | -0.026460 | 0.7203 | 0.6563 | 0.027 | ✗ |
| F5_Totals | over_3.5 | LogReg | 2024 | 2430 | 0.618 | 0.5207 | 0.244728 | -0.008677 | 0.6870 | 0.6650 | 0.090 | ✗ |
| F5_Totals | over_3.5 | LogReg | 2025 | 2430 | 0.625 | 0.5423 | 0.236138 | -0.001892 | 0.6657 | 0.6613 | 0.376 | ✓ |
| F5_Totals | over_4.0 | LightGBM | 2023 | 2430 | 0.532 | 0.5014 | 0.276364 | -0.027421 | 0.7536 | 0.6910 | 0.008 | ✓ |
| F5_Totals | over_4.0 | LightGBM | 2024 | 2430 | 0.495 | 0.5299 | 0.256839 | -0.006868 | 0.7081 | 0.6931 | 0.243 | ✓ |
| F5_Totals | over_4.0 | LightGBM | 2025 | 2430 | 0.496 | 0.5451 | 0.251611 | -0.001628 | 0.6969 | 0.6931 | 0.406 | ✗ |
| F5_Totals | over_4.0 | LogReg | 2023 | 2430 | 0.532 | 0.5092 | 0.280453 | -0.031510 | 0.7737 | 0.6910 | 0.024 | ✗ |
| F5_Totals | over_4.0 | LogReg | 2024 | 2430 | 0.495 | 0.5288 | 0.259632 | -0.009660 | 0.7163 | 0.6931 | 0.159 | ✗ |
| F5_Totals | over_4.0 | LogReg | 2025 | 2430 | 0.496 | 0.5503 | 0.250358 | -0.000375 | 0.6944 | 0.6931 | 0.462 | ✓ |
| F5_Totals | over_4.5 | LightGBM | 2023 | 2430 | 0.532 | 0.5014 | 0.276364 | -0.027421 | 0.7536 | 0.6910 | 0.008 | ✓ |
| F5_Totals | over_4.5 | LightGBM | 2024 | 2430 | 0.495 | 0.5299 | 0.256839 | -0.006868 | 0.7081 | 0.6931 | 0.243 | ✓ |
| F5_Totals | over_4.5 | LightGBM | 2025 | 2430 | 0.496 | 0.5451 | 0.251611 | -0.001628 | 0.6969 | 0.6931 | 0.406 | ✗ |
| F5_Totals | over_4.5 | LogReg | 2023 | 2430 | 0.532 | 0.5092 | 0.280453 | -0.031510 | 0.7737 | 0.6910 | 0.024 | ✗ |
| F5_Totals | over_4.5 | LogReg | 2024 | 2430 | 0.495 | 0.5288 | 0.259632 | -0.009660 | 0.7163 | 0.6931 | 0.159 | ✗ |
| F5_Totals | over_4.5 | LogReg | 2025 | 2430 | 0.496 | 0.5503 | 0.250358 | -0.000375 | 0.6944 | 0.6931 | 0.462 | ✓ |
| F5_Totals | over_5.0 | LightGBM | 2023 | 2430 | 0.415 | 0.5043 | 0.266538 | -0.023795 | 0.7432 | 0.6786 | 0.018 | ✓ |
| F5_Totals | over_5.0 | LightGBM | 2024 | 2430 | 0.377 | 0.5465 | 0.239398 | -0.004437 | 0.6728 | 0.6628 | 0.323 | ✓ |
| F5_Totals | over_5.0 | LightGBM | 2025 | 2430 | 0.380 | 0.5538 | 0.236938 | -0.001377 | 0.6681 | 0.6640 | 0.410 | ✓ |
| F5_Totals | over_5.0 | LogReg | 2023 | 2430 | 0.415 | 0.4895 | 0.272341 | -0.029598 | 0.7660 | 0.6786 | -0.065 | ✗ |
| F5_Totals | over_5.0 | LogReg | 2024 | 2430 | 0.377 | 0.5261 | 0.245389 | -0.010428 | 0.6883 | 0.6628 | 0.119 | ✗ |
| F5_Totals | over_5.0 | LogReg | 2025 | 2430 | 0.380 | 0.5685 | 0.233772 | +0.001788 | 0.6605 | 0.6640 | 0.590 | ✗ |
| F5_Totals | over_5.5 | LightGBM | 2023 | 2430 | 0.415 | 0.5043 | 0.266538 | -0.023795 | 0.7432 | 0.6786 | 0.018 | ✓ |
| F5_Totals | over_5.5 | LightGBM | 2024 | 2430 | 0.377 | 0.5465 | 0.239398 | -0.004437 | 0.6728 | 0.6628 | 0.323 | ✓ |
| F5_Totals | over_5.5 | LightGBM | 2025 | 2430 | 0.380 | 0.5538 | 0.236938 | -0.001377 | 0.6681 | 0.6640 | 0.410 | ✓ |
| F5_Totals | over_5.5 | LogReg | 2023 | 2430 | 0.415 | 0.4895 | 0.272341 | -0.029598 | 0.7660 | 0.6786 | -0.065 | ✗ |
| F5_Totals | over_5.5 | LogReg | 2024 | 2430 | 0.377 | 0.5261 | 0.245389 | -0.010428 | 0.6883 | 0.6628 | 0.119 | ✗ |
| F5_Totals | over_5.5 | LogReg | 2025 | 2430 | 0.380 | 0.5685 | 0.233772 | +0.001788 | 0.6605 | 0.6640 | 0.590 | ✗ |
| NRFI | nrfi | LightGBM | 2023 | 2430 | 0.498 | 0.5105 | 0.270227 | -0.020232 | 0.7405 | 0.6931 | 0.044 | ✗ |
| NRFI | nrfi | LightGBM | 2024 | 2427 | 0.533 | 0.5057 | 0.262777 | -0.013850 | 0.7211 | 0.6910 | 0.031 | ✓ |
| NRFI | nrfi | LightGBM | 2025 | 2430 | 0.498 | 0.5218 | 0.255654 | -0.005658 | 0.7051 | 0.6931 | 0.226 | ✓ |
| NRFI | nrfi | LogReg | 2023 | 2430 | 0.498 | 0.5122 | 0.269522 | -0.019526 | 0.7396 | 0.6931 | 0.068 | ✗ |
| NRFI | nrfi | LogReg | 2024 | 2427 | 0.533 | 0.5082 | 0.260969 | -0.012042 | 0.7167 | 0.6910 | 0.063 | ✓ |
| NRFI | nrfi | LogReg | 2025 | 2430 | 0.498 | 0.5212 | 0.253852 | -0.003856 | 0.7012 | 0.6931 | 0.261 | ✓ |
| YRFI | yrfi | LightGBM | 2023 | 2430 | 0.502 | 0.5105 | 0.270227 | -0.020232 | 0.7405 | 0.6931 | 0.044 | ✗ |
| YRFI | yrfi | LightGBM | 2024 | 2427 | 0.467 | 0.5057 | 0.262777 | -0.013850 | 0.7211 | 0.6910 | 0.031 | ✓ |
| YRFI | yrfi | LightGBM | 2025 | 2430 | 0.502 | 0.5218 | 0.255654 | -0.005658 | 0.7051 | 0.6931 | 0.226 | ✓ |
| YRFI | yrfi | LogReg | 2023 | 2430 | 0.502 | 0.5121 | 0.269518 | -0.019522 | 0.7395 | 0.6931 | 0.068 | ✗ |
| YRFI | yrfi | LogReg | 2024 | 2427 | 0.467 | 0.5082 | 0.260915 | -0.011988 | 0.7166 | 0.6910 | 0.064 | ✓ |
| YRFI | yrfi | LogReg | 2025 | 2430 | 0.502 | 0.5210 | 0.253898 | -0.003902 | 0.7013 | 0.6931 | 0.258 | ✓ |

## Regression Metrics

| Market | Target | Model | Test Year | N | Naive MAE | Model MAE | MAE Imp% | RMSE | R² | Month Stable |
|--------|--------|-------|-----------|---|-----------|-----------|----------|------|----|-------------|
| F5_TeamTotals_away | y_away_f5 | LightGBM | 2023 | 2430 | 1.8666 | 1.8925 | -1.39% | 2.4907 | -0.0570 | ✓ |
| F5_TeamTotals_away | y_away_f5 | LightGBM | 2024 | 2430 | 1.7866 | 1.8166 | -1.68% | 2.2997 | -0.0310 | ✓ |
| F5_TeamTotals_away | y_away_f5 | LightGBM | 2025 | 2430 | 1.8446 | 1.8264 | +0.99% | 2.3416 | 0.0011 | ✓ |
| F5_TeamTotals_away | y_away_f5 | Ridge | 2023 | 2430 | 1.8666 | 1.9574 | -4.87% | 2.6025 | -0.1541 | ✓ |
| F5_TeamTotals_away | y_away_f5 | Ridge | 2024 | 2430 | 1.7866 | 1.8099 | -1.31% | 2.3010 | -0.0321 | ✓ |
| F5_TeamTotals_away | y_away_f5 | Ridge | 2025 | 2430 | 1.8446 | 1.8097 | +1.89% | 2.3298 | 0.0112 | ✓ |
| F5_TeamTotals_home | y_home_f5 | LightGBM | 2023 | 2430 | 1.9225 | 1.9492 | -1.39% | 2.5255 | -0.0523 | ✓ |
| F5_TeamTotals_home | y_home_f5 | LightGBM | 2024 | 2430 | 1.9106 | 1.9235 | -0.68% | 2.4225 | -0.0289 | ✓ |
| F5_TeamTotals_home | y_home_f5 | LightGBM | 2025 | 2430 | 1.8769 | 1.8812 | -0.23% | 2.4029 | -0.0216 | ✓ |
| F5_TeamTotals_home | y_home_f5 | Ridge | 2023 | 2430 | 1.9225 | 1.9823 | -3.11% | 2.5926 | -0.1089 | ✓ |
| F5_TeamTotals_home | y_home_f5 | Ridge | 2024 | 2430 | 1.9106 | 1.9405 | -1.56% | 2.4355 | -0.0400 | ✓ |
| F5_TeamTotals_home | y_home_f5 | Ridge | 2025 | 2430 | 1.8769 | 1.8763 | +0.03% | 2.3832 | -0.0049 | ✓ |
| F5_Totals | y_f5_total | LightGBM | 2023 | 2430 | 2.7449 | 2.8234 | -2.86% | 3.6301 | -0.0722 | ✓ |
| F5_Totals | y_f5_total | LightGBM | 2024 | 2430 | 2.5557 | 2.6144 | -2.30% | 3.2785 | -0.0319 | ✓ |
| F5_Totals | y_f5_total | LightGBM | 2025 | 2430 | 2.6082 | 2.6374 | -1.12% | 3.3497 | -0.0145 | ✓ |
| F5_Totals | y_f5_total | Ridge | 2023 | 2430 | 2.7449 | 2.8853 | -5.11% | 3.7996 | -0.1747 | ✓ |
| F5_Totals | y_f5_total | Ridge | 2024 | 2430 | 2.5557 | 2.6381 | -3.22% | 3.3150 | -0.0550 | ✓ |
| F5_Totals | y_f5_total | Ridge | 2025 | 2430 | 2.6082 | 2.6014 | +0.26% | 3.3056 | 0.0121 | ✓ |

## Detailed Gate Rationale

### F5_TeamTotals_away / continuous (regression)

**Verdict: 🔴 DO_NOT_COLLECT**

```
Best model: LightGBM
MAE improvements: ['-1.39%', '-1.68%', '+0.99%']
Monthly stability: 3/3 splits stable

Gate results (2/3 needed):
  ❌ MAE imp ≥ 3.0%: 0/3
  ✅ Monthly stable: 3/3

→ No meaningful MAE improvement over naive baseline.
```

### F5_TeamTotals_away / over_1.5 (classification)

**Verdict: 🟡 COLLECT_IF_FEATURES_CHANGE**

```
Best model: LightGBM
AUCs: ['0.5390', '0.5367', '0.5503']
Brier improvements: ['-0.021133', '-0.007834', '-0.002457']
Cal slopes: ['0.181', '0.250', '0.395']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 3/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed alone. Weak signal.
  Only pursue if model architecture or features significantly change.
```

### F5_TeamTotals_away / over_2.0 (classification)

**Verdict: 🔴 DO_NOT_COLLECT**

```
Best model: LogReg
AUCs: ['0.5337', '0.5295', '0.5606']
Brier improvements: ['-0.021322', '-0.010185', '-0.000197']
Cal slopes: ['0.151', '0.183', '0.476']
N total: 7290 

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.535: 1/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate FAILED. No consistent pregame signal.
  Do NOT collect odds for this market.
```

### F5_TeamTotals_away / over_2.5 (classification)

**Verdict: 🔴 DO_NOT_COLLECT**

```
Best model: LogReg
AUCs: ['0.5337', '0.5295', '0.5606']
Brier improvements: ['-0.021322', '-0.010185', '-0.000197']
Cal slopes: ['0.151', '0.183', '0.476']
N total: 7290 

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.535: 1/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate FAILED. No consistent pregame signal.
  Do NOT collect odds for this market.
```

### F5_TeamTotals_away / over_3.0 (classification)

**Verdict: 🟡 COLLECT_IF_FEATURES_CHANGE**

```
Best model: LightGBM
AUCs: ['0.5493', '0.5429', '0.5568']
Brier improvements: ['-0.015089', '-0.005905', '-0.001958']
Cal slopes: ['0.215', '0.243', '0.396']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 3/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed alone. Weak signal.
  Only pursue if model architecture or features significantly change.
```

### F5_TeamTotals_home / continuous (regression)

**Verdict: 🔴 DO_NOT_COLLECT**

```
Best model: LightGBM
MAE improvements: ['-1.39%', '-0.68%', '-0.23%']
Monthly stability: 3/3 splits stable

Gate results (2/3 needed):
  ❌ MAE imp ≥ 3.0%: 0/3
  ✅ Monthly stable: 3/3

→ No meaningful MAE improvement over naive baseline.
```

### F5_TeamTotals_home / over_1.5 (classification)

**Verdict: 🟡 COLLECT_IF_FEATURES_CHANGE**

```
Best model: LogReg
AUCs: ['0.5180', '0.5415', '0.5395']
Brier improvements: ['-0.024224', '-0.005752', '-0.003823']
Cal slopes: ['0.060', '0.276', '0.291']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 2/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed alone. Weak signal.
  Only pursue if model architecture or features significantly change.
```

### F5_TeamTotals_home / over_2.0 (classification)

**Verdict: 🟡 COLLECT_IF_FEATURES_CHANGE**

```
Best model: LogReg
AUCs: ['0.5249', '0.5486', '0.5372']
Brier improvements: ['-0.025089', '-0.005949', '-0.004198']
Cal slopes: ['0.112', '0.240', '0.273']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 2/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed alone. Weak signal.
  Only pursue if model architecture or features significantly change.
```

### F5_TeamTotals_home / over_2.5 (classification)

**Verdict: 🟡 COLLECT_IF_FEATURES_CHANGE**

```
Best model: LogReg
AUCs: ['0.5249', '0.5486', '0.5372']
Brier improvements: ['-0.025089', '-0.005949', '-0.004198']
Cal slopes: ['0.112', '0.240', '0.273']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 2/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed alone. Weak signal.
  Only pursue if model architecture or features significantly change.
```

### F5_TeamTotals_home / over_3.0 (classification)

**Verdict: 🟡 COLLECT_IF_FEATURES_CHANGE**

```
Best model: LogReg
AUCs: ['0.5171', '0.5553', '0.5547']
Brier improvements: ['-0.018624', '-0.005047', '-0.001471']
Cal slopes: ['0.064', '0.240', '0.409']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 2/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed alone. Weak signal.
  Only pursue if model architecture or features significantly change.
```

### F5_Totals / continuous (regression)

**Verdict: 🔴 DO_NOT_COLLECT**

```
Best model: LightGBM
MAE improvements: ['-2.86%', '-2.30%', '-1.12%']
Monthly stability: 3/3 splits stable

Gate results (2/3 needed):
  ❌ MAE imp ≥ 3.0%: 0/3
  ✅ Monthly stable: 3/3

→ No meaningful MAE improvement over naive baseline.
```

### F5_Totals / over_3.5 (classification)

**Verdict: 🔴 DO_NOT_COLLECT**

```
Best model: LogReg
AUCs: ['0.5125', '0.5207', '0.5423']
Brier improvements: ['-0.026460', '-0.008677', '-0.001892']
Cal slopes: ['0.027', '0.090', '0.376']
N total: 7290 

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.535: 1/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate FAILED. No consistent pregame signal.
  Do NOT collect odds for this market.
```

### F5_Totals / over_4.0 (classification)

**Verdict: 🔴 DO_NOT_COLLECT**

```
Best model: LogReg
AUCs: ['0.5092', '0.5288', '0.5503']
Brier improvements: ['-0.031510', '-0.009660', '-0.000375']
Cal slopes: ['0.024', '0.159', '0.462']
N total: 7290 

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.535: 1/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate FAILED. No consistent pregame signal.
  Do NOT collect odds for this market.
```

### F5_Totals / over_4.5 (classification)

**Verdict: 🔴 DO_NOT_COLLECT**

```
Best model: LogReg
AUCs: ['0.5092', '0.5288', '0.5503']
Brier improvements: ['-0.031510', '-0.009660', '-0.000375']
Cal slopes: ['0.024', '0.159', '0.462']
N total: 7290 

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.535: 1/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate FAILED. No consistent pregame signal.
  Do NOT collect odds for this market.
```

### F5_Totals / over_5.0 (classification)

**Verdict: 🟡 COLLECT_IF_FEATURES_CHANGE**

```
Best model: LightGBM
AUCs: ['0.5043', '0.5465', '0.5538']
Brier improvements: ['-0.023795', '-0.004437', '-0.001377']
Cal slopes: ['0.018', '0.323', '0.410']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 2/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed alone. Weak signal.
  Only pursue if model architecture or features significantly change.
```

### F5_Totals / over_5.5 (classification)

**Verdict: 🟡 COLLECT_IF_FEATURES_CHANGE**

```
Best model: LightGBM
AUCs: ['0.5043', '0.5465', '0.5538']
Brier improvements: ['-0.023795', '-0.004437', '-0.001377']
Cal slopes: ['0.018', '0.323', '0.410']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 2/3
  ❌ Brier Δ ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed alone. Weak signal.
  Only pursue if model architecture or features significantly change.
```

### NRFI / nrfi (classification)

**Verdict: 🔴 DO_NOT_COLLECT**

```
Best model: LogReg
AUCs: ['0.5122', '0.5082', '0.5212']
Brier improvements: ['-0.019526', '-0.012042', '-0.003856']
Cal slopes: ['0.068', '0.063', '0.261']
N total: 7287 

NRFI/YRFI stricter gates: AUC ≥ 0.545, Brier imp ≥ 0.004

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.545: 0/3
  ❌ Brier Δ ≥ 0.004: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7287

→ AUC gate FAILED. No consistent pregame signal.
  Do NOT collect odds for this market.
```

### YRFI / yrfi (classification)

**Verdict: 🔴 DO_NOT_COLLECT**

```
Best model: LogReg
AUCs: ['0.5121', '0.5082', '0.5210']
Brier improvements: ['-0.019522', '-0.011988', '-0.003902']
Cal slopes: ['0.068', '0.064', '0.258']
N total: 7287 

NRFI/YRFI stricter gates: AUC ≥ 0.545, Brier imp ≥ 0.004

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.545: 0/3
  ❌ Brier Δ ≥ 0.004: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7287

→ AUC gate FAILED. No consistent pregame signal.
  Do NOT collect odds for this market.
```


---

*Generated by pre_odds_screen.py on 2026-02-10 13:56*