# NFL Predictions - Local Development

## 🎯 **Overview**

This directory contains scripts to run NFL predictions locally without deploying to Netlify.

**⚠️ Production Issue**: The live site (bgroundrobin.com) is currently timing out, so these local runners are essential for getting predictions.

---

## 📊 **Three Ways to Run NFL Predictions**

### **1. V1 Lite (Recommended for Local Use)**
**Full local execution with live odds from TheOddsAPI**

```bash
node scripts/nfl/run-v1-lite-local.mjs 2025 14
```

**Features:**
- ✅ Runs 100% locally (no production dependencies)
- ✅ Fetches live odds from TheOddsAPI
- ✅ Fetches schedule from NFLverse GitHub
- ✅ No CommonJS/ESM compatibility issues
- ✅ Fast execution (~2-3 seconds)
- ⚠️ Simplified model (uses market lines as baseline)
- ⚠️ No injury data or advanced EPA calculations

**Output:** `nfl_v1_lite_week14_predictions.json`

**Best for:** Quick odds checking, market scanning, development testing

---

### **2. V5 (Pure Model Predictions)**
**Frozen coefficients model, no odds required**

```bash
node scripts/nfl/run-v5-local.mjs 2025 14
```

**Features:**
- ✅ Runs 100% locally
- ✅ Full EPA model with rolling 8-game windows
- ✅ Frozen coefficients from multi-season training
- ✅ Deterministic predictions (no randomness)
- ✅ Spread + Total predictions
- ❌ NO live odds (generates predictions only)
- ❌ NO edge calculations or bet recommendations

**Output:** `nfl-model-v4.1/output/bundle_v5_2025_week14.json`

**Best for:** 
- Comparing your model's "true line" to market lines
- Model validation and backtesting
- Academic analysis of prediction accuracy

---

### **3. V1 Full (Production System - Currently Broken)**
**Complete betting system with all features**

```bash
# Attempt local execution (may fail due to CommonJS issues)
node scripts/nfl/run-v1-local.mjs 2025 14

# Or fetch from production (currently timing out)
curl "https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?season=2025&week=14"
```

**Features (when working):**
- ✅ Full EPA model with historical stats
- ✅ Live TheOddsAPI integration
- ✅ Injury analysis with depth charts
- ✅ Edge calculations (model vs market)
- ✅ Kelly criterion bet sizing
- ✅ Parlay suggestions
- ✅ Safety limits and divergence flags
- ⚠️ Complex dependencies (CommonJS/ESM issues locally)
- ⚠️ Production endpoint currently timing out

**Output:** `nfl_v1_week14_predictions.json` (from curl) or console output

**Status:** 🔴 **Currently broken in production, local execution has import issues**

---

## 🔑 **API Key Configuration**

All systems that fetch live odds require a TheOddsAPI key:

```bash
# Set environment variable
export ODDS_API_KEY="c5d3fe15e6c5be83b2acd8695cff012b"

# Or in .env.local file
echo 'ODDS_API_KEY=c5d3fe15e6c5be83b2acd8695cff012b' >> .env.local
```

**Get your free key:** https://the-odds-api.com/  
**Free tier:** 500 requests/month

---

## 📋 **Quick Command Reference**

```bash
# V1 Lite (fastest, with live odds)
node scripts/nfl/run-v1-lite-local.mjs 2025 14

# V5 (pure model, no odds)
node scripts/nfl/run-v5-local.mjs 2025 14

# Compare V5 predictions to your sportsbook
node scripts/nfl/run-v5-local.mjs 2025 14 && \
  cat nfl-model-v4.1/output/bundle_v5_2025_week14.json | \
  jq '.games[] | {game_id, predicted_spread: .spread_model.predicted_spread}'
```

---

## 🐛 **Troubleshooting**

### **"No odds available" in V1 Lite**
- Check that `ODDS_API_KEY` is set: `echo $ODDS_API_KEY`
- Verify key works: `curl "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=YOUR_KEY"`
- Check remaining quota: API returns `x-requests-remaining` header

### **V5 "No games found"**
- Ensure week number is valid (1-18 for regular season)
- Check if NFLverse data exists for that week
- For future weeks, NFLverse may not have data yet

### **V1 Full "CommonJS module" error**
- This is expected - use V1 Lite instead
- Or wait for production endpoint to be fixed

---

## 📊 **Output Comparison**

| System | File Size | Games | Odds | Edge | Bets | Time |
|--------|-----------|-------|------|------|------|------|
| **V1 Lite** | 50KB | 14 | ✅ Live | ❌ | ❌ | ~3s |
| **V5** | 16KB | 14 | ❌ | ❌ | ❌ | ~2s |
| **V1 Full** | 237KB | 14 | ✅ Live | ✅ | ✅ | ~15s |

---

## 💡 **Recommended Workflow**

1. **Quick odds check**: Use V1 Lite
   ```bash
   node scripts/nfl/run-v1-lite-local.mjs 2025 14
   ```

2. **Get model predictions**: Use V5
   ```bash
   node scripts/nfl/run-v5-local.mjs 2025 14
   ```

3. **Manual edge calculation**:
   - V5 says: "DAL -5.7"
   - V1 Lite shows market: "DET -3"
   - Your edge: 2.7 points in favor of DAL

4. **Place bets** based on your own analysis and bankroll management

---

## 🚀 **Next Steps to Fix Production**

The production V1 endpoint is timing out. To fix:

1. **Profile execution time** - identify slow operations
2. **Add caching** - cache NFLverse data, odds, player EPA
3. **Optimize queries** - reduce API calls
4. **Increase timeout** - Netlify functions have 10s default, may need 26s
5. **Consider splitting** - separate data fetch from prediction generation

For now, **use V1 Lite locally** as a workaround.
