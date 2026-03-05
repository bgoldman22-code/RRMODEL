# Pre-Odds Market Screen — FIXED Signal Assessment

**Generated:** 2026-02-10 14:11
**Method:** Walk-forward (train ≤ year N-1, test year N)
**Models:** LogReg + LightGBM (classification), Ridge + LightGBM (regression)
**Test Years:** [2023, 2024, 2025]
**Feature set:** 253 production features
**Metrics:** AUC, Brier, LogLoss, Calibration slope/intercept, ECE (classification)
**Baseline:** p_naive = base_rate(y_test) for each split; regression naive = mean(y_train)

**Sign convention:**
- `brier_improvement = brier_naive − brier_model`  (positive = model beats naive)
- `logloss_improvement = logloss_naive − logloss_model`  (positive = model beats naive)
- `cal_slope`: coefficient b in logistic regression `y ~ a + b*logit(p_model)` (ideal = 1.0)

## Decision Gates

### Classification
- AUC ≥ 0.535 in ≥2/3 splits
- brier_improvement ≥ 0.003 in ≥2/3 splits
- logloss_improvement ≥ 0.003 in ≥2/3 splits (optional)
- calibration_slope ∈ [0.85, 1.15] in ≥2/3 splits
- N total ≥ 800

### NRFI/YRFI (stricter)
- AUC ≥ 0.545
- brier_improvement ≥ 0.004

### Regression
- MAE improvement vs predict-mean(y_train) ≥ 3.0% in ≥2/3 splits
- Stable error across months (no single-month blowup > 2× median)

## Summary Verdicts

| Market | Threshold | Type | Best Model | Verdict |
|--------|-----------|------|------------|---------|
| F5_TeamTotals_away | over_1.5 | classification | LightGBM | 🟡 **CONDITIONAL** |
| F5_TeamTotals_away | over_3.0 | classification | LightGBM | 🟡 **CONDITIONAL** |
| F5_TeamTotals_home | over_1.5 | classification | LogReg | 🟡 **CONDITIONAL** |
| F5_TeamTotals_home | over_2.0 | classification | LogReg | 🟡 **CONDITIONAL** |
| F5_TeamTotals_home | over_2.5 | classification | LogReg | 🟡 **CONDITIONAL** |
| F5_TeamTotals_home | over_3.0 | classification | LogReg | 🟡 **CONDITIONAL** |
| F5_Totals | over_5.0 | classification | LightGBM | 🟡 **CONDITIONAL** |
| F5_Totals | over_5.5 | classification | LightGBM | 🟡 **CONDITIONAL** |
| F5_TeamTotals_away | continuous | regression | LightGBM | 🔴 **FAIL** |
| F5_TeamTotals_away | over_2.0 | classification | LogReg | 🔴 **FAIL** |
| F5_TeamTotals_away | over_2.5 | classification | LogReg | 🔴 **FAIL** |
| F5_TeamTotals_home | continuous | regression | LightGBM | 🔴 **FAIL** |
| F5_Totals | continuous | regression | LightGBM | 🔴 **FAIL** |
| F5_Totals | over_3.5 | classification | LogReg | 🔴 **FAIL** |
| F5_Totals | over_4.0 | classification | LogReg | 🔴 **FAIL** |
| F5_Totals | over_4.5 | classification | LogReg | 🔴 **FAIL** |
| NRFI | nrfi | classification | LogReg | 🔴 **FAIL** |
| YRFI | yrfi | classification | LogReg | 🔴 **FAIL** |

## Conclusion

### 🟢 PASS — Worth collecting odds:

- *(none)*

### 🟡 CONDITIONAL — Needs better calibration/features:

- **F5_TeamTotals_away / over_1.5** (classification, LightGBM)
- **F5_TeamTotals_away / over_3.0** (classification, LightGBM)
- **F5_TeamTotals_home / over_1.5** (classification, LogReg)
- **F5_TeamTotals_home / over_2.0** (classification, LogReg)
- **F5_TeamTotals_home / over_2.5** (classification, LogReg)
- **F5_TeamTotals_home / over_3.0** (classification, LogReg)
- **F5_Totals / over_5.0** (classification, LightGBM)
- **F5_Totals / over_5.5** (classification, LightGBM)

### 🔴 FAIL — Do NOT collect odds:

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

## Classification Metrics by Threshold

| Market | Threshold | Model | Test Year | N | Base Rate | AUC | Brier_M | Brier_N | Brier_Δ | LL_M | LL_N | LL_Δ | Cal Slope | Cal Int | ECE | Mono | p_min | p_max | p_mean | p_std |
|--------|-----------|-------|-----------|---|-----------|-----|---------|---------|---------|------|------|------|-----------|---------|-----|------|-------|-------|--------|-------|
| F5_TeamTotals_away | over_1.5 | LightGBM | 2023 | 2430 | 0.582 | 0.5390 | 0.264359 | 0.243226 | -0.021133 | 0.7289 | 0.6795 | -0.0494 | 0.181 | +0.314 | 0.1238 | ✓ | 0.0809 | 0.9253 | 0.5244 | 0.1708 |
| F5_TeamTotals_away | over_1.5 | LightGBM | 2024 | 2430 | 0.565 | 0.5367 | 0.253607 | 0.245772 | -0.007834 | 0.7025 | 0.6847 | -0.0178 | 0.250 | +0.187 | 0.0860 | ✓ | 0.1406 | 0.9357 | 0.5709 | 0.1275 |
| F5_TeamTotals_away | over_1.5 | LightGBM | 2025 | 2430 | 0.552 | 0.5503 | 0.249726 | 0.247269 | -0.002457 | 0.6938 | 0.6877 | -0.0061 | 0.395 | +0.091 | 0.0553 | ✓ | 0.1488 | 0.8913 | 0.5721 | 0.1101 |
| F5_TeamTotals_away | over_1.5 | LogReg | 2023 | 2430 | 0.582 | 0.5105 | 0.285161 | 0.243226 | -0.041935 | 0.7888 | 0.6795 | -0.1092 | 0.032 | +0.334 | 0.1652 | ✗ | 0.0008 | 1.0000 | 0.4891 | 0.1927 |
| F5_TeamTotals_away | over_1.5 | LogReg | 2024 | 2430 | 0.565 | 0.5439 | 0.251002 | 0.245772 | -0.005230 | 0.6981 | 0.6847 | -0.0134 | 0.269 | +0.200 | 0.0630 | ✗ | 0.1366 | 0.9948 | 0.5544 | 0.1159 |
| F5_TeamTotals_away | over_1.5 | LogReg | 2025 | 2430 | 0.552 | 0.5628 | 0.246964 | 0.247269 | +0.000305 | 0.6884 | 0.6877 | -0.0007 | 0.489 | +0.071 | 0.0545 | ✓ | 0.0196 | 0.8367 | 0.5688 | 0.1049 |
| F5_TeamTotals_away | over_2.0 | LightGBM | 2023 | 2430 | 0.415 | 0.5304 | 0.264096 | 0.242813 | -0.021283 | 0.7374 | 0.6787 | -0.0587 | 0.139 | -0.241 | 0.1292 | ✓ | 0.0423 | 0.8479 | 0.3420 | 0.1533 |
| F5_TeamTotals_away | over_2.0 | LightGBM | 2024 | 2430 | 0.386 | 0.5314 | 0.247130 | 0.237100 | -0.010030 | 0.6903 | 0.6671 | -0.0231 | 0.189 | -0.383 | 0.0824 | ✓ | 0.0587 | 0.8030 | 0.4020 | 0.1274 |
| F5_TeamTotals_away | over_2.0 | LightGBM | 2025 | 2430 | 0.381 | 0.5490 | 0.239370 | 0.235758 | -0.003612 | 0.6730 | 0.6644 | -0.0086 | 0.336 | -0.332 | 0.0579 | ✗ | 0.1011 | 0.7609 | 0.3905 | 0.1090 |
| F5_TeamTotals_away | over_2.0 | LogReg | 2023 | 2430 | 0.415 | 0.5337 | 0.264135 | 0.242813 | -0.021322 | 0.7427 | 0.6787 | -0.0640 | 0.151 | -0.236 | 0.1366 | ✗ | 0.0017 | 1.0000 | 0.3503 | 0.1663 |
| F5_TeamTotals_away | over_2.0 | LogReg | 2024 | 2430 | 0.386 | 0.5295 | 0.247285 | 0.237100 | -0.010185 | 0.6908 | 0.6671 | -0.0236 | 0.183 | -0.384 | 0.0887 | ✓ | 0.0016 | 0.8937 | 0.3996 | 0.1278 |
| F5_TeamTotals_away | over_2.0 | LogReg | 2025 | 2430 | 0.381 | 0.5606 | 0.235955 | 0.235758 | -0.000197 | 0.6654 | 0.6644 | -0.0010 | 0.476 | -0.266 | 0.0437 | ✓ | 0.0592 | 0.7233 | 0.3886 | 0.1044 |
| F5_TeamTotals_away | over_2.5 | LightGBM | 2023 | 2430 | 0.415 | 0.5304 | 0.264096 | 0.242813 | -0.021283 | 0.7374 | 0.6787 | -0.0587 | 0.139 | -0.241 | 0.1292 | ✓ | 0.0423 | 0.8479 | 0.3420 | 0.1533 |
| F5_TeamTotals_away | over_2.5 | LightGBM | 2024 | 2430 | 0.386 | 0.5314 | 0.247130 | 0.237100 | -0.010030 | 0.6903 | 0.6671 | -0.0231 | 0.189 | -0.383 | 0.0824 | ✓ | 0.0587 | 0.8030 | 0.4020 | 0.1274 |
| F5_TeamTotals_away | over_2.5 | LightGBM | 2025 | 2430 | 0.381 | 0.5490 | 0.239370 | 0.235758 | -0.003612 | 0.6730 | 0.6644 | -0.0086 | 0.336 | -0.332 | 0.0579 | ✗ | 0.1011 | 0.7609 | 0.3905 | 0.1090 |
| F5_TeamTotals_away | over_2.5 | LogReg | 2023 | 2430 | 0.415 | 0.5337 | 0.264135 | 0.242813 | -0.021322 | 0.7427 | 0.6787 | -0.0640 | 0.151 | -0.236 | 0.1366 | ✗ | 0.0017 | 1.0000 | 0.3503 | 0.1663 |
| F5_TeamTotals_away | over_2.5 | LogReg | 2024 | 2430 | 0.386 | 0.5295 | 0.247285 | 0.237100 | -0.010185 | 0.6908 | 0.6671 | -0.0236 | 0.183 | -0.384 | 0.0887 | ✓ | 0.0016 | 0.8937 | 0.3996 | 0.1278 |
| F5_TeamTotals_away | over_2.5 | LogReg | 2025 | 2430 | 0.381 | 0.5606 | 0.235955 | 0.235758 | -0.000197 | 0.6654 | 0.6644 | -0.0010 | 0.476 | -0.266 | 0.0437 | ✓ | 0.0592 | 0.7233 | 0.3886 | 0.1044 |
| F5_TeamTotals_away | over_3.0 | LightGBM | 2023 | 2430 | 0.285 | 0.5493 | 0.218943 | 0.203855 | -0.015089 | 0.6570 | 0.5978 | -0.0592 | 0.215 | -0.579 | 0.1190 | ✓ | 0.0136 | 0.6572 | 0.1920 | 0.1135 |
| F5_TeamTotals_away | over_3.0 | LightGBM | 2024 | 2430 | 0.254 | 0.5429 | 0.195547 | 0.189642 | -0.005905 | 0.5835 | 0.5670 | -0.0165 | 0.243 | -0.798 | 0.0685 | ✓ | 0.0275 | 0.7156 | 0.2538 | 0.1074 |
| F5_TeamTotals_away | over_3.0 | LightGBM | 2025 | 2430 | 0.257 | 0.5568 | 0.192806 | 0.190849 | -0.001958 | 0.5747 | 0.5697 | -0.0050 | 0.396 | -0.601 | 0.0500 | ✗ | 0.0389 | 0.7002 | 0.2446 | 0.0904 |
| F5_TeamTotals_away | over_3.0 | LogReg | 2023 | 2430 | 0.285 | 0.5394 | 0.218773 | 0.203855 | -0.014918 | 0.6599 | 0.5978 | -0.0622 | 0.169 | -0.683 | 0.1108 | ✓ | 0.0069 | 1.0000 | 0.2277 | 0.1471 |
| F5_TeamTotals_away | over_3.0 | LogReg | 2024 | 2430 | 0.254 | 0.5410 | 0.198499 | 0.189642 | -0.008857 | 0.5903 | 0.5670 | -0.0232 | 0.210 | -0.852 | 0.0726 | ✓ | 0.0000 | 0.8764 | 0.2700 | 0.1228 |
| F5_TeamTotals_away | over_3.0 | LogReg | 2025 | 2430 | 0.257 | 0.5573 | 0.192701 | 0.190849 | -0.001852 | 0.5759 | 0.5697 | -0.0062 | 0.370 | -0.637 | 0.0518 | ✓ | 0.0056 | 0.6386 | 0.2479 | 0.0924 |
| F5_TeamTotals_home | over_1.5 | LightGBM | 2023 | 2430 | 0.608 | 0.5153 | 0.255986 | 0.238375 | -0.017611 | 0.7099 | 0.6697 | -0.0402 | 0.101 | +0.399 | 0.1152 | ✓ | 0.1459 | 0.9488 | 0.5879 | 0.1466 |
| F5_TeamTotals_home | over_1.5 | LightGBM | 2024 | 2430 | 0.592 | 0.5404 | 0.247983 | 0.241578 | -0.006404 | 0.6920 | 0.6762 | -0.0158 | 0.264 | +0.245 | 0.0727 | ✓ | 0.2062 | 0.9090 | 0.6117 | 0.1186 |
| F5_TeamTotals_home | over_1.5 | LightGBM | 2025 | 2430 | 0.603 | 0.5279 | 0.244900 | 0.239416 | -0.005485 | 0.6845 | 0.6718 | -0.0127 | 0.238 | +0.310 | 0.0706 | ✓ | 0.2027 | 0.9001 | 0.6068 | 0.1048 |
| F5_TeamTotals_home | over_1.5 | LogReg | 2023 | 2430 | 0.608 | 0.5180 | 0.262599 | 0.238375 | -0.024224 | 0.7324 | 0.6697 | -0.0627 | 0.060 | +0.423 | 0.1338 | ✓ | 0.0000 | 1.0000 | 0.5584 | 0.1630 |
| F5_TeamTotals_home | over_1.5 | LogReg | 2024 | 2430 | 0.592 | 0.5415 | 0.247330 | 0.241578 | -0.005752 | 0.6922 | 0.6762 | -0.0160 | 0.276 | +0.219 | 0.0680 | ✓ | 0.0802 | 0.9959 | 0.6289 | 0.1117 |
| F5_TeamTotals_home | over_1.5 | LogReg | 2025 | 2430 | 0.603 | 0.5395 | 0.243239 | 0.239416 | -0.003823 | 0.6815 | 0.6718 | -0.0097 | 0.291 | +0.276 | 0.0590 | ✓ | 0.0131 | 0.9933 | 0.6160 | 0.1002 |
| F5_TeamTotals_home | over_2.0 | LightGBM | 2023 | 2430 | 0.451 | 0.5244 | 0.265435 | 0.247561 | -0.017873 | 0.7333 | 0.6883 | -0.0450 | 0.139 | -0.132 | 0.1151 | ✓ | 0.0547 | 0.8366 | 0.3922 | 0.1459 |
| F5_TeamTotals_home | over_2.0 | LightGBM | 2024 | 2430 | 0.416 | 0.5463 | 0.249321 | 0.242952 | -0.006369 | 0.6944 | 0.6790 | -0.0154 | 0.271 | -0.262 | 0.0684 | ✗ | 0.0609 | 0.8111 | 0.4327 | 0.1229 |
| F5_TeamTotals_home | over_2.0 | LightGBM | 2025 | 2430 | 0.431 | 0.5355 | 0.250358 | 0.245277 | -0.005081 | 0.6949 | 0.6837 | -0.0112 | 0.280 | -0.184 | 0.0677 | ✓ | 0.0764 | 0.7631 | 0.4206 | 0.1077 |
| F5_TeamTotals_home | over_2.0 | LogReg | 2023 | 2430 | 0.451 | 0.5249 | 0.272651 | 0.247561 | -0.025089 | 0.7563 | 0.6883 | -0.0680 | 0.112 | -0.127 | 0.1377 | ✓ | 0.0001 | 1.0000 | 0.3620 | 0.1541 |
| F5_TeamTotals_home | over_2.0 | LogReg | 2024 | 2430 | 0.416 | 0.5486 | 0.248901 | 0.242952 | -0.005949 | 0.6970 | 0.6790 | -0.0180 | 0.240 | -0.281 | 0.0677 | ✓ | 0.0158 | 1.0000 | 0.4423 | 0.1218 |
| F5_TeamTotals_home | over_2.0 | LogReg | 2025 | 2430 | 0.431 | 0.5372 | 0.249475 | 0.245277 | -0.004198 | 0.6942 | 0.6837 | -0.0105 | 0.273 | -0.195 | 0.0583 | ✓ | 0.1014 | 0.9908 | 0.4277 | 0.1039 |
| F5_TeamTotals_home | over_2.5 | LightGBM | 2023 | 2430 | 0.451 | 0.5244 | 0.265435 | 0.247561 | -0.017873 | 0.7333 | 0.6883 | -0.0450 | 0.139 | -0.132 | 0.1151 | ✓ | 0.0547 | 0.8366 | 0.3922 | 0.1459 |
| F5_TeamTotals_home | over_2.5 | LightGBM | 2024 | 2430 | 0.416 | 0.5463 | 0.249321 | 0.242952 | -0.006369 | 0.6944 | 0.6790 | -0.0154 | 0.271 | -0.262 | 0.0684 | ✗ | 0.0609 | 0.8111 | 0.4327 | 0.1229 |
| F5_TeamTotals_home | over_2.5 | LightGBM | 2025 | 2430 | 0.431 | 0.5355 | 0.250358 | 0.245277 | -0.005081 | 0.6949 | 0.6837 | -0.0112 | 0.280 | -0.184 | 0.0677 | ✓ | 0.0764 | 0.7631 | 0.4206 | 0.1077 |
| F5_TeamTotals_home | over_2.5 | LogReg | 2023 | 2430 | 0.451 | 0.5249 | 0.272651 | 0.247561 | -0.025089 | 0.7563 | 0.6883 | -0.0680 | 0.112 | -0.127 | 0.1377 | ✓ | 0.0001 | 1.0000 | 0.3620 | 0.1541 |
| F5_TeamTotals_home | over_2.5 | LogReg | 2024 | 2430 | 0.416 | 0.5486 | 0.248901 | 0.242952 | -0.005949 | 0.6970 | 0.6790 | -0.0180 | 0.240 | -0.281 | 0.0677 | ✓ | 0.0158 | 1.0000 | 0.4423 | 0.1218 |
| F5_TeamTotals_home | over_2.5 | LogReg | 2025 | 2430 | 0.431 | 0.5372 | 0.249475 | 0.245277 | -0.004198 | 0.6942 | 0.6837 | -0.0105 | 0.273 | -0.195 | 0.0583 | ✓ | 0.1014 | 0.9908 | 0.4277 | 0.1039 |
| F5_TeamTotals_home | over_3.0 | LightGBM | 2023 | 2430 | 0.308 | 0.5179 | 0.229527 | 0.213066 | -0.016461 | 0.6749 | 0.6173 | -0.0575 | 0.093 | -0.692 | 0.1074 | ✓ | 0.0241 | 0.7078 | 0.2389 | 0.1251 |
| F5_TeamTotals_home | over_3.0 | LightGBM | 2024 | 2430 | 0.290 | 0.5563 | 0.208167 | 0.205952 | -0.002215 | 0.6098 | 0.6023 | -0.0076 | 0.374 | -0.521 | 0.0584 | ✓ | 0.0514 | 0.7074 | 0.2776 | 0.1056 |
| F5_TeamTotals_home | over_3.0 | LightGBM | 2025 | 2430 | 0.304 | 0.5281 | 0.216054 | 0.211468 | -0.004586 | 0.6266 | 0.6140 | -0.0126 | 0.254 | -0.580 | 0.0680 | ✓ | 0.0702 | 0.6567 | 0.2796 | 0.0922 |
| F5_TeamTotals_home | over_3.0 | LogReg | 2023 | 2430 | 0.308 | 0.5171 | 0.231690 | 0.213066 | -0.018624 | 0.6833 | 0.6173 | -0.0660 | 0.064 | -0.733 | 0.1198 | ✗ | 0.0012 | 1.0000 | 0.2537 | 0.1394 |
| F5_TeamTotals_home | over_3.0 | LogReg | 2024 | 2430 | 0.290 | 0.5553 | 0.210999 | 0.205952 | -0.005047 | 0.6207 | 0.6023 | -0.0185 | 0.240 | -0.688 | 0.0704 | ✓ | 0.0107 | 0.9999 | 0.3057 | 0.1183 |
| F5_TeamTotals_home | over_3.0 | LogReg | 2025 | 2430 | 0.304 | 0.5547 | 0.212939 | 0.211468 | -0.001471 | 0.6184 | 0.6140 | -0.0044 | 0.409 | -0.456 | 0.0543 | ✓ | 0.0154 | 0.6497 | 0.2925 | 0.0972 |
| F5_Totals | over_3.5 | LightGBM | 2023 | 2430 | 0.635 | 0.5100 | 0.249378 | 0.231781 | -0.017598 | 0.6978 | 0.6563 | -0.0416 | 0.059 | +0.523 | 0.1092 | ✓ | 0.1887 | 0.9469 | 0.6162 | 0.1407 |
| F5_Totals | over_3.5 | LightGBM | 2024 | 2430 | 0.618 | 0.5227 | 0.243626 | 0.236051 | -0.007576 | 0.6828 | 0.6650 | -0.0178 | 0.161 | +0.394 | 0.0714 | ✗ | 0.2494 | 0.9503 | 0.6267 | 0.1068 |
| F5_Totals | over_3.5 | LightGBM | 2025 | 2430 | 0.625 | 0.5215 | 0.240094 | 0.234246 | -0.005848 | 0.6742 | 0.6613 | -0.0129 | 0.190 | +0.418 | 0.0668 | ✓ | 0.1420 | 0.8786 | 0.6196 | 0.0967 |
| F5_Totals | over_3.5 | LogReg | 2023 | 2430 | 0.635 | 0.5125 | 0.258241 | 0.231781 | -0.026460 | 0.7203 | 0.6563 | -0.0640 | 0.027 | +0.546 | 0.1217 | ✗ | 0.0630 | 1.0000 | 0.5624 | 0.1547 |
| F5_Totals | over_3.5 | LogReg | 2024 | 2430 | 0.618 | 0.5207 | 0.244728 | 0.236051 | -0.008677 | 0.6870 | 0.6650 | -0.0220 | 0.090 | +0.438 | 0.0767 | ✗ | 0.0311 | 0.9958 | 0.6127 | 0.1080 |
| F5_Totals | over_3.5 | LogReg | 2025 | 2430 | 0.625 | 0.5423 | 0.236138 | 0.234246 | -0.001892 | 0.6657 | 0.6613 | -0.0044 | 0.376 | +0.338 | 0.0469 | ✓ | 0.0794 | 0.8508 | 0.6125 | 0.0884 |
| F5_Totals | over_4.0 | LightGBM | 2023 | 2430 | 0.532 | 0.5014 | 0.276364 | 0.248943 | -0.027421 | 0.7536 | 0.6910 | -0.0626 | 0.008 | +0.132 | 0.1362 | ✓ | 0.0780 | 0.8833 | 0.4497 | 0.1441 |
| F5_Totals | over_4.0 | LightGBM | 2024 | 2430 | 0.495 | 0.5299 | 0.256839 | 0.249971 | -0.006868 | 0.7081 | 0.6931 | -0.0151 | 0.243 | -0.035 | 0.0747 | ✓ | 0.1623 | 0.8891 | 0.5130 | 0.1146 |
| F5_Totals | over_4.0 | LightGBM | 2025 | 2430 | 0.496 | 0.5451 | 0.251611 | 0.249983 | -0.001628 | 0.6969 | 0.6931 | -0.0038 | 0.406 | -0.005 | 0.0524 | ✗ | 0.0939 | 0.8119 | 0.4933 | 0.1001 |
| F5_Totals | over_4.0 | LogReg | 2023 | 2430 | 0.532 | 0.5092 | 0.280453 | 0.248943 | -0.031510 | 0.7737 | 0.6910 | -0.0826 | 0.024 | +0.138 | 0.1467 | ✗ | 0.0001 | 1.0000 | 0.4295 | 0.1554 |
| F5_Totals | over_4.0 | LogReg | 2024 | 2430 | 0.495 | 0.5288 | 0.259632 | 0.249971 | -0.009660 | 0.7163 | 0.6931 | -0.0232 | 0.159 | -0.039 | 0.0826 | ✗ | 0.0093 | 0.9260 | 0.5264 | 0.1186 |
| F5_Totals | over_4.0 | LogReg | 2025 | 2430 | 0.496 | 0.5503 | 0.250358 | 0.249983 | -0.000375 | 0.6944 | 0.6931 | -0.0013 | 0.462 | -0.003 | 0.0542 | ✓ | 0.0629 | 0.7755 | 0.4931 | 0.0958 |
| F5_Totals | over_4.5 | LightGBM | 2023 | 2430 | 0.532 | 0.5014 | 0.276364 | 0.248943 | -0.027421 | 0.7536 | 0.6910 | -0.0626 | 0.008 | +0.132 | 0.1362 | ✓ | 0.0780 | 0.8833 | 0.4497 | 0.1441 |
| F5_Totals | over_4.5 | LightGBM | 2024 | 2430 | 0.495 | 0.5299 | 0.256839 | 0.249971 | -0.006868 | 0.7081 | 0.6931 | -0.0151 | 0.243 | -0.035 | 0.0747 | ✓ | 0.1623 | 0.8891 | 0.5130 | 0.1146 |
| F5_Totals | over_4.5 | LightGBM | 2025 | 2430 | 0.496 | 0.5451 | 0.251611 | 0.249983 | -0.001628 | 0.6969 | 0.6931 | -0.0038 | 0.406 | -0.005 | 0.0524 | ✗ | 0.0939 | 0.8119 | 0.4933 | 0.1001 |
| F5_Totals | over_4.5 | LogReg | 2023 | 2430 | 0.532 | 0.5092 | 0.280453 | 0.248943 | -0.031510 | 0.7737 | 0.6910 | -0.0826 | 0.024 | +0.138 | 0.1467 | ✗ | 0.0001 | 1.0000 | 0.4295 | 0.1554 |
| F5_Totals | over_4.5 | LogReg | 2024 | 2430 | 0.495 | 0.5288 | 0.259632 | 0.249971 | -0.009660 | 0.7163 | 0.6931 | -0.0232 | 0.159 | -0.039 | 0.0826 | ✗ | 0.0093 | 0.9260 | 0.5264 | 0.1186 |
| F5_Totals | over_4.5 | LogReg | 2025 | 2430 | 0.496 | 0.5503 | 0.250358 | 0.249983 | -0.000375 | 0.6944 | 0.6931 | -0.0013 | 0.462 | -0.003 | 0.0542 | ✓ | 0.0629 | 0.7755 | 0.4931 | 0.0958 |
| F5_Totals | over_5.0 | LightGBM | 2023 | 2430 | 0.415 | 0.5043 | 0.266538 | 0.242743 | -0.023795 | 0.7432 | 0.6786 | -0.0646 | 0.018 | -0.330 | 0.1265 | ✓ | 0.0286 | 0.8480 | 0.3300 | 0.1330 |
| F5_Totals | over_5.0 | LightGBM | 2024 | 2430 | 0.377 | 0.5465 | 0.239398 | 0.234961 | -0.004437 | 0.6728 | 0.6628 | -0.0100 | 0.323 | -0.352 | 0.0611 | ✓ | 0.0918 | 0.7848 | 0.3909 | 0.1124 |
| F5_Totals | over_5.0 | LightGBM | 2025 | 2430 | 0.380 | 0.5538 | 0.236938 | 0.235560 | -0.001377 | 0.6681 | 0.6640 | -0.0041 | 0.410 | -0.264 | 0.0432 | ✓ | 0.0958 | 0.7546 | 0.3693 | 0.1010 |
| F5_Totals | over_5.0 | LogReg | 2023 | 2430 | 0.415 | 0.4895 | 0.272341 | 0.242743 | -0.029598 | 0.7660 | 0.6786 | -0.0874 | -0.065 | -0.391 | 0.1451 | ✗ | 0.0000 | 1.0000 | 0.3454 | 0.1492 |
| F5_Totals | over_5.0 | LogReg | 2024 | 2430 | 0.377 | 0.5261 | 0.245389 | 0.234961 | -0.010428 | 0.6883 | 0.6628 | -0.0255 | 0.119 | -0.459 | 0.0834 | ✗ | 0.0020 | 0.9852 | 0.4168 | 0.1142 |
| F5_Totals | over_5.0 | LogReg | 2025 | 2430 | 0.380 | 0.5685 | 0.233772 | 0.235560 | +0.001788 | 0.6605 | 0.6640 | +0.0035 | 0.590 | -0.187 | 0.0276 | ✗ | 0.0966 | 0.7326 | 0.3761 | 0.0919 |
| F5_Totals | over_5.5 | LightGBM | 2023 | 2430 | 0.415 | 0.5043 | 0.266538 | 0.242743 | -0.023795 | 0.7432 | 0.6786 | -0.0646 | 0.018 | -0.330 | 0.1265 | ✓ | 0.0286 | 0.8480 | 0.3300 | 0.1330 |
| F5_Totals | over_5.5 | LightGBM | 2024 | 2430 | 0.377 | 0.5465 | 0.239398 | 0.234961 | -0.004437 | 0.6728 | 0.6628 | -0.0100 | 0.323 | -0.352 | 0.0611 | ✓ | 0.0918 | 0.7848 | 0.3909 | 0.1124 |
| F5_Totals | over_5.5 | LightGBM | 2025 | 2430 | 0.380 | 0.5538 | 0.236938 | 0.235560 | -0.001377 | 0.6681 | 0.6640 | -0.0041 | 0.410 | -0.264 | 0.0432 | ✓ | 0.0958 | 0.7546 | 0.3693 | 0.1010 |
| F5_Totals | over_5.5 | LogReg | 2023 | 2430 | 0.415 | 0.4895 | 0.272341 | 0.242743 | -0.029598 | 0.7660 | 0.6786 | -0.0874 | -0.065 | -0.391 | 0.1451 | ✗ | 0.0000 | 1.0000 | 0.3454 | 0.1492 |
| F5_Totals | over_5.5 | LogReg | 2024 | 2430 | 0.377 | 0.5261 | 0.245389 | 0.234961 | -0.010428 | 0.6883 | 0.6628 | -0.0255 | 0.119 | -0.459 | 0.0834 | ✗ | 0.0020 | 0.9852 | 0.4168 | 0.1142 |
| F5_Totals | over_5.5 | LogReg | 2025 | 2430 | 0.380 | 0.5685 | 0.233772 | 0.235560 | +0.001788 | 0.6605 | 0.6640 | +0.0035 | 0.590 | -0.187 | 0.0276 | ✗ | 0.0966 | 0.7326 | 0.3761 | 0.0919 |
| NRFI | nrfi | LightGBM | 2023 | 2430 | 0.498 | 0.5105 | 0.270227 | 0.249996 | -0.020232 | 0.7405 | 0.6931 | -0.0474 | 0.044 | -0.013 | 0.1067 | ✗ | 0.0898 | 0.9348 | 0.5251 | 0.1480 |
| NRFI | nrfi | LightGBM | 2024 | 2427 | 0.533 | 0.5057 | 0.262777 | 0.248927 | -0.013850 | 0.7211 | 0.6910 | -0.0301 | 0.031 | +0.132 | 0.0955 | ✓ | 0.1440 | 0.8613 | 0.4937 | 0.1152 |
| NRFI | nrfi | LightGBM | 2025 | 2430 | 0.498 | 0.5218 | 0.255654 | 0.249996 | -0.005658 | 0.7051 | 0.6931 | -0.0120 | 0.226 | -0.023 | 0.0731 | ✓ | 0.2023 | 0.8134 | 0.5162 | 0.0993 |
| NRFI | nrfi | LogReg | 2023 | 2430 | 0.498 | 0.5122 | 0.269522 | 0.249996 | -0.019526 | 0.7396 | 0.6931 | -0.0464 | 0.068 | -0.022 | 0.1051 | ✗ | 0.0000 | 0.9913 | 0.5459 | 0.1417 |
| NRFI | nrfi | LogReg | 2024 | 2427 | 0.533 | 0.5082 | 0.260969 | 0.248927 | -0.012042 | 0.7167 | 0.6910 | -0.0257 | 0.063 | +0.135 | 0.0864 | ✓ | 0.0335 | 0.7959 | 0.4854 | 0.1054 |
| NRFI | nrfi | LogReg | 2025 | 2430 | 0.498 | 0.5212 | 0.253852 | 0.249996 | -0.003856 | 0.7012 | 0.6931 | -0.0081 | 0.261 | -0.031 | 0.0585 | ✓ | 0.1088 | 0.8490 | 0.5217 | 0.0835 |
| YRFI | yrfi | LightGBM | 2023 | 2430 | 0.502 | 0.5105 | 0.270227 | 0.249996 | -0.020232 | 0.7405 | 0.6931 | -0.0474 | 0.044 | +0.013 | 0.1067 | ✗ | 0.0652 | 0.9102 | 0.4749 | 0.1480 |
| YRFI | yrfi | LightGBM | 2024 | 2427 | 0.467 | 0.5057 | 0.262777 | 0.248927 | -0.013850 | 0.7211 | 0.6910 | -0.0301 | 0.031 | -0.132 | 0.0951 | ✓ | 0.1387 | 0.8560 | 0.5063 | 0.1152 |
| YRFI | yrfi | LightGBM | 2025 | 2430 | 0.502 | 0.5218 | 0.255654 | 0.249996 | -0.005658 | 0.7051 | 0.6931 | -0.0120 | 0.226 | +0.023 | 0.0731 | ✓ | 0.1866 | 0.7977 | 0.4838 | 0.0993 |
| YRFI | yrfi | LogReg | 2023 | 2430 | 0.502 | 0.5121 | 0.269518 | 0.249996 | -0.019522 | 0.7395 | 0.6931 | -0.0464 | 0.068 | +0.022 | 0.1058 | ✗ | 0.0087 | 1.0000 | 0.4542 | 0.1417 |
| YRFI | yrfi | LogReg | 2024 | 2427 | 0.467 | 0.5082 | 0.260915 | 0.248927 | -0.011988 | 0.7166 | 0.6910 | -0.0256 | 0.064 | -0.135 | 0.0859 | ✓ | 0.2041 | 0.9675 | 0.5144 | 0.1053 |
| YRFI | yrfi | LogReg | 2025 | 2430 | 0.502 | 0.5210 | 0.253898 | 0.249996 | -0.003902 | 0.7013 | 0.6931 | -0.0082 | 0.258 | +0.031 | 0.0611 | ✓ | 0.1493 | 0.8919 | 0.4783 | 0.0836 |

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

## Reliability Tables — Top 3 Candidates

### F5_TeamTotals_away / over_3.0 (LightGBM) — mean AUC = 0.5497

**Test 2023:** AUC=0.5493, BrierΔ=-0.015089, CalSlope=0.215, ECE=0.1190, p∈[0.0136, 0.6572]

**Test 2024:** AUC=0.5429, BrierΔ=-0.005905, CalSlope=0.243, ECE=0.0685, p∈[0.0275, 0.7156]

**Test 2025:** AUC=0.5568, BrierΔ=-0.001958, CalSlope=0.396, ECE=0.0500, p∈[0.0389, 0.7002]


### F5_TeamTotals_home / over_3.0 (LogReg) — mean AUC = 0.5424

**Test 2023:** AUC=0.5171, BrierΔ=-0.018624, CalSlope=0.064, ECE=0.1198, p∈[0.0012, 1.0000]

**Test 2024:** AUC=0.5553, BrierΔ=-0.005047, CalSlope=0.240, ECE=0.0704, p∈[0.0107, 0.9999]

**Test 2025:** AUC=0.5547, BrierΔ=-0.001471, CalSlope=0.409, ECE=0.0543, p∈[0.0154, 0.6497]


### F5_TeamTotals_away / over_1.5 (LightGBM) — mean AUC = 0.5420

**Test 2023:** AUC=0.5390, BrierΔ=-0.021133, CalSlope=0.181, ECE=0.1238, p∈[0.0809, 0.9253]

**Test 2024:** AUC=0.5367, BrierΔ=-0.007834, CalSlope=0.250, ECE=0.0860, p∈[0.1406, 0.9357]

**Test 2025:** AUC=0.5503, BrierΔ=-0.002457, CalSlope=0.395, ECE=0.0553, p∈[0.1488, 0.8913]


## Detailed Gate Rationale

### F5_TeamTotals_away / continuous (regression)

**Verdict: 🔴 FAIL**

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

**Verdict: 🟡 CONDITIONAL**

```
Best model: LightGBM
AUCs: ['0.5390', '0.5367', '0.5503']
Brier improvements (naive−model): ['-0.021133', '-0.007834', '-0.002457']
LL improvements (naive−model): ['-0.0494', '-0.0178', '-0.0061']
Cal slopes: ['0.181', '0.250', '0.395']
ECEs: ['0.1238', '0.0860', '0.0553']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 3/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed but Brier, calibration gate(s) failed.
  Ranking signal exists. Needs better calibration / features.
```

### F5_TeamTotals_away / over_2.0 (classification)

**Verdict: 🔴 FAIL**

```
Best model: LogReg
AUCs: ['0.5337', '0.5295', '0.5606']
Brier improvements (naive−model): ['-0.021322', '-0.010185', '-0.000197']
LL improvements (naive−model): ['-0.0640', '-0.0236', '-0.0010']
Cal slopes: ['0.151', '0.183', '0.476']
ECEs: ['0.1366', '0.0887', '0.0437']
N total: 7290 

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.535: 1/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate FAILED or N too low. No consistent pregame signal.
  Do NOT collect odds for this market.
```

### F5_TeamTotals_away / over_2.5 (classification)

**Verdict: 🔴 FAIL**

```
Best model: LogReg
AUCs: ['0.5337', '0.5295', '0.5606']
Brier improvements (naive−model): ['-0.021322', '-0.010185', '-0.000197']
LL improvements (naive−model): ['-0.0640', '-0.0236', '-0.0010']
Cal slopes: ['0.151', '0.183', '0.476']
ECEs: ['0.1366', '0.0887', '0.0437']
N total: 7290 

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.535: 1/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate FAILED or N too low. No consistent pregame signal.
  Do NOT collect odds for this market.
```

### F5_TeamTotals_away / over_3.0 (classification)

**Verdict: 🟡 CONDITIONAL**

```
Best model: LightGBM
AUCs: ['0.5493', '0.5429', '0.5568']
Brier improvements (naive−model): ['-0.015089', '-0.005905', '-0.001958']
LL improvements (naive−model): ['-0.0592', '-0.0165', '-0.0050']
Cal slopes: ['0.215', '0.243', '0.396']
ECEs: ['0.1190', '0.0685', '0.0500']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 3/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed but Brier, calibration gate(s) failed.
  Ranking signal exists. Needs better calibration / features.
```

### F5_TeamTotals_home / continuous (regression)

**Verdict: 🔴 FAIL**

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

**Verdict: 🟡 CONDITIONAL**

```
Best model: LogReg
AUCs: ['0.5180', '0.5415', '0.5395']
Brier improvements (naive−model): ['-0.024224', '-0.005752', '-0.003823']
LL improvements (naive−model): ['-0.0627', '-0.0160', '-0.0097']
Cal slopes: ['0.060', '0.276', '0.291']
ECEs: ['0.1338', '0.0680', '0.0590']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 2/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed but Brier, calibration gate(s) failed.
  Ranking signal exists. Needs better calibration / features.
```

### F5_TeamTotals_home / over_2.0 (classification)

**Verdict: 🟡 CONDITIONAL**

```
Best model: LogReg
AUCs: ['0.5249', '0.5486', '0.5372']
Brier improvements (naive−model): ['-0.025089', '-0.005949', '-0.004198']
LL improvements (naive−model): ['-0.0680', '-0.0180', '-0.0105']
Cal slopes: ['0.112', '0.240', '0.273']
ECEs: ['0.1377', '0.0677', '0.0583']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 2/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed but Brier, calibration gate(s) failed.
  Ranking signal exists. Needs better calibration / features.
```

### F5_TeamTotals_home / over_2.5 (classification)

**Verdict: 🟡 CONDITIONAL**

```
Best model: LogReg
AUCs: ['0.5249', '0.5486', '0.5372']
Brier improvements (naive−model): ['-0.025089', '-0.005949', '-0.004198']
LL improvements (naive−model): ['-0.0680', '-0.0180', '-0.0105']
Cal slopes: ['0.112', '0.240', '0.273']
ECEs: ['0.1377', '0.0677', '0.0583']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 2/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed but Brier, calibration gate(s) failed.
  Ranking signal exists. Needs better calibration / features.
```

### F5_TeamTotals_home / over_3.0 (classification)

**Verdict: 🟡 CONDITIONAL**

```
Best model: LogReg
AUCs: ['0.5171', '0.5553', '0.5547']
Brier improvements (naive−model): ['-0.018624', '-0.005047', '-0.001471']
LL improvements (naive−model): ['-0.0660', '-0.0185', '-0.0044']
Cal slopes: ['0.064', '0.240', '0.409']
ECEs: ['0.1198', '0.0704', '0.0543']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 2/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed but Brier, calibration gate(s) failed.
  Ranking signal exists. Needs better calibration / features.
```

### F5_Totals / continuous (regression)

**Verdict: 🔴 FAIL**

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

**Verdict: 🔴 FAIL**

```
Best model: LogReg
AUCs: ['0.5125', '0.5207', '0.5423']
Brier improvements (naive−model): ['-0.026460', '-0.008677', '-0.001892']
LL improvements (naive−model): ['-0.0640', '-0.0220', '-0.0044']
Cal slopes: ['0.027', '0.090', '0.376']
ECEs: ['0.1217', '0.0767', '0.0469']
N total: 7290 

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.535: 1/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate FAILED or N too low. No consistent pregame signal.
  Do NOT collect odds for this market.
```

### F5_Totals / over_4.0 (classification)

**Verdict: 🔴 FAIL**

```
Best model: LogReg
AUCs: ['0.5092', '0.5288', '0.5503']
Brier improvements (naive−model): ['-0.031510', '-0.009660', '-0.000375']
LL improvements (naive−model): ['-0.0826', '-0.0232', '-0.0013']
Cal slopes: ['0.024', '0.159', '0.462']
ECEs: ['0.1467', '0.0826', '0.0542']
N total: 7290 

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.535: 1/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate FAILED or N too low. No consistent pregame signal.
  Do NOT collect odds for this market.
```

### F5_Totals / over_4.5 (classification)

**Verdict: 🔴 FAIL**

```
Best model: LogReg
AUCs: ['0.5092', '0.5288', '0.5503']
Brier improvements (naive−model): ['-0.031510', '-0.009660', '-0.000375']
LL improvements (naive−model): ['-0.0826', '-0.0232', '-0.0013']
Cal slopes: ['0.024', '0.159', '0.462']
ECEs: ['0.1467', '0.0826', '0.0542']
N total: 7290 

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.535: 1/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate FAILED or N too low. No consistent pregame signal.
  Do NOT collect odds for this market.
```

### F5_Totals / over_5.0 (classification)

**Verdict: 🟡 CONDITIONAL**

```
Best model: LightGBM
AUCs: ['0.5043', '0.5465', '0.5538']
Brier improvements (naive−model): ['-0.023795', '-0.004437', '-0.001377']
LL improvements (naive−model): ['-0.0646', '-0.0100', '-0.0041']
Cal slopes: ['0.018', '0.323', '0.410']
ECEs: ['0.1265', '0.0611', '0.0432']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 2/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed but Brier, calibration gate(s) failed.
  Ranking signal exists. Needs better calibration / features.
```

### F5_Totals / over_5.5 (classification)

**Verdict: 🟡 CONDITIONAL**

```
Best model: LightGBM
AUCs: ['0.5043', '0.5465', '0.5538']
Brier improvements (naive−model): ['-0.023795', '-0.004437', '-0.001377']
LL improvements (naive−model): ['-0.0646', '-0.0100', '-0.0041']
Cal slopes: ['0.018', '0.323', '0.410']
ECEs: ['0.1265', '0.0611', '0.0432']
N total: 7290 

Gate results (2/3 splits needed):
  ✅ AUC ≥ 0.535: 2/3
  ❌ Brier imp ≥ 0.003: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7290

→ AUC gate passed but Brier, calibration gate(s) failed.
  Ranking signal exists. Needs better calibration / features.
```

### NRFI / nrfi (classification)

**Verdict: 🔴 FAIL**

```
Best model: LogReg
AUCs: ['0.5122', '0.5082', '0.5212']
Brier improvements (naive−model): ['-0.019526', '-0.012042', '-0.003856']
LL improvements (naive−model): ['-0.0464', '-0.0257', '-0.0081']
Cal slopes: ['0.068', '0.063', '0.261']
ECEs: ['0.1051', '0.0864', '0.0585']
N total: 7287 

NRFI/YRFI stricter gates: AUC ≥ 0.545, Brier imp ≥ 0.004

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.545: 0/3
  ❌ Brier imp ≥ 0.004: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7287

→ AUC gate FAILED or N too low. No consistent pregame signal.
  Do NOT collect odds for this market.
```

### YRFI / yrfi (classification)

**Verdict: 🔴 FAIL**

```
Best model: LogReg
AUCs: ['0.5121', '0.5082', '0.5210']
Brier improvements (naive−model): ['-0.019522', '-0.011988', '-0.003902']
LL improvements (naive−model): ['-0.0464', '-0.0256', '-0.0082']
Cal slopes: ['0.068', '0.064', '0.258']
ECEs: ['0.1058', '0.0859', '0.0611']
N total: 7287 

NRFI/YRFI stricter gates: AUC ≥ 0.545, Brier imp ≥ 0.004

Gate results (2/3 splits needed):
  ❌ AUC ≥ 0.545: 0/3
  ❌ Brier imp ≥ 0.004: 0/3
  ❌ LL imp ≥ 0.003: 0/3
  ❌ Cal slope ∈ [0.85, 1.15]: 0/3
  ✅ N ≥ 800: 7287

→ AUC gate FAILED or N too low. No consistent pregame signal.
  Do NOT collect odds for this market.
```


---

*Generated by pre_odds_screen_fixed.py on 2026-02-10 14:11*