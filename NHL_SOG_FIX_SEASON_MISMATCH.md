# NHL SOG Issue - ROOT CAUSE IDENTIFIED
**Date**: October 28, 2025  
**Status**: 🔴 BROKEN - Season Data Mismatch

---

## ROOT CAUSE

**The NHL SOG scanner is trying to load data from TWO DIFFERENT SEASONS:**

### Current Code (nhl-elite-projection-v4.cjs.js)

**Line 38** - Player Stats:
```javascript
data = await store.get('player_stats_20252026', { type: 'json' }); ✅ CORRECT (current season)
```

**Line 89** - Team Stats:
```javascript
data = await store.get('team_stats_20242025', { type: 'json' }); ❌ WRONG (old season!)
```

### Why This Breaks

1. **Player stats load successfully** (2025-2026 season data exists)
2. **Team stats fail or return stale data** (2024-2025 season ended)
3. **Projection engine gets mismatched data** → wrong opponent adjustments
4. **OR** team stats blob doesn't exist → 502 error or empty results

---

## FILES TO FIX

### File 1: `netlify/functions/_lib/nhl-elite-projection-v4.cjs.js`

**Line 89** - Change FROM:
```javascript
data = await store.get('team_stats_20242025', { type: 'json' });
```

**TO**:
```javascript
data = await store.get('team_stats_20252026', { type: 'json' });
```

**Line 97** - Change GitHub fallback URL FROM:
```javascript
const ghUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main42/data/nhl/team_stats_20242025.json';
```

**TO**:
```javascript
const ghUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main42/data/nhl/team_stats_20252026.json';
```

**Line 107** - Change blob save key FROM:
```javascript
await store.setJSON('team_stats_20242025', ghData);
```

**TO**:
```javascript
await store.setJSON('team_stats_20252026', ghData);
```

---

## DATA TO UPLOAD

### Check if team_stats file exists for current season:

```bash
ls -lh data/nhl/team_stats_*.json
```

**Expected**:
- `team_stats_20242025.json` ← Old season (delete or archive)
- `team_stats_20252026.json` ← Current season (should exist)

### If team_stats_20252026.json doesn't exist:

You need to fetch current season team stats:

```javascript
// Run script to fetch 2025-2026 team stats
node scripts/nhl/fetch-team-stats.js
```

OR manually create from NHL API:
```bash
curl "https://api-web.nhle.com/v1/standings/now" > data/nhl/team_stats_20252026.json
```

### Upload to Netlify Blobs:

```bash
# Upload current season team stats
netlify blobs:set nhl-stats team_stats_20252026 data/nhl/team_stats_20252026.json

# Verify both seasons are uploaded
netlify blobs:list nhl-stats

# Expected output:
# player_stats_20252026 ← ✅
# team_stats_20252026   ← ✅ (after upload)
# team_stats_20242025   ← ⚠️ Can delete (old season)
```

---

## WHY THIS HAPPENED

Looking at the timeline:
1. **Oct 17, 2025**: Fixed 502 errors by migrating to Netlify Blobs
2. **At that time**: NHL season was 2024-2025 (before playoffs)
3. **Uploaded**: `player_stats_20242025` and `team_stats_20242025`
4. **Later**: New NHL season started (2025-2026)
5. **Player stats updated**: Someone updated to `player_stats_20252026`
6. **Team stats NOT updated**: Still referencing `team_stats_20242025`

**Result**: Player stats are current, team stats are from last season = mismatched data

---

## ADDITIONAL ISSUES FOUND

### Issue 2: GitHub Fallback URLs

If Netlify Blobs fail, the code falls back to GitHub raw URLs. These also need updating:

**Player Stats** (Line 46):
```javascript
const ghUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main42/data/nhl/player_stats_20252026.json';
```
✅ CORRECT (already updated)

**Team Stats** (Line 97):
```javascript
const ghUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main42/data/nhl/team_stats_20242025.json';
```
❌ WRONG (needs update to 20252026)

### Issue 3: Other Scanner Files

These files may also reference old season:

```bash
# Check all NHL files for season references
grep -r "team_stats_20242025" netlify/functions/

# Expected matches:
# - nhl-elite-projection-v3.mjs (older version, probably not used)
# - nhl-elite-projection-v4.cjs.js (ACTIVE - needs fix)
# - Any other active scanners
```

---

## STEP-BY-STEP FIX

### Step 1: Fix the Code

```bash
# Open the file
code netlify/functions/_lib/nhl-elite-projection-v4.cjs.js

# Make 3 changes (lines 89, 97, 107):
# 1. Line 89:  team_stats_20242025 → team_stats_20252026
# 2. Line 97:  team_stats_20242025 → team_stats_20252026 (GitHub URL)
# 3. Line 107: team_stats_20242025 → team_stats_20252026 (blob save key)
```

### Step 2: Verify Team Stats Data Exists

```bash
# Check if current season team stats exist
ls -lh data/nhl/team_stats_20252026.json

# If it doesn't exist, fetch it
node scripts/nhl/fetch-team-stats.js
# OR
curl "https://api-web.nhle.com/v1/standings/now" | jq '.' > data/nhl/team_stats_20252026.json
```

### Step 3: Upload to Netlify Blobs

```bash
# Upload current season data
netlify blobs:set nhl-stats team_stats_20252026 data/nhl/team_stats_20252026.json

# Verify upload
netlify blobs:list nhl-stats
# Should show: player_stats_20252026, team_stats_20252026
```

### Step 4: Test Locally

```bash
# Start local Netlify dev server
netlify dev

# In browser, navigate to:
# http://localhost:8888/.netlify/functions/nhl-sog-scanner-elite-fast

# Should return JSON with picks (or empty array if no games today)
```

### Step 5: Deploy

```bash
git add netlify/functions/_lib/nhl-elite-projection-v4.cjs.js
git commit -m "Fix NHL SOG: Update team stats to 2025-2026 season

ROOT CAUSE: Season data mismatch
- Player stats using 2025-2026 ✅
- Team stats using 2024-2025 ❌

CHANGES:
- Line 89: team_stats_20242025 → team_stats_20252026
- Line 97: Update GitHub fallback URL to 20252026
- Line 107: Update blob save key to 20252026

DEPLOYMENT:
- Upload team_stats_20252026.json to Netlify Blobs
- Verify both player/team stats on same season

IMPACT: Fixes opponent adjustment calculations"

git push origin main42
```

### Step 6: Verify in Production

```bash
# Check production logs
netlify functions:log nhl-sog-scanner-elite-fast

# Or test production endpoint directly
curl https://your-site.netlify.app/.netlify/functions/nhl-sog-scanner-elite-fast
```

---

## EXPECTED OUTCOME

**After Fix**:
- ✅ Both player stats and team stats from 2025-2026 season
- ✅ Opponent adjustments calculated correctly (current season defensive stats)
- ✅ No 502 errors
- ✅ Picks generated when +EV opportunities exist

**Before Fix** (Current Broken State):
- ❌ Player stats from 2025-2026
- ❌ Team stats from 2024-2025 (or missing)
- ❌ Mismatched opponent adjustments
- ❌ Possibly no picks or wrong projections

---

## PREVENTION

### Add Season Constant

To prevent this in the future, use a season constant:

```javascript
// At top of file
const CURRENT_SEASON = '20252026';

// Then use throughout:
data = await store.get(`player_stats_${CURRENT_SEASON}`, { type: 'json' });
data = await store.get(`team_stats_${CURRENT_SEASON}`, { type: 'json' });
```

This way you only need to update ONE place when the season changes.

---

## SUMMARY

**Problem**: Team stats loading from 2024-2025 season, player stats from 2025-2026
**Impact**: Wrong opponent adjustments, possibly no picks
**Fix**: 3-line code change + upload current team stats to Blobs
**Time**: 5 minutes
**Priority**: 🔴 CRITICAL (system broken until fixed)
