# NBA Player Props - Function Timeout Issue
**Date:** November 7, 2025  
**Status:** ⚠️ WORKAROUND DEPLOYED

## Problem
The Netlify function `trigger-nba-predictions` times out when fetching ESPN data:
- ESPN fetch takes 30-60 seconds (fetching 25 days of boxscores)
- Netlify function timeout: 10 seconds (default), 26 seconds max (free tier)
- Function never completes, returns timeout error
- Frontend falls back to stale static JSON

## Immediate Fix Deployed ✅
**Commit:** 050fc7b1 - "fix: Update static JSON with Nov 7 picks"

Updated `public/data/nba-player-props-live.json` with:
- 170 picks from local generation (Nov 7, 2025)
- Correct confidence format (percentage, not decimal)
- Proper field names matching frontend expectations

**Result:** Page now works via static fallback, shows today's picks

## Root Cause Analysis

### Why Function Times Out
```javascript
// Current flow (too slow for Netlify):
1. Function starts
2. Tries to load from Blobs (fails - not seeded)
3. Falls back to ESPN fetch
4. Fetches 25 days of boxscores (30-60 seconds) ← TIMEOUT HERE
5. Never reaches prediction generation
```

### Why ESPN Fetch Is Slow
- Fetches scoreboard for each of last 25 days (25 API calls)
- For each game, fetches detailed summary (100+ API calls total)
- Rate limited to 300ms between calls
- **Total time:** 25 days × 10 games/day × 300ms = 75 seconds minimum

## Solutions

### Option A: Use Scheduled Function (RECOMMENDED) ⭐
The scheduled function runs at 7am ET daily and has more execution time.

**Implementation:**
1. Scheduled function already exists: `generate-daily-predictions.mjs`
2. Runs via cron: `0 11 * * *` (11am UTC = 7am ET)
3. Has 300+ seconds execution time
4. Stores results in Blobs: `nba-picks-latest`
5. Frontend reads from Blobs (instant)

**Changes needed:**
- Frontend should read from Blobs, not call trigger function
- Or: Trigger function should just return cached Blobs data

**Status:** Scheduled function exists but needs testing

### Option B: Seed Netlify Blobs
Pre-populate Blobs with boxscores so function doesn't fetch ESPN.

**Implementation:**
```bash
# Run locally once:
NETLIFY_SITE_ID=xxx NETLIFY_TOKEN=xxx node scripts/nba/seed-blobs-locally.mjs
```

**Result:**
- Blobs contain boxscores (updated daily by separate function)
- Prediction function loads from Blobs (< 1 second)
- Prediction generation takes 5-10 seconds
- Total: Under 15 seconds, within timeout

**Status:** Script exists, needs credentials and execution

### Option C: Optimize ESPN Fetch
Make the fetch faster by parallelizing or reducing days.

**Changes:**
- Fetch fewer days (15 instead of 25)
- Parallelize API calls (careful with rate limits)
- Use compression/caching

**Status:** Would require significant refactoring

### Option D: Two-Step Process
Separate data fetch from prediction generation.

**Flow:**
1. User clicks "Generate Predictions"
2. Frontend calls trigger function
3. Function starts background job, returns immediately
4. Frontend polls for completion
5. When ready, displays results

**Status:** Complex, requires job queue system

## Recommended Approach

**Phase 1 (DONE):** ✅ Static JSON fallback
- Updated static file with today's picks
- Page works immediately
- Manual update required daily

**Phase 2 (Next):** Use Scheduled Function Properly
1. Let scheduled function run at 7am ET daily
2. It saves results to Blobs: `nba-picks-latest`
3. Frontend reads from Blobs (via simple getter function)
4. Or: Trigger function just returns cached Blobs data

**Phase 3 (Later):** Seed Blobs for Faster Execution
1. Seed historical boxscores to Blobs
2. Daily update function refreshes current data
3. Prediction function uses Blobs (fast)
4. Trigger function works on-demand

## Implementation Plan for Phase 2

### Step 1: Create Blobs Reader Function
New function: `netlify/functions/get-nba-predictions.mjs`
```javascript
import { getStore } from '@netlify/blobs';

export default async () => {
  const store = getStore('nba-data');
  const picks = await store.get('nba-picks-latest', { type: 'json' });
  
  return new Response(JSON.stringify(picks || { predictions: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

### Step 2: Update Frontend
Change API endpoint from:
```javascript
fetch('/.netlify/functions/trigger-nba-predictions')
```
To:
```javascript
fetch('/.netlify/functions/get-nba-predictions')
```

### Step 3: Test Scheduled Function
Verify it runs at 7am ET and saves to Blobs correctly.

### Step 4: Manual Trigger for Testing
Add button: "Force Regenerate" that calls a long-timeout function (for admin use only)

## Current Status

### Working ✅
- Static JSON fallback shows today's picks
- Page displays correctly with all data
- Confidence values correct (60-95%)
- All 170 picks visible

### Broken ❌
- On-demand trigger function times out
- Can't regenerate picks on-demand
- Requires manual static JSON update

### In Progress 🔄
- Scheduled function exists but untested
- Blobs infrastructure in place but not used
- Need to wire up proper data flow

## Next Actions

1. **Test scheduled function** (wait until 7am ET tomorrow)
2. **Create simple Blobs reader function** (5 min task)
3. **Update frontend to use reader** (5 min task)
4. **Deploy and verify** (works instantly from cache)

## Time Estimates
- Phase 2 implementation: 30 minutes
- Phase 3 (Blobs seeding): 1-2 hours
- Full optimization: 1 day

## Alternative: Just Use Static JSON
If scheduled function is unreliable:
1. Keep current static JSON approach
2. Run local script daily at 6:30am
3. Auto-commit and push to GitHub
4. Netlify deploys automatically
5. Page always has fresh picks

**Pros:** Simple, reliable, no serverless complexity
**Cons:** Manual process, not "live"

## Conclusion
The function timeout is a Netlify limitation. Best solution is to:
1. ✅ Use static JSON (working now)
2. ⏳ Wire up scheduled function + Blobs reader (next)
3. 🔮 Eventually seed Blobs for on-demand generation

The page works now. The on-demand trigger can wait until we implement proper caching.
