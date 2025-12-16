# BTTS Research Pipeline - Odds Integration Complete

**Date:** December 10, 2025  
**Status:** ✅ READY FOR WALKFORWARD BACKTEST

---

## Problem Solved

**Original Issue:** Data source season label mismatch caused 0% merge coverage for odds.

**Root Causes Identified:**
1. Baseline odds file had `season='2022-23'` for May 2023 matches (end of that season)
2. API-Football had `season='2023-24'` for August 2023+ matches (start of new season)
3. Additionally, baseline had exact timestamps (19:00:00) while API-Football had date only
4. These mismatches caused merge on `(season, date, home_norm, away_norm)` to find 0 matches

**Solution Implemented:**
1. ✅ Use API-Football as baseline (has actual match results + goals for BTTS calculation)
2. ✅ Merge odds using `(date_only, home_norm, away_norm)` - ignores time component and season labels
3. ✅ Left-join baseline odds onto API-Football matches
4. ✅ Left-join FPL availability data
5. ✅ Deduplicate any double-matches from date_only merge

---

## Final Dataset Statistics

```
✅ VALIDATED DATASET (force_rebuild=True):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Matches:        910 matches ✅ (in expected range: 904 ± 16)
BTTS Rate:            58.5% ✅ (realistic - not 0%)
Date Range:           2023-08-11 to 2025-12-08 (2.3 seasons)

COVERAGE:
  xG Data:            910/910 (100.0%) ✅
  Odds Data:          619/910 (68.0%) ✅ ← READY FOR BACKTEST
  FPL Availability:   850/910 (93.4%) ✅

BTTS LABELS:          910/910 (100.0%) ✅
  - Calculated from API-Football home_goals/away_goals
  - Both Teams Scored: 532 matches (58.5%)
  - Not Both Scored: 378 matches (41.5%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Technical Changes Made

### File Modified: `src/load_data.py`

**Function:** `merge_all_sources()`

**Key Changes:**

1. **Use API-Football as Baseline** (instead of baseline odds):
   ```python
   # OLD: unified_df = baseline_df.copy()  # Had odds but no match results
   # NEW: unified_df = api_df.copy()       # Has match results (goals)
   ```

2. **Calculate BTTS First** (before any merges):
   ```python
   # Calculate BTTS from API-Football goals immediately
   unified_df['btts'] = ((unified_df['home_goals'] > 0) & 
                          (unified_df['away_goals'] > 0)).astype(int)
   ```

3. **Merge Odds by Date Only** (ignore time component and season):
   ```python
   # Create date_only column (ignore time)
   unified_df['date_only'] = unified_df['date'].dt.date
   baseline_df['date_only'] = baseline_df['date'].dt.date
   
   # Merge on (date_only, home_norm, away_norm) - NOT season
   unified_df = pd.merge(
       unified_df,
       odds_df,
       on=['date_only', 'home_norm', 'away_norm'],
       how='left',
       suffixes=('', '_baseline')
   )
   ```

4. **Deduplicate Results**:
   ```python
   # Remove duplicates created by date_only merge
   unified_df = unified_df.drop_duplicates(
       subset=['season', 'date', 'home_norm', 'away_norm'], 
       keep='first'
   )
   ```

---

## Validation Results

### Before Fix:
```
❌ Total matches: 977 (baseline count)
❌ BTTS rate: 0.0% (all NaN - no goals data)
❌ xG coverage: 0/977 (0.0%)
❌ Odds coverage: 977/977 (100%) - but no match results!
❌ BLOCKED: Cannot train models without BTTS labels
```

### After Fix:
```
✅ Total matches: 910 (API-Football count)
✅ BTTS rate: 58.5% (realistic)
✅ xG coverage: 910/910 (100.0%)
✅ Odds coverage: 619/910 (68.0%) ← READY FOR BACKTEST!
✅ FPL coverage: 850/910 (93.4%)
✅ UNBLOCKED: Pipeline ready to execute
```

---

## Walkforward Backtest Readiness

### ✅ Ready for Betting Simulation

**Requirements Met:**
- ✅ Actual match results (home_goals, away_goals)
- ✅ BTTS labels calculated (58.5% rate)
- ✅ Bookmaker odds (btts_yes_odds, btts_no_odds) for 619/910 matches
- ✅ xG features for modeling (100% coverage)
- ✅ FPL availability for context (93.4% coverage)
- ✅ Time-series sorted data (2023-08-11 to 2025-12-08)

**Missing Odds Impact:**
- 291/910 matches (32%) don't have odds
- These matches can still be used for model training
- They'll be excluded from betting simulation (no odds = can't bet)
- Effective backtest universe: **619 matches with odds** (68%)

**Recommendation:**
```python
# In walkforward backtest, filter for odds availability:
backtest_df = df[df['btts_yes_odds'].notna()]
print(f"Backtest universe: {len(backtest_df)} matches")
```

---

## Pipeline Execution

### Quick Test (Verify Data):
```bash
cd research/btts_option_c/
python3 -c "from src.load_data import load_unified_data; df = load_unified_data(); print(f'Matches: {len(df)}, BTTS: {df[\"btts\"].mean():.1%}, Odds: {df[\"btts_yes_odds\"].notna().sum()}/{len(df)}')"
```

**Expected Output:**
```
Matches: 910, BTTS: 58.5%, Odds: 619/910
```

### Full Pipeline Execution:
```bash
cd research/btts_option_c/
python3 RUN_EXPERIMENT.py
```

**Expected Duration:** 20-30 minutes  
**Outputs:**
- `results/feature_ranking.csv` - Top BTTS indicators
- `results/model_leaderboard.csv` - Model AUC/Brier/LogLoss
- `results/calibration_plots/` - Calibration curves

### Walkforward Backtest:
```bash
# After RUN_EXPERIMENT.py completes successfully:
python3 walkforward_backtest.py  # TODO: Create this script
```

**Strategy:**
- Train on Season 1 (2023-24), test on Season 2 (2024-25)
- Only bet on matches with odds available
- Use Kelly criterion for stake sizing
- Compare ROI vs Profile C baseline (+19.64%)

---

## Data Quality Assessment

### Strengths ✅
1. **100% xG coverage** - All matches have expected goals
2. **100% BTTS labels** - All matches have actual results
3. **93% FPL coverage** - Almost all matches have availability data
4. **68% odds coverage** - Sufficient for backtest (619 matches)
5. **Realistic BTTS rate** - 58.5% matches historical EPL norms
6. **Time-series continuity** - 2.3 consecutive seasons

### Limitations ⚠️
1. **32% missing odds** - 291 matches excluded from betting simulation
2. **Odds source unknown** - Bookmaker column may have multiple sources
3. **No closing line** - May not be final odds before kickoff
4. **Limited history** - Only 2.3 seasons (vs 4+ years ideal)

### Recommendations 📋
1. ✅ **IMMEDIATE:** Execute pipeline with current 68% odds coverage
2. 🔍 **INVESTIGATE:** Why 32% missing odds? Can we backfill?
3. 📊 **FUTURE:** Collect closing line odds for sharper signals
4. 📈 **FUTURE:** Extend historical data to 4+ seasons

---

## Success Criteria for Walkforward Backtest

### Model Performance:
- ✅ Best model AUC > 0.60 (practical value threshold)
- ✅ Calibration Brier < 0.23 (acceptable threshold)
- ✅ L5/L10 features rank in top 20 (validates rolling windows)

### Betting Performance:
- 🎯 **PRIMARY:** ROI > 0% (profitable)
- 🎯 **STRETCH:** ROI > +19.64% (beats Profile C baseline)
- 🎯 **IDEAL:** Sharpe Ratio > 1.0 (risk-adjusted returns)
- 🎯 **IDEAL:** Max Drawdown < 30% (manageable risk)

### Edge Detection:
- 📊 Compare model probabilities vs bookmaker odds
- 📊 Identify market inefficiencies (overvalued/undervalued)
- 📊 Calculate expected value (EV) for each bet
- 📊 Only bet when EV > 5% (positive edge threshold)

---

## Next Steps

### 1. Execute Phase 1-2 Research (IMMEDIATE)
```bash
cd research/btts_option_c/
python3 RUN_EXPERIMENT.py
```
**Goal:** Identify Northern Star BTTS indicators

### 2. Review Results (30 min)
- Check `results/feature_ranking.csv` for top features
- Check `results/model_leaderboard.csv` for best model
- Review calibration plots for quality

### 3. Implement Walkforward Backtest (2-3 hours)
- Create `walkforward_backtest.py` script
- Train on 2023-24 season
- Test on 2024-25 season (out-of-sample)
- Filter for matches with odds available
- Simulate betting with Kelly criterion
- Calculate ROI, Sharpe, Max DD

### 4. Compare vs Profile C Baseline (30 min)
- Profile C: +19.64% ROI (Dixon-Coles only)
- BTTS Research: ? ROI (ML + xG + availability)
- Decision: If ROI > baseline, integrate into production

### 5. Production Integration (IF PROFITABLE)
- Port best model to production codebase
- Add BTTS predictions to daily pipeline
- Deploy for live betting (with monitoring)

---

## Files Updated

### Modified:
- ✅ `src/load_data.py` - Uses API-Football as baseline, date_only merge for odds

### Created:
- ✅ `BTTS_RESEARCH_SANITY_CHECK.md` - Production readiness report (443 lines)
- ✅ `DATA_SOURCE_FIX_NEEDED.md` - Issue diagnosis (superseded by this fix)
- ✅ `HARDENING_COMPLETE.md` - Pipeline hardening summary
- ✅ `ODDS_INTEGRATION_COMPLETE.md` - This document

### No Changes Needed:
- ✅ `src/model_baselines.py` - TimeSeriesSplit already implemented
- ✅ `src/model_ml.py` - TimeSeriesSplit already implemented
- ✅ `src/build_features.py` - Proper lagging already implemented
- ✅ `src/evaluate.py` - Calibration already implemented

---

## Conclusion

✅ **ODDS INTEGRATION COMPLETE**  
✅ **PIPELINE READY FOR WALKFORWARD BACKTEST**  
✅ **68% ODDS COVERAGE SUFFICIENT FOR BETTING SIMULATION**  
✅ **TIME TO RUN RUN_EXPERIMENT.PY AND DISCOVER THE NORTHERN STAR BTTS INDICATORS!**

---

**Report Generated:** December 10, 2025  
**Status:** ✅ READY FOR EXECUTION  
**Next Action:** `python3 RUN_EXPERIMENT.py`  
**Confidence Level:** HIGH - All data quality checks passed
