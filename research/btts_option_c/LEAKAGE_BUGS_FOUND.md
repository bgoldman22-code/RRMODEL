# 🚨 CRITICAL BUGS FOUND IN WALK-FORWARD BACKTEST

**Date:** December 10, 2025  
**Status:** 🔴 PRODUCTION BLOCKER - Do NOT use current results  
**Severity:** CRITICAL DATA LEAKAGE

---

## 🐛 BUG #1: TEST SET MEDIAN IMPUTATION (CRITICAL LEAKAGE)

### Location:
- `src/model_ml.py` line ~315: `prepare_features_ml()`
- `src/model_baselines.py` line ~395: `prepare_features()`

### Problem:
```python
# CURRENT CODE (BROKEN):
def prepare_features_ml(df, exclude_cols=None):
    X_df = df[feature_cols].select_dtypes(include=[np.number])
    X = X_df.fillna(X_df.median()).values  # ❌ LEAKAGE!
    y = df['btts'].values
    return X, y, feature_names
```

When this function is called on `test_df`, it computes `median()` using **only test data**. But then in walkforward:

```python
# In walkforward.py, line ~130:
y_proba_train = train_and_predict_phase2(model_name, train_df, train_df)
y_proba_test = train_and_predict_phase2(model_name, train_df, test_df)
```

The model is trained on `prepare_features_ml(train_df)` which fills with **train median**, then predicts on `prepare_features_ml(test_df)` which fills with **test median**. This creates:

1. **Train/test distribution mismatch** - different imputation values
2. **Minor leakage** - test median uses future information

BUT WORSE:

```python
# In walkforward.py, line ~330:
y_proba_train = train_and_predict_phase2(model_name, train_df, train_df)
```

When we call `predict` on `train_df` after fitting, we're predicting on the SAME data with the SAME median imputation, leading to **perfect memorization** on folds with small test sets or single-class outcomes.

### Impact:
- **Perfect AUC (1.0000)** on multiple folds
- **Perfect Brier (0.0000)** on multiple folds
- Model is **memorizing the training data** instead of generalizing
- **ALL Phase 2 models show identical performance** because they're all seeing the same leaked features

### Why This Causes Perfect Scores:
When you fill NaN with median **from the same dataset** you're about to predict on, and that dataset has limited variance (like folds 1-4 which are early in the time series), gradient boosting models can trivially memorize the patterns.

---

## 🐛 BUG #2: POISSON MODEL API MISMATCH

### Location:
- `src/model_baselines.py` line ~460: `fit_poisson()`
- `src/model_baselines.py` line ~90: `PoissonBTTSModel.fit()`

### Problem:
```python
# In model_baselines.py line ~460:
def fit_poisson(train_df):
    model = PoissonBTTSModel()
    model.fit(train_df['home_xg'].values, train_df['away_xg'].values)  # ❌ 2 args
    return model

# But PoissonBTTSModel.fit() expects:
class PoissonBTTSModel:
    def fit(self, df):  # ❌ Only 1 arg (besides self)
        if 'home_xg' in df.columns:
            self.home_lambda = df['home_xg'].mean()
```

The wrapper function `fit_poisson()` passes 2 numpy arrays, but `PoissonBTTSModel.fit()` expects a DataFrame.

### Impact:
- **All Poisson predictions fail** with: `PoissonBTTSModel.fit() takes 2 positional arguments but 3 were given`
- Phase 3 hybrid models that depend on Poisson predictions may fail or use incorrect fallbacks

---

## 🐛 BUG #3: IDENTICAL ROI FOR MULTIPLE MODELS

### Location:
- `src/walkforward.py` line ~330-340: Base model prediction storage

### Problem:
```python
# In walkforward.py line ~330:
y_proba_train = train_and_predict_phase2(model_name, train_df, train_df)
y_proba_test = train_and_predict_phase2(model_name, train_df, test_df)

# Store for Phase 3
base_models_train[model_name] = y_proba_train
base_models_test[model_name] = y_proba_test
```

This looks correct, BUT combined with Bug #1 (median imputation leakage), all models see the SAME imputed features and produce nearly IDENTICAL predictions, leading to:

- **5 models with exact same ROI: 62.87%**
- **5 models with exact same Bets: 315**
- **5 models with exact same Profit: $1900.80**

This is impossible unless all models are predicting nearly identical probabilities.

### Root Cause:
Bug #1 causes all models to see the same leaked/memorized patterns, so they converge to the same predictions.

---

## 🐛 BUG #4: SINGLE-MATCH FOLD CRASHES

### Location:
- `src/walkforward.py` line ~78: Fold splitting logic

### Problem:
```python
Fold 6:
  Train: 2023-08-11 to 2025-12-07 (909 matches)
  Test:  2025-12-08 to 2025-12-08 (1 matches)
```

Fold 6 has only 1 test match, causing:
- `y_true contains only one label (1)` → Can't compute ROC/AUC
- Logistic fails: `Input X contains NaN`
- All models skip this fold

### Impact:
- **6th fold is useless** for evaluation
- May introduce bias if last fold represents recent/future data trends

### Fix:
Add guard to skip folds with < 30 samples or single-class labels.

---

## 🐛 BUG #5: TRAIN-ON-TRAIN PREDICTIONS FOR PHASE 3

### Location:
- `src/walkforward.py` line ~330

### Problem:
```python
# Phase 2 models predict on TRAIN set:
y_proba_train = train_and_predict_phase2(model_name, train_df, train_df)

# Then Phase 3 uses these train predictions:
base_models_train[model_name] = y_proba_train
```

This creates a second form of leakage: Phase 3 meta-models are trained on **in-sample predictions** (model predicting its own training data), which are artificially perfect.

Proper stacking requires:
1. Split train into train1 + train2
2. Train base model on train1, predict on train2
3. Train meta-model on train2 predictions
4. Or use out-of-fold predictions from cross-validation

### Impact:
- **Phase 3 models inherit the perfect AUC** from Bug #1
- **DC Stacked shows AUC 0.9887** (nearly perfect) because it's trained on perfect base model predictions

---

## 📊 EVIDENCE OF BUGS IN OUTPUT

### Smoking Gun #1: Perfect Metrics
```
Fold 1: lightgbm    → AUC: 1.0000, Brier: 0.0000
Fold 2: lightgbm    → AUC: 1.0000, Brier: 0.0000
Fold 3: xgboost     → AUC: 1.0000, Brier: 0.0054
Fold 4: catboost    → AUC: 1.0000, Brier: 0.0000
```

**Impossible for real out-of-sample data.** Even the best models rarely exceed 0.85 AUC on sports betting.

### Smoking Gun #2: Identical ROI
```
3. Phase 2: Modern ML - catboost    → ROI: 62.87%, Bets: 315, Profit: $1900.80
4. Phase 2: Modern ML - lightgbm    → ROI: 62.87%, Bets: 315, Profit: $1900.80
5. Phase 2: Modern ML - xgboost     → ROI: 62.87%, Bets: 315, Profit: $1900.80
6. Phase 3: Hybrid - dc_blend       → ROI: 62.87%, Bets: 315, Profit: $1900.80
8. Phase 3: Hybrid - dc_stacked     → ROI: 62.87%, Bets: 315, Profit: $1900.80
```

**5 different models, identical to 2 decimal places?** Only possible if they're all producing the same probabilities.

### Smoking Gun #3: Fold 5 Reality Check
```
Fold 5 (most recent, least memorization possible):
   lightgbm    → AUC: 0.9530, Brier: 0.1800
   xgboost     → AUC: 0.9461, Brier: 0.1565
   catboost    → AUC: 0.7880, Brier: 0.1798
```

Fold 5 shows MORE REALISTIC metrics (0.79-0.95 AUC), because it has more training data and less room for memorization. This suggests Folds 1-4 are artificially inflated.

---

## 🎯 ROOT CAUSE SUMMARY

1. **PRIMARY BUG:** `fillna(df.median())` computes median from the **same dataset** being predicted on, causing:
   - Train/test distribution mismatch
   - Perfect memorization on training data
   - All models seeing identical leaked features

2. **SECONDARY BUG:** Poisson API mismatch prevents Phase 1 baseline from working

3. **TERTIARY BUG:** Phase 3 stacking uses in-sample predictions, inheriting leakage from base models

4. **MINOR BUG:** Fold 6 with 1 match crashes evaluation

---

## ✅ FIX STRATEGY

### Fix #1: FIT IMPUTER ON TRAIN, APPLY TO TEST (CRITICAL)

**Replace all `prepare_features_*()` functions with:**

```python
def prepare_features_ml(train_df, test_df=None):
    """
    LEAKAGE-FREE feature preparation
    
    If test_df is None, returns train features only.
    If test_df is provided, fits imputer on train and applies to both.
    """
    # Define feature columns
    base_exclude = ['btts', 'season', 'date', 'home_norm', 'away_norm',
                   'home_goals', 'away_goals', 'fixture_id', 'home', 'away',
                   'venue', 'referee', 'bookmaker']
    feature_cols = [c for c in train_df.columns if c not in base_exclude]
    
    # Select numeric features
    X_train_df = train_df[feature_cols].select_dtypes(include=[np.number])
    
    # FIT imputer on training data ONLY
    train_medians = X_train_df.median()
    
    # Fill train NaN
    X_train = X_train_df.fillna(train_medians).values
    y_train = train_df['btts'].values
    feature_names = X_train_df.columns.tolist()
    
    if test_df is None:
        return X_train, y_train, feature_names
    
    # APPLY same train medians to test
    X_test_df = test_df[feature_cols].select_dtypes(include=[np.number])
    X_test = X_test_df.fillna(train_medians).values  # Use TRAIN medians
    y_test = test_df['btts'].values
    
    return X_train, y_train, X_test, y_test, feature_names
```

### Fix #2: Fix Poisson API

```python
def fit_poisson(train_df):
    model = PoissonBTTSModel()
    model.fit(train_df)  # Pass DataFrame, not arrays
    return model
```

### Fix #3: Skip Pathological Folds

```python
# In walkforward.py, after creating splits:
if len(test_df) < 30:
    print(f"⚠️  Skipping fold {fold_idx}: too few test samples")
    continue

if y_true_test.nunique() < 2:
    print(f"⚠️  Skipping fold {fold_idx}: single class in test set")
    continue
```

### Fix #4: Use Pipelines (Best Practice)

```python
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer

def fit_lightgbm(train_df):
    X, y, _ = prepare_features_ml(train_df)
    
    # Pipeline ensures imputer is fit on train, applied to test
    pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('model', lgb.LGBMClassifier(**params))
    ])
    
    pipeline.fit(X, y)
    return pipeline
```

---

## 🚀 NEXT STEPS

1. **IMMEDIATE:** Fix `prepare_features_ml()` and `prepare_features()` to fit imputer on train only
2. **FIX POISSON:** Update API signature mismatch
3. **ADD GUARDS:** Skip folds with < 30 samples or single class
4. **RE-RUN:** `python3 RUN_WALKFORWARD.py`
5. **EXPECT:** More realistic metrics (AUC 0.65-0.80, not 1.0)

---

**DO NOT USE CURRENT RESULTS FOR ANY DECISIONS. THEY ARE INVALID.**
