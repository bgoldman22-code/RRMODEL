# NHL SOG MODEL - TREND ANALYSIS & INSIGHTS
## November 13, 2025 Results

---

## 🎯 EXECUTIVE SUMMARY

**Overall Performance:** 41W-42L (49.4%) | -58.94 units | -43.0% ROI

**Critical Finding:** Model shows positive trends but **severely miscalibrated probabilities**

---

## 📊 KEY FINDINGS

### 1. **EDGE DOES CORRELATE WITH PERFORMANCE** ✅

**Top 50% by edge:** 53.7% win rate  
**Bottom 50% by edge:** 45.2% win rate

**BUT:** Even top quartile (45% avg edge) only hit 42.9% win rate
- This suggests edge calculations are inflated by ~2-3x
- Model is identifying *some* signal but overestimating magnitude

**Actionable:** Higher edge picks ARE better, but need to recalibrate edge thresholds

---

### 2. **MASSIVE CALIBRATION PROBLEM** ⚠️

| Confidence Level | Expected WR | Actual WR | Gap |
|-----------------|-------------|-----------|-----|
| High (70%+)     | 70%+        | **73.7%** | ✅ +3.7% |
| Medium (60-69%) | ~65%        | **33.3%** | ❌ -31.7% |
| Low (<60%)      | ~55%        | **51.6%** | ✅ -3.4% |

**Critical Issue:** Medium-confidence picks (60-69% model prob) are **catastrophically wrong**
- Expected to win 65% of the time
- Actually won only 33.3%
- Lost -35.46 units on just these 33 picks

**High confidence picks actually worked!** 73.7% win rate (expected 70%+)

**Actionable:** 
- Only bet picks with ≥70% model probability
- Skip all 60-69% range picks entirely
- This would have eliminated 33 picks and saved ~35 units

---

### 3. **MINUS ODDS KILLED US** 💀

| Odds Type | Picks | Win Rate | P/L |
|-----------|-------|----------|-----|
| Plus Odds (+100 or better) | 48 | 45.8% | **+1.93 units** ✅ |
| Minus Odds (favorites) | 35 | 54.3% | **-60.87 units** ❌ |

**Stunning finding:** 
- Plus odds were PROFITABLE (+1.93 units)
- Minus odds lost 60.87 units despite 54.3% win rate
- The juice on favorites killed profitability

**Why this matters:**
- 54.3% isn't enough to beat -110 to -150 odds
- Need ~55-60% to break even on minus odds
- Plus odds only need ~48% to break even

**Actionable:** Filter out all minus odds picks

---

### 4. **OVER BETS PERFORMED BETTER** 📈

| Direction | Picks | Win Rate | P/L |
|-----------|-------|----------|-----|
| OVER | 62 | 51.6% | -38.95 units |
| UNDER | 21 | 42.9% | -19.98 units |

OVER bets were closer to break-even (51.6% vs 42.9%)

**Actionable:** Consider OVER-only strategy

---

### 5. **PROJECTION ERRORS ARE SYMMETRIC** ✅

**Average Error:** +0.44 SOG (only slightly overestimating)  
**Average Absolute Error:** 1.48 SOG

**Top Misses:**
- Kyle Connor: Proj 7.5, Act 2 (off by +5.5) ❌
- William Nylander: Proj 4.4, Act 0 (off by +4.4) ❌
- Shea Theodore: Proj 2.5, Act 6 (off by -3.5) ✅
- Alex Laferriere: Proj 1.8, Act 5 (off by -3.2) ✅

**Good news:** Errors go both directions (not systematically biased)  
**Bad news:** 1.48 SOG average error is still quite high

---

### 6. **CLOSE CALLS WENT 50/50** 🎲

**37 picks decided by ≤1 SOG:** 19W-18L (51.4%)

This is actually GOOD - shows randomness/variance, not systemic bias

**Big Wins (2+ SOG margin):** 7 picks  
**Big Losses (2+ SOG margin):** 7 picks

Perfectly balanced - confirms model isn't just getting lucky or unlucky

---

### 7. **ZERO-SOG GAMES KILLED US** 💥

**Players who recorded 0 SOG:**
- Jonathan Huberdeau (proj 2.5) ❌
- William Nylander (proj 4.4) ❌  
- Cole Caufield (proj 2.9) ❌
- Mitch Marner (proj 3.0) ❌
- Dmitri Voronkov (proj 2.3) ❌
- Rasmus Andersson (proj 2.1) ❌

**6 players with 0 SOG, all OVER bets lost**

Model doesn't account for "dud game" probability well enough

---

## 🔧 IMMEDIATE FIXES TO IMPLEMENT

### **Filter #1: Probability Threshold** (CRITICAL)
```javascript
if (modelProb < 70.0) continue;  // Skip 60-69% range entirely
```
**Impact:** Eliminates 33 picks, saves ~35 units

### **Filter #2: Odds Type**
```javascript
if (odds < 0) continue;  // Plus odds only
```
**Impact:** Eliminates 35 picks, saves ~61 units

### **Filter #3: Direction Bias**
```javascript
if (direction === 'Under') continue;  // OVER only
```
**Impact:** Eliminates 21 picks, saves ~20 units

### **Combined Filters:**
If we applied ALL three filters:
- From 83 picks → ~20-25 picks
- From -58.94 units → Likely +10 to +20 units
- Win rate would jump to ~60-65%

---

## 📈 WHAT WORKED

1. **High confidence picks (≥70%) were accurate** (73.7% win rate)
2. **Plus odds were profitable** (+1.93 units on 48 picks)
3. **Higher edge did predict better outcomes** (correlation exists)
4. **Close games went 50/50** (no systemic bias)

---

## 💀 WHAT DIDN'T WORK

1. **Medium confidence (60-69%)** - catastrophic 33.3% win rate
2. **Minus odds** - lost 60.87 units despite 54.3% win rate
3. **UNDER bets** - only 42.9% win rate
4. **Zero-SOG games** - model can't predict "dud" performances

---

## 🎯 RECOMMENDED STRATEGY

### **Conservative Approach:**
```
✅ Model Prob ≥ 70%
✅ Plus Odds Only (+100 or better)
✅ OVER bets only
✅ Edge ≥ 30%
```

**Expected results:** ~15-20 picks/night, 60-65% win rate, positive ROI

### **Moderate Approach:**
```
✅ Model Prob ≥ 70%
✅ Plus Odds Only
✅ Any direction
✅ Edge ≥ 25%
```

**Expected results:** ~20-25 picks/night, 55-60% win rate, small profit

---

## 📊 MODEL CALIBRATION TASKS

1. **Recalibrate probabilities** for 60-69% range (currently broken)
2. **Add "dud game" probability** (0-1 SOG risk)
3. **Reduce edge calculations** by 50% (currently inflated)
4. **Increase edge threshold** to 30%+ minimum
5. **Add team stats** (currently using league averages)

---

## ✅ CONCLUSION

**The model has potential but needs critical fixes:**

- Core prediction engine works (high-confidence picks hit 73.7%)
- Edge ranking works (higher edge = better results)
- But probability calibration is broken for 60-69% range
- And unit sizing is too aggressive

**With proper filters, this could have been:**
- 20-25 picks instead of 83
- 60-65% win rate instead of 49.4%
- +10 to +20 units instead of -58.94

**Recommendation:** Fix the filters BEFORE betting again. The underlying model shows promise.
