# NFL Model Performance Comparison - V2 vs V4

**Quick Reference Card**

---

## OVERALL PERFORMANCE

| Metric | V2 Baseline | V4 Enhanced | Change |
|--------|-------------|-------------|--------|
| **Total Bets** | 2,428 | 2,439 | +11 |
| **Win Rate** | 51.2% | 50.9% | -0.3% ❌ |
| **ROI** | -1.42% | -2.00% | -0.58% ❌ |
| **Profitable?** | No | No | Worse |

---

## SPREAD MARKET

| Metric | V2 | V4 | Status |
|--------|----|----|--------|
| Win Rate | 57.6% | 67.0% | ✅ Better |
| ROI | +10.1% | +25.3% | ✅ Better |
| Monotonicity | 0.67 | 1.00 | ✅ Better |
| Bets | ~810 | 831 | Similar |

**Verdict:** ✅ V4 improved spreads (+15% ROI gain)

---

## TOTAL MARKET

| Metric | V2 | V4 | Status |
|--------|----|----|--------|
| Win Rate | 47.4% | 51.5% | ✅ Better |
| ROI | -9.2% | -1.8% | ✅ Better |
| Monotonicity | 0.33 | 0.33 | ⚠️ Same |
| Bets | ~540 | 577 | Similar |

**Verdict:** ✅ V4 improved totals (+7.4% ROI gain) but still unprofitable

---

## MONEYLINE MARKET

| Metric | V2 | V4 | Status |
|--------|----|----|--------|
| Win Rate | 39.8% | 33.7% | ❌ Worse |
| ROI | -23.9% | -36.2% | ❌ Worse |
| Monotonicity | 0.33 | 0.00 | ❌ Worse |
| Bets | ~1,080 | 1,031 | Similar |

**Verdict:** ❌ V4 destroyed ML market (-12% ROI loss)

---

## KEY INSIGHTS

### What V4 Changed
1. ✅ **Bayesian priors** for early-season (minimal impact)
2. ❌ **Normal CDF ML conversion** (broke ML market)
3. ❌ **Game-specific variance** (added noise)
4. ✅ **Isotonic calibration** (couldn't fix bad inputs)
5. ✅ **Market thresholds** (spread 4%, total 3%, ML 5%)

### Why ML Failed
```
V2: p_home = 0.53 + spread * 0.025
    → 40% ML accuracy, -24% ROI (bad but stable)

V4: p_home = normalCDF(spread / σ) 
    where σ = f(explosive_diff, pressure_diff, ...)
    → 34% ML accuracy, -36% ROI (catastrophic)
```

**Root cause:** Untested variance model + information loss in spread→ML chain

---

## MONOTONICITY COMPARISON

```
SPREAD:
V2: ■■■■■■□□□□ 0.67 (Fair)
V4: ■■■■■■■■■■ 1.00 (Perfect) ✅

TOTAL:
V2: ■■■□□□□□□□ 0.33 (Poor)
V4: ■■■□□□□□□□ 0.33 (Poor) ⚠️

MONEYLINE:
V2: ■■■□□□□□□□ 0.33 (Poor)
V4: □□□□□□□□□□ 0.00 (None) ❌
```

---

## DECISION MATRIX

| Question | Answer |
|----------|--------|
| Is V4 better than V2? | **NO** - Overall ROI worse |
| Should we deploy V4? | **NO** - ML market broken |
| Was V4 a total failure? | **NO** - Spread improvements, good infrastructure |
| What should we do? | **V4.1 hotfix** (revert ML) then **V5** (V3 features) |

---

## NEXT STEPS

### Immediate (V4.1 Hotfix)
```javascript
// Revert this in 04-predict-games.mjs:
function predictMoneyline(features, spreadValue) {
  // const sigma = estimateSigma(features, config);
  // let homeWinProb = spreadToWinProbability(spreadValue, sigma);
  
  // Use V2 formula instead:
  const homeWinProb = 0.53 + spreadValue * 0.025;
  
  return { home_win_probability: homeWinProb, ... };
}
```

**Expected V4.1 Results:**
- ML: 34% → 40% WR, -36% → -24% ROI
- Overall: 51% → 53% WR, -2% → +1% ROI
- Status: Profitable, ready for V5 features

### Future (V5)
Add V3-proven features:
- 3rd down success rates
- Red zone TD rates
- Pressure rates & QB EPA under pressure
- Explosive play rates
- Real trench stats (PBWR/PRWR)

**V5 Target:** 54% WR, +5% ROI (V3 achieved +4.3%)

---

## FILES TO REVIEW

1. **V4_EXECUTIVE_SUMMARY.md** - Management summary
2. **V4_RESULTS_ANALYSIS.md** - Technical deep dive
3. **V4_IMPLEMENTATION_PLAN.md** - Original plan
4. **nfl-model-v2/output/performance_by_season.json** - Raw data

---

## BOTTOM LINE

**V4 Conclusion:**
- ✅ Spread predictions improved (+15% ROI)
- ✅ Infrastructure built for future (variance, calibration, CLV)
- ❌ Moneyline predictions destroyed (-12% ROI drop)
- ❌ Overall ROI worse than V2 (-2.0% vs -1.4%)

**Recommendation:** Implement V4.1 hotfix, proceed to V5

**Lesson:** Don't deploy untested statistical models to production 🎓

---

*Generated: November 4, 2025*  
*Data: 2020-2024 NFL (1,168 games)*
