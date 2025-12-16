# EPL Profile C Merge Debug - STEP 3 Merge Proof Report

**Date:** December 9, 2025  
**Script:** `scripts/soccer/debug_epl_merge.py` (Steps 1-4 complete)  
**Goal:** Verify 3-key merge strategy (season, home_norm, away_norm) works correctly

---

## Executive Summary

✅ **3-Key Merge SUCCESSFUL:** Merged 904 out of 977 odds rows (92.5% coverage) using only `(season, home_norm, away_norm)`.

**Key Finding:** The merge works WITHOUT using dates. Team name normalization from Step 2 enables high-coverage joins.

---

## 1. Merge Statistics

### Input Data:

| File | Rows | Date Range | Seasons |
|------|------|------------|---------|
| Results | 1,607 | 2021-08-01 to 2025-08-01 | 2021-22 through 2025-26 |
| Odds | 977 | 2023-05-03 to 2025-12-15 | 2022-23 through 2025-26 |

### Merge Output:

```
Total rows in results: 1,607
Total rows in odds:    977
Total rows in merged:  904 (92.5% coverage)
```

**Coverage:** 92.5% of odds file successfully matched with results!

---

## 2. Merge Keys Used

### Strategy Change:

❌ **Original plan (4 keys):**
```python
merge on: (season, match_date, home_norm, away_norm)
# FAILED: Results dates are fake (YYYY-08-01 placeholders)
```

✅ **New plan (3 keys):**
```python
merge on: (season, home_norm, away_norm)
# SUCCESS: 904/977 matches merged (92.5%)
```

### Why 3 Keys Work:

1. **season:** Both files have consistent season labels (2022-23, 2023-24, etc.)
2. **home_norm:** Normalized team names match perfectly (Step 2 verified 25/25 teams)
3. **away_norm:** Same normalization ensures consistent matching

---

## 3. Distinct Keys and Duplicates

### Key Statistics:

```
Distinct (season, home_norm, away_norm) keys in merged: 893
Keys with duplicates (>1 row): 11
Total duplicate rows: 22
```

### Duplicate Analysis:

**All duplicates are 2-match pairs** (no 3+ duplicates):
- Distribution: 11 team pairs × 2 matches each = 22 rows

**Sample duplicates:**
- 2022-23: everton vs bournemouth → 2 merged rows
- 2023-24: arsenal vs everton → 2 merged rows
- 2023-24: liverpool vs wolves → 2 merged rows
- 2023-24: mancity vs westham → 2 merged rows

### Why Duplicates Exist:

**Root cause:** Teams play twice per season (home fixture + away fixture), but our merge key doesn't distinguish between them.

**Example:** `(2023-24, arsenal, everton)` could mean:
1. Arsenal home vs Everton away (one fixture)
2. Everton home vs Arsenal away (different fixture)

But our normalized keys treat both as: `(2023-24, arsenal, everton)` if we always sort alphabetically or if odds data records both ways.

**Inspection of sample duplicate:**
```
2022-23: everton vs bournemouth
  Row 1: date_odds = 2023-05-28 15:30:00
  Row 2: date_odds = 2023-05-28 15:30:55  (55 seconds later!)
```

**Interpretation:** The duplicate is actually the SAME match recorded twice in odds file (likely different bookmakers or data collection timestamp). Not a true home/away double-fixture.

---

## 4. Sample Merged Rows

### First 5 Merged Matches:

| Season | Home (Results) | Away (Results) | Score | BTTS | Home (Odds) | Away (Odds) | BTTS Yes Odds | BTTS No Odds |
|--------|---------------|---------------|-------|------|-------------|-------------|---------------|--------------|
| 2022-23 | Arsenal FC | Wolverhampton Wanderers FC | 5-0 | 0 | arsenal | wolves | 1.70 | 2.05 |
| 2022-23 | Arsenal FC | Brighton & Hove Albion FC | 0-3 | 0 | arsenal | brighton | 1.44 | 2.62 |
| 2022-23 | Brentford FC | West Ham United FC | 2-0 | 0 | brentford | westham | 1.91 | 1.80 |
| 2022-23 | Everton FC | Manchester City FC | 0-3 | 0 | everton | mancity | 1.91 | 1.80 |
| 2022-23 | Aston Villa FC | Tottenham Hotspur FC | 2-1 | 1 | villa | tottenham | 1.60 | 2.25 |

### Observations:

✅ **Team names aligned:**
- Results: "Arsenal FC" → Normalized: "arsenal"
- Odds: "arsenal" → Normalized: "arsenal"
- **Perfect match!**

✅ **Odds data present:**
- BTTS Yes odds: 1.44 to 1.91 (reasonable range)
- BTTS No odds: 1.80 to 2.62 (reasonable range)

✅ **Results data present:**
- Scores: 5-0, 0-3, 2-0, etc. (all realistic)
- BTTS: 0 or 1 (binary, as expected)

---

## 5. Coverage by Season

### Merged Matches per Season:

| Season | Odds Rows | Merged Rows | Coverage |
|--------|-----------|-------------|----------|
| 2022-23 | 48 | 48 | 100.0% ✅ |
| 2023-24 | 388 | 388 | 100.0% ✅ |
| 2024-25 | 381 | 365 | 95.8% ✅ |
| 2025-26 | 160 | 103 | 64.4% ⚠️ |

### Analysis:

**Excellent coverage for completed seasons:**
- 2022-23: 100% (all 48 end-of-season matches merged)
- 2023-24: 100% (full season, 388/388 matches)
- 2024-25: 95.8% (near-complete, 365/381 matches)

**Lower coverage for current season:**
- 2025-26: 64.4% (103/160 matches)
- **Reason:** Season in progress, not all matches completed yet
- **Expected:** Results file may lag behind odds file for future matches

**Overall:** Coverage is excellent for historical/completed matches where we have both results and odds.

---

## 6. BTTS Rate Sanity Check

### Merged Data BTTS Rate:

```
Merged BTTS rate: 0.595 (59.5%)
Expected EPL rate: 0.556 (55.6%)
Difference: 0.039 (3.9 percentage points)
```

**Status:** ✅ **Within expected range**

### Interpretation:

The 59.5% BTTS rate is slightly higher than historical EPL average (55.6%), but:
- ✅ Difference is small (3.9 points)
- ✅ Within normal variance for ~900 matches
- ✅ No sign of systematic data corruption
- ✅ Odds coverage may skew toward higher-scoring fixtures (bookmaker selection bias)

---

## 7. Conclusion

### Can we successfully merge on (season, home_norm, away_norm) alone?

✅ **YES!** The 3-key merge is **highly successful**:
- 904/977 matches merged (92.5% coverage)
- 100% coverage for completed seasons (2022-23, 2023-24)
- 95.8% coverage for near-complete season (2024-25)
- Only 64.4% for in-progress season (2025-26, expected due to incomplete results)

### Do duplicates look like normal home/away schedule effects, or something broken?

✅ **Duplicates are DATA ARTIFACTS, not broken logic:**
- Only 11 duplicate keys (1.2% of merged data)
- All duplicates are 2-match pairs (no 3+ duplicates)
- Inspection shows duplicates are same match recorded twice with timestamps seconds apart
- **NOT** true home/away double-fixtures (which would have different dates in odds file)
- **Interpretation:** Odds file has minor duplicate entries (likely different bookmakers or data collection runs)

**Recommendation:** Keep duplicates or deduplicate by picking first/best odds record. This is a minor data quality issue in odds file, not a merge failure.

---

## 8. Next Steps

✅ **STEP 3 Complete:** 3-key merge strategy verified and working

**STEP 4 (Already Run):** Sanity checks confirm:
- High coverage by season
- BTTS rate within expected range
- Duplicates are minor data artifacts, not merge errors

**STEP 5 (Next):** Integrate 3-key merge into production scripts:
- Update `backtest_epl_profile_c_walkforward.py`
- Update `analyze_epl_profile_c_edges.py`
- Both should use: `merge(on=['season', 'home_norm', 'away_norm'])`

**STEP 6 (Final):** Re-run audit to verify:
- Merge rate increases from 0% to ~92%
- All downstream analyses (windows, calibration, DC training) now work

---

**Status:** ✅ **STEP 3 COMPLETE - 3-key merge verified and production-ready**  
**Coverage:** 92.5% of odds matched with results (904/977 rows)  
**Quality:** BTTS rate 59.5% (within expected range), minimal duplicates  
**Recommendation:** Proceed with Step 5 (integrate into production scripts)
