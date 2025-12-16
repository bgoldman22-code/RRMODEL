# EPL Profile C - Option C Development Status

**Date Started:** December 10, 2025  
**Mission:** Explore richer BTTS models using existing + external data sources  
**Constraint:** Production pipeline (audited EPL Profile C) remains frozen/untouched

---

## Overview

This document tracks the development of **Option C**, an experimental enhancement to the EPL Profile C BTTS system. Option C aims to:

1. Use the same verified merged dataset (904 matches, 92.5% coverage) as baseline
2. Build richer features and better-calibrated BTTS probabilities
3. Explore whether external data sources (xG, shots, etc.) improve predictive power
4. Remain strictly separate from production code (side-by-side experimental path)

---

## Development Principles

✅ **Safety First**
- All new code in new modules (`_option_c` suffix)
- Import from production where possible (no duplication)
- No changes to existing working functions
- No impact on live Netlify site

✅ **Data Integrity**
- Baseline: Same 3-key merge (season, home_norm, away_norm)
- Same canonical team normalization (`team_name_utils.py`)
- Strictly additive: external data is left-join optional

✅ **Scientific Rigor**
- Walk-forward validation with zero leakage
- Compare vs baseline: AUC, Brier, calibration, ROI
- Document all experiments and metrics

---

## Progress Tracker

### ✅ STEP 0 - Setup & Safety Railings

**Date:** December 10, 2025  
**Status:** ✅ COMPLETE

#### 0.1 Confirmed Existing Repo Layout

**Production files (FROZEN - DO NOT MODIFY):**
```
/Users/brentgoldman/Desktop/REPO33/RRMODEL/
├── epl_profile_c_core.py                                    # Core DC functions
├── scripts/soccer/
│   ├── backtest_epl_profile_c_walkforward.py               # Walk-forward backtest
│   ├── analyze_epl_profile_c_edges.py                      # Edge explorer
│   ├── audit_epl_profile_c_pipeline.py                     # Audit script
│   └── team_name_utils.py                                  # Canonical team normalization
└── data/premier_league/
    ├── historical_results.csv                              # Match results
    ├── team_stats_by_season.csv                            # Season stats
    └── historical_completed_with_odds.csv                  # BTTS odds
```

**Key verified metrics from Step 6 audit:**
- Merged dataset: 904 matches (92.5% coverage)
- Backtest ROI: +19.64% on 47 bets
- Walk-forward: 6 evaluation windows, 5 with bets
- BTTS rate: 59.5% (within expected range)
- Zero data leakage confirmed

#### 0.2 Created Experimental Module Structure

**New files created (EXPERIMENTAL - SAFE TO MODIFY):**
```
/Users/brentgoldman/Desktop/REPO33/RRMODEL/
└── scripts/soccer/
    ├── epl_profile_c_option_c_core.py                      # Option C core functions
    ├── backtest_epl_profile_c_option_c.py                  # Option C backtest
    └── analyze_epl_profile_c_option_c_edges.py             # Option C edge explorer
```

**Import strategy:**
- Reuse production loaders: `load_epl_data()` from `epl_profile_c_core.py`
- Reuse normalization: `standardize_team_name()` from `team_name_utils.py`
- Reuse 3-key merge logic: Copy `prepare_walkforward_data()` pattern
- Build new features/models on top of existing data pipeline

#### 0.3 Safety Confirmations

✅ **No changes to production functions**
- All existing `.py` files remain untouched
- Netlify functions unaffected
- Live site data flow unchanged

✅ **Strict separation**
- All Option C code has `_option_c` suffix
- Clear visual distinction in file names
- Can run side-by-side with production

✅ **Backward compatibility**
- Production backtest still runs independently
- Audit script still validates production pipeline
- No shared state between production and Option C

#### 0.4 Development Environment

**Python dependencies (already available):**
- pandas, numpy, scipy (data/modeling)
- scikit-learn (if needed for logistic/ensemble models)
- xgboost or lightgbm (if needed for gradient boosting)

**External API access (to be configured in later steps):**
- RapidAPI key (user to provide)
- API-Football key (to be acquired)
- Sportmonks key (to be acquired)
- Other APIs as needed

#### 0.5 Baseline Function Verification ✅

**Test run of Option C core:**
```bash
python3 scripts/soccer/epl_profile_c_option_c_core.py
```

**Results:**
```
✓ Loaded EPL data (Option C)
  Results: 1,607 matches
  Team stats: 1,375 team-seasons
  Odds: 977 matches

Preparing Option C walk-forward dataset...
✓ Combined: 904 matches with odds
  Coverage: 92.5%
  Date range: 2023-05-03 to 2025-11-09
  BTTS rate: 59.5%

✓ Baseline functions operational
✓ Merged dataset: 904 matches
```

**Verification:**
- ✅ Data loading works (auto-detects correct path)
- ✅ 3-key merge produces 904 matches (matches production)
- ✅ Coverage is 92.5% (matches production)
- ✅ BTTS rate is 59.5% (matches production)
- ✅ Date range correct (2023-05-03 to 2025-11-09)

**Conclusion:** Option C baseline infrastructure is operational and produces identical merged dataset to production.

---

## Next Steps

### STEP 1 - Clone the Current Pipeline as a Baseline
- [ ] Create `epl_profile_c_option_c_core.py`
- [ ] Implement `load_epl_data_option_c()` (wrapper around production loader)
- [ ] Implement `prepare_walkforward_data_option_c()` (exact clone of 3-key merge)
- [ ] Create `backtest_epl_profile_c_option_c.py`
- [ ] Implement `run_full_walkforward_option_c()` (uses same DC model initially)
- [ ] Run baseline backtest and verify results match production (±rounding noise)
- [ ] Document baseline metrics

**Expected outcome:** Option C pipeline produces identical results to production (baseline established)

---

## File Structure Summary

```
PRODUCTION (FROZEN):
  epl_profile_c_core.py                      # Core functions (DC, ratings, bands)
  scripts/soccer/
    backtest_epl_profile_c_walkforward.py    # Production backtest
    analyze_epl_profile_c_edges.py           # Production edge explorer
    audit_epl_profile_c_pipeline.py          # Audit/validation script
    team_name_utils.py                       # Canonical team normalization

EXPERIMENTAL (OPTION C):
  scripts/soccer/
    epl_profile_c_option_c_core.py           # NEW: Option C core (features, models)
    backtest_epl_profile_c_option_c.py       # NEW: Option C backtest
    analyze_epl_profile_c_option_c_edges.py  # NEW: Option C edge explorer
    collect_epl_external_features.py         # NEW: External data collectors (Step 4+)

DATA (SHARED):
  data/premier_league/
    historical_results.csv                   # Match results (904 merged)
    team_stats_by_season.csv                 # Season-level stats
    historical_completed_with_odds.csv       # BTTS odds (977 rows)
```

---

## Audit Trail

| Step | Date | Status | Summary |
|------|------|--------|---------|
| 0 | 2025-12-10 | ✅ COMPLETE | Setup & safety railings established. Created experimental modules (core, backtest, edge explorer). Verified baseline data loading produces 904 matches (identical to production). |

---

**Current State:** ✅ STEP 0 COMPLETE - Ready to begin STEP 1 (baseline backtest clone)  
**Blockers:** None  
**Next Action:** Run Option C backtest with DC model only, compare vs production results
