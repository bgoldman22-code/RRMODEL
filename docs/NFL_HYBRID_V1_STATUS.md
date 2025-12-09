# Getting V1 Data for NFL Hybrid System

## 🎯 The Goal
You want **V1 vs V5 side-by-side analysis** like you had for the PHI game - showing injury impacts, win probabilities, and model disagreement.

## ❌ Current Problem
**V1 data is showing as N/A because:**
1. Your production API (https://bgroundrobin.com) is returning 502 Bad Gateway
2. The Netlify dev server isn't configured properly locally
3. V1 can't run directly due to ESM/CommonJS import issues

## ✅ Solution Options

### **Option 1: Fix Production API** (Recommended)
1. Check your Netlify deployment status at https://app.netlify.com
2. Look for build errors or function timeouts
3. Redeploy if needed
4. Once fixed, run:
   ```bash
   node scripts/nfl/generate-v1-for-hybrid.mjs 2025 15
   node scripts/nfl/run-hybrid-local.mjs 2025 15
   ```

### **Option 2: Use V5-Only Mode** (Current State)
The hybrid system is currently working with V5-only:
- ✅ 16 games analyzed
- ✅ 39.0 units recommended
- ✅ Real odds from TheOddsAPI
- ✅ PNG reports generated
- ❌ No V1 injury adjustments
- ❌ No model comparison

### **Option 3: Manual V1 Run** (When PHI worked)
When you ran PHI successfully, you used:
```bash
ODDS_API_KEY=your-api-key-here node scripts/nfl/run-v1-fresh-odds.mjs 2025 14 PHI
```

This called the production API which was working then. It's returning 502 now.

## 📊 What You're Getting Now (V5-Only)

**Week 15 Results:**
- **Strong Bets:** 7 picks @ 21.0U
  - CLE -7.5, ARI -10.0, LV +14.0, IND -11.5, TEN +8.0, MIN -6.0, MIA -3.0
- **Consider Bets:** 15 picks @ 18.0U
- **Total Action:** 39.0 units across 22 bets

## 🔧 What's Needed for Full V1+V5

1. **Production API must be working** (returning 200, not 502)
2. **Or** Netlify dev server running locally
3. **Or** Extract V1 core logic into standalone script (complex)

## 📋 Next Steps

1. Check Netlify deployment: https://app.netlify.com/sites/YOUR_SITE_NAME
2. If deployed correctly, try V1 generation again
3. If still failing, use V5-only mode (which is working great!)

## Current Workflow (V5-Only)

```bash
# Generate predictions
node scripts/nfl/run-hybrid-local.mjs 2025 15

# Generate PNG reports  
python3 scripts/nfl/export-hybrid-reports.py 2025 15

# Check results
open ~/Downloads/nfl_full_slate_week15_2025.png
open ~/Downloads/nfl_recommended_picks_week15_2025.png
```

The PNG reports show V5 data, V1 as N/A, and hybrid (which equals V5 when V1 is unavailable).
