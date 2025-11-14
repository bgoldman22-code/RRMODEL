# 🔬 NHL SOG Model Comparison - Quick Start Guide

**Date**: November 14, 2025  
**Purpose**: Determine which model to deploy (Improved vs ZINB Elite v3)  
**Test Period**: October 15 - November 13, 2025

---

## 🎯 The Question We're Answering

**Which model is more profitable on 2025-26 season data?**

1. **"Improved" Model** (simple weighted avg, used in Oct backtest)
2. **ZINB Elite v3** (complex distribution, used yesterday)

---

## 📋 Prerequisites

Before running the comparison, ensure you have:

- ✅ `data/nhl/historical_game_data.json` (with Oct 15 - Nov 13 games)
- ✅ `data/nhl/historical_odds_data_v2.json` (with Oct 15 - Nov 13 odds)
- ✅ `data/nhl/player_stats_20252026.json`
- ✅ `data/nhl/team_stats_20252026.json`
- ✅ `data/nhl/learned_parameters.json`

---

## 🚀 Step-by-Step Execution

### **Step 1: Check Data Availability**

```bash
# Quick check if we have the data
node scripts/nhl/model-comparison-test.mjs
```

**Expected Output**:
- Shows which files exist
- Tells you if you need to fetch more data
- Estimates games available for testing

**If Missing Data**:
```bash
# Fetch historical odds for Oct-Nov 2025
node scripts/nhl/fetch-historical-odds-v2.mjs
```

---

### **Step 2: Generate "Improved" Model Predictions**

**Option A: If walkforward-backtest-improved.mjs can be configured:**

```bash
# Modify the script to use Oct 15 - Nov 13 date range
# Then run:
node scripts/nhl/walkforward-backtest-improved.mjs

# Rename output:
mv data/nhl/walkforward_backtest_improved_results.json \
   data/nhl/improved_predictions_test.json
```

**Option B: If script needs modification:**

Edit `scripts/nhl/walkforward-backtest-improved.mjs`:
```javascript
// Change date range at top of file:
const TEST_START = '2025-10-15';
const TEST_END = '2025-11-13';

// Filter games to this range
const testGames = allGames.filter(g => 
  g.gameDate >= TEST_START && g.gameDate <= TEST_END
);
```

---

### **Step 3: Generate ZINB Elite v3 Predictions**

```bash
# Run the ZINB prediction generator
node scripts/nhl/generate-zinb-test-predictions.mjs
```

**What This Does**:
- Loads all games from Oct 15 - Nov 13
- Runs `projectSOGElite()` for each game
- Saves predictions to `data/nhl/zinb_predictions_test.json`
- Calculates MAE, bias, correlation

**Expected Duration**: 2-5 minutes (depending on game count)

---

### **Step 4: Apply Policy Filters to "Improved" Model**

```bash
node scripts/nhl/policy-backtest.mjs \
  --preds=data/nhl/improved_predictions_test.json \
  --odds=data/nhl/historical_odds_data_v2.json \
  --outJson=data/nhl/improved_policy_results.json \
  --outCsv=data/nhl/improved_policy_bets.csv \
  --autoRelaxOvers=true
```

**What This Does**:
- Joins "Improved" predictions with market odds
- Applies isotonic calibration (per-side)
- Filters with policy rules (consensus ban, Unders/Overs criteria)
- Calculates ROI, win rate, Kelly performance

---

### **Step 5: Apply Policy Filters to ZINB Model**

```bash
node scripts/nhl/policy-backtest.mjs \
  --preds=data/nhl/zinb_predictions_test.json \
  --odds=data/nhl/historical_odds_data_v2.json \
  --outJson=data/nhl/zinb_policy_results.json \
  --outCsv=data/nhl/zinb_policy_bets.csv \
  --autoRelaxOvers=true
```

**What This Does**:
- Same as Step 4, but for ZINB predictions
- Ensures **identical filtering logic** for fair comparison

---

### **Step 6: Compare Results**

```bash
# Generate comparison report
node scripts/nhl/model-comparison-test.mjs
```

**Output**:
```
═══════════════════════════════════════════════════════════════
📊 MODEL COMPARISON RESULTS
═══════════════════════════════════════════════════════════════

┌─────────────────────────────┬──────────────┬──────────────┐
│ Metric                      │   Improved   │  ZINB Elite  │
├─────────────────────────────┼──────────────┼──────────────┤
│ Total Bets Selected         │     45       │     52       │
│ Wins                        │     27       │     29       │
│ Losses                      │     18       │     23       │
│ Win Rate                    │   60.0%      │   55.8%      │
│ ROI (Flat)                  │  +22.3%      │  +15.7%      │
│ ROI (Kelly)                 │  +25.1%      │  +18.2%      │
│ Total Staked                │   45.0u      │   52.0u      │
│ Total Profit                │  +10.0u      │   +8.2u      │
└─────────────────────────────┴──────────────┴──────────────┘

🏆 WINNER: "Improved" Model (+22.3% ROI)
📈 RECOMMENDATION: Deploy "Improved" Model to production
```

---

## 🎯 Decision Tree

### **Scenario A: Both Models Profitable (ROI > 5%)**

```
✅ BEST CASE
├─ Deploy the model with higher ROI
├─ Use that model's policy filters in production
└─ Monitor daily performance for degradation
```

**Action**:
```bash
# If "Improved" wins:
cp scripts/nhl/policy-backtest.mjs scripts/nhl/production-system.mjs
# Modify to use "Improved" model predictions

# If ZINB wins:
# Port policy filters into run-sog-tonight.mjs
```

---

### **Scenario B: One Model Profitable, One Not**

```
🟡 MIXED RESULTS
├─ Deploy the profitable model
├─ Investigate why the other model failed
└─ Consider the profitable model may be overfit to test period
```

**Action**:
- Deploy profitable model **cautiously**
- Track live performance closely (daily)
- Be ready to shut down if edge doesn't hold

---

### **Scenario C: Neither Model Profitable (Both ROI < 5%)**

```
❌ CRITICAL FINDING
├─ Market edge has likely eroded since October backtest
├─ Both models failing on current season data
└─ Need deeper investigation
```

**Possible Causes**:
1. **Market Evolution**: Books adjusted to similar strategies
2. **Data Leakage in Oct Backtest**: Historical results were overfit
3. **Small Sample**: Oct 15 - Nov 13 may be unlucky variance
4. **Missing Variables**: Current season dynamics changed

**Action**:
```bash
# Expand test period to get more data
# Re-run on Oct 1 - Nov 13 (longer window)

# Check if issue is calibration or model
# Run without filters to see raw prediction accuracy
```

---

## 📊 Expected Timelines

| Step | Duration | Notes |
|------|----------|-------|
| **Step 1: Check Data** | 1 min | Instant if data exists |
| **Step 2: Gen Improved Preds** | 5-10 min | If script needs modification |
| **Step 3: Gen ZINB Preds** | 3-5 min | ~100 games in test period |
| **Step 4: Filter Improved** | 1 min | Policy backtest is fast |
| **Step 5: Filter ZINB** | 1 min | Same as Step 4 |
| **Step 6: Compare** | 1 min | Just reads JSON files |
| **TOTAL** | **10-20 minutes** | Assuming data is available |

---

## 🔍 Interpreting Results

### **Key Metrics to Compare**

1. **ROI (Flat)**: Most important - raw profitability
2. **Win Rate**: Should be 52-58% for viability
3. **Total Bets**: More bets = better statistical significance
4. **ROI (Kelly)**: Should be higher than flat (validates calibration)

### **Red Flags**

⚠️ **ROI < 0%**: Model loses money even with filters  
⚠️ **Win Rate < 48%**: Below breakeven for plus odds  
⚠️ **Total Bets < 20**: Sample too small, inconclusive  
⚠️ **Kelly ROI < Flat ROI**: Calibration is off  

### **Green Flags**

✅ **ROI > 10%**: Strong edge  
✅ **Win Rate 52-60%**: Solid hit rate  
✅ **Kelly > Flat**: Good probability calibration  
✅ **Total Bets 30-50**: Enough data to be confident  

---

## 📈 After Comparison: Next Steps

### **If We Have a Winner (ROI > 10%)**

1. **Deploy to Production**
   ```bash
   # Port winning model + policy filters
   # Set up for daily automated runs
   ```

2. **Monitor Live Performance**
   - Track daily ROI vs backtest expectations
   - Alert if performance degrades >10%
   - Weekly recalibration check

3. **Start Small**
   - Begin with 25-50% of intended bankroll
   - Scale up after 7 days of positive results
   - Reduce if results don't match backtest

---

### **If Both Models Fail (ROI < 5%)**

1. **Diagnose the Problem**
   ```bash
   # Check raw prediction accuracy (no filters)
   # Compare MAE, bias, correlation for both models
   # Look for systematic errors
   ```

2. **Expand Test Period**
   ```bash
   # Test on full season to date (Oct 1 - Nov 13)
   # More data = more confidence in results
   ```

3. **Investigate Market Changes**
   - Did books change their lines?
   - Are we seeing different odds structures?
   - Has player usage changed (injuries, coaching)?

---

## 🛠️ Troubleshooting

### **"No games found in test period"**

**Solution**:
```bash
# Fetch historical data for Oct-Nov 2025
node scripts/nhl/fetch-historical-odds-v2.mjs

# Verify date range:
node -e "console.log(require('./data/nhl/historical_odds_data_v2.json').data.filter(g => g.gameDate >= '2025-10-15' && g.gameDate <= '2025-11-13').length)"
```

---

### **"walkforward-backtest-improved.mjs errors"**

**Common Issue**: Script expects full historical dataset, not filtered range

**Solution**: Modify script to accept date range parameters, or manually filter the input data before running.

---

### **"ZINB projections taking too long"**

**Optimization**: 
```javascript
// In generate-zinb-test-predictions.mjs
// Add batch processing or parallel execution
// Or run overnight if needed
```

---

### **"Policy-backtest finds 0 bets"**

**Possible Causes**:
1. Predictions don't match odds (playerId/date mismatch)
2. All bets filtered out by policy rules (too strict)
3. Missing required fields (L10_toi, lastGameShots)

**Debug**:
```bash
# Check raw bet count before filters
# Look at policy-backtest console output
# May need to relax filters slightly
```

---

## 📁 Output Files

After running full comparison, you'll have:

```
data/nhl/
├── improved_predictions_test.json      # "Improved" model raw predictions
├── zinb_predictions_test.json          # ZINB model raw predictions
├── improved_policy_results.json        # "Improved" + filters results
├── zinb_policy_results.json            # ZINB + filters results
├── improved_policy_bets.csv            # "Improved" selected bets (detailed)
├── zinb_policy_bets.csv                # ZINB selected bets (detailed)
└── model_comparison_report.json        # Final comparison summary
```

---

## 🎓 What We'll Learn

This test will definitively answer:

1. ✅ **Which model is more accurate?** (MAE, bias, correlation)
2. ✅ **Which model is more profitable?** (ROI with filters)
3. ✅ **Is the edge still alive?** (Any positive ROI = yes)
4. ✅ **How many picks per day?** (Volume expectations)
5. ✅ **What's the expected win rate?** (Realistic targets)

**This removes all speculation and gives us DATA-DRIVEN decisions.** 📊

---

## 🚀 Let's Run It!

**Quick Command Sequence** (if data exists):

```bash
# Generate ZINB predictions
node scripts/nhl/generate-zinb-test-predictions.mjs

# Filter "Improved" model (assumes predictions exist)
node scripts/nhl/policy-backtest.mjs \
  --preds=data/nhl/improved_predictions_test.json \
  --odds=data/nhl/historical_odds_data_v2.json \
  --outJson=data/nhl/improved_policy_results.json

# Filter ZINB model
node scripts/nhl/policy-backtest.mjs \
  --preds=data/nhl/zinb_predictions_test.json \
  --odds=data/nhl/historical_odds_data_v2.json \
  --outJson=data/nhl/zinb_policy_results.json

# Compare
node scripts/nhl/model-comparison-test.mjs
```

**Total Time**: ~15 minutes

---

**Ready to find out which model actually works?** 🔬
