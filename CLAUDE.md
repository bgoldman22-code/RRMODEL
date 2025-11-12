# 🏀 NBA PLAYER PROPS - MASTER CONTEXT
## Daily Updated Session Info

**📅 TODAY'S DATE:** Wednesday, November 12, 2025  
**🏀 CURRENT SEASON:** 2025-26 NBA Season  
**📊 DATA AVAILABLE:** ~1 month of games (October 22 - November 12, 2025)  
**🎯 STATUS:** Production system with resilient architecture

---

## 🗓️ SEASON CONTEXT

### **2025-26 NBA Season Timeline:**
- **Season Start:** October 22, 2025
- **Today:** November 12, 2025 (Wed)
- **Games Played:** ~3 weeks (approximately 20-25 games per team)
- **Data Coverage:** Last 30 days of boxscores available
- **All-Star Break:** February 14-16, 2026
- **Regular Season End:** April 13, 2026
- **Playoffs Start:** April 18, 2026

### **Data Freshness:**
- ✅ Player boxscores: Fresh (ESPN API updates daily)
- ✅ Odds/lines: Real-time (The Odds API)
- ✅ Rosters: Current (as of today)
  - Kevin Durant: **HOU** (Houston Rockets)
  - Anfernee Simons: **BOS** (Boston Celtics)
- ✅ Opponent defense: Auto-updates every 24h

---

## 🎯 SYSTEM ARCHITECTURE (November 12, 2025)

### **Current Implementation:**
- **Version:** V2 Resilient Architecture
- **Status:** ✅ Production Ready
- **Last Updated:** November 12, 2025

### **Core Components:**
1. **Multi-Tier Data Loading**
   - Tier 1: Netlify Blobs (TTL-aware, <2s)
   - Tier 2.5: NBA CDN (placeholder)
   - Tier 3: ESPN API (p=6 concurrency, 20-30s)
   - Tier 4: Git backup (placeholder)

2. **Real-Time Opponent Defense**
   - Fetches from NBA Stats API every 24h
   - 4-tier fallbacks (API → Blobs → Calculate → League Avg)
   - In-memory cache for instant access
   - Auto-updates, zero maintenance

3. **Strict Budget Enforcement**
   - Global: 50s (10s buffer)
   - Acquire: 30s HARD STOP
   - Transform: 10s
   - Merge: 10s

4. **Universal Team Mapping**
   - Handles all data sources (ESPN, Odds API, NBA Stats, CDN)
   - Special cases: LA teams, NY teams, 76ers, Trail Blazers spacing

5. **Operational Guardrails**
   - Health check endpoint
   - Manual warmup endpoint
   - Feature flags for incident recovery
   - Budget tracking and reporting

---

## 📊 CURRENT PERFORMANCE METRICS

### **Baseline Model (Before Opponent Defense):**
- **Rebounds:** 62.5% win rate, 19.3% ROI
- **Assists:** 66.7% win rate, 27.3% ROI
- **Overall:** Profitable on both prop types

### **Expected with Opponent Defense (Target):**
- **Rebounds:** 66-68% win rate (+3.5-5.5 points)
- **Assists:** 70-73% win rate (+3.3-6.3 points)
- **Overall ROI:** +5-8% improvement

### **Execution Performance:**
- **Normal (Blobs hit):** ~11s total
- **Cold cache (ESPN):** ~35s total
- **Worst case:** <50s (HARD STOP at 30s acquire)

---

## 🚨 KNOWN ISSUES & FIXES

### **✅ FIXED (November 12, 2025):**
1. **60s Timeout Issue**
   - **Problem:** Commits today removed Blobs fallback, forced slow ESPN path
   - **Solution:** Restored multi-tier loading with strict budgets
   - **Status:** ✅ FIXED with resilient-loader.mjs

2. **Stale Roster Data**
   - **Problem:** 214-day old Blobs had wrong rosters (Durant=BKN, Simons=POR)
   - **Solution:** Always fetch last 15 days minimum, TTL enforcement
   - **Status:** ✅ FIXED with TTL-aware caching

3. **Manual Opponent Defense Updates**
   - **Problem:** Required GitHub Action + manual Python script
   - **Solution:** Real-time loader fetches from NBA Stats API automatically
   - **Status:** ✅ FIXED with opponent-defense-loader.mjs

### **⏳ IN PROGRESS:**
1. **NBA CDN Integration (Tier 2.5)**
   - Currently placeholder
   - Will add fast alternative to ESPN (15-25s)
   - Expected completion: Next sprint

2. **Git Backup Tier (Tier 4)**
   - Currently placeholder
   - Will add emergency fallback from committed files
   - Expected completion: Next sprint

---

## 📁 FILE STRUCTURE

```
RRMODEL/
├── netlify/functions/
│   ├── lib/
│   │   ├── constants.mjs ✅ (all config, budgets, TTLs, flags)
│   │   ├── team-mapper.mjs ✅ (universal team normalization)
│   │   ├── budget-tracker.mjs ✅ (time enforcement)
│   │   ├── resilient-loader.mjs ✅ (multi-tier data loading)
│   │   └── opponent-defense-loader.mjs ✅ (real-time defense stats)
│   ├── check-nba-health.mjs ✅ (health endpoint)
│   ├── warmup-nba-cache.mjs ✅ (manual cache prime)
│   ├── generate-daily-predictions.mjs ✅ (PRODUCTION VERSION)
│   └── generate-daily-predictions-backup.mjs (old version)
├── scripts/nba/
│   ├── fetch-opponent-defense-now.mjs ✅ (immediate fetch)
│   └── update-opponent-defense.py (optional, for GH Action)
├── data/nba/
│   ├── teams/team-info.json ✅ (30 teams, single source of truth)
│   └── opponent-defense/2025-26.json ✅ (current season stats)
└── .github/workflows/
    └── nba-opponent-defense-daily.yml (optional)
```

---

## 🔧 ENVIRONMENT VARIABLES

### **Required:**
- `ODDS_API_KEY`: TheOddsAPI key for props/lines

### **Optional (Incident Recovery):**
- `NBA_WARMUP_SECRET`: Secret for manual cache prime endpoint
- `NBA_PROPS_FORCE_ESPN`: Set to `1` to bypass Blobs
- `NBA_PROPS_ENABLE_CDN`: Set to `0` to disable NBA CDN tier
- `NBA_PROPS_CONCURRENCY`: Override default `6` concurrent requests

---

## 📅 DAILY SCHEDULE

### **Automated Jobs:**
- **7:00 AM ET (11:00 AM UTC):** Daily prediction generation (Netlify scheduled function)
  - Fetches last 15 days boxscores
  - Updates opponent defense (if >24h old)
  - Generates predictions for games in next 18 hours
  - Saves to Netlify Blobs + tracking DB

### **Data Refresh:**
- **Boxscores:** Real-time from ESPN API (on every prediction run)
- **Opponent Defense:** Every 24h from NBA Stats API (auto-refresh)
- **Rosters:** Always fresh (last 15 days ensures current teams)
- **Props/Lines:** Real-time from The Odds API

---

## 🎯 NEXT PRIORITIES

### **Immediate (This Week):**
1. ✅ Deploy V2 resilient architecture
2. ✅ Validate opponent defense integration
3. ⏳ Monitor win rate improvement
4. ⏳ A/B test with/without opponent adjustments

### **Short-term (Next Sprint):**
1. ⏳ Implement NBA CDN tier (Tier 2.5)
2. ⏳ Add Git backup tier (Tier 4)
3. ⏳ Set up health check monitoring (Uptime Robot)
4. ⏳ Create performance dashboard

### **Long-term (This Season):**
1. ⏳ Advanced opponent adjustments (home/away splits, rest days)
2. ⏳ Player-specific defensive matchups
3. ⏳ Injury impact modeling
4. ⏳ Live game adjustments

---

## 📊 KEY CONTACTS & REFERENCES

### **APIs:**
- **ESPN API:** `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/`
- **The Odds API:** `https://api.the-odds-api.com/v4/`
- **NBA Stats API:** `https://stats.nba.com/stats/`
- **NBA CDN:** `https://cdn.nba.com/static/json/liveData/`

### **Documentation:**
- **Implementation:** `IMPLEMENTATION_COMPLETE_STATUS.md`
- **Opponent Defense:** `REAL_TIME_OPPONENT_DEFENSE_INTEGRATION.md`
- **Deployment:** `DEPLOYMENT_READY_FINAL.md`
- **Data Integration:** `DATA_SOURCE_INTEGRATION_COMPREHENSIVE.md`

---

## 🚨 EMERGENCY PROCEDURES

### **If Predictions Timeout:**
1. Check Netlify function logs for budget usage
2. Set `NBA_PROPS_FORCE_ESPN=1` to bypass stale Blobs
3. Use warmup endpoint to prime cache: `POST /warmup-nba-cache` with secret
4. Check ESPN API rate limits (should see in logs)

### **If Opponent Defense Fails:**
1. System automatically falls back: API → Blobs → Calculate → League Avg
2. Predictions still work without opponent adjustments
3. Check logs for "Opponent defense ready" message
4. NBA Stats API has rate limits (429 errors)

### **If Rosters Wrong:**
1. Check data source age (should be <24h)
2. Force fresh fetch with `NBA_PROPS_FORCE_ESPN=1`
3. Verify ESPN API returning correct data
4. Check team mapper for missing aliases

---

## 📝 CHANGELOG

### **November 12, 2025:**
- ✅ Created resilient multi-tier architecture
- ✅ Implemented real-time opponent defense loader
- ✅ Added strict budget enforcement (50s global, 30s HARD STOP)
- ✅ Built universal team mapper for all data sources
- ✅ Added operational guardrails (health check, warmup, feature flags)
- ✅ Integrated opponent defense adjustments into predictions
- ✅ All files validated and ready for production
- 📊 Expected win rate improvement: +5-8%

### **November 11, 2025:**
- ❌ Commits broke system (removed Blobs fallback)
- ❌ 60s timeouts, stale rosters
- 🔍 Root cause identified: always-fetch-ESPN without fallback

---

**🎯 STATUS:** ✅ **PRODUCTION READY - DEPLOY NOW!**

**📅 REMEMBER TO UPDATE THIS DATE DAILY!**
