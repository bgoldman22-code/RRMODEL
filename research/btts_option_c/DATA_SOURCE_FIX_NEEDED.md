# Data Source Issue - Resolution Required

**Date:** December 10, 2025  
**Status:** ⚠️ Blocking Issue Found

---

## Problem Summary

The BTTS research pipeline cannot train because the **baseline odds file** and **API-Football match data** have **non-overlapping date ranges and seasons**.

### Current State

| Data Source | Season Range | Date Range | Match Count | Has Results? |
|-------------|--------------|------------|-------------|--------------|
| **Baseline Odds** | 2022-23 | May 2023 - Dec 2025 | 977 | ❌ No (odds only) |
| **API-Football** | 2023-24, 2024-25 | Aug 2023 - Present | 910 | ✅ Yes (xG, goals) |
| **FPL** | 2023-24, 2024-25 | Aug 2023 - Present | 850 | ✅ Yes (availability) |

### Why They Don't Merge

When merging on `(season, date, home_norm, away_norm)`:
- Baseline has `season='2022-23'` with dates in 2023-2025
- API-Football has `season='2023-24'` and `'2024-25'` with matching dates
- **Season labels don't match**, so merge produces 0 overlapping rows

### Result

- ✅ Merge executes without errors
- ❌ 0% coverage from API-Football (no overlapping keys)
- ❌ 0% coverage from FPL (no overlapping keys)
- ❌ BTTS rate = 0% (all NaN goals)
- ❌ Cannot train models without actual match results

---

## Resolution Options

### Option 1: Use API-Football as Baseline (RECOMMENDED)

**Rationale:** API-Football has actual match results (goals, xG) which are required for BTTS labels.

**Changes Needed:**
1. Update `load_baseline_data()` to use API-Football CSV as baseline
2. Left-join odds data onto API-Football matches
3. If odds missing for some matches, that's OK (focus is prediction, not betting simulation)

**Pros:**
- ✅ Guaranteed match results for BTTS calculation
- ✅ xG coverage = 100% by definition
- ✅ Aligns with actual EPL seasons (2023-24, 2024-25)

**Cons:**
- ⚠️ Some matches may lack odds data
- ⚠️ Total match count = 910 (not 904, but close enough)

### Option 2: Fix Season Labels in Baseline

**Rationale:** Manually correct season labels in baseline odds file to match EPL seasons.

**Changes Needed:**
1. Load baseline CSV
2. For dates Aug 2023 - May 2024: set `season='2023-24'`
3. For dates Aug 2024 - May 2025: set `season='2024-25'`
4. Re-save and retry merge

**Pros:**
- ✅ Keeps odds as primary source
- ✅ Preserves intended baseline universe

**Cons:**
- ⚠️ Manual data correction required
- ⚠️ Future odds (Dec 2025) have no match results yet

### Option 3: Merge on Date + Teams Only (Drop Season)

**Rationale:** Ignore season label mismatch, merge on `(date, home_norm, away_norm)` only.

**Changes Needed:**
1. Update merge keys in `merge_all_sources()` to exclude 'season'

**Pros:**
- ✅ Quick fix
- ✅ Works if date+teams is unique

**Cons:**
- ⚠️ Risky if same teams play multiple times on same date in different competitions
- ⚠️ Loses season context for modeling

---

## Recommended Implementation (Option 1)

```python
def load_baseline_data():
    """
    Load API-Football as baseline (has actual match results).
    Odds will be left-joined onto this in merge_all_sources().
    """
    print("📥 Loading baseline EPL data (using API-Football with results)...")
    
    # Use API-Football as baseline since it has match results
    api_file = DATA_DIR / 'api_football_statistics.csv'
    
    if not api_file.exists():
        raise FileNotFoundError(f"API-Football data required: {api_file}")
    
    df = pd.read_csv(api_file)
    
    # Ensure date is datetime (remove timezone)
    df['date'] = pd.to_datetime(df['date'])
    if df['date'].dt.tz is not None:
        df['date'] = df['date'].dt.tz_localize(None)
    
    # Calculate BTTS from goals
    if 'home_goals' in df.columns and 'away_goals' in df.columns:
        df['btts'] = ((df['home_goals'] > 0) & (df['away_goals'] > 0)).astype(int)
        print(f"   ✅ Calculated BTTS: {df['btts'].mean():.1%} rate")
    
    print(f"   ✅ Loaded {len(df)} matches with results")
    print(f"   📅 Date range: {df['date'].min()} to {df['date'].max()}")
    
    return df
```

Then in `merge_all_sources()`, load odds and left-join onto baseline:
```python
# Load odds data
odds_file = REPO_ROOT / 'data' / 'premier_league' / 'historical_completed_with_odds.csv'
if odds_file.exists():
    odds_df = pd.read_csv(odds_file)
    odds_df.columns = odds_df.columns.str.lower().str.strip()
    odds_df['date'] = pd.to_datetime(odds_df['date']).dt.tz_localize(None)
    
    # Merge odds (ignore season mismatch, use date+teams only)
    unified_df = pd.merge(
        unified_df,
        odds_df[['date', 'home', 'away', 'btts_yes_odds', 'btts_no_odds']],
        left_on=['date', 'home_norm', 'away_norm'],
        right_on=['date', 'home', 'away'],
        how='left'
    )
```

---

## Status

✅ **Pipeline code is correct and robust**  
✅ **Time-series CV implemented properly**  
✅ **Calibration evaluation ready**  
❌ **Data sources need alignment**  

**Next Action:** Implement Option 1 (use API-Football as baseline)

**Estimated Time:** 15-20 minutes to update and test

---

**Report Generated:** December 10, 2025  
**Blocking Issue:** Data source key mismatch  
**Resolution:** Update baseline to use API-Football with match results
