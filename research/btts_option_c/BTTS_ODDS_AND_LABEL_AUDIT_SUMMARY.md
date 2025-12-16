# BTTS Odds & Label Audit - Implementation Summary

**Date:** December 11, 2025  
**Status:** ✅ COMPLETE  
**Task Type:** Audit-only (no modeling changes)  

---

## Deliverables

### 1. Audit Script ✅
**File:** `scripts/audit_btts_odds_coverage.py`

Analyzes BTTS odds coverage in the unified dataset:
- Total matches
- Coverage by category (both/yes-only/no-only/neither)
- Summary statistics for Yes and No odds
- Vig analysis when both odds available

**Usage:**
```bash
cd research/btts_option_c
python scripts/audit_btts_odds_coverage.py
```

**Output:**
```
BTTS ODDS COVERAGE AUDIT
Total matches: 910

Both Yes & No odds present:   619 ( 68.0%)
Only Yes odds present:          0 (  0.0%)
Only No odds present:           0 (  0.0%)
Neither present:              291 ( 32.0%)

BTTS YES ODDS STATISTICS
Available:   619 matches (68.0%)
Min:        1.31
Max:        2.76
Mean:       1.72
Median:     1.69

BTTS NO ODDS STATISTICS
Available:   619 matches (68.0%)
Min:        1.49
Max:        3.68
Mean:       2.30
Median:     2.25

VIG ANALYSIS
Average vig (overround):  0.036 (3.6%)
```

---

### 2. Comprehensive Audit Report ✅
**File:** `BTTS_ODDS_AND_LABEL_AUDIT.md`

Complete documentation covering:

1. **Label Usage (BTTS Yes vs No)**
   - Label convention: `btts=1` (Yes), `btts=0` (No)
   - Model outputs: All models predict P(BTTS Yes)
   - Betting logic: Always bet BTTS Yes when `p >= threshold`
   - **No betting on BTTS No anywhere in codebase**

2. **Historical Odds Coverage**
   - 910 total matches
   - 619 (68%) have both Yes & No odds
   - When odds exist, both sides always present (no partial coverage)
   - Yes odds: mean 1.72, median 1.69
   - No odds: mean 2.30, median 2.25

3. **Fair Odds / Vig Removal Behavior**
   - Function: `compute_fair_yes_odds()` in `src/evaluate.py`
   - When both odds present: Removes vig via proportional scaling
   - When only Yes odds: Returns raw odds unchanged
   - When neither present: Returns NaN (no betting)
   - Average vig: 3.6% (competitive, likely Pinnacle)

4. **Code Locations Reference**
   - Complete mapping of label extraction locations
   - Model prediction code paths
   - Betting logic functions
   - Odds loading and vig removal

---

### 3. Helper Function ✅
**File:** `src/load_data.py` (added at end)

**Function:** `get_btts_odds_coverage_summary()`

Returns human-readable summary of:
- Total matches
- Odds coverage breakdown
- Label semantics reminder
- Betting strategy reminder

**Usage:**
```python
from src.load_data import get_btts_odds_coverage_summary
print(get_btts_odds_coverage_summary())
```

---

### 4. Audit Logging in Experiment Scripts ✅

**Modified files:**
- `RUN_TEMPORAL_HOLDOUT.py`
- `RUN_WALKFORWARD.py`

**Changes:** Added audit logging block after data loading:

```python
# AUDIT LOGGING: Document odds/label semantics
print("\n" + "="*80)
print("BTTS ODDS & LABEL AUDIT SUMMARY".center(80))
print("="*80)
from src.load_data import get_btts_odds_coverage_summary
print(get_btts_odds_coverage_summary())
print("="*80)
```

**Output in experiment runs:**
```
================================================================================
                     BTTS ODDS & LABEL AUDIT SUMMARY                          
================================================================================

BTTS Odds Coverage:
  Total matches: 910
  Both Yes & No odds: 619 (68.0%)
  Yes odds only: 0
  No odds only: 0
  Neither: 291
  
Label semantics: btts=1 (Yes), btts=0 (No)
Model predicts: P(BTTS = Yes)
Betting strategy: Bet 'Yes' when p >= threshold

================================================================================
```

---

## Key Findings

### ✅ Label Semantics (Clear & Consistent)
- `btts = 1` → BTTS Yes (both teams scored)
- `btts = 0` → BTTS No (at least one team didn't score)
- All models predict P(BTTS = Yes)
- Betting logic: Bet BTTS Yes when `p >= threshold`

### ✅ No Inverse Betting Logic
- **No code path bets on BTTS No**
- No inverse threshold logic (e.g., `if p <= 0.45, bet No`)
- When model confidence is low (`p < threshold`), we simply don't bet

### ✅ Odds Coverage (Good)
- 68% of matches have both Yes & No odds
- When odds exist, both sides are always present
- No partial coverage issues

### ✅ Vig Removal (Robust)
- Uses both market sides when available
- Falls back to raw odds when needed
- Clearly separated: `roi` (raw) vs `roi_fair` (vig-adjusted)

### ✅ Fair Odds Behavior (Well-Documented)
- `compute_fair_yes_odds()` handles all edge cases
- Proportional scaling when both odds present
- Graceful degradation when data missing

---

## No Code Changes Required

This was an **audit-only** task. All findings are POSITIVE:
- Label semantics are clear
- Betting logic is unambiguous
- Vig removal is robust
- Odds coverage is good

The codebase already implements best practices for:
- Binary classification (P(Yes) only)
- Threshold-based betting (no inverse logic)
- Vig-aware ROI calculations

---

## Files Changed

### New Files (3)
1. `scripts/audit_btts_odds_coverage.py` - Odds coverage audit script
2. `BTTS_ODDS_AND_LABEL_AUDIT.md` - Comprehensive audit report
3. `BTTS_ODDS_AND_LABEL_AUDIT_SUMMARY.md` - This file

### Modified Files (3)
1. `src/load_data.py` - Added `get_btts_odds_coverage_summary()` helper
2. `RUN_TEMPORAL_HOLDOUT.py` - Added audit logging after data load
3. `RUN_WALKFORWARD.py` - Added audit logging after data load

**Total changes:** 6 files (3 new, 3 modified)  
**Lines of code added:** ~400 (mostly documentation)  
**Lines of code changed in core logic:** 0 (audit-only)

---

## Validation

### Test 1: Audit Script Execution ✅
```bash
python scripts/audit_btts_odds_coverage.py
# Output: Detailed odds coverage summary (see above)
```

### Test 2: Helper Function ✅
```python
from src.load_data import get_btts_odds_coverage_summary
print(get_btts_odds_coverage_summary())
# Output: Concise summary for experiment logs
```

### Test 3: Experiment Logging ✅
```bash
# Logging appears in both temporal holdout and walk-forward runs
# Provides clear audit trail in all experiment outputs
```

---

## Recommendations for User

### Immediate Use
1. ✅ Run `scripts/audit_btts_odds_coverage.py` to verify odds coverage
2. ✅ Review `BTTS_ODDS_AND_LABEL_AUDIT.md` for complete documentation
3. ✅ Run experiments to see new audit logging in action

### Optional Enhancements
1. **Track vig over time** - Monitor bookmaker margins across seasons
2. **Fill missing odds** - Use consensus of multiple bookmakers or model predictions
3. **Add BTTS No betting** - If desired, implement inverse threshold logic (not recommended)

---

## Summary

**Audit Status:** ✅ PASSED

The BTTS research pipeline correctly:
- Predicts P(BTTS Yes) probabilities
- Bets on BTTS Yes only (no inverse logic)
- Uses both Yes & No odds for vig removal
- Has good odds coverage (68% with both sides)
- Falls back gracefully when data is missing

**No issues found. No code changes required.**

This was an audit-only exercise to document existing behavior and add transparency logging.

---

**Report Version:** 1.0 FINAL  
**Author:** BTTS Odds & Label Auditor  
**Date:** December 11, 2025
