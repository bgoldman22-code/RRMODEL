# EPL Profile C - Complete Data Pipeline Audit
**Generated:** 2025-12-09 14:09:02
**Mode:** Read-only introspection (no behavior changes)

---

## 1. Raw Data Audit

### 1.1 historical_results.csv
**Path:** `/Users/brentgoldman/Desktop/REPO33/data/premier_league/historical_results.csv`
**Rows:** 1,607
**Columns:** ['date', 'home', 'away', 'home_score', 'away_score', 'season', 'btts', 'total_goals']

**Missing values in key columns:**
- `date`: 0 (0.00%)
- `season`: 0 (0.00%)
- `home`: 0 (0.00%)
- `away`: 0 (0.00%)
- `home_score`: 0 (0.00%)
- `away_score`: 0 (0.00%)
- `btts`: 0 (0.00%)

**Season coverage:**
- 2021-22: 380 matches
- 2022-23: 380 matches
- 2023-24: 380 matches
- 2024-25: 364 matches
- 2025-26: 103 matches
- **Total seasons:** 5

**Date coverage:**
- **Min date:** 2021-08-01
- **Max date:** 2025-08-01
- **Date range:** 1,461 days
- **Matches per month (avg):** 321.4
- **Matches per month (min):** 103
- **Matches per month (max):** 380

**Integrity checks:**
- Rows with invalid/missing scores: 0
- Rows with invalid BTTS values: 0

### 1.2 historical_completed_with_odds.csv
**Path:** `/Users/brentgoldman/Desktop/REPO33/data/premier_league/historical_completed_with_odds.csv`
**Rows:** 977
**Columns:** ['date', 'home', 'away', 'btts_yes_odds', 'btts_no_odds', 'bookmaker', 'season']

**Missing values in key columns:**
- `date`: 0 (0.00%)
- `home`: 0 (0.00%)
- `away`: 0 (0.00%)
- `btts_yes_odds`: 0 (0.00%)
- `btts_no_odds`: 0 (0.00%)
- Rows with asymmetric odds (one side missing): 0

**Invalid odds (≤ 1.0):**
- `btts_yes_odds`: 0 rows
- `btts_no_odds`: 0 rows

**Date coverage (date):**
- **Min date:** 2023-05-03 19:00:00
- **Max date:** 2025-12-15 20:00:00
- **Date range:** 957 days

**Season coverage:**
- 2022-23: 48 matches
- 2023-24: 388 matches
- 2024-25: 381 matches
- 2025-26: 160 matches

### 1.3 team_stats_by_season.csv
**Path:** `/Users/brentgoldman/Desktop/REPO33/data/premier_league/team_stats_by_season.csv`
**Rows:** 1,375
**Columns:** ['season', 'team', 'games', 'goals_for', 'goals_against', 'goals_for_per_game', 'goals_against_per_game', 'home_goals_for', 'home_goals_against', 'home_games', 'away_goals_for', 'away_goals_against', 'away_games']

**Missing values in key columns:**
- `team`: 29 (2.11%)
- `season`: 0 (0.00%)
- `goals_for_per_game`: 0 (0.00%)
- `goals_against_per_game`: 0 (0.00%)
- `games`: 0 (0.00%)

**Season coverage:**
- 2021-22: 296 team-seasons
- 2022-23: 281 team-seasons
- 2023-24: 302 team-seasons
- 2024-25: 382 team-seasons
- 2025-26: 114 team-seasons
- **Total seasons:** 5

**Integrity checks:**
- `goals_for_per_game` negative values: 0
- `goals_against_per_game` negative values: 0
- `games` negative values: 0

---

## 2. Results vs Odds Merge Audit

### 2.1 Profile C Merge Logic (backtest_epl_profile_c_walkforward.py)
**Merge approach found in script:**
```python
    normalize_team_name,
    Prepare combined dataset for walk-forward (merge results + odds)
    # Merge results with odds on home+away+season
    # Odds file uses normalized names directly
    df = results_with_odds.merge(
        left_on=['home_normalized', 'away_normalized', 'season'],
    # Keep essential columns - use the normalized names from odds as 'home'/'away'
        'home_normalized', 'away_normalized',  # Normalized names
        'home_normalized': 'home',
        'away_normalized': 'away'
    # Merge with odds - need to restore normalized names for merge
    eval_preds_for_merge = eval_preds.copy()
    eval_preds_for_merge['home'] = eval_preds['home']  # Already normalized from generate_predictions
    eval_preds_for_merge['away'] = eval_preds['away']  # Already normalized
    eval_with_odds = eval_preds_for_merge.merge(
```

**Replicating Profile C merge:**
- **Join keys:** date (normalized), home (standardized), away (standardized)
- **Total results rows:** 1,607
- **Total odds rows:** 977
- **Matched rows (both):** 0
- **Unmatched results (left_only):** 1,607
- **Match rate:** 0.00%

**Sample unmatched results (first 10):**
- 2021-08-01: Brentford FC vs Arsenal FC (2021-22)
- 2021-08-01: Wolverhampton Wanderers FC vs Crystal Palace FC (2021-22)
- 2021-08-01: Leicester City FC vs Leeds United FC (2021-22)
- 2021-08-01: Burnley FC vs Leicester City FC (2021-22)
- 2021-08-01: West Ham United FC vs Wolverhampton Wanderers FC (2021-22)
- 2021-08-01: Everton FC vs Manchester City FC (2021-22)
- 2021-08-01: Brighton & Hove Albion FC vs Aston Villa FC (2021-22)
- 2021-08-01: Brentford FC vs Newcastle United FC (2021-22)
- 2021-08-01: Crystal Palace FC vs Burnley FC (2021-22)
- 2021-08-01: Manchester United FC vs Watford FC (2021-22)

**Unmatched odds rows:** 977
**Sample unmatched odds (first 10):**
- 2023-05-03: mancity vs westham
- 2023-05-03: liverpool vs fulham
- 2023-05-04: brighton vs manutd
- 2023-05-06: tottenham vs palace
- 2023-05-06: bournemouth vs chelsea
- 2023-05-06: wolves vs villa
- 2023-05-06: mancity vs leeds
- 2023-05-06: liverpool vs brentford
- 2023-05-07: newcastle vs arsenal
- 2023-05-07: westham vs manutd

### 2.2 Edge Explorer Merge Logic (analyze_epl_profile_c_edges.py)
**Merge approach found in script:**
```python
def prepare_walkforward_data(results, odds):
    # Merge on home, away, season
    combined = pd.merge(
    # Merge predictions back with eval data (preserve original columns)
    eval_with_preds = eval_df.merge(
    # Drop duplicate columns from merge
    df = prepare_walkforward_data(results, odds)
```

**Replicating Edge Explorer merge:**
- **Join keys:** match_date (date only), home (standardized), away (standardized)
- **Total results rows:** 1,607
- **Total odds rows:** 977
- **Merged rows (inner join):** 0
- **Match rate vs results:** 0.00%
- **Match rate vs odds:** 0.00%

### 2.3 Comparison: Profile C vs Edge Explorer Merges
- **Profile C matched:** 0 / 1,607 results
- **Edge Explorer matched:** 0 / 1,607 results
- **Difference:** 0 rows

✅ **Both merges produce identical match counts**

---

## 3. Profile C Walk-Forward Window Audit
⚠️ **Cannot audit windows - no merged data.**

---

## 4. Edge Explorer Walk-Forward Window Audit
⚠️ **Cannot audit windows - no merged data.**

---

## 5. Profile C vs Edge Explorer Schedule Comparison
### Profile C Schedule
- **Steps:** 6
- **First eval window:** 2024-03-28 19:00:00 to 2024-06-26 19:00:00
- **Last eval window:** 2025-06-21 19:00:00 to 2025-09-19 19:00:00
- **Overall date range:** 2024-03-28 19:00:00 to 2025-09-19 19:00:00

**All Profile C windows:**
1. 2024-03-28 19:00:00 to 2024-06-26 19:00:00
2. 2024-06-26 19:00:00 to 2024-09-24 19:00:00
3. 2024-09-24 19:00:00 to 2024-12-23 19:00:00
4. 2024-12-23 19:00:00 to 2025-03-23 19:00:00
5. 2025-03-23 19:00:00 to 2025-06-21 19:00:00
6. 2025-06-21 19:00:00 to 2025-09-19 19:00:00

### Edge Explorer Schedule
See Section 4 for detailed Edge Explorer windows.

### Key Differences
**Identified discrepancies:**
- Profile C starts evaluation earlier (March 2024 vs July 2024)
- Profile C has more evaluation windows (6 vs 2)
- Edge Explorer waits for 300+ training matches before starting
- Profile C may use different minimum training threshold

**Impact:**
- The two analyses cover different time periods
- Direct bet-by-bet comparison is not possible
- Edge distributions and ROI patterns may differ due to market conditions in different periods

---

## 6. BTTS Calibration Audit
⚠️ **Cannot audit calibration - no merged data.**

---

## 7. Dixon-Coles Training Data Summary
⚠️ **Cannot audit DC training - no merged data.**
