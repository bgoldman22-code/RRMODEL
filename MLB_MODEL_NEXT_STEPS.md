# MLB RR V2 - Next Steps to ELITE Status 🎯

**Last Updated:** November 9, 2025  
**Current Status:** 80% ELITE - Foundation complete, optimization needed  
**Time to Resume:** ~4-6 hours of focused work

---

## 🎯 Quick Start When Resuming

### Check System Health
```bash
cd /Users/brentgoldman/RRMODEL

# Verify cron jobs are running
crontab -l

# Check recent logs
tail -20 logs/statcast_updates.log
tail -20 logs/mlb_pipeline.log

# Validate current profile quality
node scripts/validate_profiles.mjs 2024
node scripts/validate_profiles.mjs 2025
```

### Current Automation Status
- ✅ **2 AM Daily:** Statcast updates + profile regeneration
- ✅ **8 AM Daily:** MLB predictions with Statcast-enhanced model
- ✅ **Batter Profiles:** 72.6% high quality (553/762 with complete Statcast)
- ⚠️ **Pitcher Profiles:** 0% high quality (missing Statcast structure)

---

## 🚀 Priority Tasks (In Order)

### **CRITICAL: Fix Pitcher Profiles (2 hours)**

**Problem:**  
Pitcher profiles have 0% quality score - they're missing the Statcast structure that batter profiles have.

**Current Structure (Broken):**
```json
{
  "pitcher_id": undefined,
  "player_name": "Gerrit Cole",
  // Missing: era, homeRunsPer9, groundBallPct, flyBallPct
  // Missing: avg_exit_velo_against, barrel_rate_against
}
```

**Target Structure (Like Batters):**
```json
{
  "pitcher_id": 543037,
  "year": 2024,
  "player_name": "Gerrit Cole",
  "total_batters_faced": 892,
  "batted_balls_allowed": 531,
  "hr_allowed": 19,
  "hr_per_9": 0.82,
  "era": 3.41,
  "ground_ball_pct": 0.42,
  "fly_ball_pct": 0.38,
  // Statcast metrics against
  "avg_exit_velo_against": 87.8,
  "max_exit_velo_against": 112.1,
  "barrel_rate_against": 0.068,
  "hard_contact_rate_against": 0.341
}
```

**Action Steps:**

1. **Check if profile generator exists:**
   ```bash
   ls scripts/generate_profiles.py
   ls scripts/generate_pitcher_profiles.py
   ```

2. **If missing, create `scripts/generate_pitcher_profiles_statcast.py`:**
   - Load Statcast pitch data for the year
   - Group by pitcher_id
   - Calculate:
     - Basic: PA, batted balls, HRs, HR/9, ERA
     - Statcast: avg exit velo against, barrel rate against, hard contact against
     - Split by RHB/LHB
   - Save to `data/mlb_historical/players/profiles/{year}_pitcher_profiles.json`

3. **Run for all years:**
   ```bash
   python3 scripts/generate_pitcher_profiles_statcast.py 2021
   python3 scripts/generate_pitcher_profiles_statcast.py 2022
   python3 scripts/generate_pitcher_profiles_statcast.py 2023
   python3 scripts/generate_pitcher_profiles_statcast.py 2024
   python3 scripts/generate_pitcher_profiles_statcast.py 2025
   ```

4. **Validate:**
   ```bash
   node scripts/validate_profiles.mjs 2024
   # Target: 60%+ quality for pitchers
   ```

5. **Update daily automation:**
   - Modify `scripts/update_statcast_daily.mjs` to regenerate pitcher profiles too
   - Test: `node scripts/update_statcast_daily.mjs`

**Expected Outcome:**  
Pitcher profiles at 60-70% quality, matching batter profile structure.

---

### **HIGH: Integrate H2H Stats (2 hours)**

**Current State:**  
Model uses generic pitcher difficulty based on ERA, HR/9, GB%.

**Elite State:**  
Use actual head-to-head batter vs pitcher data.

**Example:**
```
Aaron Judge vs Gerrit Cole:
- 3 HR in 15 AB (.200 BA)
- Crushes Cole's 4-seam fastball (2 HR on that pitch)
- Struggles with Cole's slider (.100 BA)
```

**Action Steps:**

1. **Create `scripts/fetch_h2h_stats.mjs`:**
   ```javascript
   // MLB Stats API endpoint
   const url = `https://statsapi.mlb.com/api/v1/people/${batterId}/stats`;
   const params = {
     stats: 'vsPlayer',
     opposingPlayerId: pitcherId,
     group: 'hitting'
   };
   ```

2. **Add to pipeline:**
   - In `run_mlb_pipeline.mjs`, before calculating probabilities
   - Fetch H2H for each batter/pitcher matchup
   - Cache for 24 hours (stats don't change mid-game)

3. **Enhance probability model:**
   ```javascript
   // In probability_model.mjs
   export function calculateH2HAdjustment(h2hStats) {
     if (!h2hStats || h2hStats.ab < 10) return 1.0; // Insufficient data
     
     const h2hHRRate = h2hStats.hr / h2hStats.ab;
     const expectedHRRate = 0.035; // League average
     
     // If Judge has 3 HR in 15 AB vs Cole (20%), that's 5.7x expected
     // Apply 50% of the difference: 1.0 + (5.7 - 1.0) * 0.5 = 3.35x
     return 1.0 + (h2hHRRate / expectedHRRate - 1.0) * 0.5;
   }
   ```

4. **Update WHY generator:**
   ```javascript
   if (h2h.ab >= 10) {
     reasons.push(`${h2h.hr} HR in ${h2h.ab} AB vs ${pitcher} (${h2h.avg} BA, ${h2h.ops} OPS)`);
   }
   ```

**Expected Outcome:**  
More accurate predictions for specific matchups, better WHY explanations.

---

### **MEDIUM: Real-Time Odds Monitoring (3 hours)**

**Current State:**  
Fetches odds once at 8 AM, generates static dashboard.

**Elite State:**  
Monitor odds throughout the day, alert on opportunities.

**Action Steps:**

1. **Create `scripts/monitor_odds_realtime.mjs`:**
   - Fetch odds every 30 minutes (8 AM - 7 PM ET)
   - Compare to morning baseline
   - Detect "steam moves" (sudden odds shifts)
   - Track Closing Line Value (CLV)

2. **Add line movement alerts:**
   ```javascript
   if (Math.abs(currentOdds - morningOdds) >= 50) {
     console.log(`🚨 STEAM MOVE: ${player} ${morningOdds} → ${currentOdds}`);
     // Optional: Send alert via webhook/email
   }
   ```

3. **CLV tracking:**
   ```javascript
   // After games complete, compare our picks to closing line
   const clv = (closingOdds - morningOdds) / morningOdds;
   // Positive CLV = we beat the closing line = sharp
   ```

4. **Update cron:**
   ```bash
   # Add to crontab
   */30 8-19 * 3-10 * cd /Users/brentgoldman/RRMODEL && node scripts/monitor_odds_realtime.mjs >> logs/odds_monitoring.log 2>&1
   ```

**Expected Outcome:**  
Catch +EV opportunities as they emerge, track prediction sharpness via CLV.

---

### **MEDIUM: Weather Integration (1 hour)**

**Current State:**  
Park factors are static.

**Elite State:**  
Adjust park factors dynamically based on weather.

**Action Steps:**

1. **Sign up for Weather API:**
   - OpenWeatherMap (free tier: 1000 calls/day)
   - Or: weatherapi.com (free tier: 1M calls/month)

2. **Create `scripts/fetch_game_weather.mjs`:**
   ```javascript
   async function getWeatherForGame(venue, gameDate) {
     // Get lat/lon for venue
     // Fetch forecast for game time
     return {
       temp: 78,
       windSpeed: 12,
       windDirection: 'out to RF',
       humidity: 65
     };
   }
   ```

3. **Adjust park factors:**
   ```javascript
   function adjustParkForWeather(baseFactor, weather) {
     let adjusted = baseFactor;
     
     // Wind blowing out = more HRs
     if (weather.windDirection.includes('out')) {
       adjusted *= (1 + weather.windSpeed / 100); // +12% for 12 mph
     }
     
     // Hot day = ball flies better
     if (weather.temp > 80) {
       adjusted *= 1.03; // +3%
     }
     
     return adjusted;
   }
   ```

4. **Update WHY:**
   ```javascript
   if (weather.windSpeed > 10 && weather.windDirection.includes('out')) {
     reasons.push(`Wind blowing out to ${weather.windDirection} at ${weather.windSpeed} mph`);
   }
   ```

**Expected Outcome:**  
More accurate predictions on high-wind days, hot games.

---

### **LOW: Lineup Confirmation (1 hour)**

**Current State:**  
Uses probable lineups from morning.

**Elite State:**  
Wait for official lineups (11 AM ET), adjust for batting order.

**Action Steps:**

1. **Add lineup fetcher:**
   ```javascript
   async function getOfficialLineup(gameId) {
     const url = `https://statsapi.mlb.com/api/v1.1/game/${gameId}/feed/live`;
     // Parse lineups.home.batters
     // Parse lineups.away.batters
   }
   ```

2. **Adjust for batting order:**
   ```javascript
   function getBattingOrderBonus(orderPosition) {
     // Leadoff and #3-4 get more PA
     const bonuses = [1.05, 1.02, 1.08, 1.08, 1.03, 1.0, 0.98, 0.95, 0.92];
     return bonuses[orderPosition - 1] || 1.0;
   }
   ```

3. **Schedule:**
   ```bash
   # Add second pipeline run after lineups posted
   0 11 * 3-10 * cd /Users/brentgoldman/RRMODEL && node scripts/run_mlb_pipeline.mjs --lineup-confirmed >> logs/mlb_pipeline_lineup.log 2>&1
   ```

**Expected Outcome:**  
Remove scratched players, adjust for batting order position.

---

## 📁 Files to Create

Priority order:

1. ✅ **DONE:** `scripts/update_statcast_daily.mjs`
2. ✅ **DONE:** `scripts/validate_profiles.mjs`
3. ✅ **DONE:** `scripts/run_mlb_pipeline.mjs` (enhanced)
4. ✅ **DONE:** `scripts/lib/probability_model.mjs` (enhanced)
5. 🔴 **CRITICAL:** `scripts/generate_pitcher_profiles_statcast.py`
6. 🟡 **HIGH:** `scripts/fetch_h2h_stats.mjs`
7. 🟡 **MEDIUM:** `scripts/monitor_odds_realtime.mjs`
8. 🟢 **MEDIUM:** `scripts/fetch_game_weather.mjs`
9. 🟢 **LOW:** `scripts/fetch_official_lineups.mjs`

---

## 🎯 Definition of "ELITE"

### Data Quality:
- ✅ Batters: 70%+ high quality profiles (ACHIEVED: 72.6%)
- ⚠️ Pitchers: 70%+ high quality profiles (CURRENT: 0%)
- ✅ Daily updates automated
- ✅ Statcast metrics integrated

### Model Sophistication:
- ✅ Exit velocity, barrel rate, hard contact (DONE)
- ⚠️ H2H batter vs pitcher stats (TODO)
- ⚠️ Dynamic weather adjustments (TODO)
- ⚠️ Batting order position (TODO)

### Operational Excellence:
- ✅ Automated daily pipeline (DONE)
- ⚠️ Real-time odds monitoring (TODO)
- ⚠️ CLV tracking (TODO)
- ⚠️ Line movement alerts (TODO)

### Validation:
- ⚠️ Backtest against 2024 season
- ⚠️ Compare predictions to actual outcomes
- ⚠️ Measure CLV over 50+ games
- ⚠️ Track ROI on recommended picks

**Current Score: 6/12 (50%) → Target: 12/12 (100%)**

---

## 🔍 Debugging Common Issues

### Cron jobs not running?
```bash
# Check if cron is enabled
sudo launchctl list | grep cron

# Check logs
tail -f logs/statcast_updates.log
tail -f logs/mlb_pipeline.log

# Run manually to test
node scripts/update_statcast_daily.mjs
node scripts/run_mlb_pipeline.mjs
```

### Profile quality degrading?
```bash
# Validate
node scripts/validate_profiles.mjs 2024

# Regenerate if needed
python3 scripts/generate_batter_profiles.py 2024
python3 scripts/generate_pitcher_profiles_statcast.py 2024
```

### Statcast file growing too large?
```bash
# Check size
ls -lh data/mlb_historical/statcast/2025_pitches.json

# Expected: ~2-3 MB per day, ~620 MB per season
# If over 1 GB: Something's wrong, check for duplicates
```

### API rate limits hit?
```bash
# Check TheOddsAPI usage
curl "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=$THEODDS_API_KEY&regions=us&markets=h2h"

# Response headers show: x-requests-remaining, x-requests-used
```

---

## 📊 Success Metrics

Track these when running in production:

### Data Quality:
- Profile completeness: 70%+ for both batters and pitchers
- Daily update success rate: 95%+
- API uptime: 99%+

### Prediction Accuracy:
- HR rate correlation: r > 0.65 (strong correlation between predicted and actual)
- ROI on top 10 picks: 5%+ (after vig)
- CLV: Positive (beating closing line on average)

### Operational:
- Pipeline run time: <5 minutes
- Zero downtime during season
- Automated alerts on failures

---

## 🚀 When You're Ready to Resume

1. **Check system health** (5 min)
   ```bash
   crontab -l
   node scripts/validate_profiles.mjs 2024
   ```

2. **Start with pitcher profiles** (2 hours)
   - Create generator script
   - Run for all years
   - Validate quality

3. **Add H2H stats** (2 hours)
   - Create fetcher
   - Integrate into model
   - Update WHY

4. **Test end-to-end** (30 min)
   ```bash
   node scripts/run_mlb_pipeline.mjs
   # Review generated dashboard
   ```

5. **Deploy and monitor** (30 min)
   - Push to GitHub
   - Check Netlify build
   - Monitor first automated run

**Total time to ELITE: 4-6 hours** ⏱️

---

## 📚 Key Documentation

- **System Architecture:** `STATCAST_INTEGRATION_COMPLETE.md`
- **Automation Status:** `ELITE_AUTOMATION_STATUS.md`
- **Setup Guides:** `STATCAST_LFS_SETUP.md`
- **Model Details:** `scripts/lib/probability_model.mjs` (inline comments)

---

## 💡 Ideas for Future Enhancement

After reaching ELITE, consider:

1. **Machine Learning:** Train XGBoost model on historical data
2. **Prop Correlation:** Find +EV multi-leg parlays
3. **Umpire Effects:** Adjust strike zone by umpire
4. **Game Script:** Early leads = more aggressive swings
5. **Fatigue Factors:** Pitcher on short rest, back-to-back games
6. **Historical Trends:** Performance vs specific teams/parks

---

**STATUS: Ready to resume whenever you want to take MLB to ELITE! 🏆**

Current foundation is solid - just need to polish the pitcher profiles and add the final features. The hard infrastructure work (automation, Statcast integration, Git LFS) is already done.
