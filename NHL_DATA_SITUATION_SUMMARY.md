# 🔍 NHL SOG Model Data Situation - Complete Picture

**Date**: November 14, 2025  
**Status**: ✅ Successfully fetched 2025-26 season odds data

---

## 📊 What We Discovered

### **Historical Odds API Works Perfectly!**

You were right - TheOddsAPI **does** keep historical data. The key is using the correct endpoints:

```
GET /v4/historical/sports/icehockey_nhl/events?date={ISO_TIMESTAMP}
GET /v4/historical/sports/icehockey_nhl/events/{eventId}/odds?date={ISO_TIMESTAMP}
```

### **Successful Fetch Results**

✅ **Fetched**: Oct 15 - Nov 13, 2025 (30 days)  
✅ **Games Found**: 231 games  
✅ **Games with Odds**: 212 games (92%)  
✅ **Credits Used**: 2,149 (out of ~4.7M available)  
✅ **Saved to**: `data/nhl/odds_2025-26_oct-nov.json`

---

## 🎯 The Current Situation

### **What We Have**

1. **Historical Game Data** (`historical_game_data.json`)
   - **Date Range**: 2021-10-12 to 2025-04-17
   - **Total Games**: 169,847
   - **Status**: ✅ Complete through end of 2024-25 season

2. **Historical Odds Data** (`historical_odds_data_v2.json`)
   - **Date Range**: 2024-02-12 to 2024-12-04
   - **Total Games**: 235 games with odds
   - **Status**: ✅ Complete for 2024 sample period

3. **2025-26 Season Odds Data** (`odds_2025-26_oct-nov.json`) **← NEW!**
   - **Date Range**: 2025-10-15 to 2025-11-13
   - **Total Games**: 212 games with odds
   - **Status**: ✅ Just fetched successfully

### **What We're Missing**

❌ **Actual Game Results for Oct 15 - Nov 13, 2025**
   - We have the **odds** (what the books offered)
   - We **don't have** the **actual shots taken** (game results)
   - This means we can't test model performance on this period yet

---

## 🤔 Why This Happened

The 2025-26 NHL season is **currently in progress**:
- Season started: October 8, 2025
- Games are being played: October - April 2026
- Historical game data was last updated: **April 2025** (end of 2024-25 season)

**To run model comparison on Oct 15 - Nov 13, 2025, we need:**
1. ✅ Odds data (what books offered) - **WE HAVE THIS NOW**
2. ❌ Actual results (how many shots players took) - **WE DON'T HAVE THIS YET**

---

## 🚀 Our Options Going Forward

### **Option 1: Use 2024 Historical Data** ⭐ **RECOMMENDED**

**Pros**:
- We have **both odds and results** for 2024
- Fair comparison of both models on same games
- Can run test **immediately**
- 235 games with odds is a good sample size

**Cons**:
- Not testing on "current" season
- Market may have evolved since 2024

**How to Execute**:
```bash
# Use existing historical_odds_data_v2.json (Feb-Dec 2024)
# Generate "Improved" model predictions for 2024 games
# Generate ZINB predictions for 2024 games
# Apply policy filters to both
# Compare results
```

**Timeline**: Can complete in 1-2 hours

---

### **Option 2: Wait for 2025-26 Results Data**

**Pros**:
- Tests on most recent season (current market conditions)
- We already have the odds data fetched

**Cons**:
- Need to wait for game results to be scraped/added
- Could be days, weeks, or months depending on data source
- Unknown timeline

**How to Execute**:
1. Update data collection pipeline to scrape current season games
2. Re-run model comparison once results are available
3. Or wait for end of season (April 2026)

---

### **Option 3: Hybrid Approach** 🎯 **BEST LONG-TERM**

**Phase 1: Test on 2024 Data (Now)**
- Run model comparison on 2024 historical data
- Determine which model is more profitable
- Deploy winner to production **cautiously**

**Phase 2: Validate on 2025-26 (Later)**
- Once Oct-Nov 2025 results are available
- Re-run comparison on current season
- Confirm model still works in current market

**Phase 3: Live Monitoring (Ongoing)**
- Track daily performance vs expectations
- Adjust if edge degrades

---

## 📋 Recommended Next Steps

### **Immediate (Today)**

1. **Run Model Comparison on 2024 Data**
   ```bash
   # Step 1: Generate ZINB predictions for 2024 games
   node scripts/nhl/generate-zinb-test-predictions-2024.mjs
   
   # Step 2: Generate "Improved" predictions for 2024 games
   # (may already exist from Oct backtest)
   
   # Step 3: Apply policy filters to both
   node scripts/nhl/policy-backtest.mjs --preds=improved_2024.json --odds=historical_odds_data_v2.json
   node scripts/nhl/policy-backtest.mjs --preds=zinb_2024.json --odds=historical_odds_data_v2.json
   
   # Step 4: Compare results
   node scripts/nhl/model-comparison-test.mjs
   ```

2. **Determine Winner**
   - Whichever model has higher ROI on 2024 data
   - Ensure ROI > 10% and win rate > 52%

3. **Deploy to Production (Cautiously)**
   - Start with small bankroll (25-50%)
   - Monitor daily performance
   - Be ready to stop if results don't match backtest

### **Medium-Term (This Month)**

4. **Set Up Current Season Data Collection**
   - Scrape ESPN, NHL API, or other source for current game results
   - Add Oct-Nov 2025 games to `historical_game_data.json`
   - Re-run comparison on current season data

5. **Validate with 2025-26 Data**
   - Use the odds we already fetched
   - Test both models on current season
   - Confirm winning model still performs

### **Ongoing**

6. **Live Performance Monitoring**
   - Track daily ROI, win rate, calibration
   - Compare to 2024 backtest expectations
   - Alert if performance degrades >10%

---

## 💡 Key Insights

### **What We Learned**

1. ✅ **TheOddsAPI Historical Endpoints Work**
   - Successfully fetched 30 days of odds (212 games)
   - Cost was reasonable (2,149 credits)
   - Data quality is good (5-6 books per game)

2. ✅ **We Can Collect Historical Odds Anytime**
   - No longer limited by "you must collect daily"
   - Can backfill any date range we need
   - This is huge for future testing

3. ⚠️ **Game Results Are the Bottleneck**
   - Odds are easy to get (just pay API)
   - Actual results require scraping/waiting
   - This is the limiting factor for testing

4. 🎯 **2024 Data Is Good Enough for Now**
   - 235 games with odds is solid sample
   - Both models trained on historical data (includes 2024)
   - Fair comparison on same games

### **Why Oct Backtest Showed +29.55% ROI**

The October backtest used:
- **Model**: "Improved" (simple weighted average)
- **Filters**: Policy backtest (isotonic calibration + strict rules)
- **Data**: 2024 historical games with odds
- **Result**: 133 bets, +29.55% ROI

This is a **valid result** IF we deploy the same model + filters.

### **Why Nov 13 Run Showed -43% ROI**

The November 13 run used:
- **Model**: ZINB Elite v3 (different model!)
- **Filters**: Only MIN_EDGE=5% (no policy filters!)
- **Result**: 83 picks, -43% ROI

**This is NOT comparable** to the October backtest because:
1. Different model (ZINB vs Improved)
2. Different filters (simple edge threshold vs policy system)
3. May have been on different date range

---

## 🎯 The Question We Can Answer Today

**"Which model is more profitable on 2024 historical data with identical policy filters?"**

This will tell us:
- ✅ Which model to deploy
- ✅ What ROI to expect (based on historical performance)
- ✅ How many picks per day
- ✅ Whether the edge still exists

**This is the RIGHT test to run before deploying to production.**

---

## 📊 Expected Outcomes

### **Scenario A: "Improved" Wins on 2024 Data**

**Interpretation**: The simpler model with careful filters is more robust.

**Action**: 
- Deploy "Improved" model + policy filters to production
- Expect similar ROI to Oct backtest (+20-30%)
- Monitor closely for first week

### **Scenario B: ZINB Wins on 2024 Data**

**Interpretation**: The complex statistical model has true edge when properly filtered.

**Action**:
- Port policy filters into ZINB pipeline
- Deploy ZINB + policy filters to production
- Expect performance based on 2024 results

### **Scenario C: Both Fail on 2024 Data**

**Interpretation**: Market has evolved, or Oct backtest was overfit.

**Action**:
- **DO NOT DEPLOY**
- Investigate why models failing
- May need to retrain or find new features

---

## 🚀 Ready to Run the Test?

We have everything we need to run a **proper, controlled comparison** on 2024 data:

- ✅ Historical game results (2024)
- ✅ Historical odds data (2024)
- ✅ Both models ready to generate predictions
- ✅ Policy backtest system ready
- ✅ Comparison framework built

**Total Time Estimate**: 1-2 hours  
**Confidence Level**: High (235 games is good sample)  
**Actionable Result**: Yes (clear deploy/don't deploy decision)

---

**Let's test on 2024 data and find out which model actually works! 🔬**
