# NFL V1 Model Updates: December 8, 2025

## Summary

Updated the V1 prediction model to fix odds staleness issues and remove problematic depth chart detection while keeping valuable injury adjustments.

---

## Changes Made

### 1. Fresh Odds Fetching System ✅

**Problem:** V1 was using stale odds data (5+ days old), causing incorrect edge calculations.

**Solution:** Created `scripts/nfl/run-v1-fresh-odds.mjs` that:
- Forces fresh odds fetch from TheOddsAPI on every run
- Adds cache-busting timestamps
- Displays odds metadata (fetch time, source, freshness)
- Warns if data is >5 minutes old

**Usage:**
```bash
ODDS_API_KEY=<your_key> node scripts/nfl/run-v1-fresh-odds.mjs 2025 14
```

**Benefits:**
- Always get current market lines
- Accurate edge calculations
- Better betting decisions

---

### 2. Depth Chart Detection DISABLED ❌

**Problem:** Depth chart change detection was causing false positives:
- Joe Burrow → Jake Browning (when Burrow was healthy and starting)
- Isiah Pacheco / Kareem Hunt confusion
- Nick Chubb / Woody Marks false swaps
- These false positives were creating -1.4 to -23.4 point adjustments on healthy teams

**Solution:** Disabled the entire depth chart detection system in `index.mjs`:
- Lines 1605-1750: Commented out `getDepthChartImpactsForTeam()` calls
- Removed `DEPTH_CHANGE` status adjustments
- Kept clear documentation of why it's disabled

**What We KEPT:**
- ✅ Canonical Availability v5 (official injury reports)
- ✅ QB/RB/WR/TE injury penalties
- ✅ Position-specific EPA adjustments
- ✅ Return boost system
- ✅ Injury duration tracking

**What We REMOVED:**
- ❌ Week-over-week depth chart comparisons
- ❌ "previousStarter → currentStarter" logic
- ❌ Benching/promotion detection
- ❌ Non-injury personnel change adjustments

---

### 3. Odds Metadata Tracking ✅

**Added to V1 response:**
```json
{
  "oddsMetadata": {
    "fetchTime": "2025-12-08T18:03:40.501Z",
    "gamesWithOdds": 14,
    "source": "TheOddsAPI (fresh)" or "fallback or cached",
    "apiKeyPresent": true
  }
}
```

This allows you to verify odds freshness on every run.

---

## Impact Analysis

### Before (with Depth Chart Detection):
```
CIN @ BUF: BUF -17 (FALSE - applied -23.4 pt penalty to CIN for fake Burrow injury)
```

### After (injury reports only):
```
CIN @ BUF: BUF -2.0 (CORRECT - no false QB change penalty)
```

### Example: PHI @ LAC MNF Game

**Old System (Dec 3 odds):**
- Market Line: LAC -3
- Model: PHI -4.3 to -6.0
- Edge: 1.3 to 3.0 points
- **Problem:** Odds were 5 days stale

**New System (Dec 8 fresh odds):**
- Market Line: PHI -2.5 (actual current line)
- Model: PHI -4.3 to -6.0  
- Edge: 1.8 to 3.5 points  
- **Benefit:** Accurate edge calculation, better betting decision

---

## What You Should Do Now

### 1. Always Use Fresh Odds Script
```bash
# Instead of old script:
# node scripts/nfl/run-v1-local.mjs 2025 14

# Use new fresh odds script:
ODDS_API_KEY=c5d3fe15e6c5be83b2acd8695cff012b node scripts/nfl/run-v1-fresh-odds.mjs 2025 14
```

### 2. Check Odds Metadata
Always look for the `oddsMetadata` section in output:
- `fetchTime`: Should be within last 5 minutes
- `source`: Should say "TheOddsAPI (fresh)"
- `apiKeyPresent`: Should be `true`

### 3. Verify No Depth Chart Adjustments
In prediction output, you should NO LONGER see:
```json
{
  "status": "DEPTH_CHANGE",
  "reason": "QB1 change: X → Y",
  "isDepthChartChange": true
}
```

You SHOULD still see legitimate injury adjustments:
```json
{
  "status": "out" or "questionable",
  "reason": "Canonical availability v5 (field-level precedence)"
}
```

---

## Files Modified

1. **`scripts/nfl/run-v1-fresh-odds.mjs`** (NEW)
   - Fresh odds fetching script
   - Replaces `run-v1-local.mjs` for production use

2. **`scripts/nfl/run-v1-local.mjs`** (MODIFIED)
   - Updated to require ODDS_API_KEY
   - Forces local execution (no HTTP fallback)
   - Better error messages

3. **`netlify/functions/nfl-predictions-generate/index.mjs`** (MODIFIED)
   - Lines 1605-1750: Disabled depth chart detection
   - Lines 3640-3655: Added `oddsMetadata` to response
   - Kept all injury system imports and logic

---

## Testing Checklist

- [x] NFLVerse data updated through 12/7/25
- [x] Fresh odds fetch working with API key
- [x] Depth chart detection disabled
- [x] Injury adjustments still working
- [x] Odds metadata in response
- [ ] Deploy to production (Netlify)
- [ ] Verify fresh odds on live site

---

## Next Steps

### Option A: Deploy Now
1. Commit changes to git
2. Push to main branch
3. Netlify will auto-deploy
4. Test on production with fresh odds

### Option B: Test More Games
1. Run fresh odds script for upcoming games
2. Verify no depth chart false positives
3. Compare V1 vs V5 predictions
4. Then deploy

### Recommendation
**Deploy now** - depth chart bugs were causing major issues (17+ point swings), and injury reports are more reliable.

---

## Monitoring

After deployment, watch for:
1. **No more DEPTH_CHANGE adjustments** in predictions
2. **Odds fetch times** within 5 minutes
3. **Spread predictions** that make sense (no wild 17-point favorites)
4. **Injury adjustments** still working for legitimate OUT/QUESTIONABLE players

If you see any `isDepthChartChange: true` in output, something went wrong.

---

## Rollback Plan

If needed, restore depth chart detection:
1. Find backup: `index.mjs.backup` or `.bak2`
2. Restore imports and function calls
3. Redeploy

**But:** Depth chart detection had fundamental data quality issues, so rollback not recommended.

---

**Summary:** V1 is now cleaner, faster, and more reliable with fresh odds and no false depth chart penalties. Injury adjustments (the valuable part) remain intact.
