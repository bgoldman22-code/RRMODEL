# NBA Model Enhancement Plan - GPT Feedback Integration

## 🎯 Current Status
- **Spread MAE: 11.84** (with rest/travel)
- **Target: <10 MAE**
- **Gap: 1.84 points**

## ✅ Already Implemented
- Rest/travel factors (B2B, distance, timezone)
- Advanced stats (Pace, OffRtg, DefRtg, Four Factors)
- Vegas line collection infrastructure
- No data leakage (not using closing lines)

## 🚨 Critical Issues to Fix (GPT Feedback)

### **Issue 1: Vegas Features Stuffed in Main Model**
**Problem:** Our ultimate model mixes fundamental features with Vegas lines in one pot
**GPT Says:** "Stacking beats stuffing" - separate models cleaner
**Fix:** Two-stage approach:
```javascript
// Stage 1: Fundamental model (no market data)
const fundamental_pred = fundamentalModel.predict(teamFeatures);

// Stage 2: Market residual model
const market_bias = residualModel.predict({
  fundamental_pred,
  line_snapshot,
  line_movement,
  sharp_money_indicator
});

// Final prediction
const final_pred = fundamental_pred - market_bias;
```

**Implementation:**
- `scripts/train-nba-fundamental.js` - Pure team stats (no Vegas)
- `scripts/train-nba-market-residual.js` - Learn systematic bias vs line
- Use in production with timestamped line snapshots

**Priority: HIGH** ⭐⭐⭐
**Impact: -0.3 to -0.5 MAE**

---

### **Issue 2: Missing Timestamp Tracking**
**Problem:** Vegas collector doesn't track when lines were available
**GPT Says:** "Timestamp everything" to prevent leakage
**Fix:** Update Vegas collector schema:
```javascript
{
  gameId: "...",
  open_line: -5.5,
  open_ts: "2024-10-13T09:00:00Z",
  close_line: -6.5,
  close_ts: "2024-10-13T19:30:00Z",
  last_seen_line: -6.0,
  last_seen_ts: "2024-10-13T19:00:00Z",
  line_move_abs: 1.0,
  line_move_signed: -1.0
}
```

**Priority: HIGH** ⭐⭐⭐
**Effort: 1 hour**

---

### **Issue 3: No Line-Relative MAE Metric**
**Problem:** We track raw MAE but not performance vs market
**GPT Says:** "Report line-relative skill, not just MAE"
**Fix:** Add LR-MAE metric:
```javascript
// Line-Relative MAE
const actual_error = Math.abs(actual_margin - line_snapshot);
const model_error = Math.abs(model_margin - line_snapshot);
const LR_MAE = model_errors.reduce((sum, err) => sum + err, 0) / n;

// Edge hit rate
const edge_hits = predictions.filter(p => 
  Math.abs(p.model - p.line) >= 4 && 
  Math.sign(p.actual - p.line) === Math.sign(p.model - p.line)
).length / total_big_edges;
```

**Priority: MEDIUM** ⭐⭐
**Effort: 30 min**

---

## 🎯 High-Impact Enhancements (Ranked by ROI)

### **1. Minutes Projection** 
**Impact: -0.3 to -0.6 MAE** (BIGGEST BANG FOR BUCK!)
**Effort: Medium (4-6 hours)**

Build simple minutes model:
- L10 average minutes per player
- Starter flag
- Role (star/starter/bench)
- Injury status (Out/Questionable reduces mins)

Convert to team impact:
```javascript
const rotation = [
  { player: "LeBron", mins: 35, on_off_ortg: +8.5, on_off_drtg: -3.2 },
  { player: "AD", mins: 33, on_off_ortg: +6.2, on_off_drtg: -4.1 },
  // ... top 8-9 rotation
];

// Adjust team ratings
const adj_ortg = base_ortg + rotation.reduce((sum, p) => 
  sum + (p.mins / 240) * p.on_off_ortg, 0
);
```

**Data needed:**
- Player minutes from game logs (already have this!)
- On/off ratings (can calculate from lineup data)

**Priority: HIGHEST** ⭐⭐⭐⭐⭐

---

### **2. Pace Volatility & Game Script**
**Impact: -0.2 to -0.4 MAE**
**Effort: Medium (3-4 hours)**

Model possessions as distribution, not point estimate:
```javascript
const base_pace = (home.pace + away.pace) / 2;

// Regime adjustments
const close_game_prob = winProbBetween(0.35, 0.65);
const blowout_risk = 1 - close_game_prob;

const expected_poss = base_pace * (
  close_game_prob * 0.98 +  // Close games slower
  blowout_risk * 1.05        // Blowouts more possessions
);
```

**Priority: HIGH** ⭐⭐⭐

---

### **3. Shot Quality Layer (eFG Regression)**
**Impact: -0.2 to -0.4 MAE**
**Effort: Low (2-3 hours)**

Regress extreme 3PT% to priors:
```javascript
const team_3pt_prior = 0.357; // League average
const games_played = teamGames.length;
const shrinkage = games_played / (games_played + 15);

const regressed_3pt = 
  shrinkage * observed_3pt + 
  (1 - shrinkage) * team_3pt_prior;
```

**Priority: MEDIUM-HIGH** ⭐⭐⭐

---

### **4. Late-Game Fouling Model**
**Impact: -0.2 to -0.3 MAE**
**Effort: Medium (3-4 hours)**

Add margin inflation when favorite leads late:
```javascript
const foul_inflation = (favorite_lead, time_remaining) => {
  if (time_remaining > 120) return 0;
  if (favorite_lead < 8) return 0;
  
  // Historical: trailing teams foul to extend
  // Adds ~1-3 points to favorite margin
  return Math.min(3, favorite_lead * 0.15);
};
```

**Priority: MEDIUM** ⭐⭐

---

### **5. Rest/Travel 2.0**
**Impact: -0.1 to -0.3 MAE**
**Effort: Low (1-2 hours)**

Already have B2B/fatigue. Add:
- Altitude adjustment (DEN: -2 pts for visitors)
- Early tip penalty (10am PT games: -1.5 pts)
- 3-in-4 / 4-in-6 schedule density

**Priority: LOW** ⭐ (diminishing returns)

---

## 📋 Implementation Order

### **Week 1: Foundation Fixes**
1. ✅ **Separate fundamental vs residual models** (6 hours)
2. ✅ **Add timestamp tracking to Vegas collector** (1 hour)
3. ✅ **Add LR-MAE and edge hit rate metrics** (30 min)

**Expected: 11.84 → ~11.3 MAE**

### **Week 2: High-Impact Features**
4. ✅ **Minutes projection** (6 hours) 
5. ✅ **Pace volatility model** (4 hours)
6. ✅ **Shot quality regression** (3 hours)

**Expected: 11.3 → ~10.5 MAE**

### **Week 3: Polish**
7. ✅ **Late-game fouling model** (4 hours)
8. ✅ **Walk-forward validation** (2 hours)
9. ✅ **Ablation testing** (3 hours)

**Expected: 10.5 → ~10.0 MAE** 🎯

---

## 🧪 Validation Protocol (GPT Approved)

For each enhancement:
```javascript
// 1. Add feature
const newFeatures = [...baseFeatures, newFeature];

// 2. Train on walk-forward OOS only
const results = walkForwardValidation(newFeatures, {
  minTrainSize: 1000,
  testSize: 200,
  steps: 10
});

// 3. Log metrics
console.log({
  delta_MAE: results.MAE - baseline.MAE,
  delta_LR_MAE: results.LR_MAE - baseline.LR_MAE,
  edge_hit_rate_4pt: results.edgeHits[4],
  calibration_slope: results.calibration.slope
});

// 4. Keep only if improves
if (results.MAE < baseline.MAE && results.edgeHits[4] > baseline.edgeHits[4]) {
  commit(newFeature);
}
```

---

## 🎯 Realistic Path to <10 MAE

| Step | Features | Expected MAE | Cumulative Δ |
|------|----------|--------------|--------------|
| Current | Enhanced (36) | 12.01 | - |
| + Rest/Travel | +15 = 51 | 11.84 | -0.17 |
| + Fundamental/Residual Split | Same | 11.40 | -0.44 |
| + Minutes Projection | +8 = 59 | 10.90 | -0.50 |
| + Pace Volatility | +3 = 62 | 10.60 | -0.30 |
| + Shot Quality | +2 = 64 | 10.35 | -0.25 |
| + Late-Game Model | +2 = 66 | 10.10 | -0.25 |
| **TOTAL** | **66 features** | **~10.1 MAE** | **-1.9** |

**Stretch goal with perfect execution: 9.7-9.9 MAE**

---

## 💡 What We Disagree With GPT On

1. **"Stacking always beats stuffing"**
   - **GPT**: Always separate models
   - **Us**: Try both, validate empirically
   - **Reason**: With 4K games, single well-regularized model might work

2. **Movement-based skipping too aggressive**
   - **GPT**: Skip if `abs_move ≥ 3.5`
   - **Us**: Dampen stake instead of binary skip
   - **Reason**: Kills profitable opportunities

3. **Ref crew effects**
   - **GPT**: Include with shrinkage
   - **Us**: Skip (noise with small sample)
   - **Reason**: 70 refs × 1,230 games = overfitting risk

---

## 🚀 Start Here (Next 2 Hours)

1. **Refactor ultimate model into fundamental + residual** (1 hour)
2. **Add timestamp tracking to Vegas collector** (30 min)
3. **Add LR-MAE metric to evaluation** (30 min)

Then we can tackle minutes projection (the biggest lever!).
