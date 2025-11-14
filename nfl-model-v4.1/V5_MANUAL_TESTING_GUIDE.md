# 🧪 NFL V5 Manual Testing Guide

**Date:** November 14, 2025  
**Purpose:** Validate V5 system end-to-end after Netlify deployment  
**Prerequisites:** Phase 2 & 3 deployed to production

---

## 📋 Pre-Testing Checklist

Before starting manual tests, verify:

- [ ] Netlify deployment completed successfully
- [ ] Branch `main42` merged/deployed to production
- [ ] Environment variables set (if any)
- [ ] Netlify Blobs store "nfl-v5" created
- [ ] Functions visible in Netlify dashboard

---

## 🎯 Test Suite Overview

| Test | Type | Duration | Critical |
|------|------|----------|----------|
| 1. Data Pipeline | Backend | 30 sec | ✅ YES |
| 2. Generate Function | API | 2-3 min | ✅ YES |
| 3. Get Function (Cached) | API | <5 sec | ✅ YES |
| 4. Get Function (404) | API | <5 sec | ⚠️ Medium |
| 5. Frontend Load | UI | 10 sec | ✅ YES |
| 6. Frontend Refresh | UI | 2-3 min | ✅ YES |
| 7. Frontend Export | UI | 10 sec | ⚠️ Medium |
| 8. Week Selection | UI | 10 sec | ⚠️ Medium |

**Total Testing Time:** ~10-15 minutes

---

## 🔧 Test 1: Data Pipeline (NFLverse Updates)

**Goal:** Ensure latest game data is available for Week 10+ predictions

### Manual Trigger

```bash
# SSH into your deployment or run locally
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL/nfl-model-v3

# Fetch latest data from NFLverse
node scripts/02-prepare-nflverse-data.mjs --season 2025
```

### Expected Output

```
✓ Fetching play-by-play data from nflverse...
✓ Processing 2025 season data...
✓ Calculating rolling EPA metrics (16-game windows)...
✓ Generated game_aggregates_2025.json
  - Total games: 156 (Weeks 1-10 + TNF Week 11)
  - Latest week: 11
  - Features: 50+ per team-game
✓ Data pipeline complete!
```

### Validation

```bash
# Check which weeks are available
node -e "
const data = require('./data/nflverse/game_aggregates_2025.json');
const weeks = [...new Set(data.map(g => g.week))].sort((a,b) => Number(a)-Number(b));
console.log('✅ Available weeks:', weeks);
console.log('✅ Most recent week:', Math.max(...weeks.map(Number)));
console.log('✅ Total games:', data.length);
"
```

**Expected Result:**
```
✅ Available weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
✅ Most recent week: 11
✅ Total games: 156
```

### ✅ Pass Criteria
- Week 10 data present
- Week 11 TNF data present (if played)
- Total games >= 150

---

## 🔧 Test 2: Generate Function (nfl-v5-generate)

**Goal:** Validate backend generation and Blob storage

### Manual Trigger (API)

```bash
# Generate predictions for Week 10
curl -v "https://your-domain.netlify.app/.netlify/functions/nfl-v5-generate?season=2025&week=10"
```

### Expected Response

```json
{
  "status": "success",
  "season": 2025,
  "week": 10,
  "bundle_key": "nfl-v5-2025-week-10",
  "games_count": 14,
  "generated_at": "2025-11-14T20:30:00.000Z",
  "model_version": "v5"
}
```

### Response Time
- **Target:** 60-120 seconds (includes child process spawn + model computation)
- **Max Acceptable:** 180 seconds

### Check Netlify Function Logs

Navigate to: **Netlify Dashboard → Functions → nfl-v5-generate → Logs**

Look for:
```
✓ Spawning generate-v5-week.mjs...
✓ Reading bundle from output/bundle_v5_2025_week10.json
✓ Storing bundle in Netlify Blobs (key: nfl-v5-2025-week-10)
✓ Generation complete: 14 games
```

### ✅ Pass Criteria
- Status: `success`
- `games_count` matches expected (14 for Week 10)
- Response time < 180 seconds
- No error logs in Netlify dashboard
- Blob storage successful

---

## 🔧 Test 3: Get Function (Cached Bundle)

**Goal:** Validate retrieval from Netlify Blobs

### Manual Trigger (API)

```bash
# Fetch the bundle we just generated
curl -v "https://your-domain.netlify.app/.netlify/functions/nfl-v5-get?season=2025&week=10"
```

### Expected Response

```json
{
  "season": 2025,
  "week": 10,
  "source": "blobs:nfl-v5",
  "bundle": {
    "model_version": "v5",
    "games_count": 14,
    "generated_at": "2025-11-14T20:30:00.000Z",
    "games": [
      {
        "game_id": "...",
        "matchup": "DAL @ PHI",
        "kickoff": "2025-11-17T18:00:00Z",
        "away_team": "DAL",
        "home_team": "PHI",
        "predicted_spread": -7.5,
        "predicted_total_p50": 47.2,
        "spread": {
          "pick": "PHI",
          "line": -7.5,
          "confidence": 0.73,
          "edge": 8.5,
          "recommended_units": 2.5
        },
        "total": {
          "pick": "OVER",
          "line": 46.5,
          "confidence": 0.68,
          "edge": 6.2,
          "recommended_units": 2.0
        }
      }
      // ... 13 more games
    ]
  }
}
```

### Response Time
- **Target:** <3 seconds
- **Max Acceptable:** <5 seconds

### Check Headers

```bash
curl -I "https://your-domain.netlify.app/.netlify/functions/nfl-v5-get?season=2025&week=10"
```

Expected headers:
```
HTTP/2 200
cache-control: public, max-age=60
content-type: application/json
```

### ✅ Pass Criteria
- Status: 200 OK
- `source`: "blobs:nfl-v5"
- `games_count` matches (14)
- Response time < 5 seconds
- Cache-Control header present

---

## 🔧 Test 4: Get Function (404 - Bundle Not Found)

**Goal:** Validate error handling for missing bundles

### Manual Trigger (API)

```bash
# Request a week that doesn't exist yet
curl -v "https://your-domain.netlify.app/.netlify/functions/nfl-v5-get?season=2025&week=18"
```

### Expected Response

```json
{
  "error": "Bundle not found for season 2025 week 18"
}
```

### Status Code
- **Expected:** 404 Not Found

### ✅ Pass Criteria
- Status: 404 Not Found
- Error message is helpful and specific
- No 500 errors or crashes

---

## 🖥️ Test 5: Frontend Load (Cached)

**Goal:** Verify frontend displays cached predictions correctly

### Manual Test Steps

1. **Navigate to V5 page**:
   ```
   https://your-domain.com/nfl-v5
   ```

2. **Observe loading state**:
   - Should show spinner: "Loading predictions..."
   - Duration: <5 seconds

3. **Verify display**:
   - ✅ Header shows "NFL V5 Predictions"
   - ✅ Week selector shows "Week 10" (or default week)
   - ✅ Badge shows "📦 Cached" (blue background)
   - ✅ Season/Week display: "Week 10, 2025 • 14 games"
   - ✅ Last updated timestamp visible
   - ✅ Model info box displays spread/total models
   - ✅ Data sources box shows: TheOddsAPI, Canonical Availability V5, etc.

4. **Verify predictions table**:
   - ✅ All 14 games displayed
   - ✅ Matchups formatted correctly (e.g., "DAL @ PHI")
   - ✅ Kickoff times displayed
   - ✅ Spread picks show team, line, edge, units
   - ✅ Total picks show direction (OVER/UNDER), line, edge, units
   - ✅ Moneyline picks displayed
   - ✅ Best edge column shows highest edge per game
   - ✅ Color coding: Green (edge >10%), Yellow (5-10%), Gray (<5%)

### Browser Console Check

Open DevTools → Console, look for:
```
✓ Fetching from: /.netlify/functions/nfl-v5-get?season=2025&week=10
✓ Bundle loaded: 14 games
✓ Data source: blobs:nfl-v5
```

Should have NO errors or warnings.

### ✅ Pass Criteria
- Page loads in < 10 seconds
- All 14 games displayed
- No console errors
- Data source badge shows "Cached"
- All picks and edges displayed correctly

---

## 🖥️ Test 6: Frontend Refresh (Generate Fresh)

**Goal:** Verify on-demand generation from UI

### Manual Test Steps

1. **Stay on `/nfl-v5` page**

2. **Click "🔄 Refresh Week 10" button**

3. **Observe loading state**:
   - Button shows: "⟳ Refreshing Week 10..."
   - Button disabled (gray)
   - Table remains visible with old data

4. **Wait for completion** (2-3 minutes):
   - Button returns to normal
   - Badge changes to "🔴 Live Data" (green background)
   - Last updated timestamp updates

5. **Verify updated predictions**:
   - ✅ Games count matches (14)
   - ✅ Timestamp shows current time
   - ✅ Predictions may have changed slightly (fresh odds/injuries)

### Browser Console Check

Look for:
```
✓ Generating fresh predictions for Week 10...
✓ Generation status: success
✓ Fetching newly generated bundle...
✓ Bundle updated: 14 games
✓ Data source: fresh
```

### Network Tab Check

Open DevTools → Network:
1. **First request**: `nfl-v5-generate?season=2025&week=10`
   - Status: 200
   - Duration: 60-180 seconds
   - Response: `{status: "success", ...}`

2. **Second request**: `nfl-v5-get?season=2025&week=10`
   - Status: 200
   - Duration: <5 seconds
   - Response: Full bundle with games

### ✅ Pass Criteria
- Refresh completes without errors
- Badge changes from "Cached" to "Live Data"
- Timestamp updates to current time
- No console errors
- Both API calls succeed (generate → get)

---

## 🖥️ Test 7: Frontend Export PNG

**Goal:** Validate PNG export functionality

### Manual Test Steps

1. **On `/nfl-v5` page with loaded predictions**

2. **Click "📸 Export PNG" button**

3. **Wait for processing** (5-10 seconds):
   - Button shows: "⟳ Exporting..."
   - Button disabled

4. **Verify download**:
   - File downloads automatically
   - Filename: `nfl-v5-week10-predictions.png`

5. **Open PNG file**:
   - ✅ Title: "■ NFL Week 10 V5 Model Predictions — Full Slate"
   - ✅ Table header: Matchup | Spread Pick | Total Pick | Moneyline | Best Edge
   - ✅ All 14 games displayed in rows
   - ✅ Formatted picks with units and edges
   - ✅ Footer: Model names, timestamp
   - ✅ No truncation or layout issues
   - ✅ Readable text (not blurry)

### ✅ Pass Criteria
- PNG downloads successfully
- File opens without errors
- All games visible and formatted correctly
- Text is clear and readable
- Footer shows correct model info

---

## 🖥️ Test 8: Week Selection

**Goal:** Verify week switching works correctly

### Manual Test Steps

1. **On `/nfl-v5` page at Week 10**

2. **Change week dropdown to "Week 9"**

3. **Observe behavior**:
   - ✅ Page reloads predictions automatically
   - ✅ Loading spinner appears briefly
   - ✅ Week 9 predictions load (if exist)
   - ✅ Header updates: "Week 9, 2025 • X games"
   - ✅ Badge shows "📦 Cached"

4. **Try a future week (Week 18)**

5. **Observe error handling**:
   - ✅ Yellow warning box appears
   - ✅ Message: "⚠️ No predictions found for Week 18. Try refreshing to generate them."
   - ✅ Table shows: "No predictions available. Try refreshing."
   - ✅ No console errors

6. **Test refresh on future week**:
   - ✅ Click "🔄 Refresh Week 18"
   - ✅ If games exist: Generates successfully
   - ✅ If no games: Shows appropriate error

### ✅ Pass Criteria
- Week switching works smoothly
- Historical weeks load cached data
- Future weeks show helpful error messages
- No crashes or blank screens

---

## 📊 Post-Testing Validation

After completing all tests, verify system health:

### Check Netlify Blobs Storage

```bash
# Use Netlify CLI to list blobs
netlify blobs:list nfl-v5

# Expected output:
# nfl-v5-2025-week-9
# nfl-v5-2025-week-10
# ... (other weeks)
```

### Check Function Logs

Navigate to: **Netlify Dashboard → Functions → Logs**

Look for:
- ✅ No 500 errors
- ✅ Generation times < 180 seconds
- ✅ Get function times < 5 seconds
- ✅ Success rate > 95%

### Check Performance

Navigate to: **Netlify Dashboard → Analytics**

Verify:
- ✅ P95 response time < 5 seconds (nfl-v5-get)
- ✅ P95 response time < 180 seconds (nfl-v5-generate)
- ✅ Error rate < 5%

---

## 🐛 Common Issues & Solutions

### Issue 1: Generation Times Out (>180 seconds)

**Symptoms:**
- Function returns 504 Gateway Timeout
- No bundle created in Blobs

**Solution:**
```bash
# Check function timeout settings in netlify.toml
[functions]
  timeout = 300  # Increase to 5 minutes if needed
```

### Issue 2: 404 on Get Function (Bundle Exists)

**Symptoms:**
- Generate function succeeded
- Get function returns 404
- Blobs list shows bundle exists

**Solution:**
```javascript
// Check key format in blobs-nfl-v5.mjs
// Ensure generate and get use SAME key format:
getBundleKey(season, week) {
  return `nfl-v5-${season}-week-${week}`; // Must match exactly
}
```

### Issue 3: Frontend Shows Old Data After Refresh

**Symptoms:**
- Refresh button completes
- Badge changes to "Live Data"
- But predictions are identical to before

**Solution:**
```javascript
// Verify generate function is actually calling generator:
const result = spawn('node', ['scripts/generate-v5-week.mjs', ...], {
  cwd: '/path/to/nfl-model-v4.1', // Check this path
  stdio: 'pipe'
});
```

### Issue 4: PNG Export Fails

**Symptoms:**
- Export button hangs or errors
- No download occurs

**Solution:**
```bash
# Check html2canvas is installed
cd /path/to/RRMODEL
npm list html2canvas

# If missing:
npm install html2canvas
```

---

## ✅ Final Checklist

Before marking testing complete:

- [ ] Data pipeline updated (Week 10+ available)
- [ ] Generate function works (Week 10)
- [ ] Get function returns cached bundle (<5 sec)
- [ ] Get function returns 404 for missing weeks
- [ ] Frontend loads cached predictions
- [ ] Frontend refresh generates fresh predictions
- [ ] Frontend PNG export works
- [ ] Frontend week selection works
- [ ] No console errors
- [ ] No function errors in Netlify logs
- [ ] Performance meets targets
- [ ] Blobs storage working correctly

---

## 📝 Test Results Template

Use this template to record test results:

```markdown
## V5 System Test Results

**Date:** YYYY-MM-DD
**Tester:** Your Name
**Environment:** Production / Staging
**Branch:** main42

### Test Summary

| Test | Status | Duration | Notes |
|------|--------|----------|-------|
| 1. Data Pipeline | ✅/❌ | X sec | |
| 2. Generate Function | ✅/❌ | X sec | |
| 3. Get Function (Cached) | ✅/❌ | X sec | |
| 4. Get Function (404) | ✅/❌ | X sec | |
| 5. Frontend Load | ✅/❌ | X sec | |
| 6. Frontend Refresh | ✅/❌ | X sec | |
| 7. Frontend Export | ✅/❌ | X sec | |
| 8. Week Selection | ✅/❌ | X sec | |

### Issues Found

1. [Issue description]
   - Severity: High/Medium/Low
   - Steps to reproduce: ...
   - Expected: ...
   - Actual: ...

### Performance Metrics

- Generate function: XX seconds (target: <180)
- Get function: X seconds (target: <5)
- Frontend load: X seconds (target: <10)
- PNG export: X seconds (target: <15)

### Recommendations

- [List any recommendations for improvements]

### Sign-off

✅ System is production-ready
OR
❌ Issues must be resolved before production release
```

---

## 🚀 Next Steps After Successful Testing

Once all tests pass:

1. **Update V5_DEPLOYMENT_STATUS.md**:
   - Mark Phase 2 as ✅ COMPLETE
   - Mark Phase 3 as ✅ COMPLETE
   - Update "Last Tested" timestamp

2. **Announce to Users**:
   - Notify team that V5 is live at `/nfl-v5`
   - Share testing results
   - Provide quick start guide

3. **Set Up Monitoring** (Phase 4):
   - Weekly MAE tracking
   - Performance dashboards
   - Error alerts

4. **Schedule Regular Updates**:
   - Tuesday morning data pipeline runs
   - Weekly prediction generation
   - Monthly performance reviews

---

**End of Manual Testing Guide**

---

## 📞 Support

If you encounter issues during testing:

1. Check function logs in Netlify Dashboard
2. Review browser console for frontend errors
3. Verify Blobs storage contents
4. Check data pipeline output
5. Review this guide for common issues

For critical issues, escalate with:
- Test results template (filled out)
- Function logs (screenshot or copy)
- Browser console errors
- Network tab HAR file (if API issues)
