# EPL Profile C Merge Debug - STEP 1 Report

**Date:** December 9, 2025  
**Script:** `scripts/soccer/debug_epl_merge.py`  
**Goal:** Inspect raw team names and dates to understand why merges are failing

---

## Executive Summary

✅ **Step 1 Complete:** Successfully inspected both data files and identified the root cause of merge failure.

**Key Finding:** **ZERO exact team name matches** between results and odds files.

---

## Data Files Loaded

| File | Rows | Path |
|------|------|------|
| Results | 1,607 | `data/premier_league/historical_results.csv` |
| Odds | 977 | `data/premier_league/historical_completed_with_odds.csv` |

---

## 1. Team Names Analysis

### Results File Format (Long Official Names):

```
1. AFC Bournemouth
2. Arsenal FC
3. Aston Villa FC
4. Brentford FC
5. Brighton & Hove Albion FC
6. Burnley FC
7. Chelsea FC
8. Crystal Palace FC
9. Everton FC
10. Fulham FC
11. Ipswich Town FC
12. Leeds United FC
13. Leicester City FC
14. Liverpool FC
15. Luton Town FC
16. Manchester City FC
17. Manchester United FC
18. Newcastle United FC
19. Norwich City FC
20. Nottingham Forest FC
21. Sheffield United FC
22. Southampton FC
23. Sunderland AFC
24. Tottenham Hotspur FC
25. Watford FC
26. West Ham United FC
27. Wolverhampton Wanderers FC
```

**Characteristics:**
- Full official club names
- Includes suffixes: "FC", "AFC", "United", "City"
- Mixed case
- Special characters: "&" (Brighton & Hove Albion)
- Length: 10-25 characters

### Odds File Format (Short Normalized Names):

```
1. arsenal
2. bournemouth
3. brentford
4. brighton
5. burnley
6. chelsea
7. everton
8. forest (Nottingham Forest)
9. fulham
10. ipswich
11. leeds
12. leicester
13. liverpool
14. luton
15. mancity (Manchester City)
16. manutd (Manchester United)
17. newcastle
18. palace (Crystal Palace)
19. sheffield (Sheffield United)
20. southampton
21. sunderland
22. tottenham
23. villa (Aston Villa)
24. westham (West Ham)
25. wolves (Wolverhampton)
```

**Characteristics:**
- Short, abbreviated names
- All lowercase
- No suffixes
- No special characters
- Length: 5-11 characters

### Comparison Result:

**❌ ZERO exact name matches** between the two files.

This is the **primary reason** why merges are producing 0 rows.

---

## 2. Example Mappings Needed

To merge successfully, we need normalization that maps:

| Results (Long) | Odds (Short) | Required Mapping |
|----------------|--------------|------------------|
| Manchester City FC | mancity | Remove "FC", extract "City" → "mancity" |
| Manchester United FC | manutd | Remove "FC", "United" → "manutd" |
| Arsenal FC | arsenal | Remove "FC", lowercase |
| Brighton & Hove Albion FC | brighton | Remove "& Hove Albion FC" |
| Wolverhampton Wanderers FC | wolves | Extract nickname "Wolves" |
| Nottingham Forest FC | forest | Extract "Forest" |
| Crystal Palace FC | palace | Extract "Palace" |
| West Ham United FC | westham | Extract "West Ham" → "westham" |
| Aston Villa FC | villa | Extract "Villa" |
| AFC Bournemouth | bournemouth | Remove "AFC" |
| Tottenham Hotspur FC | tottenham | Remove "Hotspur FC" |

---

## 3. Date Columns Analysis

### Results File - `date` column:

- **Type:** `object` (string)
- **Format:** `YYYY-MM-DD` (e.g., "2021-08-01")
- **Range:** 2021-08-01 to 2025-08-01
- **Time component:** None (date only)
- **Timezone:** None

### Odds File - `date` column:

- **Type:** `object` (string)
- **Format:** `YYYY-MM-DD HH:MM:SS+00:00` (e.g., "2023-05-03 19:00:00+00:00")
- **Range:** 2023-05-03 to 2025-12-15
- **Time component:** Yes (kickoff time)
- **Timezone:** UTC (+00:00)

### Date Overlap:

| File | Start | End | Coverage (days) |
|------|-------|-----|----------------|
| Results | 2021-08-01 | 2025-08-01 | 1,461 days |
| Odds | 2023-05-03 | 2025-12-15 | 957 days |

**⚠️ Gap:** Odds start **640 days (21 months)** after results begin.

**Implications:**
- No odds available for 2021-22 season (380 matches)
- Limited odds for 2022-23 season (only 48 matches from May onwards)
- Full odds coverage from 2023-24 onwards

**✅ Good news:** Both can be parsed to datetime and normalized to date-only for matching.

---

## 4. Season Coverage

### Results Seasons:

| Season | Matches |
|--------|---------|
| 2021-22 | 380 |
| 2022-23 | 380 |
| 2023-24 | 380 |
| 2024-25 | 364 |
| 2025-26 | 103 |
| **Total** | **1,607** |

### Odds Seasons:

| Season | Matches |
|--------|---------|
| 2022-23 | 48 (partial, from May 2023) |
| 2023-24 | 388 |
| 2024-25 | 381 |
| 2025-26 | 160 |
| **Total** | **977** |

### Season Overlap:

✅ **Common seasons:** 2022-23, 2023-24, 2024-25, 2025-26

**Expected merge coverage:** ~900 matches (out of 977 odds, excluding early 2021-22)

---

## 5. Root Cause Analysis

### Why Merge is Failing:

**Primary Issue: Team Name Mismatch**

```
Results: "Manchester City FC" vs Odds: "mancity"  → NO MATCH
Results: "Arsenal FC" vs Odds: "arsenal"         → NO MATCH  
Results: "Brighton & Hove Albion FC" vs Odds: "brighton" → NO MATCH
```

**Impact:** 0% merge rate (0 out of 1,607 results matched)

### Secondary Issues (Minor):

1. **Date format difference:**
   - Results: "2021-08-01" (date only)
   - Odds: "2023-05-03 19:00:00+00:00" (datetime with timezone)
   - **Solution:** Normalize both to date-only with `.dt.date`

2. **Coverage gap:**
   - No odds for first 640 days of results
   - **Solution:** Accept that early matches won't merge (expected behavior)

---

## 6. Initial Hypothesis

### Why This Happened:

The odds file (`historical_completed_with_odds.csv`) was likely created by:
1. Fetching data from a betting API (e.g., The Odds API)
2. Using the API's short team names directly ("mancity", "arsenal")
3. Not normalizing to match the results file's official names

The results file (`historical_results.csv`) uses:
- Official club names from a football data source
- Full names with "FC", "United", "City" suffixes

### Solution Required:

Create a **canonical normalization function** that:
1. Takes both formats as input
2. Maps them to a shared short form (e.g., "mancity")
3. Handles all 27 unique EPL teams in the dataset
4. Is bidirectional: results → short AND odds → short

---

## 7. Next Steps (STEP 2)

1. ✅ Search for existing normalization in repo (Bundesliga, other scripts)
2. ✅ Create `team_name_utils.py` with `standardize_team_name()` function
3. ✅ Map all 27 teams to canonical short forms
4. ✅ Test normalization on both files
5. ✅ Verify normalized names overlap

---

## Appendix: Raw Data Samples

### Results File - First 10 Rows (date, home, away):

```
1. 2021-08-01: Brentford FC vs Arsenal FC
2. 2021-08-01: Wolverhampton Wanderers FC vs Crystal Palace FC
3. 2021-08-01: Leicester City FC vs Leeds United FC
4. 2021-08-01: Burnley FC vs Leicester City FC
5. 2021-08-01: West Ham United FC vs Wolverhampton Wanderers FC
6. 2021-08-01: Everton FC vs Manchester City FC
7. 2021-08-01: Brighton & Hove Albion FC vs Aston Villa FC
8. 2021-08-01: Brentford FC vs Newcastle United FC
9. 2021-08-01: Crystal Palace FC vs Burnley FC
10. 2021-08-01: Manchester United FC vs Watford FC
```

### Odds File - First 10 Rows (date, home, away):

```
1. 2023-05-03 19:00:00+00:00: mancity vs westham
2. 2023-05-03 19:00:00+00:00: liverpool vs fulham
3. 2023-05-04 19:00:00+00:00: brighton vs manutd
4. 2023-05-06 14:00:00+00:00: tottenham vs palace
5. 2023-05-06 14:00:00+00:00: bournemouth vs chelsea
6. 2023-05-06 14:00:00+00:00: wolves vs villa
7. 2023-05-06 14:00:00+00:00: mancity vs leeds
8. 2023-05-06 16:30:00+00:00: liverpool vs brentford
9. 2023-05-07 15:30:00+00:00: newcastle vs arsenal
10. 2023-05-07 18:00:00+00:00: westham vs manutd
```

---

**Status:** ✅ **STEP 1 COMPLETE**  
**Outcome:** Root cause identified (team name mismatch)  
**Next:** STEP 2 - Build canonical normalization function
