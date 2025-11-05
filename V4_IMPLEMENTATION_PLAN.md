# NFL Model V4 - Implementation Plan

**Date:** November 4, 2025  
**Upgrade:** V3 → V4 (Calibration + Variance + Market Context)  
**Target:** 56%+ WR, 8%+ ROI, 0.80+ ML Monotonicity

---

## ACCEPTANCE CRITERIA

✅ **Must Pass:**
- Moneyline monotonicity ≥ 0.80 (from 0.33)
- Overall WR ≥ 56%, ROI ≥ +8%
- Totals monotonicity ≥ 0.75 (from 0.67)
- CLV tracking: ≥55% of bets beat closing

⚠️ **Warning Thresholds:**
- ROI 4-6%: Warn but continue
- ML mono 0.75-0.80: Acceptable but needs iteration

❌ **Fail Criteria:**
- ROI < 4%
- ML mono < 0.75
- CLV < 45%

---

## IMPLEMENTATION STEPS

### Phase 1: Configuration & Setup
- [x] Step 0: Create V4 config switches
- [x] Step 1: Add feature gates to config.json

### Phase 2: Early Season Improvements
- [ ] Step 2: Implement Bayesian priors (≤6 games)
- [ ] Step 3: Test prior blending

### Phase 3: Variance Model
- [ ] Step 4: Create variance.mjs helper
- [ ] Step 5: Integrate sigma into ML conversion
- [ ] Step 6: Test normal CDF conversion

### Phase 4: Trench Stats
- [ ] Step 7: Add PBWR/PRWR differential fields
- [ ] Step 8: Wire placeholders for real data

### Phase 5: Calibration
- [ ] Step 9: Create isotonic calibrator (07-calibrate-ml.mjs)
- [ ] Step 10: K-fold out-of-fold fitting
- [ ] Step 11: Apply calibration to predictions

### Phase 6: Market Context
- [ ] Step 12: Track open vs close lines
- [ ] Step 13: Calculate CLV per bet
- [ ] Step 14: Generate CLV reports

### Phase 7: Thresholds
- [ ] Step 15: Apply market-specific EV gates
- [ ] Step 16: Test bet selection logic

### Phase 8: Reporting
- [ ] Step 17: Add calibration curves
- [ ] Step 18: Add CLV summary
- [ ] Step 19: Add season bucket analysis

### Phase 9: Validation
- [ ] Step 20: Run full pipeline
- [ ] Step 21: Check acceptance criteria
- [ ] Step 22: Generate V4 comparison report

---

## EXECUTION LOG

Starting implementation...

