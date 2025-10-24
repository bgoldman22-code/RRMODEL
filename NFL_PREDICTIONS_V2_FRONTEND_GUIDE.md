# NFL Predictions V2 Frontend - Quick Start Guide

## 🚀 Access the V2 Dashboard

**Live URL:** `https://bgroundrobin.com/nfl-predictions-v2`

## Features

### Side-by-Side Comparison
- **Left Panel:** V1 predictions (current production system)
- **Right Panel:** V2 predictions (HAD-enhanced system)
- Auto-loads both versions on page load

### Interactive Controls

1. **Generate V1** - Triggers fresh V1 prediction generation
2. **Generate V2** - Triggers fresh V2 prediction generation with HAD
3. **Load & Compare** - Loads saved predictions and compares
4. **Show Differences Only** - Filters to games with impact changes >0.5 pts

### Comparison Features

**Delta Badges:**
- Yellow badge shows impact difference between V1 and V2
- Green badge indicates V2 improved (larger impact magnitude)
- Example: `+1.9 pts` means V2 impact is 1.9 pts greater

**Impact Display:**
- Red background = negative impact (team gets worse)
- Green background = positive impact (team gets better)
- Shows exact point impact for each injured player

**Summary Stats:**
- Total injuries with different impacts
- Average delta between V1 and V2
- Maximum delta found
- Count of V2 improvements (larger impacts)

## Expected Results

### Bucky Irving (TB RB) - OUT
```
V1: -0.9 pts (using depth 3 - backup)
V2: -2.8 pts (using HAD depth 1 - starter) ✅
Delta: +1.9 pts (V2 IMPROVED)
```

### Jayden Daniels (WAS QB) - Questionable
```
V1: -1.5 pts (using current depth)
V2: -6.5 pts (using HAD depth 1) ✅
Delta: +5.0 pts (V2 IMPROVED)
```

### Healthy Starters
```
V1: 0.0 pts
V2: 0.0 pts ✅
Delta: 0.0 pts (NO CHANGE - correct)
```

## Testing Workflow

### Step 1: Generate V2 Predictions
Click **"Generate V2"** button to create first HAD-enhanced predictions

Expected logs in console:
```
📊 HAD loaded: 546 players with tracked depth data
🎯 HAD OVERRIDE: Bucky Irving depth 3 → 1 (4 weeks)
💾 V2: Saved X HAD-enhanced predictions to blob storage
```

### Step 2: View Comparison
Click **"Load & Compare"** to see V1 vs V2 side-by-side

Look for:
- Games with yellow delta badges (differences found)
- Summary stats showing total improvements
- Bucky Irving showing larger negative impact in V2

### Step 3: Filter Differences
Click **"Show Differences Only"** to hide identical predictions

Focuses on:
- Only games where HAD makes a difference
- Injured starters with depth override
- Clear before/after comparison

## Technical Details

### Data Flow
```
V1: nfl-predictions-generate → predictions/current.json → nfl-predictions-get
V2: nfl-predictions-generate-v2 → predictions-v2/current.json → nfl-predictions-get-v2
```

### HAD Override Logic
```javascript
// V2 only - runs in canonical-availability-v5-had.mjs
if (player.status === 'out' && hadData[playerKey]) {
  trustedDepth = hadData[playerKey].healthyAverageDepth; // Use HAD (e.g., 1)
  // instead of currentDepth (e.g., 3)
}

depthMultiplier = {
  1: 1.0,   // Starter - full impact
  2: 0.4,   // Backup - 40% impact
  3: 0.15   // Third string - 15% impact
}[trustedDepth];
```

### Version Headers
Both endpoints return identifying headers:
```
V1: (no version header)
V2: X-Prediction-Version: v2-had
```

## Troubleshooting

### "No V2 predictions yet"
**Solution:** Click "Generate V2" to create first predictions

### "Failed to retrieve V2 predictions"
**Possible causes:**
1. HAD file missing: Check `public/healthy-average-depth.json` exists
2. Function not deployed: Verify `nfl-predictions-generate-v2` deployed
3. Blob storage issue: Check Netlify Blobs permissions

**Debug:**
```bash
# Check if HAD file exists
ls -lh public/healthy-average-depth.json

# Test V2 generation directly
curl https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate-v2

# Check logs in Netlify dashboard
```

### Delta badges not showing
**Expected behavior:** Only shows when delta > 0.5 pts

If no badges appear:
- V1 and V2 are very similar (no injured starters)
- Click "Show Differences Only" - if page is empty, no significant differences found

## Monitoring Checklist

### Week 1 Testing
- [ ] Generate V2 predictions
- [ ] Verify HAD loading logs
- [ ] Compare 5+ injured starters
- [ ] Document any unexpected differences
- [ ] Check healthy starters show no change

### Week 2 Validation
- [ ] Track V2 prediction accuracy vs actual outcomes
- [ ] Compare V2 accuracy to V1 accuracy
- [ ] Note any edge cases or issues
- [ ] Decide: rollout to V1 or iterate V2

## Success Criteria

✅ **V2 generates without errors**
✅ **HAD overrides visible in logs**
✅ **Bucky Irving impact increases ~1.9 pts**
✅ **Healthy starters unchanged**
✅ **Summary stats show improvements**

## Quick Links

- **V2 Dashboard:** https://bgroundrobin.com/nfl-predictions-v2
- **V2 Generator:** https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate-v2
- **V2 GET Endpoint:** https://bgroundrobin.com/.netlify/functions/nfl-predictions-get-v2
- **HAD Data:** `public/healthy-average-depth.json` (546 players)
- **Implementation Doc:** `NFL_PREDICTIONS_V2_HAD_IMPLEMENTATION.md`

---
**Status:** Frontend deployed and ready for testing
**Next Step:** Generate V2 predictions and verify HAD overrides
**Date:** October 24, 2025
