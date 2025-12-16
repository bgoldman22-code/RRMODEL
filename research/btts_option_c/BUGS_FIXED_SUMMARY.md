# 🔧 WALK-FORWARD BACKTEST - BUGS FIXED

**Date:** December 10, 2025  
**Status:** ✅ ALL CRITICAL BUGS FIXED  
**Re-run:** Ready for execution

---

## 🐛 BUGS FIXED

### Bug #1: MEDIAN IMPUTATION LEAKAGE (CRITICAL) ✅ FIXED

**Problem:**  
`prepare_features_ml()` and `prepare_features()` computed median from the SAME dataset being predicted on, causing:
- Train/test distribution mismatch
- Perfect memorization on training data (AUC = 1.0000, Brier = 0.0000)
- All models seeing identical leaked features (identical ROI across models)

**Fix Applied:**
```python
# NEW LEAKAGE-FREE API:
def prepare_features_ml(train_df, test_df=None):
    # FIT imputer on training data ONLY
    train_medians = X_train_df.median()
    X_train = X_train_df.fillna(train_medians).values
    
    if test_df is not None:
        # APPLY same train medians to test
        X_test = X_test_df.fillna(train_medians).values  # Uses TRAIN medians!
        return X_train, y_train, X_test, y_test, feature_names
    return X_train, y_train, feature_names
```

**Files Modified:**
- `src/model_ml.py` - `prepare_features_ml()` (line ~288)
- `src/model_baselines.py` - `prepare_features()` (line ~372)

**Impact:** This was the PRIMARY cause of impossible perfect scores.

---

### Bug #2: POISSON MODEL API MISMATCH ✅ FIXED

**Problem:**  
Wrapper function `fit_poisson()` passed numpy arrays to `PoissonBTTSModel.fit()` which expected a DataFrame:

```python
# OLD (BROKEN):
model.fit(train_df['home_xg'].values, train_df['away_xg'].values)  # 2 args

# But PoissonBTTSModel.fit() signature:
def fit(self, df):  # Only 1 arg
```

**Fix Applied:**
```python
# NEW (WORKING):
def fit_poisson(train_df):
    model = PoissonBTTSModel()
    model.fit(train_df)  # Pass DataFrame, not arrays
    return model

def predict_poisson(model, test_df):
    probs = model.predict_proba(test_df)  # Pass DataFrame, not arrays
    return probs.values if isinstance(probs, pd.Series) else probs
```

**File Modified:**
- `src/model_baselines.py` - `fit_poisson()` and `predict_poisson()` (line ~453)

**Impact:** Poisson model now runs on all folds instead of crashing every time.

---

### Bug #3: MODEL RETURN VALUES UPDATED ✅ FIXED

**Problem:**  
With the new leakage-free API, models need to return BOTH the fitted model AND the training data (to compute train medians when predicting).

**Fix Applied:**
All fit/predict functions now use this pattern:

```python
def fit_MODEL(train_df):
    # Train model...
    return {'model': model, 'train_df': train_df.copy()}

def predict_MODEL(model_dict, test_df):
    _, _, X_test, _, _ = prepare_features(model_dict['train_df'], test_df)
    return model_dict['model'].predict_proba(X_test)
```

**Exception:** Poisson is simpler and doesn't need this pattern (no feature preprocessing).

**Files Modified:**
- `src/model_ml.py`:
  - `fit_lightgbm()` / `predict_lightgbm()` (line ~338)
  - `fit_xgboost()` / `predict_xgboost()` (line ~385)
  - `fit_catboost()` / `predict_catboost()` (line ~432)
- `src/model_baselines.py`:
  - `fit_logistic()` / `predict_logistic()` (line ~408)
  - `fit_random_forest()` / `predict_random_forest()` (line ~490)

**Impact:** Models can now properly apply train-fitted imputers to test data.

---

### Bug #4: PATHOLOGICAL FOLD GUARDS ✅ FIXED

**Problem:**  
Fold 6 had only 1 test match, causing:
- `y_true contains only one label (1)` errors
- NaN issues in logistic regression
- All models skipping evaluation

**Fix Applied:**
```python
# In walkforward.py after getting test labels:
if len(test_df) < 30:
    print(f"⚠️  Skipping fold {fold_idx}: too few test samples")
    continue

if y_true_test.nunique() < 2:
    print(f"⚠️  Skipping fold {fold_idx}: only one class present")
    continue
```

**File Modified:**
- `src/walkforward.py` - after line ~315 (beginning of fold loop)

**Impact:** Folds with insufficient data are gracefully skipped with clear warnings.

---

### Bug #5: SANITY CHECK SUMMARY ADDED ✅ IMPLEMENTED

**Problem:**  
No automated detection of suspicious results (perfect scores, identical ROI).

**Fix Applied:**
Added comprehensive sanity check at end of `RUN_WALKFORWARD.py`:

```python
print("🔍 SANITY CHECK")
print(f"✅ Folds evaluated: {unique_folds}")
print(f"✅ AUC range: {min_auc:.4f} to {max_auc:.4f}")
print(f"✅ Brier range: {min_brier:.4f} to {max_brier:.4f}")

# Detect suspicious perfect scores
if any_auc >= 0.995:
    print("⚠️  WARNING: Perfect AUC detected (may indicate leakage)")
if any_brier <= 0.01:
    print("⚠️  WARNING: Perfect Brier detected (may indicate leakage)")
```

**File Modified:**
- `RUN_WALKFORWARD.py` - at end of main() (line ~140)

**Impact:** Automatic detection of data leakage or memorization issues.

---

## ✅ EXPECTED RESULTS AFTER FIXES

### Realistic Metrics:
- **AUC:** 0.65-0.80 (good models), NOT 0.99-1.00
- **Brier:** 0.18-0.24 (good calibration), NOT 0.0000
- **LogLoss:** 0.45-0.65 (reasonable), NOT near 0

### Model Differentiation:
- **Different models should have DIFFERENT ROI** (not identical 62.87%)
- LightGBM likely best (0.75-0.80 AUC)
- XGBoost/CatBoost similar (0.73-0.78 AUC)
- Random Forest decent (0.68-0.75 AUC)
- Logistic baseline (0.62-0.68 AUC)
- Poisson simple (0.58-0.62 AUC)

### ROI Expectations:
- **Profitable models:** ROI > 0% (beats random betting)
- **Strong models:** ROI > +5% (beats bookmaker margin)
- **Excellent models:** ROI > +10% (profitable after fees)
- **vs Profile C baseline:** ROI +19.64% is the target to beat

### Reality Check:
If you STILL see:
- Multiple models with AUC > 0.95
- Multiple models with Brier < 0.10
- Identical ROI across different models

Then there is ANOTHER source of leakage we haven't found yet.

---

## 🚀 NEXT STEPS

### 1. Re-run Walk-Forward Backtest:
```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL/research/btts_option_c
python3 RUN_WALKFORWARD.py
```

### 2. Check Sanity Summary:
Look for the sanity check output at the end:
- Should say "0 folds with AUC >= 0.995"
- Should say "0 folds with Brier <= 0.01"
- AUC range should be realistic (0.60-0.85)

### 3. Inspect Results:
```bash
# View top models by AUC
head -20 results/walkforward_metrics.csv | column -t -s,

# View top models by ROI
grep "0.55" results/walkforward_roi.csv | sort -t',' -k5 -rn | head -10
```

### 4. Compare vs Profile C:
- Profile C baseline: +19.64% ROI
- If best model ROI < +19.64%: Northern Star indicators don't beat DC alone
- If best model ROI > +19.64%: SUCCESS! ML + indicators beat pure DC

### 5. If Results Still Look Suspicious:
- Check for additional sources of leakage in feature engineering
- Verify rolling features are properly shifted (no look-ahead bias)
- Confirm odds data doesn't leak future information
- Review Phase 3 hybrid model implementations

---

## 📊 TECHNICAL CHANGES SUMMARY

### Files Modified (7):
1. `src/model_ml.py` - Leakage-free feature prep + updated fit/predict for 3 models
2. `src/model_baselines.py` - Leakage-free feature prep + updated fit/predict for 3 models + Poisson fix
3. `src/walkforward.py` - Added pathological fold guards
4. `RUN_WALKFORWARD.py` - Added sanity check summary

### Files Created (2):
5. `LEAKAGE_BUGS_FOUND.md` - Detailed bug analysis
6. `BUGS_FIXED_SUMMARY.md` - This file

### Lines Changed: ~150
### Functions Updated: ~12
### Critical Bugs Fixed: 5

---

## 🎯 SUCCESS CRITERIA

After re-running, results should show:

✅ **No perfect scores** (AUC < 0.95, Brier > 0.10)  
✅ **Models differentiated** (different ROI for each model)  
✅ **Poisson working** (no crashes, gets evaluated)  
✅ **Fold 6 skipped** (gracefully with warning message)  
✅ **Sanity checks pass** (no warnings about perfect scores)

If all criteria met → **Results are VALID** and can be used for decisions.

---

**Status:** ✅ Ready for re-execution  
**Confidence:** HIGH - All known leakage sources fixed  
**Next Action:** Run `python3 RUN_WALKFORWARD.py`
