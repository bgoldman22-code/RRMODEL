# Phase 2A — Data Schema & Leakage Audit

**Generated:** 2026-02-10 13:43
**Dataset:** features_v2.parquet
**Rows:** 9,720
**Columns:** 491
**Seasons:** [np.float64(2022.0), np.float64(2023.0), np.float64(2024.0), np.float64(2025.0)]

## Column Classification

| Category | Count |
|----------|-------|
| Production features | 253 |
| Label columns (leakage if used as input) | 16 |
| ID / meta columns | 3 |
| Suspicious (|corr| > 0.95 with label) | 0 |
| Total unsafe as feature | 9 |

## Label Distributions

### `label_home_runs`
- Count: 9,720 (null: 0)
- Mean: 4.4437, Median: 4.0, Std: 3.0834
- Range: [0.0, 22.0]

### `label_away_runs`
- Count: 9,720 (null: 0)
- Mean: 4.4252, Median: 4.0, Std: 3.2512
- Range: [0.0, 28.0]

### `label_total_runs`
- Count: 9,720 (null: 0)
- Mean: 8.8689, Median: 8.0, Std: 4.4789
- Range: [0.0, 33.0]

### `label_f5_home`
- Count: 9,720 (null: 0)
- Mean: 2.5969, Median: 2.0, Std: 2.4102
- Range: [0.0, 19.0]

### `label_f5_away`
- Count: 9,720 (null: 0)
- Mean: 2.3991, Median: 2.0, Std: 2.3326
- Range: [0.0, 25.0]

### `label_f5_total`
- Count: 9,720 (null: 0)
- Mean: 4.996, Median: 4.0, Std: 3.3448
- Range: [0.0, 28.0]

### `label_f5_home_win`
- Count: 8,201 (null: 1,519)
- Mean: 0.5297, Median: 1.0, Std: 0.4991
- Range: [0.0, 1.0]

### `label_home_sp_k`
- Count: 9,719 (null: 1)
- Mean: 4.978, Median: 5.0, Std: 2.5535
- Range: [0.0, 16.0]

### `label_away_sp_k`
- Count: 9,719 (null: 1)
- Mean: 4.6134, Median: 4.0, Std: 2.4466
- Range: [0.0, 16.0]

### `label_home_sp_outs`
- Count: 9,719 (null: 1)
- Mean: 15.7747, Median: 16.0, Std: 4.2629
- Range: [0.0, 27.0]

### `label_away_sp_outs`
- Count: 9,719 (null: 1)
- Mean: 15.3462, Median: 15.0, Std: 4.3502
- Range: [0.0, 27.0]

### `label_home_score`
- Count: 9,719 (null: 1)
- Mean: 4.4442, Median: 4.0, Std: 3.0832
- Range: [0.0, 22.0]

### `label_away_score`
- Count: 9,719 (null: 1)
- Mean: 4.4257, Median: 4.0, Std: 3.2511
- Range: [0.0, 28.0]

### `label_f5_home_score`
- Count: 9,719 (null: 1)
- Mean: 2.5972, Median: 2.0, Std: 2.4101
- Range: [0.0, 19.0]

### `label_f5_away_score`
- Count: 9,719 (null: 1)
- Mean: 2.3993, Median: 2.0, Std: 2.3326
- Range: [0.0, 25.0]

### `label_home_win`
- Count: 9,719 (null: 1)
- Mean: 0.5296, Median: 1.0, Std: 0.4991
- Range: [0.0, 1.0]

## F5 Totals Base Rates

| Line | Over % | Under % |
|------|--------|---------|
| over_3.5 | 62.1% | 37.9% |
| over_4.0 | 49.9% | 50.1% |
| over_4.5 | 49.9% | 50.1% |
| over_5.0 | 38.5% | 61.5% |
| over_5.5 | 38.5% | 61.5% |

## F5 Team Totals Base Rates

| Side | Line | Over % | Under % |
|------|------|--------|---------|
| home | over_1.5 | 59.4% | 40.6% |
| home | over_2.0 | 42.7% | 57.3% |
| home | over_2.5 | 42.7% | 57.3% |
| home | over_3.0 | 29.5% | 70.5% |
| away | over_1.5 | 56.2% | 43.8% |
| away | over_2.0 | 39.2% | 60.8% |
| away | over_2.5 | 39.2% | 60.8% |
| away | over_3.0 | 26.0% | 74.0% |

## NRFI / YRFI Data Status

- **First-inning scoring labels:** ❌ NOT AVAILABLE in features_v2.parquet
- **Required data source:** MLB Stats API `/game/{gamePk}/linescore` endpoint
- **TheOddsAPI markets available:** `h2h_1st_1_innings`, `totals_1st_1_innings`
- **Status:** Must fetch ~9,720 game linescores to create NRFI labels
- **Action:** Phase 2B will attempt to fetch first-inning scoring data

## Leakage Guardrails

The following columns are EXCLUDED from all feature matrices:

- `game_date`
- `game_pk`
- `label_f5_away`
- `label_f5_away_score`
- `label_f5_home`
- `label_f5_home_score`
- `label_f5_home_win`
- `label_f5_total`
- `season`