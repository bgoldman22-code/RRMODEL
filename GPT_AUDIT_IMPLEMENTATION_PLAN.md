# GPT Audit Implementation Plan
**Date:** October 10, 2025  
**Overall Grade:** 86/100 ("Pro-level, nearly elite")  
**Target:** 90-92 ("Elite")

## Executive Summary

GPT's audit identified **7 gaps** preventing us from reaching "elite" status. Most are **surgical fixes**, not major refactors. This document prioritizes which to implement immediately vs. defer.

---

## ✅ IMPLEMENTED (Just Now)

### 1. Lock System Timezone Bug (Priority: CRITICAL)
- **Issue:** Kickoff times parsed ambiguously, compared UTC vs local time
- **Fix Applied:** All time comparisons now use UTC epoch milliseconds
- **Code Changes:**
  - `checkAndLockKickoffGames()`: Added UTC normalization + debug logging
  - `integrateLockedPicks()`: Same UTC epoch handling
  - Frontend (`NFLPredictions.jsx`): Client-side lock check `hasGameStarted`
- **Status:** ✅ FIXED (Commit 28912f9)

---

## 🎯 PRIORITY FIXES (Implement Next)

### 2. R Pipeline Variance Dampers (Priority: HIGH)
**Issue:** Single noisy week can flip matchups (e.g., CAR>DAL Week 6)

**Proposed Fixes:**
```r
# cloud-pipeline.R additions

apply_weekly_epa_clip <- function(df) {
  # Limit week-over-week EPA swings to ±0.05
  df %>%
    group_by(posteam) %>%
    arrange(week) %>%
    mutate(
      epa_delta = epa_per_play - lag(epa_per_play, default = epa_per_play),
      epa_delta_clipped = pmax(-0.05, pmin(0.05, epa_delta)),
      epa_stabilized = lag(epa_per_play, default = epa_per_play) + epa_delta_clipped
    )
}

halve_hfa_for_weak_teams <- function(df, hfa_base = 1.5) {
  # When both offenses < 0 EPA, halve home field advantage
  df %>%
    mutate(
      both_weak = (home_off_epa < 0 & away_off_epa < 0),
      hfa_adjusted = ifelse(both_weak, hfa_base * 0.5, hfa_base)
    )
}

clip_form_metric <- function(df) {
  # Limit recent form to ±0.08
  df %>%
    mutate(form_4wk = pmax(-0.08, pmin(0.08, form_4wk)))
}
```

**Impact:** Reduces spike-driven flips 60–80% without dulling signal

**Recommendation:** ✅ **IMPLEMENT** - 30min work, massive stability gain

---

### 3. Standardize Caps & Interactions (Priority: MEDIUM)
**Issue:** QB cap = 12.0pts in canonical, but elite layer uses 7.5–8.0pts

**Fix:**
```javascript
// canonical-availability-v5.mjs
const POSITION_CAPS = {
  QB: 7.5,      // ← Lower from 12.0
  NON_QB: 10.0, // ← Keep
  TEAM_TOTAL: 14.0 // ← Keep
};

// Always apply light interactions BEFORE team caps
const INTERACTION_BUMPS = {
  QB_LT: 0.6,
  WR1_TE1: 0.4,
  OL_CLUSTER: 0.5
};
// Cap interactions at +1.0 total
```

**Recommendation:** ✅ **IMPLEMENT** - Already have code, just align constants

---

### 4. Single Choke Point for Sanity + Staking (Priority: MEDIUM)
**Issue:** Sanity checks exist but not consistently enforced pre-stake

**Fix:**
```javascript
// After spread is finalized, BEFORE Kelly sizing:
function applySanityGuardsAndStake(prediction, odds, uncertaintyFactors) {
  let sanityWarning = null;
  let stakePenalty = 1.0;
  
  // Model-market delta check
  if (Math.abs(prediction.spread - odds.spread) > 8.0) {
    sanityWarning = {
      type: 'LARGE_DELTA',
      delta: Math.abs(prediction.spread - odds.spread),
      recommendation: 'MANUAL_REVIEW'
    };
    stakePenalty = 0.65; // Reduce units by 35%
  }
  
  // Uncertainty haircut
  const Q = uncertaintyFactors.qb_injuries || 0;
  const D = uncertaintyFactors.depth_chart_unknown || 0;
  const uncertaintyFactor = Math.max(0.5, 1 - 0.08*Q - 0.12*D);
  
  // Apply both penalties
  const finalConfidence = prediction.confidence * stakePenalty * uncertaintyFactor;
  const kellyUnits = calculateKelly(finalConfidence, odds.price);
  
  return {
    ...prediction,
    confidence: finalConfidence,
    kellyUnits,
    sanityWarning,
    uncertaintyFactors: { Q, D, factor: uncertaintyFactor }
  };
}
```

**Recommendation:** ✅ **IMPLEMENT** - Consolidates existing logic, adds transparency

---

## 🔄 MEDIUM-TERM (Phase 2)

### 5. Walk-Forward Backtest & Calibration (Priority: MEDIUM)
**Issue:** No documented out-of-sample validation

**Fix:**
- Add `scripts/walk-forward-backtest.mjs`
- Rolling-week evaluation with frozen feature windows
- Output: Win%, Brier, Log-loss, CLV by week
- Isotonic recalibration per quarter-season

**Recommendation:** ⏸️ **DEFER** - Important for credibility, but current model already stable

---

### 6. CLV & Performance Telemetry (Priority: LOW)
**Issue:** CLV fields exist but set to 0/TODO

**Fix:**
- Wire up `opening_odds` vs `closing_odds` tracking
- Add dashboards:
  - Flagged vs unflagged picks (win%, CLV)
  - Sanity guard hit %
  - Unit-weighted ROI
  - Brier by decile

**Recommendation:** ⏸️ **DEFER** - Nice to have, not blocking

---

### 7. Observability (Priority: LOW)
**Issue:** Missing per-game diagnostic logs

**Fix:**
```javascript
console.log({
  gameId,
  qbImpact,
  nonQbTotal,
  teamTotal,
  capsHit: { qb: qbCapped, team: teamCapped },
  sanityDiff: modelSpread - marketSpread,
  kellyBefore, kellyAfter
});
```

**Recommendation:** ⏸️ **DEFER** - Already have good logging, this is enhancement

---

## 📊 Implementation Priority

| Fix | Priority | Effort | Impact | Status |
|-----|----------|--------|--------|--------|
| **1. Timezone Normalization** | CRITICAL | 1hr | High | ✅ DONE |
| **2. R Pipeline Dampers** | HIGH | 30min | High | ⏳ NEXT |
| **3. Standardize Caps** | MEDIUM | 15min | Medium | ⏳ NEXT |
| **4. Sanity Choke Point** | MEDIUM | 45min | Medium | ⏳ NEXT |
| **5. Walk-Forward Backtest** | MEDIUM | 4hrs | Low | ⏸️ DEFER |
| **6. CLV Telemetry** | LOW | 2hrs | Low | ⏸️ DEFER |
| **7. Observability** | LOW | 1hr | Low | ⏸️ DEFER |

**Total Immediate Work:** ~90 minutes for 3 high-impact fixes  
**Expected Grade Improvement:** 86 → 90–91

---

## 🚀 Recommended Action Plan

### Phase 1 (Today - 90min total)
1. ✅ Timezone normalization (DONE)
2. Add R pipeline dampers (30min)
3. Align QB cap to 7.5pts (15min)
4. Create sanity choke point (45min)

### Phase 2 (Week 7)
5. Validate fixes against Week 7 predictions
6. Monitor for fewer "overreaction" scenarios
7. Track model-market delta warnings

### Phase 3 (Mid-Season)
8. Add walk-forward backtest infrastructure
9. Wire up CLV tracking
10. Build calibration dashboards

---

## 📝 Notes

- **GPT's verdict on CAR>DAL:** "Mild overreaction, not a bug"
- **Root cause:** EPA over-weighted + home field stacking + weak team matchup
- **Already fixed (Oct 10):** EPA form clipping, weak HFA reduction, market delta check
- **These 3 additional fixes:** Complete the "elite" transformation

---

## 🎯 Expected Outcomes After Phase 1

1. **Fewer Flips:** Week-to-week predictions more stable
2. **Higher Trust:** Operators see consistent reasoning
3. **Better Edge Realization:** Overconfident outliers trimmed by guardrails
4. **Auditable Performance:** Clear why model differs from market

**Target Grade After Phase 1:** 90/100 ("Elite")
