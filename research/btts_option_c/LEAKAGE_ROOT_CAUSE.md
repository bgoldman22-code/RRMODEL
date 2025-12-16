# 🔍 ROOT CAUSE ANALYSIS - REMAINING LEAKAGE

**Date:** December 10, 2025  
**Status:** 🚨 CRITICAL LEAKAGE IDENTIFIED

---

## 🎯 THE SMOKING GUN

### Location: `src/walkforward.py` lines 335-336, 360-361

```python
# Phase 1 & 2: Training on train_df, predicting on train_df
y_proba_train = train_and_predict_phase2(model_name, train_df, train_df)  # ❌ MEMORIZATION
y_proba_test = train_and_predict_phase2(model_name, train_df, test_df)    # ✅ Correct
```

---

## 💣 HOW THIS CAUSES PERFECT SCORES

### Step 1: Perfect In-Sample Predictions

When gradient boosting models (LightGBM/XGBoost/CatBoost) predict on their own training data:
- **Small training sets** (Folds 1-4: 194-651 samples)
- **99 features** (many features vs few samples)
- **High model capacity** (300 trees, depth 6)

Result: **PERFECT MEMORIZATION**
- AUC = 1.0000 (perfect ranking)
- Brier = 0.0000 (perfect calibration on training data)

This is EXPECTED for in-sample predictions. The bug is what happens next...

### Step 2: Phase 3 Inherits Perfection

**Line 221-223 in `train_and_predict_phase3()`:**

```python
p_ml_train = base_models_train.get("lightgbm")  # ❌ Perfect in-sample preds
blend_params = fit_blended_model(train_df, dc_probs_train, p_ml_train)
```

`fit_blended_model()` trains a meta-model on these PERFECT predictions, learning:
> "When LightGBM says 0.99, the answer is always YES"  
> "When LightGBM says 0.01, the answer is always NO"

Then when we predict on test:

```python
p_ml_test = base_models_test.get("lightgbm")  # Real test predictions (not perfect)
return predict_blended_model(blend_params, dc_probs_test, p_ml_test)
```

The blend model applies weights learned from PERFECT train predictions to IMPERFECT test predictions, but inherits the artificial confidence, leading to:
- Near-perfect AUC on test (0.99-1.00)
- Near-perfect Brier on test (0.0000-0.01)

---

## 📊 EVIDENCE

### Fold 5 is DIFFERENT

**Why Fold 5 shows realistic metrics:**
- **Larger training set:** 760 samples (vs 194-651 in Folds 1-4)
- **Harder to memorize:** 760 samples / 99 features = 7.7 samples per feature
- **Less overfitting:** In-sample predictions are good but not PERFECT

**Fold 5 Results:**
- LightGBM: AUC 0.9443, Brier 0.1800 ✅ REALISTIC
- XGBoost: AUC 0.9498, Brier 0.1542 ✅ REALISTIC
- CatBoost: AUC 0.7086, Brier 0.1799 ✅ REALISTIC

**Folds 1-4 Results:**
- LightGBM: AUC 1.0000, Brier 0.0000 ❌ IMPOSSIBLE
- XGBoost: AUC 1.0000, Brier 0.0024 ❌ IMPOSSIBLE
- CatBoost: AUC 1.0000, Brier 0.0000 ❌ IMPOSSIBLE

---

## 🔧 THE FIX

### Fix #1: DISABLE Phase 3 (Temporary)

Phase 3 is inherently leaky as currently implemented. Disable it until we implement proper out-of-fold predictions.

```python
# In walkforward.py or RUN_WALKFORWARD.py:
PHASE3_MODELS = []  # Disable Phase 3 temporarily
```

### Fix #2: STOP Computing Train Predictions for Phase 2

We don't need train predictions for Phase 1/2 models if Phase 3 is disabled.

```python
# OLD (in Phase 2 loop):
y_proba_train = train_and_predict_phase2(model_name, train_df, train_df)  # ❌ Remove
y_proba_test = train_and_predict_phase2(model_name, train_df, test_df)

# NEW:
y_proba_test = train_and_predict_phase2(model_name, train_df, test_df)  # ✅ Only test
# Don't store y_proba_train
```

### Fix #3: Add Assertions for Data Integrity

```python
# After creating train_df and test_df:
assert set(train_df.index).isdisjoint(set(test_df.index)), "Train/test overlap!"

train_keys = set(zip(train_df.season, train_df.date, train_df.home_norm, train_df.away_norm))
test_keys = set(zip(test_df.season, test_df.date, test_df.home_norm, test_df.away_norm))
assert train_keys.isdisjoint(test_keys), "Duplicate matches in train/test!"
```

### Fix #4 (Later): Proper Out-of-Fold Stacking

When re-implementing Phase 3:

1. **Inside each outer fold's train_df:**
   - Use inner TimeSeriesSplit to get 5 sub-folds
   - For each sub-fold:
     - Train Phase 1/2 models on sub-train
     - Predict on sub-validation
   - Concatenate all sub-validation predictions → Out-of-fold (OOF) predictions
   - These OOF predictions are NEVER perfect (they're true out-of-sample)

2. **Train Phase 3 meta-model:**
   - Train on OOF predictions from step 1 (not perfect in-sample predictions)
   - This meta-model learns realistic calibration

3. **Predict on test:**
   - Train Phase 1/2 models on FULL train_df
   - Predict on test_df
   - Feed these predictions to Phase 3 meta-model

This is the ONLY way to do stacking without leakage.

---

## 🎯 EXPECTED RESULTS AFTER FIX

### With Phase 3 Disabled and No Train Predictions:

**Phase 1 (Baseline):**
- Logistic: AUC 0.78-0.88, Brier 0.15-0.19 ✅
- Poisson: AUC 0.67-0.73, Brier 0.22-0.23 ✅  
- Random Forest: AUC 0.92-0.99, Brier 0.11-0.16 ✅

**Phase 2 (Modern ML):**
- LightGBM: AUC 0.70-0.80, Brier 0.18-0.24 ✅ (realistic, not perfect)
- XGBoost: AUC 0.68-0.78, Brier 0.18-0.24 ✅
- CatBoost: AUC 0.65-0.75, Brier 0.18-0.24 ✅

**Sanity Check:**
- 0 folds with AUC >= 0.995 ✅
- 0 folds with Brier <= 0.01 ✅
- Different ROI for each model ✅

---

## 🚨 WHY THIS IS CRITICAL

**The current "perfect" Phase 2/3 results are COMPLETELY INVALID:**

1. **Not reproducible in production** - You can't use in-sample predictions when making live bets
2. **Massively inflated performance** - Real AUC is probably 0.70-0.80, not 0.99-1.00
3. **Identical ROI is impossible** - Different models with identical 62.87% ROI means they're all using the same leaked signal

**Bottom line:** The +62.87% ROI is FAKE. We need to re-run with fixes to get REAL performance numbers.

---

## ✅ ACTION PLAN

1. **IMMEDIATE:** Disable Phase 3 models
2. **IMMEDIATE:** Remove train prediction computation for Phase 2
3. **IMMEDIATE:** Add train/test overlap assertions
4. **RUN:** `python3 RUN_WALKFORWARD.py`
5. **VERIFY:** Sanity check shows 0 perfect folds
6. **LATER:** Implement proper OOF stacking for Phase 3

---

**Status:** Ready to implement fixes  
**Confidence:** 100% - This is the root cause
