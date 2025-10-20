# 🚀 NHL ELITE MODEL V4.0 - DEPLOYMENT GUIDE

**Status:** Ready for production  
**Version:** 4.0 (Elite Projections with Speed Optimization)  
**Risk:** Low (includes 502 protection + graceful degradation)

---

## What Changed

### ✅ NEW: Elite Projection Engine
**File:** `netlify/functions/_lib/nhl-elite-projection-v4.mjs`

**Features:**
- ✅ Individual player stats (not position baselines)
- ✅ Recency weighting (60% season, 30% L5, 10% L10)
- ✅ Opponent defensive strength adjustments
- ✅ Hot/cold streak detection
- ✅ TOI-weighted projections
- ✅ Power play deployment intelligence
- ✅ Player quality multipliers
- ✅ Venue scorer bias corrections
- ✅ Zero-Inflated Negative Binomial probability
- ✅ Scratch risk modeling

**Performance:**
- In-memory caching (loads data once per invocation)
- Optimized ZINB calculations
- Pre-load cache at start
- Expected: <3 seconds for full scan

### ✅ NEW: Elite Scanner
**File:** `netlify/functions/nhl-sog-scanner-elite-fast.mjs`

**Anti-502 Protections:**
- 9-second timeout safety margin
- Cache preloading before projections
- Parallel data fetching
- Early returns if timeout approaching
- Graceful degradation

### ✅ UPDATED: GitHub Workflow
**File:** `.github/workflows/nhl-daily-logger.yml`

**Change:** Now calls `nhl-sog-scanner-elite-fast` instead of `v3-optimized`

---

## Pre-Deployment Checklist

### 1. Test Locally ✅
```bash
# Test the elite projection engine
node scripts/nhl/test-elite-model.mjs
```

**Expected output:**
- Cache loads in <500ms
- Projections complete in <100ms each
- Total time <2 seconds
- Reasonable SOG values (1-5 range)

### 2. Verify Data Availability ✅
```bash
# Check if Netlify Blobs have player/team stats
curl https://bgroundrobin.com/.netlify/functions/nhl-sog-scanner-elite-fast
```

**Expected:**
- Status 200
- `usingEliteModel: true` in metadata
- Opportunities array with projections
- Execution time <5 seconds

### 3. Compare Old vs New ✅
```bash
# Old model
curl https://bgroundrobin.com/.netlify/functions/nhl-sog-scanner-v3-optimized > old.json

# New model
curl https://bgroundrobin.com/.netlify/functions/nhl-sog-scanner-elite-fast > new.json

# Compare
node -e "
const old = require('./old.json');
const new_ = require('./new.json');
console.log('Old picks:', old.opportunities?.length);
console.log('New picks:', new_.opportunities?.length);
console.log('Old execution:', old.metadata?.executionTime);
console.log('New execution:', new_.metadata?.executionTime);
"
```

---

## Deployment Steps

### Step 1: Commit & Push to GitHub
```bash
git add netlify/functions/nhl-sog-scanner-elite-fast.mjs
git add netlify/functions/_lib/nhl-elite-projection-v4.mjs
git add .github/workflows/nhl-daily-logger.yml
git add scripts/nhl/test-elite-model.mjs
git commit -m "🚀 Deploy NHL Elite Model V4.0 - Fix OVER bias with individual player stats"
git push origin main41
```

### Step 2: Netlify Auto-Deploy
- Netlify will automatically detect the new function
- New function available at: `/.netlify/functions/nhl-sog-scanner-elite-fast`
- Check Netlify deploy logs for errors

### Step 3: Test on Production
```bash
# Test the deployed function
curl https://bgroundrobin.com/.netlify/functions/nhl-sog-scanner-elite-fast

# Should return:
# - Status 200
# - metadata.version: "4.0-elite-fast"
# - metadata.usingEliteModel: true
# - opportunities array with projections
```

### Step 4: Monitor First Run
- GitHub workflow will run at 12pm ET (next scheduled time)
- Check Actions tab: https://github.com/bgoldman22-code/RRMODEL/actions
- Verify picks are logged to `data/nhl/logs/predictions_2024-25.csv`
- Check that projections look reasonable (not all position baselines)

---

## Validation Checks

### ✅ Elite Model is Being Used
Look for these in the logged predictions:

**OLD MODEL (position baselines):**
```csv
Connor McDavid,EDM,CGY,C,2.5,OVER,3.2,...
Random 4th Liner,NYR,PHI,C,2.5,OVER,3.2,...
```
(Everyone gets same baseline by position)

**NEW MODEL (individual stats):**
```csv
Connor McDavid,EDM,CGY,C,2.5,OVER,4.8,...
Random 4th Liner,NYR,PHI,C,1.5,UNDER,1.2,...
```
(Each player gets unique projection based on their stats)

### ✅ No 502 Errors
- Function completes in <10 seconds
- No timeout errors in Netlify logs
- Scanner returns full results (not cut off mid-execution)

### ✅ Reasonable Projections
- Elite players: 3.5-5.5 SOG
- Top-6 forwards: 2.5-3.5 SOG
- Bottom-6 forwards: 1.5-2.5 SOG
- Elite defensemen: 2.5-3.5 SOG
- Bottom-pair D: 1.0-2.0 SOG

### ✅ OVER Bias Fixed
After 1-2 weeks, check performance:
```bash
node scripts/nhl/monitor-dashboard.mjs
```

**Expected improvements:**
- OVER win rate: ~45-50% (up from 10%)
- High-edge picks (20%+): ~55-60% (up from 12.5%)
- Overall hit rate: ~50-55% (up from 26%)

---

## Rollback Plan

If the elite model causes issues:

### Option 1: Quick Rollback (Workflow Only)
**File:** `.github/workflows/nhl-daily-logger.yml`

Change line 33 back to:
```yaml
curl -s https://bgroundrobin.com/.netlify/functions/nhl-sog-scanner-v3-optimized | \
```

This keeps the old scanner running while we debug.

### Option 2: Full Rollback (Git Revert)
```bash
git revert HEAD
git push origin main41
```

### Option 3: Emergency Manual Override
If automated logging fails:
```bash
# Manually run the old scanner
curl https://bgroundrobin.com/.netlify/functions/nhl-sog-scanner-v3-optimized | \
  node scripts/nhl/manual-log-from-scanner.mjs
```

---

## Expected Results

### Week 1 (Oct 21-27)
- More conservative OVER projections
- OVER win rate should improve from 10% → 35-40%
- Fewer high-edge picks (model will be more accurate about edges)
- Overall ROI should move from -0.50U/pick → -0.10 to +0.05U/pick

### Week 2-3 (Oct 28 - Nov 10)
- Model calibrates to actual results
- OVER win rate 45-50%
- High-edge picks (20%+) perform at 55-60%
- Overall ROI +0.10 to +0.15U/pick

### Month 1 (Nov)
- Consistent 50-55% overall hit rate
- Positive ROI across all edge tiers
- OVER/UNDER balanced performance
- Elite players projected more accurately

---

## Troubleshooting

### ❌ Issue: 502 Timeout Errors
**Symptoms:** Function times out, returns 502/504

**Fix:**
1. Check execution time in logs
2. If >9s, reduce players processed:
   ```javascript
   // In scanner, line ~330:
   const playersToProcess = [
     ...(roster.forwards || []).slice(0, 6),  // Reduce from 9 to 6
     ...(roster.defensemen || []).slice(0, 3)  // Reduce from 5 to 3
   ];
   ```

### ❌ Issue: "Player not found" warnings
**Symptoms:** Many players return null projections

**Fix:**
1. Check if Netlify Blobs have data:
   ```bash
   # Should show player_stats_20242025 and team_stats_20242025
   curl https://bgroundrobin.com/.netlify/blobs/nhl-stats
   ```
2. If missing, run stats update:
   ```bash
   node scripts/nhl/update-player-stats.mjs
   node scripts/nhl/update-team-stats.mjs
   ```

### ❌ Issue: Unrealistic projections
**Symptoms:** McDavid projected at 1.5 SOG, 4th liner at 5.0 SOG

**Fix:**
1. Check player cache has correct data
2. Verify opponent defense ratings are reasonable (0.8-1.2 range)
3. Check venue effects aren't too extreme

---

## Monitoring Dashboard

After deployment, monitor via:
```bash
# Daily check
node scripts/nhl/monitor-dashboard.mjs

# Full season analysis
node scripts/nhl/analyze-season-performance.mjs
```

**Key metrics:**
- Overall hit rate >50%
- OVER/UNDER balanced (both 45-52%)
- High-edge picks outperform low-edge
- ROI positive across all tiers

---

## Next Steps After Deployment

### Immediate (Week 1):
1. ✅ Monitor first 3 days for 502 errors
2. ✅ Verify projections look reasonable
3. ✅ Check OVER bias is reduced

### Short-term (Week 2-4):
1. ⏳ Analyze performance vs old model
2. ⏳ Calibrate ZINB parameters based on results
3. ⏳ Fine-tune edge thresholds

### Long-term (Month 2+):
1. ⏳ Add ML-enhanced adjustments
2. ⏳ Build auto-recalibration
3. ⏳ Integrate advanced game script modeling

---

## Success Criteria

**Deployment Successful If:**
- ✅ No 502 errors for 7 days
- ✅ OVER win rate >40% (was 10%)
- ✅ High-edge picks >50% (was 12.5%)
- ✅ Overall ROI >0 (was -0.50U/pick)

**Model Working As Expected If:**
- ✅ Elite players projected higher than grinders
- ✅ Cold streaks reduce projections
- ✅ Opponent defense matters
- ✅ Home/away splits reasonable
- ✅ PP players get appropriate boosts

---

**Ready to deploy!** 🚀

The elite model is:
- ✅ Built and tested
- ✅ Optimized for speed
- ✅ Protected against 502s
- ✅ Backward compatible
- ✅ Easy to rollback if needed

No more betting on position baselines. Time to use the Ferrari! 🏎️
