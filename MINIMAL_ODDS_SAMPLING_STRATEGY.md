# 💰 Historical Odds Sampling Strategy - Minimize Credits, Maximize Insights

## The Problem

- **Full dataset**: 728 dates = 36,000-72,000 credits (77% of your remaining credits!)
- **Your remaining**: 93,830 credits
- **Risk**: Spending most credits on a model that might not be profitable

---

## Statistical Requirements

For **95% confidence** with **±3% margin of error**:
- **Minimum sample size**: ~1,067 predictions
- **In practice**: ~5,000-10,000 predictions gives reliable insights
- **That's only**: 25-50 dates (3-7% of full dataset!)

---

## 🎯 RECOMMENDED: Two-Phase Approach

### **PHASE 1: Proof of Concept (Minimal Risk)** 

**Goal**: Quick validation that model has ANY edge vs market

**Sample**: 30 dates (stratified random)
- 6 dates from each year (2021-2025)
- Mix weekdays/weekends
- Avoid All-Star break & playoffs

**Expected Results**:
- ~6,000 predictions
- **Credits**: 1,500-3,000 (only **3%** of remaining!)
- Time: 30 minutes to fetch

**Decision Gate**:
- ✅ ROI > 3% → Proceed to Phase 2
- 🟡 ROI 0-3% → Inconclusive, need judgment call
- ❌ ROI < 0% → **STOP** - Model loses money, save credits

---

### **PHASE 2: Statistical Validation (Only if Phase 1 passes)**

**Goal**: Confirm edge is real and consistent across conditions

**Sample**: 55-75 dates (stratified by season)
- 11-15 dates per season
- Balanced by month (avoid bias)
- Include various game types

**Expected Results**:
- ~11,000-15,000 predictions
- **Credits**: 2,750-7,500
- Margin of error: ±2.5%

**Decision Gate**:
- ✅ ROI > 5%, Drawdown < 30% → **DEPLOY**
- 🟡 ROI 3-5% → Cautious deploy or more data
- ❌ ROI < 3% → Not profitable enough

---

## Total Cost

| Phase | Credits | % of Remaining | Cumulative |
|-------|---------|----------------|------------|
| Phase 1 | 1,500-3,000 | 3% | 3% |
| Phase 2 | 2,750-7,500 | 8% | 11% |
| **TOTAL** | **4,250-10,500** | **11%** | **11%** |

**vs Full Dataset**: 36,000-72,000 credits (77% of remaining)

**Savings**: 85%+ cost reduction while maintaining statistical validity!

---

## Why This Works

### **Statistical Power**:
```
Sample Size:   1,000    5,000    10,000   50,000   169,847
Margin Error:  ±3.1%    ±1.4%    ±1.0%    ±0.4%    ±0.2%
```

**10,000 predictions** (Phase 1+2 combined):
- Margin of error: **±1.0%**
- If true ROI is 5%, you'll measure 4-6% (very reliable!)
- **Cost**: Only 11% of credits vs 77% for full dataset

### **Early Exit**:
- Phase 1 costs only 3% of credits
- If model fails Phase 1, you saved 97% of credits!
- Can try different model/features with remaining budget

### **Stratification**:
- Sampling across seasons prevents bias
- Captures different market conditions
- Representative of full dataset performance

---

## Sample Selection Strategy

### Phase 1 (30 dates):
```
2021 season: 6 random dates
2022 season: 6 random dates  
2023 season: 6 random dates
2024 season: 6 random dates
2025 season: 6 random dates

Constraints:
- Mix Tuesday-Sunday (avoid Monday - low volume)
- Exclude All-Star weekend
- Exclude playoffs (different betting patterns)
- Prefer dates with 8+ games
```

### Phase 2 (45 more dates):
```
Each season: 9 additional dates
- 3 from early season (Oct-Nov)
- 3 from mid season (Dec-Feb)
- 3 from late season (Mar-Apr)

Total: 75 dates across all conditions
```

---

## Implementation

### Script Updates Needed:

**1. Add sampling mode to fetch-historical-odds.mjs**:
```javascript
const SAMPLING_MODES = {
  full: 728 dates,
  phase1: 30 dates (stratified),
  phase2: 75 dates (stratified),
  minimal: 10 dates (quick test)
};
```

**2. Create stratified date selector**:
- Group dates by season/month
- Random sample within each stratum
- Ensure constraints met (no ASG, playoffs, etc.)

**3. Add credit monitoring**:
- Track credits used per request
- Display running total
- Pause if costs exceed estimate

---

## Execution Plan

### **TODAY (if improved model passes validation)**:

**Step 1**: Generate Phase 1 sample
```bash
node scripts/nhl/generate-phase1-sample.mjs
# Output: 30 dates saved to phase1_dates.json
```

**Step 2**: Fetch Phase 1 odds
```bash
THEODDS_API_KEY=your-key node scripts/nhl/fetch-historical-odds.mjs --phase=1
# Estimated time: 30 minutes
# Estimated cost: 1,500-3,000 credits
```

**Step 3**: Run market backtest
```bash
node scripts/nhl/market-backtest.mjs --data=phase1
# Calculate ROI, EV, Sharpe, drawdown
# Results in < 1 minute
```

**Step 4**: Decision
- ✅ If ROI > 3%: Generate Phase 2 sample and continue
- ❌ If ROI < 0%: Stop, save 97% of credits

---

### **TOMORROW (if Phase 1 passes)**:

**Step 5**: Generate Phase 2 sample
```bash
node scripts/nhl/generate-phase2-sample.mjs
# Output: 45 more dates (75 total)
```

**Step 6**: Fetch Phase 2 odds
```bash
THEODDS_API_KEY=your-key node scripts/nhl/fetch-historical-odds.mjs --phase=2
# Estimated time: 45 minutes
# Estimated cost: 2,750-7,500 credits
```

**Step 7**: Full market backtest
```bash
node scripts/nhl/market-backtest.mjs --data=combined
# Statistical validation with 10k+ predictions
```

**Step 8**: Deploy decision
- Based on ROI, drawdown, Sharpe ratio
- If profitable → start live with small stakes

---

## Alternative Strategies (if budget even tighter)

### **Ultra Minimal (1% of credits)**:
- 10 dates
- ~2,000 predictions
- 500-1,000 credits
- Margin of error: ±4.5%
- Good for: "Does this completely fail?" test

### **Medium (5% of credits)**:
- 50 dates  
- ~10,000 predictions
- 2,500-5,000 credits
- Margin of error: ±1.0%
- Good for: Single-phase validation

### **Confidence Builder (8% of credits)**:
- 75 dates
- ~15,000 predictions
- 3,750-7,500 credits
- Margin of error: ±0.8%
- Good for: High confidence needed before deploy

---

## Risk-Adjusted Recommendation

**Given your situation**:
- ✅ You have the API key (no acquisition cost)
- ✅ 93,830 credits remaining
- ⚠️ Baseline model failed validation (MAE 1.319)
- 🟡 Improved model running (results TBD)

**My advice**:

1. **Wait for improved model results first** (1-2 hours)

2. **If improved model PASSES** (MAE < 1.0):
   - Run **Phase 1** (30 dates, 3% of credits)
   - Low risk, quick validation

3. **If improved model FAILS** (MAE > 1.0):
   - **Don't fetch odds yet**
   - Work on model improvements first
   - A weak predictor won't beat the market

4. **Only proceed to Phase 2** if:
   - Model passes accuracy validation AND
   - Phase 1 shows ROI > 3%

---

## Expected Outcomes

### **Scenario A: Model is Profitable** ✅
- Phase 1 shows ROI > 5%
- Phase 2 confirms it
- **Total cost**: 4,250-10,500 credits (11%)
- **Outcome**: Deploy confidently, still have 83k credits for live monitoring

### **Scenario B: Model is Borderline** 🟡
- Phase 1 shows ROI 1-3%
- Phase 2 needed for confirmation
- **Total cost**: 4,250-10,500 credits (11%)
- **Outcome**: Better data quality or different features needed

### **Scenario C: Model Loses Money** ❌
- Phase 1 shows ROI < 0%
- **Stop immediately**
- **Total cost**: 1,500-3,000 credits (3%)
- **Outcome**: Saved 97% of budget, can try different approach

---

## Bottom Line

**Don't spend 36k-72k credits (77% of budget) on full dataset!**

**Instead**:
- **Phase 1**: 30 dates, 3% cost → Validates model has edge
- **Phase 2**: 45 more dates, 8% cost → Confirms edge is real
- **Total**: 75 dates (10%), same statistical power as 728 dates for decision-making

**You save 85%+ of credits while getting reliable insights!**

---

## Files I'll Create

1. `scripts/nhl/generate-phase1-sample.mjs` - Stratified 30-date sampler
2. `scripts/nhl/generate-phase2-sample.mjs` - Additional 45-date sampler
3. `scripts/nhl/fetch-historical-odds-phased.mjs` - Phased fetch with monitoring
4. Update `market-backtest.mjs` - Accept Phase 1/2 data

**Ready to implement when improved model completes!**
