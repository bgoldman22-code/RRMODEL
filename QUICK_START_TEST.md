# Quick Start: Test Your NBA Predictions System

## ✅ You Added ODDS_API_KEY Secret - Great!

Now let's test the system by manually triggering the GitHub Action.

---

## 🚀 Trigger Manual Run (Takes 2 minutes)

### Step 1: Go to GitHub Actions
**URL:** https://github.com/bgoldman22-code/RRMODEL/actions/workflows/nba-daily-predictions.yml

### Step 2: Click "Run workflow"
- You'll see a dropdown button that says "Run workflow"
- Click it

### Step 3: Select Branch
- Make sure `main42` is selected
- Click the green "Run workflow" button

### Step 4: Watch Progress
- A new workflow run will appear at the top
- Click on it to see live logs
- Should take 2-3 minutes to complete

---

## 📊 What to Look For

### In GitHub Actions Logs:

```
🏀 NBA Props Model - GitHub Actions Mode
==========================================

📊 Fetching last 25 days of boxscores from ESPN...
   20251020: 12 games
   20251021: 11 games
   ... (continues for 25 days)

✅ Collected 3,500+ player-games

📈 Fetching NBA player props from The Odds API...
   Found 3 games in next 18 hours
   Collected 150+ prop lines

🎯 Generated 37 picks (134 before dedup)

✅ Wrote predictions to: /home/runner/work/RRMODEL/RRMODEL/public/data/nba/predictions-latest.json

📊 Summary:
   Total picks: 37
   Avg edge: 8.2%
   Total units: 111.0
   Games: 3

🏆 Top 5 picks:
   1. Player X rebounds OVER 8.5 (12.3% edge, 3.0U)
   2. Player Y assists OVER 6.5 (11.8% edge, 3.0U)
   ...
```

### Success Indicators:
- ✅ Green checkmark on workflow run
- ✅ New commit appears in repo: "🏀 Update NBA predictions - [timestamp]"
- ✅ File created: `public/data/nba/predictions-latest.json`

---

## 🧪 Verify Output

### Check if file was created:
```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL
git pull origin main42

# Should see new file
ls -lh public/data/nba/predictions-latest.json

# View summary
cat public/data/nba/predictions-latest.json | jq '.summary'
```

### Expected output:
```json
{
  "total": 37,
  "avgEdge": "8.2",
  "totalUnits": "111.0",
  "games": 3
}
```

---

## 🌐 Test Frontend

### After Netlify deploys (2-3 minutes after GitHub Action):

**Visit:** https://bgroundrobin.com/nba-props-elite.html

**Should see:**
- ✅ Page loads in 2-3 seconds
- ✅ Stats banner shows: "37 Total Picks", "Avg Edge 8.2%", "3 Games Today"
- ✅ 3 game cards (TOR@CLE, ATL@UTA, IND@PHX - or tonight's actual games)
- ✅ Each card has 10-15 player prop picks
- ✅ No errors or timeouts

---

## 🐛 Troubleshooting

### Workflow fails with "ODDS_API_KEY required"
**Fix:** Secret not set correctly. Go back to:
https://github.com/bgoldman22-code/RRMODEL/settings/secrets/actions
- Delete and re-add `ODDS_API_KEY`
- Make sure no extra spaces
- Retry workflow

### Workflow succeeds but no predictions
**Check:**
- Are there NBA games today? (Need games in next 18 hours)
- Check logs: "Found X games in next 18 hours"
- If 0 games, that's expected - try again on a game day

### Frontend shows "Error loading predictions"
**Possible causes:**
1. Netlify hasn't deployed yet (wait 2-3 mins after GitHub Action)
2. Predictions file not created (check GitHub Action logs)
3. CORS issue (shouldn't happen, already fixed)

**Debug:**
- Check raw JSON: https://bgroundrobin.com/data/nba/predictions-latest.json
- If 404: Netlify hasn't deployed yet
- If CORS error: Check browser console

### No commit appears after workflow
**Check:**
- Did workflow finish successfully? (green checkmark)
- Look at last step "Commit and push predictions" in logs
- If no changes: Maybe predictions matched existing file (unlikely)

---

## 📅 Scheduled Runs

Once manual test succeeds, automatic runs will happen:

**Every Day:**
- 6:30 AM ET - Morning lines
- 12:05 PM ET - Midday updates
- 6:45 PM ET - Pre-game final

**No action needed** - it just works! 🎉

---

## 🎯 Success Criteria

✅ GitHub Action completes in 2-3 minutes  
✅ New commit with predictions.json appears  
✅ Netlify deploys automatically  
✅ Frontend loads in 2-3 seconds  
✅ Shows 30-40 picks for tonight's games  
✅ No timeout errors  
✅ Same proven model (62.5%/66.7% win rates)  

---

## 🔗 Quick Links

- **Trigger Workflow:** https://github.com/bgoldman22-code/RRMODEL/actions/workflows/nba-daily-predictions.yml
- **View Actions:** https://github.com/bgoldman22-code/RRMODEL/actions
- **Secrets Settings:** https://github.com/bgoldman22-code/RRMODEL/settings/secrets/actions
- **Frontend:** https://bgroundrobin.com/nba-props-elite.html
- **Raw JSON:** https://bgroundrobin.com/data/nba/predictions-latest.json

---

**Ready to test? Click the "Run workflow" button now!** 🚀

*Next automatic run: Tomorrow at 6:30 AM ET*
