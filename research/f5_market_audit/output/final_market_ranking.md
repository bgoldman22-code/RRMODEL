# F5 Market Learnability Audit — Final Ranking

**Date:** 2026-02-10 12:09
**Method:** Walk-forward (train ≤ year N-1, test year N)
**Models:** LogisticRegression, LightGBM
**Test Years:** [2023, 2024, 2025]

## GO / NO-GO Gates

- Mean AUC ≥ 0.55
- At least one split AUC ≥ 0.57
- Calibration slope ∈ [0.85, 1.15]
- Reliability curve monotonic
- MAE improves vs market implied probability (when available)

## Market Ranking

| Rank | Market | Submarket | Mean AUC | Best AUC | MAE Gain | Cal Slope | Stability | Verdict |
|------|--------|-----------|----------|----------|----------|-----------|-----------|---------|
| 1 | F5_Moneyline | home_win | 0.5631 | 0.5765 | +0.0040 | 0.313 | stable | **CONDITIONAL** |
| 2 | F5_RunLine | home_+0.5 | 0.5572 | 0.5767 | N/A | 0.324 | stable | **CONDITIONAL** |
| 3 | F5_RunLine | home_-0.5 | 0.5495 | 0.5567 | N/A | 0.273 | stable | **DEAD** |
| 4 | F5_TeamTotals | away_over_1.5 | 0.5483 | 0.5605 | N/A | 0.298 | stable | **DEAD** |
| 5 | F5_TeamTotals | away_over_3.0 | 0.5473 | 0.5563 | N/A | 0.249 | stable | **DEAD** |
| 6 | F5_TeamTotals | home_over_3.0 | 0.5424 | 0.5553 | N/A | 0.236 | variable | **DEAD** |
| 7 | F5_TeamTotals | away_over_2.0 | 0.5413 | 0.5606 | N/A | 0.268 | stable | **DEAD** |
| 8 | F5_TeamTotals | away_over_2.5 | 0.5413 | 0.5606 | N/A | 0.268 | stable | **DEAD** |
| 9 | F5_TeamTotals | home_over_2.0 | 0.5369 | 0.5486 | N/A | 0.207 | stable | **DEAD** |
| 10 | F5_TeamTotals | home_over_2.5 | 0.5369 | 0.5486 | N/A | 0.207 | stable | **DEAD** |
| 11 | F5_Totals | over_5.0 | 0.5335 | 0.5541 | N/A | 0.239 | variable | **DEAD** |
| 12 | F5_Totals | over_5.5 | 0.5335 | 0.5541 | N/A | 0.239 | variable | **DEAD** |
| 13 | F5_TeamTotals | home_over_1.5 | 0.5330 | 0.5415 | N/A | 0.208 | stable | **DEAD** |
| 14 | F5_Totals | over_4.0 | 0.5294 | 0.5503 | N/A | 0.213 | variable | **DEAD** |
| 15 | F5_Totals | over_4.5 | 0.5294 | 0.5503 | N/A | 0.213 | variable | **DEAD** |
| 16 | F5_Totals | over_3.5 | 0.5252 | 0.5423 | N/A | 0.163 | stable | **DEAD** |


### NRFI_YRFI — NOT EVALUABLE

> No first-inning scoring data available in features_v2.parquet. Labels only contain label_f5_home, label_f5_away (5-inning totals), not inning-by-inning breakdowns. NRFI/YRFI requires play-by-play or inning-level scoring data that must be collected separately.


## Detailed Results

| Market | Submarket | Model | Year | N | AUC | MAE | MAE_mkt | Gain | Brier | Cal_Slope | Mono |
|--------|-----------|-------|------|---|-----|-----|---------|------|-------|-----------|------|
| F5_Moneyline | home_win | LogReg | 2023 | 2064 | 0.5503 | 0.4787 | 0.4869 | +0.0081 | 0.2749 | 0.198 | ✓ |
| F5_Moneyline | home_win | LightGBM | 2023 | 2064 | 0.5534 | 0.4798 | 0.4869 | +0.0071 | 0.2665 | 0.230 | ✓ |
| F5_Moneyline | home_win | LogReg | 2024 | 2090 | 0.5625 | 0.4805 | 0.4831 | +0.0026 | 0.2580 | 0.309 | ✓ |
| F5_Moneyline | home_win | LightGBM | 2024 | 2090 | 0.5349 | 0.4891 | 0.4831 | -0.0060 | 0.2643 | 0.173 | ✓ |
| F5_Moneyline | home_win | LogReg | 2025 | 2044 | 0.5765 | 0.4806 | 0.4820 | +0.0014 | 0.2490 | 0.431 | ✓ |
| F5_Moneyline | home_win | LightGBM | 2025 | 2044 | 0.5506 | 0.4855 | 0.4820 | -0.0035 | 0.2536 | 0.324 | ✓ |
| F5_RunLine | home_-0.5 | LogReg | 2023 | 2430 | 0.5390 | 0.4809 | N/A | N/A | 0.2670 | 0.180 | ✓ |
| F5_RunLine | home_-0.5 | LightGBM | 2023 | 2430 | 0.5303 | 0.4852 | N/A | N/A | 0.2657 | 0.150 | ✓ |
| F5_RunLine | home_-0.5 | LogReg | 2024 | 2430 | 0.5567 | 0.4816 | N/A | N/A | 0.2530 | 0.284 | ✓ |
| F5_RunLine | home_-0.5 | LightGBM | 2024 | 2430 | 0.5241 | 0.4884 | N/A | N/A | 0.2602 | 0.145 | ✓ |
| F5_RunLine | home_-0.5 | LogReg | 2025 | 2430 | 0.5528 | 0.4852 | N/A | N/A | 0.2508 | 0.355 | ✓ |
| F5_RunLine | home_-0.5 | LightGBM | 2025 | 2430 | 0.5437 | 0.4860 | N/A | N/A | 0.2537 | 0.287 | ✓ |
| F5_RunLine | home_+0.5 | LogReg | 2023 | 2430 | 0.5409 | 0.4657 | N/A | N/A | 0.2602 | 0.201 | ✓ |
| F5_RunLine | home_+0.5 | LightGBM | 2023 | 2430 | 0.5508 | 0.4596 | N/A | N/A | 0.2538 | 0.250 | ✓ |
| F5_RunLine | home_+0.5 | LogReg | 2024 | 2430 | 0.5541 | 0.4648 | N/A | N/A | 0.2510 | 0.277 | ✓ |
| F5_RunLine | home_+0.5 | LightGBM | 2024 | 2430 | 0.5284 | 0.4704 | N/A | N/A | 0.2553 | 0.165 | ✓ |
| F5_RunLine | home_+0.5 | LogReg | 2025 | 2430 | 0.5767 | 0.4607 | N/A | N/A | 0.2365 | 0.494 | ✓ |
| F5_RunLine | home_+0.5 | LightGBM | 2025 | 2430 | 0.5633 | 0.4624 | N/A | N/A | 0.2378 | 0.450 | ✓ |
| F5_Totals | over_3.5 | LogReg | 2023 | 2430 | 0.5125 | 0.4804 | N/A | N/A | 0.2582 | 0.027 | ✓ |
| F5_Totals | over_3.5 | LightGBM | 2023 | 2430 | 0.5084 | 0.4674 | N/A | N/A | 0.2497 | 0.054 | ✓ |
| F5_Totals | over_3.5 | LogReg | 2024 | 2430 | 0.5207 | 0.4704 | N/A | N/A | 0.2447 | 0.090 | ✓ |
| F5_Totals | over_3.5 | LightGBM | 2024 | 2430 | 0.5213 | 0.4651 | N/A | N/A | 0.2450 | 0.139 | ✓ |
| F5_Totals | over_3.5 | LogReg | 2025 | 2430 | 0.5423 | 0.4657 | N/A | N/A | 0.2361 | 0.371 | ✓ |
| F5_Totals | over_3.5 | LightGBM | 2025 | 2430 | 0.5173 | 0.4661 | N/A | N/A | 0.2414 | 0.144 | ✓ |
| F5_Totals | over_4.0 | LogReg | 2023 | 2430 | 0.5092 | 0.5013 | N/A | N/A | 0.2805 | 0.024 | ✓ |
| F5_Totals | over_4.0 | LightGBM | 2023 | 2430 | 0.4932 | 0.5054 | N/A | N/A | 0.2794 | -0.042 | ✓ |
| F5_Totals | over_4.0 | LogReg | 2024 | 2430 | 0.5288 | 0.4949 | N/A | N/A | 0.2596 | 0.158 | ✗ |
| F5_Totals | over_4.0 | LightGBM | 2024 | 2430 | 0.5342 | 0.4931 | N/A | N/A | 0.2570 | 0.242 | ✓ |
| F5_Totals | over_4.0 | LogReg | 2025 | 2430 | 0.5503 | 0.4911 | N/A | N/A | 0.2504 | 0.457 | ✓ |
| F5_Totals | over_4.0 | LightGBM | 2025 | 2430 | 0.5397 | 0.4923 | N/A | N/A | 0.2529 | 0.347 | ✓ |
| F5_Totals | over_4.5 | LogReg | 2023 | 2430 | 0.5092 | 0.5013 | N/A | N/A | 0.2805 | 0.024 | ✓ |
| F5_Totals | over_4.5 | LightGBM | 2023 | 2430 | 0.4932 | 0.5054 | N/A | N/A | 0.2794 | -0.042 | ✓ |
| F5_Totals | over_4.5 | LogReg | 2024 | 2430 | 0.5288 | 0.4949 | N/A | N/A | 0.2596 | 0.158 | ✗ |
| F5_Totals | over_4.5 | LightGBM | 2024 | 2430 | 0.5342 | 0.4931 | N/A | N/A | 0.2570 | 0.242 | ✓ |
| F5_Totals | over_4.5 | LogReg | 2025 | 2430 | 0.5503 | 0.4911 | N/A | N/A | 0.2504 | 0.457 | ✓ |
| F5_Totals | over_4.5 | LightGBM | 2025 | 2430 | 0.5397 | 0.4923 | N/A | N/A | 0.2529 | 0.347 | ✓ |
| F5_Totals | over_5.0 | LogReg | 2023 | 2430 | 0.4895 | 0.4762 | N/A | N/A | 0.2723 | -0.065 | ✗ |
| F5_Totals | over_5.0 | LightGBM | 2023 | 2430 | 0.5113 | 0.4685 | N/A | N/A | 0.2664 | 0.052 | ✓ |
| F5_Totals | over_5.0 | LogReg | 2024 | 2430 | 0.5261 | 0.4754 | N/A | N/A | 0.2454 | 0.118 | ✓ |
| F5_Totals | over_5.0 | LightGBM | 2024 | 2430 | 0.5352 | 0.4667 | N/A | N/A | 0.2416 | 0.257 | ✓ |
| F5_Totals | over_5.0 | LogReg | 2025 | 2430 | 0.5685 | 0.4600 | N/A | N/A | 0.2338 | 0.583 | ✓ |
| F5_Totals | over_5.0 | LightGBM | 2025 | 2430 | 0.5541 | 0.4600 | N/A | N/A | 0.2372 | 0.406 | ✓ |
| F5_Totals | over_5.5 | LogReg | 2023 | 2430 | 0.4895 | 0.4762 | N/A | N/A | 0.2723 | -0.065 | ✗ |
| F5_Totals | over_5.5 | LightGBM | 2023 | 2430 | 0.5113 | 0.4685 | N/A | N/A | 0.2664 | 0.052 | ✓ |
| F5_Totals | over_5.5 | LogReg | 2024 | 2430 | 0.5261 | 0.4754 | N/A | N/A | 0.2454 | 0.118 | ✓ |
| F5_Totals | over_5.5 | LightGBM | 2024 | 2430 | 0.5352 | 0.4667 | N/A | N/A | 0.2416 | 0.257 | ✓ |
| F5_Totals | over_5.5 | LogReg | 2025 | 2430 | 0.5685 | 0.4600 | N/A | N/A | 0.2338 | 0.583 | ✓ |
| F5_Totals | over_5.5 | LightGBM | 2025 | 2430 | 0.5541 | 0.4600 | N/A | N/A | 0.2372 | 0.406 | ✓ |
| F5_TeamTotals | home_over_1.5 | LogReg | 2023 | 2430 | 0.5180 | 0.4826 | N/A | N/A | 0.2626 | 0.060 | ✓ |
| F5_TeamTotals | home_over_1.5 | LightGBM | 2023 | 2430 | 0.5161 | 0.4759 | N/A | N/A | 0.2570 | 0.104 | ✓ |
| F5_TeamTotals | home_over_1.5 | LogReg | 2024 | 2430 | 0.5415 | 0.4683 | N/A | N/A | 0.2473 | 0.274 | ✓ |
| F5_TeamTotals | home_over_1.5 | LightGBM | 2024 | 2430 | 0.5388 | 0.4704 | N/A | N/A | 0.2482 | 0.254 | ✓ |
| F5_TeamTotals | home_over_1.5 | LogReg | 2025 | 2430 | 0.5395 | 0.4697 | N/A | N/A | 0.2432 | 0.288 | ✓ |
| F5_TeamTotals | home_over_1.5 | LightGBM | 2025 | 2430 | 0.5274 | 0.4722 | N/A | N/A | 0.2457 | 0.222 | ✓ |
| F5_TeamTotals | away_over_1.5 | LogReg | 2023 | 2430 | 0.5105 | 0.4979 | N/A | N/A | 0.2852 | 0.032 | ✓ |
| F5_TeamTotals | away_over_1.5 | LightGBM | 2023 | 2430 | 0.5319 | 0.4864 | N/A | N/A | 0.2674 | 0.125 | ✓ |
| F5_TeamTotals | away_over_1.5 | LogReg | 2024 | 2430 | 0.5439 | 0.4846 | N/A | N/A | 0.2510 | 0.267 | ✓ |
| F5_TeamTotals | away_over_1.5 | LightGBM | 2024 | 2430 | 0.5526 | 0.4789 | N/A | N/A | 0.2507 | 0.330 | ✓ |
| F5_TeamTotals | away_over_1.5 | LogReg | 2025 | 2430 | 0.5628 | 0.4812 | N/A | N/A | 0.2470 | 0.485 | ✓ |
| F5_TeamTotals | away_over_1.5 | LightGBM | 2025 | 2430 | 0.5605 | 0.4811 | N/A | N/A | 0.2483 | 0.439 | ✓ |
| F5_TeamTotals | home_over_2.0 | LogReg | 2023 | 2430 | 0.5249 | 0.4799 | N/A | N/A | 0.2727 | 0.112 | ✓ |
| F5_TeamTotals | home_over_2.0 | LightGBM | 2023 | 2430 | 0.5244 | 0.4821 | N/A | N/A | 0.2669 | 0.133 | ✓ |
| F5_TeamTotals | home_over_2.0 | LogReg | 2024 | 2430 | 0.5486 | 0.4807 | N/A | N/A | 0.2489 | 0.239 | ✓ |
| F5_TeamTotals | home_over_2.0 | LightGBM | 2024 | 2430 | 0.5388 | 0.4803 | N/A | N/A | 0.2507 | 0.242 | ✓ |
| F5_TeamTotals | home_over_2.0 | LogReg | 2025 | 2430 | 0.5372 | 0.4835 | N/A | N/A | 0.2495 | 0.270 | ✓ |
| F5_TeamTotals | home_over_2.0 | LightGBM | 2025 | 2430 | 0.5421 | 0.4809 | N/A | N/A | 0.2497 | 0.308 | ✓ |
| F5_TeamTotals | away_over_2.0 | LogReg | 2023 | 2430 | 0.5337 | 0.4641 | N/A | N/A | 0.2641 | 0.151 | ✓ |
| F5_TeamTotals | away_over_2.0 | LightGBM | 2023 | 2430 | 0.5359 | 0.4631 | N/A | N/A | 0.2636 | 0.156 | ✓ |
| F5_TeamTotals | away_over_2.0 | LogReg | 2024 | 2430 | 0.5295 | 0.4709 | N/A | N/A | 0.2473 | 0.182 | ✓ |
| F5_TeamTotals | away_over_2.0 | LightGBM | 2024 | 2430 | 0.5300 | 0.4693 | N/A | N/A | 0.2472 | 0.187 | ✓ |
| F5_TeamTotals | away_over_2.0 | LogReg | 2025 | 2430 | 0.5606 | 0.4626 | N/A | N/A | 0.2360 | 0.472 | ✓ |
| F5_TeamTotals | away_over_2.0 | LightGBM | 2025 | 2430 | 0.5558 | 0.4644 | N/A | N/A | 0.2385 | 0.355 | ✓ |
| F5_TeamTotals | home_over_2.5 | LogReg | 2023 | 2430 | 0.5249 | 0.4799 | N/A | N/A | 0.2727 | 0.112 | ✓ |
| F5_TeamTotals | home_over_2.5 | LightGBM | 2023 | 2430 | 0.5244 | 0.4821 | N/A | N/A | 0.2669 | 0.133 | ✓ |
| F5_TeamTotals | home_over_2.5 | LogReg | 2024 | 2430 | 0.5486 | 0.4807 | N/A | N/A | 0.2489 | 0.239 | ✓ |
| F5_TeamTotals | home_over_2.5 | LightGBM | 2024 | 2430 | 0.5388 | 0.4803 | N/A | N/A | 0.2507 | 0.242 | ✓ |
| F5_TeamTotals | home_over_2.5 | LogReg | 2025 | 2430 | 0.5372 | 0.4835 | N/A | N/A | 0.2495 | 0.270 | ✓ |
| F5_TeamTotals | home_over_2.5 | LightGBM | 2025 | 2430 | 0.5421 | 0.4809 | N/A | N/A | 0.2497 | 0.308 | ✓ |
| F5_TeamTotals | away_over_2.5 | LogReg | 2023 | 2430 | 0.5337 | 0.4641 | N/A | N/A | 0.2641 | 0.151 | ✓ |
| F5_TeamTotals | away_over_2.5 | LightGBM | 2023 | 2430 | 0.5359 | 0.4631 | N/A | N/A | 0.2636 | 0.156 | ✓ |
| F5_TeamTotals | away_over_2.5 | LogReg | 2024 | 2430 | 0.5295 | 0.4709 | N/A | N/A | 0.2473 | 0.182 | ✓ |
| F5_TeamTotals | away_over_2.5 | LightGBM | 2024 | 2430 | 0.5300 | 0.4693 | N/A | N/A | 0.2472 | 0.187 | ✓ |
| F5_TeamTotals | away_over_2.5 | LogReg | 2025 | 2430 | 0.5606 | 0.4626 | N/A | N/A | 0.2360 | 0.472 | ✓ |
| F5_TeamTotals | away_over_2.5 | LightGBM | 2025 | 2430 | 0.5558 | 0.4644 | N/A | N/A | 0.2385 | 0.355 | ✓ |
| F5_TeamTotals | home_over_3.0 | LogReg | 2023 | 2430 | 0.5171 | 0.4016 | N/A | N/A | 0.2317 | 0.064 | ✓ |
| F5_TeamTotals | home_over_3.0 | LightGBM | 2023 | 2430 | 0.5070 | 0.3954 | N/A | N/A | 0.2315 | 0.052 | ✗ |
| F5_TeamTotals | home_over_3.0 | LogReg | 2024 | 2430 | 0.5553 | 0.4092 | N/A | N/A | 0.2110 | 0.239 | ✓ |
| F5_TeamTotals | home_over_3.0 | LightGBM | 2024 | 2430 | 0.5526 | 0.3997 | N/A | N/A | 0.2100 | 0.308 | ✓ |
| F5_TeamTotals | home_over_3.0 | LogReg | 2025 | 2430 | 0.5547 | 0.4104 | N/A | N/A | 0.2129 | 0.406 | ✓ |
| F5_TeamTotals | home_over_3.0 | LightGBM | 2025 | 2430 | 0.5293 | 0.4088 | N/A | N/A | 0.2165 | 0.251 | ✓ |
| F5_TeamTotals | away_over_3.0 | LogReg | 2023 | 2430 | 0.5394 | 0.3730 | N/A | N/A | 0.2188 | 0.169 | ✓ |
| F5_TeamTotals | away_over_3.0 | LightGBM | 2023 | 2430 | 0.5482 | 0.3604 | N/A | N/A | 0.2188 | 0.205 | ✓ |
| F5_TeamTotals | away_over_3.0 | LogReg | 2024 | 2430 | 0.5410 | 0.3805 | N/A | N/A | 0.1985 | 0.209 | ✓ |
| F5_TeamTotals | away_over_3.0 | LightGBM | 2024 | 2430 | 0.5374 | 0.3761 | N/A | N/A | 0.1971 | 0.195 | ✓ |
| F5_TeamTotals | away_over_3.0 | LogReg | 2025 | 2430 | 0.5573 | 0.3706 | N/A | N/A | 0.1927 | 0.367 | ✓ |
| F5_TeamTotals | away_over_3.0 | LightGBM | 2025 | 2430 | 0.5563 | 0.3678 | N/A | N/A | 0.1936 | 0.346 | ✓ |


## Recommendations


### 🟡 CONDITIONAL — Needs Filters or More Data

- **F5_Moneyline**: home_win
- **F5_RunLine**: home_+0.5

### 🔴 DEAD — Do Not Pursue

- **F5_Totals**
- **F5_TeamTotals**

### ⬜ NOT EVALUABLE — Missing Data

- **NRFI_YRFI**: No first-inning scoring data available in features_v2.parquet. Labels only contain label_f5_home, label_f5_away (5-inning totals), not inning-by-inning breakdowns. NRFI/YRFI requires play-by-play or inning-level scoring data that must be collected separately.