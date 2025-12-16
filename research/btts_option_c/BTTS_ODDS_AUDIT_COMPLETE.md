# ✅ BTTS Odds & Label Audit - COMPLETE

**Status:** All deliverables complete  
**Date:** December 11, 2025  
**Task Type:** Audit-only (no modeling logic changes)

---

## 🎯 Quick Answer to Your Questions

### Question 1: Is the modeling/evaluation logic only looking at BTTS YES probabilities, or is it also handling BTTS NO in any way?

**Answer: ONLY BTTS YES probabilities**

✅ All models output P(BTTS = Yes)  
✅ All betting logic bets on BTTS Yes only  
✅ Threshold logic: `if p >= 0.55, bet Yes`  
❌ No code path bets on BTTS No  
❌ No inverse probability calculation  

**BTTS No odds ARE used, but ONLY for:**
- Vig removal (to compute fair Yes odds)
- Edge calculation (model prob vs implied Yes prob)

### Question 2: Do we actually have historical odds for BOTH BTTS Yes and BTTS No (and how complete are they)?

**Answer: YES, 68% coverage with BOTH sides**

✅ **619 matches (68%)** have both Yes & No odds  
✅ **0 matches** have only Yes odds  
✅ **0 matches** have only No odds  
❌ **291 matches (32%)** have neither  

**Key finding:** When odds exist, we ALWAYS have both sides (no partial coverage).

**Odds stats:**
- Yes odds: mean 1.72, median 1.69, range 1.31-2.76
- No odds: mean 2.30, median 2.25, range 1.49-3.68
- Average vig: 3.6% (competitive, likely Pinnacle)

---

## 📋 Deliverables Created

### 1. Audit Script
**File:** `scripts/audit_btts_odds_coverage.py`  
**Purpose:** Analyze odds coverage, calculate vig statistics  
**Usage:** `python scripts/audit_btts_odds_coverage.py`

### 2. Comprehensive Documentation
**File:** `BTTS_ODDS_AND_LABEL_AUDIT.md`  
**Purpose:** Full audit report with code locations, logic flow, vig analysis  
**Size:** 7 sections, ~400 lines

### 3. Summary Document
**File:** `BTTS_ODDS_AND_LABEL_AUDIT_SUMMARY.md`  
**Purpose:** Executive summary of findings and implementation

### 4. Helper Function
**Location:** `src/load_data.py` (end of file)  
**Function:** `get_btts_odds_coverage_summary()`  
**Purpose:** Return formatted summary for experiment logging

### 5. Experiment Logging
**Modified files:**
- `RUN_TEMPORAL_HOLDOUT.py` (added audit logging after data load)
- `RUN_WALKFORWARD.py` (added audit logging after data load)

**Effect:** All experiment runs now display odds/label audit summary

---

## 🔍 Key Code Paths Audited

### Label Extraction
- `src/load_data.py`: Lines 279-284 (calculate `btts` from goals)
- `src/model_baselines.py`: Lines 449, 459 (extract `y = train_df['btts']`)
- `src/model_ml.py`: Lines 365, 375 (extract `y = train_df['btts']`)

### Model Predictions (All → P(BTTS Yes))
- `PoissonBTTSModel`: P(Home>0) × P(Away>0)
- `LogisticBTTSModel`: Logistic regression on `btts` label
- `RandomForestBTTSModel`: RF classifier on `btts` label
- LightGBM/XGBoost/CatBoost: All trained on `btts=1` (Yes)

### Betting Logic (Yes Only)
- `src/evaluate.py`:
  - Line 332: `valid_mask = (y_proba >= threshold)` ← Bet Yes
  - Lines 317-365: `simulate_flat_bets()` (Yes betting)
  - Lines 367-478: `run_threshold_sweep()` (Yes ROI)
  - Lines 535-585: `simulate_kelly_bets()` (Yes Kelly)

### Vig Removal (Uses Both Odds)
- `src/evaluate.py`:
  - Lines 489-509: `remove_vig_two_way()` (proportional scaling)
  - Lines 511-533: `compute_fair_yes_odds()` (vig-free Yes odds)

---

## ✅ Validation Results

### Audit Script Output
```
BTTS ODDS COVERAGE AUDIT
Total matches: 910

Both Yes & No odds present:   619 ( 68.0%)
Only Yes odds present:          0 (  0.0%)
Only No odds present:           0 (  0.0%)
Neither present:              291 ( 32.0%)

BTTS YES ODDS: mean=1.72, median=1.69
BTTS NO ODDS: mean=2.30, median=2.25

VIG ANALYSIS
Average vig: 3.6% (range: 3.0%-8.1%)
```

### Experiment Logging (Example)
```
================================================================================
                     BTTS ODDS & LABEL AUDIT SUMMARY                          
================================================================================

BTTS Odds Coverage:
  Total matches: 910
  Both Yes & No odds: 619 (68.0%)
  
Label semantics: btts=1 (Yes), btts=0 (No)
Model predicts: P(BTTS = Yes)
Betting strategy: Bet 'Yes' when p >= threshold

================================================================================
```

---

## 🎓 Technical Summary

### Label Semantics
- **Binary classification:** `btts ∈ {0, 1}`
- **Positive class:** `btts=1` (both teams scored)
- **Model output:** P(btts=1) = P(BTTS Yes)

### Betting Strategy
- **Decision rule:** If P(Yes) ≥ threshold → Bet Yes, else Don't bet
- **No inverse betting:** Never bet No (even when P(Yes) < 0.5)
- **Rationale:** Neutral position (no bet) is preferred over betting No

### Odds Usage
- **Yes odds:** Used for betting payouts and ROI calculation
- **No odds:** Used ONLY for vig removal (fair odds calculation)
- **Edge calculation:** edge = P(model) - 1/Yes_odds

### Vig Removal
- **Method:** Proportional scaling of implied probabilities
- **Formula:** fair_p_yes = p_yes / (p_yes + p_no)
- **Fallback:** If no_odds missing, use raw yes_odds

---

## 📊 Audit Findings

### ✅ PASSED: Label Usage
- Clear convention: btts=1 (Yes), btts=0 (No)
- All models predict P(Yes) consistently
- No ambiguity in label interpretation

### ✅ PASSED: Betting Logic
- Unambiguous: Always bet Yes when p >= threshold
- No inverse betting on No
- Threshold-based, not probability-based

### ✅ PASSED: Odds Coverage
- 68% have both Yes & No odds
- When odds exist, both sides always present
- No partial coverage issues

### ✅ PASSED: Vig Removal
- Robust implementation with fallbacks
- Uses both odds when available
- Graceful degradation when missing

### ✅ PASSED: Code Quality
- Well-documented functions
- Clear variable names (yes_odds, no_odds)
- Consistent across all modules

---

## 🚀 Next Steps (Optional)

### For User Review
1. ✅ Read `BTTS_ODDS_AND_LABEL_AUDIT.md` for full details
2. ✅ Run `scripts/audit_btts_odds_coverage.py` to verify
3. ✅ Check experiment logs for new audit summary

### Optional Enhancements
1. **Track vig over time** - Monitor bookmaker margins
2. **Fill missing odds** - Use model predictions or consensus
3. **Add No betting** - If desired (not recommended)

---

## 📁 All Files Created/Modified

### New Files (3)
```
scripts/audit_btts_odds_coverage.py        (audit script)
BTTS_ODDS_AND_LABEL_AUDIT.md              (full report)
BTTS_ODDS_AND_LABEL_AUDIT_SUMMARY.md      (executive summary)
```

### Modified Files (3)
```
src/load_data.py                           (+30 lines, helper function)
RUN_TEMPORAL_HOLDOUT.py                    (+7 lines, audit logging)
RUN_WALKFORWARD.py                         (+7 lines, audit logging)
```

---

## ✅ Conclusion

**Audit Status:** PASSED

The BTTS research pipeline is correctly implemented:
- Predicts P(BTTS Yes) probabilities
- Bets on BTTS Yes only
- Uses both odds for vig removal
- Has good odds coverage (68%)
- No issues found

**No modeling logic changes required.**  
**All work was audit/documentation only.**

---

**Audit Complete ✅**  
**Date:** December 11, 2025  
**Auditor:** BTTS Odds & Label Analysis System
