# EPL Profile C Merge Debug - STEP 2 Report

**Date:** December 9, 2025  
**Script:** `scripts/soccer/debug_epl_merge.py` (updated), `scripts/soccer/team_name_utils.py` (new)  
**Goal:** Build canonical team name normalization and verify it works on both files

---

## Executive Summary

✅ **Step 2 Complete:** Successfully created and tested `standardize_team_name()` function.

**Key Finding:** **25 out of 25 unique teams** in odds file now match normalized results teams.

---

## 1. Created Module: `team_name_utils.py`

Created a new standalone module at:
```
RRMODEL/scripts/soccer/team_name_utils.py
```

### Function Signature:

```python
def standardize_team_name(name: str) -> str:
    """
    Normalize team names for consistent matching between results and odds files.
    
    Examples:
        "Manchester City FC" → "mancity"
        "mancity" → "mancity"
        "Brighton & Hove Albion FC" → "brighton"
        "brighton" → "brighton"
    """
```

### Implementation Strategy:

**3-tier normalization approach:**

1. **Direct mappings (130+ entries):** Highest priority, handles exact matches
   - Results format: "Manchester City FC" → "mancity"
   - Odds format: "mancity" → "mancity" (pass-through)
   - Alternate forms: "Man City" → "mancity"

2. **Algorithmic cleanup:** Regex-based suffix removal
   - Remove: " FC", " AFC", " United", " City", " Hotspur", " Town"
   - Remove: "& Hove Albion", "and ..."
   - Remove all spaces

3. **Fallback mappings:** Secondary lookup for edge cases
   - "manchester" → "mancity"
   - "wolverhamptonwanderers" → "wolves"
   - etc.

---

## 2. Example Mappings

### Results File → Normalized:

| Original (Results) | Normalized |
|-------------------|------------|
| Manchester City FC | mancity |
| Manchester United FC | manutd |
| Arsenal FC | arsenal |
| Brighton & Hove Albion FC | brighton |
| Wolverhampton Wanderers FC | wolves |
| Nottingham Forest FC | forest |
| Crystal Palace FC | palace |
| West Ham United FC | westham |
| Aston Villa FC | villa |
| Leicester City FC | leicester |
| Brentford FC | brentford |
| Liverpool FC | liverpool |
| Chelsea FC | chelsea |
| Tottenham Hotspur FC | tottenham |
| Newcastle United FC | newcastle |

### Odds File → Normalized:

| Original (Odds) | Normalized |
|-----------------|------------|
| mancity | mancity ✅ (pass-through) |
| manutd | manutd ✅ |
| arsenal | arsenal ✅ |
| brighton | brighton ✅ |
| wolves | wolves ✅ |
| forest | forest ✅ |
| palace | palace ✅ |
| westham | westham ✅ |
| villa | villa ✅ |
| leicester | leicester ✅ |
| brentford | brentford ✅ |
| liverpool | liverpool ✅ |
| chelsea | chelsea ✅ |
| tottenham | tottenham ✅ |
| newcastle | newcastle ✅ |

**Result:** Odds file names pass through unchanged (already in canonical form).

---

## 3. Normalization Test Results

### Coverage:

- **Results file unique teams (normalized):** 27
- **Odds file unique teams (normalized):** 25
- **Common teams (overlap):** **25 out of 25** ✅

**100% of odds teams** now match results teams after normalization!

### Common Teams (Alphabetical):

```
arsenal, bournemouth, brentford, brighton, burnley, chelsea, everton, 
forest, fulham, ipswich, leeds, leicester, liverpool, luton, mancity, 
manutd, newcastle, palace, sheffieldutd, southampton, sunderland, 
tottenham, villa, westham, wolves
```

### Teams in Results Only (No Odds):

1. **norwich** - Not in odds file (relegated before odds coverage started)
2. **watford** - Not in odds file (relegated before odds coverage started)

**Explanation:** Odds coverage starts 2023-05-03, after Norwich and Watford were relegated.

---

## 4. Frequency Analysis

### Top 20 Teams by Appearances (Normalized):

**Results File:**
```
1.  liverpool:       163 appearances
2.  tottenham:       163 appearances
3.  wolves:          163 appearances
4.  westham:         162 appearances
5.  arsenal:         161 appearances
6.  mancity:         161 appearances
7.  chelsea:         160 appearances
8.  villa:           160 appearances
9.  brentford:       160 appearances
10. manutd:          160 appearances
11. brighton:        160 appearances
12. newcastle:       159 appearances
13. palace:          157 appearances
14. everton:         157 appearances
15. fulham:          124 appearances
16. forest:          124 appearances
17. bournemouth:     122 appearances
18. leicester:       114 appearances
19. southampton:     112 appearances
20. burnley:          87 appearances
```

**Odds File:**
```
1.  mancity:         99 appearances
2.  brighton:        99 appearances
3.  bournemouth:     99 appearances
4.  manutd:          99 appearances
5.  chelsea:         99 appearances
6.  tottenham:       98 appearances
7.  newcastle:       98 appearances
8.  westham:         98 appearances
9.  everton:         98 appearances
10. liverpool:       98 appearances
11. palace:          97 appearances
12. arsenal:         97 appearances
13. brentford:       97 appearances
14. villa:           97 appearances
15. fulham:          97 appearances
16. wolves:          97 appearances
17. forest:          96 appearances
18. burnley:         54 appearances
19. southampton:     42 appearances
20. leicester:       42 appearances
```

**Observations:**
- ✅ All top teams appear in both files with normalized names
- ✅ Frequency roughly proportional (odds has ~61% of results coverage due to later start date)
- ✅ Same canonical names used consistently ("mancity", "brighton", "manutd", etc.)

---

## 5. Evidence of Success

### Before Normalization (Step 1):

```
Exact name matches: 0
❌ NO EXACT MATCHES - This is why merge is failing!
```

### After Normalization (Step 2):

```
✅ Unique teams in results (normalized): 27
✅ Unique teams in odds (normalized): 25
✅ Common teams (should merge): 25
```

**Success rate:** 25/25 = **100% of odds teams** now matchable!

---

## 6. The `standardize_team_name()` Function

### Key Features:

1. **Bidirectional:** Works on both results and odds team names
2. **Idempotent:** Normalizing an already-normalized name returns the same value
   - `standardize_team_name("mancity")` → `"mancity"`
3. **Comprehensive:** 130+ direct mappings covering all variants
4. **Robust:** Fallback algorithm handles edge cases
5. **Reusable:** Single source of truth for all EPL BTTS scripts

### Coverage:

**All 27 EPL teams in results file:**
- ✅ Arsenal
- ✅ Aston Villa (Villa)
- ✅ Bournemouth
- ✅ Brentford
- ✅ Brighton & Hove Albion
- ✅ Burnley
- ✅ Chelsea
- ✅ Crystal Palace
- ✅ Everton
- ✅ Fulham
- ✅ Ipswich Town
- ✅ Leeds United
- ✅ Leicester City
- ✅ Liverpool
- ✅ Luton Town
- ✅ Manchester City
- ✅ Manchester United
- ✅ Newcastle United
- ✅ Norwich City (not in odds)
- ✅ Nottingham Forest
- ✅ Sheffield United
- ✅ Southampton
- ✅ Sunderland
- ✅ Tottenham Hotspur
- ✅ Watford (not in odds)
- ✅ West Ham United
- ✅ Wolverhampton Wanderers

---

## 7. Implementation Details

### Module Location:

```
RRMODEL/scripts/soccer/team_name_utils.py
```

### Usage Example:

```python
from team_name_utils import standardize_team_name

# Normalize results
results['home_norm'] = results['home'].apply(standardize_team_name)
results['away_norm'] = results['away'].apply(standardize_team_name)

# Normalize odds
odds['home_norm'] = odds['home'].apply(standardize_team_name)
odds['away_norm'] = odds['away'].apply(standardize_team_name)

# Now merge on normalized names
merged = results.merge(
    odds,
    left_on=['home_norm', 'away_norm', 'season'],
    right_on=['home_norm', 'away_norm', 'season'],
    how='inner'
)
```

### Backward Compatibility:

Added alias for existing code:
```python
normalize_team_name = standardize_team_name
```

---

## 8. Next Steps (STEP 3)

With team names now normalized and matching, we need to:

1. ✅ Add date normalization (both files → date-only format)
2. ✅ Test merge on a single "golden" match
3. ✅ Verify all join keys work correctly (season, match_date, home_norm, away_norm)

**Expected outcome:** At least one successful match between results and odds.

---

**Status:** ✅ **STEP 2 COMPLETE**  
**Outcome:** 100% of odds teams now matchable with results  
**Next:** STEP 3 - Normalize dates and prove a single match merges correctly
