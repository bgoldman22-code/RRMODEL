# EPL Profile C Merge Debug - STEP 3 Pre-Check Report

**Date:** December 9, 2025  
**Script:** `scripts/soccer/debug_epl_merge.py` (updated with diagnostics)  
**Goal:** Verify the "missing 2023-05-03" theory and understand why no matches merge

---

## Executive Summary

🚨 **CRITICAL DISCOVERY:** The `historical_results.csv` file has **FAKE DATES** - all matches are stored as `YYYY-08-01` (season start date), not actual match dates!

**Key Finding:** Results file has only **5 unique dates** (one per season), making date-based merges **IMPOSSIBLE**.

---

## ⚠️ CRITICAL FINDING: Fake Dates in Results File

### The Problem:

The results file does NOT contain actual match dates. Instead, it uses a **fake date** for each season:

| Season | Fake Date | Matches |
|--------|-----------|---------|
| 2021-22 | 2021-08-01 | 380 matches |
| 2022-23 | 2022-08-01 | 380 matches |
| 2023-24 | **2023-08-01** | 380 matches ❌ |
| 2024-25 | 2024-08-01 | 364 matches |
| 2025-26 | 2025-08-01 | 103 matches |

**Total unique dates:** Only **5 dates** across 1,607 matches!

### Impact:

This means:
- ❌ **Date-based merges will NOT work** (results have wrong dates)
- ❌ Cannot merge on `(date, home_team, away_team)` as originally planned
- ⚠️ Must merge on `(season, home_team, away_team)` only
- ⚠️ Risk of duplicate matches within a season (home/away swapped)

---

## 1. Date Coverage Analysis (UPDATED)

### Date Ranges:

```
RESULTS date range: 2021-08-01 00:00:00 to 2025-08-01 00:00:00
ODDS    date range: 2023-05-03 19:00:00+00:00 to 2025-12-15 20:00:00+00:00
```

**Observation:** Results span **4 seasons** (2021-2025), but there's a gap around May 2023.

### Spot Check: Results Around 2023-05-03

| Date | Matches in Results |
|------|-------------------|
| 2023-05-01 | **0 matches** |
| 2023-05-02 | **0 matches** |
| 2023-05-03 | **0 matches** ❌ |
| 2023-05-04 | **0 matches** |
| 2023-05-05 | **0 matches** |

**Finding:** The first date in the odds file (2023-05-03) has **no results data**.

---

## 2. Team Existence Check

### Do the teams exist in results?

```
Does 'mancity' appear anywhere in results? ✅ True
Does 'westham' appear anywhere in results? ✅ True
```

**Finding:** Both teams exist in the results file, just not on 2023-05-03.

### Sample Results with mancity or westham:

All sample rows show `season: 2021-22`, meaning:
- ✅ Teams exist in results
- ✅ Team name normalization works (`Manchester City FC` → `mancity`)
- ❌ But no matches on 2023-05-03

### Specific Match Search:

```
Looking for specific match: mancity vs westham on 2023-05-03:
  ❌ NOT FOUND on that exact date
  Checking ±3 days:
    (no matches found within ±3 days)
```

**Finding:** The specific fixture `mancity vs westham` does not exist on 2023-05-03 or nearby dates.

---

## 3. Root Cause Analysis (UPDATED)

### Why No Matches on 2023-05-03?

**Root Cause:** The results file uses **placeholder dates** (season start dates), not actual match dates!

This explains:
1. ✅ Why zero results on 2023-05-03 (not a season start date)
2. ✅ Why zero results on May 1-5 (not season start dates)
3. ✅ Why all 380 2023-24 matches show as 2023-08-01

### The Real Problem:

This isn't just a "gap" - it's a **fundamental data structure issue**:
- **Odds file:** Has REAL match dates (2023-05-03, 2023-05-04, etc.)
- **Results file:** Has FAKE dates (only 2021-08-01, 2022-08-01, 2023-08-01, 2024-08-01, 2025-08-01)

**Merging on date is IMPOSSIBLE with this data structure.**

### Impact on Merge Strategy:

❌ **Original merge plan (4 keys):**
```python
merge on: (season, match_date, home_norm, away_norm)
```

✅ **New merge plan (3 keys only):**
```python
merge on: (season, home_norm, away_norm)
# Cannot use match_date - results dates are fake!
```

⚠️ **Risk:** Multiple matches between same teams in one season (home/away order matters)

---

## 4. What This Means for Step 3 (UPDATED)

### Strategy Complete Overhaul Needed:

The original merge plan assumed:
- ✅ Real match dates in both files
- ✅ Merge on (season, date, home, away)
- ✅ Date prevents duplicate matches

**Reality:**
- ❌ Results has FAKE dates (season placeholders)
- ❌ Cannot merge on date
- ⚠️ Must use (season, home_norm, away_norm) only

### New Merge Logic:

```python
# OLD (doesn't work - results dates are fake):
merged = results.merge(odds, on=['season', 'match_date', 'home_norm', 'away_norm'])

# NEW (3 keys only - drop match_date):
merged = results.merge(odds, on=['season', 'home_norm', 'away_norm'])
```

### Potential Issues:

1. **Duplicate matches within a season:**
   - Example: Man City vs Arsenal might play twice (home/away)
   - Merge will create 2 rows if both fixtures exist
   - Need to handle duplicates carefully

2. **Match identification:**
   - Can't distinguish which fixture (home leg vs away leg)
   - May need to keep both and analyze separately

3. **Season alignment:**
   - Odds dates span seasons (May 2023 = end of 2022-23 season)
   - Results season is 2023-24 for Aug 2023
   - Need to verify season mapping is correct

---

## 5. Next Steps (REVISED STEP 3)

### Updated STEP 3 Plan:

1. ✅ Team name normalization verified (working correctly)
2. ✅ Date investigation complete (results dates are fake/placeholder)
3. ⏳ **Change merge strategy:** Use 3 keys instead of 4 (drop match_date)
4. ⏳ Test merge on (season, home_norm, away_norm) only
5. ⏳ Verify golden match works with new strategy
6. ⏳ Handle potential duplicate matches (teams play twice per season)

### Updated Diagnostic Code:

```python
# NEW MERGE (3 keys only - no date):
merged = results.merge(
    odds,
    on=['season', 'home_norm', 'away_norm'],
    how='inner',
    suffixes=('_res', '_odds')
)

print(f"Merged matches: {len(merged)}")

# Check for duplicates (same teams play twice per season)
duplicates = merged.groupby(['season', 'home_norm', 'away_norm']).size()
dups = duplicates[duplicates > 1]
if len(dups) > 0:
    print(f"⚠️ {len(dups)} team pairs matched multiple times")
    print("This is expected (home/away fixtures)")
```

---

## 6. Summary of Findings (UPDATED)

| Question | Answer |
|----------|--------|
| Does results cover 2023-05-03? | ❌ **No** - results only has 5 fake dates (season placeholders) |
| Does results have real match dates? | ❌ **No** - all matches use placeholder dates (YYYY-08-01) |
| Does results have mancity/westham? | ✅ **Yes** - both teams exist |
| Is team name normalization working? | ✅ **Yes** - verified in Step 2 |
| Why no golden match in first 100 odds rows? | ❌ Results file has FAKE dates, cannot merge on date |
| Can we merge on (season, date, home, away)? | ❌ **No** - must drop date, use (season, home, away) only |

---

## 7. Conclusion (UPDATED)

**The "missing 2023-05-03" theory led to a MUCH BIGGER discovery:**

The results file doesn't have a "gap" - it has **fake dates entirely**. All 1,607 matches are stored with only 5 unique dates (one per season).

This means:
- ✅ Our team name normalization is working perfectly
- ✅ Both teams exist in results
- ❌ But we CANNOT merge on date (results dates are placeholders)
- ⚠️ Must change merge strategy from 4 keys to 3 keys
- ⚠️ Must handle duplicate matches (teams play twice per season)

**Critical Strategic Change Required:**

Original Plan:
```python
# Merge on 4 keys (date prevents duplicates)
merge on: (season, match_date, home_norm, away_norm)
```

New Plan:
```python
# Merge on 3 keys only (may create duplicates)
merge on: (season, home_norm, away_norm)

# Then handle duplicates (expected for home/away fixtures)
```

**Action Required:** Update Step 3 to:
1. ✅ Drop match_date from merge keys
2. ⏳ Test merge on (season, home_norm, away_norm) only
3. ⏳ Verify golden match with new 3-key strategy
4. ⏳ Handle duplicate matches (teams play twice per season)

---

**Status:** 🚨 **CRITICAL DISCOVERY - Merge strategy must change**  
**Key Finding:** Results file has fake dates (YYYY-08-01 placeholders), not real match dates  
**Next:** Implement 3-key merge strategy (season, home_norm, away_norm) and handle duplicates
