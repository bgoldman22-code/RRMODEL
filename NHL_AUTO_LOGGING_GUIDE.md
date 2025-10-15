# NHL Automatic Logging - Simple Guide

## ✅ NO MANUAL WORK REQUIRED

Your NHL scanner already returns everything needed. Just run ONE command to log picks.

---

## 🚀 Quick Start (30 Seconds)

### **Option 1: One-Line Command** (Easiest)
```bash
curl -s https://your-site.netlify.app/.netlify/functions/nhl-sog-scanner-v3-optimized | \
  node scripts/nhl/manual-log-from-scanner.mjs
```

**What it does:**
1. Fetches today's NHL picks from your live endpoint
2. Pipes directly to logger
3. Appends to `data/nhl/logs/predictions_2024-25.csv`
4. Shows confirmation

**Output:**
```
🏒 NHL Scanner → CSV Logger

📊 Found 8 opportunities

✅ Logged 8 NHL predictions
✅ Successfully logged to CSV
   File: data/nhl/logs/predictions_2024-25.csv

📋 Sample logged prediction:
   Connor McDavid OVER 3.5
   Edge: 12.5%, Odds: -110
   Book: FanDuel
```

---

### **Option 2: Shell Script** (With Summary)
```bash
./scripts/nhl/fetch-and-log.sh
```

**What it does:**
- Same as Option 1 but prettier output
- Shows table of latest 5 picks
- Saves JSON to `/tmp` for reference

**Output:**
```
🏒 NHL Daily Logger

📡 Fetching NHL picks...
✅ Fetched 8 opportunities

📝 Logging to CSV...
✅ Logged 8 NHL predictions

📊 Latest predictions:
date        player           team  line  direction  edge  odds
2024-10-15  Connor McDavid   EDM   3.5   OVER       12.5  -110
2024-10-15  Auston Matthews  TOR   4.5   OVER       10.2  -115
...
```

---

## 🤖 Automate It (GitHub Action)

Add to `.github/workflows/nhl-daily-update.yml`:

```yaml
- name: Log today's NHL picks
  run: |
    curl -s $NHL_SCANNER_URL | \
      node scripts/nhl/manual-log-from-scanner.mjs
  env:
    NHL_SCANNER_URL: ${{ secrets.NHL_SCANNER_URL }}
```

Now GitHub Actions will:
1. Fetch picks when workflow runs
2. Log to CSV automatically
3. Commit CSV with results

---

## 📊 How It Works

### **Scanner Output → Logger**

Your scanner returns:
```json
{
  "opportunities": [
    {
      "playerId": 8478402,
      "playerName": "Connor McDavid",
      "team": "EDM",
      "opponent": "CGY",
      "position": "C",
      "line": 3.5,
      "direction": "OVER",
      "odds": -110,
      "projection": 4.2,
      "edge": 12.5,
      "bookmaker": "FanDuel",
      "gameTime": "2024-10-15T02:00:00Z"
    }
  ]
}
```

Logger transforms it to CSV:
```csv
date,game_id,player,team,opponent,position,line,direction,predicted_sog,actual_sog,hit,edge,edge_percent,odds,book,...
2024-10-15,EDM_CGY_2024-10-15,Connor McDavid,EDM,CGY,C,3.5,OVER,4.2,,,12.5,12.5,-110,FanDuel,...
```

**No data loss. No manual mapping. Just works.** ✅

---

## 🔧 Configuration

### **Custom Scanner URL**
```bash
# Set environment variable
export NHL_SCANNER_URL="https://your-custom-url.com"

# Or pass directly
curl -s https://custom-url.com | node scripts/nhl/manual-log-from-scanner.mjs
```

### **Different Season**
Edit `scripts/nhl/manual-log-from-scanner.mjs`:
```javascript
const logger = new NHLPredictionLogger('2025-26'); // Change season
```

---

## 🎯 Full Workflow

### **Morning: Get Picks**
```bash
curl -s $NHL_SCANNER_URL | node scripts/nhl/manual-log-from-scanner.mjs
```

### **Next Day: Update Results**
```bash
node scripts/nhl/update-results.mjs 2024-10-15
```

### **Anytime: View Dashboard**
```bash
node scripts/nhl/monitor-dashboard.mjs
```

---

## ❓ FAQ

**Q: Do I have to run this manually every day?**  
A: No! Add it to GitHub Actions (see above) and it runs automatically.

**Q: What if I forget to log a day?**  
A: Just fetch that day's picks from your browser's network tab and pipe to logger. It's idempotent (won't double-log).

**Q: Can I log from a saved JSON file?**  
A: Yes! `node scripts/nhl/manual-log-from-scanner.mjs saved-picks.json`

**Q: Does this work with the frontend?**  
A: Yes! The frontend calls the same scanner endpoint. This just logs what the frontend shows.

---

## ✅ Benefits Over Netlify Integration

| Approach | Netlify Integration | Manual Logger |
|----------|-------------------|---------------|
| **Breaks endpoint?** | ✅ Yes (502 error) | ❌ No (runs separately) |
| **Import issues?** | ✅ Yes (can't import scripts/) | ❌ No (runs locally) |
| **Deployment needed?** | ✅ Yes | ❌ No |
| **Testing?** | ✅ Complex | ❌ Simple (just run it) |
| **Debugging?** | ✅ Hard (serverless logs) | ❌ Easy (local stdout) |
| **Cost?** | $0 (but function time) | $0 |

**Manual logger = No risk, same result, easier debugging.** 🎯

---

## 🚀 Ready to Use

**Your scanner works. Your logger works. Just connect them:**

```bash
curl -s https://your-site.netlify.app/.netlify/functions/nhl-sog-scanner-v3-optimized | \
  node scripts/nhl/manual-log-from-scanner.mjs
```

**That's it. One command. Done.** ✅
