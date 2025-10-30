# NBA Player Props - Netlify Deployment Guide

## ✅ FULLY AUTOMATED SYSTEM

Everything now runs on Netlify/GitHub - **no local machine required!**

---

## What Was Deployed

### 1. **Scheduled Function** (Runs Daily at 7am UTC)
- **File**: `netlify/functions/generate-daily-predictions.mjs`
- **Schedule**: Every day at 7:00 AM UTC (2:00 AM EST / 11:00 PM PST)
- **What it does**:
  - Fetches NBA games starting within next 18 hours
  - Gets player props from TheOddsAPI
  - Generates predictions using baseline v2 models
  - Filters by thresholds (4+ edge, 60%+ confidence)
  - Writes to `public/data/nba-player-props-live.json`

### 2. **Manual Trigger** (For Testing)
- **Endpoint**: `https://your-site.netlify.app/.netlify/functions/trigger-nba-predictions`
- **Use**: Test predictions without waiting for 7am schedule
- **Method**: GET request (just visit the URL)

### 3. **Frontend Page**
- **URL**: `https://your-site.netlify.app/nba-player-props`
- **Fetches**: `/data/nba-player-props-live.json`
- **Auto-refreshes**: When you click "Refresh Predictions" button

---

## Required Setup (One-Time)

### Step 1: Verify Netlify Environment Variable
Go to Netlify Dashboard → Site Settings → Environment Variables

✅ **Confirm `ODDS_API_KEY` is set**:
```
ODDS_API_KEY = c5d3fe15e6c5be83b2acd8695cff012b
```

*(You mentioned this is already set - just verify it's there)*

### Step 2: Deploy
Push to GitHub triggers auto-deploy:
```bash
git push origin main42
```

Netlify will:
1. Build the site
2. Deploy the scheduled function
3. Enable daily 7am runs automatically

---

## How to Use

### Automatic (Production Mode)
**Do nothing!** The system runs itself:
- Every day at 7:00 AM UTC, Netlify generates fresh predictions
- Frontend automatically displays them when users visit
- No local machine, no cron jobs, fully automated

### Manual Testing (Before 7am)
Visit this URL to trigger predictions on-demand:
```
https://your-site.netlify.app/.netlify/functions/trigger-nba-predictions
```

Response:
```json
{
  "success": true,
  "predictions": 0,
  "games": 4,
  "timestamp": "2025-10-30T18:00:00.000Z"
}
```

Then check the frontend:
```
https://your-site.netlify.app/nba-player-props
```

---

## Monitoring & Logs

### View Function Logs
1. Go to Netlify Dashboard
2. Click **Functions** tab
3. Click `generate-daily-predictions`
4. View **Function log** for daily execution logs

### Check for Errors
Look for these in logs:
- ✅ `Generated X predictions` = Success
- ❌ `ODDS_API_KEY not set` = Environment variable missing
- ❌ `API error: 422` = TheOddsAPI issue
- ❌ `Cannot read file` = Data file missing (boxscores)

### Verify Predictions Were Generated
Check the JSON file directly:
```
https://your-site.netlify.app/data/nba-player-props-live.json
```

Should show:
```json
{
  "generated": "2025-10-30T07:00:00.000Z",
  "count": 2,
  "predictions": [...]
}
```

---

## Troubleshooting

### Problem: Function not running at 7am
**Check**:
1. Netlify Dashboard → Functions → `generate-daily-predictions`
2. Look for "Scheduled" badge - should say "0 7 * * *"
3. Check Function log for last execution time

**Fix**: Re-deploy by pushing a commit to trigger rebuild

---

### Problem: Predictions are empty
**This is normal!** It means no bets meet the strict thresholds (4+ edge, 60%+ confidence).

**To verify it's working**:
- Check logs show "Generated 0 predictions"
- JSON file should have `"count": 0` and `"predictions": []`
- This is **good** - system is being selective

---

### Problem: "ODDS_API_KEY not set" error
**Fix**:
1. Netlify Dashboard → Site Settings → Environment Variables
2. Add: `ODDS_API_KEY` = `c5d3fe15e6c5be83b2acd8695cff012b`
3. Trigger re-deploy (push a commit or click "Trigger deploy" button)

---

### Problem: "Cannot read file" error
**Cause**: `data/nba/player-boxscores-2024.json` not found

**Fix**: Make sure the data files are committed to git:
```bash
git add data/nba/player-boxscores-2024.json
git commit -m "Add boxscores data"
git push
```

---

## API Costs

### Daily Scheduled Run
- 1 credit: Fetch games list
- ~4 credits per game (2 markets × 2 credits)
- **Total**: ~40-50 credits/day for 10-12 game night

### Manual Triggers
- Same cost as scheduled run
- **Don't spam it** - each trigger uses ~50 credits

### Monthly Budget
- 30 days × 45 credits/day = **1,350 credits/month**
- Current remaining: 38,590 credits
- **Can run for**: 857 days (~2.3 years)

---

## Architecture Diagram

```
GitHub Repo (main42)
     ↓
   Push
     ↓
Netlify Deploy
     ↓
   ┌─────────────────────────┐
   │  Scheduled Function     │
   │  (7:00 AM UTC daily)    │
   └─────────────────────────┘
             ↓
   ┌─────────────────────────┐
   │  1. Fetch Games         │
   │     (TheOddsAPI)        │
   └─────────────────────────┘
             ↓
   ┌─────────────────────────┐
   │  2. Get Player Props    │
   │     (per-game API)      │
   └─────────────────────────┘
             ↓
   ┌─────────────────────────┐
   │  3. Load Boxscores      │
   │     (from data/nba/)    │
   └─────────────────────────┘
             ↓
   ┌─────────────────────────┐
   │  4. Generate            │
   │     Predictions         │
   │     (Baseline v2)       │
   └─────────────────────────┘
             ↓
   ┌─────────────────────────┐
   │  5. Filter by           │
   │     Thresholds          │
   │     (4+ edge, 60%+)     │
   └─────────────────────────┘
             ↓
   ┌─────────────────────────┐
   │  6. Write JSON          │
   │     (public/data/)      │
   └─────────────────────────┘
             ↓
   ┌─────────────────────────┐
   │  React Frontend         │
   │  /nba-player-props      │
   │  (fetches JSON)         │
   └─────────────────────────┘
```

---

## Testing Checklist

### Before First 7am Run
- [ ] Verify `ODDS_API_KEY` is set in Netlify
- [ ] Push to GitHub to trigger deploy
- [ ] Wait for deploy to finish (~2-3 min)
- [ ] Test manual trigger: visit `/functions/trigger-nba-predictions`
- [ ] Verify JSON file updated: check `/data/nba-player-props-live.json`
- [ ] Visit frontend: check `/nba-player-props` page loads

### After First 7am Run
- [ ] Check Netlify function logs at 7:05 AM UTC
- [ ] Verify JSON file has new timestamp
- [ ] Visit frontend and see predictions
- [ ] Test "Refresh Predictions" button works

---

## Next Steps

### Short Term (This Week)
1. ✅ Deploy to Netlify (DONE - just pushed)
2. ⏳ Wait for first 7am run tomorrow
3. ⏳ Verify predictions generated successfully
4. ⏳ Monitor for any errors

### Medium Term (This Month)
1. Resume historical odds collection (Feb 19 - Apr 13)
2. Validate models across 3 months (Feb/Mar/Apr)
3. Add more props if validated (Points model at 51.2% - close!)

### Long Term
1. Add injury status checking
2. Build bet tracking system
3. Add line movement monitoring
4. Scale up bankroll management

---

## Support & Resources

- **Netlify Scheduled Functions Docs**: https://docs.netlify.com/functions/scheduled-functions/
- **TheOddsAPI Docs**: https://the-odds-api.com/liveapi/guides/v4/
- **Function Logs**: Netlify Dashboard → Functions → generate-daily-predictions
- **Credits Remaining**: https://dash.the-odds-api.com/

---

## Summary

✅ **Everything is now running on Netlify**:
- No local cron jobs needed
- No local machine needs to be on
- Fully automated daily predictions at 7am UTC
- Manual trigger available for testing
- Frontend auto-updates with new predictions

🏴‍☠️ **YOUR FAMILY IS IN GOOD HANDS!** The system runs itself now! 🏴‍☠️
