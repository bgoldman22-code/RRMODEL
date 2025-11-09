# 📊 NFL Receiving Props - Production Monitoring System

**Status:** ✅ ACTIVE  
**Current Week:** 7, 2025  
**Last Health Check:** Oct 19, 2025 01:21 UTC  
**Scanner Status:** HEALTHY (58 predictions)

---

## 🎯 Overview

This monitoring system tracks the NFL Receiving Props scanner's weekly performance through two complementary tools:

1. **Health Monitoring** (`monitor-production.sh`) - Tests endpoint accessibility and system health
2. **Performance Tracking** (`weekly-tracker.R`) - Saves predictions and tracks actual results

---

## 🏥 Health Monitoring

### Tool: `scripts/nfl-receiving-props/monitor-production.sh`

**Purpose:** Automated health checks to ensure scanner is operational

**What It Checks:**
- ✅ Endpoint accessibility (HTTP 200 response)
- ✅ Predictions generated (target: >30 per week)
- ✅ Data source (should be "SSOT")
- ✅ SSOT week number (should match current week)
- ✅ Real odds availability

**Status Levels:**
- `HEALTHY` - Generating 30+ predictions with real odds
- `DEGRADED` - Generating <30 predictions OR missing SSOT OR no real odds

### Usage

```bash
# Manual health check
./scripts/nfl-receiving-props/monitor-production.sh

# Automated daily check (add to crontab)
crontab -e
# Add this line:
0 9 * * * cd /Users/brentgoldman/RRMODEL && ./scripts/nfl-receiving-props/monitor-production.sh
```

### Output Locations

- **JSON logs:** `logs/receiving-props/health_check_TIMESTAMP.json`
- **Full response:** `logs/receiving-props/latest_response.json` (for debugging)

### Weekly Summary

Every Monday, the script calculates:
- Total health checks in last 7 days
- Average predictions per check
- Uptime percentage (HEALTHY checks / total checks)

### Example Health Check Log

```json
{
  "timestamp": "20251019_012109",
  "date": "2025-10-19T05:21:36Z",
  "checks": {
    "endpoint_accessible": true,
    "predictions_generated": 58,
    "data_source": "SSOT (nflfastR + canonical rosters)",
    "ssot_week": "7",
    "has_real_odds": true,
    "status": "HEALTHY"
  }
}
```

---

## 📈 Performance Tracking

### Tool: `scripts/nfl-receiving-props/weekly-tracker.R`

**Purpose:** Save predictions before games and check results after

**What It Tracks:**
- Weekly predictions with edges
- Top opportunities each week
- Historical prediction archive
- Future: Win rates, ROI, edge calibration

### Usage

```bash
# Save current week predictions (run Monday/Tuesday before games)
Rscript scripts/nfl-receiving-props/weekly-tracker.R save

# Save specific week
Rscript scripts/nfl-receiving-props/weekly-tracker.R save 8 2025

# View prediction history
Rscript scripts/nfl-receiving-props/weekly-tracker.R history

# Check results after games complete (future feature)
Rscript scripts/nfl-receiving-props/weekly-tracker.R check 7 2025
```

### Output Locations

- **Predictions:** `logs/receiving-props/predictions/week_X_2025.rds`
- **Results:** `logs/receiving-props/results/week_X_2025.rds` (future)

### Example Save Output

```
📊 NFL RECEIVING PROPS - WEEKLY PERFORMANCE TRACKER
============================================================ 

📅 Current: Week 7, 2025
💾 Saving predictions for Week 7...
✅ Saved 62 predictions to logs/receiving-props/predictions/week_7_2025.rds
   Top 5 edges:
     1. Brian Thomas Jr. - Receptions 4.5 UNDER: 20.1%
     2. Mike Evans - Rec Yards 65.5 UNDER: 20.1%
     3. Zach Ertz - Receptions 4.5 UNDER: 19.7%
     4. Darnell Mooney - Rec Yards 35.5 UNDER: 17.4%
     5. Marvin Harrison Jr. - Receptions 3.5 UNDER: 16.5%
```

### Example History Output

```
📜 PREDICTION HISTORY

   week_7_2025.rds
     Predictions: 62
     Avg edge: 10.0%
     Top edge: 20.1%
     Saved: 2025-10-19 09:18
```

---

## 📅 Weekly Workflow

### Monday Morning (Before Games)

1. **Regenerate SSOT** with latest data:
   ```bash
   Rscript scripts/nfl-receiving-props/generate-ssot.R
   ```

2. **Upload to Production:**
   ```bash
   # Commit to git
   git add data/nfl/ssot/week_X_2025.json
   git commit -m "feat: Generate Week X SSOT"
   git push
   
   # Upload to Netlify Blobs
   WEEK=$(Rscript -e "cat(floor((as.numeric(Sys.Date() - as.Date('2025-09-04'))/7)+1))")
   node -e "
   const fs = require('fs');
   const week = ${WEEK};
   const data = fs.readFileSync(\`data/nfl/ssot/week_\${week}_2025.json\`, 'utf8');
   const payload = { key: \`week_\${week}_2025\`, data };
   console.log(JSON.stringify(payload));
   " | curl -X POST 'https://bgroundrobin.com/.netlify/functions/nfl-receiving-ssot-upload-post' \
     -H 'Content-Type: application/json' -d @-
   ```

3. **Health Check** (verify SSOT loaded):
   ```bash
   ./scripts/nfl-receiving-props/monitor-production.sh
   ```
   - Should show `HEALTHY` status
   - SSOT week should match current week
   - Predictions should be 50-100+

4. **Save Predictions** for tracking:
   ```bash
   Rscript scripts/nfl-receiving-props/weekly-tracker.R save
   ```

### Tuesday After Games (Optional)

5. **Check Results** (future enhancement):
   ```bash
   Rscript scripts/nfl-receiving-props/weekly-tracker.R check
   ```

---

## 🚨 Troubleshooting

### DEGRADED Status: Low Predictions (<30)

**Possible Causes:**
- SSOT not uploaded or outdated week
- The Odds API quota exhausted (500/month)
- Few games this week (bye weeks)
- Market not available yet (check early in week)

**Solutions:**
1. Check SSOT week matches current week
2. Verify Odds API quota: Check scanner logs for `OddsAPI quota: remaining=X`
3. Wait until Tuesday/Wednesday when more odds are posted
4. Regenerate and reupload SSOT if needed

### DEGRADED Status: Missing Real Odds

**Possible Causes:**
- The Odds API key missing/invalid
- Market `player_reception_yds` not available
- API rate limit hit

**Solutions:**
1. Check environment variable `ODDS_API_KEY` is set in Netlify
2. Verify API key at https://the-odds-api.com
3. Check Netlify function logs for API errors

### DEGRADED Status: Wrong Data Source

**Possible Causes:**
- `USE_SSOT` flag disabled
- SSOT load failed, fell back to PLAYER_DB

**Solutions:**
1. Check `USE_SSOT=true` in `nfl-receiving-scanner-elite.mjs`
2. Verify SSOT exists in Netlify Blobs: Check upload logs
3. Check Netlify environment variables: `NETLIFY_SITE_ID`, `NETLIFY_TOKEN`

---

## 📊 Baseline Expectations

**Week 7 (Oct 19, 2025) Results:**
- ✅ 58-62 predictions generated
- ✅ SSOT: 115 players from nflfastR
- ✅ Top edge: 20.1% (Brian Thomas Jr. Receptions UNDER)
- ✅ Avg edge: 10.0%
- ✅ Data source: SSOT with real odds from The Odds API

**Normal Ranges:**
- Predictions: 50-100 per week (depends on games scheduled)
- Top edge: 15-25% (high confidence plays)
- Avg edge: 8-12% (filtered to 5%+ minimum)
- Players: 100-120 in SSOT (varies by injuries, byes)

---

## 🔮 Future Enhancements

### Phase 1: Result Tracking (Next)
- Fetch actual stats from nflfastR after games complete
- Calculate win rate, ROI, units won/lost
- Compare predicted vs actual distributions
- Track edge calibration over time

### Phase 2: Alerting
- Email/Slack notifications for DEGRADED status
- Weekly summary reports with key metrics
- Anomaly detection (sudden drop in predictions, edges, etc.)

### Phase 3: Advanced Analytics
- Compare SSOT vs PLAYER_DB performance
- A/B test different tau values (Empirical Bayes smoothing)
- Identify which prop types perform best (Receptions vs Yards)
- Player-specific tracking (which players are most profitable?)

---

## 📁 File Structure

```
logs/receiving-props/
├── health_check_TIMESTAMP.json      # Health monitoring logs
├── latest_response.json              # Most recent scanner response
├── predictions/
│   └── week_X_2025.rds              # Saved predictions before games
└── results/
    └── week_X_2025.rds              # Actual results after games (future)

scripts/nfl-receiving-props/
├── monitor-production.sh             # Health monitoring (bash)
├── weekly-tracker.R                  # Performance tracking (R)
├── generate-ssot.R                   # SSOT generation
└── nfl-receiving-scanner-elite.mjs   # Main scanner
```

---

## 🎯 Success Metrics

**System Health:**
- ✅ Uptime: >95% (healthy checks / total checks)
- ✅ Predictions: 50+ per week
- ✅ Response time: <2 seconds
- ✅ SSOT freshness: Updated weekly

**Prediction Quality (Future):**
- 🎯 Win rate: >52% (breakeven at ~52.4% with -110 odds)
- 🎯 ROI: >5% per week
- 🎯 Edge calibration: Predicted edges match actual win rates
- 🎯 Units: Positive over 4+ week sample

---

## 📝 Logging & Debugging

### Scanner Console Logs (Netlify Function Logs)

The scanner has extensive logging at these points:
- Line 280: `📡 Fetching NFL events...`
- Line 289: `✅ Found ${events.length} upcoming NFL games`
- Line 309: `OddsAPI quota: remaining=${remaining}, used=${used}`
- Line 477: `📅 Auto-detected Week ${WEEK}, ${SEASON}`
- Line 481: `✅ Loaded SSOT: Week ${ssot.week}, ${ssot.players?.length || 0} players`
- Line 492: `📋 Player source: ${USE_SSOT ? 'SSOT' : 'PLAYER_DB'} (${playerSource.length} players)`
- Line 751-757: Prediction stats (count, top edge, avg edge, min threshold)

**Access via:** Netlify Dashboard → Functions → nfl-receiving-scanner-elite → Logs

### Health Check Logs

```bash
# View latest health check
cat logs/receiving-props/health_check_*.json | tail -n 20

# Count health checks this week
ls logs/receiving-props/health_check_*.json | wc -l

# View full scanner response
cat logs/receiving-props/latest_response.json | python3 -m json.tool
```

### Prediction Logs

```r
# In R console
preds <- readRDS("logs/receiving-props/predictions/week_7_2025.rds")
View(preds)

# Summary stats
summary(preds$edge)
table(preds$prop)
table(preds$side)
```

---

## ✅ System Status: OPERATIONAL

**Last Updated:** Oct 19, 2025 01:21 UTC  
**Current Week:** 7  
**Predictions:** 58-62  
**Status:** ✅ HEALTHY  
**Next SSOT:** Week 8 (Generate Oct 21-25)

