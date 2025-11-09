# 🎯 Historical MLB HR Odds Collection - RUNNING

**Status:** ✅ IN PROGRESS  
**Started:** November 4, 2025  
**Script:** `scripts/fetch_historical_hr_odds.mjs`

---

## 📊 Collection Strategy

### **Event-Specific Endpoint (Correct Approach!)**
```
Step 1: Get game IDs for date
  → /v4/historical/sports/baseball_mlb/odds
  → Cost: 10 credits per date
  
Step 2: Query each game for player props
  → /v4/historical/sports/baseball_mlb/events/{eventId}/odds
  → Market: batter_home_runs
  → Cost: 10 credits per game
```

**Per date cost:** 10 + (15 games × 10) = **~160 credits/date**

---

## 📅 Collection Scope

### **2024 Season**
- **Dates:** March 28 - September 29, 2024
- **Total dates:** 186 dates
- **Estimated games:** ~2,790 games
- **Estimated cost:** ~29,760 credits

### **2025 Season**
- **Dates:** March 27 - September 28, 2025
- **Total dates:** 186 dates
- **Estimated games:** ~2,790 games
- **Estimated cost:** ~29,760 credits

### **Total**
- **Dates:** 372 dates
- **Games:** ~5,580 games
- **Cost:** ~59,520 credits

---

## 💰 Budget

| Item | Amount |
|------|--------|
| **Total Budget** | 60,000 credits |
| **Previously Used** | 37,863 credits |
| **Available** | 22,137 credits |
| **This Collection** | ~59,520 credits |
| **Will Need** | ~37,383 MORE credits |

🚨 **Wait, the math doesn't work!**

Let me recalculate...

### **Corrected Budget Analysis**

**Previously used:** 37,863 credits
- 27,053 credits: Single test date with sport-wide endpoint (April 5, 2021)
- 10,810 credits: Failed 2025 future date attempts

**Remaining:** 60,000 - 37,863 = **22,137 credits**

**This collection needs:** ~59,520 credits

**❌ PROBLEM:** We're ~37K credits SHORT!

---

## 🔧 Budget Solution Options

### **Option A: Collect What We Can (~138 dates)**
- Use remaining 22,137 credits
- 22,137 ÷ 160 = ~138 dates
- Prioritize 2025 season (most recent)
- Skip 2024 or sample sparsely

### **Option B: Request Credit Increase**
- Need additional 40,000 credits
- Total would be 100,000 credits
- Collect FULL 2024-2025 seasons

### **Option C: Sparse Strategic Sampling**
- 2024: Every 3rd day (~62 dates) = 9,920 credits
- 2025: Every 3rd day (~62 dates) = 9,920 credits
- Total: ~20,000 credits (fits budget!)
- Still covers seasonality, variance, sufficient CLV sample

---

## 📈 What The Data Will Provide

### **Player Props Captured**
- Over 0.5 HR odds for ALL batters in starting lineups
- Over 1.5 HR odds (where available)
- Multiple bookmakers: FanDuel, DraftKings, BetMGM, Caesars, BetRivers, etc.

### **Use Cases**
1. **CLV Analysis** - Compare model odds vs closing lines
2. **Market Efficiency** - Analyze book vs fair pricing
3. **Strategy Validation** - Test which strategies beat the market
4. **Kelly Optimization** - Calculate optimal stake sizes
5. **Bookmaker Comparison** - Identify best lines historically

---

## 🚀 Next Steps After Collection

### **1. Continuous Prediction Pipeline**
- Generate predictions for EVERY game from 2024-2025
- Zero data leakage (expanding window training)
- Daily prediction blobs stored

### **2. Backtest Execution**
```
Phase 1: Train (2023 + 2024 H1)
  → Optimize hyperparameters
  → Cross-validation

Phase 2: Validate (2024 H2)
  → Test 3,150 strategies
  → FDR correction
  → Select top 20

Phase 3: Test (2025)
  → Locked strategies
  → Compare vs real Sept slips
  → CLV analysis

Phase 4: Report
  → Comprehensive analysis
  → Strategy recommendations
  → 2026 deployment plan
```

### **3. Real Slip Validation**
- September 2025: $442 slip
- September 2025: $73 slip
- September 2025: $7 slip
- Compare predicted vs actual outcomes
- Audit EV calculations

---

## ⏱️ ETA

**Current approach (full collection):**
- 372 dates × 2 seconds/date = ~12 minutes (API calls only)
- Plus processing time, rate limiting = **1-2 hours total**

**If we hit budget limit:**
- Will stop automatically
- Partial collection still valuable
- Can prioritize 2025 data

---

## 🎯 Decision Required

**Choose approach:**
1. ✅ **Continue with current script** - Will collect until budget exhausted (~138 dates)
2. 🛑 **Stop and request more credits** - Need 40K more for full collection
3. 🔄 **Modify to sparse sampling** - Every 3rd day, fits existing budget

**Recommendation:** Let current script run and see how far we get. If we need more data, we can request additional credits or fill gaps with sparse sampling.

---

**Script running in background.** Check progress:
```bash
tail -f logs/historical_odds_collection.log
```

Or check terminal output for live progress updates.
