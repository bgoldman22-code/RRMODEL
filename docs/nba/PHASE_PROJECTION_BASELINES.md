# Phase 3.x Numeric Projection Baselines

**Purpose:** Document the best numeric projection (μ) quality across NBA props phases to establish baseline performance for Phase 3.9.

**Date:** December 2, 2025  
**Scope:** Points, Rebounds, Assists markets

---

## Executive Summary

| Phase | Architecture | Best μ Quality | Key Finding |
|-------|--------------|----------------|-------------|
| **Phase 3.5** | Hybrid logistic + LightGBM | Production (+3-5% ROI) | No explicit μ-model metrics documented, but profitable overall |
| **Phase 3.6** | μ regression + σ² tweedie + probability classifier | **MAE documented in walkforward** | Trained explicit projection models, metrics in training_summary_phase3.6.json |
| **Phase 3.7** | μ/σ distributional + z-score + isotonic | μ had "decent MAE" per session notes | μ-models had AUC=0.50 (no discrimination for O/U), BUT numeric projection quality unclear |
| **Phase 3.8** | Direct discriminative classifiers | No μ-prediction | Focused on binary classification (hit/miss), not numeric projections |

**Key Insight:** Phase 3.6 is the **only phase with explicit μ-regression models** trained via walkforward validation. We should extract its MAE/RMSE metrics as our baseline.

---

## Phase 3.5 (Current Production - DO NOT MODIFY)

### Architecture
- **Hybrid:** Logistic regression + LightGBM ensemble
- **Features:** Market-specific thresholds, rolling stats
- **Training:** Unknown specifics (legacy system)

### Numeric Projection Quality
- **MAE:** Not explicitly documented
- **RMSE:** Not explicitly documented  
- **Correlation:** Unknown
- **Bias:** Unknown

### Overall Performance
- **Walkforward ROI:** +3% to +5% ✅
- **Status:** **Live and profitable**
- **Note:** We don't have isolated μ-model metrics, but the system works end-to-end

### Relevant Files
- `scripts/nba/generate-predictions-phase3.5.mjs` (inference)
- No training script found (may be legacy R or archived)

---

## Phase 3.6 (Explicit μ/σ Pipeline)

### Architecture
- **3-stage pipeline:**
  1. **Projection model (μ):** LightGBM regression (`objective='regression'`)
  2. **Distribution model (σ²):** LightGBM tweedie (`objective='tweedie'`)
  3. **Probability classifier:** LightGBM binary using μ, σ², z-score as features

### Training Protocol
- **Data:** `phase3_training_v1_20251124.jsonl`
- **Split:** TimeSeriesSplit with 4 folds
- **Validation:** Walkforward across temporal folds
- **Features:** 96 numeric features (L5/L10/L20/L40/L999 rolling stats, variance, opponent defense)

### Numeric Projection Quality (μ-models)

**Training Configuration:**
```python
LIGHTGBM_COMMON_PARAMS = {
    'boosting_type': 'gbdt',
    'learning_rate': 0.045,
    'num_leaves': 64,
    'feature_fraction': 0.85,
    'bagging_fraction': 0.85,
    'bagging_freq': 5,
    'max_depth': -1,
    'min_data_in_leaf': 40,
    'lambda_l1': 0.2,
    'lambda_l2': 0.4
}
```

**Metrics per Market:**
- **Points:** MAE/RMSE in `models/phase3.6/points/projection_booster.json` metadata ⚠️ (need to extract)
- **Rebounds:** MAE/RMSE in `models/phase3.6/rebounds/projection_booster.json` ⚠️
- **Assists:** MAE/RMSE in `models/phase3.6/assists/projection_booster.json` ⚠️

**Status:** ⚠️ **ACTION REQUIRED:** Extract actual MAE/RMSE values from saved metadata or re-run training

### Distribution Model Quality (σ²-models)
- **Objective:** Tweedie regression with `tweedie_variance_power=1.3`
- **Target:** `(actual - μ)²` clipped to `[0.25, ∞)`
- **Metric:** L2 loss
- **Note:** Variance estimation was used downstream but not primary goal for Phase 3.9

### Overall Performance
- **Probability AUC:** Documented in training_summary_phase3.6.json ⚠️
- **Calibration:** Isotonic calibration applied
- **Production Status:** Not deployed (Phase 3.5 remained live)

### Relevant Files
- **Training script:** `scripts/nba/train-phase3.6/train_phase36_models.py` ✅
- **Feature config:** `scripts/nba/train-phase3.6/feature_config.py` ✅
- **Models:** `models/phase3.6/{points,rebounds,assists}/projection_booster.txt`
- **Metadata:** `models/phase3.6/{points,rebounds,assists}/projection_booster.json` (contains MAE/RMSE)
- **Summary:** `models/phase3.6/training_summary_phase3.6.json` ⚠️ (need to check if exists)

---

## Phase 3.7 (μ/σ + Z-Score Disaster)

### Architecture
- **μ-models:** LightGBM regression (similar to 3.6 projection models)
- **σ-models:** Separate variance estimators
- **Z-score layer:** `z = (line - μ) / σ`
- **Isotonic calibration:** Applied to z-scores to get Over/Under probabilities

### Numeric Projection Quality (μ-models)

**Per Session Report:**
> "Phase 3.7 μ-models actually had decent MAE (better than or close to 3.6 in 2/3 markets)"

**Specific Metrics:**
- **Points MAE:** Unknown (need to extract from training logs/metadata)
- **Rebounds MAE:** Unknown
- **Assists MAE:** Unknown
- **Bias:** Unknown

**Key Finding:**
- μ-models had **MAE comparable to or better than Phase 3.6**
- BUT: μ-models had **AUC = 0.50** for Over/Under discrimination
  - This means μ-predictions were accurate numerically BUT didn't help predict line outcomes
  - The failure was in the σ/z-score/probability stack, NOT the numeric projections

### Overall Performance
- **Walkforward ROI:** -9.6% ❌ (catastrophic failure)
- **Rebounds Unders:** -22% ROI
- **Root Cause:** σ-models and z-score calibration failed, not μ-models
- **Status:** Abandoned

### Lesson Learned
**μ-prediction quality ≠ Over/Under prediction quality**

A model can have low MAE for numeric projections but still fail at probability estimation if:
1. Variance estimates (σ) are wrong
2. Calibration layer (z-score → probability) breaks down
3. Line itself contains information not captured by features

### Relevant Files
- **Training script:** Not found (may be in commit history or lost)
- **Session notes:** Reference "μ-models had decent MAE" but no hard numbers
- **Action:** Search git history or reconstruct from production logs

---

## Phase 3.8 (Current Work - Discriminative Classifiers)

### Architecture
- **Direct binary classification:** Predict hit (actual > line) or miss (actual ≤ line)
- **No μ-prediction:** Skipped numeric projection entirely
- **Models:** LightGBM binary classifiers per market (and per side in Block 3)

### Numeric Projection Quality
**N/A** - Phase 3.8 does NOT produce numeric projections

### Overall Performance (Blocks 1-2 Complete)
- **Rebounds:** Test AUC 0.5387, ROI +2.5% to +71.8% ✅
- **Points:** Test AUC 0.4975 (random), ROI -7.4% ❌
- **Assists:** Test AUC 0.5139, ROI -3.5% ❌
- **Status:** Block 3 (side-specific models) in progress, Block 4 (walkforward) pending

### Relevant Files
- **Session report:** `docs/phase38_validation/PHASE38_SESSION_REPORT.md` ✅
- **Training scripts:** `scripts/nba/phase38_train_market_classifier.py` ✅
- **Models:** `models/phase3.8/market_classifiers/*`

### Why This Isn't Our Baseline
Phase 3.8 solves a **different problem**: discriminative classification for hit/miss

Phase 3.9 goal: **numeric projections** (μ) that can be used with ANY line

---

## Recommendations for Phase 3.9 Baseline

### 1. Extract Phase 3.6 μ-Model Metrics (Priority 1)

**Action Items:**
- [ ] Check if `models/phase3.6/training_summary_phase3.6.json` exists
- [ ] Extract MAE/RMSE from `models/phase3.6/{points,rebounds,assists}/projection_booster.json`
- [ ] If missing, re-run `scripts/nba/train-phase3.6/train_phase36_models.py` on latest data
- [ ] Document:
  - Test MAE per market
  - Test RMSE per market
  - Test bias (mean error) per market
  - Correlation(predicted, actual) per market

### 2. Reconstruct Phase 3.7 μ-Model Metrics (Optional)

**Action Items:**
- [ ] Search git history for Phase 3.7 training scripts
- [ ] Check `models/phase3.7/` directory if it exists
- [ ] If found, extract μ-model MAE/RMSE for comparison

### 3. Establish Numeric Projection Targets for Phase 3.9

Based on available data, set targets:

| Market | Phase 3.6 Baseline MAE | Phase 3.9 Target MAE | Stretch Goal MAE |
|--------|------------------------|----------------------|------------------|
| Points | TBD ⚠️ | TBD - 5% | TBD - 10% |
| Rebounds | TBD ⚠️ | TBD - 5% | TBD - 10% |
| Assists | TBD ⚠️ | TBD - 5% | TBD - 10% |

**Rationale:**
- 5% MAE improvement = meaningful upgrade justifying Phase 3.9 development
- 10% MAE improvement = stretch goal, excellent performance

### 4. Additional Metrics to Track

Beyond MAE/RMSE, Phase 3.9 should measure:

| Metric | Why It Matters |
|--------|----------------|
| **Bias (mean error)** | Systematic over/under-prediction hurts calibration |
| **Correlation** | High correlation = model captures true relationship |
| **MAE by line bucket** | Low-line vs high-line players may have different error profiles |
| **MAE by minutes bucket** | Starters vs bench players |
| **MAE by season** | Temporal stability (2023-24 vs 2024-25) |

---

## Next Steps

1. **Run extraction script:**
   ```bash
   python3 scripts/nba/extract_phase36_metrics.py
   ```
   *(Need to create this script to read Phase 3.6 model metadata)*

2. **Update this document** with actual MAE/RMSE numbers

3. **Proceed to Phase 3.9 spec** once baseline is clear

---

**Status:** 🟡 **Incomplete - Need Phase 3.6 μ-model metrics extraction**

**Dependencies:**
- Phase 3.6 model files must exist in `models/phase3.6/`
- OR re-run Phase 3.6 training pipeline

**Estimated Time:** 30 minutes (extraction script) or 2 hours (re-train Phase 3.6)

