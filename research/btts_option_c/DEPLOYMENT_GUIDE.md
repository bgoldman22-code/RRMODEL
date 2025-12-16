# 🚀 Quick Deployment Guide - Clean V1 Models

**Status:** Production-Ready (No Leakage)  
**Date:** December 10, 2025

---

## ✅ What We Have

### Models Saved:
- ✅ `logistic_btts_clean_v1.pkl` ⭐ **RECOMMENDED**
- ✅ `poisson_btts_clean_v1.pkl`
- ✅ `random_forest_btts_clean_v1.pkl`
- ✅ `catboost_btts_clean_v1.pkl`
- ✅ `lightgbm_btts_clean_v1.pkl`
- ✅ `xgboost_btts_clean_v1.pkl`

### Validation Results:
- ✅ **Temporal Holdout:** 546 test matches (2024-05-11 to 2025-12-08)
- ✅ **Walk-Forward:** 5 folds, expanding window
- ✅ **Sanity Checks:** All passed (no leakage detected)

---

## 🎯 Recommended Deployment

### PRIMARY: Logistic Regression

**Model:** `logistic_btts_clean_v1.pkl`

**Performance:**
- AUC: 0.7794
- Brier: 0.1910
- ROI @ 0.55: **43.47%**
- ROI @ 0.60: **42.54%**

**Betting Strategy:**
```python
if predicted_probability >= 0.55 and predicted_probability > implied_probability:
    place_bet("BTTS Yes", stake=10)
```

**Expected Results (per 100 matches):**
- Bets placed: ~29
- Wins: ~24
- Profit: ~$125
- Win rate: ~84.7%

---

## 💻 Usage Example

### Load Model:

```python
import pickle
import pandas as pd

# Load model
with open('models/logistic_btts_clean_v1.pkl', 'rb') as f:
    model_dict = pickle.load(f)

print(f"Model: {model_dict['model_name']}")
print(f"Version: {model_dict['version']}")
print(f"Saved: {model_dict['saved_at']}")
```

### Make Predictions:

```python
from src.model_baselines import predict_logistic
from src.build_features import add_rolling_form_features, add_match_level_features

# Prepare new match data
new_match_df = ...  # Load upcoming match(es)

# Engineer features (same as training)
new_match_df = add_rolling_form_features(new_match_df, windows=[5, 10])
new_match_df = add_match_level_features(new_match_df)

# Get predictions
y_proba = predict_logistic(model_dict, new_match_df)

print(f"BTTS Yes probability: {y_proba[0]:.3f}")
```

### Betting Decision:

```python
# Get odds
btts_yes_odds = new_match_df['btts_yes_odds'].iloc[0]
implied_prob = 1.0 / btts_yes_odds

# Edge calculation
edge = y_proba[0] - implied_prob

# Decision
if y_proba[0] >= 0.55 and edge > 0:
    print(f"✅ BET: BTTS Yes @ {btts_yes_odds:.2f}")
    print(f"   Model prob: {y_proba[0]:.3f}")
    print(f"   Implied prob: {implied_prob:.3f}")
    print(f"   Edge: {edge:.3f} ({edge*100:.1f}%)")
else:
    print("❌ NO BET")
```

---

## 📊 Integration with Profile C

### Option 1: Replace BTTS Component

Replace existing Profile C BTTS predictions with logistic model predictions.

**Advantages:**
- Higher ROI (43.47% vs 19.64%)
- Better calibrated probabilities
- Uses Northern Star indicators

**Steps:**
1. Load `logistic_btts_clean_v1.pkl`
2. Generate predictions for upcoming matches
3. Feed probabilities into Profile C betting strategy
4. Monitor live performance vs historical backtest

### Option 2: Ensemble with Profile C

Average logistic + Profile C Dixon-Coles predictions.

**Advantages:**
- Combines probabilistic (DC) + ML (logistic) approaches
- More robust to model drift
- Potentially higher ROI

**Steps:**
```python
# Get both predictions
dc_prob = profile_c_prediction(match)
ml_prob = logistic_prediction(match)

# Ensemble (simple average)
final_prob = 0.5 * dc_prob + 0.5 * ml_prob

# Or weighted by historical performance
final_prob = 0.4 * dc_prob + 0.6 * ml_prob  # More weight to ML
```

### Option 3: A/B Test

Run both strategies in parallel, track performance.

**Steps:**
1. Deploy logistic model for 50% of BTTS bets
2. Keep Profile C for other 50%
3. Track ROI, Brier, edge for both
4. After 50+ matches, choose winner

---

## 🔍 Monitoring & Validation

### Track These Metrics:

1. **ROI** - Should stay near 43.47% (allow ±10% variance)
2. **Brier Score** - Should stay near 0.19 (lower is better)
3. **Edge Distribution** - Track actual edge vs predicted
4. **Win Rate** - Should stay near 84.7% for bets taken

### Alert Conditions:

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| ROI | 43.47% | < 30% | < 15% |
| Brier | 0.19 | > 0.25 | > 0.30 |
| Win Rate | 84.7% | < 75% | < 70% |
| Edge | Positive | < 0 for 10+ bets | < 0 for 20+ bets |

### Retraining Triggers:

- ⚠️ ROI drops below 30% for 50+ bets
- ⚠️ Brier score exceeds 0.25 consistently
- ⚠️ New season starts (different team dynamics)
- ⚠️ Major rule changes or external factors

---

## 🧪 Testing Checklist

Before production deployment:

- [ ] Load model successfully
- [ ] Generate predictions for 10 test matches
- [ ] Verify probabilities are in [0, 1] range
- [ ] Confirm no `goals_fpl` features used
- [ ] Test betting decision logic (threshold + edge)
- [ ] Simulate 1 week of matches (dry run)
- [ ] Set up monitoring dashboard
- [ ] Define alert thresholds
- [ ] Document rollback procedure

---

## 📞 Support & Documentation

**Full Documentation:**
- `BTTS_CLEAN_RETRAINING_SUMMARY.md` - Complete validation results
- `TARGET_LEAKAGE_ROOT_CAUSE.md` - Leakage bug analysis
- `README.md` - Project overview

**Key Files:**
- `RUN_TEMPORAL_HOLDOUT.py` - Validation script
- `SAVE_CLEAN_V1_MODELS.py` - Model training script
- `src/model_baselines.py` - Prediction functions

**Questions?**
- Review sanity check results in `BTTS_CLEAN_RETRAINING_SUMMARY.md`
- Check feature list: 84 features, 0 leaked columns
- Verify predictions match validation set performance

---

**Version:** Clean V1  
**Status:** Ready for Production Testing  
**Next Review:** After 50 live matches tracked
