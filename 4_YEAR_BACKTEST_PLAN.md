# 🎯 4-Year Backtest Analysis Plan

## 📊 What We're Validating

### Data Scale:
- **4 seasons**: 2021-22, 2022-23, 2023-24, 2024-25
- **Expected dataset**: ~60,000+ player-game records
- **~700 unique players** across all teams
- **Training on real outcomes** vs actual game results

---

## 🔬 Key Metrics We'll Learn

### 1. **Mean Absolute Error (MAE)**
**What it tells us**: Average projection accuracy
- **Elite threshold**: < 0.8 shots MAE
- **Good**: 0.8-1.2 shots
- **Acceptable**: 1.2-1.5 shots
- **Weak**: > 1.5 shots

### 2. **Pearson Correlation**
**What it tells us**: How well projections track with actuals
- **Elite**: > 0.65 correlation
- **Strong**: 0.55-0.65
- **Moderate**: 0.45-0.55
- **Weak**: < 0.45

### 3. **Bias Analysis**
**What it tells us**: Systematic over/under prediction
- **Target**: ±0.05 shots (< 2% bias)
- **Acceptable**: ±0.15 shots (< 5% bias)
- **Problematic**: > ±0.20 shots

### 4. **Directional Accuracy**
**What it tells us**: Where model is confident vs guessing
- Track over-projections by magnitude
- Track under-projections by magnitude
- Identify sweet spots (projection ranges with low MAE)

---

## 🎲 What We'll Discover

### Learned Parameters (from 60k+ games):

#### **Hot Streak Effect**
- Current assumption: +15%
- Early test data: +41%
- **4-year data will reveal**: True predictive power

#### **Cold Streak Effect**
- Current assumption: -15%
- Early test data: -49%
- **4-year data will reveal**: Actual regression amount

#### **TOI vs Shot Rate Curve**
- Current assumption: √x (0.5 exponent)
- Early test data: x^1.42
- **4-year data will reveal**: Stable power law exponent

#### **Home Advantage Per Team**
- Current assumption: 8% for all teams
- **4-year data will reveal**: 
  - Colorado altitude effect
  - Sea-level teams
  - Small rink effects (Arizona)
  - Crowd impact variations

#### **ZINB Dispersion**
- Current assumption: 2.4 (F), 3.5 (D)
- Early test data: 1.1-1.14 (elite players only)
- **4-year data will reveal**: Dispersion by archetype
  - Elite shooters vs grinders
  - Offensive D vs defensive D
  - Young players vs veterans

---

## 📈 Expected Backtest Results

### Optimistic Scenario (Model is Elite):
```
MAE: 0.75-0.90 shots
Correlation: 0.62-0.68
Bias: ±0.05 shots
Model Score: 75-85/100

Interpretation: Ready for real money with proper Kelly sizing
```

### Realistic Scenario (Model is Strong):
```
MAE: 0.95-1.15 shots
Correlation: 0.55-0.62
Bias: ±0.10 shots
Model Score: 65-75/100

Interpretation: Profitable with 0.25 Kelly, needs monthly re-fit
```

### Concerning Scenario (Model Needs Work):
```
MAE: > 1.3 shots
Correlation: < 0.50
Bias: > ±0.15 shots
Model Score: < 60/100

Interpretation: Add more features (score effects, matchups, etc.)
```

---

## 🔍 Stratified Analysis We'll Get

### By Projection Level:
- **Low (< 2.0)**: Expect high accuracy (grinders, 4th liners)
- **Medium (2.0-3.0)**: Most volume, most important to get right
- **High (3.0-4.0)**: Elite players, should have lower MAE
- **Very High (> 4.0)**: Small sample, but critical for betting

### By Actual Outcome:
- **0-1 shots**: Checking if we catch "off nights"
- **1-2 shots**: Below-average games
- **2-3 shots**: Average games (most common)
- **3-4 shots**: Above-average games
- **4+ shots**: Elite performances

### By Player Position:
- **Forwards**: Higher variance, more TOI-dependent
- **Defensemen**: Lower shot volume, more consistent

### By PP Unit:
- **PP1**: Should see clear shot boost
- **PP2**: Moderate boost
- **No PP**: Baseline

---

## 💰 Betting Implications

### If MAE < 1.0 and Correlation > 0.60:

**High Confidence Plays** (Projection > 3.5):
- Expected accuracy: ±1.0 shot
- If line is 2.5, we have ~1.0 shot edge
- **Bet sizing**: 0.25-0.5 Kelly

**Medium Confidence Plays** (Projection 2.8-3.2 for 2.5 line):
- Expected accuracy: ±0.8 shot
- Edge is smaller (0.3-0.7 shots)
- **Bet sizing**: 0.1-0.25 Kelly

**Avoid** (Projection close to line):
- Within 0.3 shots of line
- Vig will eat the edge
- **Bet sizing**: 0 Kelly (skip)

---

## 🚨 Red Flags to Watch For

1. **Correlation < 0.50**
   - Model has weak predictive power
   - Need to add features (score effects, rest days, etc.)

2. **Bias > ±0.15 shots**
   - Systematic over/under prediction
   - Need to recalibrate multipliers

3. **MAE increases with projection level**
   - Model gets less confident on high-volume players
   - Indicates overfitting or missing context

4. **Error distribution not normal**
   - Fat tails indicate outlier events we're missing
   - Need more robust dispersion modeling

---

## 📅 Timeline

1. **Data Fetch**: 30-60 minutes (running now)
2. **Parameter Fitting**: 2-5 minutes
3. **Backtest Validation**: 5-10 minutes
4. **Total**: ~45-75 minutes

---

## 🎯 Success Criteria

To deploy with confidence:
- ✅ MAE < 1.0 shots
- ✅ Correlation > 0.55
- ✅ Bias < ±0.10 shots
- ✅ Model Score > 65/100
- ✅ Low projections accurate (MAE < 0.8)
- ✅ High projections show clear edge

If we hit these targets, we have a **profitable betting model**.

---

## 🔄 Next Steps After Backtest

1. **Deploy learned parameters** to projection engine
2. **Monitor live performance** for 100 bets
3. **Re-fit monthly** as meta shifts
4. **Add features** if needed:
   - Score effects (trailing teams shoot more)
   - Rest days / back-to-backs
   - Opponent-specific matchups
   - Goalie save% impact

---

## 💡 Why This Approach is Elite

**Traditional sports betting models**:
- Backtest against arbitrary lines (e.g., 2.5 universal)
- Can't validate accuracy, only win rate
- Prone to false confidence

**Our approach**:
- Backtest against ACTUAL GAME OUTCOMES
- Measure real prediction accuracy (MAE)
- Identify where model is strong vs weak
- Calibrate confidence levels empirically

**This is how quants validate models in finance.**

---

**Status**: Data fetch in progress (30-60 min)
**Next**: Parameter fitting → Backtest → Deploy

🧠🔥 **REAL ELITE. NO ASSUMPTIONS. ONLY DATA.**
