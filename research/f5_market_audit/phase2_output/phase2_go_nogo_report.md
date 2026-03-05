# Phase 2 — Deep Market Audit: GO / NO-GO Report

**Generated:** 2026-02-10 13:46
**Method:** Walk-forward (train ≤ year N-1, test year N)
**Models:** LogisticRegression, LightGBM (default), LightGBM (tuned)
**Test Years:** [2023, 2024, 2025]
**Feature set:** 253 production features

## Critical Data Limitations

| Data Type | Available? | Impact |
|-----------|------------|--------|
| F5 scoring labels | ✅ Yes | Can build F5 Totals & Team Totals targets |
| F5 Totals odds (market baseline) | ❌ No | Cannot compute Δ vs market implied prob |
| F5 Team Totals odds | ❌ No | Cannot compute Δ vs market implied prob |
| First-inning scoring (NRFI labels) | ⚠️ Fetched from API | Required MLB Stats API linescore fetch |
| NRFI/YRFI odds | ❌ No | Cannot compute Δ vs market implied prob |
| TheOddsAPI `totals_1st_5_innings` | ✅ Available for future | Not yet fetched; add to collection pipeline |

**Without market odds, we evaluate model quality in absolute terms only.**
**A model that beats base-rate Brier and shows AUC > 0.54 still needs market odds to confirm edge.**

## GO / NO-GO Gates (Phase 2)

| Gate | Threshold |
|------|-----------|
| Mean AUC | ≥ 0.54 |
| Best single-split AUC | ≥ 0.56 |
| Calibration slope | ∈ [0.4, 1.6] |
| Brier Skill Score | > 0.0 |
| Reliability monotonic | Yes |
| AUC stability (std) | < 0.025 |

## Market Verdicts

| Market/Submarket | Verdict | Mean AUC | Best AUC | Brier Skill |
|------------------|---------|----------|----------|-------------|
| 🟡 F5_TeamTotals/away_over_1.5 | **CONDITIONAL** | 0.5483 | 0.5605 | -0.0411 |
| 🟠 F5_TeamTotals/away_over_2.0 | **WEAK_SIGNAL** | 0.5472 | 0.5569 | -0.0243 |
| 🟠 F5_TeamTotals/away_over_2.5 | **WEAK_SIGNAL** | 0.5472 | 0.5569 | -0.0243 |
| 🟡 F5_TeamTotals/away_over_3.0 | **CONDITIONAL** | 0.5543 | 0.5652 | -0.0219 |
| 🔴 F5_TeamTotals/home_over_1.5 | **DEAD** | 0.5330 | 0.5415 | -0.0471 |
| 🟠 F5_TeamTotals/home_over_2.0 | **WEAK_SIGNAL** | 0.5408 | 0.5463 | -0.0224 |
| 🟠 F5_TeamTotals/home_over_2.5 | **WEAK_SIGNAL** | 0.5408 | 0.5463 | -0.0224 |
| 🟠 F5_TeamTotals/home_over_3.0 | **WEAK_SIGNAL** | 0.5424 | 0.5553 | -0.0396 |
| 🔴 F5_Totals/over_3.5 | **DEAD** | 0.5252 | 0.5423 | -0.0530 |
| 🔴 F5_Totals/over_4.0 | **DEAD** | 0.5294 | 0.5503 | -0.0556 |
| 🔴 F5_Totals/over_4.5 | **DEAD** | 0.5294 | 0.5503 | -0.0556 |
| 🟠 F5_Totals/over_5.0 | **WEAK_SIGNAL** | 0.5366 | 0.5604 | -0.0259 |
| 🟠 F5_Totals/over_5.5 | **WEAK_SIGNAL** | 0.5366 | 0.5604 | -0.0259 |
| 🔴 NRFI/nrfi | **DEAD** | 0.5196 | 0.5243 | -0.0326 |
| 🔴 YRFI/yrfi | **DEAD** | 0.5196 | 0.5243 | -0.0326 |

## Detailed Verdicts

### F5_TeamTotals/away_over_1.5

**Verdict:** CONDITIONAL

```
Best model: LightGBM
Mean AUC: 0.5483 (std: 0.0121)
Best single-split AUC: 0.5605
Mean Brier Skill Score: -0.0411
Mean calibration slope: 0.2981
All splits monotonic: True

Gates passed: 4/6
  ✅ AUC mean ≥ 0.54
  ✅ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ✅ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ Core AUC gates passed but calibration/stability issues remain.
  Recommendation: Apply isotonic calibration and retest.
```

### F5_TeamTotals/away_over_2.0

**Verdict:** WEAK_SIGNAL

```
Best model: LGB_tuned
Mean AUC: 0.5472 (std: 0.0069)
Best single-split AUC: 0.5569
Mean Brier Skill Score: -0.0243
Mean calibration slope: 0.3306
All splits monotonic: True

Gates passed: 3/6
  ✅ AUC mean ≥ 0.54
  ❌ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ✅ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ Marginal signal detected but insufficient for production.
  Recommendation: Investigate feature engineering or data enrichment.
```

### F5_TeamTotals/away_over_2.5

**Verdict:** WEAK_SIGNAL

```
Best model: LGB_tuned
Mean AUC: 0.5472 (std: 0.0069)
Best single-split AUC: 0.5569
Mean Brier Skill Score: -0.0243
Mean calibration slope: 0.3306
All splits monotonic: True

Gates passed: 3/6
  ✅ AUC mean ≥ 0.54
  ❌ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ✅ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ Marginal signal detected but insufficient for production.
  Recommendation: Investigate feature engineering or data enrichment.
```

### F5_TeamTotals/away_over_3.0

**Verdict:** CONDITIONAL

```
Best model: LGB_tuned
Mean AUC: 0.5543 (std: 0.0087)
Best single-split AUC: 0.5652
Mean Brier Skill Score: -0.0219
Mean calibration slope: 0.3570
All splits monotonic: True

Gates passed: 4/6
  ✅ AUC mean ≥ 0.54
  ✅ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ✅ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ Core AUC gates passed but calibration/stability issues remain.
  Recommendation: Apply isotonic calibration and retest.
```

### F5_TeamTotals/home_over_1.5

**Verdict:** DEAD

```
Best model: LogReg
Mean AUC: 0.5330 (std: 0.0106)
Best single-split AUC: 0.5415
Mean Brier Skill Score: -0.0471
Mean calibration slope: 0.2075
All splits monotonic: True

Gates passed: 2/6
  ❌ AUC mean ≥ 0.54
  ❌ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ✅ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ No actionable signal. Do not pursue.
```

### F5_TeamTotals/home_over_2.0

**Verdict:** WEAK_SIGNAL

```
Best model: LGB_tuned
Mean AUC: 0.5408 (std: 0.0073)
Best single-split AUC: 0.5463
Mean Brier Skill Score: -0.0224
Mean calibration slope: 0.3108
All splits monotonic: False

Gates passed: 2/6
  ✅ AUC mean ≥ 0.54
  ❌ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ❌ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ Marginal signal detected but insufficient for production.
  Recommendation: Investigate feature engineering or data enrichment.
```

### F5_TeamTotals/home_over_2.5

**Verdict:** WEAK_SIGNAL

```
Best model: LGB_tuned
Mean AUC: 0.5408 (std: 0.0073)
Best single-split AUC: 0.5463
Mean Brier Skill Score: -0.0224
Mean calibration slope: 0.3108
All splits monotonic: False

Gates passed: 2/6
  ✅ AUC mean ≥ 0.54
  ❌ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ❌ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ Marginal signal detected but insufficient for production.
  Recommendation: Investigate feature engineering or data enrichment.
```

### F5_TeamTotals/home_over_3.0

**Verdict:** WEAK_SIGNAL

```
Best model: LogReg
Mean AUC: 0.5424 (std: 0.0179)
Best single-split AUC: 0.5553
Mean Brier Skill Score: -0.0396
Mean calibration slope: 0.2363
All splits monotonic: True

Gates passed: 3/6
  ✅ AUC mean ≥ 0.54
  ❌ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ✅ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ Marginal signal detected but insufficient for production.
  Recommendation: Investigate feature engineering or data enrichment.
```

### F5_Totals/over_3.5

**Verdict:** DEAD

```
Best model: LogReg
Mean AUC: 0.5252 (std: 0.0126)
Best single-split AUC: 0.5423
Mean Brier Skill Score: -0.0530
Mean calibration slope: 0.1626
All splits monotonic: True

Gates passed: 2/6
  ❌ AUC mean ≥ 0.54
  ❌ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ✅ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ No actionable signal. Do not pursue.
```

### F5_Totals/over_4.0

**Verdict:** DEAD

```
Best model: LogReg
Mean AUC: 0.5294 (std: 0.0168)
Best single-split AUC: 0.5503
Mean Brier Skill Score: -0.0556
Mean calibration slope: 0.2130
All splits monotonic: False

Gates passed: 1/6
  ❌ AUC mean ≥ 0.54
  ❌ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ❌ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ No actionable signal. Do not pursue.
```

### F5_Totals/over_4.5

**Verdict:** DEAD

```
Best model: LogReg
Mean AUC: 0.5294 (std: 0.0168)
Best single-split AUC: 0.5503
Mean Brier Skill Score: -0.0556
Mean calibration slope: 0.2130
All splits monotonic: False

Gates passed: 1/6
  ❌ AUC mean ≥ 0.54
  ❌ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ❌ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ No actionable signal. Do not pursue.
```

### F5_Totals/over_5.0

**Verdict:** WEAK_SIGNAL

```
Best model: LGB_tuned
Mean AUC: 0.5366 (std: 0.0240)
Best single-split AUC: 0.5604
Mean Brier Skill Score: -0.0259
Mean calibration slope: 0.3137
All splits monotonic: True

Gates passed: 3/6
  ❌ AUC mean ≥ 0.54
  ✅ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ✅ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ Marginal signal detected but insufficient for production.
  Recommendation: Investigate feature engineering or data enrichment.
```

### F5_Totals/over_5.5

**Verdict:** WEAK_SIGNAL

```
Best model: LGB_tuned
Mean AUC: 0.5366 (std: 0.0240)
Best single-split AUC: 0.5604
Mean Brier Skill Score: -0.0259
Mean calibration slope: 0.3137
All splits monotonic: True

Gates passed: 3/6
  ❌ AUC mean ≥ 0.54
  ✅ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ✅ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ Marginal signal detected but insufficient for production.
  Recommendation: Investigate feature engineering or data enrichment.
```

### NRFI/nrfi

**Verdict:** DEAD

```
Best model: LGB_tuned
Mean AUC: 0.5196 (std: 0.0041)
Best single-split AUC: 0.5243
Mean Brier Skill Score: -0.0326
Mean calibration slope: 0.1656
All splits monotonic: True

Gates passed: 2/6
  ❌ AUC mean ≥ 0.54
  ❌ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ✅ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ No actionable signal. Do not pursue.
```

### YRFI/yrfi

**Verdict:** DEAD

```
Best model: LGB_tuned
Mean AUC: 0.5196 (std: 0.0041)
Best single-split AUC: 0.5243
Mean Brier Skill Score: -0.0326
Mean calibration slope: 0.1656
All splits monotonic: True

Gates passed: 2/6
  ❌ AUC mean ≥ 0.54
  ❌ AUC single ≥ 0.56
  ❌ Cal slope ∈ [0.4, 1.6]
  ❌ Brier skill > 0.0
  ✅ Monotonic reliability
  ✅ AUC stability (std < 0.025)

→ No actionable signal. Do not pursue.
```

## Segmentation Highlights

### F5_TeamTotals/away_over_1.5

| Segment | N | AUC | Actual Rate | Pred Mean |
|---------|---|-----|-------------|-----------|
| conf_Q1_low | 486 | 0.5042 | 0.4444 | 0.4156 |
| conf_Q2 | 486 | 0.5103 | 0.5288 | 0.5146 |
| conf_Q3 | 486 | 0.5104 | 0.6029 | 0.5739 |
| conf_Q4 | 486 | 0.5138 | 0.5885 | 0.6337 |
| conf_Q5_high | 486 | 0.5013 | 0.5967 | 0.7220 |
| month_Apr | 395 | 0.5274 | 0.5038 | 0.5762 |
| month_Aug | 422 | 0.5629 | 0.5592 | 0.5725 |
| month_Jul | 371 | 0.5558 | 0.5768 | 0.5664 |
| month_Jun | 396 | 0.5748 | 0.5859 | 0.5689 |
| month_Mar | 62 | 0.5651 | 0.5645 | 0.5370 |
| month_May | 410 | 0.5529 | 0.5024 | 0.5852 |
| month_Sep | 374 | 0.5987 | 0.5882 | 0.5669 |

### F5_TeamTotals/away_over_2.0

| Segment | N | AUC | Actual Rate | Pred Mean |
|---------|---|-----|-------------|-----------|
| conf_Q1_low | 486 | 0.4526 | 0.3086 | 0.2402 |
| conf_Q2 | 486 | 0.5167 | 0.3374 | 0.3275 |
| conf_Q3 | 486 | 0.5183 | 0.4218 | 0.3872 |
| conf_Q4 | 486 | 0.5172 | 0.3992 | 0.4463 |
| conf_Q5_high | 486 | 0.5397 | 0.4362 | 0.5471 |
| month_Apr | 395 | 0.5457 | 0.3316 | 0.3880 |
| month_Aug | 422 | 0.5544 | 0.4123 | 0.4001 |
| month_Jul | 371 | 0.5277 | 0.3666 | 0.3860 |
| month_Jun | 396 | 0.5605 | 0.4167 | 0.3848 |
| month_Mar | 62 | 0.5294 | 0.2742 | 0.3643 |
| month_May | 410 | 0.5779 | 0.3561 | 0.3959 |
| month_Sep | 374 | 0.5717 | 0.4171 | 0.3859 |

### F5_Totals/over_4.5

| Segment | N | AUC | Actual Rate | Pred Mean |
|---------|---|-----|-------------|-----------|
| conf_Q1_low | 486 | 0.5446 | 0.4321 | 0.3563 |
| conf_Q2 | 486 | 0.4932 | 0.4897 | 0.4408 |
| conf_Q3 | 486 | 0.5034 | 0.5185 | 0.4929 |
| conf_Q4 | 486 | 0.5646 | 0.5021 | 0.5495 |
| conf_Q5_high | 486 | 0.4994 | 0.5370 | 0.6422 |
| month_Apr | 395 | 0.5295 | 0.4658 | 0.5119 |
| month_Aug | 422 | 0.5611 | 0.5521 | 0.5043 |
| month_Jul | 371 | 0.5188 | 0.5391 | 0.4959 |
| month_Jun | 396 | 0.5656 | 0.4722 | 0.4833 |
| month_Mar | 62 | 0.5170 | 0.3548 | 0.5162 |
| month_May | 410 | 0.5320 | 0.4463 | 0.4851 |
| month_Sep | 374 | 0.5327 | 0.5241 | 0.4941 |

### F5_Totals/over_5.0

| Segment | N | AUC | Actual Rate | Pred Mean |
|---------|---|-----|-------------|-----------|
| conf_Q1_low | 486 | 0.5345 | 0.3169 | 0.2347 |
| conf_Q2 | 486 | 0.4815 | 0.3580 | 0.3134 |
| conf_Q3 | 486 | 0.5452 | 0.3889 | 0.3653 |
| conf_Q4 | 486 | 0.5119 | 0.3868 | 0.4249 |
| conf_Q5_high | 486 | 0.5393 | 0.4486 | 0.5279 |
| month_Apr | 395 | 0.5860 | 0.3696 | 0.3738 |
| month_Aug | 422 | 0.5726 | 0.4123 | 0.3812 |
| month_Jul | 371 | 0.5191 | 0.4097 | 0.3649 |
| month_Jun | 396 | 0.5563 | 0.3864 | 0.3654 |
| month_Mar | 62 | 0.5789 | 0.3065 | 0.3984 |
| month_May | 410 | 0.5361 | 0.3171 | 0.3632 |
| month_Sep | 374 | 0.5430 | 0.3984 | 0.3871 |

### NRFI/nrfi

| Segment | N | AUC | Actual Rate | Pred Mean |
|---------|---|-----|-------------|-----------|
| conf_Q1_low | 486 | 0.4887 | 0.4733 | 0.3683 |
| conf_Q2 | 486 | 0.4944 | 0.5144 | 0.4609 |
| conf_Q3 | 486 | 0.4917 | 0.5123 | 0.5162 |
| conf_Q4 | 486 | 0.4723 | 0.4691 | 0.5681 |
| conf_Q5_high | 486 | 0.5592 | 0.5206 | 0.6525 |
| month_Apr | 395 | 0.5178 | 0.4810 | 0.5026 |
| month_Aug | 422 | 0.5129 | 0.4834 | 0.5165 |
| month_Jul | 371 | 0.4797 | 0.5202 | 0.5143 |
| month_Jun | 396 | 0.5132 | 0.5227 | 0.5217 |
| month_Mar | 62 | 0.4681 | 0.5968 | 0.5156 |
| month_May | 410 | 0.4906 | 0.5195 | 0.5044 |
| month_Sep | 374 | 0.5351 | 0.4439 | 0.5199 |

## Phase 2F — ROI Backtest Plan

### Conditional Markets (Need Odds Data First)

- **F5_TeamTotals/away_over_1.5**: Shows signal but cannot proceed without market odds
- **F5_TeamTotals/away_over_3.0**: Shows signal but cannot proceed without market odds

**Next steps:**
1. Add `totals_1st_5_innings` and `h2h_1st_1_innings` to odds collection
2. After 1 month of odds data, re-run this audit with market baseline
3. If model prob beats market implied prob in MAE/Brier, proceed to ROI backtest


---

*Report generated by phase2_deep_audit.py on 2026-02-10 13:46*