# NHL SOG Model - Diagnostic Report
**Date**: October 28, 2025  
**Status**: Investigating "not working" issue

---

## Quick Diagnostic Checklist

### What specifically isn't working?

Please confirm which issue you're experiencing:

- [ ] **502 Errors** - Scanner returns 502 Bad Gateway errors
- [ ] **No Picks Generated** - Scanner runs but shows 0 picks
- [ ] **Incorrect Projections** - Picks generated but projections seem wrong
- [ ] **Slow Performance** - Scanner times out or takes >10 seconds
- [ ] **Data Stale** - Player stats not updating
- [ ] **Interface Not Loading** - React frontend won't display
- [ ] **Kelly Stakes Wrong** - Favorites showing 0.0U
- [ ] **Other** - Please describe

---

## Known Issues from Past Sessions

### ✅ RESOLVED (Oct 17, 2025)

1. **502 Errors from File System Access**
   - **Cause**: Elite scanner tried to read `/data/nhl/*.json` files
   - **Fix**: Migrated to Netlify Blobs
   - **Status**: ✅ Fixed (commit from Oct 17)

2. **Favorites Showing 0.0U**
   - **Cause**: Kelly calculation didn't handle negative odds properly
   - **Fix**: Used normal distribution CDF for win probability
   - **Status**: ✅ Fixed (commit from Oct 17)

3. **Duplicate Function Declarations**
   - **Cause**: Both async (Blobs) and sync (file) versions of loadTeamStats
   - **Fix**: Removed old synchronous versions
   - **Status**: ✅ Fixed (commit from Oct 17)

### ⚠️ POTENTIAL CURRENT ISSUES

#### Issue A: Which Scanner is Live?

**Files Found**:
- `nhl-sog-scanner-elite-fast.js` (most recent: Oct 24)
- `nhl-sog-scanner-elite.mjs` (Oct 17)
- `nhl-sog-scanner-v3-optimized.mjs` (Oct 17)
- `nhl-sog-scanner-v3.mjs` (Oct 9)
- `nhl-sog-debug.js` (Oct 21)

**Question**: Which endpoint is the React app calling?

**To Check**:
```bash
# Search React code for NHL endpoint
grep -r "nhl-sog" NHL.jsx src/
```

#### Issue B: Data Freshness

**Last Data Update**: Player stats JSON shows `lastUpdated: 2025-10-28T14:29:48.000Z`

**Questions**:
- Is NHL season active (Oct 28)?
- Are games scheduled today?
- Is the data fetch cron job running?

**To Check**:
```javascript
// Check if player_stats_20252026.json has recent data
const stats = require('./data/nhl/player_stats_20252026.json');
console.log('Last updated:', stats[0]?.lastUpdated);
console.log('Sample player:', stats.find(p => p.name === 'Connor McDavid'));
```

#### Issue C: Netlify Blobs Not Populated

**Required Blobs**:
- `nhl-stats/player_stats_20242025` ← May need to update to 2025-2026 season
- `nhl-stats/team_stats_20242025` ← May need to update to 2025-2026 season

**To Check**:
```bash
netlify blobs:list nhl-stats
```

**Potential Issue**: Season changed from 2024-2025 to 2025-2026, but Blobs still have old season data?

#### Issue D: Backtest Results

**Last Backtest** (from files):
- **Baseline Model**: MAE 1.319, Correlation 0.411 ❌ Failed
- **Improved Model**: Unknown (backtest may not have finished)

**Question**: Was improved model ever validated and deployed?

---

## Immediate Action Plan

### Step 1: Identify the Issue

Please run this diagnostic command:

```bash
# Test the live endpoint
curl https://your-site.netlify.app/.netlify/functions/nhl-sog-scanner-elite-fast

# Or check logs
netlify functions:log nhl-sog-scanner-elite-fast
```

Expected responses:
- ✅ **Good**: JSON with picks array
- ❌ **502 Error**: File system or module loading issue
- ❌ **Empty picks array**: No games today or no +EV found
- ❌ **Timeout**: Performance issue (function taking >10s)

### Step 2: Check Data Availability

```bash
# Check if NHL data exists locally
ls -lh data/nhl/player_stats_*.json

# Check Netlify Blobs
netlify blobs:list nhl-stats

# Sample a player
cat data/nhl/player_stats_20252026.json | jq '.[0]'
```

### Step 3: Verify Season Data

Current date: **October 28, 2025**
- NHL 2025-2026 season should have started (early October)
- Players should have ~10-15 games played
- Data files should be `player_stats_20252026.json`

**Check**: Are Blobs using 2024-2025 data but local files have 2025-2026?

---

## Quick Fixes by Issue Type

### If: 502 Errors

**Likely Cause**: Netlify Blobs not populated or wrong season

**Fix**:
```bash
# Upload current season data to Blobs
netlify blobs:set nhl-stats player_stats_20252026 data/nhl/player_stats_20252026.json
netlify blobs:set nhl-stats team_stats_20252026 data/nhl/team_stats_20252026.json

# Update scanner to look for 2025-2026 data
# Edit: netlify/functions/_lib/nhl-elite-projection-v3.mjs
# Change: const playerData = await getStore('nhl-stats').get('player_stats_20242025', { type: 'json' });
# To:     const playerData = await getStore('nhl-stats').get('player_stats_20252026', { type: 'json' });
```

### If: No Picks Generated

**Likely Cause**: 
- No NHL games today
- No +EV opportunities found
- Minimum edge threshold too high

**Fix**:
```javascript
// Check scanner settings
const MINIMUM_EDGE = 0.05; // 5% edge required
const MIN_KELLY_UNITS = 1.0; // Min 1U to show

// Lower thresholds for testing
const MINIMUM_EDGE = 0.02; // 2% edge
const MIN_KELLY_UNITS = 0.5; // Min 0.5U
```

### If: Kelly Stakes Wrong

**Check**: Is the normal distribution CDF fix applied?

**Location**: `netlify/functions/_lib/nhl-kelly-calculation.mjs` (or wherever Kelly is calculated)

**Should have**:
```javascript
function calculateWinProbability(projectedSOG, line, side) {
  const stddev = projectedSOG * 0.4; // Typical SOG variance
  const z = (projectedSOG - line) / stddev;
  
  if (side === 'over') {
    // P(X > line)
    return 1 - normalCDF(z);
  } else {
    // P(X < line)
    return normalCDF(z);
  }
}
```

### If: Data Stale

**Check**: When was player data last fetched?

**Fix**:
```bash
# Manually refresh data
node scripts/nhl/fetch-player-stats.js

# Upload to Blobs
netlify blobs:set nhl-stats player_stats_20252026 data/nhl/player_stats_20252026.json
```

---

## Model Performance Context

### Backtest History

**Baseline Model** (simple 10-game average):
- MAE: 1.319 shots (Target: < 1.0) ❌
- Correlation: 0.411 (Target: > 0.55) ❌
- Bias: +0.450 shots (over-prediction) ❌
- **Verdict**: Failed all gates

**Improved Model** (5 enhancements):
1. Position-specific baselines
2. Exponential recency weighting
3. Power play time indicator
4. Player shots/TOI efficiency
5. Enhanced home/away factors

**Status**: May not have been validated/deployed yet

**Question**: Is the live scanner using baseline or improved model?

---

## Next Steps

### Please Provide

1. **Specific Error/Behavior**:
   - What URL are you accessing?
   - What do you see (error message, blank screen, etc.)?
   - Screenshot if possible

2. **Recent Changes**:
   - Did this work before and break?
   - When did you last see it working?
   - Any recent code/config changes?

3. **Environment**:
   - Testing locally (`netlify dev`) or production?
   - Which scanner endpoint are you calling?
   - Any console errors in browser dev tools?

### I Can Help With

1. ✅ Fix 502 errors (Blobs migration, season data update)
2. ✅ Tune edge thresholds (lower minimum to generate more picks)
3. ✅ Debug Kelly calculation (favorites showing 0U)
4. ✅ Update data sources (if NHL API changed)
5. ✅ Deploy improved model (if backtest passed)
6. ✅ Performance optimization (if timeouts)

---

## Technical Debt / Potential Issues

### Multiple Scanner Versions

**Problem**: 12 different NHL SOG scanner files exist

**Files**:
- `nhl-sog-scanner-elite-fast.js` ← Most recent (Oct 24)
- `nhl-sog-scanner-elite.mjs` ← Original elite version
- `nhl-sog-scanner-v3-optimized.mjs` ← V3 with XGBoost
- `nhl-sog-scanner-v3-fast.mjs`
- `nhl-sog-scanner-v3.mjs`
- `nhl-sog-scanner-real.mjs`
- `nhl-sog-scanner-simple.mjs`
- `nhl-sog-scanner.mjs`
- `nhl-sog-calibrated-v2.js`
- `nhl-sog-calibrated-v2.mjs`
- `nhl-sog-debug.js`

**Confusion**: Which one is "the" scanner?

**Recommendation**: 
1. Identify the production endpoint (check `NHL.jsx`)
2. Consolidate to single canonical version
3. Archive/delete unused variants

### Season Data Mismatch

**Problem**: File names reference 2024-2025 season, but current date is Oct 28, 2025 (2025-2026 season)

**Files**:
- `data/nhl/player_stats_20242025.json` ← Old season?
- `data/nhl/player_stats_20252026.json` ← Current season

**Blobs**:
```bash
nhl-stats/player_stats_20242025 ← Old season?
nhl-stats/team_stats_20242025 ← Old season?
```

**If Blobs have old season but code expects current season → 502 errors**

---

## Summary

**Most Likely Issue**: Season data mismatch (Blobs have 2024-2025, code expects 2025-2026)

**Quick Fix**:
1. Upload current season data to Blobs
2. Update scanner to reference correct season keys
3. Test endpoint

**Let me know what you're seeing and I'll provide targeted fix!**
