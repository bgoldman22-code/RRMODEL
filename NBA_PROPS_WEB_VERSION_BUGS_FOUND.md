# NBA Player Props - Web Version Bugs Investigation
**Date:** November 7, 2025  
**Status:** 🔴 CRITICAL BUGS FOUND

## Summary
The web version at bgroundrobin.com/nba-player-props loads but displays incomplete/incorrect data:
- ✅ Page renders (route fixed)
- ❌ Prediction, Line, Bet columns are EMPTY or wrong
- ❌ Confidence shows <1% instead of 60-95%
- ❌ Edge values showing but may be incorrect format

## Root Cause Analysis

### Bug #1: Data Schema Mismatch Between Local vs Netlify Function
**Local Script** (`run-full-model-tonight.mjs`) uses:
```javascript
{
  player: "Jamal Murray",
  prop: "rebounds",        // ← Different!
  pick: "Over",            // ← Different!
  line: 4.5,              // ← Different!
  predicted: 7.2,         // ← Different!
  edge: 22.3,
  confidence: 76,         // Already as percentage 0-100
  odds: -110
}
```

**Netlify Function** (`generate-daily-predictions.mjs`) returns:
```javascript
{
  player: "Jamal Murray",
  propType: "rebounds",     // ← Different!
  betSide: "OVER",         // ← Different!
  vegasLine: 4.5,          // ← Different!
  prediction: 7.2,         // ← Different!
  edge: 22.3,
  confidence: 76.0,        // Correctly calculated (line 329)
  vegasOdds: -110
}
```

**Frontend Component** (`NBAPlayerProps.jsx`) expects:
```javascript
{
  player: string,
  team: string,
  opponent: string,
  propType: string,        // ✅ Matches Netlify
  prediction: number,      // ✅ Matches Netlify
  vegasLine: number,       // ✅ Matches Netlify
  betSide: string,         // ✅ Matches Netlify
  vegasOdds: number,       // ✅ Matches Netlify
  edge: number,
  confidence: number       // ✅ Matches Netlify
}
```

**VERDICT:** Schema matches! So why is data not showing?

### Bug #2: Possible Netlify Blobs Issue
The Netlify function stores predictions in Blobs:
```javascript
await store.set('nba-picks-latest', JSON.stringify(output));
```

But the trigger function just calls the generate function directly - it doesn't read from Blobs!

**The Problem:**
1. `generate-daily-predictions.mjs` runs scheduled at 7am ET
2. It generates picks and stores in `nba-picks-latest` Blob
3. Frontend calls `trigger-nba-predictions` which calls `generate-daily-predictions` AGAIN
4. But `generate-daily-predictions` tries to read `player-boxscores-historical` and `player-boxscores-current` Blobs
5. **IF THESE BLOBS DON'T EXIST**, the function fails silently or returns empty data

### Bug #3: Missing Team Names in Matchup Display
Frontend shows `vs` but no opponent name, suggesting `team` and `opponent` fields may be missing or undefined.

### Bug #4: Confidence Display Format
If confidence shows "0.8%" but should show "80%", the value is coming through as 0.008 instead of 80.

This suggests:
- JSON.stringify/parse is corrupting numbers
- OR Blobs storage is corrupting data
- OR the data was never calculated correctly

## Evidence from User's Screen
User reported seeing:
- Player names: ✅ Working
- Matchup: Shows "vs" but no team names ❌
- Prop type: ✅ Working  
- Prediction: EMPTY ❌
- Line: EMPTY ❌
- Bet: EMPTY ❌
- Edge: Shows values like 23.2, 21.1, 20.8 ✅ (but may be wrong format)
- Confidence: Shows 0.8-0.9% ❌ (should be 80-90%)

## Critical Questions to Answer

### Q1: Are the Netlify Blobs populated?
**Check:** Log into Netlify Dashboard → Blobs → Look for:
- `player-boxscores-historical`
- `player-boxscores-current`
- `nba-picks-latest`

**If missing:** The function will fail at line 166:
```javascript
if (!historicalData || !currentData) {
  throw new Error('No boxscores found in Netlify Blobs. Run seed-blobs-locally first.');
}
```

### Q2: Is the scheduled function actually running?
**Check:** Netlify Dashboard → Functions → Logs for `generate-daily-predictions`
- Should show runs at 7am ET daily
- Look for errors or "No boxscores found" message

### Q3: What does the trigger function actually return?
**Test:** Call the endpoint directly:
```bash
curl https://bgroundrobin.com/.netlify/functions/trigger-nba-predictions
```

Should return JSON with:
```json
{
  "generated": "2025-11-07T...",
  "games": 11,
  "model": "Baseline v2",
  "predictions": [
    {
      "player": "...",
      "propType": "rebounds",
      "prediction": 7.2,
      "vegasLine": 4.5,
      "betSide": "OVER",
      "edge": 22.3,
      "confidence": 76.0,
      ...
    }
  ]
}
```

### Q4: Does the frontend correctly parse the response?
Check browser console for:
- Network tab → Response from `trigger-nba-predictions`
- Console logs from `loadPredictions()` function
- Any JavaScript errors

## Likely Root Cause
**HYPOTHESIS:** The Netlify Blobs (`player-boxscores-historical`, `player-boxscores-current`) were never seeded, so the function fails when trying to read them, returns an error or empty array, and the frontend displays partial/corrupt data.

**Evidence:**
1. Edge values showing suggests SOME data is coming through
2. But critical fields empty suggests data structure is broken
3. Confidence <1% suggests decimal corruption (0.008 instead of 80)

## Immediate Fix Required

### Option A: Seed the Blobs (RECOMMENDED)
1. Find the script that seeds Netlify Blobs
2. Run it to populate `player-boxscores-historical` and `player-boxscores-current`
3. Verify blobs exist in Netlify Dashboard
4. Trigger the function manually
5. Check frontend

### Option B: Fix the Function to Use ESPN Directly (LIKE LOCAL VERSION)
1. Modify `generate-daily-predictions.mjs` to fetch from ESPN like `run-full-model-tonight.mjs` does
2. Remove dependency on Netlify Blobs
3. Redeploy
4. Test

### Option C: Make Frontend Read from Static JSON
1. Have scheduled function write to `public/data/nba-player-props-live.json` instead of Blobs
2. Frontend already has fallback logic for this
3. Requires build/deploy after each run

## Next Steps
1. **CHECK NETLIFY LOGS** for `trigger-nba-predictions` function
2. **CHECK NETLIFY BLOBS** existence
3. **CURL THE ENDPOINT** to see actual response
4. **LOOK FOR SEED SCRIPT** to populate Blobs
5. **FIX DATA FORMAT** if it's a corruption issue

## Validation Checklist
- [ ] Blobs exist and contain valid data
- [ ] Function returns properly formatted JSON
- [ ] Frontend receives and parses data correctly
- [ ] All columns display with correct values
- [ ] Confidence shows as percentage (60-95%)
- [ ] Prediction, Line, Bet columns populate
- [ ] Team/opponent names show in matchup

## Files to Review
1. `netlify/functions/generate-daily-predictions.mjs` - Core logic
2. `netlify/functions/trigger-nba-predictions.mjs` - HTTP wrapper
3. `src/pages/NBAPlayerProps.jsx` - Frontend display
4. Look for: `seed-blobs-locally.mjs` or similar seeding script
5. Look for: `update-boxscores-daily.mjs` mentioned in comments

## Working Local Version for Reference
`scripts/nba/run-full-model-tonight.mjs` - This works perfectly!
- Fetches ESPN data directly (no Blobs dependency)
- Outputs correct format
- Generated 170 picks for Nov 7 with proper confidence values

**Consider:** Porting this logic to replace the Netlify function entirely.
