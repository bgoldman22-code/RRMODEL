# Phase 3.5 Production Deployment Guide
**Goal:** Get Phase 3.5 live at https://bgroundrobin.com/nba-player-props-v2

---

## Current Status

✅ **Infrastructure:** 100% Complete
- Model registry with all 3 markets
- Inference engine (bug-fixed for feature alignment)
- Generator script (working, tested with historical data)
- Netlify function (ready to serve JSON)
- Frontend page (updated for Phase 3.5)

✅ **Testing:** Validated with historical data
- 51 predictions generated (26 assists, 11 points, 14 rebounds)
- 0 errors (feature mismatch bug fixed)
- All 3 markets operational

🔲 **Remaining:** Deploy to production at bgroundrobin.com

---

## Deployment Checklist

### Step 1: Test Netlify Function Locally ⏱️ 2 min

**Why:** Verify the API endpoint works before deploying

```bash
cd ~/Desktop/REPO33/RRMODEL
netlify dev --offline
```

Then in browser: `http://localhost:8888/api/nba-props-v2`

**Expected response:**
```json
{
  "generated_at": "2025-11-25T...",
  "model_version": "nba_phase3.5_mixed_logistic_lgbm_v1_20251125",
  "picks": [ ... 51 picks ... ],
  "stats": {
    "total_picks": 51,
    "by_market": {
      "assists": 26,
      "points": 11,
      "rebounds": 14
    }
  }
}
```

**If it fails:** Check if `public/data/nba/nba-props-v2-live.json` exists

---

### Step 2: Test Frontend Page Locally ⏱️ 2 min

**Why:** Verify the page displays picks correctly

While Netlify dev is running, open: `http://localhost:8888/nba-player-props-v2`

**Expected display:**
- Page title: "NBA Player Props V2 (Phase 3.5)"
- Shows model version in UI
- Displays 51 picks in table
- Shows assists/points/rebounds breakdown
- Confidence percentages visible
- Edge percentages visible

**If it fails:** 
- Check browser console for errors
- Verify API endpoint responds at /api/nba-props-v2
- Check that frontend is fetching from correct endpoint

---

### Step 3: Update Boxscore Data ⏱️ 1 min

**Why:** Ensure we have latest player stats for today's games

```bash
cd ~/Desktop/REPO33/RRMODEL
node scripts/nba/fetch-player-boxscores-2025-26.mjs --daily
```

**Expected output:**
```
Fetching 2025-26 season boxscores...
✓ Found X new games
✓ Updated player-boxscores-2025-26.json
```

This updates the boxscore data with any games from the last 24 hours.

---

### Step 4: Generate Live Predictions ⏱️ 30 sec

**Why:** Create predictions for TODAY'S actual games

**⚠️ WARNING:** This uses ~8 API calls from your TheOddsAPI quota

```bash
cd ~/Desktop/REPO33/RRMODEL
export ODDS_API_KEY=YOUR_THEODDS_API_KEY
node scripts/nba/generate-predictions-phase3.5.mjs
```

**Expected output:**
```
[1/6] ✅ Loaded 7903+ player-game records
[2/6] ✅ Loaded models: ['assists', 'points', 'rebounds']
[3/6] ✅ Fetched odds for X games (using live API)
[4/6] ✅ Found Y total prop bets
[5/6] ✅ Generated Z predictions (0 errors)
[6/6] ✅ Output written
```

**What this does:**
- Fetches today's NBA games from TheOddsAPI
- Gets player prop odds (Over/Under) for all games
- Runs Phase 3.5 models on each prop
- Saves predictions to `public/data/nba/nba-props-v2-live.json`

**If you get 0 picks:**
- Check if there are NBA games today
- Verify thresholds aren't too strict
- Check logs for skipped counts

---

### Step 5: Commit and Push to GitHub ⏱️ 2 min

**Why:** Trigger automatic Netlify deployment

```bash
cd ~/Desktop/REPO33/RRMODEL

# Add all Phase 3.5 files
git add data/nba/models/phase3_model_registry.json
git add data/nba/models/phase3_lgbm/
git add data/nba/models/phase3/
git add netlify/functions/_lib/nba-props-engine-v3.mjs
git add netlify/functions/nba-props-v2.mjs
git add scripts/nba/generate-predictions-phase3.5.mjs
git add src/pages/NBAPlayerPropsV2.jsx
git add public/data/nba/nba-props-v2-live.json

# Commit with descriptive message
git commit -m "Deploy Phase 3.5: Hybrid Logistic PRA + LightGBM system

- Added model registry with all 3 markets (assists/points/rebounds)
- Built unified inference engine with feature alignment fix
- Created Phase 3.5 generator with proper API endpoints
- Updated Netlify function to serve Phase 3.5 JSON
- Updated frontend to display Phase 3.5 model info
- Fixed LightGBM feature mismatch bug (60 vs 67 features)
- Tested: 51 picks generated (26 assists, 11 points, 14 rebounds)
- All models validated: Assists 61% WR, Points 58.7% WR, Rebounds 54.2% WR"

# Push to main (triggers Netlify deployment)
git push origin main
```

**What happens next:**
1. GitHub receives the push
2. Netlify detects changes to main branch
3. Netlify builds and deploys your site automatically
4. Takes ~2-5 minutes to complete

---

### Step 6: Verify Production Deployment ⏱️ 2 min

**Why:** Confirm everything works on the live site

**Wait 2-5 minutes after pushing**, then:

1. **Check deployment status:**
   - Visit https://app.netlify.com
   - Check your site's deployments
   - Ensure latest deploy shows "Published"

2. **Test the live API:**
   ```bash
   curl https://bgroundrobin.com/api/nba-props-v2 | jq '.stats'
   ```
   
   Should return:
   ```json
   {
     "total_picks": 51,
     "by_market": {
       "assists": 26,
       "points": 11,
       "rebounds": 14
     }
   }
   ```

3. **Test the live frontend:**
   - Visit: https://bgroundrobin.com/nba-player-props-v2
   - Verify page loads
   - Verify it shows "Phase 3.5" in the title
   - Verify picks are displayed
   - Verify model version shows at bottom
   - Verify confidence/edge values visible

**If API returns 404:**
- Netlify deployment may still be processing
- Wait 2 more minutes and try again
- Check Netlify deploy logs for errors

**If frontend shows 0 picks:**
- Check browser console for errors
- Verify API endpoint is responding
- Check that JSON file was committed and deployed

---

### Step 7: Set Up Daily Auto-Generation ⏱️ 10 min

**Why:** Automatically generate fresh predictions every day

Create `.github/workflows/daily-predictions.yml`:

```yaml
name: Generate Daily NBA Predictions

on:
  schedule:
    # Run at 9:00 AM ET every day (13:00 UTC)
    - cron: '0 13 * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  generate:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install Python dependencies
        run: |
          pip install lightgbm numpy scipy
      
      - name: Install Node dependencies
        run: npm install
      
      - name: Update boxscore data
        run: |
          node scripts/nba/fetch-player-boxscores-2025-26.mjs --daily
      
      - name: Generate predictions
        env:
          ODDS_API_KEY: ${{ secrets.ODDS_API_KEY }}
        run: |
          node scripts/nba/generate-predictions-phase3.5.mjs
      
      - name: Commit and push if changed
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add data/nba/player-boxscores-2025-26.json
          git add public/data/nba/nba-props-v2-live.json
          git diff --quiet && git diff --staged --quiet || (
            git commit -m "Update daily predictions [skip ci]" && 
            git push
          )
```

**Then:**

1. **Add API key to GitHub Secrets:**
   - Go to: https://github.com/YOUR_USERNAME/RRMODEL/settings/secrets/actions
   - Click "New repository secret"
   - Name: `ODDS_API_KEY`
   - Value: `YOUR_THEODDS_API_KEY` (get from TheOdds API dashboard)
   - Click "Add secret"

2. **Commit and push the workflow:**
   ```bash
   git add .github/workflows/daily-predictions.yml
   git commit -m "Add daily prediction generation workflow"
   git push origin main
   ```

3. **Test the workflow:**
   - Go to: https://github.com/YOUR_USERNAME/RRMODEL/actions
   - Click on "Generate Daily NBA Predictions"
   - Click "Run workflow" button
   - Select main branch
   - Click "Run workflow"
   - Watch it run (takes ~2 minutes)

**What this does:**
- Runs every day at 9am ET (before most games)
- Updates boxscore data with latest stats
- Fetches fresh odds from TheOddsAPI
- Generates new predictions
- Commits updated JSON
- Netlify auto-deploys the updates

---

## Troubleshooting

### Netlify dev won't start
**Error:** `Cannot find module 'tailwindcss'`

**Fix:**
```bash
npm install
```

### API returns 404 in production
**Possible causes:**
- Deployment still processing (wait 2-5 minutes)
- JSON file not committed
- Netlify function not deployed

**Fix:**
1. Check Netlify deploy logs
2. Verify `netlify/functions/nba-props-v2.mjs` was committed
3. Check `netlify.toml` has correct function path

### Generator produces 0 picks
**Possible causes:**
- No NBA games today
- Thresholds too strict
- API returned no odds data

**Fix:**
1. Check `[5/6] Skipped: X (no data), Y (below threshold)` output
2. If Y is high, thresholds are too strict
3. If X is high, check boxscore data is current

### GitHub Action fails
**Common errors:**
- Missing `ODDS_API_KEY` secret → Add it in GitHub settings
- Python/Node version mismatch → Update workflow versions
- API quota exceeded → Check TheOddsAPI dashboard

---

## Final Verification

After deployment, verify these 3 things work:

✅ **API Endpoint:**
```bash
curl https://bgroundrobin.com/api/nba-props-v2 | jq '.stats.total_picks'
# Should return: 51 (or whatever number of picks today)
```

✅ **Frontend Page:**
- Visit: https://bgroundrobin.com/nba-player-props-v2
- Page loads with picks displayed
- Shows "Phase 3.5" model info

✅ **Daily Auto-Update:**
- Check GitHub Actions runs successfully
- Verify JSON gets updated daily at 9am ET
- Netlify redeploys automatically after commit

---

## Success Criteria

🎯 You're fully deployed when:
1. Live site shows Phase 3.5 picks at /nba-player-props-v2
2. API returns fresh predictions from /api/nba-props-v2
3. GitHub Action runs daily without errors
4. Predictions update automatically every morning

---

## Next Steps After Deployment

Once Phase 3.5 is live and stable, you can:

1. **Monitor Performance:** Track actual win rates vs backtested results
2. **Add Combo Props:** Start Goal #2 (P+R, R+A, P+A, PRA markets)
3. **Fine-tune Thresholds:** Adjust based on live performance
4. **Add More Markets:** Team totals, player combinations, etc.
5. **Improve Frontend:** Add filters, sorting, historical tracking

---

## Estimated Time: ~20 minutes total

- Steps 1-2 (Local testing): 5 minutes
- Steps 3-4 (Data + generation): 2 minutes  
- Step 5 (Git commit): 2 minutes
- Step 6 (Verify deployment): 5 minutes
- Step 7 (GitHub Actions): 10 minutes

**You're 20 minutes away from Phase 3.5 being live in production!** 🚀
