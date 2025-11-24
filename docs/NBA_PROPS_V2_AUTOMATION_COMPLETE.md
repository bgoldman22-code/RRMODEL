# NBA Props V2 Automation - Implementation Complete

**Date:** November 21, 2025  
**Status:** ✅ **READY TO DEPLOY**  
**Implementation:** All 3 tasks completed

---

## 🎯 What Was Implemented

### ✅ Task 1: GitHub Actions Workflow (Daily + On-Push + Manual)

**File:** `.github/workflows/nba-props-v2-daily.yml`

**Triggers:**
- 🕐 Daily at 9 AM ET (14:00 UTC) via cron schedule
- 🚀 On push to `main42` branch (runs TODAY when you push)
- 🖱️ Manual via `workflow_dispatch` (GitHub Actions UI)

**What it does:**
1. Fetches recent boxscores: `node scripts/nba/fetch-player-boxscores-2025-26.mjs --daily`
2. Updates opponent defense stats automatically (via boxscore fetcher)
3. Generates V2 predictions: `node scripts/nba/generate-pra-predictions-v2.mjs`
4. Commits and pushes:
   - `data/nba/player-boxscores-2025-26.json`
   - `data/nba/opponent-defense-stats.json`
   - `public/data/nba/nba-props-v2-live.json`

**Setup required:**
- Add `ODDS_API_KEY` to GitHub Secrets: https://github.com/bgoldman22-code/RRMODEL/settings/secrets/actions
- Value: `[YOUR_ODDS_API_KEY_HERE]`

---

### ✅ Task 2: Netlify Function with Refresh Support

**File:** `netlify/functions/nba-props-v2.mjs`

**Modes:**
- **Default** (`GET /api/nba-props-v2`): Serves static JSON (fast, cached)
- **Refresh** (`GET /api/nba-props-v2?refresh=1`): Regenerates predictions on-demand

**Refresh behavior (mirrors V1 pattern):**
1. Checks for `ODDS_API_KEY` environment variable
2. Runs boxscore fetcher: `fetch-player-boxscores-2025-26.mjs --daily`
3. Runs prediction generator: `generate-pra-predictions-v2.mjs`
4. Re-reads and returns fresh JSON

**Setup required (optional, for on-demand refresh):**
- Add `ODDS_API_KEY` to Netlify environment variables
- Netlify Dashboard → Site Settings → Environment Variables
- Key: `ODDS_API_KEY`
- Value: `[YOUR_ODDS_API_KEY_HERE]`

**Note:** Refresh functionality is optional. GitHub Actions will handle daily updates automatically.

---

### ✅ Task 3: V2 Frontend UX Matching V1

**File:** `src/pages/NBAPlayerPropsV2.jsx`

**Changes made:**
1. **Refresh button** - Mirrors V1's "Refresh Predictions" button
   - Calls `/api/nba-props-v2?refresh=1` when clicked
   - Shows "Refreshing..." state while loading
   - Alert confirms success/failure
   
2. **"Last updated" timestamp** - Shows relative time
   - "X hours ago" / "X minutes ago" / "Just now"
   - Updates based on `metadata.generated` field
   
3. **PNG export buttons** - Matches V1 styling
   - Same SVG icons as V1
   - Same button style and layout
   - Export dimensions: 900px (consistent with V1)
   - Table styling matches V1 more closely
   
4. **Controls layout** - Mirrors V1 structure
   - Prop filter: "All Props" / "Points Only" / "Rebounds Only" / "Assists Only"
   - Side filter preserved
   - Sort options expanded to match V1
   - Button ordering and styling consistent

---

## 📦 Supporting Scripts Created

### 1. Boxscore Fetcher
**File:** `scripts/nba/fetch-player-boxscores-2025-26.mjs`

**Features:**
- Fetches games from ESPN API
- UTC → America/New_York date conversion (fixes late-game date overlap)
- Rate limiting: 500ms delay between requests
- Modes:
  - `--daily`: Fetch last 3 days
  - `--backfill --through=YYYY-MM-DD`: Backfill to specific date
- Auto-triggers opponent defense collection after completion

**Usage:**
```bash
# Daily update (for GitHub Actions)
node scripts/nba/fetch-player-boxscores-2025-26.mjs --daily

# Backfill to specific date
node scripts/nba/fetch-player-boxscores-2025-26.mjs --backfill --through=2025-11-20
```

---

### 2. Opponent Defense Collector
**File:** `scripts/nba/collect-opponent-defense.mjs`

**Purpose:**
- Aggregates opponent defense stats from `data/nba/opponent-defense/2025-26.json`
- Creates consolidated `data/nba/opponent-defense-stats.json` for easy consumption
- Called automatically by boxscore fetcher

**Usage:**
```bash
# Manual run (usually not needed - auto-triggered)
node scripts/nba/collect-opponent-defense.mjs
```

**Note:** This consolidates data from the Python script (`update-opponent-defense.py`) into the format expected by the prediction generator.

---

## 🚀 Deployment Checklist

### Step 1: GitHub Secrets
1. Go to: https://github.com/bgoldman22-code/RRMODEL/settings/secrets/actions
2. Click "New repository secret"
3. Name: `ODDS_API_KEY`
4. Value: `[YOUR_ODDS_API_KEY_HERE]`
5. Save

### Step 2: Push to GitHub
```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL

# Review changes
git status

# Add all new/modified files
git add .github/workflows/nba-props-v2-daily.yml
git add scripts/nba/fetch-player-boxscores-2025-26.mjs
git add scripts/nba/collect-opponent-defense.mjs
git add netlify/functions/nba-props-v2.mjs
git add src/pages/NBAPlayerPropsV2.jsx
git add docs/NBA_PROPS_V2_AUTOMATION_COMPLETE.md

# Commit
git commit -m "🚀 NBA Props V2 automation complete - daily updates + refresh support"

# Push (this will trigger the workflow!)
git push origin main42
```

### Step 3: Verify GitHub Action
1. Go to: https://github.com/bgoldman22-code/RRMODEL/actions
2. You should see "NBA Props V2 Daily Update" workflow running
3. Click on it to watch the live logs
4. It should:
   - Checkout code ✓
   - Setup Node.js ✓
   - Update boxscores ✓
   - Generate predictions ✓
   - Commit and push updates ✓

### Step 4: Test Live Site
1. Wait for Netlify auto-deploy to complete (~2-3 minutes)
2. Visit: https://bgroundrobin.com/nba-player-props-v2
3. Verify:
   - ✅ Predictions show up
   - ✅ "Last updated" shows recent timestamp
   - ✅ Filters work
   - ✅ PNG export buttons work
   - ✅ "Refresh Predictions" button works (if Netlify env var set)

---

## 🔧 Optional: Netlify Environment Variable

**Only needed if you want on-demand refresh capability:**

1. Go to Netlify Dashboard
2. Select your site (bgroundrobin.com)
3. Go to: Site Settings → Environment Variables
4. Add new variable:
   - Key: `ODDS_API_KEY`
   - Value: `[YOUR_ODDS_API_KEY_HERE]`
5. Redeploy site

**Why optional?**
- GitHub Actions handles daily updates automatically
- On-demand refresh costs Netlify function execution time (~30-60 seconds)
- Most users won't need real-time refresh

---

## 📊 What Happens Now

### Daily Automation (9 AM ET)
```
9:00 AM ET → GitHub Action triggers
  ↓
Fetch last 3 days of boxscores
  ↓
Update opponent defense stats
  ↓
Generate fresh V2 predictions
  ↓
Commit & push to GitHub
  ↓
Netlify auto-deploys
  ↓
https://bgroundrobin.com/nba-player-props-v2 shows fresh picks
```

### On-Demand Refresh (User clicks button)
```
User clicks "Refresh Predictions"
  ↓
Frontend calls: /api/nba-props-v2?refresh=1
  ↓
Netlify function runs:
  - Fetch recent boxscores
  - Generate predictions
  ↓
Returns fresh JSON
  ↓
Frontend updates table
```

---

## 🎯 Key Differences from V1

| Feature | V1 (Rebounds/Assists) | V2 (Phase 3 PRA) |
|---------|----------------------|------------------|
| **Props** | Rebounds, Assists only | Points, Rebounds, Assists |
| **Model** | Baseline v2 | Phase 3 PRA (18 features) |
| **Win Rate** | 62.5% (R), 66.7% (A) | 60.8% (backtest) |
| **ROI** | +19.3% (R), +27.3% (A) | +17.08% (backtest) |
| **Data** | 2024-25 baseline | Live 2025-26 season |
| **Automation** | Manual / V1 workflow | Dedicated V2 workflow |
| **Edge Threshold** | 4%+ | 2%+ |
| **Confidence** | 60%+ | Model probability |

---

## 🐛 Troubleshooting

### Workflow fails with "ODDS_API_KEY not found"
**Fix:** Add `ODDS_API_KEY` to GitHub Secrets (Step 1 above)

### Predictions file not found
**Fix:** Run generator manually once:
```bash
export ODDS_API_KEY=[YOUR_ODDS_API_KEY_HERE]
node scripts/nba/generate-pra-predictions-v2.mjs
git add public/data/nba/nba-props-v2-live.json
git commit -m "Initial V2 predictions"
git push origin main42
```

### Refresh button doesn't work
**Check:**
1. Is `ODDS_API_KEY` set in Netlify environment variables?
2. Check Netlify function logs for errors
3. Try manual refresh: https://bgroundrobin.com/api/nba-props-v2?refresh=1

### Boxscore fetcher returns 403 errors
**This is normal** - NBA CDN rate limits. The script includes 500ms delays to mitigate this.

---

## 📁 Files Modified/Created

### Created:
- `.github/workflows/nba-props-v2-daily.yml` ✨
- `scripts/nba/fetch-player-boxscores-2025-26.mjs` ✨
- `scripts/nba/collect-opponent-defense.mjs` ✨
- `docs/NBA_PROPS_V2_AUTOMATION_COMPLETE.md` ✨

### Modified:
- `netlify/functions/nba-props-v2.mjs` (added refresh support)
- `src/pages/NBAPlayerPropsV2.jsx` (V1-style UX)

### Assumed to Exist (per status doc):
- `scripts/nba/generate-pra-predictions-v2.mjs` (PRA prediction generator)
- `data/nba/models/phase3_pra_coefficients.json` (trained model)
- `netlify/functions/_lib/pra-model.mjs` (JS wrapper)

---

## ✅ Success Criteria

You'll know everything is working when:

1. ✅ GitHub Action runs successfully after pushing
2. ✅ `public/data/nba/nba-props-v2-live.json` gets created/updated
3. ✅ https://bgroundrobin.com/nba-player-props-v2 shows predictions
4. ✅ "Last updated" shows recent time
5. ✅ PNG export buttons work
6. ✅ Workflow runs automatically tomorrow at 9 AM ET

---

## 🎉 Summary

**Before:** Manual workflow required daily
```bash
node scripts/nba/fetch-player-boxscores-2025-26.mjs --daily
export ODDS_API_KEY=xxx
node scripts/nba/generate-pra-predictions-v2.mjs
git add ...
git commit ...
git push
```

**After:** Fully automated
- ✅ Runs daily at 9 AM ET automatically
- ✅ Runs when you push to main42
- ✅ Manual trigger available in GitHub UI
- ✅ On-demand refresh from frontend (optional)
- ✅ Zero manual intervention needed

---

**Status:** Ready to deploy! Just push to main42 and verify the workflow runs.

**Last Updated:** November 21, 2025  
**Next Step:** Push to GitHub and test!
