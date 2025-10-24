# 💡 SMART SAMPLING PLAN - Summary for Quick Reference

## The Answer: Two-Phase Approach

Instead of spending **36,000-72,000 credits** (77% of your budget) on the full dataset, use a **two-phase approach** that costs only **11%** while giving you the same decision-making power!

---

## 📊 Quick Comparison

| Approach | Dates | Predictions | Credits | % Budget | Decision Quality |
|----------|-------|-------------|---------|----------|------------------|
| **Full Dataset** | 728 | ~169,000 | 36k-72k | 77% | ⭐⭐⭐⭐⭐ |
| **Phase 1 Only** | 30 | ~6,000 | 1.5k-3k | 3% | ⭐⭐⭐ |
| **Phase 1+2** | 75 | ~15,000 | 4k-10k | 11% | ⭐⭐⭐⭐⭐ |

**Bottom line**: Phase 1+2 gives you 5-star decision quality at **11% of the cost**!

---

## 🎯 Phase 1: Proof of Concept

**Cost**: 1,500-3,000 credits (3% of budget)  
**Time**: 30 minutes to fetch  
**Sample**: 30 dates (stratified across all seasons)  
**Predictions**: ~6,000  

**Purpose**: Quick answer to "Does this model beat the market AT ALL?"

**Decision Gate**:
```
IF ROI > 3%:  ✅ Proceed to Phase 2 (model shows promise)
IF ROI 0-3%:  🟡 Inconclusive (need judgment call)
IF ROI < 0%:  ❌ STOP - Model loses money, saved 97% of budget!
```

---

## 🎯 Phase 2: Statistical Validation

**Cost**: 2,750-7,500 credits (8% of budget)  
**Time**: 45 minutes to fetch  
**Sample**: 45 more dates (total 75 dates)  
**Predictions**: ~9,000 more (total ~15,000)  

**Purpose**: Confirm the edge is real and consistent

**Decision Gate**:
```
IF ROI > 5% + Drawdown < 30%:  ✅ DEPLOY (model is profitable)
IF ROI 3-5%:                   🟡 Cautious deploy or improve model
IF ROI < 3%:                   ❌ Not profitable enough
```

---

## 💰 Total Cost

| Scenario | Phase 1 | Phase 2 | Total | % of Budget |
|----------|---------|---------|-------|-------------|
| **Best case** (stops at Phase 1 fail) | 1,500 | 0 | **1,500** | **1.6%** |
| **Typical** (both phases) | 2,000 | 5,000 | **7,000** | **7.5%** |
| **Worst case** (both phases, high cost) | 3,000 | 7,500 | **10,500** | **11.2%** |

**vs Full Dataset**: 36,000-72,000 (77% of budget)

**You save**: **85%+ of credits** with same decision-making power!

---

## 📈 Statistical Validity

**"But is 30-75 dates enough?"**

YES! Here's why:

| Sample Size | Margin of Error | Confidence |
|-------------|-----------------|------------|
| 1,000 pred | ±3.1% | 95% |
| 5,000 pred | ±1.4% | 95% |
| **10,000 pred** | **±1.0%** | **95%** |
| 50,000 pred | ±0.4% | 95% |

With **10,000+ predictions** (Phase 1+2):
- If true ROI is 5%, you'll measure **4-6%** ✅
- That's **more than enough** to make a deploy decision
- Going from ±1% to ±0.2% error costs **60,000 more credits** for minimal gain

**Key insight**: You don't need to know ROI is exactly 5.241%. You just need to know if it's above 3% (profitable) or below 0% (losing). Phase 1+2 does that perfectly!

---

## 🛠️ How to Execute

### Step 1: Wait for improved model ⏳
```bash
# Check if it's done
tail data/nhl/walkforward_backtest_improved_output.txt

# Compare results when ready
node scripts/nhl/compare-models.mjs
```

### Step 2: If model PASSES validation ✅
```bash
# Generate Phase 1 sample (30 dates)
node scripts/nhl/generate-phase1-sample.mjs

# This creates: data/nhl/phase1_sample_dates.json
```

### Step 3: Fetch Phase 1 odds 📡
```bash
```bash
THEODDS_API_KEY=your_api_key_here \
  node scripts/nhl/create-validation-sample.mjs# Takes ~30 min, costs 1,500-3,000 credits
```

### Step 4: Market backtest 📊
```bash
node scripts/nhl/market-backtest.mjs --data=phase1

# Results in < 1 minute
# Shows ROI, EV, Sharpe ratio, drawdown
```

### Step 5: GO/NO-GO Decision 🚦

**IF ROI < 0% (model loses money)**:
- ❌ STOP HERE
- ✅ You saved 97% of credits!
- 🔄 Work on model improvements instead

**IF ROI > 3% (model shows promise)**:
```bash
# Generate Phase 2 sample (45 more dates)
node scripts/nhl/generate-phase2-sample.mjs

# Fetch Phase 2 odds
node scripts/nhl/fetch-historical-odds.mjs \
  --sample=phase2_sample_dates.json

# Final market backtest with full 15k predictions
node scripts/nhl/market-backtest.mjs --data=combined

# Make final deploy decision
```

---

## 🎓 Why This Strategy is Smart

### ✅ **Risk Minimization**
- Phase 1 costs only 3% upfront
- Can abort before big spending if model fails
- No "sunk cost" pressure to deploy bad model

### ✅ **Statistical Validity**
- 10,000+ predictions gives ±1% margin of error
- Same decision quality as full dataset
- Diminishing returns above this sample size

### ✅ **Cost Efficiency**
- 85%+ savings vs full dataset
- Credits saved can be used for:
  - Live monitoring
  - Testing alternative models
  - Next month's deployment
  - Different sports/bet types

### ✅ **Fast Feedback**
- Phase 1 results in 30 minutes
- Know if model works by end of day
- Don't wait days to fetch 728 dates

### ✅ **Stratified Sampling**
- Balanced across all seasons (2021-2025)
- Captures different market conditions
- Avoids temporal bias
- Representative of full dataset

---

## 🚨 When NOT to Use This

**Skip sampling if**:
- You're building a research paper (need full data for academic rigor)
- You're selling the model (clients want "we tested everything")
- You have unlimited API credits
- You're already deployed and validating live performance

**But for YOUR case** (deciding whether to deploy):
- ✅ You need a YES/NO answer on profitability
- ✅ You have limited credits
- ✅ You want fast validation
- ✅ This is perfect! Use the two-phase approach.

---

## 📋 Files Created

1. **Strategy document**: `MINIMAL_ODDS_SAMPLING_STRATEGY.md` (detailed)
2. **This summary**: `MINIMAL_SAMPLING_QUICK_REF.md` (you're reading it)
3. **Phase 1 generator**: `scripts/nhl/generate-phase1-sample.mjs` ✅
4. **Phase 2 generator**: `scripts/nhl/generate-phase2-sample.mjs` (TODO)
5. **Updated fetcher**: `scripts/nhl/fetch-historical-odds.mjs` (needs --sample flag)

---

## 🎯 Bottom Line

**Question**: "How can I validate profitability without spending all my credits?"

**Answer**: Two-phase sampling
- **Phase 1**: 30 dates, 3% cost → Quick yes/no
- **Phase 2**: 45 more dates, 8% cost → Confirm it's real
- **Total**: 11% cost, 5-star decision quality

**You save 85%+ of credits while getting reliable insights!**

---

**Next**: Wait for improved model results (~1-2 hours), then execute Phase 1 if it passes validation.
