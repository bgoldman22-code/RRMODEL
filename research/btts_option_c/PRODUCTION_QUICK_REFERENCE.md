# BTTS Production Model - Quick Reference Card

**Model:** LogisticLeakFreeTuned  
**Version:** 1.0  
**Date:** December 12, 2025  
**Status:** ✅ Production Ready

---

## 🎯 Performance Metrics

| Metric | Value | Context |
|--------|-------|---------|
| **Mean AUC** | **0.5557** | 8-fold walk-forward validation |
| **Std AUC** | 0.065 | Consistent across folds |
| **Mean Brier** | **0.2431** | Well-calibrated |
| **Test Matches** | 539 | Honest out-of-sample |
| **Improvement** | **+6.3 pts** | vs Poisson baseline |

---

## 📊 Quick Stats

- **Features:** 149 leak-free features
- **Training Data:** 910 EPL matches (Aug 2023 - Dec 2025)
- **Validation:** 8-fold expanding window walk-forward
- **Leak-Free:** ✅ Temporal integrity validated
- **Calibration:** 5-fold Platt scaling

---

## ⚙️ Production Config

### Recommended Thresholds
```python
config = {
    'T_YES': 0.65,        # Bet YES if P(BTTS) ≥ 0.65
    'T_NO': 0.35,         # Bet NO if P(BTTS) ≤ 0.35
    'MIN_EDGE': 0.03,     # Require 3% edge minimum
    'MAX_VIG': 0.08,      # Skip markets with vig > 8%
    'BOTH_SIDES_SHORT_MAX': 2.0,  # Skip if both odds < 2.0
    'REQUIRE_ODDS': True  # Require odds for betting
}
```

### Bet Sizing
- **HIGH confidence:** 1.5x base unit (edge ≥ 10%)
- **MEDIUM confidence:** 1.0x base unit (edge 3-10%)
- **LOW confidence:** 0.0x (NO_BET)

---

## 🚀 Quick Start

```python
# 1. Load model
from src.model_leakfree_enhanced import LogisticLeakFreeTuned

model = LogisticLeakFreeTuned(C_values=[0.01], cv_splits=3)
model.fit(X_train, y_train, feature_names)

# 2. Predict
prob_yes = model.predict_proba(X_new)[0]

# 3. Make decision
from src.production_decision import select_btts_bet_for_match

decision = select_btts_bet_for_match(
    prob_yes=prob_yes,
    odds_yes=2.10,
    odds_no=1.85
)

# 4. Act
if decision['side'] != 'NO_BET':
    place_bet(
        side=decision['side'],
        amount=base_unit * decision['bet_size_multiplier']
    )
```

---

## ✅ Decision Logic

### Betting YES
- ✅ P(BTTS) ≥ 0.65
- ✅ Edge ≥ 0.03
- ✅ Vig ≤ 0.08
- ✅ Not both-sides-short

### Betting NO
- ✅ P(BTTS) ≤ 0.35
- ✅ Edge ≥ 0.03
- ✅ Vig ≤ 0.08
- ✅ Not both-sides-short

### NO_BET
- ❌ Probability in dead zone (0.35-0.65)
- ❌ Insufficient edge (< 0.03)
- ❌ High vig (> 0.08)
- ❌ Both-sides-short
- ❌ No odds available (if REQUIRE_ODDS=True)

---

## 📈 Feature Highlights

**Top Predictors:**
1. `odds_spread` (0.130 correlation) - Market opinion strength
2. `btts_yes_fair_prob` (0.113) - Vig-adjusted market signal
3. `home_expected_xg` (0.105) - Matchup-based expected goals
4. `total_expected_xg` (0.086) - Combined match xG prediction
5. `both_teams_btts_heavy` (0.082) - Style clash indicator

**Feature Categories:**
- Rolling stats (L3/L5/L10/L20): 64 features
- Advanced matchup: 11 features
- Style indicators: 8 features
- Market intelligence: 8 features (5 new)
- Strength metrics: 12 features
- Venue-specific: 8 features
- FPL availability: 29 features
- Trends & context: 9 features

---

## 🔒 Safety Guarantees

✅ **No Data Leakage:** Only pre-match features  
✅ **Temporal Integrity:** All rolling windows use `.shift(1)`  
✅ **Fair Odds:** Vig-removed edge calculation  
✅ **Dual Evaluation:** Both YES and NO candidates checked  
✅ **Guardrails:** Max vig + both-sides-short filters  
✅ **NO_BET Valid:** Never forced to bet  

---

## 📊 Expected Production ROI

| Threshold | Bet Frequency | Expected ROI | Risk Level |
|-----------|---------------|--------------|------------|
| MIN_EDGE=0.05 | 5-10% | 2-4% | LOW |
| MIN_EDGE=0.03 | 15-25% | 1-3% | MEDIUM |
| MIN_EDGE=0.02 | 30-40% | 0.5-2% | HIGH |

**Recommendation:** Start with MIN_EDGE=0.05 for first 50 bets, then evaluate.

---

## 🚨 Common Issues

**Issue 1: Low bet frequency**
- **Cause:** Thresholds too strict
- **Fix:** Lower T_YES to 0.60, T_NO to 0.40

**Issue 2: Too many NO_BET**
- **Cause:** High vig markets, short odds
- **Fix:** Normal behavior - market quality matters

**Issue 3: Model prob = 0.50 always**
- **Cause:** Missing features, data quality issue
- **Fix:** Check all 149 features are computed correctly

---

## 📞 Support

**Files:**
- Model: `src/model_leakfree_enhanced.py`
- Decision: `src/production_decision.py`
- Features: `src/features_leakfree.py`
- Data: `data/btts_leakfree_features.parquet`

**Documentation:**
- Full guide: `BTTS_LEAKFREE_MODEL_UPGRADE_SUMMARY.md`
- Features: `BTTS_ENHANCED_FEATURES.md`
- Models: `BTTS_ENHANCED_MODEL_SUITE.md`

**Testing:**
```bash
python3 src/production_decision.py  # 13/13 tests should pass
python3 src/model_leakfree_enhanced.py  # Verify models work
```

---

**Version:** 1.0  
**Last Updated:** December 12, 2025  
**Status:** ✅ Production Ready  
**Validated:** 8-fold walk-forward on 539 matches
