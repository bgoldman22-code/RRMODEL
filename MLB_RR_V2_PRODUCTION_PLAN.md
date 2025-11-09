# MLB HR Round Robin V2 - Production Deployment Checklist

## ✅ Current Status: DEMO READY

Your dashboard is **live as a demo** with hardcoded June 15, 2024 data. It looks amazing and shows all the features! 

But it's showing **static historical data**. Here's what you need to make it **truly live**:

---

## 🚀 Phase 1: Core Infrastructure (READY FOR SEASON)

### 1. Backend Script Created ✅
**File:** `/scripts/generate_mlb_rr_dashboard.mjs`

**What it does:**
- Fetches today's MLB games from MLB Stats API
- Fetches live HR odds from TheOddsAPI  
- Loads historical player stats
- Calculates HR scores and Expected Value
- Recommends optimal RR structure (×2, ×3, or ×4 legs)
- Generates HTML dashboard with real data

**To run:**
```bash
node scripts/generate_mlb_rr_dashboard.mjs
```

### 2. What's Missing for Full Production

#### A. **Real Model Probability Calculator** 🔴 CRITICAL
**Current:** Using rough estimate (HR Rate × 3.5)
**Needed:** Actual ML model or enhanced formula

**Options:**
1. **Simple Enhancement (Quick):** Improve formula with pitcher matchup, park factors
2. **ML Model (Better):** Train XGBoost/LightGBM on historical data
3. **Hybrid (Best):** Enhanced formula + ML refinement layer

**Implementation:**
```javascript
// Currently in generate_mlb_rr_dashboard.mjs line 232
modelProb: hrScore.hrRate * 3.5 // 🔴 PLACEHOLDER

// Needs to be:
modelProb: calculateAdvancedProbability(player, pitcher, park, weather)
```

#### B. **Pitcher Matchup Data** 🟡 IMPORTANT
**Current:** Mock/random data
**Needed:** Real H2H statistics, pitch type data

**Data Sources:**
- MLB Stats API: `/people/{playerId}/stats?stats=vsPlayer`
- Statcast: Pitch type percentages, zone heat maps
- Baseball Savant: Pitcher profiles

**Implementation needed:**
```javascript
async function fetchRealMatchupData(batterId, pitcherId) {
  // 1. Get H2H stats (X HR in Y AB)
  // 2. Get pitcher's pitch mix (62% fastballs, 28% sliders)
  // 3. Get batter's success vs pitch types
  // 4. Return structured data for "WHY" column
}
```

#### C. **Park Factors** 🟡 IMPORTANT
**Current:** Hardcoded examples
**Needed:** Real park factor database

**Sources:**
- Statcast Park Factors (updated yearly)
- ESPN Park Factors
- FanGraphs Park Factors

**Implementation:**
```javascript
const PARK_FACTORS = {
  'Yankee Stadium': { overall: 1.08, RHH: 1.14, LHH: 0.96 },
  'Coors Field': { overall: 1.32, RHH: 1.35, LHH: 1.28 },
  // ... all 30 parks
};
```

#### D. **Weather Data** 🟢 NICE-TO-HAVE
**Current:** Hardcoded
**Needed:** Real-time weather API

**Free APIs:**
- OpenWeatherMap (free tier: 1000 calls/day)
- WeatherAPI (free tier: 1M calls/month)

**Data needed:**
- Temperature (affects ball flight)
- Wind speed & direction (critical for HRs)
- Air density/humidity (ball carries better in hot, humid air)

#### E. **Injury Exclusions** 🟡 IMPORTANT
**Current:** Not implemented
**Needed:** Filter out injured/not starting players

**Implementation:**
```javascript
async function filterInjuredPlayers(players, todayGames) {
  // 1. Check starting lineups from MLB API
  // 2. Exclude players not in lineup
  // 3. Flag recently returned from IL (lower confidence)
}
```

---

## 📊 Phase 2: Data Pipeline (FOR APRIL 2026 SEASON START)

### Daily Automation Schedule

**Morning (8 AM ET):**
```bash
# 1. Fetch today's games
node scripts/fetch_today_games.mjs

# 2. Fetch starting lineups (when available ~1 hour before first game)
node scripts/fetch_starting_lineups.mjs

# 3. Fetch live odds (3-4 hours before first pitch)
node scripts/fetch_live_hr_odds.mjs

# 4. Generate dashboard
node scripts/generate_mlb_rr_dashboard.mjs

# 5. Deploy to public folder
# Output: public/mlb-rr-v2/index.html
```

**During Games (Every 5 min):**
```bash
# Update odds for CLV tracking
node scripts/update_live_odds.mjs

# Refresh dashboard with latest odds
node scripts/generate_mlb_rr_dashboard.mjs
```

**After Games (11 PM ET):**
```bash
# Collect results
node scripts/collect_mlb_results.mjs

# Update performance tracking
node scripts/update_rr_performance.mjs
```

### Cron Job Setup
```bash
# Add to crontab
0 8 * 4-9 * cd /path/to/RRMODEL && node scripts/generate_mlb_rr_dashboard.mjs
*/5 12-23 * 4-9 * cd /path/to/RRMODEL && node scripts/update_live_odds.mjs
0 23 * 4-9 * cd /path/to/RRMODEL && node scripts/collect_mlb_results.mjs
```

---

## 🎯 Phase 3: Must-Have Features

### 1. **Enhanced "WHY" Generator** 🔴 CRITICAL
```javascript
function generateWHY(player, pitcher, game) {
  const reasons = [];
  
  // H2H stats
  const h2h = await fetchH2HStats(player.id, pitcher.id);
  reasons.push(`${h2h.hr} HR in ${h2h.ab} AB vs ${pitcher.name}`);
  
  // Pitch matchup
  const pitchMix = await fetchPitcherProfile(pitcher.id);
  const batterStrength = player.bestPitchType;
  if (pitchMix.primary === batterStrength) {
    reasons.push(`Crushes ${pitchMix.primary} (${pitchMix.usage}% usage)`);
  }
  
  // Park factor
  const park = PARK_FACTORS[game.venue];
  const handedness = player.bats === 'R' ? 'RHH' : 'LHH';
  reasons.push(`${game.venue}: ${park[handedness] > 1 ? '+' : ''}${((park[handedness] - 1) * 100).toFixed(0)}% for ${handedness}`);
  
  // Recent form
  const last7 = player.stats.last7Games;
  if (last7.hr >= 2) {
    reasons.push(`Hot: ${last7.hr} HR in last 7 games`);
  }
  
  // Weather
  const weather = await fetchWeather(game.venue);
  if (weather.windSpeed > 8 && weather.windDirection === 'out') {
    reasons.push(`Wind ${weather.windSpeed} mph out to ${weather.windDirection}`);
  }
  
  return reasons;
}
```

### 2. **RR Recommendation Logic** ✅ DONE
Already implemented in `recommendRRStructure()` function!

### 3. **Top 10 Probability Table** ✅ DONE (needs real data)
HTML structure ready, just needs live player data.

### 4. **Top 20 EV Table** ✅ DONE (needs real data)
HTML structure ready, filtered by ≥19% probability.

---

## 🛠️ Phase 4: Additional Features (Nice-to-Have)

### A. **CLV Tracking**
Track opening vs closing odds to measure model's edge:
```javascript
const clv = {
  openingOdds: 3.40,
  closingOdds: 3.20,
  clvPct: ((3.40 - 3.20) / 3.20 * 100).toFixed(1) // +6.3% CLV
};
```

### B. **Historical Performance Dashboard**
Show how the model has performed:
- ROI by structure (already in demo)
- Win rate trends
- Best/worst days
- Player-specific success rates

### C. **Bet Slip Generator**
Export picks to CSV/PDF for easy entry into sportsbook.

### D. **Kelly Criterion Calculator**
Show optimal stake sizing based on edge and bankroll.

---

## 📝 Summary: What You Need Before Season

### 🔴 **MUST HAVE** (Blocking for production):
1. ✅ Backend script (done)
2. 🔴 Real model probability calculator (currently placeholder)
3. 🔴 Pitcher matchup data fetcher
4. 🔴 Filter for injured/not starting players

### 🟡 **SHOULD HAVE** (Highly recommended):
5. 🟡 Park factors database
6. 🟡 Enhanced "WHY" generator with real H2H data
7. 🟡 Daily automation (cron jobs)

### 🟢 **NICE TO HAVE** (Can add later):
8. 🟢 Real-time weather integration
9. 🟢 CLV tracking system
10. 🟢 Bet slip export

---

## 🎬 Quick Start for Demo → Live

**Minimal viable version (2-3 hours work):**

1. **Add real pitcher matchup lookup:**
```bash
# Create new file: scripts/fetch_pitcher_matchups.mjs
# Use MLB Stats API to get H2H data
```

2. **Improve probability calculator:**
```javascript
// In generate_mlb_rr_dashboard.mjs
// Replace line 232 with better formula using:
// - HR score (already calculated)
// - Pitcher difficulty (fetch from API)
// - Park factor (simple lookup table)
```

3. **Test with live API:**
```bash
# Set your Odds API key
export ODDS_API_KEY=your_key_here

# Run generator
node scripts/generate_mlb_rr_dashboard.mjs

# Check output
open public/mlb-rr-v2/index.html
```

4. **Deploy:**
```bash
npm run build
git add -A
git commit -m "Add live MLB RR V2 dashboard"
git push
```

---

## 🏁 Final Recommendation

**For Now (Off-Season):**
- ✅ Keep the demo live as-is (looks amazing!)
- ✅ Shows potential to clients/users
- ✅ All UI/UX is production-ready

**Before April 2026 Season:**
- 🔴 Implement real probability model (critical)
- 🔴 Add pitcher matchup data fetcher
- 🟡 Set up daily automation
- 🟡 Add park factors
- 🟢 Test with spring training games (March 2026)

**Timeline:**
- **January 2026:** Build core data fetchers
- **February 2026:** Enhance probability model
- **March 2026:** Test with spring training
- **April 2026:** Go live for regular season! 🚀

---

## 📞 Next Steps

**Choice 1: Keep Demo for Now**
✅ Dashboard is live and impressive
✅ Shows full functionality
✅ Ready to go when season starts
❌ Shows old data (June 2024)

**Choice 2: Build Live Version Now**
✅ Real data even in off-season
✅ Can track and refine during winter
✅ Test with other sports (NHL/NBA)
❌ Requires 10-20 hours of dev work

**What do you prefer?** 🤔
